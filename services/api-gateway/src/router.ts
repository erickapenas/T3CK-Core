import { Router } from 'express';
import { config } from './config';
import { authenticate } from './middleware/auth';
import { createRateLimiter } from './middleware/rate-limit';
import { createServiceProxy } from './proxy';
import { Logger } from '@t3ck/shared';

const logger = new Logger('Router');

/**
 * Create router with versioning support
 */
export const createVersionedRouter = () => {
  const router = Router();

  // Health check endpoint (no auth required)
  router.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: 'v1',
      uptime: process.uptime(),
    });
  });

  // Metrics endpoint (no auth required in dev, require auth in prod)
  router.get('/metrics', (_req, res) => {
    // TODO: Return Prometheus metrics
    res.json({
      message: 'Metrics endpoint',
      // Will be implemented in metrics.ts
    });
  });

  // Route each service
  config.services.forEach(service => {
    logger.info(`Configuring route: ${service.prefix} -> ${service.target}`);

    const serviceRouter = Router();

    // Apply service-specific rate limiting
    if (service.rateLimit) {
      serviceRouter.use(createRateLimiter(service.rateLimit));
    }

    // Apply authentication if required
    if (service.requiresAuth) {
      serviceRouter.use(authenticate);
    }

    // Create proxy
    serviceRouter.use(createServiceProxy(service));

    // Mount service router
    router.use(service.prefix, serviceRouter);
  });

  // API version information
  router.get('/api/version', (_req, res) => {
    res.json({
      version: 'v1',
      services: config.services.map(s => ({
        prefix: s.prefix,
        version: s.version,
        requiresAuth: s.requiresAuth,
      })),
    });
  });

  // 404 handler
  router.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.url} not found`,
      availableRoutes: config.services.map(s => s.prefix),
    });
  });

  return router;
};

/**
 * Create backward compatible routes
 * Maps old API versions to new ones
 */
export const createBackwardCompatibleRoutes = () => {
  const router = Router();

  // Example: /api/auth -> /api/v1/auth
  // Add backward compatibility mappings as needed

  return router;
};
