import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds (default: 3600 = 1 hour)
  prefix?: string; // Key prefix
}

export class CacheService {
  private redis: Redis | null = null;
  private redisEnabled: boolean;
  private readonly redisRequired: boolean;
  private fallbackLogged = false;
  private memoryStore = new Map<string, { value: string; expiresAt: number | null }>();
  private defaultTTL: number = 3600; // 1 hour
  private prefix: string = 'cache:';
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(options?: CacheOptions) {
    this.redisRequired =
      String(process.env.REDIS_REQUIRED || '').toLowerCase() === 'true' ||
      process.env.NODE_ENV === 'production';
    this.redisEnabled = process.env.REDIS_DISABLED !== 'true';

    if (this.redisEnabled) {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        retryStrategy: (times) => {
          if (!this.redisRequired && times > 1) {
            return null;
          }
          return Math.min(times * 50, 2000);
        },
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      this.redis.on('error', (err) => {
        this.handleRedisFailure(err);
      });

      this.redis.on('connect', () => {
        console.log('[CacheService] Connected to Redis');
      });

      this.redis.on('disconnect', () => {
        if (this.redisEnabled) {
          console.log('[CacheService] Disconnected from Redis');
        }
      });
    } else {
      console.warn('[CacheService] Redis disabled, using in-memory cache');
    }

    if (options?.ttl) {
      this.defaultTTL = options.ttl;
    }
    if (options?.prefix) {
      this.prefix = options.prefix;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);

    if (!this.redisEnabled || !this.redis) {
      return this.getFromMemory<T>(fullKey);
    }

    try {
      const value = await this.redis.get(fullKey);
      if (value) {
        this.hitCount++;
        return JSON.parse(value) as T;
      }
      this.missCount++;
      return null;
    } catch (error) {
      this.handleRedisFailure(error);
      return this.getFromMemory<T>(fullKey);
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const expiry = ttl || this.defaultTTL;
    const serialized = JSON.stringify(value);

    if (!this.redisEnabled || !this.redis) {
      this.setInMemory(fullKey, serialized, expiry);
      return;
    }

    try {
      await this.redis.setex(fullKey, expiry, serialized);
    } catch (error) {
      this.handleRedisFailure(error);
      this.setInMemory(fullKey, serialized, expiry);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);

    if (!this.redisEnabled || !this.redis) {
      this.memoryStore.delete(fullKey);
      return;
    }

    try {
      await this.redis.del(fullKey);
    } catch (error) {
      this.handleRedisFailure(error);
      this.memoryStore.delete(fullKey);
    }
  }

  /**
   * Delete multiple keys from cache
   */
  async deleteMany(keys: string[]): Promise<void> {
    const prefixedKeys = keys.map((key) => this.getKey(key));

    if (!this.redisEnabled || !this.redis) {
      for (const key of prefixedKeys) {
        this.memoryStore.delete(key);
      }
      return;
    }

    try {
      if (prefixedKeys.length > 0) {
        await this.redis.del(...prefixedKeys);
      }
    } catch (error) {
      this.handleRedisFailure(error);
      for (const key of prefixedKeys) {
        this.memoryStore.delete(key);
      }
    }
  }

  /**
   * Clear all cache keys with current prefix
   */
  async clear(): Promise<void> {
    if (!this.redisEnabled || !this.redis) {
      this.memoryStore.clear();
      return;
    }

    try {
      const keys = await this.redis.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      this.handleRedisFailure(error);
      this.memoryStore.clear();
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);

    if (!this.redisEnabled || !this.redis) {
      this.purgeIfExpired(fullKey);
      return this.memoryStore.has(fullKey);
    }

    try {
      const result = await this.redis.exists(fullKey);
      return result > 0;
    } catch (error) {
      this.handleRedisFailure(error);
      return false;
    }
  }

  /**
   * Get or set value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    try {
      // Try to get from cache
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // If not in cache, call function
      const value = await fn();

      // Store in cache
      await this.set(key, value, ttl);

      return value;
    } catch (error) {
      console.error(`[CacheService] GetOrSet error for key ${key}:`, error);
      // If cache fails, still call function
      return fn();
    }
  }

  /**
   * Increment value (for counters)
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    const fullKey = this.getKey(key);

    if (!this.redisEnabled || !this.redis) {
      const current = await this.get<number>(key);
      const next = (current || 0) + amount;
      await this.set(fullKey.replace(`${this.prefix}`, ''), next);
      return next;
    }

    try {
      return await this.redis.incrby(fullKey, amount);
    } catch (error) {
      this.handleRedisFailure(error);
      const current = await this.get<number>(key);
      const next = (current || 0) + amount;
      await this.set(key, next);
      return next;
    }
  }

  /**
   * Decrement value (for counters)
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    const fullKey = this.getKey(key);

    if (!this.redisEnabled || !this.redis) {
      const current = await this.get<number>(key);
      const next = (current || 0) - amount;
      await this.set(key, next);
      return next;
    }

    try {
      return await this.redis.decrby(fullKey, amount);
    } catch (error) {
      this.handleRedisFailure(error);
      const current = await this.get<number>(key);
      const next = (current || 0) - amount;
      await this.set(key, next);
      return next;
    }
  }

  /**
   * Set expiry on existing key
   */
  async expire(key: string, seconds: number): Promise<void> {
    const fullKey = this.getKey(key);

    if (!this.redisEnabled || !this.redis) {
      const current = this.memoryStore.get(fullKey);
      if (current) {
        current.expiresAt = Date.now() + seconds * 1000;
        this.memoryStore.set(fullKey, current);
      }
      return;
    }

    try {
      await this.redis.expire(fullKey, seconds);
    } catch (error) {
      this.handleRedisFailure(error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? (this.hitCount / total) * 100 : 0;

    return {
      hits: this.hitCount,
      misses: this.missCount,
      total,
      hitRate: hitRate.toFixed(2),
    };
  }

  /**
   * Get cache size in bytes
   */
  async getSize(): Promise<number> {
    if (!this.redisEnabled || !this.redis) {
      let total = 0;
      for (const entry of this.memoryStore.values()) {
        total += Buffer.byteLength(entry.value, 'utf8');
      }
      return total;
    }

    try {
      const info = await this.redis.info('memory');
      const lines = info.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('used_memory:')) {
          const bytes = parseInt(line.split(':')[1]);
          return bytes;
        }
      }
      return 0;
    } catch (error) {
      this.handleRedisFailure(error);
      return 0;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string = '*'): Promise<string[]> {
    if (!this.redisEnabled || !this.redis) {
      const regex = new RegExp(`^${(this.prefix + pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      return Array.from(this.memoryStore.keys()).filter((key) => regex.test(key));
    }

    try {
      return await this.redis.keys(`${this.prefix}${pattern}`);
    } catch (error) {
      this.handleRedisFailure(error);
      return [];
    }
  }

  /**
   * Gracefully close Redis connection
   */
  async close(): Promise<void> {
    if (!this.redis || !this.redisEnabled) {
      this.memoryStore.clear();
      return;
    }

    try {
      await this.redis.quit();
      console.log('[CacheService] Redis connection closed');
    } catch (error) {
      this.handleRedisFailure(error);
      this.redis.disconnect();
    }
  }

  /**
   * Get full cache key with prefix
   */
  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private purgeIfExpired(fullKey: string): void {
    const value = this.memoryStore.get(fullKey);
    if (!value) return;

    if (value.expiresAt !== null && value.expiresAt <= Date.now()) {
      this.memoryStore.delete(fullKey);
    }
  }

  private getFromMemory<T>(fullKey: string): T | null {
    this.purgeIfExpired(fullKey);
    const value = this.memoryStore.get(fullKey);
    if (!value) {
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return JSON.parse(value.value) as T;
  }

  private setInMemory(fullKey: string, serializedValue: string, ttlSeconds: number): void {
    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.memoryStore.set(fullKey, { value: serializedValue, expiresAt });
  }

  private handleRedisFailure(error: unknown): void {
    if (this.redisRequired) {
      console.error('[CacheService] Redis error:', error);
      return;
    }

    if (this.redisEnabled) {
      this.redisEnabled = false;
      this.redis?.disconnect();
      this.redis = null;
    }

    if (!this.fallbackLogged) {
      this.fallbackLogged = true;
      console.warn('[CacheService] Redis unavailable, switched to in-memory cache');
    }
  }
}

// Singleton instance for global use
let cacheInstance: CacheService | null = null;

export function initializeCache(options?: CacheOptions): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService(options);
  }
  return cacheInstance;
}

export function getCache(): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService();
  }
  return cacheInstance;
}
