import express from 'express';
import routes from './api/routes';
import { Logger } from '@t3ck/shared';
import { setupHealthChecks } from './health';
import { initSentry, setupSentryErrorHandler } from './sentry';
import { setupMetricsMiddleware, setupMetricsEndpoint } from './metrics';
import { initializeCache } from './cache';

// Initialize Sentry (must be first)
initSentry('webhook-service');

const app = express();
app.use(express.json());

// Initialize Redis cache
initializeCache({ prefix: 'webhook:' });

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

const PORT = process.env.PORT || 3002;

const server = app.listen(PORT, () => {
  logger.info(`Webhook service running on port ${PORT}`);
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
