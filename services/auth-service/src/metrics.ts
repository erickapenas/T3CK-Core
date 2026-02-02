import { register, Counter, Histogram, Gauge } from 'prom-client';

// Standard Prometheus metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestErrors = new Counter({
  name: 'http_requests_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_type'],
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
});

// Service-specific metrics
export const authAttempts = new Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['provider', 'status'], // status: success, failure
});

export const authTokensIssued = new Counter({
  name: 'auth_tokens_issued_total',
  help: 'Total number of tokens issued',
  labelNames: ['token_type'], // access, refresh, id
});

export const authTokenValidationDuration = new Histogram({
  name: 'auth_token_validation_duration_seconds',
  help: 'Duration of token validation in seconds',
  labelNames: ['token_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
});

export const firebaseOperationsDuration = new Histogram({
  name: 'firebase_operations_duration_seconds',
  help: 'Duration of Firebase operations in seconds',
  labelNames: ['operation', 'status'], // status: success, failure
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
});

export const cacheHitRate = new Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate (0-1)',
});

export const cacheSize = new Gauge({
  name: 'cache_size_bytes',
  help: 'Current cache size in bytes',
});

// Middleware to track HTTP metrics
export function setupMetricsMiddleware(app: any): void {
  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    
    // Increment active connections
    activeConnections.inc();

    res.on('finish', () => {
      // Decrement active connections
      activeConnections.dec();

      const duration = (Date.now() - start) / 1000; // Convert to seconds
      const status = res.statusCode;

      // Record request metrics
      httpRequestDuration.observe({ method: req.method, route: req.route?.path || req.path, status_code: status }, duration);
      httpRequestTotal.inc({ method: req.method, route: req.route?.path || req.path, status_code: status });

      // Record errors
      if (status >= 400) {
        const errorType = status >= 500 ? 'server_error' : 'client_error';
        httpRequestErrors.inc({ method: req.method, route: req.route?.path || req.path, error_type: errorType });
      }
    });

    next();
  });
}

// Endpoint to expose metrics
export function setupMetricsEndpoint(app: any, path: string = '/metrics'): void {
  app.get(path, async (_req: any, res: any) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
}

// Helper functions for tracking specific operations
export function trackAuthAttempt(provider: string, success: boolean): void {
  authAttempts.inc({
    provider,
    status: success ? 'success' : 'failure',
  });
}

export function trackTokenIssued(tokenType: string): void {
  authTokensIssued.inc({ token_type: tokenType });
}

export function trackTokenValidation(tokenType: string, durationMs: number): void {
  authTokenValidationDuration.observe({ token_type: tokenType }, durationMs / 1000);
}

export function trackFirebaseOperation(operation: string, durationMs: number, success: boolean): void {
  firebaseOperationsDuration.observe(
    { operation, status: success ? 'success' : 'failure' },
    durationMs / 1000,
  );
}

export function updateCacheMetrics(hitRate: number, sizeMb: number): void {
  cacheHitRate.set(hitRate);
  cacheSize.set(sizeMb * 1024 * 1024); // Convert MB to bytes
}
