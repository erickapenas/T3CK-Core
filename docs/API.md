# API Reference

## API Gateway

**Base URL:** `http://api-gateway:3000`

All requests should go through the API Gateway, which provides:

- Authentication & Authorization
- Rate Limiting
- Request Routing
- Logging & Monitoring
- Security (CORS, CSRF, XSS Protection)
- Input Validation

### Health Check

```
GET /health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

---

## Payment Service

### POST /payments

Cria pagamento (Pix/Boleto/Card) com suporte a idempotência.

Header obrigatório:

- `Idempotency-Key`

### GET /payments/:paymentId/pix-timer

Retorna tempo restante para expiração do Pix.

### GET /payments/:paymentId/pix-copy-paste

Retorna payload de copia e cola para Pix.

### POST /payments/:paymentId/confirm

Consulta o status na AbacatePay apos retorno do checkout e sincroniza o pedido quando `ORDER_SERVICE_URL` estiver configurado.

### POST /payments/refund

Solicita estorno total/parcial.

### POST /payments/invoice

Gera invoice do pagamento.

### POST /payments/receipt

Dispara recibo para e-mail do cliente.

### POST /payments/webhook

Recebe eventos de pagamento com verificação de assinatura `X-AbacatePay-Signature`.

### GET /payments/logs

Retorna trilha de auditoria imutável por tenant.

### GET /payments/reports/summary

Retorna dashboard financeiro consolidado por período (`daily`/`monthly`).

### Get CSRF Token

```
GET /api/csrf-token
```

**Response:**

```json
{
  "csrfToken": "..."
}
```

### Metrics

```
GET /metrics
```

Returns Prometheus metrics in text format.

### API Statistics

```
GET /api/stats
```

**Response:**

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

### API Version Info

```
GET /api/version
```

**Response:**

```json
{
  "version": "v1",
  "services": [
    {
      "prefix": "/api/v1/auth",
      "version": "v1",
      "requiresAuth": false
    },
    {
      "prefix": "/api/v1/products",
      "version": "v1",
      "requiresAuth": true
    }
  ]
}
```

---

## Auth Service

### POST /auth/login

Autenticar usuário.

**Request:**

```json
{
  "provider": "firebase" | "cognito",
  "token": "firebase-id-token", // se provider = firebase
  "username": "user@example.com", // se provider = cognito
  "password": "password" // se provider = cognito
}
```

**Response:**

```json
{
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "idToken": "id-token",
  "expiresIn": 3600
}
```

### POST /auth/refresh

Renovar token de acesso.

**Request:**

```json
{
  "refreshToken": "refresh-token"
}
```

**Response:**

```json
{
  "accessToken": "new-jwt-token",
  "refreshToken": "refresh-token",
  "idToken": "id-token",
  "expiresIn": 3600
}
```

### POST /auth/verify

Verificar token JWT.

**Request:**

```json
{
  "token": "jwt-token"
}
```

**Response:**

```json
{
  "valid": true,
  "payload": {
    "tenantId": "tenant-123",
    "userId": "user-456",
    "email": "user@example.com",
    "roles": ["user"]
  }
}
```

### POST /auth/verify-tenant

Verificar token JWT e tenant.

**Request:**

```json
{
  "token": "jwt-token",
  "tenantId": "tenant-123"
}
```

### POST /auth/revoke

Revogar token (blacklist).

**Request:**

```json
{
  "token": "jwt-token"
}
```

### POST /auth/api-keys

Criar API key (requer `X-Internal-API-Key`).

**Request:**

```json
{
  "tenantId": "tenant-123",
  "userId": "user-456",
  "name": "integration-key",
  "scopes": ["read", "write"],
  "expiresAt": "2026-06-01T00:00:00.000Z"
}
```

### POST /auth/api-keys/verify

Verificar API key.

**Request:**

```json
{
  "apiKey": "t3ck_xxx"
}
```

### DELETE /auth/api-keys/:keyId

Revogar API key (requer `X-Internal-API-Key`).

### GET /auth/api-keys

Listar API keys por tenant ou user (requer `X-Internal-API-Key`).

**Example:**

```
GET /auth/api-keys?tenantId=tenant-123
```

### GET /auth/sessions/:userId

Listar sessões do usuário (requer `X-Internal-API-Key`).

### DELETE /auth/sessions/:sessionId

Revogar sessão (requer `X-Internal-API-Key`).

### POST /auth/sessions/revoke-user

Revogar todas as sessões de um usuário (requer `X-Internal-API-Key`).

**Request:**

```json
{
  "userId": "user-456"
}
```

### GET /auth/oidc/authorize

Iniciar OAuth2/OIDC (redirect para Cognito Hosted UI).

### POST /auth/oidc/token

Trocar `code` ou `refreshToken` por tokens.

### GET /auth/oidc/userinfo

Obter dados do usuário via access token.

### GET /auth/oidc/.well-known

Discovery document OIDC.

### POST /auth/mfa/setup

Iniciar setup de MFA (software token).

### POST /auth/mfa/verify

Verificar MFA e ativar.

### GET /auth/keys

Listar chaves JWT (requer `X-Internal-API-Key`).

### POST /auth/keys/rotate

Rotacionar chaves JWT (requer `X-Internal-API-Key`).

### GET /auth/keys/public

Listar chaves públicas ativas.

## Webhook Service

### POST /api/webhooks

Criar webhook.

**Headers:**

- `X-Tenant-ID: tenant-123`

**Request:**

```json
{
  "url": "https://example.com/webhook",
  "events": ["order.created", "order.updated"],
  "secret": "webhook-secret"
}
```

**Response:**

```json
{
  "data": {
    "id": "wh_123",
    "tenantId": "tenant-123",
    "url": "https://example.com/webhook",
    "events": ["order.created", "order.updated"],
    "active": true,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### GET /api/webhooks

Listar webhooks do tenant.

**Headers:**

- `X-Tenant-ID: tenant-123`

**Response:**

```json
{
  "data": [
    {
      "id": "wh_123",
      "url": "https://example.com/webhook",
      "events": ["order.created"],
      "active": true
    }
  ]
}
```

### GET /api/webhooks/:id/logs

Obter logs de entregas do webhook.

**Query Parameters:**

- `limit`: Número de logs (padrão: 50)

**Response:**

```json
{
  "data": [
    {
      "id": "delivery_123",
      "webhookId": "wh_123",
      "eventType": "order.created",
      "status": "success",
      "attempts": 1,
      "responseCode": 200,
      "lastAttemptAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## Tenant Service

### POST /provisioning/submit

Submeter formulário de provisionamento.

**Request:**

```json
{
  "tenantId": "cliente-123",
  "companyName": "Empresa ABC",
  "domain": "cliente.t3ck.com",
  "contactEmail": "contato@empresa.com",
  "contactName": "João Silva",
  "contactPhone": "+5511999999999",
  "region": "us-east-1",
  "plan": "enterprise"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "cliente-123",
    "status": "pending",
    "form": {
      /* ... */
    },
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "message": "Form submitted successfully. Provisioning will begin shortly."
}
```

### GET /provisioning/:tenantId/status

Obter status do provisionamento.

**Response:**

```json
{
  "tenantId": "cliente-123",
  "status": "provisioning",
  "message": "Provisioning in progress"
}
```

## Product Service

### POST /api/products

Criar produto.

**Request:**

```json
{
  "tenantId": "tenant-123",
  "name": "Notebook Pro",
  "sku": "NB-PRO-001",
  "basePrice": 4999.9,
  "stock": 20,
  "categoryId": "cat_abc",
  "tags": ["notebook", "premium"]
}
```

### GET /api/products

Listar produtos com busca/filtro.

**Headers:**

- `X-Tenant-ID: tenant-123`

**Query (opcional):**

- `query`, `categoryId`, `minPrice`, `maxPrice`, `inStock`, `tag`, `active`, `sortBy`

### PUT /api/products/:id

Atualizar produto.

### DELETE /api/products/:id

Excluir produto.

### POST /api/categories

Criar categoria.

### GET /api/categories

Listar categorias do tenant.

### PUT /api/categories/:id

Atualizar categoria.

### DELETE /api/categories/:id

Excluir categoria.

### POST /api/products/:id/variants

Criar variante de produto.

### PUT /api/products/:id/variants/:variantId

Atualizar variante.

### DELETE /api/products/:id/variants/:variantId

Remover variante.

### POST /api/products/:id/images

Adicionar imagem do produto.

### DELETE /api/products/:id/images/:imageId

Remover imagem do produto.

### GET /api/products/:id/recommendations

Obter recomendações de produtos similares.

### GET /api/inventory/:productId

Consultar estoque e histórico de movimentações.

### POST /api/inventory/:productId/adjust

Ajustar estoque com delta (+/-).

**Request:**

```json
{
  "tenantId": "tenant-123",
  "delta": -2,
  "reason": "sale",
  "variantId": "var_abc"
}
```

### PUT /api/inventory/:productId/set

Definir estoque absoluto.

**Request:**

```json
{
  "tenantId": "tenant-123",
  "quantity": 120,
  "reason": "replenishment",
  "variantId": "var_abc"
}
```

## Admin Service

> Todos os endpoints aceitam `X-Tenant-ID` no header (ou `tenantId` em body/query).

### GET /api/admin/dashboard

- KPIs, pedidos recentes, produtos com estoque baixo e atividade recente.

### Product Management

- `POST /api/admin/products`
- `GET /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`

### Order Management

- `POST /api/admin/orders`
- `GET /api/admin/orders`
- `PUT /api/admin/orders/:id`

### Customer Management

- `POST /api/admin/customers`
- `GET /api/admin/customers`
- `PUT /api/admin/customers/:id`

### Analytics & Reports

- `GET /api/admin/analytics`
- `GET /api/admin/reports/:type` (`sales`, `inventory`, `customers`)

### Settings Management

- `GET /api/admin/settings`
- `PUT /api/admin/settings`

### User Management

- `POST /api/admin/users`
- `GET /api/admin/users`
- `PUT /api/admin/users/:id`
- `DELETE /api/admin/users/:id`

### Audit Logs

- `GET /api/admin/audit-logs`

## Media Transformation Service

### GET /transform

Transform image from URL with custom parameters.

**Query Parameters:**

- `url` (required): Source image URL
- `w`: Width in pixels
- `h`: Height in pixels
- `format`: Output format (`webp`, `avif`, `jpeg`, `png`)
- `quality`: Quality 1-100 (default: 85)
- `fit`: Resize mode (`cover`, `contain`, `fill`, `inside`, `outside`)
- `blur`: Blur sigma 0.3-1000
- `grayscale`: `true` to convert to grayscale
- `sharpen`: `true` to apply sharpening

**Example:**

```
GET /transform?url=https://example.com/image.jpg&w=640&format=webp&quality=85
```

**Response:** Binary image data with headers:

- `Content-Type`: image/webp
- `X-Image-Width`: 640
- `X-Image-Height`: 480
- `X-Image-Size`: 45000
- `Cache-Control`: public, max-age=31536000, immutable

### GET /preset/:preset

Transform using predefined preset.

**Built-in Presets:**

- `thumbnail`: 150x150 WebP Q80
- `small`: 320px WebP Q85
- `medium`: 640px WebP Q85
- `large`: 1024px WebP Q90
- `xlarge`: 1920px WebP Q90
- `avif-small`: 640px AVIF Q75
- `avif-medium`: 1024px AVIF Q80

**Example:**

```
GET /preset/medium?url=https://example.com/image.jpg
```

### POST /upload

Upload and transform image.

**Request:** multipart/form-data

- `image`: File
- `width`, `height`, `format`, `quality`: Optional transform parameters

**Response:** Transformed image binary

### GET /presets

List all available presets.

### POST /presets

Create custom preset.

**Request:**

```json
{
  "name": "custom",
  "width": 800,
  "format": "webp",
  "quality": 90
}
```

### GET /stats

Get transformation statistics.

### POST /cache/clear

Clear image cache.

---

## Edge Computing Service

### GET /render/:tenantId/:resourceType/:resourceId

Render pre-generated static page.

**Parameters:**

- `tenantId`: Tenant identifier
- `resourceType`: `product`, `category`, or `page`
- `resourceId`: Resource identifier

**Query Parameters:**

- `force`: Set to `true` to force regeneration

**Example:**

```
GET /render/tenant-1/product/prod-123
GET /render/tenant-1/product/prod-123?force=true
```

**Response:** HTML with cache headers

- `Cache-Control`: public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200
- `X-Cache-Hits`: Number of times this page was served from cache

### POST /prerender

Initiate background pre-rendering job.

**Request:**

```json
{
  "url": "https://example.com/product/123",
  "tenantId": "tenant-1",
  "resourceType": "product",
  "resourceId": "prod-123",
  "ttl": 3600,
  "priority": 8
}
```

**Response:**

```json
{
  "message": "Pre-render job initiated",
  "jobId": "job-abc123",
  "status": "pending"
}
```

### POST /prerender/batch

Batch pre-render multiple pages.

**Request:**

```json
{
  "configs": [
    {
      "url": "https://example.com/product/1",
      "tenantId": "tenant-1",
      "resourceType": "product",
      "resourceId": "prod-1",
      "priority": 10
    },
    {
      "url": "https://example.com/product/2",
      "tenantId": "tenant-1",
      "resourceType": "product",
      "resourceId": "prod-2",
      "priority": 9
    }
  ]
}
```

### GET /jobs/:jobId

Get pre-render job status.

**Response:**

```json
{
  "job": {
    "id": "job-abc123",
    "status": "completed",
    "createdAt": 1708780800000,
    "completedAt": 1708780805000
  }
}
```

### GET /jobs

List all pre-render jobs.

### DELETE /cache/:tenantId/:resourceType/:resourceId

Purge specific resource from cache.

**Example:**

```
DELETE /cache/tenant-1/product/prod-123
```

### POST /cache/clear

Clear entire edge cache.

### GET /isr/config

Get Incremental Static Regeneration configuration.

### PUT /isr/config

Update ISR configuration.

**Request:**

```json
{
  "enabled": true,
  "revalidateInterval": 3600,
  "staleWhileRevalidate": true
}
```

### POST /ssr

Server-Side Render with user context.

**Request:**

```json
{
  "tenantId": "tenant-1",
  "resourceType": "dashboard",
  "resourceId": "user-dashboard",
  "context": {
    "userId": "user-123",
    "userName": "John Doe",
    "userEmail": "john@example.com",
    "preferences": {
      "theme": "dark",
      "currency": "USD"
    }
  },
  "headers": {
    "Accept-Language": "en-US",
    "User-Agent": "Mozilla/5.0..."
  },
  "query": {
    "view": "compact"
  }
}
```

**Response:**

```json
{
  "html": "<!DOCTYPE html><html>...</html>",
  "statusCode": 200,
  "headers": {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, max-age=60",
    "X-Render-Time": "145ms"
  },
  "renderTime": 145,
  "cached": false
}
```

### GET /ssr/:tenantId/:resourceType/:resourceId

Simplified SSR endpoint (auto-extracts context from headers and query).

**Example:**

```
GET /ssr/tenant-1/cart/user-123?discount=SUMMER20
Headers:
  X-User-ID: user-123
  X-User-Name: John Doe
  Accept-Language: en-US
```

**Response:**

```json
{
  "html": "<!DOCTYPE html><html>...</html>",
  "statusCode": 200,
  "headers": {
    "Content-Type": "text/html; charset=utf-8"
  },
  "renderTime": 12,
  "cached": true
}
```

### GET /ssr/config

Get SSR configuration.

**Response:**

```json
{
  "config": {
    "enabled": true,
    "cacheEnabled": true,
    "cacheTTL": 60,
    "maxCacheSize": 52428800,
    "personalizedCaching": true
  }
}
```

### PUT /ssr/config

Update SSR configuration.

**Request:**

```json
{
  "enabled": true,
  "cacheEnabled": true,
  "cacheTTL": 120,
  "maxCacheSize": 104857600,
  "personalizedCaching": true
}
```

**Response:**

```json
{
  "message": "SSR configuration updated",
  "config": {
    "enabled": true,
    "cacheEnabled": true,
    "cacheTTL": 120,
    "maxCacheSize": 104857600,
    "personalizedCaching": true
  }
}
```

### POST /ssr/cache/clear

Clear all SSR cache.

**Response:**

```json
{
  "message": "SSR cache cleared"
}
```

### POST /ssr/cache/purge

Purge SSR cache entries by pattern.

**Request:**

```json
{
  "pattern": "*user-123*"
}
```

**Response:**

```json
{
  "message": "Purged 8 SSR cache entries matching pattern: *user-123*",
  "count": 8
}
```

### GET /stats

Get edge service statistics.

**Response:**

```json
{
  "stats": {
    "totalRequests": 10000,
    "cacheHits": 8500,
    "cacheMisses": 1500,
    "cacheHitRate": "85%",
    "averageGenerationTime": 150,
    "preRenderedPages": 500,
    "totalJobs": 100,
    "completedJobs": 95,
    "failedJobs": 5,
    "ssrStats": {
      "totalSSRRequests": 2500,
      "averageRenderTime": 125,
      "cacheHitRate": "70%",
      "cachedPages": 350
    }
  }
}
```
