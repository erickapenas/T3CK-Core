import express, { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  Logger,
  getApiLimiter,
  closeRateLimiter,
  initializeTracing,
  validateRequest,
} from '@t3ck/shared';
import {
  CustomerCreateSchema,
  CustomerUpdateSchema,
  OrderCreateSchema,
  OrderUpdateSchema,
  ProductCreateSchema,
  ProductUpdateSchema,
  SettingsUpdateSchema,
  TenantConfigurationUpdateSchema,
  DashboardLayoutUpdateSchema,
  ThemeDraftUpdateSchema,
  ThemePublishSchema,
  UserThemePreferencesUpdateSchema,
  UserCreateSchema,
  UserUpdateSchema,
  LoginSchema,
} from './validation';
import { AdminService } from './admin-service';
import { AuditLogService } from './audit/audit-log-service';
import { createAuditCaptureMiddleware } from './audit/middleware';
import { createAuditRouter } from './audit/routes';
import { createCustomerCrmRouter } from './customers/routes';
import { createProductCatalogRouter } from './products/routes';
import { createOrderManagementRouter } from './orders/routes';
import { createIntegrationManagementRouter } from './integrations/routes';
import { createEcommerceRouter } from './ecommerce/routes';
import { createAdminUnifiedRouter, createAdminUnifiedWebhookRouter } from './fiscal/routes';
import { AdminSessionUser } from './types';

initializeTracing('admin-service');

const app: express.Application = express();
const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5176',
];
const corsOrigins = (process.env.CORS_ORIGINS?.split(',') || defaultCorsOrigins).map((origin) =>
  origin.trim()
);

app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin;

  if (typeof origin === 'string' && corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-CSRF-Token, X-Internal-Service-Token, X-Maintenance-Token, X-Request-ID, X-Tenant-ID'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }

  next();
});
app.use(express.json({ limit: '12mb' }));
const passThroughLimiter = (_req: Request, _res: Response, next: () => void) => next();
const apiLimiterEnabled =
  process.env.RATE_LIMIT_DISABLED !== 'true' && process.env.NODE_ENV === 'production';
app.use(apiLimiterEnabled ? getApiLimiter() : passThroughLimiter);

const logger = new Logger('admin-service');
const adminService = new AdminService();
const auditLogService = new AuditLogService();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret =
  process.env.ADMIN_SESSION_SECRET || process.env.JWT_SECRET || 'dev-admin-session-secret';
const sessionTtlMs = Number(process.env.ADMIN_SESSION_TTL_MS || 8 * 60 * 60 * 1000);

if (isProduction && !process.env.INTERNAL_SERVICE_TOKEN) {
  throw new Error('INTERNAL_SERVICE_TOKEN e obrigatorio em producao.');
}

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

type AdminSession = {
  user: AdminSessionUser;
  expiresAt: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload: string): string {
  return createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function createSessionToken(user: AdminSessionUser): string {
  const payload = base64UrlEncode(
    JSON.stringify({
      user,
      expiresAt: Date.now() + sessionTtlMs,
    } satisfies AdminSession)
  );
  return `${payload}.${signPayload(payload)}`;
}

function verifySessionToken(token: string): AdminSession | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signPayload(payload) !== signature) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as AdminSession;
    if (!session.user || session.expiresAt < Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function getSessionFromRequest(req: Request): AdminSession | null {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return token ? verifySessionToken(token) : null;
}

function userCanAccessTenant(user: AdminSessionUser, tenantId: string): boolean {
  return user.role === 'admin' || user.tenantId === tenantId;
}

const requireAdminSession = (req: Request, res: Response, next: () => void) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    const tenantId = String(req.headers['x-tenant-id'] || req.query.tenantId || req.body?.tenantId || '');
    if (tenantId) {
      auditLogService
        .record({
          tenantId,
          actor: { id: 'anonymous', username: 'anonymous', type: 'user' },
          category: 'security',
          action: 'auth.user.session_missing',
          operation: 'view',
          severity: 'warning',
          outcome: 'denied',
          module: 'auth',
          description: 'Requisicao administrativa sem sessao valida.',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          httpMethod: req.method,
          endpoint: req.originalUrl,
          statusCode: 401,
          securityEvent: true,
        })
        .catch(() => undefined);
    }
    return res.status(401).json({ error: 'login required' });
  }

  res.locals.adminUser = session.user;

  if (req.path === '/auth/me') {
    return next();
  }

  try {
    const tenantId = String(
      req.headers['x-tenant-id'] || req.query.tenantId || req.body?.tenantId || ''
    );
    if (tenantId && !userCanAccessTenant(session.user, tenantId)) {
      auditLogService
        .record({
          tenantId,
          actor: session.user,
          category: 'security',
          action: 'security.tenant_access.denied',
          operation: 'view',
          severity: 'critical',
          outcome: 'denied',
          module: 'security',
          description: 'Usuario tentou acessar tenant diferente do permitido.',
          metadata: { userTenantId: session.user.tenantId },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          httpMethod: req.method,
          endpoint: req.originalUrl,
          statusCode: 403,
          securityEvent: true,
        })
        .catch(() => undefined);
      return res.status(403).json({ error: 'tenant access denied' });
    }
  } catch {
    return res.status(403).json({ error: 'tenant access denied' });
  }

  return next();
};

const requireTenantId = (req: Request): string => {
  const tenantId = String(
    req.headers['x-tenant-id'] || req.query.tenantId || req.body?.tenantId || ''
  );
  if (!tenantId) {
    throw new Error('tenantId is required (x-tenant-id header, query or body)');
  }
  return tenantId;
};

const requireCurrentUser = (res: Response): AdminSessionUser => {
  const user = res.locals.adminUser as AdminSessionUser | undefined;
  if (!user) {
    throw new Error('login required');
  }
  return user;
};

const getPagination = (req: Request): { page: number; limit: number } => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);

  return {
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 20,
  };
};

const requireMaintenanceAccess = (req: Request): void => {
  const expectedToken = process.env.ADMIN_MAINTENANCE_TOKEN;

  if (!expectedToken && process.env.NODE_ENV !== 'production') {
    return;
  }

  const providedToken = String(
    req.headers['x-maintenance-token'] ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  );

  if (!expectedToken || providedToken !== expectedToken) {
    throw new Error('maintenance access denied');
  }
};

const handleError = (res: Response, error: unknown): void => {
  const message = (error as Error).message;
  const status = message.includes('not found') ? 404 : 400;
  res.status(status).json({ error: message });
};

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'admin-service' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'admin-service',
    status: 'running',
    endpoints: {
      health: '/health',
      adminApi: '/api/admin',
      adminUnifiedDashboard: '/api/admin-unified-dashboard',
      fiscalWebhooks: '/api/webhooks/fiscal-provider',
    },
  });
});

app.use((req: Request, res: Response, next) => {
  if (
    req.path === '/health' ||
    req.path === '/' ||
    req.path === '/api/admin/auth/login' ||
    req.path.startsWith('/api/webhooks/')
  ) {
    return next();
  }
  if (isProduction && !hasValidInternalServiceToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
});

app.post('/api/admin/auth/login', validateRequest(LoginSchema), async (req: Request, res: Response) => {
  try {
    const user = await adminService.authenticateUser(req.body.username, req.body.password);
    if (!user) {
      const tenantId = String(req.headers['x-tenant-id'] || req.body?.tenantId || 'tenant-demo');
      await auditLogService.record({
        tenantId,
        actor: { id: req.body.username, username: req.body.username, type: 'user' },
        category: 'security',
        action: 'auth.user.login_failed',
        operation: 'login',
        severity: 'warning',
        outcome: 'failure',
        module: 'auth',
        description: 'Falha de login administrativo.',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        httpMethod: req.method,
        endpoint: req.originalUrl,
        statusCode: 401,
        securityEvent: true,
      }).catch(() => undefined);
      return res.status(401).json({ error: 'invalid username or password' });
    }

    await auditLogService.record({
      tenantId: user.tenantId,
      actor: user,
      category: 'security',
      action: 'auth.user.login_success',
      operation: 'login',
      severity: 'info',
      outcome: 'success',
      module: 'auth',
      description: 'Login administrativo realizado.',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      httpMethod: req.method,
      endpoint: req.originalUrl,
      statusCode: 200,
      securityEvent: true,
    }).catch(() => undefined);

    return res.json({
      data: {
        token: createSessionToken(user),
        user,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
});

app.use('/api/admin', requireAdminSession);
app.use('/api/admin-unified-dashboard', requireAdminSession);
app.use(
  ['/api/admin', '/api/admin-unified-dashboard'],
  createAuditCaptureMiddleware(auditLogService, (req: Request, res: Response) => ({
    tenantId: String(req.headers['x-tenant-id'] || req.query.tenantId || req.body?.tenantId || ''),
    user: res.locals.adminUser as AdminSessionUser | undefined,
  }))
);

app.get('/api/admin/auth/me', (_req: Request, res: Response) => {
  res.json({ data: { user: res.locals.adminUser } });
});

app.use('/api/admin/ecommerce', createEcommerceRouter());

app.get('/api/admin-unified-dashboard/theme/themes', async (_req: Request, res: Response) => {
  try {
    const data = adminService.listThemes();
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin-unified-dashboard/theme', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const user = requireCurrentUser(res);
    const data = await adminService.getThemeBundle(tenantId, user.id);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put(
  '/api/admin-unified-dashboard/theme/draft',
  validateRequest(ThemeDraftUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const user = requireCurrentUser(res);
      if (user.role !== 'admin' && !user.permissions?.includes('editar_tema_tenant')) {
        return res.status(403).json({ error: 'theme edit permission required' });
      }
      const data = await adminService.updateTenantThemeDraft(tenantId, req.body, user.id);
      return res.json({ data });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

app.post(
  '/api/admin-unified-dashboard/theme/publish',
  validateRequest(ThemePublishSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const user = requireCurrentUser(res);
      if (user.role !== 'admin' && !user.permissions?.includes('publicar_tema_tenant')) {
        return res.status(403).json({ error: 'theme publish permission required' });
      }
      const data = await adminService.publishTenantTheme(tenantId, req.body, user.id);
      return res.json({ data });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

app.post('/api/admin-unified-dashboard/theme/reset', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const user = requireCurrentUser(res);
    if (user.role !== 'admin' && !user.permissions?.includes('editar_tema_tenant')) {
      return res.status(403).json({ error: 'theme edit permission required' });
    }
    const data = await adminService.resetTenantTheme(tenantId, user.id);
    return res.json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

app.get('/api/admin-unified-dashboard/theme/user-preferences', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const user = requireCurrentUser(res);
    const data = await adminService.getUserThemePreferences(tenantId, user.id);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put(
  '/api/admin-unified-dashboard/theme/user-preferences',
  validateRequest(UserThemePreferencesUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const user = requireCurrentUser(res);
      const data = await adminService.updateUserThemePreferences(tenantId, user.id, req.body);
      return res.json({ data });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

app.get('/api/admin-unified-dashboard/dashboard-layout', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const user = requireCurrentUser(res);
    const userId = req.query.scope === 'tenant' ? undefined : user.id;
    const data = await adminService.getDashboardLayout(tenantId, userId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put(
  '/api/admin-unified-dashboard/dashboard-layout',
  validateRequest(DashboardLayoutUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const user = requireCurrentUser(res);
      const userId = req.body.userId || user.id;
      if (userId !== user.id && user.role !== 'admin') {
        return res.status(403).json({ error: 'dashboard layout permission required' });
      }
      const data = await adminService.updateDashboardLayout(tenantId, userId, req.body);
      return res.json({ data });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

app.use(
  '/api/admin-unified-dashboard',
  createAuditRouter((req: Request, res: Response) => ({
    tenantId: requireTenantId(req),
    user: requireCurrentUser(res),
  }), auditLogService)
);

app.use(
  '/api/admin-unified-dashboard',
  createCustomerCrmRouter((req: Request, res: Response) => ({
    tenantId: requireTenantId(req),
    user: requireCurrentUser(res),
  }))
);

app.use(
  '/api/admin-unified-dashboard',
  createProductCatalogRouter((req: Request, res: Response) => ({
    tenantId: requireTenantId(req),
    user: requireCurrentUser(res),
  }))
);

app.use(
  '/api/admin-unified-dashboard',
  createOrderManagementRouter((req: Request, res: Response) => ({
    tenantId: requireTenantId(req),
    user: requireCurrentUser(res),
  }))
);

app.use(
  '/api/admin-unified-dashboard',
  createIntegrationManagementRouter((req: Request, res: Response) => ({
    tenantId: requireTenantId(req),
    user: requireCurrentUser(res),
  }))
);

app.use('/api/admin-unified-dashboard', createAdminUnifiedRouter());
app.use('/api/webhooks', createAdminUnifiedWebhookRouter());

app.get('/api/admin/dashboard', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = await adminService.getDashboard(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.post(
  '/api/admin/products',
  validateRequest(ProductCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.createProduct({
        ...req.body,
        tenantId,
        status: req.body.status || 'active',
      });
      res.status(201).json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get('/api/admin/products', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = await adminService.listProductsPage(tenantId, getPagination(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put(
  '/api/admin/products/:id',
  validateRequest(ProductUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.updateProduct(tenantId, req.params.id, req.body);
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.delete('/api/admin/products/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const deleted = await adminService.deleteProduct(tenantId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
});

app.post(
  '/api/admin/orders',
  validateRequest(OrderCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.createOrder({
        ...req.body,
        tenantId,
        status: req.body.status || 'pending',
      });
      res.status(201).json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get('/api/admin/orders', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = await adminService.listOrdersPage(tenantId, getPagination(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put(
  '/api/admin/orders/:id',
  validateRequest(OrderUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.updateOrder(tenantId, req.params.id, req.body);
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  '/api/admin/customers',
  validateRequest(CustomerCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.createCustomer({ ...req.body, tenantId });
      res.status(201).json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get('/api/admin/customers', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = await adminService.listCustomersPage(tenantId, getPagination(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/customers/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = await adminService.getCustomer(tenantId, req.params.id);
    if (!data) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

app.put(
  '/api/admin/customers/:id',
  validateRequest(CustomerUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.updateCustomer(tenantId, req.params.id, req.body);
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get('/api/admin/analytics', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const to = String(req.query.to || new Date().toISOString());
    const from = String(req.query.from || new Date(Date.now() - 30 * 86400000).toISOString());
    const data = await adminService.getAnalytics(tenantId, from, to);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/reports/:type', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const type = req.params.type as 'sales' | 'inventory' | 'customers';
    const data = await adminService.generateReport(tenantId, type);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/settings', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = await adminService.getSettings(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put(
  '/api/admin/settings',
  validateRequest(SettingsUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.updateSettings(tenantId, req.body);
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get('/api/admin/tenant-config', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = await adminService.getTenantConfiguration(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put(
  '/api/admin/tenant-config',
  validateRequest(TenantConfigurationUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.updateTenantConfiguration(tenantId, req.body);
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.post(
  '/api/admin/users',
  validateRequest(UserCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.createUser({
        ...req.body,
        tenantId,
        active: req.body.active ?? true,
      });
      res.status(201).json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.get('/api/admin/users', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = await adminService.listUsersPage(tenantId, getPagination(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put(
  '/api/admin/users/:id',
  validateRequest(UserUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const data = await adminService.updateUser(tenantId, req.params.id, req.body);
      res.json({ data });
    } catch (error) {
      handleError(res, error);
    }
  }
);

app.delete('/api/admin/users/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const deleted = await adminService.deleteUser(tenantId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
});

app.get('/api/admin/audit-logs', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = await adminService.listAuditLogsPage(tenantId, getPagination(req));
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/admin/maintenance/product-stats/backfill', async (req: Request, res: Response) => {
  try {
    requireMaintenanceAccess(req);
    const tenantId = requireTenantId(req);
    const from = req.body?.from ? String(req.body.from) : undefined;
    const to = req.body?.to ? String(req.body.to) : undefined;
    const data = await adminService.backfillProductDailyStats(tenantId, from, to);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

const PORT = parseInt(String(process.env.PORT || process.env.ADMIN_SERVICE_PORT || 3006));
let server: ReturnType<typeof app.listen> | undefined;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    logger.info(`Admin service running on port ${PORT}`);
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
