import { Request, Response } from 'express';
import { AdminSessionUser } from '../types';
import { AuditLogService } from './audit-log-service';
import { AuditCategory, AuditOperation, AuditSeverity } from './types';

type ContextResolver = (req: Request, res: Response) => { tenantId?: string; user?: AdminSessionUser | null };

function randomTraceId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function inferCategory(path: string): AuditCategory {
  if (path.includes('/auth') || path.includes('/audit')) return 'security';
  if (path.includes('/users')) return 'users';
  if (path.includes('/tenants') || path.includes('/tenant-config')) return 'tenants';
  if (path.includes('/customers')) return 'customers';
  if (path.includes('/products')) return 'products';
  if (path.includes('/orders')) return 'orders';
  if (path.includes('/payments')) return 'payments';
  if (path.includes('/fiscal') || path.includes('/invoice')) return 'fiscal';
  if (path.includes('/integrations')) return 'integrations';
  if (path.includes('/theme') || path.includes('/dashboard-layout')) return 'themes';
  if (path.includes('/analytics') || path.includes('/report') || path.includes('/export')) return 'reports';
  return 'system';
}

function inferOperation(method: string, path: string): AuditOperation {
  if (path.includes('/export') || path.includes('/download')) return 'export';
  if (method === 'POST') return 'create';
  if (method === 'PUT' || method === 'PATCH') return 'update';
  if (method === 'DELETE') return 'delete';
  return 'view';
}

function shouldAudit(req: Request, statusCode: number): boolean {
  const path = req.originalUrl || req.path;
  const method = req.method.toUpperCase();
  if (path === '/health' || path === '/') return false;
  if (statusCode === 401 || statusCode === 403 || statusCode >= 500) return true;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;
  return /export|download|xml|pdf|danfe|audit-logs|sensitive|fiscal-settings|users|theme|dashboard-layout/i.test(path);
}

function severityFor(statusCode: number, path: string): AuditSeverity {
  if (statusCode === 401 || statusCode === 403) return 'critical';
  if (statusCode >= 500) return 'error';
  if (/export|permission|role|fiscal|certificate|certificado/i.test(path)) return 'notice';
  return 'info';
}

export function createAuditCaptureMiddleware(
  service: AuditLogService,
  resolveContext: ContextResolver
) {
  return (req: Request, res: Response, next: () => void): void => {
    const requestId = String(req.headers['x-request-id'] || randomTraceId('req'));
    const correlationId = String(req.headers['x-correlation-id'] || requestId);
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Correlation-ID', correlationId);

    res.on('finish', () => {
      if (!shouldAudit(req, res.statusCode)) return;
      const context = resolveContext(req, res);
      const tenantId = context.tenantId || String(req.headers['x-tenant-id'] || req.query.tenantId || '');
      if (!tenantId) return;
      const user = context.user;
      const path = req.originalUrl || req.path;
      const denied = res.statusCode === 401 || res.statusCode === 403;
      const failure = denied || res.statusCode >= 400;

      service
        .record({
          tenantId,
          actor: user || { id: 'anonymous', username: 'anonymous', type: 'user' },
          category: inferCategory(path),
          action: denied ? 'security.access.denied' : `http.${inferCategory(path)}.${inferOperation(req.method, path)}`,
          operation: inferOperation(req.method, path),
          severity: severityFor(res.statusCode, path),
          outcome: denied ? 'denied' : failure ? 'failure' : 'success',
          module: inferCategory(path),
          description: denied
            ? 'Tentativa de acesso negado registrada pelo middleware de auditoria.'
            : `Requisicao auditavel ${req.method} ${path}`,
          metadata: {
            responseTimeMs: Number(res.getHeader('X-Response-Time') || 0),
          },
          requestId,
          correlationId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          httpMethod: req.method,
          endpoint: path,
          statusCode: res.statusCode,
          origin: 'web',
          securityEvent: denied || path.includes('/audit'),
          exportEvent: /export|download/i.test(path),
          sensitive: /sensitive|xml|pdf|danfe|customers|audit/i.test(path),
        })
        .catch(() => {
          // Auditing must never break the user request.
        });
    });

    next();
  };
}
