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
 * Note: Requires Redis connection for distributed rate limiting
 */
export const createRedisRateLimiter = () => {
  // TODO: Implement Redis store for distributed rate limiting
  // import RedisStore from 'rate-limit-redis';
  // import Redis from 'ioredis';
  
  // const redis = new Redis(process.env.REDIS_URL);
  
  // return rateLimit({
  //   store: new RedisStore({
  //     client: redis,
  //     prefix: 'rl:',
  //   }),
  //   windowMs: 60 * 1000,
  //   max: 100,
  // });
  
  return globalRateLimit;
};
