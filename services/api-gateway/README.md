# 🚪 API Gateway Service

Centrally managed API Gateway with comprehensive security, routing, rate limiting, and monitoring.

## 🎯 Features

### 🔒 Security

- ✅ **Helmet.js** - XSS Protection, CSP, HSTS, noSniff
- ✅ **CORS** - Configurable origin whitelist
- ✅ **CSRF Protection** - Double submit cookie pattern
- ✅ **SQL Injection Detection** - Pattern-based detection
- ✅ **Input Validation** - Zod schema validation
- ✅ **Input Sanitization** - XSS prevention
- ✅ **HPP Protection** - HTTP Parameter Pollution prevention
- ✅ **Rate Limiting** - Global + per-service limits
- ✅ **JWT Authentication** - RS256/HS256 support
- ✅ **Tenant Isolation** - Multi-tenant security
- ✅ **Role-Based Access Control** - RBAC middleware

### 🔄 Routing & Proxy

- ✅ **API Versioning** - `/api/v1/`, `/api/v2/` support
- ✅ **Request Routing** - Intelligent service routing
- ✅ **Reverse Proxy** - http-proxy-middleware
- ✅ **Path Rewriting** - Clean API paths
- ✅ **Backward Compatibility** - Legacy API support
- ✅ **Health Checks** - Per-service health monitoring

### 📊 Monitoring & Logging

- ✅ **Request Logging** - Morgan + custom logger
- ✅ **Performance Monitoring** - Response time tracking
- ✅ **Prometheus Metrics** - Request count, duration, errors
- ✅ **Request Tracing** - Unique request IDs
- ✅ **Error Tracking** - Comprehensive error logs

### ⚡ Performance

- ✅ **Compression** - Gzip/Deflate response compression
- ✅ **Graceful Shutdown** - @godaddy/terminus
- ✅ **Connection Pooling** - Efficient proxying
- ✅ **Caching Headers** - Proper cache control

## 🏗️ Architecture

```
Client Request
     ↓
API Gateway (Port 3000)
     ↓
Security Middleware → Rate Limiting → Auth → Validation
     ↓
Router (Versioned)
     ↓
Proxy to Backend Services
     ├── Auth Service (3002)
     ├── Webhook Service (3003)
     ├── Tenant Service (3004)
     ├── Product Service (3005)
     ├── Admin Service (3006)
     ├── Media Service (3007)
     └── Edge Service (3008)
```

## 🚀 Quick Start

### Installation

```bash
pnpm install
```

### Configuration

Create `.env` file:

```bash
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key
JWT_PUBLIC_KEY=your-public-key
ENABLE_METRICS=true
ENABLE_CSRF=true
CORS_ORIGINS=http://localhost:3001,http://localhost:3006

# Service URLs
AUTH_SERVICE_URL=http://localhost:3002
WEBHOOK_SERVICE_URL=http://localhost:3003
TENANT_SERVICE_URL=http://localhost:3004
PRODUCT_SERVICE_URL=http://localhost:3005
ADMIN_SERVICE_URL=http://localhost:3006
MEDIA_SERVICE_URL=http://localhost:3007
EDGE_SERVICE_URL=http://localhost:3008
```

### Run

```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

## 📡 API Endpoints

### Health Check

```
GET /health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Metrics

```
GET /metrics
```

Returns Prometheus metrics format.

### CSRF Token

```
GET /api/csrf-token
```

Response:

```json
{
  "csrfToken": "..."
}
```

### API Statistics

```
GET /api/stats
```

Response:

```json
{
  "stats": {
    "totalRequests": 10000,
    "totalErrors": 50,
    "averageResponseTime": 120,
    "requestsByService": {
      "auth": 2000,
      "products": 5000
    },
    "requestsByVersion": {
      "v1": 10000
    },
    "rateLimitHits": 100,
    "authFailures": 25
  }
}
```

## 🔐 Authentication

### JWT Token

Include JWT token in Authorization header:

```
Authorization: Bearer <jwt-token>
```

### Tenant Isolation

Include tenant ID in header (optional, validated against JWT):

```
X-Tenant-ID: tenant-123
```

### Example Request

```bash
curl -X GET http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "X-Tenant-ID: tenant-123" \
  -H "X-CSRF-Token: ..."
```

## 🛡️ Security Features

### 1. XSS Protection (Helmet.js)

Automatically enabled. Sets security headers:

- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy`
- `Strict-Transport-Security`

### 2. CORS

Configure allowed origins in `.env`:

```bash
CORS_ORIGINS=http://localhost:3001,https://app.example.com
```

### 3. CSRF Protection

Get token from `/api/csrf-token` and include in requests:

```bash
curl -X POST http://localhost:3000/api/v1/products \
  -H "X-CSRF-Token: token-from-cookie"
```

### 4. Rate Limiting

**Global Limit**: 1000 requests per 15 minutes

**Auth Endpoints**: 10 requests per 15 minutes

**Custom Limits**: Per-service configuration in `config.ts`

### 5. SQL Injection Prevention

- Pattern-based detection
- Input sanitization
- Zod schema validation
- Always use ORM (Prisma) in services

### 6. Input Validation

Use Zod schemas for validation:

```typescript
import { z } from 'zod';
import { validate } from './middleware/validation';

const schema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
});

app.post('/user', validate({ body: schema }), handler);
```

## 🔢 API Versioning

All routes are versioned:

```
/api/v1/auth/*     → Auth Service
/api/v1/products/* → Product Service
/api/v1/admin/*    → Admin Service
```

### Adding New Version

1. Update `config.ts`:

```typescript
{
  prefix: '/api/v2/products',
  target: 'http://product-service-v2:3005',
  version: 'v2',
  requiresAuth: true,
}
```

2. Maintain backward compatibility for v1.

## 📊 Monitoring

### Prometheus Metrics

Available metrics:

- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request duration histogram
- `http_requests_in_progress` - Active requests
- `rate_limit_hits_total` - Rate limit hits
- `auth_failures_total` - Authentication failures
- `proxy_errors_total` - Proxy errors

### Grafana Dashboard

Import Prometheus metrics into Grafana for visualization.

## 🧪 Testing

```bash
# Run tests
pnpm test

# With coverage
pnpm test -- --coverage

# Type check
pnpm type-check
```

## 🐳 Docker

```bash
# Build
docker build -t t3ck-api-gateway .

# Run
docker run -p 3000:3000 \
  -e JWT_SECRET=secret \
  -e AUTH_SERVICE_URL=http://host.docker.internal:3002 \
  t3ck-api-gateway
```

## 📝 Configuration Reference

### Environment Variables

| Variable         | Default       | Description                            |
| ---------------- | ------------- | -------------------------------------- |
| `PORT`           | `3000`        | Server port                            |
| `NODE_ENV`       | `development` | Environment                            |
| `JWT_SECRET`     | -             | JWT secret key                         |
| `JWT_PUBLIC_KEY` | -             | JWT public key (RS256)                 |
| `ENABLE_METRICS` | `false`       | Enable Prometheus metrics              |
| `ENABLE_CSRF`    | `true`        | Enable CSRF protection                 |
| `CORS_ORIGINS`   | `*`           | Allowed CORS origins (comma-separated) |

### Service Configuration

Edit `src/config.ts` to add/modify services:

```typescript
{
  prefix: '/api/v1/service',
  target: 'http://service:port',
  version: 'v1',
  requiresAuth: true,
  rateLimit: {
    windowMs: 60000,
    max: 100,
  },
}
```

## 🔧 Development

### Adding New Middleware

Create middleware in `src/middleware/`:

```typescript
import { Request, Response, NextFunction } from 'express';

export const myMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Your logic
  next();
};
```

Apply in `src/index.ts`:

```typescript
app.use(myMiddleware);
```

### Adding New Route

1. Add service to `config.ts`
2. Router automatically creates proxy
3. Configure auth/rate-limit as needed

## 🚨 Error Handling

All errors are logged and returned in consistent format:

```json
{
  "error": "Error Type",
  "message": "Human-readable message",
  "requestId": "uuid",
  "details": []
}
```

## 🏭 Production Deployment

### Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure JWT with RS256 and public key
- [ ] Set secure `JWT_SECRET`
- [ ] Configure CORS origins (whitelist)
- [ ] Enable CSRF protection
- [ ] Enable metrics
- [ ] Set up Prometheus scraping
- [ ] Configure CloudWatch/Sentry
- [ ] Use AWS WAF for DDoS protection
- [ ] Enable CloudFront CDN
- [ ] Set up auto-scaling
- [ ] Configure health checks
- [ ] Set up log aggregation

### Performance Tuning

- Use Redis for rate limiting (distributed)
- Enable HTTP/2
- Configure connection pooling
- Use CDN for static assets
- Enable request/response caching

## 📚 Additional Resources

- [Helmet.js Documentation](https://helmetjs.github.io/)
- [Express Rate Limit](https://github.com/express-rate-limit/express-rate-limit)
- [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware)
- [Terminus - Graceful Shutdown](https://github.com/godaddy/terminus)

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md)

## 📄 License

See [LICENSE](../../LICENSE)
