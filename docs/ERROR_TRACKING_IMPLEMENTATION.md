# Error Tracking Implementation with Sentry

## Overview

This document describes the Sentry error tracking implementation across the T3CK Core platform. Sentry provides centralized error monitoring, alerting, and debugging capabilities for all microservices.

**Status**: ✅ Complete and tested across all services
**Services**: auth-service, webhook-service, tenant-service
**Technology**: @sentry/node v10.38.0

## Architecture

### Sentry Integration Pattern

```
Service Startup
    ↓
initSentry() → Sentry.init() with DSN from SENTRY_DSN env var
    ↓
Express App Initialization
    ↓
Route Setup
    ↓
setupSentryErrorHandler() → Global error catch middleware
    ↓
Graceful Shutdown → Sentry.close() with 2s flush timeout
```

### Error Flow

```
Request Error
    ↓
Express Error Handler (setupSentryErrorHandler)
    ↓
Sentry.captureException(err)
    ↓
Optional Context Added (via Sentry.withScope)
    ↓
beforeSend() Filter Applied (removes sensitive headers)
    ↓
Sentry Server Ingestion
    ↓
Dashboard Alert/Notification
```

## Installation

Sentry packages are installed in each service:

```bash
# Install in each service
pnpm add @sentry/node @sentry/tracing
```

**Versions**:
- `@sentry/node`: ^10.38.0 (or latest v10.x)
- `@sentry/tracing`: ^10.38.0 (or latest v10.x)

## Configuration

### Environment Variables

```bash
# Required
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<projectId>

# Optional
NODE_ENV=production          # Sets environment (dev/staging/production)
SERVICE_VERSION=1.0.0       # Release version for tracking
```

**Getting your DSN**:
1. Sign up at https://sentry.io/
2. Create a new project (select Node.js)
3. Copy the DSN from Settings → Client Keys (DSN)
4. Set as environment variable in your deployment

### Service Configuration

Each service has a `sentry.ts` module:

```typescript
// services/auth-service/src/sentry.ts
import * as Sentry from '@sentry/node';
import { version } from '../../package.json';

const environment = process.env.NODE_ENV || 'development';

export function initSentry(serviceName: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.warn(`[${serviceName}] SENTRY_DSN not set`);
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: version,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }
      return event;
    },
  });
}

export function setupSentryErrorHandler(app: any): void {
  app.use((err: any, _req: any, res: any, _next: any) => {
    Sentry.captureException(err);
    res.statusCode = err.statusCode || 500;
    res.end();
  });
}

export function captureException(error: unknown, context?: Record<string, any>): void {
  if (context) {
    Sentry.withScope((scope) => {
      scope.setContext('custom', context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export function setUserContext(userId: string, email?: string): void {
  Sentry.setUser({ id: userId, email });
}

export function setTenantContext(tenantId: string): void {
  Sentry.setContext('tenant', { id: tenantId });
}

export async function flushSentry(timeout: number = 2000): Promise<void> {
  return new Promise((resolve) => {
    Sentry.close(timeout).then(resolve).catch(resolve);
  });
}
```

### Service Integration

Each service's `index.ts` integrates Sentry:

```typescript
import { initSentry, setupSentryErrorHandler } from './sentry';

// Initialize Sentry FIRST (before anything else)
initSentry('auth-service');

const app = express();
app.use(express.json());

// ... your routes ...

// Setup error handler AFTER all routes
setupSentryErrorHandler(app);

const server = app.listen(PORT, () => {
  logger.info(`Service running on port ${PORT}`);
});

// Graceful shutdown with Sentry flush
process.on('SIGTERM', async () => {
  server.close(async () => {
    await require('./sentry').flushSentry(2000);
    process.exit(0);
  });
});
```

## Usage Examples

### Basic Error Capture

```typescript
import { captureException } from './sentry';

try {
  // Some operation
  await riskyOperation();
} catch (error) {
  captureException(error);
  res.status(500).json({ error: 'Internal Server Error' });
}
```

### Error with Context

```typescript
import { captureException } from './sentry';

try {
  await updateTenant(tenantId);
} catch (error) {
  captureException(error, {
    operation: 'update-tenant',
    tenantId,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
  });
  res.status(500).json({ error: 'Update failed' });
}
```

### Setting User Context

```typescript
import { setUserContext, setTenantContext } from './sentry';

// After user authentication
setUserContext(user.id, user.email);
setTenantContext(user.tenantId);

// Now all errors are tagged with this context
```

### Manual Breadcrumbs

```typescript
import * as Sentry from '@sentry/node';

Sentry.captureMessage('Operation started', 'info');
// ... do something ...
Sentry.captureMessage('Operation completed', 'info');
// If error happens, breadcrumbs are included in error context
```

## Error Filtering

### Sensitive Data Removal

The `beforeSend()` hook removes sensitive headers:

```typescript
beforeSend(event) {
  if (event.request?.headers) {
    delete event.request.headers['authorization'];
    delete event.request.headers['cookie'];
    delete event.request.headers['x-api-key'];
    delete event.request.headers['x-auth-token'];
  }
  return event;
}
```

### Custom Filtering

To add custom filtering, modify `sentry.ts`:

```typescript
beforeSend(event) {
  // Remove sensitive headers
  if (event.request?.headers) {
    delete event.request.headers['authorization'];
    delete event.request.headers['custom-secret'];
  }

  // Filter by error type
  if (event.exception?.[0]?.value?.includes('ECONNREFUSED')) {
    // Don't send connection errors
    return null;
  }

  // Filter by error message
  if (event.message?.includes('network timeout')) {
    // Don't send timeouts
    return null;
  }

  return event;
}
```

## Deployment Checklist

### Local Development

```bash
# Environment setup
export SENTRY_DSN=""  # Leave empty or use test project
export NODE_ENV="development"

# Build
pnpm build

# Services run without sending errors (DSN not set)
pnpm run dev
```

### Staging Environment

```bash
# Use staging Sentry project
SENTRY_DSN=https://<staging-key>@<org>.ingest.sentry.io/<staging-projectId>
NODE_ENV=staging
SERVICE_VERSION=<staging-version>
```

### Production Environment

```bash
# Use production Sentry project
SENTRY_DSN=https://<prod-key>@<org>.ingest.sentry.io/<prod-projectId>
NODE_ENV=production
SERVICE_VERSION=<production-version>
```

## Monitoring & Alerting

### Sentry Dashboard

1. Log in to https://sentry.io/
2. Select your project (T3CK Core)
3. **Issues**: See all errors grouped by type
4. **Releases**: Track errors by service version
5. **Performance**: Monitor transaction performance
6. **Alerts**: Configure error thresholds

### Alert Rules

**Setup in Sentry**:

1. Go to Alerts → Create Alert Rule
2. **Error Rate Alert**: Alert if error rate > 5% in 5 minutes
3. **New Issue Alert**: Alert on first occurrence of new error
4. **Critical Error Alert**: Alert on high-severity errors

**Example Rule**:
```
When: Error rate
  of: [project] is
  Is: Greater than
  Value: 5%
  In: 5 minutes

Then: Send notification to Slack channel #alerts
```

### Slack Integration

1. In Sentry: Settings → Integrations → Slack
2. Install Sentry app in your Slack workspace
3. Configure channel for error notifications
4. Test with `curl -X POST https://sentry.io/_/debug/`

## Performance Considerations

### Sampling

The default configuration samples 10% of transactions:

```typescript
Sentry.init({
  tracesSampleRate: 0.1,  // 10% of all transactions
  // ...
});
```

Adjust based on traffic:
- **High traffic**: 0.05 (5%)
- **Medium traffic**: 0.1 (10%)
- **Low traffic**: 0.5 (50%)

### Release Tags

Release tags help track which version has issues:

```typescript
Sentry.init({
  release: '1.0.0',  // From package.json version
  // ...
});
```

## Troubleshooting

### DSN Not Set

```
Warning: [auth-service] SENTRY_DSN not set
```

**Solution**: Set `SENTRY_DSN` environment variable

```bash
export SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<projectId>
```

### Events Not Appearing

1. **Check DSN**: Verify correct project DSN
2. **Check Environment**: Make sure `beforeSend()` is not filtering them
3. **Check Network**: Verify outbound HTTPS to `ingest.sentry.io`
4. **Check Quota**: Sentry free tier has event limits

### High Error Volume

1. Implement `beforeSend()` filtering
2. Lower `tracesSampleRate`
3. Add error rate alerts
4. Investigate root cause of errors

## Testing

### Local Testing

```typescript
// Test error capture
import { captureException } from './sentry';

// This should appear in Sentry console (if DSN set)
const err = new Error('Test error');
captureException(err, { test: true });
```

### Sentry CLI

```bash
# Install globally
npm install -g @sentry/cli

# Create a release
sentry-cli releases create -p auth-service v1.0.0

# Upload sourcemaps
sentry-cli releases files v1.0.0 upload-sourcemap dist/

# Finalize release
sentry-cli releases finalize v1.0.0
```

## Best Practices

✅ **DO**:
- Initialize Sentry as the very first thing in your app
- Use context methods to add request/user info to errors
- Set appropriate sampling rates for your traffic
- Use beforeSend() to filter sensitive data
- Include meaningful error messages
- Monitor error trends regularly

❌ **DON'T**:
- Try to suppress all errors
- Send raw error stacks with credentials
- Use Sentry for normal application logging
- Flood Sentry with test errors
- Forget to flush Sentry on graceful shutdown

## Security & Privacy

### PII Handling

Sentry's `beforeSend()` removes:
- Authorization headers
- Cookies and sessions
- API keys and tokens
- Custom secret headers

### GDPR Compliance

1. **Data Retention**: Set in Sentry settings (default 30 days)
2. **PII Scrubbing**: Enable in Data Privacy settings
3. **User Consent**: Inform users that errors are tracked

## Migration Guide

### From No Error Tracking

If you're adding Sentry to an existing service:

1. Install packages: `pnpm add @sentry/node @sentry/tracing`
2. Create `sentry.ts` module (copy from auth-service)
3. Add to `index.ts`:
   - `initSentry()` at top
   - `setupSentryErrorHandler()` after routes
   - Graceful shutdown flush
4. Set `SENTRY_DSN` environment variable
5. Test: `pnpm build && npm start`

## References

- [Sentry Node.js Documentation](https://docs.sentry.io/platforms/node/)
- [Sentry API Reference](https://docs.sentry.io/platforms/node/enriching-events/)
- [Error Tracking Best Practices](https://docs.sentry.io/platforms/node/enriching-events/breadcrumbs/)

## Maintenance

**Weekly**:
- Review error dashboard for trends
- Check alert rules are working
- Investigate new error patterns

**Monthly**:
- Review sampling rates vs quota
- Update alert thresholds
- Rotate sensitive credentials if needed

**Quarterly**:
- Review retention policies
- Audit PII scrubbing settings
- Plan performance optimizations

---

**Last Updated**: Semana 2, Dia 2 (Feb 2025)
**Implementation Status**: ✅ Complete
**Services**: 3/3 (auth-service, webhook-service, tenant-service)
**Next Step**: Implement Metrics & Monitoring with Prometheus
