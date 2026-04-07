import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { RateLimitConfig } from '../types';

const isRateLimitDisabled = () => {
  const explicitDisable = String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';
  return explicitDisable || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
};

const isLocalRequest = (req: Request): boolean => {
  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '');
  const forwardedFor = String(req.headers['x-forwarded-for'] || '');
  const remoteAddress = String(req.ip || req.socket?.remoteAddress || '');

  const localHints = [origin, host, forwardedFor, remoteAddress].join(' ');
  return /localhost|127\.0\.0\.1|::1/i.test(localHints);
};

const shouldSkipRateLimit = (req: Request): boolean => {
  return isRateLimitDisabled() || isLocalRequest(req);
};

/**
 * Global Rate Limiter
 * Applies to all requests if no specific limit is set
 */
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: shouldSkipRateLimit,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: res.getHeader('RateLimit-Reset'),
    });
  },
});

/**
 * Strict Rate Limiter for Authentication Endpoints
 * Prevents brute force attacks
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per window
  skipSuccessfulRequests: true, // Don't count successful logins
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts. Account temporarily locked.',
      retryAfter: res.getHeader('RateLimit-Reset'),
    });
  },
});

/**
 * API Rate Limiter for General Endpoints
 */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'API rate limit exceeded',
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
});

/**
 * Create Custom Rate Limiter
 */
export const createRateLimiter = (options: Partial<RateLimitConfig>) => {
  return rateLimit({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 100,
    message: options.message || 'Rate limit exceeded',
    standardHeaders: options.standardHeaders !== false,
    legacyHeaders: options.legacyHeaders !== false,
    skip: shouldSkipRateLimit,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'Too Many Requests',
        message: options.message || 'Rate limit exceeded',
        retryAfter: res.getHeader('RateLimit-Reset'),
      });
    },
  });
};

/**
 * Tenant-specific Rate Limiter
 * Different limits per tenant tier
 */
export const tenantRateLimit = (req: Request, res: Response, next: any) => {
  const tenantId = req.headers['x-tenant-id'] as string;
  
  if (!tenantId) {
    return next();
  }

  // In production, fetch tenant tier from database
  // For now, use default limits
  const limiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 200, // Higher limit for authenticated tenants
    message: 'Tenant rate limit exceeded',
  });

  return limiter(req, res, next);
};

/**
 * IP-based Rate Limiter with Redis Store (for production)
 * Provides distributed rate limiting across multiple instances
 */
export const createRedisRateLimiter = () => {
  // Check if Redis is available
  if (process.env.REDIS_DISABLED === 'true' || !process.env.REDIS_HOST) {
    console.warn('Redis not available for rate limiting, falling back to memory store');
    return globalRateLimit;
  }

  try {
    // Import dynamically to avoid hard dependency if Redis unavailable
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RedisStore = require('rate-limit-redis');
    const Redis = require('ioredis').default;

    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      reconnectOnError: () => true,
    });

    redis.on('error', (err: Error) => {
      console.error('Redis rate limiter connection error:', err);
    });

    redis.on('connect', () => {
      console.info('Redis rate limiter connected');
    });

    return rateLimit({
      store: new RedisStore({
        client: redis,
        prefix: 'rl:ip:', // Rate limit per IP
        expiry: 60, // 60 seconds (1 minute window)
        skipFailedRequests: true, // Don't count failed requests
        skipSuccessfulRequests: false, // Count all responses
      }),
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute per IP
      message: 'Too many requests from this IP, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
      skip: shouldSkipRateLimit,
      handler: (_req: Request, res: Response) => {
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: res.getHeader('RateLimit-Reset'),
        });
      },
    });
  } catch (error) {
    console.error('Failed to create Redis rate limiter:', error);
    return globalRateLimit;
  }
};

/**
 * Tenant-specific Rate Limiter with Redis Store
 * Different limits per tenant tier
 */
export const createTenantRedisRateLimiter = (tierName: string = 'standard') => {
  if (process.env.REDIS_DISABLED === 'true' || !process.env.REDIS_HOST) {
    return tenantRateLimit;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RedisStore = require('rate-limit-redis');
    const Redis = require('ioredis').default;

    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      reconnectOnError: () => true,
    });

    // Tier-based limits
    const tierLimits: Record<string, {max: number; windowMs: number}> = {
      free: { max: 50, windowMs: 60 * 1000 }, // 50 req/min
      standard: { max: 200, windowMs: 60 * 1000 }, // 200 req/min
      premium: { max: 500, windowMs: 60 * 1000 }, // 500 req/min
      enterprise: { max: 0, windowMs: 60 * 1000 }, // Unlimited
    };

    const limits = tierLimits[tierName] || tierLimits.standard;

    // Return unlimited limiter for enterprise tier
    if (limits.max === 0) {
      return (_req: Request, _res: Response, next: any) => next();
    }

    return rateLimit({
      store: new RedisStore({
        client: redis,
        prefix: `rl:tenant:${tierName}:`,
        expiry: Math.floor(limits.windowMs / 1000),
        skipFailedRequests: true,
        skipSuccessfulRequests: false,
      }),
      windowMs: limits.windowMs,
      max: limits.max,
      message: `Rate limit exceeded for ${tierName} tier`,
      standardHeaders: true,
      legacyHeaders: false,
      skip: shouldSkipRateLimit,
      handler: (_req: Request, res: Response) => {
        res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded for ${tierName} tier plan`,
          retryAfter: res.getHeader('RateLimit-Reset'),
        });
      },
    });
  } catch (error) {
    console.error('Failed to create tenant Redis rate limiter:', error);
    return tenantRateLimit;
  }
};
