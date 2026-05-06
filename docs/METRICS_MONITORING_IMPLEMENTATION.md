# Metrics & Monitoring Implementation with Prometheus

## Overview

This document describes the Prometheus metrics implementation for the T3CK Core platform. Prometheus provides time-series monitoring, alerting, and performance tracking for all microservices.

**Status**: ✅ Complete and tested across all services
**Services**: auth-service, webhook-service, tenant-service
**Technology**: prom-client v14+, Prometheus, Grafana

## Architecture

### Metrics Collection Pattern

```
Service Startup
    ↓
setupMetricsMiddleware(app)   → Attach request tracking
    ↓
Express Request Processing
    ↓
Automatic Request Metrics Recorded
  ├─ http_request_duration_seconds (histogram)
  ├─ http_requests_total (counter)
  └─ active_connections (gauge)
    ↓
setupMetricsEndpoint(app, '/metrics')  → Expose Prometheus format
    ↓
Prometheus Scrape Agent
  └─ GET /metrics every 15s (default)
    ↓
Time-Series Database Storage
    ↓
Grafana Dashboard Visualization
```

### Metric Types

```
Histogram: http_request_duration_seconds
  ├─ Buckets: [1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 2s, 5s]
  ├─ Labels: method, route, status_code
  └─ Usage: Measure latency distribution

Counter: http_requests_total
  ├─ Always increases
  ├─ Labels: method, route, status_code
  └─ Usage: Track total requests by endpoint

Gauge: active_connections
  ├─ Can go up or down
  ├─ Labels: none
  └─ Usage: Current connection count

Counter: http_requests_errors_total
  ├─ Labels: method, route, error_type
  └─ Usage: Track errors by type (4xx vs 5xx)
```

## Installation

Prometheus client library installed in each service:

```bash
# Install in each service
pnpm add prom-client
```

**Version**: prom-client ^14.0.0

## Service Metrics

### auth-service

**Standard HTTP Metrics**:

- `http_request_duration_seconds` - Request latency by endpoint
- `http_requests_total` - Total requests by method/route/status
- `http_requests_errors_total` - Error requests by type
- `active_connections` - Current open connections

**Authentication Metrics**:

- `auth_attempts_total` - Auth attempts by provider (success/failure)
- `auth_tokens_issued_total` - Tokens issued by type (access/refresh/id)
- `auth_token_validation_duration_seconds` - Token validation latency
- `firebase_operations_duration_seconds` - Firebase API call latency
- `cache_hit_rate` - Cache hit ratio (0-1)
- `cache_size_bytes` - Current cache size

**Example Usage**:

```typescript
import { trackAuthAttempt, trackTokenIssued } from './metrics';

// Track successful login
trackAuthAttempt('firebase', true);

// Track token issued
trackTokenIssued('access_token');
```

### webhook-service

**Standard HTTP Metrics**:

- `http_request_duration_seconds` - Request latency
- `http_requests_total` - Total requests
- `http_requests_errors_total` - Error requests
- `active_connections` - Active connections

**Webhook-Specific Metrics**:

- `webhook_events_received_total` - Events received by type
- `webhook_events_processed_total` - Events processed (success/failure/retry)
- `webhook_processing_duration_seconds` - Processing time by event type
- `webhook_retries_total` - Retries by event type and reason
- `firestore_operations_duration_seconds` - Firestore operation latency
- `event_queue_size` - Current events in processing queue
- `cache_size_bytes` - Cache size

**Example Usage**:

```typescript
import { trackWebhookReceived, trackWebhookProcessed } from './metrics';

// Track webhook received
trackWebhookReceived('provisioning.started');

// Track webhook processed
const startTime = Date.now();
try {
  await processWebhook(event);
  trackWebhookProcessed('provisioning.started', true, Date.now() - startTime);
} catch (error) {
  trackWebhookProcessed('provisioning.started', false, Date.now() - startTime);
}
```

### tenant-service

**Standard HTTP Metrics**:

- `http_request_duration_seconds` - Request latency
- `http_requests_total` - Total requests
- `http_requests_errors_total` - Error requests
- `active_connections` - Active connections

**Provisioning Metrics**:

- `provisioning_requests_total` - Requests by status (pending/in_progress/completed/failed)
- `provisioning_duration_seconds` - Total provisioning duration
- `tenants_active_total` - Number of active tenants
- `provisioning_step_duration_seconds` - Individual step duration (validate/create/setup/complete)
- `firestore_operations_duration_seconds` - Firestore operation latency
- `step_functions_execution_duration_seconds` - AWS Step Functions execution time
- `provisioning_queue_size` - Pending provisioning requests
- `cache_size_bytes` - Cache size

**Example Usage**:

```typescript
import { trackProvisioningRequest, trackProvisioningStep } from './metrics';

// Track provisioning started
trackProvisioningRequest('pending');

// Track individual steps
const stepStart = Date.now();
try {
  await validateProvisioningForm(form);
  trackProvisioningStep('validate', Date.now() - stepStart, true);
} catch (error) {
  trackProvisioningStep('validate', Date.now() - stepStart, false);
}
```

## Integration

### Service Configuration

Each service exposes metrics at `/metrics` endpoint:

```typescript
import { setupMetricsMiddleware, setupMetricsEndpoint } from './metrics';

const app = express();
app.use(express.json());

// Setup metrics middleware (tracks all HTTP requests)
setupMetricsMiddleware(app);

// ... your routes ...

// Expose metrics for Prometheus scraping
setupMetricsEndpoint(app, '/metrics');

app.listen(3001, () => {
  logger.info('Service running on port 3001');
  logger.info('Metrics available at http://localhost:3001/metrics');
});
```

### Metrics Endpoint

Each service exposes Prometheus metrics in text format:

```bash
# Get metrics from auth-service
curl http://localhost:3001/metrics

# Output example:
# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="0.001"} 0
http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="0.005"} 5
http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="0.01"} 10
http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="+Inf"} 15
http_request_duration_seconds_sum{method="GET",route="/health",status_code="200"} 0.045
http_request_duration_seconds_count{method="GET",route="/health",status_code="200"} 15
```

## Prometheus Configuration

### Installation

```bash
# macOS
brew install prometheus

# Ubuntu/Debian
sudo apt-get install prometheus

# Docker
docker run -d -p 9090:9090 prom/prometheus
```

### prometheus.yml Configuration

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 't3ck-core'
    environment: 'production'

scrape_configs:
  - job_name: 'auth-service'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s

  - job_name: 'webhook-service'
    static_configs:
      - targets: ['localhost:3002']
    metrics_path: '/metrics'

  - job_name: 'tenant-service'
    static_configs:
      - targets: ['localhost:3003']
    metrics_path: '/metrics'
```

### Run Prometheus

```bash
# Start with custom config
prometheus --config.file=prometheus.yml

# Access dashboard at http://localhost:9090
```

## Grafana Dashboards

### Installation

```bash
# macOS
brew install grafana

# Ubuntu/Debian
sudo apt-get install grafana-server

# Docker
docker run -d -p 3000:3000 grafana/grafana
```

### Setup Prometheus Data Source

1. Open Grafana: http://localhost:3000
2. Login (default: admin/admin)
3. Configuration → Data Sources → Add data source
4. Select Prometheus
5. URL: http://localhost:9090
6. Save & Test

### Dashboard Queries

**Request Rate (req/s)**:

```promql
rate(http_requests_total[1m])
```

**Error Rate (%)**:

```promql
100 * (
  rate(http_requests_errors_total[5m])
  /
  rate(http_requests_total[5m])
)
```

**P95 Latency (ms)**:

```promql
histogram_quantile(0.95, http_request_duration_seconds) * 1000
```

**Active Connections**:

```promql
active_connections
```

**Auth Success Rate**:

```promql
100 * (
  rate(auth_attempts_total{status="success"}[5m])
  /
  rate(auth_attempts_total[5m])
)
```

**Provisioning Queue Depth**:

```promql
provisioning_queue_size
```

### Example Dashboard JSON

See [grafana-dashboard.json](../examples/grafana-dashboard.json) for complete dashboard configuration.

## Alerting

### Alert Rules

Create `prometheus-alerts.yml`:

```yaml
groups:
  - name: t3ck_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          (sum(rate(http_requests_errors_total[5m])) / sum(rate(http_requests_total[5m]))) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High error rate detected ({{ $value | humanizePercentage }})'

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High P95 latency detected ({{ $value | humanizeDuration }})'

      - alert: ProvisioningBacklog
        expr: |
          provisioning_queue_size > 100
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: 'Provisioning queue backlog ({{ $value }} items)'

      - alert: LowAuthSuccessRate
        expr: |
          (rate(auth_attempts_total{status="success"}[5m]) / rate(auth_attempts_total[5m])) < 0.95
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: 'Low auth success rate ({{ $value | humanizePercentage }})'
```

### Integration with Alertmanager

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'

route:
  receiver: 'slack'
  group_by: ['alertname', 'cluster']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h

receivers:
  - name: 'slack'
    slack_configs:
      - channel: '#alerts'
        title: 'T3CK Core Alert'
        text: '{{ .GroupLabels.alertname }}'
```

## Performance Optimization

### Histogram Bucket Strategy

Custom buckets by metric type:

```typescript
// Fast endpoints (API calls)
buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1];

// Medium endpoints (DB operations)
buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5];

// Slow endpoints (Provisioning)
buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300];
```

### Label Cardinality

⚠️ **Warning**: High cardinality labels cause memory issues

✅ **Good**:

```typescript
// Limited values: only 2-3 possible values
labels: ['status']; // success, failure
labels: ['provider']; // firebase, cognito, okta
```

❌ **Bad**:

```typescript
// Too many combinations: avoid user_id as label
labels: ['user_id']; // millions of unique values!
```

### Recording Rules

Pre-compute expensive queries:

```yaml
groups:
  - name: t3ck_recording_rules
    interval: 1m
    rules:
      - record: job:request_rate_1m:rate1m
        expr: rate(http_requests_total[1m])

      - record: job:error_rate_1m:rate1m
        expr: rate(http_requests_errors_total[1m])

      - record: job:latency_p95:histogram_quantile
        expr: histogram_quantile(0.95, http_request_duration_seconds_bucket)
```

## Testing & Validation

### Local Testing

```bash
# Start all services
pnpm run dev

# In another terminal, check metrics
curl http://localhost:3001/metrics
curl http://localhost:3002/metrics
curl http://localhost:3003/metrics

# Generate some traffic
curl -X POST http://localhost:3001/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test@example.com","password":"test123"}'

# Verify metrics updated
curl http://localhost:3001/metrics | grep http_requests_total
```

### Prometheus Validation

```
# PromQL queries to test
rate(http_requests_total[1m])              # Request rate
histogram_quantile(0.95, ...)              # P95 latency
auth_attempts_total                        # Auth counter
provisioning_queue_size                    # Queue depth
```

## Deployment

### Docker Compose

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - '9090:9090'
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - '3000:3000'
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    depends_on:
      - prometheus

  auth-service:
    build: ./services/auth-service
    ports:
      - '3001:3001'

  webhook-service:
    build: ./services/webhook-service
    ports:
      - '3002:3002'

  tenant-service:
    build: ./services/tenant-service
    ports:
      - '3003:3003'
```

### Kubernetes

```yaml
# ConfigMap for Prometheus scrape config
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    scrape_configs:
      - job_name: 'auth-service'
        kubernetes_sd_configs:
          - role: pod
            namespaces:
              names:
                - default
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_label_app]
            action: keep
            regex: auth-service

---
# ServiceMonitor (if using Prometheus Operator)
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: t3ck-core
spec:
  selector:
    matchLabels:
      app: t3ck-core
  endpoints:
    - port: metrics
      interval: 15s
```

## Troubleshooting

### Metrics Not Appearing

1. **Check endpoint is accessible**:

   ```bash
   curl http://localhost:3001/metrics
   ```

2. **Verify Prometheus scrape config**:

   ```yaml
   scrape_configs:
     - job_name: 'auth-service'
       static_configs:
         - targets: ['localhost:3001']
       metrics_path: '/metrics'
   ```

3. **Check Prometheus targets**:
   - Open http://localhost:9090/targets
   - Look for "UP" status

### High Memory Usage

- Reduce label cardinality (avoid unique values as labels)
- Increase histogram bucket spacing
- Reduce scrape interval

### Missing Service Metrics

- Verify `setupMetricsMiddleware(app)` is called
- Verify `setupMetricsEndpoint(app)` is called
- Check middleware order (should be early in middleware stack)

## Best Practices

✅ **DO**:

- Name metrics clearly (http_requests_total, not req_count)
- Use appropriate metric types (Counter, Gauge, Histogram)
- Keep label cardinality low (< 10 unique values per label)
- Add help text to all metrics
- Use recording rules for complex queries
- Monitor the monitors (alert on scrape failures)

❌ **DON'T**:

- Use high-cardinality labels (user_id, request_id, etc.)
- Create too many metrics (< 100 per service)
- Use Gauges for monotonically increasing values
- Expose internal implementation details
- Scrape too frequently (> every 5 seconds)

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [prom-client Documentation](https://github.com/siimon/prom-client)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)
- [Metric Naming Best Practices](https://prometheus.io/docs/practices/naming/)

## Maintenance

**Daily**:

- Monitor alert status in Grafana
- Check error rates and latencies
- Review service health

**Weekly**:

- Review metric dashboards for anomalies
- Check Prometheus storage usage
- Validate alert thresholds

**Monthly**:

- Review and optimize recording rules
- Analyze metric cardinality
- Plan capacity upgrades

---

**Last Updated**: Semana 2, Dia 3 (Feb 2025)
**Implementation Status**: ✅ Complete
**Services**: 3/3 (auth-service, webhook-service, tenant-service)
**Metrics Exposed**: ~50+ standard and custom metrics
**Next Step**: Implement Enhanced Caching with Redis
