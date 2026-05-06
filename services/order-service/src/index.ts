import express, { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import {
  Logger,
  closeRateLimiter,
  getApiLimiter,
  initializeTracing,
  validateRequest,
} from '@t3ck/shared';
import { OrderService } from './order-service';
import { OrderStateStore } from './order-state-store';
import {
  OrderCancelSchema,
  OrderCreateSchema,
  OrderPaymentStatusUpdateSchema,
  OrderStatusUpdateSchema,
} from './validation';
import { OrderStatus } from './types';
import { CreateOrderInput } from './types';

initializeTracing('order-service');

const app: express.Application = express();
app.use(express.json());
app.use(getApiLimiter());

const logger = new Logger('order-service');
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.INTERNAL_SERVICE_TOKEN) {
  throw new Error('INTERNAL_SERVICE_TOKEN e obrigatorio em producao.');
}

const orderStateFile =
  process.env.ORDER_STATE_FILE || (isProduction ? 'data/order-service-state.json' : undefined);
const service = new OrderService(orderStateFile ? new OrderStateStore(orderStateFile) : undefined);

type OrderRequestBody = {
  tenantId: string;
  customerId: string;
  items: Array<{
    productId: string;
    name?: string;
    quantity: number;
    unitPrice?: number;
  }>;
  shippingCost?: number;
  notes?: string;
};

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

function requireInternalAccess(req: Request, res: Response): boolean {
  if (!isProduction) {
    return true;
  }

  if (!hasValidInternalServiceToken(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }

  return true;
}

function getInternalHeaders(tenantId: string): Record<string, string> {
  return {
    'X-Tenant-ID': tenantId,
    ...(process.env.INTERNAL_SERVICE_TOKEN
      ? { 'X-Internal-Service-Token': process.env.INTERNAL_SERVICE_TOKEN }
      : {}),
  };
}

function resolveShippingCost(input: OrderRequestBody): number {
  if (!isProduction || process.env.ORDER_ALLOW_CLIENT_SHIPPING_COST === 'true') {
    return input.shippingCost ?? 0;
  }

  if (Number(input.shippingCost || 0) !== 0) {
    throw new Error(
      'shippingCost deve ser calculado por servico confiavel antes da criacao do pedido.'
    );
  }

  return 0;
}

async function resolveTrustedOrderInput(input: OrderRequestBody): Promise<CreateOrderInput> {
  const productServiceUrl = process.env.PRODUCT_SERVICE_URL;
  if (!productServiceUrl) {
    if (isProduction) {
      throw new Error('PRODUCT_SERVICE_URL e obrigatorio para criar pedidos em producao.');
    }

    return input as CreateOrderInput;
  }

  const items = await Promise.all(
    input.items.map(async (item) => {
      const response = await fetch(`${productServiceUrl}/api/products/${item.productId}`, {
        headers: getInternalHeaders(input.tenantId),
      });
      if (!response.ok) {
        throw new Error(`Produto indisponivel: ${item.productId}`);
      }

      const payload = (await response.json()) as {
        data?: {
          id: string;
          name: string;
          basePrice: number;
          stock: number;
          active?: boolean;
        };
      };
      const product = payload.data as {
        id: string;
        name: string;
        basePrice: number;
        stock: number;
        active?: boolean;
      };

      if (!product || product.active === false) {
        throw new Error(`Produto indisponivel: ${item.productId}`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Estoque insuficiente para produto ${item.productId}`);
      }

      return {
        productId: product.id || item.productId,
        name: product.name,
        quantity: item.quantity,
        unitPrice: product.basePrice,
      };
    })
  );

  return {
    tenantId: input.tenantId,
    customerId: input.customerId,
    items,
    shippingCost: resolveShippingCost(input),
    notes: input.notes,
  };
}

app.use((req: Request, res: Response, next) => {
  if (req.path === '/health' || req.path === '/') {
    return next();
  }
  if (!requireInternalAccess(req, res)) {
    return undefined;
  }
  return next();
});

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

app.post('/orders', validateRequest(OrderCreateSchema), async (req: Request, res: Response) => {
  try {
    const trustedInput = await resolveTrustedOrderInput(req.body);
    const order = service.createOrder(trustedInput);
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

app.patch(
  '/orders/:id/status',
  validateRequest(OrderStatusUpdateSchema),
  (req: Request, res: Response) => {
    try {
      const updated = service.updateStatus(
        req.body.tenantId,
        req.params.id,
        req.body.status,
        req.body.reason
      );
      return res.json({ data: updated });
    } catch (error) {
      const message = (error as Error).message;
      return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
    }
  }
);

app.patch(
  '/orders/:id/payment-status',
  validateRequest(OrderPaymentStatusUpdateSchema),
  (req: Request, res: Response) => {
    try {
      if (!hasValidInternalServiceToken(req)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const updated = service.updatePaymentStatus(
        req.body.tenantId,
        req.params.id,
        req.body.paymentId,
        req.body.paymentStatus
      );
      return res.json({ data: updated });
    } catch (error) {
      const message = (error as Error).message;
      return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
    }
  }
);

app.post(
  '/orders/:id/cancel',
  validateRequest(OrderCancelSchema),
  (req: Request, res: Response) => {
    try {
      const cancelled = service.cancelOrder(req.body.tenantId, req.params.id, req.body.reason);
      return res.json({ data: cancelled });
    } catch (error) {
      const message = (error as Error).message;
      return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
    }
  }
);

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
