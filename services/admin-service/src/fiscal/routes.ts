import { Request, Response, Router } from 'express';
import { AdminSessionUser } from '../types';
import {
  FiscalService,
  assertPermission,
  permissionsForUser,
  toFiscalError,
} from './fiscal-service';
import { AdminUnifiedRequestContext, StockMovementType } from './types';
import { DashboardAnalyticsService } from '../analytics/dashboard-analytics-service';

function requireTenantId(req: Request): string {
  const tenantId = String(
    req.headers['x-tenant-id'] || req.query.tenantId || req.body?.tenantId || ''
  );
  if (!tenantId) {
    throw new Error('tenantId is required (x-tenant-id header, query or body)');
  }
  return tenantId;
}

function getAdminUser(res: Response): AdminSessionUser {
  const user = res.locals.adminUser as AdminSessionUser | undefined;
  if (!user) {
    throw new Error('login required');
  }
  return user;
}

function buildContext(req: Request, res: Response): AdminUnifiedRequestContext {
  const user = getAdminUser(res);
  const tenantId = requireTenantId(req);
  return {
    tenantId,
    userId: user.id || user.username,
    userRoles: [user.role],
    permissions: permissionsForUser(user.role, user.permissions),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    source: 'admin-unified-dashboard',
  };
}

function sendError(res: Response, error: unknown): void {
  const message = (error as Error).message || 'Erro inesperado';
  const status = message.includes('not found') || message.includes('inexistente') ? 404 : message.includes('permission denied') ? 403 : 400;
  res.status(status).json(toFiscalError(error));
}

function requireBodyFields(body: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (!body[field]) {
      throw new Error(`${field} is required`);
    }
  }
}

export function createAdminUnifiedRouter(
  fiscalService = new FiscalService(),
  analyticsService = new DashboardAnalyticsService()
): Router {
  const router = Router();

  router.get('/analytics/overview', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.getOverview(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/analytics/revenue', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.getSection(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res),
          'revenue'
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/analytics/orders', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.getSection(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res),
          'orders'
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/analytics/products', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.getSection(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res),
          'products'
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/analytics/customers', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.getSection(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res),
          'customers'
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/analytics/channels', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.getSection(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res),
          'channels'
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/analytics/payments', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.getSection(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res),
          'payments'
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/analytics/recent-orders', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.getSection(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res),
          'recentOrders'
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/analytics/alerts', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.getSection(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res),
          'alerts'
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/analytics/export', async (req, res) => {
    try {
      res.json({
        data: await analyticsService.exportReport(
          requireTenantId(req),
          req.query as Record<string, unknown>,
          getAdminUser(res),
          req.body || {}
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/fiscal-settings', async (req, res) => {
    try {
      res.json({ data: await fiscalService.getFiscalSettings(buildContext(req, res)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/fiscal-settings', async (req, res) => {
    try {
      res.status(201).json({
        data: await fiscalService.saveFiscalSettings(buildContext(req, res), req.body),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/fiscal-settings', async (req, res) => {
    try {
      res.json({ data: await fiscalService.saveFiscalSettings(buildContext(req, res), req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/fiscal-settings/upload-certificate', async (req, res) => {
    try {
      requireBodyFields(req.body, ['certificateFileBase64']);
      res.json({
        data: await fiscalService.uploadCertificate(buildContext(req, res), req.body),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/fiscal-settings/validate', async (req, res) => {
    try {
      res.json({ data: await fiscalService.validateFiscalSettings(buildContext(req, res)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/fiscal-settings/test-provider', async (req, res) => {
    try {
      res.json({ data: await fiscalService.testProvider(buildContext(req, res)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/fiscal-settings/status', async (req, res) => {
    try {
      res.json({ data: await fiscalService.getFiscalStatus(buildContext(req, res)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/fiscal-settings/audit-logs', async (req, res) => {
    try {
      res.json({ data: await fiscalService.listFiscalAuditLogs(buildContext(req, res)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders', async (req, res) => {
    try {
      res.json({ data: await fiscalService.listOrders(buildContext(req, res)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId', async (req, res) => {
    try {
      res.json({ data: await fiscalService.getOrderDetails(buildContext(req, res), req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/orders/:orderId/status', async (req, res) => {
    try {
      requireBodyFields(req.body, ['status']);
      res.json({
        data: await fiscalService.updateOrderStatus(
          buildContext(req, res),
          req.params.orderId,
          String(req.body.status)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/history', async (req, res) => {
    try {
      res.json({ data: await fiscalService.getOrderHistory(buildContext(req, res), req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/invoice/issue', async (req, res) => {
    try {
      res.status(202).json({
        data: await fiscalService.issueInvoice(buildContext(req, res), req.params.orderId, req.body),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/invoice', async (req, res) => {
    try {
      const context = buildContext(req, res);
      assertPermission(context, 'visualizar_pedidos');
      res.json({ data: await fiscalService.getInvoiceForOrder(context, req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/invoice/status', async (req, res) => {
    try {
      res.json({ data: await fiscalService.refreshInvoiceStatus(buildContext(req, res), req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/invoice/xml', async (req, res) => {
    try {
      const xml = await fiscalService.downloadInvoiceXml(buildContext(req, res), req.params.orderId);
      res.type('application/xml').send(xml);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/invoice/pdf', async (req, res) => {
    try {
      const pdf = await fiscalService.downloadInvoicePdf(buildContext(req, res), req.params.orderId);
      res.type('application/pdf').send(pdf);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/invoice/cancel', async (req, res) => {
    try {
      requireBodyFields(req.body, ['reason']);
      res.json({
        data: await fiscalService.cancelInvoice(buildContext(req, res), req.params.orderId, req.body),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/stock-check', async (req, res) => {
    try {
      res.json({ data: await fiscalService.stockCheck(buildContext(req, res), req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  const movementRoutes: Record<string, StockMovementType> = {
    reserve: 'reserva',
    release: 'liberacao',
    decrease: 'baixa',
    revert: 'estorno',
  };

  Object.entries(movementRoutes).forEach(([route, type]) => {
    router.post(`/orders/:orderId/stock/${route}`, async (req, res) => {
      try {
        res.json({
          data: await fiscalService.applyStockMovement(
            buildContext(req, res),
            req.params.orderId,
            type,
            req.body
          ),
        });
      } catch (error) {
        sendError(res, error);
      }
    });
  });

  router.get('/orders/:orderId/tracking', async (req, res) => {
    try {
      res.json({ data: await fiscalService.getTracking(buildContext(req, res), req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/tracking/update', async (req, res) => {
    try {
      requireBodyFields(req.body, ['carrier', 'trackingCode', 'status']);
      res.json({
        data: await fiscalService.updateTracking(buildContext(req, res), req.params.orderId, req.body),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/schema', (_req, res) => {
    res.json({ data: fiscalService.describeFirestoreSchema() });
  });

  return router;
}

export function createAdminUnifiedWebhookRouter(fiscalService = new FiscalService()): Router {
  const router = Router();

  router.post('/fiscal-provider', async (req, res) => {
    try {
      const signature = String(req.headers['x-t3ck-signature'] || req.headers['x-signature'] || '');
      res.json({ data: await fiscalService.processFiscalWebhook(req.body, signature) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/shipping-provider', async (req, res) => {
    try {
      const signature = String(req.headers['x-t3ck-signature'] || req.headers['x-signature'] || '');
      res.json({ data: await fiscalService.processShippingWebhook(req.body, signature) });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
