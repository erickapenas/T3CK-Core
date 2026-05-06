import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { createHmac } from 'crypto';
import { config } from '../config';
import { AuthPayload } from '../types';
import { Logger } from '@t3ck/shared';

const logger = new Logger('AuthMiddleware');

const getAllowedJwtAlgorithms = (): Array<'RS256' | 'HS256'> => {
  if (config.env === 'production') {
    if (!config.jwtPublicKey) {
      throw new Error('JWT_PUBLIC_KEY is required in production');
    }
    return ['RS256'];
  }

  return config.jwtPublicKey ? ['RS256'] : ['HS256'];
};

const getJwtVerificationSecret = (): string => {
  if (config.env === 'production') {
    if (!config.jwtPublicKey) {
      throw new Error('JWT_PUBLIC_KEY is required in production');
    }
    return config.jwtPublicKey;
  }

  return config.jwtPublicKey || config.jwtSecret;
};

type AdminSessionToken = {
  user?: {
    id?: string;
    tenantId?: string;
    username?: string;
    email?: string;
    role?: string;
  };
  expiresAt?: number;
};

const getAdminSessionSecret = (): string =>
  process.env.ADMIN_SESSION_SECRET || process.env.JWT_SECRET || 'dev-admin-session-secret';

const verifyAdminSessionToken = (token: string): AuthPayload | null => {
  const [payload, signature] = token.split('.');
  if (!payload || !signature || token.split('.').length !== 2) {
    return null;
  }

  const expected = createHmac('sha256', getAdminSessionSecret()).update(payload).digest('base64url');
  if (expected !== signature) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AdminSessionToken;
    if (!session.user || !session.expiresAt || session.expiresAt < Date.now()) {
      return null;
    }

    return {
      tenantId: session.user.tenantId || '',
      userId: session.user.id || session.user.username || '',
      email: session.user.email || session.user.username || '',
      roles: [session.user.role || 'usuario'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(session.expiresAt / 1000),
    };
  } catch {
    return null;
  }
};

const userHasGlobalTenantAccess = (user?: AuthPayload): boolean =>
  Boolean(user?.roles?.some((role) => ['admin', 'owner', 'manager'].includes(role)));

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
    const adminSession = verifyAdminSessionToken(token);
    if (adminSession) {
      req.user = adminSession;
      req.tenantId = adminSession.tenantId;

      logger.info('Admin session authenticated', {
        userId: adminSession.userId,
        tenantId: adminSession.tenantId,
        roles: adminSession.roles,
      });

      next();
      return;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, getJwtVerificationSecret(), {
      algorithms: getAllowedJwtAlgorithms(),
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
    const decoded = jwt.verify(token, getJwtVerificationSecret(), {
      algorithms: getAllowedJwtAlgorithms(),
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
    const authService = config.services.find((service) => service.prefix === '/api/v1/auth');
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
  const requestWithBody = req as AuthRequest & {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };

  if (!userTenantId) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No tenant context',
    });
    return;
  }

  const bodyTenantId =
    requestWithBody.body && typeof requestWithBody.body.tenantId === 'string'
      ? requestWithBody.body.tenantId
      : undefined;
  const queryTenantId =
    requestWithBody.query && typeof requestWithBody.query.tenantId === 'string'
      ? requestWithBody.query.tenantId
      : undefined;
  const requestedTenantId = tenantIdHeader || bodyTenantId || queryTenantId;
  const canSelectTenant = userHasGlobalTenantAccess(req.user);

  if (requestedTenantId && requestedTenantId !== userTenantId && !canSelectTenant) {
    logger.warn('Tenant isolation violation attempt', {
      userId: req.user?.userId,
      userTenantId,
      requestedTenantId,
    });

    res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied to different tenant',
    });
    return;
  }

  const effectiveTenantId = canSelectTenant && requestedTenantId ? requestedTenantId : userTenantId;

  req.headers['x-tenant-id'] = effectiveTenantId;
  req.tenantId = effectiveTenantId;
  if (requestWithBody.body && typeof requestWithBody.body === 'object') {
    requestWithBody.body.tenantId = effectiveTenantId;
  }
  if (requestWithBody.query && typeof requestWithBody.query === 'object') {
    requestWithBody.query.tenantId = effectiveTenantId;
  }

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
    const hasRole = roles.some((role) => userRoles.includes(role));

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
