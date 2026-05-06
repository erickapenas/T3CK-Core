import { Request, Response, Router } from 'express';
import { ZodError, z } from 'zod';
import { AdminSessionUser } from '../types';
import { IntegrationManagementService } from './integration-management-service';
import {
  MarketplaceConnectBodySchema,
  MarketplaceOAuthBodySchema,
  MarketplaceProviderSchema,
  PageSpeedRunBodySchema,
} from './validation';

export type IntegrationRequestContext = {
  tenantId: string;
  user: AdminSessionUser;
};

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string | string[];
};

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value);
}

function requestMeta(req: Request): RequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Dados invalidos',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  const message = (error as Error).message || 'Erro inesperado';
  const normalized = message.toLowerCase();
  const status = normalized.includes('permissao') || normalized.includes('permission')
    ? 403
    : normalized.includes('nao encontrado') || normalized.includes('not found')
      ? 404
      : normalized.includes('duplicado')
        ? 409
        : 400;
  res.status(status).json({ error: message });
}

function hasAnyPermission(user: AdminSessionUser, permissions: string[]): boolean {
  return user.role === 'admin' || permissions.some((permission) => user.permissions?.includes(permission));
}

function assertReadPermission(user: AdminSessionUser): void {
  if (!hasAnyPermission(user, ['visualizar_integracoes', 'gerenciar_integracoes', 'integrations:read', 'integrations:write'])) {
    throw new Error('Permissao obrigatoria: visualizar_integracoes');
  }
}

function assertWritePermission(user: AdminSessionUser): void {
  if (!hasAnyPermission(user, ['gerenciar_integracoes', 'integrations:write'])) {
    throw new Error('Permissao obrigatoria: gerenciar_integracoes');
  }
}

export function createIntegrationManagementRouter(
  getContext: (req: Request, res: Response) => IntegrationRequestContext,
  service = new IntegrationManagementService()
): Router {
  const router = Router();

  router.get('/integrations', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertReadPermission(user);
      res.json({ data: await service.listIntegrations(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/integrations/logs', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertReadPermission(user);
      res.json({ data: await service.listLogs(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/integrations/marketplaces/:provider/status', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertReadPermission(user);
      const { provider } = parse(MarketplaceProviderSchema, req.params);
      res.json({ data: await service.getMarketplaceStatus(tenantId, provider, user) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/integrations/marketplaces/:provider/connect', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWritePermission(user);
      const { provider } = parse(MarketplaceProviderSchema, req.params);
      const body = parse(MarketplaceConnectBodySchema, req.body || {});
      res.json({ data: await service.connectMarketplace(tenantId, user, provider, body, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/integrations/marketplaces/:provider/oauth/callback', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWritePermission(user);
      const { provider } = parse(MarketplaceProviderSchema, req.params);
      const body = parse(MarketplaceOAuthBodySchema, req.body || {});
      res.json({ data: await service.completeOAuth(tenantId, user, provider, body, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/integrations/marketplaces/:provider/disconnect', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWritePermission(user);
      const { provider } = parse(MarketplaceProviderSchema, req.params);
      res.json({ data: await service.disconnectMarketplace(tenantId, user, provider, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/integrations/marketplaces/:provider/refresh-token', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWritePermission(user);
      const { provider } = parse(MarketplaceProviderSchema, req.params);
      res.json({ data: await service.refreshMarketplaceToken(tenantId, user, provider, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/integrations/marketplaces/:provider/test', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWritePermission(user);
      const { provider } = parse(MarketplaceProviderSchema, req.params);
      res.json({ data: await service.testMarketplace(tenantId, user, provider, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/integrations/marketplaces/:provider/import-orders', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWritePermission(user);
      const { provider } = parse(MarketplaceProviderSchema, req.params);
      res.json({ data: await service.importMarketplaceOrders(tenantId, user, provider, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/integrations/pagespeed/reports', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWritePermission(user);
      const body = parse(PageSpeedRunBodySchema, req.body || {});
      res.status(201).json({ data: await service.runPageSpeedReport(tenantId, user, body, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/integrations/pagespeed/reports', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertReadPermission(user);
      res.json({ data: await service.listPageSpeedReports(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/integrations/pagespeed/reports/:reportId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertReadPermission(user);
      res.json({ data: await service.getPageSpeedReport(tenantId, String(req.params.reportId)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
