import express, { Request, Response } from 'express';
import { ProvisioningFormService, ProvisioningStatus } from './provisioning-form';
import { Logger } from '@t3ck/shared';
import { setupHealthChecks } from './health';
import { initSentry, setupSentryErrorHandler, captureException } from './sentry';
import { setupMetricsMiddleware, setupMetricsEndpoint } from './metrics';
import { initializeCache } from './cache';
import { initializeConfig } from './config';
import { initializeServiceRegistry } from './service-registry';
import { initializeBackup } from './backup';

// Initialize Sentry (must be first)
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

// Submeter formulário de provisionamento
app.post('/provisioning/submit', async (req: Request, res: Response) => {
  try {
    const form = req.body;

    // Validar formulário
    provisioningService.validateForm(form);

    // Criar tenant com status PENDING
    const tenant = provisioningService.createTenant(form);

    // Aqui normalmente salvaria no banco de dados
    // Por enquanto apenas log
    logger.info('Provisioning form submitted', {
      tenantId: tenant.id,
      domain: form.domain,
    });

    return res.status(201).json({
      success: true,
      data: tenant,
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
app.get('/provisioning/:tenantId/status', async (req: Request, res: Response) => {
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
    await require('./sentry').flushSentry(2000);
    process.exit(0);
  });
});
