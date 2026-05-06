import Redis from 'ioredis';
import { Logger } from '@t3ck/shared';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export class RateLimiter {
  private redis: Redis;
  private logger: Logger;

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.logger = new Logger('rate-limiter');
  }

  async checkLimit(
    identifier: string,
    config: RateLimitConfig
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // Remove expired entries
      await this.redis.zremrangebyscore(key, 0, windowStart);

      // Count requests in current window
      const count = await this.redis.zcard(key);

      if (count >= config.maxRequests) {
        const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        const resetAt =
          oldest.length > 0 ? parseInt(oldest[1], 10) + config.windowMs : now + config.windowMs;

        return {
          allowed: false,
          remaining: 0,
          resetAt,
        };
      }

      // Add current request
      await this.redis.zadd(key, now, `${now}-${Math.random()}`);
      await this.redis.expire(key, Math.ceil(config.windowMs / 1000));

      return {
        allowed: true,
        remaining: config.maxRequests - count - 1,
        resetAt: now + config.windowMs,
      };
    } catch (error) {
      this.logger.error('Rate limit check failed', { error, identifier });
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: now + config.windowMs,
      };
    }
  }

  async checkTenantLimit(tenantId: string, maxRequests: number = 1000): Promise<boolean> {
    const config: RateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests,
      keyPrefix: 'rate_limit:tenant',
    };

    const result = await this.checkLimit(tenantId, config);
    return result.allowed;
  }

  async checkUserLimit(userId: string, maxRequests: number = 100): Promise<boolean> {
    const config: RateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests,
      keyPrefix: 'rate_limit:user',
    };

    const result = await this.checkLimit(userId, config);
    return result.allowed;
  }

  async checkIPLimit(ip: string, maxRequests: number = 200): Promise<boolean> {
    const config: RateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests,
      keyPrefix: 'rate_limit:ip',
    };

    const result = await this.checkLimit(ip, config);
    return result.allowed;
  }
}
