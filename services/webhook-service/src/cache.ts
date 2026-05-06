import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds (default: 3600 = 1 hour)
  prefix?: string; // Key prefix
}

export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 hour
  private prefix: string = 'cache:';
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(options?: CacheOptions) {
    // Initialize Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    if (options?.ttl) {
      this.defaultTTL = options.ttl;
    }
    if (options?.prefix) {
      this.prefix = options.prefix;
    }

    this.redis.on('error', (err) => {
      console.error('[CacheService] Redis error:', err);
    });

    this.redis.on('connect', () => {
      console.log('[CacheService] Connected to Redis');
    });

    this.redis.on('disconnect', () => {
      console.log('[CacheService] Disconnected from Redis');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(this.getKey(key));
      if (value) {
        this.hitCount++;
        return JSON.parse(value) as T;
      }
      this.missCount++;
      return null;
    } catch (error) {
      console.error(`[CacheService] Get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const expiry = ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);
      await this.redis.setex(this.getKey(key), expiry, serialized);
    } catch (error) {
      console.error(`[CacheService] Set error for key ${key}:`, error);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.getKey(key));
    } catch (error) {
      console.error(`[CacheService] Delete error for key ${key}:`, error);
    }
  }

  /**
   * Delete multiple keys from cache
   */
  async deleteMany(keys: string[]): Promise<void> {
    try {
      const prefixedKeys = keys.map((key) => this.getKey(key));
      if (prefixedKeys.length > 0) {
        await this.redis.del(...prefixedKeys);
      }
    } catch (error) {
      console.error('[CacheService] DeleteMany error:', error);
    }
  }

  /**
   * Clear all cache keys with current prefix
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('[CacheService] Clear error:', error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(this.getKey(key));
      return result > 0;
    } catch (error) {
      console.error(`[CacheService] Exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set value (cache-aside pattern)
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
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
    try {
      return await this.redis.incrby(this.getKey(key), amount);
    } catch (error) {
      console.error(`[CacheService] Increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Decrement value (for counters)
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.decrby(this.getKey(key), amount);
    } catch (error) {
      console.error(`[CacheService] Decrement error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Set expiry on existing key
   */
  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.redis.expire(this.getKey(key), seconds);
    } catch (error) {
      console.error(`[CacheService] Expire error for key ${key}:`, error);
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
      console.error('[CacheService] GetSize error:', error);
      return 0;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string = '*'): Promise<string[]> {
    try {
      return await this.redis.keys(`${this.prefix}${pattern}`);
    } catch (error) {
      console.error('[CacheService] Keys error:', error);
      return [];
    }
  }

  /**
   * Gracefully close Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
      console.log('[CacheService] Redis connection closed');
    } catch (error) {
      console.error('[CacheService] Close error:', error);
      await this.redis.disconnect();
    }
  }

  /**
   * Get full cache key with prefix
   */
  private getKey(key: string): string {
    return `${this.prefix}${key}`;
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
