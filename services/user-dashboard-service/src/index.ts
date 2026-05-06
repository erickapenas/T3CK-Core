import express, { Request, Response } from 'express';
import { resolve } from 'path';
import {
  closeRateLimiter,
  getApiLimiter,
  initializeTracing,
  Logger,
  validateRequest,
} from '@t3ck/shared';
import { requireGatewayContext, UserDashboardRequest } from './context';
import { AppError } from './errors';
import { getFirestore } from './firebase';
import { FetchInternalHttpClient } from './http-client';
import { FirestoreIntegrationStateStore } from './integrations/firestore-integration-state-store';
import { IntegrationService } from './integrations/integration-service';
import { FileIntegrationStateStore, IntegrationStateStore } from './integrations/integration-state-store';
import { UserDashboardService } from './user-dashboard-service';
import {
  MarketplaceConnectSchema,
  MarketplaceOAuthCallbackSchema,
  MarketplaceProviderParamSchema,
  OrderListQuerySchema,
  PageSpeedRunSchema,
  ProfileUpdateSchema,
} from './validation';

initializeTracing('user-dashboard-service');

const app: express.Application = express();
const logger = new Logger('user-dashboard-service');
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.INTERNAL_SERVICE_TOKEN) {
  throw new Error('INTERNAL_SERVICE_TOKEN e obrigatorio em producao.');
}

const defaultCorsOrigins = ['http://localhost:3000', 'http://localhost:5176', 'http://127.0.0.1:5176'];
const corsOrigins = (process.env.CORS_ORIGINS || defaultCorsOrigins.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    [
      'Authorization',
      'Content-Type',
      'X-CSRF-Token',
      'X-Internal-Service-Token',
      'X-Request-ID',
      'X-Tenant-ID',
      'X-User-ID',
      'X-User-Email',
      'X-User-Roles',
    ].join(', ')
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }

  next();
});

app.use(express.json());
app.use(getApiLimiter());

const service = new UserDashboardService(new FetchInternalHttpClient());
const integrationStateFile =
  process.env.INTEGRATION_STATE_FILE ||
  resolve(process.cwd(), 'data', 'user-dashboard-integrations-state.json');

function createIntegrationStateStore(): IntegrationStateStore {
  const backend = process.env.INTEGRATION_STATE_BACKEND || 'firestore';
  if (backend === 'file') {
    return new FileIntegrationStateStore(integrationStateFile);
  }

  const firestore = getFirestore();
  if (!firestore) {
    throw new Error(
      'Firestore is required for user-dashboard integration persistence. Set FIREBASE_SERVICE_ACCOUNT_KEY_PATH or FIREBASE_SERVICE_ACCOUNT.'
    );
  }

  return new FirestoreIntegrationStateStore(firestore);
}

const integrationService = new IntegrationService(createIntegrationStateStore());

const requireContext = (req: Request) => {
  const requestWithContext = req as UserDashboardRequest;
  if (!requestWithContext.userContext) {
    throw new AppError(401, 'Missing authenticated context');
  }
  return requestWithContext.userContext;
};

const handleError = (res: Response, error: unknown): void => {
  const status = error instanceof AppError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Unexpected error';
  res.status(status).json({ error: message });
};

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'user-dashboard-service' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'user-dashboard-service',
    status: 'running',
    endpoints: {
      health: '/health',
      me: '/user-dashboard/me',
      summary: '/user-dashboard/summary',
      orders: '/user-dashboard/orders',
      integrations: '/user-dashboard/integrations',
    },
  });
});

app.post(
  '/webhooks/marketplaces/:provider',
  validateRequest(MarketplaceProviderParamSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await integrationService.receiveWebhook(req.params.provider as never, {
        headers: req.headers,
        body: req.body,
      });
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.use('/user-dashboard', requireGatewayContext);

app.get('/user-dashboard/me', async (req: Request, res: Response) => {
  try {
    const data = await service.getMe(requireContext(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/user-dashboard/summary', async (req: Request, res: Response) => {
  try {
    const data = await service.getSummary(requireContext(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get(
  '/user-dashboard/orders',
  validateRequest(OrderListQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const data = await service.listOrders(requireContext(req), {
        status: req.query.status ? String(req.query.status) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get('/user-dashboard/orders/:id', async (req: Request, res: Response) => {
  try {
    const data = await service.getOrder(requireContext(req), req.params.id);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/user-dashboard/orders/:id/history', async (req: Request, res: Response) => {
  try {
    const data = await service.getOrderHistory(requireContext(req), req.params.id);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/user-dashboard/payments/:paymentId/status', async (req: Request, res: Response) => {
  try {
    const data = await service.getPaymentStatus(requireContext(req), req.params.paymentId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.patch(
  '/user-dashboard/profile',
  validateRequest(ProfileUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await service.updateProfile(requireContext(req), req.body);
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get('/user-dashboard/integrations', async (req: Request, res: Response) => {
  try {
    const data = await integrationService.listIntegrations(requireContext(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/user-dashboard/integrations/logs', async (req: Request, res: Response) => {
  try {
    const data = await integrationService.listLogs(requireContext(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get(
  '/user-dashboard/integrations/marketplaces/:provider/status',
  validateRequest(MarketplaceProviderParamSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await integrationService.getMarketplaceStatus(
        requireContext(req),
        req.params.provider as never
      );
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  '/user-dashboard/integrations/marketplaces/:provider/connect',
  validateRequest(MarketplaceConnectSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await integrationService.connectMarketplace(
        requireContext(req),
        req.params.provider as never,
        req.body
      );
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  '/user-dashboard/integrations/marketplaces/:provider/oauth/callback',
  validateRequest(MarketplaceOAuthCallbackSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await integrationService.completeOAuth(
        requireContext(req),
        req.params.provider as never,
        req.body
      );
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  '/user-dashboard/integrations/marketplaces/:provider/disconnect',
  validateRequest(MarketplaceProviderParamSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await integrationService.disconnectMarketplace(
        requireContext(req),
        req.params.provider as never
      );
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  '/user-dashboard/integrations/marketplaces/:provider/refresh-token',
  validateRequest(MarketplaceProviderParamSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await integrationService.refreshMarketplaceToken(
        requireContext(req),
        req.params.provider as never
      );
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  '/user-dashboard/integrations/marketplaces/:provider/test',
  validateRequest(MarketplaceProviderParamSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await integrationService.testMarketplace(
        requireContext(req),
        req.params.provider as never
      );
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  '/user-dashboard/integrations/marketplaces/:provider/import-orders',
  validateRequest(MarketplaceProviderParamSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await integrationService.importMarketplaceOrders(
        requireContext(req),
        req.params.provider as never
      );
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  '/user-dashboard/integrations/pagespeed/reports',
  validateRequest(PageSpeedRunSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await integrationService.runPageSpeedReport(requireContext(req), req.body);
      res.status(201).json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get('/user-dashboard/integrations/pagespeed/reports', async (req: Request, res: Response) => {
  try {
    const data = await integrationService.listPageSpeedReports(requireContext(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/user-dashboard/integrations/pagespeed/reports/:id', async (req: Request, res: Response) => {
  try {
    const data = await integrationService.getPageSpeedReport(requireContext(req), req.params.id);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

const PORT = parseInt(String(process.env.PORT || process.env.USER_DASHBOARD_SERVICE_PORT || 3015));
let server: ReturnType<typeof app.listen> | undefined;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    logger.info(`User dashboard service running on port ${PORT}`);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server?.close(async () => {
      logger.info('Server closed');
      await closeRateLimiter();
      process.exit(0);
    });
  });
}

export default app;
