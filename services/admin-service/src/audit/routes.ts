import { Request, Response, Router } from 'express';
import { ZodError } from 'zod';
import { AdminSessionUser } from '../types';
import { AuditLogService } from './audit-log-service';
import {
  AuditAlertRuleSchema,
  AuditExportSchema,
  AuditLogQuerySchema,
  AuditRetentionPolicySchema,
} from './validation';

export type AuditRequestContext = {
  tenantId: string;
  user: AdminSessionUser;
};

function parseQuery(query: unknown) {
  return AuditLogQuerySchema.parse(query);
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Filtro invalido',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  const message = (error as Error).message || 'Erro inesperado';
  const normalized = message.toLowerCase();
  const status = normalized.includes('permissao') || normalized.includes('permission')
    ? 403
    : normalized.includes('nao encontrado') || normalized.includes('not found')
      ? 404
      : 400;
  res.status(status).json({ error: message });
}

function hasPermission(user: AdminSessionUser, permission: string): boolean {
  return user.role === 'admin' || Boolean(user.permissions?.includes(permission));
}

function assertPermission(user: AdminSessionUser, permission: string): void {
  if (!hasPermission(user, permission)) {
    throw new Error(`Permissao obrigatoria: ${permission}`);
  }
}

function requestMeta(req: Request) {
  return {
    requestId: String(req.headers['x-request-id'] || ''),
    correlationId: String(req.headers['x-correlation-id'] || req.headers['x-request-id'] || ''),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    httpMethod: req.method,
    endpoint: req.originalUrl,
    origin: 'web',
  };
}

export function createAuditRouter(
  getContext: (req: Request, res: Response) => AuditRequestContext,
  service = new AuditLogService()
): Router {
  const router = Router();

  router.get('/audit-logs/security', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_seguranca');
      const data = await service.listLogs(tenantId, {
        ...parseQuery(req.query),
        isSecurityEvent: true,
      });
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-logs/exports', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_exportacao');
      const filters = parseQuery(req.query);
      const data = req.query.kind === 'files'
        ? await service.listExports(tenantId, filters)
        : await service.listLogs(tenantId, { ...filters, isExportEvent: true });
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-logs/stats', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_auditoria');
      res.json({ data: await service.stats(tenantId, parseQuery(req.query)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-logs/resource/:resourceType/:resourceId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_auditoria');
      res.json({
        data: await service.resourceTimeline(
          tenantId,
          req.params.resourceType,
          req.params.resourceId,
          parseQuery(req.query)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-logs/actor/:actorId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      if (req.params.actorId !== user.id) {
        assertPermission(user, 'visualizar_logs_outros_usuarios');
      } else {
        assertPermission(user, 'visualizar_logs_auditoria');
      }
      res.json({ data: await service.actorTimeline(tenantId, req.params.actorId, parseQuery(req.query)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/audit-logs/export', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'exportar_logs_auditoria');
      const body = AuditExportSchema.parse(req.body || {});
      const data = await service.exportLogs(tenantId, body.filters, body.format, user, requestMeta(req));
      res.status(201).json({ data: { ...data, content: undefined } });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-logs/exports/:exportId/download', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'exportar_logs_auditoria');
      const data = await service.getExport(tenantId, req.params.exportId);
      res.setHeader('Content-Type', data.file_format === 'json' ? 'application/json' : 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${data.id}.${data.file_format}"`);
      res.send(data.content || '');
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-logs/exports/:exportId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_exportacao');
      const data = await service.getExport(tenantId, req.params.exportId);
      res.json({ data: { ...data, content: undefined } });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/audit-logs/integrity-check', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'executar_verificacao_integridade_logs');
      const data = await service.runIntegrityCheck(tenantId, AuditLogQuerySchema.partial().parse(req.body || {}));
      res.status(201).json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-logs/integrity-checks', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'executar_verificacao_integridade_logs');
      res.json({ data: await service.listIntegrityChecks(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-logs/:logId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_detalhes_log');
      const data = await service.getLog(tenantId, req.params.logId);
      if (data.is_sensitive) {
        assertPermission(user, 'visualizar_logs_sensiveis');
      }
      await service.record({
        tenantId,
        actor: user,
        category: 'security',
        action: 'security.audit_log.viewed',
        operation: 'view',
        severity: data.is_sensitive ? 'notice' : 'info',
        outcome: 'success',
        module: 'audit',
        description: `Log de auditoria visualizado: ${data.action}`,
        resource: { type: 'audit_log', id: data.id, label: data.action },
        sensitive: data.is_sensitive,
        securityEvent: true,
        ...requestMeta(req),
      });
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-logs', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_auditoria');
      const data = await service.listLogs(tenantId, parseQuery(req.query));
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-alerts', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_auditoria');
      res.json({ data: await service.listAlerts(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/audit-alerts/:alertId/read', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_auditoria');
      res.json({ data: await service.updateAlertStatus(tenantId, req.params.alertId, 'visto') });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/audit-alerts/:alertId/resolve', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_auditoria');
      res.json({ data: await service.updateAlertStatus(tenantId, req.params.alertId, 'resolvido') });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/audit-alert-rules', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_regras_alerta_auditoria');
      const body = AuditAlertRuleSchema.parse(req.body || {});
      res.status(201).json({ data: await service.upsertAlertRule(tenantId, undefined, body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/audit-alert-rules/:ruleId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_regras_alerta_auditoria');
      const body = AuditAlertRuleSchema.partial().parse(req.body || {});
      res.json({ data: await service.upsertAlertRule(tenantId, req.params.ruleId, body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/audit-retention-policy', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_auditoria');
      res.json({ data: await service.getRetentionPolicy(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/audit-retention-policy', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_retencao_auditoria');
      const body = AuditRetentionPolicySchema.parse(req.body || {});
      res.json({ data: await service.updateRetentionPolicy(tenantId, body.policies) });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
