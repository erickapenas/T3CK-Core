# 🚪 API Gateway Implementation Summary

## ✅ Status: IMPLEMENTADO

**Porta**: 3000  
**Localização**: `services/api-gateway/`

---

## 🎯 Funcionalidades Implementadas

### 🔒 Segurança (Security)

#### 1. **Helmet.js - XSS Protection**

- Content Security Policy (CSP)
- XSS Filter
- HSTS (HTTP Strict Transport Security)
- noSniff protection
- Frame Guard (Clickjacking protection)
- Powered-By header removal

#### 2. **CORS (Cross-Origin Resource Sharing)**

- Whitelist configurável de origens
- Credentials support
- Métodos permitidos: GET, POST, PUT, DELETE, PATCH, OPTIONS
- Headers customizados: X-Tenant-ID, X-Request-ID
- Preflight caching (24 horas)

#### 3. **CSRF Protection**

- Double submit cookie pattern
- Token generation endpoint: `/api/csrf-token`
- Proteção em métodos POST, PUT, DELETE, PATCH
- Secure cookies em produção

#### 4. **SQL Injection Detection**

- Pattern-based detection
- Bloqueio de queries maliciosas (UNION, DROP, DELETE, etc.)
- Input sanitization automática
- Validação em query parameters e body

#### 5. **Input Validation**

- Zod schemas para validação
- Sanitização automática de strings
- Remoção de caracteres perigosos (< > ' " `)
- Content-Type validation

#### 6. **Input Sanitization**

- Recursive object sanitization
- XSS prevention
- SQL character escaping
- Trim whitespace

#### 7. **HPP Protection**

- HTTP Parameter Pollution prevention
- Duplicate parameter handling

#### 8. **Compression**

- Gzip/Deflate response compression
- Threshold: 1KB
- Level 6 compression

---

### 🚦 Rate Limiting

#### 1. **Global Rate Limit**

- 1000 requests por 15 minutos
- Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
- Status 429 quando excedido

#### 2. **Auth Rate Limit**

- 10 tentativas de login por 15 minutos
- Prevent brute force attacks
- Skip successful requests

#### 3. **Service-Specific Rate Limits**

```typescript
{
  '/api/v1/tenants': { windowMs: 15min, max: 100 },
  '/api/v1/admin': { windowMs: 15min, max: 1000 },
  '/api/v1/media': { windowMs: 1min, max: 100 },
  '/api/v1/edge': { windowMs: 1min, max: 200 },
}
```

#### 4. **Tenant-Based Rate Limiting**

- Different limits per tenant tier (preparado)
- Redis support for distributed rate limiting (preparado)

---

### 🔑 Autenticação e Autorização

#### 1. **JWT Authentication**

- Suporte RS256 (RSA) e HS256
- Token verification
- Payload extraction
- Tenant ID extraction
- User role extraction

#### 2. **Tenant Isolation**

- X-Tenant-ID header validation
- Prevent cross-tenant access
- Automatic tenant ID injection

#### 3. **Role-Based Access Control (RBAC)**

```typescript
requireRole('admin'); // Apenas admins
requireRole('admin', 'manager'); // Admin OU manager
```

#### 4. **Optional Authentication**

- Routes que aceitam token mas não exigem
- Useful para content público com features premium

---

### 🔀 Routing & Proxy

#### 1. **API Versioning**

- `/api/v1/` - Version 1
- `/api/v2/` - Version 2 (preparado)
- Backward compatibility support

#### 2. **Service Routing**

| Prefix             | Target               | Auth Required | Rate Limit |
| ------------------ | -------------------- | ------------- | ---------- |
| `/api/v1/auth`     | auth-service:3002    | ❌            | 10/15min   |
| `/api/v1/webhooks` | webhook-service:3003 | ✅            | Default    |
| `/api/v1/tenants`  | tenant-service:3004  | ✅            | 100/15min  |
| `/api/v1/products` | product-service:3005 | ✅            | Default    |
| `/api/v1/admin`    | admin-service:3006   | ✅            | 1000/15min |
| `/api/v1/media`    | media-service:3007   | ❌            | 100/1min   |
| `/api/v1/edge`     | edge-service:3008    | ❌            | 200/1min   |

#### 3. **Path Rewriting**

- Remove version prefix antes de proxy
- Exemplo: `/api/v1/products/123` → `/products/123`

#### 4. **Header Forwarding**

- X-Request-ID (tracing)
- X-Tenant-ID (multi-tenancy)
- Authorization (JWT token)

#### 5. **Error Handling**

- 502 Bad Gateway quando service indisponível
- Timeout configuration (30 segundos)
- Graceful error responses

---

### 📊 Logging & Monitoring

#### 1. **Request Logging**

- Morgan HTTP logger
- Custom request logger
- Request ID generation (UUID)
- User-Agent tracking
- IP tracking
- Tenant tracking

#### 2. **Performance Monitoring**

- Response time tracking
- Slow request detection (> 1 segundo)
- X-Response-Time header

#### 3. **Error Logging**

- Stack traces em development
- Generic errors em production
- Request context preservation

#### 4. **Body Logging**

- Debug mode apenas
- Disabled em production (sensitive data)

#### 5. **Prometheus Metrics**

**Métricas disponíveis:**

- `http_requests_total` - Total de requests
- `http_request_duration_seconds` - Histogram de duração
- `http_requests_in_progress` - Requests ativos
- `rate_limit_hits_total` - Rate limit hits
- `auth_failures_total` - Falhas de autenticação
- `proxy_errors_total` - Erros de proxy

**Labels:**

- method (GET, POST, PUT, DELETE)
- route
- status_code
- service

---

### 🏥 Health & Monitoring

#### 1. **Health Check**

```
GET /health
```

Returns:

- Service status
- Uptime
- Timestamp
- Version

#### 2. **Graceful Shutdown**

- @godaddy/terminus integration
- SIGINT/SIGTERM handling
- Connection draining
- Cleanup hooks

#### 3. **Metrics Endpoint**

```
GET /metrics
```

Prometheus scraping endpoint.

#### 4. **Statistics Endpoint**

```
GET /api/stats
```

Summary de métricas:

- Total requests
- Total errors
- Average response time
- Requests by service
- Requests by version
- Rate limit hits
- Auth failures

---

## 📦 Estrutura de Arquivos

```
services/api-gateway/
├── src/
│   ├── middleware/
│   │   ├── auth.ts              # JWT authentication
│   │   ├── logging.ts           # Request/response logging
│   │   ├── rate-limit.ts        # Rate limiting configs
│   │   ├── security.ts          # Helmet, CORS, CSRF, HPP
│   │   └── validation.ts        # Zod validation, sanitization
│   ├── __tests__/
│   │   ├── middleware.test.ts   # Auth tests
│   │   └── validation.test.ts   # Validation tests
│   ├── config.ts                # Service configuration
│   ├── types.ts                 # TypeScript types
│   ├── router.ts                # Route definitions
│   ├── proxy.ts                 # Proxy middleware
│   ├── metrics.ts               # Prometheus metrics
│   └── index.ts                 # Main application
├── Dockerfile
├── package.json
├── tsconfig.json
├── jest.config.js
├── README.md
└── .env.example
```

---

## 🔧 Configuração

### Environment Variables

```bash
API_GATEWAY_PORT=3000
NODE_ENV=production
JWT_SECRET=your-secret-key
JWT_PUBLIC_KEY=your-rsa-public-key  # For RS256
ENABLE_METRICS=true
ENABLE_CSRF=true
CORS_ORIGINS=https://app.example.com,https://admin.example.com

# Service URLs
AUTH_SERVICE_URL=http://auth-service:3001
WEBHOOK_SERVICE_URL=http://webhook-service:3002
TENANT_SERVICE_URL=http://tenant-service:3003
PRODUCT_SERVICE_URL=http://product-service:3005
ADMIN_SERVICE_URL=http://admin-service:3006
MEDIA_SERVICE_URL=http://media-service:3007
EDGE_SERVICE_URL=http://edge-service:3008
```

---

## 🚀 Usage

### Starting the Service

```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

### Making Requests

```bash
# 1. Get CSRF token
curl http://localhost:3000/api/csrf-token

# 2. Login to get JWT token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <csrf-token>" \
  -d '{"email": "user@example.com", "password": "password"}'

# 3. Use JWT token for authenticated requests
curl http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer <jwt-token>" \
  -H "X-Tenant-ID: tenant-123"
```

---

## 🧪 Testing

```bash
# Run tests
pnpm test

# Type check
pnpm type-check

# Build
pnpm build
```

**Coverage:** 80% minimum enforced

---

## 📋 Checklist de Segurança

- [x] Helmet.js configurado
- [x] CORS com whitelist
- [x] CSRF protection ativo
- [x] SQL injection detection
- [x] XSS protection
- [x] Input validation (Zod)
- [x] Input sanitization
- [x] Rate limiting global
- [x] Rate limiting por service
- [x] JWT authentication
- [x] Tenant isolation
- [x] RBAC support
- [x] Request logging
- [x] Error logging
- [x] Metrics (Prometheus)
- [x] Health checks
- [x] Graceful shutdown
- [x] HPP protection
- [x] Compression
- [x] Security headers
- [ ] AWS WAF integration (production)
- [ ] Redis for distributed rate limiting (production)
- [ ] Sentry error tracking (production)

---

## 🎯 Próximos Passos (Produção)

1. **AWS WAF Integration**
   - Configure WAF rules
   - DDoS protection
   - SQL injection rules
   - XSS rules

2. **Redis for Rate Limiting**
   - Distributed rate limiting
   - Multi-instance support
   - Shared state

3. **Error Tracking**
   - Sentry integration
   - Error aggregation
   - Alert notifications

4. **Advanced Monitoring**
   - Grafana dashboards
   - Alert rules (Prometheus Alertmanager)
   - Slack/PagerDuty integration

5. **Performance**
   - HTTP/2 support
   - Connection pooling
   - Response caching
   - CDN integration

---

## 📚 Dependencies

**Runtime:**

- express - Web framework
- helmet - Security headers
- cors - CORS middleware
- csrf-csrf - CSRF protection
- express-rate-limit - Rate limiting
- http-proxy-middleware - Reverse proxy
- jsonwebtoken - JWT
- zod - Schema validation
- morgan - HTTP logger
- compression - Response compression
- hpp - HPP protection
- uuid - Request ID generation
- prom-client - Prometheus metrics
- @godaddy/terminus - Graceful shutdown

**Dev:**

- typescript
- jest, supertest - Testing
- @types/\* - Type definitions

---

**Last Updated:** Fevereiro 2026  
**Status:** ✅ Production Ready (with AWS WAF pending)
