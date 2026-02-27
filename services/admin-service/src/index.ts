import express, { Request, Response } from 'express';
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
  UserCreateSchema,
  UserUpdateSchema,
} from './validation';
import { AdminService } from './admin-service';

initializeTracing('admin-service');

const app: express.Application = express();
app.use(express.json());
const passThroughLimiter = (_req: Request, _res: Response, next: () => void) => next();
const apiLimiterEnabled = process.env.RATE_LIMIT_DISABLED !== 'true' && process.env.NODE_ENV === 'production';
app.use(apiLimiterEnabled ? getApiLimiter() : passThroughLimiter);

const logger = new Logger('admin-service');
const adminService = new AdminService();

const requireTenantId = (req: Request): string => {
  const tenantId = String(req.headers['x-tenant-id'] || req.query.tenantId || req.body?.tenantId || '');
  if (!tenantId) {
    throw new Error('tenantId is required (x-tenant-id header, query or body)');
  }
  return tenantId;
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
    },
  });
});

app.get('/api/admin/dashboard', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.getDashboard(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/admin/products', validateRequest(ProductCreateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.createProduct({ ...req.body, tenantId, status: req.body.status || 'active' });
    res.status(201).json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/products', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.listProducts(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put('/api/admin/products/:id', validateRequest(ProductUpdateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.updateProduct(tenantId, req.params.id, req.body);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/admin/products/:id', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const deleted = adminService.deleteProduct(tenantId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
});

app.post('/api/admin/orders', validateRequest(OrderCreateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.createOrder({ ...req.body, tenantId, status: req.body.status || 'pending' });
    res.status(201).json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/orders', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.listOrders(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put('/api/admin/orders/:id', validateRequest(OrderUpdateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.updateOrder(tenantId, req.params.id, req.body);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/admin/customers', validateRequest(CustomerCreateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.createCustomer({ ...req.body, tenantId });
    res.status(201).json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/customers', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.listCustomers(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put('/api/admin/customers/:id', validateRequest(CustomerUpdateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.updateCustomer(tenantId, req.params.id, req.body);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/analytics', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const to = String(req.query.to || new Date().toISOString());
    const from = String(req.query.from || new Date(Date.now() - 30 * 86400000).toISOString());
    const data = adminService.getAnalytics(tenantId, from, to);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/reports/:type', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const type = req.params.type as 'sales' | 'inventory' | 'customers';
    const data = adminService.generateReport(tenantId, type);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/settings', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.getSettings(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put('/api/admin/settings', validateRequest(SettingsUpdateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.updateSettings(tenantId, req.body);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/tenant-config', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.getTenantConfiguration(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put('/api/admin/tenant-config', validateRequest(TenantConfigurationUpdateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.updateTenantConfiguration(tenantId, req.body);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/admin/users', validateRequest(UserCreateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.createUser({ ...req.body, tenantId, active: req.body.active ?? true });
    res.status(201).json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/admin/users', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.listUsers(tenantId);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.put('/api/admin/users/:id', validateRequest(UserUpdateSchema), (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.updateUser(tenantId, req.params.id, req.body);
    res.json({ data });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/admin/users/:id', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const deleted = adminService.deleteUser(tenantId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
});

app.get('/api/admin/audit-logs', (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const data = adminService.listAuditLogs(tenantId);
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
