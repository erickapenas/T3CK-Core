import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { UserContext } from './types';

export type UserDashboardRequest = Request & { userContext?: UserContext };

const isProduction = process.env.NODE_ENV === 'production';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidInternalServiceToken(req: Request): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    return !isProduction;
  }

  const received = String(req.headers['x-internal-service-token'] || '');
  return safeEqual(received, expected);
}

function getAllowedRoles(): string[] {
  return (process.env.USER_DASHBOARD_ALLOWED_ROLES || 'admin,user,usuario,customer')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
}

export function requireGatewayContext(req: Request, res: Response, next: NextFunction): void {
  if (isProduction && !hasValidInternalServiceToken(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const tenantId = String(req.headers['x-tenant-id'] || '');
  const userId = String(req.headers['x-user-id'] || '');
  const email = String(req.headers['x-user-email'] || '');
  const roles = String(req.headers['x-user-roles'] || '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);

  if (!tenantId || !userId) {
    res.status(401).json({ error: 'Missing authenticated tenant/user context' });
    return;
  }

  const allowedRoles = getAllowedRoles();
  const hasAllowedRole = roles.some((role) => allowedRoles.includes(role));
  if (!hasAllowedRole) {
    res.status(403).json({ error: 'User dashboard access denied' });
    return;
  }

  (req as UserDashboardRequest).userContext = {
    tenantId,
    userId,
    email,
    roles,
  };

  if (req.body && typeof req.body === 'object') {
    delete (req.body as Record<string, unknown>).tenantId;
  }
  if (req.query && typeof req.query === 'object') {
    delete (req.query as Record<string, unknown>).tenantId;
  }

  next();
}
