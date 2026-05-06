import express, { Request, Response } from 'express';
import axios from 'axios';
import { timingSafeEqual } from 'crypto';
import {
  Logger,
  validateRequest,
  PaymentCreateSchema,
  PaymentRefundSchema,
  PaymentSummaryQuerySchema,
  PaymentReceiptSchema,
  getApiLimiter,
  getPaymentLimiter,
  closeRateLimiter,
  initializeTracing,
} from '@t3ck/shared';
import { AbacatePayClient } from './abacatepay-client';
import { PaymentService } from './payment-service';
import { PaymentStateStore } from './payment-state-store';
import { WebhookSignatureVerifier } from './webhook-signature';

initializeTracing('payment-service');

const app: express.Application = express();
type RequestWithRawBody = Request & { rawBody?: string };

app.use(
  express.json({
    verify: (req, _res, buffer) => {
      (req as RequestWithRawBody).rawBody = buffer.toString('utf8');
    },
  })
);

const logger = new Logger('payment-service');
const port = Number(process.env.PORT || 3010);
const isProduction = process.env.NODE_ENV === 'production';
const paymentMockMode = String(process.env.PAYMENT_MOCK_MODE || 'true') === 'true';
const officialAbacatePayPublicKey =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

if (isProduction && !process.env.INTERNAL_SERVICE_TOKEN) {
  throw new Error('INTERNAL_SERVICE_TOKEN e obrigatorio em producao.');
}

if (isProduction && !process.env.ORDER_SERVICE_URL) {
  throw new Error('ORDER_SERVICE_URL e obrigatorio em producao.');
}

if (isProduction && !paymentMockMode) {
  if (!process.env.ABACATEPAY_API_KEY || process.env.ABACATEPAY_API_KEY === 'dev-key') {
    throw new Error('ABACATEPAY_API_KEY é obrigatório em produção.');
  }
  if (
    !process.env.ABACATEPAY_WEBHOOK_URL_SECRET ||
    process.env.ABACATEPAY_WEBHOOK_URL_SECRET === 'dev-webhook-url-secret'
  ) {
    throw new Error('ABACATEPAY_WEBHOOK_URL_SECRET é obrigatório em produção.');
  }
}

const abacateClient = new AbacatePayClient(
  process.env.ABACATEPAY_BASE_URL || 'https://api.abacatepay.com/v2',
  process.env.ABACATEPAY_API_KEY || 'dev-key'
);
const paymentStateFile =
  process.env.PAYMENT_STATE_FILE || (isProduction ? 'data/payment-service-state.json' : undefined);
const paymentService = new PaymentService(
  abacateClient,
  paymentStateFile ? new PaymentStateStore(paymentStateFile) : undefined
);
const webhookVerifier = new WebhookSignatureVerifier(
  process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY ||
    process.env.ABACATEPAY_WEBHOOK_SECRET ||
    officialAbacatePayPublicKey
);

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

function assertAllowedCheckoutUrls(body: Record<string, unknown>): void {
  const urls = [body.returnUrl, body.completionUrl].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  if (urls.length === 0) {
    return;
  }

  const allowedOrigins = String(process.env.PAYMENT_ALLOWED_RETURN_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    if (isProduction) {
      throw new Error('PAYMENT_ALLOWED_RETURN_ORIGINS e obrigatorio para URLs de retorno.');
    }
    return;
  }

  for (const url of urls) {
    const origin = new URL(url).origin;
    if (!allowedOrigins.includes(origin)) {
      throw new Error(`URL de retorno nao permitida: ${origin}`);
    }
  }
}

async function assertOrderConsistency(body: Record<string, unknown>): Promise<void> {
  const orderServiceUrl = process.env.ORDER_SERVICE_URL;
  if (!orderServiceUrl) {
    if (isProduction) {
      throw new Error('ORDER_SERVICE_URL e obrigatorio para validar pagamento.');
    }
    return;
  }

  const tenantId = String(body.tenantId || '');
  const orderId = String(body.orderId || '');
  const customerId = String(body.customerId || '');
  const amount = Number(body.amount);

  const response = await axios.get(`${orderServiceUrl}/orders/${orderId}`, {
    params: { tenantId },
    headers: getInternalHeaders(tenantId),
    timeout: 5000,
  });
  const order = response.data?.data as
    | {
        tenantId: string;
        customerId: string;
        total: number;
        status: string;
        paymentStatus?: string;
      }
    | undefined;

  if (!order) {
    throw new Error('Pedido nao encontrado para pagamento.');
  }
  if (order.tenantId !== tenantId || order.customerId !== customerId) {
    throw new Error('Pedido nao pertence ao tenant/cliente informado.');
  }
  if (order.status === 'cancelled') {
    throw new Error('Pedido cancelado nao pode ser pago.');
  }
  if (order.paymentStatus === 'PAID') {
    throw new Error('Pedido ja esta pago.');
  }
  if (Math.abs(Number(order.total) - amount) > 0.0001) {
    throw new Error('Valor do pagamento diverge do total do pedido.');
  }
}

function getNestedObject(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : undefined;
}

function parseWebhookPayload(body: Record<string, unknown>) {
  const data = getNestedObject(body, 'data');
  const transparent = getNestedObject(data, 'transparent');
  const checkout = getNestedObject(data, 'checkout');
  const paymentObject = transparent ?? checkout ?? data;
  const metadata =
    getNestedObject(paymentObject, 'metadata') ??
    getNestedObject(data, 'metadata') ??
    getNestedObject(body, 'metadata');
  const event = String(body.event || '');

  const eventStatus: Record<string, string> = {
    'checkout.completed': 'PAID',
    'checkout.disputed': 'UNDER_DISPUTE',
    'checkout.refunded': 'REFUNDED',
    'transparent.completed': 'PAID',
    'transparent.disputed': 'UNDER_DISPUTE',
    'transparent.refunded': 'REFUNDED',
  };
  const providerStatus =
    eventStatus[event] || String(paymentObject?.status || body.providerStatus || '').trim();

  return {
    eventId: body.id ? String(body.id) : undefined,
    tenantId: body.tenantId
      ? String(body.tenantId)
      : metadata?.tenantId
        ? String(metadata.tenantId)
        : undefined,
    paymentId: body.paymentId
      ? String(body.paymentId)
      : metadata?.paymentId
        ? String(metadata.paymentId)
        : undefined,
    providerPaymentId: paymentObject?.id ? String(paymentObject.id) : undefined,
    orderId: paymentObject?.externalId
      ? String(paymentObject.externalId)
      : metadata?.orderId
        ? String(metadata.orderId)
        : undefined,
    providerStatus,
    providerDisputeId: body.providerDisputeId ? String(body.providerDisputeId) : undefined,
    reason: body.reason ? String(body.reason) : data?.reason ? String(data.reason) : undefined,
    amount:
      typeof paymentObject?.amount === 'number'
        ? paymentObject.amount
        : typeof paymentObject?.paidAmount === 'number'
          ? paymentObject.paidAmount
          : Number(body.amount || 0),
  };
}

async function syncOrderPaymentStatus(input: {
  tenantId: string;
  orderId: string;
  paymentId: string;
  paymentStatus: string;
}) {
  const orderServiceUrl = process.env.ORDER_SERVICE_URL;
  if (!orderServiceUrl) {
    return;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await axios.patch(
        `${orderServiceUrl}/orders/${input.orderId}/payment-status`,
        {
          tenantId: input.tenantId,
          paymentId: input.paymentId,
          paymentStatus: input.paymentStatus,
        },
        {
          headers: getInternalHeaders(input.tenantId),
          timeout: 5000,
        }
      );
      return;
    } catch (error) {
      logger.error('Falha ao sincronizar status do pedido', {
        tenantId: input.tenantId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        attempt,
        error: error instanceof Error ? error.message : 'unknown',
      });

      if (attempt === 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'payment-service' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'payment-service',
    status: 'running',
    endpoints: {
      health: '/health',
      payments: '/payments',
      reports: '/payments/reports/summary',
    },
  });
});

app.use(getApiLimiter());
app.use('/payments', getPaymentLimiter());
app.use((req: Request, res: Response, next) => {
  if (req.path === '/health' || req.path === '/' || req.path === '/payments/webhook') {
    return next();
  }
  if (!requireInternalAccess(req, res)) {
    return undefined;
  }
  return next();
});

app.post('/payments', validateRequest(PaymentCreateSchema), async (req: Request, res: Response) => {
  try {
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'Header Idempotency-Key é obrigatório para evitar cobrança duplicada.',
      });
    }

    assertAllowedCheckoutUrls(req.body);
    await assertOrderConsistency(req.body);

    const result = await paymentService.createPayment(req.body, idempotencyKey);
    await syncOrderPaymentStatus({
      tenantId: req.body.tenantId,
      orderId: req.body.orderId,
      paymentId: result.paymentId,
      paymentStatus: result.status,
    });

    return res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao processar pagamento.';
    const friendly =
      message.includes('Idempotency') || message.includes('idempotency')
        ? message
        : 'Não foi possível iniciar o pagamento. Tente novamente em instantes.';
    return res.status(400).json({ error: friendly });
  }
});

app.get('/payments/:paymentId/pix-timer', (req: Request, res: Response) => {
  try {
    const result = paymentService.checkPixExpiration(req.params.paymentId);
    return res.json(result);
  } catch (error) {
    return res
      .status(404)
      .json({ error: error instanceof Error ? error.message : 'Pagamento não encontrado.' });
  }
});

app.get('/payments/:paymentId/status', async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.query.tenantId || req.headers['x-tenant-id'] || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório.' });
    }

    const status = await paymentService.syncPaymentStatus(req.params.paymentId, tenantId);
    const payment = paymentService.getPayment(req.params.paymentId);
    if (payment) {
      await syncOrderPaymentStatus({
        tenantId,
        orderId: payment.orderId,
        paymentId: payment.paymentId,
        paymentStatus: status,
      });
    }

    return res.json({ paymentId: req.params.paymentId, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar status.';
    return res.status(message.includes('não encontrado') ? 404 : 400).json({ error: message });
  }
});

app.post('/payments/:paymentId/confirm', async (req: Request, res: Response) => {
  try {
    const tenantId = String(
      req.body.tenantId || req.query.tenantId || req.headers['x-tenant-id'] || ''
    );
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId e obrigatorio.' });
    }

    const status = await paymentService.syncPaymentStatus(req.params.paymentId, tenantId);
    const payment = paymentService.getPayment(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Pagamento nao encontrado.' });
    }

    await syncOrderPaymentStatus({
      tenantId,
      orderId: payment.orderId,
      paymentId: payment.paymentId,
      paymentStatus: status,
    });

    return res.json({
      paymentId: req.params.paymentId,
      providerPaymentId: payment.providerPaymentId,
      orderId: payment.orderId,
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao confirmar pagamento.';
    return res.status(message.includes('encontrado') ? 404 : 400).json({ error: message });
  }
});

app.get('/payments/:paymentId/pix-copy-paste', (req: Request, res: Response) => {
  const payment = paymentService.getPayment(req.params.paymentId);
  if (!payment) {
    return res.status(404).json({ error: 'Pagamento não encontrado.' });
  }
  if (payment.method !== 'pix') {
    return res.status(400).json({ error: 'Pagamento não é do tipo Pix.' });
  }

  return res.json({
    paymentId: payment.paymentId,
    copyPasteCode: payment.pixCopyPasteCode,
    expiresAt: payment.pixExpiresAt,
  });
});

app.post(
  '/payments/refund',
  validateRequest(PaymentRefundSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await paymentService.refund(req.body);
      return res.json(result);
    } catch (error) {
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Falha no estorno.' });
    }
  }
);

app.post('/payments/invoice', (req: Request, res: Response) => {
  try {
    const paymentId = String(req.body.paymentId || '');
    if (!paymentId) {
      return res.status(400).json({ error: 'paymentId é obrigatório.' });
    }
    const invoice = paymentService.createInvoice(paymentId);
    return res.status(201).json(invoice);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Falha ao gerar invoice.' });
  }
});

app.post(
  '/payments/receipt',
  validateRequest(PaymentReceiptSchema),
  (req: Request, res: Response) => {
    try {
      const result = paymentService.sendReceipt(req.body.paymentId, req.body.email);
      return res.json(result);
    } catch (error) {
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Falha ao enviar recibo.' });
    }
  }
);

app.post('/payments/webhook', async (req: Request, res: Response) => {
  const urlSecret = String(req.query.webhookSecret || '');
  const expectedUrlSecret = process.env.ABACATEPAY_WEBHOOK_URL_SECRET || 'dev-webhook-url-secret';
  if (expectedUrlSecret !== 'dev-webhook-url-secret' && urlSecret !== expectedUrlSecret) {
    return res.status(401).json({ error: 'Secret de webhook inválido.' });
  }

  const signature = String(
    req.headers['x-webhook-signature'] || req.headers['x-abacatepay-signature'] || ''
  );
  const raw = (req as RequestWithRawBody).rawBody || '';

  if (!webhookVerifier.verify(raw, signature)) {
    return res.status(401).json({ error: 'Assinatura de webhook inválida.' });
  }

  try {
    const parsed = parseWebhookPayload(req.body);
    if (!parsed.providerStatus) {
      return res.status(400).json({ error: 'Status do pagamento não informado no webhook.' });
    }

    const result = paymentService.processWebhookUpdate({
      tenantId: parsed.tenantId,
      paymentId: parsed.paymentId,
      providerPaymentId: parsed.providerPaymentId,
      orderId: parsed.orderId,
      eventId: parsed.eventId,
      providerStatus: parsed.providerStatus,
      rawPayload: req.body,
    });

    if (!result.duplicate) {
      await syncOrderPaymentStatus({
        tenantId: result.tenantId,
        orderId: result.orderId,
        paymentId: result.paymentId,
        paymentStatus: result.status,
      });
    }

    if (!result.duplicate && result.status === 'CHARGEBACK') {
      paymentService.handleChargeback({
        tenantId: result.tenantId,
        paymentId: result.paymentId,
        providerDisputeId: parsed.providerDisputeId || parsed.providerPaymentId || 'unknown',
        reason: parsed.reason || 'not_provided',
        amount: parsed.amount,
        receivedAt: new Date().toISOString(),
      });
    }

    return res.json({ status: result.status });
  } catch (error) {
    return res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Falha ao processar webhook.' });
  }
});

app.get('/payments/logs', (req: Request, res: Response) => {
  const tenantId = String(req.query.tenantId || '');
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId é obrigatório.' });
  }

  return res.json({
    integrityOk: paymentService.verifyAuditTrailIntegrity(),
    logs: paymentService.getTransactionLogs(tenantId),
  });
});

app.get(
  '/payments/reports/summary',
  validateRequest(PaymentSummaryQuerySchema),
  (req: Request, res: Response) => {
    const tenantId = String(req.query.tenantId);
    const period = String(req.query.period) as 'daily' | 'monthly';
    const summary = paymentService.getFinancialSummary(tenantId, period);
    return res.json(summary);
  }
);

let server: ReturnType<typeof app.listen> | undefined;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    logger.info(`payment-service running on port ${port}`);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down payment-service');
    server?.close(async () => {
      await closeRateLimiter();
      process.exit(0);
    });
  });
}

export default app;
