import { AppError } from '../errors';
import { UserContext } from '../types';

type Permission = 'integrations:read' | 'integrations:write' | 'pagespeed:run';

const DEFAULT_READ_ROLES = [
  'owner',
  'admin',
  'manager',
  'integration_manager',
  'user',
  'usuario',
  'customer',
];
const DEFAULT_WRITE_ROLES = [
  'owner',
  'admin',
  'manager',
  'integration_manager',
  'user',
  'usuario',
  'customer',
];
const DEFAULT_PAGESPEED_ROLES = [
  'owner',
  'admin',
  'manager',
  'integration_manager',
  'user',
  'usuario',
  'customer',
];

function envRoles(name: string, fallback: string[]): string[] {
  return (process.env[name] || fallback.join(','))
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
}

function allowedRolesFor(permission: Permission): string[] {
  if (permission === 'integrations:read') {
    return envRoles('USER_DASHBOARD_INTEGRATION_READ_ROLES', DEFAULT_READ_ROLES);
  }
  if (permission === 'pagespeed:run') {
    return envRoles('USER_DASHBOARD_PAGESPEED_RUN_ROLES', DEFAULT_PAGESPEED_ROLES);
  }
  return envRoles('USER_DASHBOARD_INTEGRATION_WRITE_ROLES', DEFAULT_WRITE_ROLES);
}

export function requireIntegrationPermission(context: UserContext, permission: Permission): void {
  const allowedRoles = allowedRolesFor(permission);
  const hasRole = context.roles.some((role) => allowedRoles.includes(role));
  const hasScope = context.roles.includes(permission);

  if (!hasRole && !hasScope) {
    throw new AppError(403, 'Insufficient integration permission');
  }
}
