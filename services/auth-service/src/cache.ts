import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds (default: 3600 = 1 hour)
  prefix?: string; // Key prefix
}

export class CacheService {
  private redis: Redis | null = null;
  private defaultTTL: number = 3600; // 1 hour
  private prefix: string = 'cache:';
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(options?: CacheOptions) {
    if (process.env.REDIS_DISABLED === 'true') {
      throw new Error('Redis is required for auth cache persistence');
    }

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    this.redis.on('error', (err) => {
      console.error('[CacheService] Redis error:', err);
    });

    this.redis.on('connect', () => {
      console.log('[CacheService] Connected to Redis');
    });

    this.redis.on('disconnect', () => {
      console.log('[CacheService] Disconnected from Redis');
    });

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

    try {
      const value = await this.requireRedis().get(fullKey);
      if (value) {
        this.hitCount++;
        return JSON.parse(value) as T;
      }
      this.missCount++;
      return null;
    } catch (error) {
      throw this.redisOperationError('get', error);
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const expiry = ttl || this.defaultTTL;
    const serialized = JSON.stringify(value);

    try {
      await this.requireRedis().setex(fullKey, expiry, serialized);
    } catch (error) {
      throw this.redisOperationError('set', error);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);

    try {
      await this.requireRedis().del(fullKey);
    } catch (error) {
      throw this.redisOperationError('delete', error);
    }
  }

  /**
   * Delete multiple keys from cache
   */
  async deleteMany(keys: string[]): Promise<void> {
    const prefixedKeys = keys.map((key) => this.getKey(key));

    try {
      if (prefixedKeys.length > 0) {
        await this.requireRedis().del(...prefixedKeys);
      }
    } catch (error) {
      throw this.redisOperationError('deleteMany', error);
    }
  }

  /**
   * Clear all cache keys with current prefix
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.requireRedis().keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.requireRedis().del(...keys);
      }
    } catch (error) {
      throw this.redisOperationError('clear', error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);

    try {
      const result = await this.requireRedis().exists(fullKey);
      return result > 0;
    } catch (error) {
      throw this.redisOperationError('exists', error);
    }
  }

  /**
   * Get or set value (cache-aside pattern)
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Increment value (for counters)
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    const fullKey = this.getKey(key);

    try {
      return await this.requireRedis().incrby(fullKey, amount);
    } catch (error) {
      throw this.redisOperationError('increment', error);
    }
  }

  /**
   * Decrement value (for counters)
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    const fullKey = this.getKey(key);

    try {
      return await this.requireRedis().decrby(fullKey, amount);
    } catch (error) {
      throw this.redisOperationError('decrement', error);
    }
  }

  /**
   * Set expiry on existing key
   */
  async expire(key: string, seconds: number): Promise<void> {
    const fullKey = this.getKey(key);

    try {
      await this.requireRedis().expire(fullKey, seconds);
    } catch (error) {
      throw this.redisOperationError('expire', error);
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
    try {
      const info = await this.requireRedis().info('memory');
      const lines = info.split('\r\n');
      for (const line of lines) {
        if (line.startsWith('used_memory:')) {
          const bytes = parseInt(line.split(':')[1]);
          return bytes;
        }
      }
      return 0;
    } catch (error) {
      throw this.redisOperationError('getSize', error);
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string = '*'): Promise<string[]> {
    try {
      return await this.requireRedis().keys(`${this.prefix}${pattern}`);
    } catch (error) {
      throw this.redisOperationError('keys', error);
    }
  }

  /**
   * Gracefully close Redis connection
   */
  async close(): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.quit();
      console.log('[CacheService] Redis connection closed');
    } catch (error) {
      this.redis.disconnect();
      throw this.redisOperationError('close', error);
    }
  }

  /**
   * Get full cache key with prefix
   */
  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private requireRedis(): Redis {
    if (!this.redis) {
      throw new Error('Redis is required for cache operations');
    }

    return this.redis;
  }

  private redisOperationError(operation: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`Redis ${operation} failed: ${message}`);
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
