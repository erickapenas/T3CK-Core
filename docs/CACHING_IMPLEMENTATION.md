# Enhanced Caching Implementation with Redis

## Overview

This document describes the Redis caching implementation for the T3CK Core platform. Redis provides fast in-memory caching, session management, and distributed cache for all microservices.

**Status**: ✅ Complete and tested across all services
**Services**: auth-service, webhook-service, tenant-service
**Technology**: ioredis v5+, Redis 6.0+

## Architecture

### Cache Layer Pattern

```
Service Request
    ↓
Check Cache (getCache().get(key))
    ├─ CACHE HIT: Return cached value
    └─ CACHE MISS:
        ↓
    Fetch from Source (DB, API, etc.)
    ↓
    Store in Cache (getCache().set(key, value, ttl))
    ↓
    Return Value
    ↓
Update Metrics (cache_hit_rate, cache_size_bytes)
```

### Cache Operations

```
Get: Single value retrieval
  ├─ Key lookup
  ├─ JSON deserialization
  └─ Return value or null

Set: Store value with TTL
  ├─ JSON serialization
  ├─ Store with expiry
  └─ Update statistics

GetOrSet: Cache-aside pattern
  ├─ Try get
  ├─ If miss: call function
  ├─ Store result
  └─ Return value

Delete: Remove cached value
DeleteMany: Batch delete
Clear: Wipe all with prefix

Increment/Decrement: For counters
```

## Installation

Redis client installed in each service:

```bash
# Install in each service
pnpm add ioredis
```

**Version**: ioredis ^5.0.0

## Configuration

### Environment Variables

```bash
# Redis connection
REDIS_HOST=localhost           # Default: localhost
REDIS_PORT=6379              # Default: 6379
REDIS_PASSWORD=              # Optional: password for auth
REDIS_DB=0                   # Default: 0 (database number)

# Example with Docker
REDIS_HOST=redis.t3ck-core
REDIS_PORT=6379
REDIS_PASSWORD=your_secure_password
REDIS_DB=0
```

### Redis Setup

**Local Development**:
```bash
# macOS
brew install redis
redis-server

# Ubuntu
sudo apt-get install redis-server
redis-server

# Docker
docker run -d -p 6379:6379 redis:7-alpine
```

**Production**:
```bash
# AWS ElastiCache (managed Redis)
# Azure Cache for Redis
# GCP Memorystore
# or self-hosted Redis cluster
```

## Service Integration

### CacheService Class

Each service has a `cache.ts` module providing:

```typescript
interface CacheOptions {
  ttl?: number;      // Time to live in seconds (default: 3600)
  prefix?: string;   // Key prefix for namespace isolation
}

class CacheService {
  // Basic operations
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
  deleteMany(keys: string[]): Promise<void>
  clear(): Promise<void>

  // Query operations
  exists(key: string): Promise<boolean>
  keys(pattern: string): Promise<string[]>

  // Advanced patterns
  getOrSet<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T>

  // Counter operations
  increment(key: string, amount?: number): Promise<number>
  decrement(key: string, amount?: number): Promise<number>

  // TTL management
  expire(key: string, seconds: number): Promise<void>

  // Statistics
  getStats(): { hits, misses, total, hitRate }
  getSize(): Promise<number>

  // Lifecycle
  close(): Promise<void>
}
```

### Service Setup

**auth-service/src/index.ts**:
```typescript
import { initializeCache } from './cache';

// Initialize cache with prefix
initializeCache({ prefix: 'auth:' });

// Now use cache in routes
const cache = getCache();
const user = await cache.getOrSet(`user:${userId}`, async () => {
  return await authService.getUser(userId);
}, 3600); // 1 hour TTL
```

**webhook-service/src/index.ts**:
```typescript
import { initializeCache } from './cache';

initializeCache({ prefix: 'webhook:' });
```

**tenant-service/src/index.ts**:
```typescript
import { initializeCache } from './cache';

initializeCache({ prefix: 'tenant:' });
```

## Usage Patterns

### 1. Basic Get/Set

```typescript
import { getCache } from './cache';

const cache = getCache();

// Store value
await cache.set('user:123', { id: 123, name: 'John' }, 3600);

// Retrieve value
const user = await cache.get('user:123');
// user: { id: 123, name: 'John' } or null
```

### 2. Cache-Aside Pattern (Recommended)

```typescript
const cache = getCache();

async function getUserWithCache(userId: string) {
  return cache.getOrSet(
    `user:${userId}`,
    async () => {
      // Called only on cache miss
      return await database.query(`SELECT * FROM users WHERE id = ${userId}`);
    },
    3600 // 1 hour TTL
  );
}

// Usage
const user = await getUserWithCache('123');
```

### 3. Session Management

```typescript
const cache = getCache();

// Store session
await cache.set(
  `session:${sessionId}`,
  {
    userId: user.id,
    email: user.email,
    roles: user.roles,
    issuedAt: Date.now(),
  },
  86400 // 24 hours
);

// Retrieve session
const session = await cache.get(`session:${sessionId}`);
```

### 4. Rate Limiting

```typescript
const cache = getCache();

async function checkRateLimit(userId: string, limit: number, windowSeconds: number) {
  const key = `ratelimit:${userId}`;
  const count = await cache.increment(key);

  if (count === 1) {
    // First request in window
    await cache.expire(key, windowSeconds);
  }

  return count <= limit;
}

// Usage
const allowed = await checkRateLimit('user:123', 100, 60); // 100 requests/minute
if (!allowed) {
  res.status(429).json({ error: 'Too many requests' });
}
```

### 5. Batch Operations

```typescript
const cache = getCache();

// Delete multiple keys
await cache.deleteMany([
  'user:123',
  'user:456',
  'user:789',
]);

// Get all keys matching pattern
const userKeys = await cache.keys('user:*');
console.log(userKeys); // ['user:123', 'user:456', ...]
```

### 6. Counter Operations

```typescript
const cache = getCache();

// Track page views
await cache.increment('pageviews:homepage');

// Track active users
await cache.increment('active_users');

// Decrement on logout
await cache.decrement('active_users');

// Get counter value
const views = await cache.get('pageviews:homepage');
```

### 7. Expiration Management

```typescript
const cache = getCache();

// Store value without TTL initially
await cache.set('temporary:key', { data: 'value' });

// Later, set expiration
await cache.expire('temporary:key', 3600); // 1 hour from now

// Check if exists
const exists = await cache.exists('temporary:key');
```

## Performance Optimization

### TTL Strategy

```typescript
// Very short lived (seconds)
cache.set(key, value, 60);           // 1 minute for rate limits

// Short lived (minutes)
cache.set(key, value, 300);          // 5 minutes for user profiles

// Medium lived (hours)
cache.set(key, value, 3600);         // 1 hour for catalog data

// Long lived (days)
cache.set(key, value, 86400);        // 24 hours for config
```

### Key Naming Convention

```typescript
// Pattern: resource:id or resource:id:action
cache.set('user:123', ...)           // User object
cache.set('user:123:permissions', ...)   // User permissions
cache.set('session:abc123def', ...)  // Session
cache.set('provisioning:tenant-1', ...)  // Provisioning state
cache.set('ratelimit:user:123', ...)     // Rate limit counter
```

### Batch Operations

```typescript
const cache = getCache();

// Delete multiple related keys at once
await cache.deleteMany([
  `user:${userId}`,
  `user:${userId}:permissions`,
  `user:${userId}:sessions`,
]);
```

### Cache Invalidation

```typescript
// 1. TTL-based (automatic)
await cache.set(key, value, 3600);  // Auto-expires after 1 hour

// 2. Event-based (on update)
async function updateUser(userId: string, data: any) {
  await database.update('users', data);
  await cache.delete(`user:${userId}`);  // Invalidate on update
}

// 3. Pattern-based (multiple related)
async function clearUserCache(userId: string) {
  const keys = await cache.keys(`user:${userId}:*`);
  await cache.deleteMany(keys);
}
```

## Statistics & Monitoring

### Cache Metrics

```typescript
const cache = getCache();

// Get cache statistics
const stats = cache.getStats();
console.log(stats);
// {
//   hits: 1523,
//   misses: 247,
//   total: 1770,
//   hitRate: "86.10"
// }

// Get cache size
const sizeBytes = await cache.getSize();
console.log(`Cache size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);
```

### Integration with Prometheus

Cache metrics are automatically exposed via `/metrics`:

```promql
# Cache hit rate
cache_hit_rate  # 0-1 gauge

# Cache size
cache_size_bytes  # bytes gauge

# Example queries
rate(cache_hit_rate[5m])    # Hit rate over 5 minutes
```

## Deployment

### Docker Compose

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  auth-service:
    build: ./services/auth-service
    ports:
      - "3001:3001"
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      redis:
        condition: service_healthy

volumes:
  redis-data:
```

### Kubernetes

```yaml
# Redis StatefulSet
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: redis-data
          mountPath: /data
  volumeClaimTemplates:
  - metadata:
      name: redis-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi

---
# Redis Service
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  clusterIP: None
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379

---
# Service using Redis
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  REDIS_HOST: "redis"
  REDIS_PORT: "6379"
```

### AWS ElastiCache

```bash
# Create ElastiCache cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id t3ck-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --engine-version 7.0 \
  --num-cache-nodes 1

# Get endpoint
aws elasticache describe-cache-clusters \
  --cache-cluster-id t3ck-redis \
  --show-cache-node-info

# Set environment variables
REDIS_HOST=t3ck-redis.xxxxx.ng.0001.use1.cache.amazonaws.com
REDIS_PORT=6379
```

## Troubleshooting

### Connection Issues

```typescript
// Error: Connection refused
// Solution: Check Redis is running and accessible
redis-cli ping  // Should return PONG

// Check connection params
echo "REDIS_HOST=$REDIS_HOST, REDIS_PORT=$REDIS_PORT"

// Test connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping
```

### Memory Issues

```typescript
// Redis is out of memory
// Solution 1: Increase maxmemory
redis-cli CONFIG SET maxmemory 1gb

// Solution 2: Set eviction policy
redis-cli CONFIG SET maxmemory-policy allkeys-lru

// Solution 3: Monitor memory usage
redis-cli INFO memory
```

### Key Expiration Not Working

```typescript
// Check TTL on key
redis-cli TTL mykey  // -1 = no expiration, -2 = key doesn't exist

// Fix: Set expiration
await cache.expire('mykey', 3600);

// Or use set with TTL
await cache.set('mykey', value, 3600);
```

### Slow Queries

```typescript
// Monitor Redis commands
redis-cli MONITOR

// Or enable slow log
redis-cli CONFIG SET slowlog-log-slower-than 10000  // 10ms

// Check slow log
redis-cli SLOWLOG GET 10
```

## Best Practices

✅ **DO**:
- Use cache-aside pattern (getOrSet)
- Set appropriate TTLs based on data
- Use prefixes for namespace isolation
- Implement cache invalidation on updates
- Monitor cache hit rate
- Handle cache failures gracefully
- Use connection pooling (ioredis does this)
- Batch operations when possible

❌ **DON'T**:
- Store large objects (> 1MB)
- Cache everything indefinitely
- Use cache as primary storage
- Ignore connection errors
- Store sensitive data unencrypted
- Use unbounded TTLs
- Cache real-time critical data

## Security

### Redis Authentication

```typescript
// With password
new Redis({
  host: 'redis.example.com',
  port: 6379,
  password: 'your_strong_password',
});
```

### Encryption in Transit

```bash
# Use Redis SSL/TLS (Redis 6.0+)
redis-server --port 0
redis-server --tls-port 6380 \
  --cert /path/to/cert.pem \
  --key /path/to/key.pem \
  --cacert /path/to/ca.pem
```

### ACL (Redis 6.0+)

```bash
# Create user with limited permissions
redis-cli ACL SETUSER cache_user \
  on \
  ">password123" \
  +get \
  +set \
  +del \
  +exists \
  "+@keyspace" \
  "~cache:*"

# Test
redis-cli -u redis://cache_user:password123@localhost:6379
```

## Monitoring & Alerts

### Key Metrics to Monitor

```
1. Cache Hit Rate (target: > 80%)
2. Eviction Rate (target: 0)
3. Memory Usage (target: < 80% of limit)
4. Connection Count (target: < 100)
5. Keyspace Size (target: stable)
6. Command Latency (target: < 1ms)
```

### Prometheus Queries

```promql
# Cache hit rate
cache_hit_rate

# Memory usage
redis_memory_used_bytes

# Connected clients
redis_connected_clients

# Command count
rate(redis_commands_processed_total[1m])

# Evictions
rate(redis_evicted_keys_total[5m])
```

## References

- [ioredis Documentation](https://github.com/luin/ioredis)
- [Redis Documentation](https://redis.io/documentation)
- [Redis Best Practices](https://aws.amazon.com/caching/best-practices/)
- [Cache Patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/cache-aside)

## Maintenance

**Daily**:
- Monitor cache hit rate
- Check memory usage
- Verify no connection errors

**Weekly**:
- Review cache invalidation logic
- Check for memory leaks
- Monitor key eviction

**Monthly**:
- Optimize TTL values
- Review cache patterns
- Plan capacity upgrades

---

**Last Updated**: Semana 2, Dia 4 (Feb 2025)
**Implementation Status**: ✅ Complete
**Services**: 3/3 (auth-service, webhook-service, tenant-service)
**Cache Patterns**: 7+ usage examples provided
**Next Step**: Implement Config Management with Parameter Store
