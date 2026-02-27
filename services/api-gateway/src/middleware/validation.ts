import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { Logger } from '@t3ck/shared';

const logger = new Logger('ValidationMiddleware');

/**
 * Generic Input Validation Middleware
 * Validates request body, query, and params against Zod schema
 */
export const validate = (schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate body
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }

      // Validate query parameters
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }

      // Validate URL parameters
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Validation failed', {
          errors: error.errors,
        requestId: req.headers['x-request-id'] as string,
          error: 'Validation Error',
          message: 'Invalid input data',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
        return;
      }

      logger.error('Validation middleware error', { error: (error as Error).message });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Validation failed',
      });
    }
  };
};

/**
 * Common Validation Schemas
 */
export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid(),
  
  // Tenant ID validation
  tenantId: z.string().min(3).max(100),
  
  // Pagination
  pagination: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
  
  // Date range
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
};

/**
 * Sanitize Input Middleware
 * Removes potentially dangerous characters
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * Recursively sanitize object
 */
function sanitizeObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  return obj;
}

/**
 * Sanitize string to prevent XSS and SQL injection
 */
function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/'/g, "''") // Escape single quotes (SQL)
    .replace(/"/g, '&quot;') // Escape double quotes
    .replace(/`/g, '&#96;') // Escape backticks
    .trim();
}

/**
 * Content-Type Validation
 * Ensures request has correct Content-Type
 */
export const requireContentType = (contentType: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestContentType = req.headers['content-type'];

    if (!requestContentType || !requestContentType.includes(contentType)) {
      res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Expected Content-Type: ${contentType}`,
      });
      return;
    }

    next();
  };
};

/**
 * JSON Body Parser Validation
 * Catches JSON parsing errors
 */
export const validateJsonBody = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn('Invalid JSON body', {
      error: err.message,
      requestId: req.headers['x-request-id'] as string,
    });

    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON in request body',
    });
    return;
  }

  next(err);
};

/**
 * SQL Injection Prevention
 * Detects common SQL injection patterns
 */
export const detectSqlInjection = (req: Request, res: Response, next: NextFunction) => {
  const sqlInjectionPatterns = [
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bDROP\b.*\bTABLE\b)/i,
    /(\bINSERT\b.*\bINTO\b)/i,
    /(\bDELETE\b.*\bFROM\b)/i,
    /(\bUPDATE\b.*\bSET\b)/i,
    /(--)/,
    /(;)/,
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlInjectionPatterns.some(pattern => pattern.test(value));
    }
    if (Array.isArray(value)) {
      return value.some(item => checkValue(item));
    }
    if (value !== null && typeof value === 'object') {
      return Object.values(value).some(val => checkValue(val));
    }
    return false;
  };

  // Check query parameters
  if (checkValue(req.query)) {
    logger.warn('SQL injection attempt detected in query', {
      query: req.query,
      requestId: req.headers['x-request-id'] as string,
      ip: req.ip,
    });

    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid input detected',
    });
    return;
  }

  // Check body
  if (checkValue(req.body)) {
    logger.warn('SQL injection attempt detected in body', {
      requestId: req.headers['x-request-id'] as string,
      ip: req.ip,
    });

    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid input detected',
    });
    return;
  }

  next();
};
