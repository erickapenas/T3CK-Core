import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { createTerminus } from '@godaddy/terminus';
import http from 'http';
import { config } from './config';
import { Logger } from '@t3ck/shared';
import {
  helmetMiddleware,
  corsMiddleware,
  csrfProtection,
  csrfTokenGenerator,
  hppMiddleware,
  compressionMiddleware,
  securityHeaders,
} from './middleware/security';
import { globalRateLimit, authRateLimit } from './middleware/rate-limit';
import {
  requestIdMiddleware,
  requestLogger,
  morganLogger,
  errorLogger,
  performanceMonitor,
} from './middleware/logging';
import { sanitizeInput, validateJsonBody, detectSqlInjection } from './middleware/validation';
import { createVersionedRouter } from './router';
import { metricsMiddleware, metricsHandler, getMetricsSummary } from './metrics';

const logger = new Logger('APIGateway');
const app = express();
const unifiedSwaggerBaseUrl = process.env.UNIFIED_SWAGGER_BASE_URL || 'http://localhost:3003';

// ===== SECURITY MIDDLEWARE =====
// Must be applied first
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(securityHeaders);
app.use(hppMiddleware);
app.use(compressionMiddleware);

// ===== REQUEST PROCESSING =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ===== LOGGING & MONITORING =====
app.use(requestIdMiddleware);
app.use(performanceMonitor);
app.use(morganLogger);
app.use(requestLogger);

// ===== METRICS =====
if (config.enableMetrics) {
  app.use(metricsMiddleware);
}

// ===== INPUT VALIDATION & SANITIZATION =====
app.use(sanitizeInput);
app.use(detectSqlInjection);
app.use(validateJsonBody);

// ===== RATE LIMITING =====
app.use('/api/v1/auth', authRateLimit); // Strict limit for auth
app.use(globalRateLimit); // Global limit for all other routes

// ===== CSRF PROTECTION =====
// CSRF token endpoint (must be before csrfProtection)
app.get('/api/csrf-token', csrfTokenGenerator);
// Apply CSRF protection to state-changing methods
app.use(csrfProtection);

// ===== HEALTH CHECK =====
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

app.get('/api-docs-all', (_req, res) => {
  res.redirect(`${unifiedSwaggerBaseUrl}/api-docs-all`);
});

app.get('/api-docs-all.json', (_req, res) => {
  res.redirect(`${unifiedSwaggerBaseUrl}/api-docs-all.json`);
});

app.get('/', (_req, res) => {
  res.json({
    service: 'api-gateway',
    status: 'running',
    endpoints: {
      health: '/health',
      csrfToken: '/api/csrf-token',
      docsAll: '/api-docs-all',
      api: '/api/v1',
    },
  });
});

// ===== METRICS ENDPOINT =====
app.get('/metrics', metricsHandler);

// ===== API STATS =====
app.get('/api/stats', async (_req, res) => {
  try {
    const stats = await getMetricsSummary();
    res.json({ stats });
  } catch (error) {
    logger.error('Failed to get stats', { error: (error as Error).message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve statistics',
    });
  }
});

// ===== API ROUTES WITH VERSIONING =====
const router = createVersionedRouter();
app.use(router);

// ===== ERROR HANDLING =====
app.use(errorLogger);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.headers['x-request-id'] as string,
  });

  const message = String(err.message || '');
  const errorName = String((err as Error & { name?: string }).name || '');
  const isCsrfError = /invalid csrf token/i.test(message) || /forbiddenerror/i.test(errorName);

  if (!res.headersSent) {
    if (isCsrfError) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid CSRF token. Refresh token and try again.',
        requestId: req.headers['x-request-id'] as string,
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production'
        ? 'An error occurred'
        : err.message,
      requestId: req.headers['x-request-id'] as string,
    });
  }

  return undefined;
});

// ===== GRACEFUL SHUTDOWN =====
const server = http.createServer(app);

// Health check function
async function onHealthCheck(): Promise<void> {
  // Check if server is healthy
  // TODO: Add checks for Redis, database connections, etc.
  return Promise.resolve();
}

// Cleanup function
async function onSignal(): Promise<void> {
  logger.info('Server is starting cleanup');
  // TODO: Close database connections, Redis, etc.
  return Promise.resolve();
}

// Setup graceful shutdown
createTerminus(server, {
  signal: 'SIGINT',
  healthChecks: {
    '/health': onHealthCheck,
  },
  onSignal,
  logger: (msg, err) => {
    if (err) {
      logger.error(msg, { error: err.message });
    } else {
      logger.info(msg);
    }
  },
});

// ===== START SERVER =====
server.listen(config.port, () => {
  logger.info(`🚀 API Gateway started on port ${config.port}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`CORS Origins: ${config.corsOrigins.join(', ')}`);
  logger.info(`CSRF Protection: ${config.enableCsrf ? 'Enabled' : 'Disabled'}`);
  logger.info(`Metrics: ${config.enableMetrics ? 'Enabled' : 'Disabled'}`);
  logger.info(`\nConfigured Services:`);
  config.services.forEach(service => {
    logger.info(`  ${service.prefix} -> ${service.target} (auth: ${service.requiresAuth})`);
  });
  logger.info('\n🔒 Security Features Enabled:');
  logger.info('  ✅ Helmet.js (XSS, Clickjacking, CSP)');
  logger.info('  ✅ CORS Protection');
  logger.info('  ✅ CSRF Protection');
  logger.info('  ✅ Rate Limiting');
  logger.info('  ✅ SQL Injection Detection');
  logger.info('  ✅ Input Validation & Sanitization');
  logger.info('  ✅ Request Logging & Monitoring');
  logger.info('  ✅ Compression (Gzip/Deflate)');
  logger.info('  ✅ HPP Protection');
});

export default app;
