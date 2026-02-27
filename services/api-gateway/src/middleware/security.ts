import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { doubleCsrf } from 'csrf-csrf';
import hpp from 'hpp';
import compression from 'compression';
import { config } from '../config';

/**
 * Helmet.js - Protection against common vulnerabilities
 * - XSS Protection
 * - Clickjacking Protection  
 * - Content Security Policy
 * - HSTS
 * - noSniff
 * - frameGuard
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
});

/**
 * CORS Configuration
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (config.env !== 'production') {
      return callback(null, true);
    }

    if (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Request-ID', 'X-CSRF-Token'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
  maxAge: 86400, // 24 hours
});

/**
 * CSRF Protection using double submit cookie pattern
 */
const {
  generateToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => config.jwtSecret,
  cookieName: config.env === 'production' ? '__Host-csrf-token' : 'csrf-token',
  cookieOptions: {
    sameSite: config.env === 'production' ? 'strict' : 'lax',
    path: '/',
    secure: config.env === 'production',
    httpOnly: true,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

const ensureCookies = (req: Request) => {
  const requestWithCookies = req as Request & { cookies?: Record<string, string> };
  if (!requestWithCookies.cookies) {
    requestWithCookies.cookies = {};
  }
};

export const csrfProtection = config.enableCsrf
  ? (req: Request, res: Response, next: NextFunction) => {
      ensureCookies(req);
      return doubleCsrfProtection(req, res, next);
    }
  : (_req: Request, _res: Response, next: NextFunction) => next();

export const csrfTokenGenerator = (req: Request, res: Response) => {
  ensureCookies(req);
  const token = generateToken(req, res);
  res.json({ csrfToken: token });
};

/**
 * HPP - HTTP Parameter Pollution Protection
 * Prevents duplicate query parameters
 */
export const hppMiddleware: any = hpp();

/**
 * Compression - Gzip/Deflate response compression
 */
export const compressionMiddleware: any = compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
});

/**
 * Security Headers middleware
 */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (formerly Feature Policy)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  next();
};

/**
 * SQL Injection Prevention Notes:
 * - Use parameterized queries in all database operations
 * - Use ORM (Prisma/TypeORM) with proper escaping
 * - Validate all inputs with Zod schemas
 * - Never concatenate user input into SQL queries
 */

/**
 * DDoS Protection Notes:
 * - Rate limiting implemented in rate-limit.ts
 * - Use AWS WAF for production
 * - CloudFront for CDN and DDoS mitigation
 * - Auto-scaling groups to handle traffic spikes
 */
