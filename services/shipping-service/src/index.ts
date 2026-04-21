import 'dotenv/config';

import express, { Request, Response } from 'express';
import {
  Logger,
  closeRateLimiter,
  getApiLimiter,
  initializeTracing,
  validateRequest,
} from '@t3ck/shared';
import { ShippingService } from './shipping-service';
import {
  NotificationSchema,
  ShipmentCreateSchema,
  ShippingCalculationSchema,
  StatusUpdateSchema,
} from './validation';

initializeTracing('shipping-service');

const app: express.Application = express();
app.use(express.json());
app.use(getApiLimiter());

const logger = new Logger('shipping-service');
const service = new ShippingService();

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'shipping-service' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'shipping-service',
    status: 'running',
    endpoints: {
      health: '/health',
      shippingCalculate: '/shipping/calculate',
      shipments: '/shipping/shipments',
    },
  });
});

app.post(
  '/shipping/calculate',
  validateRequest(ShippingCalculationSchema),
  (req: Request, res: Response) => {
    const options = service.calculateOptions(req.body);
    return res.json({ data: options });
  }
);

app.post('/shipping/integrate-carrier', (req: Request, res: Response) => {
  const tenantId = String(req.body.tenantId || '');
  const orderId = String(req.body.orderId || '');
  const carrier = String(req.body.carrier || '') as 'correios' | 'loggi' | 'melhor_envio';

  if (!tenantId || !orderId || !carrier) {
    return res.status(400).json({ error: 'tenantId, orderId e carrier são obrigatórios' });
  }

  const result = service.integrateCarrier(tenantId, orderId, carrier);
  return res.json({ data: result });
});

app.post(
  '/shipping/shipments',
  validateRequest(ShipmentCreateSchema),
  (req: Request, res: Response) => {
    try {
      const shipment = service.createShipment(req.body);
      return res.status(201).json({ data: shipment });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.post('/shipping/shipments/:id/label', (req: Request, res: Response) => {
  try {
    const tenantId = String(
      req.body.tenantId || req.query.tenantId || req.headers['x-tenant-id'] || ''
    );
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório' });
    }

    const label = service.generateLabel(tenantId, req.params.id);
    return res.json({ data: label });
  } catch (error) {
    const message = (error as Error).message;
    return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
  }
});

app.patch(
  '/shipping/shipments/:id/tracking',
  validateRequest(StatusUpdateSchema),
  (req: Request, res: Response) => {
    try {
      const shipment = service.updateTracking(
        req.body.tenantId,
        req.params.id,
        req.body.status,
        req.body.location,
        req.body.message
      );
      return res.json({ data: shipment });
    } catch (error) {
      const message = (error as Error).message;
      return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
    }
  }
);

app.get('/shipping/shipments/:id/tracking', (req: Request, res: Response) => {
  try {
    const tenantId = String(req.query.tenantId || req.headers['x-tenant-id'] || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório' });
    }
    const events = service.getTracking(tenantId, req.params.id);
    return res.json({ data: events });
  } catch (error) {
    const message = (error as Error).message;
    return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
  }
});

app.post(
  '/shipping/notifications',
  validateRequest(NotificationSchema),
  (req: Request, res: Response) => {
    try {
      const notification = service.sendNotification(req.body);
      return res.status(201).json({ data: notification });
    } catch (error) {
      const message = (error as Error).message;
      return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
    }
  }
);

const port = Number(process.env.PORT || process.env.SHIPPING_SERVICE_PORT || 3012);

let server: ReturnType<typeof app.listen> | undefined;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    logger.info(`shipping-service running on port ${port}`);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down shipping-service');
    server?.close(async () => {
      await closeRateLimiter();
      process.exit(0);
    });
  });
}

export default app;
