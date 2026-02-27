import express, { Request, Response } from 'express';
import {
  Logger,
  validateRequest,
  PaymentCreateSchema,
  PaymentRefundSchema,
  PaymentWebhookSchema,
  PaymentSummaryQuerySchema,
  PaymentReceiptSchema,
  getApiLimiter,
  getPaymentLimiter,
  closeRateLimiter,
  initializeTracing,
} from '@t3ck/shared';
import { AbacatePayClient } from './abacatepay-client';
import { PaymentService } from './payment-service';
import { WebhookSignatureVerifier } from './webhook-signature';

initializeTracing('payment-service');

const app: express.Application = express();
app.use(express.json());

const logger = new Logger('payment-service');
const port = Number(process.env.PORT || 3010);

const abacateClient = new AbacatePayClient(
  process.env.ABACATEPAY_BASE_URL || 'https://sandbox.api.abacatepay.com',
  process.env.ABACATEPAY_API_KEY || 'dev-key'
);
const paymentService = new PaymentService(abacateClient);
const webhookVerifier = new WebhookSignatureVerifier(
  process.env.ABACATEPAY_WEBHOOK_SECRET || 'dev-webhook-secret'
);

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

app.post('/payments', validateRequest(PaymentCreateSchema), async (req: Request, res: Response) => {
  try {
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'Header Idempotency-Key é obrigatório para evitar cobrança duplicada.',
      });
    }

    const result = await paymentService.createPayment(req.body, idempotencyKey);
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
    return res.status(404).json({ error: error instanceof Error ? error.message : 'Pagamento não encontrado.' });
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
    copyPasteCode: `PIX:${payment.providerPaymentId}`,
    expiresAt: payment.pixExpiresAt,
  });
});

app.post('/payments/refund', validateRequest(PaymentRefundSchema), async (req: Request, res: Response) => {
  try {
    const result = await paymentService.refund(req.body);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Falha no estorno.' });
  }
});

app.post('/payments/invoice', (req: Request, res: Response) => {
  try {
    const paymentId = String(req.body.paymentId || '');
    if (!paymentId) {
      return res.status(400).json({ error: 'paymentId é obrigatório.' });
    }
    const invoice = paymentService.createInvoice(paymentId);
    return res.status(201).json(invoice);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Falha ao gerar invoice.' });
  }
});

app.post('/payments/receipt', validateRequest(PaymentReceiptSchema), (req: Request, res: Response) => {
  try {
    const result = paymentService.sendReceipt(req.body.paymentId, req.body.email);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Falha ao enviar recibo.' });
  }
});

app.post('/payments/webhook', validateRequest(PaymentWebhookSchema), (req: Request, res: Response) => {
  const signature = String(req.headers['x-abacatepay-signature'] || '');
  const raw = JSON.stringify(req.body);

  if (!webhookVerifier.verify(raw, signature)) {
    return res.status(401).json({ error: 'Assinatura de webhook inválida.' });
  }

  try {
    const mapped = paymentService.processWebhookUpdate({
      tenantId: req.body.tenantId,
      paymentId: req.body.paymentId,
      providerStatus: req.body.providerStatus,
      rawPayload: req.body,
    });

    if (req.body.providerStatus === 'chargeback') {
      paymentService.handleChargeback({
        tenantId: req.body.tenantId,
        paymentId: req.body.paymentId,
        providerDisputeId: String(req.body.providerDisputeId || 'unknown'),
        reason: String(req.body.reason || 'not_provided'),
        amount: Number(req.body.amount || 0),
        receivedAt: new Date().toISOString(),
      });
    }

    return res.json({ status: mapped });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Falha ao processar webhook.' });
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

app.get('/payments/reports/summary', validateRequest(PaymentSummaryQuerySchema), (req: Request, res: Response) => {
  const tenantId = String(req.query.tenantId);
  const period = String(req.query.period) as 'daily' | 'monthly';
  const summary = paymentService.getFinancialSummary(tenantId, period);
  return res.json(summary);
});

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
