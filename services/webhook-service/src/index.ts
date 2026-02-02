import express from 'express';
import routes from './api/routes';
import { Logger } from '@t3ck/shared';
import { setupHealthChecks } from './health';
import { initSentry, setupSentryErrorHandler } from './sentry';
import { setupMetricsMiddleware, setupMetricsEndpoint } from './metrics';
import { initializeCache } from './cache';
import { initializeConfig } from './config';
import { initializeServiceRegistry } from './service-registry';

// Initialize Sentry (must be first)
initSentry('webhook-service');

const app = express();
app.use(express.json());

// Initialize Redis cache
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

const logger = new Logger('webhook-service');

// Health checks setup
setupHealthChecks(app);

// Metrics endpoint
setupMetricsEndpoint(app, '/metrics');

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
    await require('./sentry').flushSentry(2000);
    process.exit(0);
  });
});
