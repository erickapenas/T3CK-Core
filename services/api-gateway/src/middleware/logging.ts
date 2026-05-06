import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { Logger } from '@t3ck/shared';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('APIGateway');

/**
 * Request ID Middleware
 * Generates unique ID for each request for tracing
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

/**
 * Request Logger Middleware
 * Logs all incoming requests with details
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'];

  // Log request start
  logger.info('Incoming request', {
    requestId: requestId as string,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    tenantId: req.headers['x-tenant-id'] as string,
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    const logData = {
      requestId: requestId as string,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.getHeader('content-length') as string,
    };

    if (res.statusCode >= 500) {
      logger.error('Request failed', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
};

/**
 * Morgan HTTP Logger
 * Detailed HTTP request logging
 */
export const morganLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: {
      write: (message: string) => {
        logger.info(message.trim());
      },
    },
  }
);

/**
 * Error Logger Middleware
 */
export const errorLogger = (err: Error, req: Request, _res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.headers['x-request-id'] as string,
    method: req.method,
    url: req.url,
    body: req.body,
  });

  next(err);
};

/**
 * Performance Monitoring Middleware
 */
export const performanceMonitor = (req: Request, res: Response, next: NextFunction) => {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1e6; // Convert to milliseconds

    // Track slow requests
    if (duration > 1000) {
      // > 1 second
      logger.warn('Slow request detected', {
        method: req.method,
        url: req.url,
        duration: `${duration.toFixed(2)}ms`,
        requestId: req.headers['x-request-id'] as string,
      });
    }
  });

  next();
};

/**
 * Request Body Logger (for debugging)
 * Should be disabled in production for sensitive data
 */
export const bodyLogger = (req: Request, _res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development' && req.body) {
    logger.debug('Request body', {
      requestId: req.headers['x-request-id'] as string,
      body: req.body,
    });
  }
  next();
};
