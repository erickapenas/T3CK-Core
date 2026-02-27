import express, { Request, Response } from 'express';
import {
  Logger,
  closeRateLimiter,
  getApiLimiter,
  initializeTracing,
  validateRequest,
} from '@t3ck/shared';
import { OrderService } from './order-service';
import { OrderCancelSchema, OrderCreateSchema, OrderStatusUpdateSchema } from './validation';
import { OrderStatus } from './types';

initializeTracing('order-service');

const app: express.Application = express();
app.use(express.json());
app.use(getApiLimiter());

const logger = new Logger('order-service');
const service = new OrderService();

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'order-service' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'order-service',
    status: 'running',
    endpoints: {
      health: '/health',
      orders: '/orders',
      analytics: '/orders/analytics/summary',
    },
  });
});

app.post('/orders', validateRequest(OrderCreateSchema), (req: Request, res: Response) => {
  try {
    const order = service.createOrder(req.body);
    return res.status(201).json({ data: order });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.get('/orders', (req: Request, res: Response) => {
  try {
    const tenantId = String(req.query.tenantId || req.headers['x-tenant-id'] || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório' });
    }
    const status = req.query.status ? (String(req.query.status) as OrderStatus) : undefined;
    const customerId = req.query.customerId ? String(req.query.customerId) : undefined;
    const orders = service.listOrders(tenantId, { status, customerId });
    return res.json({ data: orders });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.get('/orders/:id', (req: Request, res: Response) => {
  const tenantId = String(req.query.tenantId || req.headers['x-tenant-id'] || '');
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId é obrigatório' });
  }

  const order = service.getOrder(tenantId, req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }

  return res.json({ data: order });
});

app.patch('/orders/:id/status', validateRequest(OrderStatusUpdateSchema), (req: Request, res: Response) => {
  try {
    const updated = service.updateStatus(req.body.tenantId, req.params.id, req.body.status, req.body.reason);
    return res.json({ data: updated });
  } catch (error) {
    const message = (error as Error).message;
    return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
  }
});

app.post('/orders/:id/cancel', validateRequest(OrderCancelSchema), (req: Request, res: Response) => {
  try {
    const cancelled = service.cancelOrder(req.body.tenantId, req.params.id, req.body.reason);
    return res.json({ data: cancelled });
  } catch (error) {
    const message = (error as Error).message;
    return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
  }
});

app.get('/orders/:id/history', (req: Request, res: Response) => {
  try {
    const tenantId = String(req.query.tenantId || req.headers['x-tenant-id'] || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório' });
    }

    const history = service.getOrderHistory(tenantId, req.params.id);
    return res.json({ data: history });
  } catch (error) {
    const message = (error as Error).message;
    return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
  }
});

app.get('/orders/analytics/summary', (req: Request, res: Response) => {
  const tenantId = String(req.query.tenantId || req.headers['x-tenant-id'] || '');
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId é obrigatório' });
  }

  const period = String(req.query.period || 'daily') as 'daily' | 'monthly';
  const analytics = service.getAnalytics(tenantId, period);
  return res.json({ data: analytics });
});

const port = Number(process.env.PORT || process.env.ORDER_SERVICE_PORT || 3011);

let server: ReturnType<typeof app.listen> | undefined;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    logger.info(`order-service running on port ${port}`);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down order-service');
    server?.close(async () => {
      await closeRateLimiter();
      process.exit(0);
    });
  });
}

export default app;