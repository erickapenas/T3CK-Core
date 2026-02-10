import 'reflect-metadata';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { ProvisioningFormService } from './provisioning-form';
import { Logger, validateRequest, ProvisioningSubmitSchema, ProvisioningStatusParamSchema, createTenantAwareRateLimiter, getApiLimiter, closeRateLimiter, initializeTracing, createQueue, createWorker, enqueueJob, getQueueStats, closeQueues, initializeDatabase, runMigrations, closeDatabase, getDatabase, Tenant, ValidationError } from '@t3ck/shared';
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

// Enable CORS for all origins (development mode)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const redisEnabled = process.env.REDIS_DISABLED !== 'true';

// Initialize Redis cache
if (redisEnabled) {
  initializeCache({ prefix: 'tenant:' });
} else {
  console.warn('[tenant-service] Redis disabled: cache/queue/rate-limiter will be skipped');
}

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
const inMemoryTenants = new Map<string, any>();
let dbAvailable = true;

// Initialize Bull Queue for provisioning
let queueAvailable = false;
if (redisEnabled) {
  try {
    createQueue('provisioning');
    createWorker(
      'provisioning',
      async (job) => {
    logger.info('Processing provisioning job', { jobId: job.id, tenantId: job.data.tenantId });
    try {
      if (!dbAvailable) {
        const tenant = inMemoryTenants.get(job.data.tenantId);
        if (tenant) {
          tenant.status = 'PROVISIONING';
          tenant.provisioningJobId = job.id;
          tenant.updatedAt = new Date();
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (tenant) {
          tenant.status = 'ACTIVE';
          tenant.provisionedAt = new Date();
          tenant.updatedAt = new Date();
        }

        logger.info('Provisioning job completed (in-memory)', { jobId: job.id, tenantId: job.data.tenantId });
        return { success: true, tenantId: job.data.tenantId };
      }
      // Update tenant status to PROVISIONING in database
      const db = getDatabase();
      const tenantRepository = db.getRepository(Tenant);
      await tenantRepository.update(
        { id: job.data.tenantId },
        { status: 'PROVISIONING', provisioningJobId: job.id }
      );
      
      // Simulate provisioning work
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Update tenant status to ACTIVE upon completion
      await tenantRepository.update(
        { id: job.data.tenantId },
        { status: 'ACTIVE', provisionedAt: new Date() }
      );
      
      logger.info('Provisioning job completed', { jobId: job.id, tenantId: job.data.tenantId });
      return { success: true, tenantId: job.data.tenantId };
    } catch (error) {
      logger.error('Provisioning job failed', { jobId: job.id, tenantId: job.data.tenantId, error });
      if (!dbAvailable) {
        const tenant = inMemoryTenants.get(job.data.tenantId);
        if (tenant) {
          tenant.status = 'SUSPENDED';
          tenant.updatedAt = new Date();
        }
        throw error;
      }
      // Update tenant status to SUSPENDED on error
      const db = getDatabase();
      const tenantRepository = db.getRepository(Tenant);
      await tenantRepository.update(
        { id: job.data.tenantId },
        { status: 'SUSPENDED' }
      );
      throw error;
    }
  },
  2 // Process 2 jobs concurrently
    );
    queueAvailable = true;
  } catch (error) {
    queueAvailable = false;
    logger.warn('Provisioning queue disabled (Redis not available)', { error });
  }
}

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
    dbAvailable = false;
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
const passThroughLimiter = (_req: Request, _res: Response, next: () => void) => next();
app.use(redisEnabled ? getApiLimiter() : passThroughLimiter); // Apply API-wide rate limiter
const provisioningLimiter = redisEnabled ? createTenantAwareRateLimiter(10) : passThroughLimiter; // Max 10 provisioning requests per hour per tenant

// Submeter formulário de provisionamento
app.post('/provisioning/submit', provisioningLimiter, validateRequest(ProvisioningSubmitSchema), async (req: Request, res: Response) => {
  try {
    const form = {
      ...req.body,
      contactEmail: req.body.contactEmail || req.body.adminEmail,
    };

    // Validar formulário
    provisioningService.validateForm(form);

    // Criar tenant com status PENDING
    const tenantData = provisioningService.createTenant(form);
    
    // Salvar tenant no banco de dados (ou fallback em memória)
    let savedTenant: any;
    let tenantRepository: any = null;
    if (dbAvailable) {
      const db = getDatabase();
      tenantRepository = db.getRepository(Tenant);
      const tenant = tenantRepository.create({
        id: tenantData.id,
        domain: form.domain,
        companyName: form.companyName,
        contactEmail: form.contactEmail,
        numberOfSeats: form.numberOfSeats || 50,
        status: 'PENDING',
        billingAddress: form.billingAddress,
        billingCountry: form.billingCountry,
        billingZipCode: form.billingZipCode,
        monthlyBudget: form.monthlyBudget || 0,
        billingStatus: 'ACTIVE',
      });
      savedTenant = await tenantRepository.save(tenant);
    } else {
      savedTenant = {
        id: tenantData.id,
        domain: form.domain,
        companyName: form.companyName,
        contactEmail: form.contactEmail,
        numberOfSeats: form.numberOfSeats || 50,
        status: 'PENDING',
        billingAddress: form.billingAddress,
        billingCountry: form.billingCountry,
        billingZipCode: form.billingZipCode,
        monthlyBudget: form.monthlyBudget || 0,
        billingStatus: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryTenants.set(savedTenant.id, savedTenant);
      logger.info('Tenant saved in memory', { 
        tenantId: savedTenant.id, 
        totalTenants: inMemoryTenants.size,
        allIds: Array.from(inMemoryTenants.keys())
      });
    }

    let jobId = `local-${Date.now()}`;

    if (queueAvailable) {
      // Enqueue provisioning job instead of synchronous execution
      jobId = await enqueueJob('provisioning', 'provision-tenant', {
        tenantId: savedTenant.id,
        domain: form.domain,
        companyName: form.companyName,
        contactEmail: form.contactEmail,
      });

      logger.info('Provisioning job enqueued', {
        tenantId: savedTenant.id,
        jobId,
        domain: form.domain,
      });
    } else {
      // Fallback: provision synchronously when Redis is not available
      if (dbAvailable && tenantRepository) {
        await tenantRepository.update(
          { id: savedTenant.id },
          { status: 'ACTIVE', provisioningJobId: jobId, provisionedAt: new Date() }
        );
      } else {
        savedTenant.status = 'ACTIVE';
        savedTenant.provisioningJobId = jobId;
        savedTenant.provisionedAt = new Date();
        savedTenant.updatedAt = new Date();
        inMemoryTenants.set(savedTenant.id, savedTenant);
      }
      logger.warn('Provisioning completed synchronously (queue disabled)', {
        tenantId: savedTenant.id,
        jobId,
        domain: form.domain,
      });
    }

    return res.status(201).json({
      success: true,
      data: savedTenant,
      jobId,
      message: 'Form submitted successfully. Provisioning will begin shortly.',
    });
  } catch (error) {
    logger.error('Failed to submit provisioning form', { error });
    
    // Capturar erros de validação
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        details: error.details || null,
      });
    }

    // Outros erros da aplicação
    if (error instanceof Error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Erro desconhecido
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

    // Buscar tenant do banco de dados (ou memória)
    let tenant: any = null;
    if (dbAvailable) {
      const db = getDatabase();
      const tenantRepository = db.getRepository(Tenant);
      tenant = await tenantRepository.findOne({
        where: { id: tenantId },
      });
    } else {
      tenant = inMemoryTenants.get(tenantId) || null;
    }
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found',
      });
    }
    
    // Mapear status para mensagem legível
    const statusMessages: Record<string, string> = {
      'PENDING': 'Waiting to start provisioning',
      'PROVISIONING': 'Provisioning infrastructure and services',
      'ACTIVE': 'Provisioning completed successfully',
      'SUSPENDED': 'Provisioning failed or suspended',
      'DELETED': 'Tenant has been deleted',
    };
    
    return res.json({
      success: true,
      data: {
        tenantId: tenant.id,
        domain: tenant.domain,
        companyName: tenant.companyName,
        status: tenant.status,
        message: statusMessages[tenant.status] || 'Unknown status',
        provisioningJobId: tenant.provisioningJobId || null,
        provisionedAt: tenant.provisionedAt || null,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Failed to get provisioning status', { error });
    const tenantId = req.params.tenantId || 'unknown';
    captureException(error, { operation: 'get-provisioning-status', tenantId });
    return res.status(500).json({ success: false, error: 'Failed to get provisioning status' });
  }
});

// Queue statistics endpoint
app.get('/queue/stats', async (_req, res) => {
  try {
    if (!queueAvailable) {
      return res.json({
        queueName: 'provisioning',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
      });
    }
    const stats = await getQueueStats('provisioning');
    return res.json(stats);
  } catch (error) {
    logger.error('Failed to get queue stats', { error });
    return res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// List all tenants endpoint
app.get('/provisioning/tenants', async (_req, res) => {
  try {
    let tenants: any[] = [];
    
    if (dbAvailable) {
      const db = getDatabase();
      const tenantRepository = db.getRepository(Tenant);
      tenants = await tenantRepository.find({
        order: { createdAt: 'DESC' },
        take: 100, // Limit to 100 most recent
      });
    } else {
      // Get from in-memory storage
      tenants = Array.from(inMemoryTenants.values());
      tenants.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    
    return res.json({
      success: true,
      data: tenants,
      count: tenants.length,
    });
  } catch (error) {
    logger.error('Failed to list tenants', { error });
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to list tenants',
      data: [],
      count: 0,
    });
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
