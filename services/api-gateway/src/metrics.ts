import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';
import { MetricsData } from './types';

// Create a Registry
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestsInProgress = new client.Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests currently in progress',
  labelNames: ['method', 'route'],
  registers: [register],
});

const rateLimitHits = new client.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['route'],
  registers: [register],
});

const authFailures = new client.Counter({
  name: 'auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['reason'],
  registers: [register],
});

const proxyErrors = new client.Counter({
  name: 'proxy_errors_total',
  help: 'Total number of proxy errors',
  labelNames: ['service', 'error_type'],
  registers: [register],
});

/**
 * Metrics Middleware
 * Tracks request metrics
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const route = req.route?.path || req.path;

  // Increment in-progress requests
  httpRequestsInProgress.inc({ method: req.method, route });

  // Track response
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds

    // Record duration
    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );

    // Increment total requests
    httpRequestTotal.inc({ method: req.method, route, status_code: res.statusCode });

    // Decrement in-progress requests
    httpRequestsInProgress.dec({ method: req.method, route });
  });

  next();
};

/**
 * Track Rate Limit Hit
 */
export const trackRateLimitHit = (route: string) => {
  rateLimitHits.inc({ route });
};

/**
 * Track Auth Failure
 */
export const trackAuthFailure = (reason: string) => {
  authFailures.inc({ reason });
};

/**
 * Track Proxy Error
 */
export const trackProxyError = (service: string, errorType: string) => {
  proxyErrors.inc({ service, error_type: errorType });
};

/**
 * Get Metrics Data
 */
export const getMetricsData = async (): Promise<string> => {
  return register.metrics();
};

/**
 * Metrics Endpoint Handler
 */
export const metricsHandler = async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate metrics',
    });
  }
};

/**
 * Get Summary Metrics
 */
export const getMetricsSummary = async (): Promise<MetricsData> => {
  const metrics = await register.getMetricsAsJSON();

  // Parse metrics
  const totalRequests = metrics.find((m) => m.name === 'http_requests_total');
  const requestDuration = metrics.find((m) => m.name === 'http_request_duration_seconds');

  // Calculate totals
  let total = 0;
  let errors = 0;
  const byService: Record<string, number> = {};
  const byVersion: Record<string, number> = {};

  if (totalRequests && 'values' in totalRequests) {
    totalRequests.values.forEach((entry: any) => {
      const count = entry.value;
      total += count;

      if (entry.labels.status_code >= 400) {
        errors += count;
      }

      // Extract service from route
      const service = entry.labels.route?.split('/')[3] || 'unknown';
      byService[service] = (byService[service] || 0) + count;

      // Extract version from route
      const version = entry.labels.route?.split('/')[2] || 'unknown';
      byVersion[version] = (byVersion[version] || 0) + count;
    });
  }

  // Calculate average response time
  let avgResponseTime = 0;
  if (requestDuration && 'values' in requestDuration) {
    const durations = requestDuration.values.map((v: any) => v.value);
    avgResponseTime = durations.reduce((a: number, b: number) => a + b, 0) / durations.length;
  }

  // Get rate limit hits
  const rateLimitMetric = metrics.find((m) => m.name === 'rate_limit_hits_total');
  let rateLimitHitsTotal = 0;
  if (rateLimitMetric && 'values' in rateLimitMetric) {
    rateLimitHitsTotal = rateLimitMetric.values.reduce((sum: number, v: any) => sum + v.value, 0);
  }

  // Get auth failures
  const authFailureMetric = metrics.find((m) => m.name === 'auth_failures_total');
  let authFailuresTotal = 0;
  if (authFailureMetric && 'values' in authFailureMetric) {
    authFailuresTotal = authFailureMetric.values.reduce((sum: number, v: any) => sum + v.value, 0);
  }

  return {
    totalRequests: total,
    totalErrors: errors,
    averageResponseTime: avgResponseTime,
    requestsByService: byService,
    requestsByVersion: byVersion,
    rateLimitHits: rateLimitHitsTotal,
    authFailures: authFailuresTotal,
  };
};
