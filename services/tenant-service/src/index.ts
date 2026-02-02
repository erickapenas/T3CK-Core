import 'reflect-metadata';
import express, { Request, Response } from 'express';
import { ProvisioningFormService, ProvisioningStatus } from './provisioning-form';
import { Logger, validateRequest, ProvisioningSubmitSchema, ProvisioningStatusParamSchema, createTenantAwareRateLimiter, getApiLimiter, closeRateLimiter, initializeTracing, createQueue, createWorker, enqueueJob, getQueueStats, closeQueues, initializeDatabase, runMigrations, closeDatabase } from '@t3ck/shared';
import { setupHealthChecks } from './health';
import { initSentry, setupSentryErrorHandler, captureException } from './sentry';
import { setupMetricsMiddleware, setupMetricsEndpoint } from './metrics';
import { initializeCache } from './cache';
import { initializeConfig } from './config';
import { initializeServiceRegistry } from './service-registry';
import { initializeBackup } from './backup';
import { setupSwagger } from './swagger';

// Initialize OpenTelemetry tracing (must be first)
initializeTracing('tenant-service');

// Initialize Sentry
initSentry('tenant-service');

const app = express();
app.use(express.json());

// Initialize Redis cache
initializeCache({ prefix: 'tenant:' });

// Initialize Config Manager
initializeConfig({ parameterPrefix: '/t3ck-core' });

// Initialize Service Registry (Cloud Map)
const SERVICE_PORT = parseInt(String(process.env.PORT || 3003));
initializeServiceRegistry('t3ck-tenant', SERVICE_PORT, {
  service_type: 'provisioning',
});

// Setup Prometheus metrics middleware
setupMetricsMiddleware(app);

// Setup Prometheus metrics middleware
setupMetricsMiddleware(app);

const provisioningService = new ProvisioningFormService();
const logger = new Logger('tenant-service');

// Initialize Bull Queue for provisioning
createQueue('provisioning');
createWorker(
  'provisioning',
  async (job) => {
    logger.info('Processing provisioning job', { jobId: job.id, tenantId: job.data.tenantId });
    // Simulate provisioning work
    await new Promise((resolve) => setTimeout(resolve, 2000));
    logger.info('Provisioning job completed', { jobId: job.id, tenantId: job.data.tenantId });
    return { success: true, tenantId: job.data.tenantId };
  },
  2 // Process 2 jobs concurrently
);

// Initialize database and run migrations
(async () => {
  try {
    const dbConfig = {
      type: (process.env.DATABASE_TYPE || 'mysql') as any,
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '3306'),
      username: process.env.DATABASE_USER || 'root',
      password: process.env.DATABASE_PASSWORD || 'password',
      database: process.env.DATABASE_NAME || 't3ck_tenants',
      synchronize: false, // Use migrations instead
      logging: process.env.DATABASE_LOGGING === 'true',
      migrationsRun: true,
    };

    await initializeDatabase(dbConfig);
    await runMigrations();
    logger.info('Database initialized and migrations ran');
  } catch (error) {
    logger.warn('Database initialization failed (will continue without DB)', { error });
    // Continue even if database initialization fails
  }
})();

// Health checks setup
setupHealthChecks(app);

// Internal registry endpoint for debugging
import { getServiceRegistry } from './service-registry';
app.get('/internal/registry', (_req, res) => {
  const registry = getServiceRegistry();
  const entries = Array.from(registry.getAllInstances().entries()).map(([k, v]) => ({ service: k, instance: v }));
  res.json({ registered: entries });
});

// Metrics endpoint
setupMetricsEndpoint(app, '/metrics');

// Swagger / OpenAPI
setupSwagger(app, { title: 'Tenant Service API', version: process.env.SERVICE_VERSION });

// Rate limiting middleware
app.use(getApiLimiter()); // Apply API-wide rate limiter
const provisioningLimiter = createTenantAwareRateLimiter(10); // Max 10 provisioning requests per hour per tenant

// Submeter formulário de provisionamento
app.post('/provisioning/submit', provisioningLimiter, validateRequest(ProvisioningSubmitSchema), async (req: Request, res: Response) => {
  try {
    const form = req.body;

    // Validar formulário
    provisioningService.validateForm(form);

    // Criar tenant com status PENDING
    const tenant = provisioningService.createTenant(form);

    // Enqueue provisioning job instead of synchronous execution
    const jobId = await enqueueJob('provisioning', 'provision-tenant', {
      tenantId: tenant.id,
      domain: form.domain,
      companyName: form.companyName,
      contactEmail: form.contactEmail,
    });

    logger.info('Provisioning job enqueued', {
      tenantId: tenant.id,
      jobId,
      domain: form.domain,
    });

    return res.status(201).json({
      success: true,
      data: tenant,
      jobId,
      message: 'Form submitted successfully. Provisioning will begin shortly.',
    });
  } catch (error) {
    logger.error('Failed to submit provisioning form', { error });
    
    if (error instanceof Error && error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to submit provisioning form',
    });
  }
});

// Obter status do provisionamento
app.get('/provisioning/:tenantId/status', validateRequest(ProvisioningStatusParamSchema), async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    // Aqui normalmente buscaria do banco de dados
    // Por enquanto retorna mock
    res.json({
      tenantId,
      status: ProvisioningStatus.PENDING,
      message: 'Provisioning in queue',
    });
  } catch (error) {
    logger.error('Failed to get provisioning status', { error });
    const tenantId = req.params.tenantId || 'unknown';
    captureException(error, { operation: 'get-provisioning-status', tenantId });
    res.status(500).json({ error: 'Failed to get provisioning status' });
  }
});

// Queue statistics endpoint
app.get('/queue/stats', async (_req, res) => {
  try {
    const stats = await getQueueStats('provisioning');
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get queue stats', { error });
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// Setup Sentry error handlers (after routes)
setupSentryErrorHandler(app);

// Initialize Backup manager (stubbed providers)
initializeBackup({
  s3Bucket: process.env.BACKUP_S3_BUCKET,
  gcsBucket: process.env.BACKUP_GCS_BUCKET,
});

const server = app.listen(SERVICE_PORT, () => {
  logger.info(`Tenant service running on port ${SERVICE_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    logger.info('Server closed');
    await closeRateLimiter();
    await closeQueues();
    await closeDatabase();
    await require('./sentry').flushSentry(2000);
    process.exit(0);
  });
});
