import { Request, Response } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Logger } from './logger';

const logger = new Logger('rate-limiter');

// Shared Redis client for rate limiting
let redisClient: Redis | null = null;

export function initializeRedisClient(): Redis {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  try {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      logger.info('Rate limiter Redis client connected');
    });

    redisClient.on('error', (err: Error) => {
      logger.error('Rate limiter Redis client error', { error: err.message });
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize rate limiter Redis client', { error });
    throw error;
  }
}

export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * Create a Redis-backed rate limiter with customizable options
 * @param windowMs - Time window in milliseconds (default: 15 minutes)
 * @param max - Maximum requests per window (default: 100)
 * @param keyGenerator - Custom key generator function
 * @param skip - Condition to skip rate limiting
 */
export function createRateLimiter(options?: {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request, res: Response) => string;
  skip?: (req: Request, res: Response) => boolean;
  message?: string;
  statusCode?: number;
}): RateLimitRequestHandler {
  const redis = initializeRedisClient();

  const windowMs = options?.windowMs ?? 15 * 60 * 1000; // 15 minutes default
  const max = options?.max ?? 100; // 100 requests per window default
  const message = options?.message ?? 'Too many requests, please try again later.';
  const statusCode = options?.statusCode ?? 429;

  return rateLimit({
    store: new RedisStore({
      client: redis as any,
      prefix: 'rl:',
    } as any),
    windowMs,
    max,
    message,
    statusCode,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: options?.skip || (() => false),
    keyGenerator: options?.keyGenerator || ((req: Request) => {
      return req.ip || req.socket.remoteAddress || 'unknown';
    }),
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      const resetTime = (req as any).rateLimit?.resetTime;
      res.status(statusCode).json({
        error: message,
        retryAfter: resetTime,
      });
    },
  });
}

// Lazy-loaded rate limiters
let _apiLimiter: RateLimitRequestHandler | null = null;
let _authLimiter: RateLimitRequestHandler | null = null;
let _webhookLimiter: RateLimitRequestHandler | null = null;

/**
 * API-wide rate limiter (default: 100 requests per 15 minutes per IP)
 */
export function getApiLimiter(): RateLimitRequestHandler {
  if (!_apiLimiter) {
    _apiLimiter = createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      message: 'Too many API requests from this IP, please try again later.',
    });
  }
  return _apiLimiter;
}

/**
 * Strict rate limiter for auth endpoints (default: 5 requests per 15 minutes per IP)
 */
export function getAuthLimiter(): RateLimitRequestHandler {
  if (!_authLimiter) {
    _authLimiter = createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
      message: 'Too many login attempts, please try again after 15 minutes.',
    });
  }
  return _authLimiter;
}

/**
 * Webhook rate limiter (default: 1000 requests per hour per IP)
 */
export function getWebhookLimiter(): RateLimitRequestHandler {
  if (!_webhookLimiter) {
    _webhookLimiter = createRateLimiter({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 1000,
      message: 'Webhook rate limit exceeded, please try again later.',
    });
  }
  return _webhookLimiter;
}

/**
 * Provisioning rate limiter (default: 10 requests per hour per tenant)
 */
export function createTenantAwareRateLimiter(maxPerHour: number = 10): RateLimitRequestHandler {
  return createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: maxPerHour,
    message: 'Too many provisioning requests, please try again after 1 hour.',
    keyGenerator: (req: Request) => {
      // Use tenant ID from header or IP fallback
      const tenantId = req.headers['x-tenant-id'] as string;
      return tenantId || req.ip || 'unknown';
    },
  });
}

/**
 * Close rate limiter Redis connection
 */
export async function closeRateLimiter(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      redisClient = null;
      logger.info('Rate limiter Redis client closed');
    } catch (error) {
      logger.error('Error closing rate limiter Redis client', { error });
    }
  }
}
