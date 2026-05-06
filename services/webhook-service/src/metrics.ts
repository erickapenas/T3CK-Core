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

// Service-specific metrics for webhook-service
export const webhookEventsReceived = new Counter({
  name: 'webhook_events_received_total',
  help: 'Total number of webhook events received',
  labelNames: ['event_type'],
});

export const webhookEventsProcessed = new Counter({
  name: 'webhook_events_processed_total',
  help: 'Total number of webhook events processed',
  labelNames: ['event_type', 'status'], // status: success, failure, retry
});

export const webhookProcessingDuration = new Histogram({
  name: 'webhook_processing_duration_seconds',
  help: 'Duration of webhook event processing in seconds',
  labelNames: ['event_type', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const webhookRetries = new Counter({
  name: 'webhook_retries_total',
  help: 'Total number of webhook retries',
  labelNames: ['event_type', 'reason'],
});

export const firestoreOperationsDuration = new Histogram({
  name: 'firestore_operations_duration_seconds',
  help: 'Duration of Firestore operations in seconds',
  labelNames: ['operation', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
});

export const eventQueueSize = new Gauge({
  name: 'event_queue_size',
  help: 'Current size of the event processing queue',
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
        duration
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
export function trackWebhookReceived(eventType: string): void {
  webhookEventsReceived.inc({ event_type: eventType });
}

export function trackWebhookProcessed(
  eventType: string,
  success: boolean,
  durationMs: number
): void {
  const status = success ? 'success' : 'failure';
  webhookEventsProcessed.inc({ event_type: eventType, status });
  webhookProcessingDuration.observe({ event_type: eventType, status }, durationMs / 1000);
}

export function trackWebhookRetry(eventType: string, reason: string): void {
  webhookRetries.inc({ event_type: eventType, reason });
}

export function trackFirestoreOperation(
  operation: string,
  durationMs: number,
  success: boolean
): void {
  firestoreOperationsDuration.observe(
    { operation, status: success ? 'success' : 'failure' },
    durationMs / 1000
  );
}

export function updateQueueMetrics(queueSize: number, cacheSizeMb: number): void {
  eventQueueSize.set(queueSize);
  cacheSize.set(cacheSizeMb * 1024 * 1024);
}
