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

// Service-specific metrics for tenant-service
export const provisioningRequestsTotal = new Counter({
  name: 'provisioning_requests_total',
  help: 'Total number of provisioning requests',
  labelNames: ['status'], // pending, in_progress, completed, failed
});

export const provisioningDuration = new Histogram({
  name: 'provisioning_duration_seconds',
  help: 'Duration of provisioning operations in seconds',
  labelNames: ['status'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
});

export const tenantsActive = new Gauge({
  name: 'tenants_active_total',
  help: 'Total number of active tenants',
});

export const provisioningStepDuration = new Histogram({
  name: 'provisioning_step_duration_seconds',
  help: 'Duration of individual provisioning steps',
  labelNames: ['step_name', 'status'],
  buckets: [0.1, 0.5, 1, 5, 10],
});

export const firestoreOperationsDuration = new Histogram({
  name: 'firestore_operations_duration_seconds',
  help: 'Duration of Firestore operations in seconds',
  labelNames: ['operation', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
});

export const stepFunctionsExecutionDuration = new Histogram({
  name: 'step_functions_execution_duration_seconds',
  help: 'Duration of Step Functions executions in seconds',
  labelNames: ['execution_type', 'status'],
  buckets: [1, 5, 10, 30, 60, 300],
});

export const provisioningQueueSize = new Gauge({
  name: 'provisioning_queue_size',
  help: 'Current size of provisioning queue',
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

      const duration = (Date.now() - start) / 1000;
      const status = res.statusCode;

      httpRequestDuration.observe(
        { method: req.method, route: req.route?.path || req.path, status_code: status },
        duration,
      );
      httpRequestTotal.inc({
        method: req.method,
        route: req.route?.path || req.path,
        status_code: status,
      });

      if (status >= 400) {
        const errorType = status >= 500 ? 'server_error' : 'client_error';
        httpRequestErrors.inc({
          method: req.method,
          route: req.route?.path || req.path,
          error_type: errorType,
        });
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
export function trackProvisioningRequest(status: string): void {
  provisioningRequestsTotal.inc({ status });
}

export function trackProvisioningDuration(durationMs: number, success: boolean): void {
  provisioningDuration.observe({ status: success ? 'completed' : 'failed' }, durationMs / 1000);
}

export function trackProvisioningStep(stepName: string, durationMs: number, success: boolean): void {
  provisioningStepDuration.observe(
    { step_name: stepName, status: success ? 'success' : 'failure' },
    durationMs / 1000,
  );
}

export function updateActiveTenants(count: number): void {
  tenantsActive.set(count);
}

export function trackFirestoreOperation(operation: string, durationMs: number, success: boolean): void {
  firestoreOperationsDuration.observe(
    { operation, status: success ? 'success' : 'failure' },
    durationMs / 1000,
  );
}

export function trackStepFunctionsExecution(
  executionType: string,
  durationMs: number,
  success: boolean,
): void {
  stepFunctionsExecutionDuration.observe(
    { execution_type: executionType, status: success ? 'success' : 'failure' },
    durationMs / 1000,
  );
}

export function updateQueueMetrics(queueSize: number, cacheSizeMb: number): void {
  provisioningQueueSize.set(queueSize);
  cacheSize.set(cacheSizeMb * 1024 * 1024);
}
