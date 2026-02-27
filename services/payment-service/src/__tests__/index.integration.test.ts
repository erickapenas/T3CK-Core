import request from 'supertest';
import { WebhookSignatureVerifier } from '../webhook-signature';

describe('payment-service HTTP integration', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENT_MOCK_MODE = 'true';
    process.env.ABACATEPAY_WEBHOOK_SECRET = 'integration-webhook-secret';
    process.env.CHECKOUT_MERCHANT_NAME = 'T3CK Test';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createPayload = () => ({
    tenantId: 'tenant-integration',
    orderId: 'order-1',
    customerId: 'customer-1',
    amount: 199,
    currency: 'BRL',
    method: 'pix',
    description: 'Teste integração',
    dueMinutes: 10,
  });

  it('creates payment and replays same response with idempotency key', async () => {
    const { default: app } = await import('../index');
    const payload = createPayload();

    const first = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-1')
      .send(payload);

    const second = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-1')
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.paymentId).toBeDefined();
    expect(second.body.paymentId).toBe(first.body.paymentId);
    expect(first.body.status).toBe('AWAITING_PAYMENT');
  });

  it('returns 400 when idempotency header is missing', async () => {
    const { default: app } = await import('../index');

    const response = await request(app)
      .post('/payments')
      .send(createPayload());

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Idempotency-Key');
  });

  it('processes signed webhook and updates status to PAID', async () => {
    const { default: app } = await import('../index');
    const created = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-2')
      .send(createPayload());

    const webhookBody = {
      tenantId: 'tenant-integration',
      paymentId: created.body.paymentId,
      providerStatus: 'paid',
      providerDisputeId: 'disp-x',
      amount: 199,
      reason: 'none',
    };

    const verifier = new WebhookSignatureVerifier('integration-webhook-secret');
    const signature = verifier.sign(JSON.stringify(webhookBody));

    const webhookResponse = await request(app)
      .post('/payments/webhook')
      .set('x-abacatepay-signature', signature)
      .send(webhookBody);

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.body.status).toBe('PAID');
  });

  it('rejects webhook when signature is invalid', async () => {
    const { default: app } = await import('../index');

    const webhookResponse = await request(app)
      .post('/payments/webhook')
      .set('x-abacatepay-signature', 'invalid-signature')
      .send({
        tenantId: 'tenant-integration',
        paymentId: 'pay_missing',
        providerStatus: 'paid',
      });

    expect(webhookResponse.status).toBe(401);
  });

  it('handles refund endpoint and returns REFUNDED', async () => {
    const { default: app } = await import('../index');
    const created = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-3')
      .send(createPayload());

    const refundResponse = await request(app)
      .post('/payments/refund')
      .send({
        tenantId: 'tenant-integration',
        paymentId: created.body.paymentId,
        reason: 'customer_request',
        amount: 199,
      });

    expect(refundResponse.status).toBe(200);
    expect(refundResponse.body.status).toBe('REFUNDED');
  });

  it('handles chargeback via webhook and exposes it in summary', async () => {
    const { default: app } = await import('../index');

    const created = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-4')
      .send(createPayload());

    const webhookBody = {
      tenantId: 'tenant-integration',
      paymentId: created.body.paymentId,
      providerStatus: 'chargeback',
      providerDisputeId: 'disp-123',
      amount: 199,
      reason: 'fraud',
    };

    const verifier = new WebhookSignatureVerifier('integration-webhook-secret');
    const signature = verifier.sign(JSON.stringify(webhookBody));

    const webhookResponse = await request(app)
      .post('/payments/webhook')
      .set('x-abacatepay-signature', signature)
      .send(webhookBody);

    expect(webhookResponse.status).toBe(200);

    const summaryResponse = await request(app)
      .get('/payments/reports/summary')
      .query({ tenantId: 'tenant-integration', period: 'daily' });

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.totalChargeback).toBeGreaterThanOrEqual(199);
  });
});