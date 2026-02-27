import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { config } from '../config';
import { AuthPayload } from '../types';
import { Logger } from '@t3ck/shared';

const logger = new Logger('AuthMiddleware');

export interface AuthRequest extends Request {
  user?: AuthPayload;
  tenantId?: string;
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user payload to request
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      const apiKeyPayload = await verifyApiKey(apiKey);
      if (apiKeyPayload) {
        req.user = apiKeyPayload;
        req.tenantId = apiKeyPayload.tenantId;
        next();
        return;
      }
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const secret = config.jwtPublicKey || config.jwtSecret;
    const decoded = jwt.verify(token, secret, {
      algorithms: ['RS256', 'HS256'],
    }) as AuthPayload;

    // Attach user to request
    req.user = decoded;
    req.tenantId = decoded.tenantId;

    // Log authentication
    logger.info('User authenticated', {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      email: decoded.email,
    });

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token expired',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
      return;
    }

    logger.error('Authentication error', { error: (error as Error).message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
};

/**
 * Optional Authentication Middleware
 * Attaches user if token is valid, but doesn't require it
 */
export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      const apiKeyPayload = await verifyApiKey(apiKey);
      if (apiKeyPayload) {
        req.user = apiKeyPayload;
        req.tenantId = apiKeyPayload.tenantId;
        next();
        return;
      }
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const secret = config.jwtPublicKey || config.jwtSecret;
    const decoded = jwt.verify(token, secret, {
      algorithms: ['RS256', 'HS256'],
    }) as AuthPayload;

    req.user = decoded;
    req.tenantId = decoded.tenantId;

    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
};

async function verifyApiKey(apiKey: string): Promise<AuthPayload | null> {
  try {
    const authService = config.services.find(service => service.prefix === '/api/v1/auth');
    const target = authService?.target || process.env.AUTH_SERVICE_URL || 'http://localhost:3002';

    const response = await axios.post(`${target}/auth/api-keys/verify`, { apiKey });
    if (!response.data?.valid) {
      return null;
    }

    const metadata = response.data.metadata;
    return {
      tenantId: metadata.tenantId,
      userId: metadata.userId,
      email: metadata.userId,
      roles: metadata.scopes || [],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as AuthPayload;
  } catch (error) {
    logger.warn('API key verification failed', { error: (error as Error).message });
    return null;
  }
}

/**
 * Tenant Isolation Middleware
 * Ensures requests only access their own tenant data
 */
export const enforceTenantIsolation = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const tenantIdHeader = req.headers['x-tenant-id'] as string;
  const userTenantId = req.user?.tenantId;

  if (!userTenantId) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No tenant context',
    });
    return;
  }

  // If X-Tenant-ID header is provided, verify it matches user's tenant
  if (tenantIdHeader && tenantIdHeader !== userTenantId) {
    logger.warn('Tenant isolation violation attempt', {
      userId: req.user?.userId,
      userTenantId,
      requestedTenantId: tenantIdHeader,
    });

    res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied to different tenant',
    });
    return;
  }

  // Set tenant ID header for downstream services
  req.headers['x-tenant-id'] = userTenantId;

  next();
};

/**
 * Role-Based Access Control Middleware
 */
export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const userRoles = req.user.roles || [];
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      logger.warn('Insufficient permissions', {
        userId: req.user.userId,
        userRoles,
        requiredRoles: roles,
      });

      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};
