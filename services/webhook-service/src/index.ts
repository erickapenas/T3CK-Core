import express from 'express';
import routes from './api/routes';
import {
  Logger,
  getApiLimiter,
  getWebhookLimiter,
  closeRateLimiter,
  initializeTracing,
} from '@t3ck/shared';
import { setupHealthChecks } from './health';
import { initSentry, setupSentryErrorHandler } from './sentry';
import { setupMetricsMiddleware, setupMetricsEndpoint } from './metrics';
import { initializeCache } from './cache';
import { initializeConfig } from './config';
import { initializeServiceRegistry } from './service-registry';
import { initializeBackup } from './backup';
import { setupSwagger } from './swagger';

// Initialize OpenTelemetry tracing (must be first)
initializeTracing('webhook-service');

// Initialize Sentry
initSentry('webhook-service');

const app = express();
app.use(express.json());

if (process.env.REDIS_DISABLED === 'true') {
  throw new Error('Redis is required for webhook-service persistence');
}

if (!process.env.RATE_LIMIT_STORE) {
  process.env.RATE_LIMIT_STORE = 'redis';
}

initializeCache({ prefix: 'webhook:' });

// Initialize Config Manager
initializeConfig({ parameterPrefix: '/t3ck-core' });

// Initialize Service Registry (Cloud Map)
const SERVICE_PORT = parseInt(String(process.env.PORT || 3002));
initializeServiceRegistry('t3ck-webhook', SERVICE_PORT, {
  service_type: 'webhooks',
});

// Setup Prometheus metrics middleware
setupMetricsMiddleware(app);

// Initialize Backup manager (stubbed providers)
initializeBackup({
  s3Bucket: process.env.BACKUP_S3_BUCKET,
  gcsBucket: process.env.BACKUP_GCS_BUCKET,
});

const logger = new Logger('webhook-service');

// Health checks setup
setupHealthChecks(app);

// Internal registry endpoint for debugging
import { getServiceRegistry } from './service-registry';
app.get('/internal/registry', (_req, res) => {
  const registry = getServiceRegistry();
  const entries = Array.from(registry.getAllInstances().entries()).map(([k, v]) => ({
    service: k,
    instance: v,
  }));
  res.json({ registered: entries });
});

// Metrics endpoint
setupMetricsEndpoint(app, '/metrics');

// Swagger / OpenAPI
setupSwagger(app, { title: 'Webhook Service API', version: process.env.SERVICE_VERSION });

app.get('/', (_req, res) => {
  res.json({
    service: 'webhook-service',
    status: 'running',
    endpoints: {
      health: '/health',
      docs: '/api-docs',
      api: '/api/webhooks',
    },
  });
});

// Rate limiting middleware
app.use(getApiLimiter()); // Apply API-wide rate limiter
app.use('/api/webhooks', getWebhookLimiter()); // Stricter limit for webhook operations

app.use('/api', routes);

// Setup Sentry error handlers (after routes)
setupSentryErrorHandler(app);

const server = app.listen(SERVICE_PORT, () => {
  logger.info(`Webhook service running on port ${SERVICE_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    logger.info('Server closed');
    await closeRateLimiter();
    await require('./sentry').flushSentry(2000);
    process.exit(0);
  });
});
