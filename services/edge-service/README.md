# Edge Computing Service

Pre-rendering, Static Site Generation (SSG), Incremental Static Regeneration (ISR), Server-Side Rendering (SSR), and cache management for sub-1s page loads.

## Features

- ✅ **Pre-rendering**: Generate static HTML before requests
- ✅ **SSG**: Static Site Generation for products/categories/pages
- ✅ **ISR**: Incremental Static Regeneration with stale-while-revalidate
- ✅ **SSR**: Server-Side Rendering with dynamic data and personalization
- ✅ **Smart Caching**: Automatic cache invalidation and background revalidation
- ✅ **Batch Processing**: Pre-render multiple pages in bulk
- ✅ **Job Queue**: Async pre-rendering with status tracking
- ✅ **Stats**: Real-time performance metrics

## Rendering Strategies

### When to Use Each Strategy

| Strategy | Use Case                          | Cache Duration  | Personalized | Performance           |
| -------- | --------------------------------- | --------------- | ------------ | --------------------- |
| **SSG**  | Static content, product catalog   | Days/Weeks      | ❌ No        | ⚡ Fastest (5ms)      |
| **ISR**  | Semi-dynamic content, prices      | Hours           | ❌ No        | ⚡ Fast (5-50ms)      |
| **SSR**  | User-specific content, dashboards | Seconds/Minutes | ✅ Yes       | 🔄 Dynamic (50-200ms) |

## API Endpoints

### 🎨 SSR (Server-Side Rendering) - NEW!

#### POST /ssr

Server-side render with full context and personalization.

**Request:**

```json
{
  "tenantId": "tenant-1",
  "resourceType": "product",
  "resourceId": "prod-123",
  "context": {
    "userId": "user-456",
    "userName": "John Doe",
    "preferences": {
      "theme": "dark",
      "language": "en"
    }
  },
  "headers": {
    "user-agent": "Mozilla/5.0...",
    "cookie": "session=abc123"
  },
  "query": {
    "variant": "premium",
    "utm_source": "email"
  }
}
```

**Response:** HTML with dynamic content, rendered in real-time

**Headers:**

- `X-Render-Mode: SSR`
- `X-Render-Time: 150ms`
- `X-Cache: HIT|MISS`
- `Cache-Control: private, max-age=60`

#### GET /ssr/:tenantId/:resourceType/:resourceId

Simplified SSR via GET request.

**Example:**

```bash
GET /ssr/tenant-1/product/prod-123?variant=premium&theme=dark
```

Automatically extracts:

- Query parameters → `request.query`
- User-Agent, Accept-Language → `request.headers`
- Client IP → `request.context.ip`

#### SSR Configuration

```bash
# Get config
GET /ssr/config

# Update config
PUT /ssr/config
Content-Type: application/json

{
  "enabled": true,
  "cacheEnabled": true,
  "cacheTTL": 60,
  "maxCacheSize": 50,
  "personalizedCaching": true
}
```

**Config Options:**

- `enabled`: Enable/disable SSR
- `cacheEnabled`: Enable short-term caching (default: true)
- `cacheTTL`: Cache duration in seconds (default: 60)
- `maxCacheSize`: Max cache size in MB (default: 50)
- `personalizedCaching`: Cache per user vs globally (default: true)

#### SSR Cache Management

```bash
# Clear all SSR cache
POST /ssr/cache/clear

# Purge by pattern
POST /ssr/cache/purge
Content-Type: application/json

{
  "pattern": "tenant-1"
}
```

### 📊 Render Page (SSG/ISR)

```bash
GET /render/:tenantId/:resourceType/:resourceId
GET /render/tenant-1/product/prod-123
GET /render/tenant-1/product/prod-123?force=true  # Force regeneration
```

Returns pre-rendered HTML with cache headers.

### Pre-render Single Page

```bash
POST /prerender
Content-Type: application/json

{
  "url": "https://example.com",
  "tenantId": "tenant-1",
  "resourceType": "product",
  "resourceId": "prod-123",
  "ttl": 3600,
  "priority": 8
}
```

Initiates background pre-rendering job.

### Batch Pre-render

```bash
POST /prerender/batch
Content-Type: application/json

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

### Get Job Status

```bash
GET /jobs/:jobId
GET /jobs/job-abc123
```

### List All Jobs

```bash
GET /jobs
```

### Purge Resource

```bash
DELETE /cache/tenant-1/product/prod-123
```

### Clear Cache

```bash
POST /cache/clear
```

### ISR Configuration

```bash
# Get config
GET /isr/config

# Update config
PUT /isr/config
Content-Type: application/json

{
  "enabled": true,
  "revalidateInterval": 3600,
  "staleWhileRevalidate": true
}
```

### Stats

```bash
GET /stats
```

## How It Works

### Static Site Generation (SSG)

1. Page is requested
2. Check cache → if hit, return immediately
3. If miss, fetch data from backend services
4. Generate HTML with meta tags, SEO, structured data
5. Cache with TTL
6. Return HTML

### Incremental Static Regeneration (ISR)

1. Page is in cache but stale (past revalidateInterval)
2. Return stale version immediately (no wait)
3. Revalidate in background
4. Next request gets fresh version

This gives **instant response** even for stale content, with automatic updates.

### Server-Side Rendering (SSR)

1. Request arrives with user context
2. Check personalized cache (optional, short TTL)
3. If miss, fetch fresh data from backend services
4. Render HTML with user-specific data
5. Include personalization (user name, preferences, theme)
6. Optional: Cache for short duration (60s default)
7. Return dynamic HTML

SSR is perfect for:

- User dashboards
- Shopping carts
- Personalized recommendations
- A/B testing variants
- Real-time pricing

**Caching Strategy:**

- **Personalized caching ON**: Cache key includes userId → each user gets their own cache
- **Personalized caching OFF**: Cache key is just the resource → faster but less personalized

### SSR Usage Examples

#### Render User Dashboard

```typescript
// POST /ssr with full context
const response = await axios.post('http://edge-service:3008/ssr', {
  tenantId: 'tenant-1',
  resourceType: 'dashboard',
  resourceId: 'user-dashboard',
  context: {
    userId: 'user-123',
    userName: 'John Doe',
    userEmail: 'john@example.com',
    preferences: {
      theme: 'dark',
      currency: 'USD',
    },
  },
  headers: {
    'Accept-Language': 'en-US',
    'User-Agent': 'Mozilla/5.0...',
  },
  query: {
    view: 'compact',
  },
});

// response.data = { html, statusCode, headers, renderTime, cached }
```

#### Simplified SSR (Auto-extract context)

```typescript
// GET /ssr/:tenantId/:resourceType/:resourceId
const response = await axios.get('http://edge-service:3008/ssr/tenant-1/cart/user-123', {
  headers: {
    'X-User-ID': 'user-123',
    'X-User-Name': 'John Doe',
    'Accept-Language': 'en-US',
  },
  params: { discount: 'SUMMER20' },
});

// Returns HTML with shopping cart
```

#### Configure SSR Caching

```typescript
// Update SSR configuration
await axios.put('http://edge-service:3008/ssr/config', {
  enabled: true,
  cacheEnabled: true,
  cacheTTL: 120, // 2 minutes
  maxCacheSize: 100 * 1024 * 1024, // 100MB
  personalizedCaching: true, // Separate cache per user
});
```

#### Clear User Cache

```typescript
// Clear all SSR cache
await axios.post('http://edge-service:3008/ssr/cache/clear');

// Purge specific user's pages
await axios.post('http://edge-service:3008/ssr/cache/purge', {
  pattern: '*user-123*',
});
```

### Pre-rendering Strategy

**High-Priority Products** (new releases, trending):

```bash
POST /prerender/batch with priority=10
```

**Regular Products**:

```bash
pre-render on-demand or with priority=5
```

**Low-Priority** (old products):

```bash
Let ISR handle on first request
```

## Cache Headers

Generated pages include optimal headers:

```
Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200
X-Tenant-ID: tenant-1
X-Resource-Type: product
X-Resource-ID: prod-123
X-Generated-At: 2026-02-24T12:00:00.000Z
X-Cache-Hits: 42
```

## Integration Examples

### Pre-render New Products on Creation

```typescript
// In product-service after creating product
await axios.post('http://edge-service:3008/prerender', {
  url: `https://store.example.com/products/${product.id}`,
  tenantId: tenantId,
  resourceType: 'product',
  resourceId: product.id,
  priority: 10, // High priority for new products
});
```

### Invalidate Cache on Product Update

```typescript
// In product-service after updating product
await axios.delete(`http://edge-service:3008/cache/${tenantId}/product/${productId}`);
```

### Pre-render Top Products Daily

```typescript
// Scheduled job
const topProducts = await getTopProducts(100);

await axios.post('http://edge-service:3008/prerender/batch', {
  configs: topProducts.map((p) => ({
    url: `https://store.example.com/products/${p.id}`,
    tenantId: p.tenantId,
    resourceType: 'product',
    resourceId: p.id,
    priority: p.salesRank, // Higher rank = higher priority
  })),
});
```

## Environment Variables

```bash
PORT=3008
NODE_ENV=production
PRODUCT_SERVICE_URL=http://product-service:3001
CONTENT_SERVICE_URL=http://content-service:3009
```

## Performance Benefits

### Without Edge Service

- First request: **800ms** (fetch data + render)
- Cache hit: **50ms**

### With Edge Service

- Pre-rendered (SSG): **5ms** (serve from memory)
- ISR stale-while-revalidate: **5ms** (serve stale + update background)
- SSR cached: **10ms** (user-specific cache hit)
- SSR uncached: **150ms** (dynamic render with fresh data)
- Fresh render: **200ms** (parallel fetch + render)

### Rendering Strategy Decision Matrix

| Content Type                 | Strategy | Reason                            |
| ---------------------------- | -------- | --------------------------------- |
| Product catalog pages        | SSG      | Static, cacheable indefinitely    |
| Product details              | ISR      | Semi-dynamic, update background   |
| Product search results       | ISR      | Changes occasionally              |
| User dashboard               | SSR      | User-specific data                |
| Shopping cart                | SSR      | Real-time user data               |
| Personalized recommendations | SSR      | User-specific + A/B tests         |
| Category pages               | ISR      | Semi-static with periodic updates |
| Static content pages         | SSG      | No changes                        |

### PageSpeed Impact

- **TTFB**: < 50ms (pre-rendered)
- **FCP**: < 200ms (HTML ready)
- **LCP**: < 500ms (with WebP images from media-service)
- **Score**: 95-100 ✅

## Development

```bash
pnpm install
pnpm dev
```

## Production

```bash
pnpm build
pnpm start
```

## Monitoring

Check `/stats` for:

- Cache hit rate (target: >80%)
- Average generation time (target: <200ms)
- Pre-rendered pages count
- Job success/failure rate

## Best Practices

1. **Pre-render critical pages**: Homepage, top products, landing pages
2. **ISR for dynamic content**: Product pages that update occasionally
3. **Purge on update**: Invalidate cache when data changes
4. **Batch at night**: Pre-render catalog during low traffic
5. **Monitor hit rate**: >80% = good cache strategy
