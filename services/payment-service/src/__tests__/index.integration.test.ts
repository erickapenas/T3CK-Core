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

  let payloadCounter = 0;
  const createPayload = () => ({
    tenantId: 'tenant-integration',
    orderId: `order-${++payloadCounter}`,
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

    const response = await request(app).post('/payments').send(createPayload());

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

  it('verifies webhook signature against raw request body', async () => {
    const { default: app } = await import('../index');
    const created = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-raw-webhook')
      .send(createPayload());

    const rawWebhookBody = `{"tenantId":"tenant-integration", "paymentId":"${created.body.paymentId}", "providerStatus":"paid"}`;
    const verifier = new WebhookSignatureVerifier('integration-webhook-secret');
    const signature = verifier.sign(rawWebhookBody);

    const webhookResponse = await request(app)
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-abacatepay-signature', signature)
      .send(rawWebhookBody);

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.body.status).toBe('PAID');
  });

  it('returns current payment status by tenant', async () => {
    const { default: app } = await import('../index');
    const created = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-status')
      .send(createPayload());

    const statusResponse = await request(app)
      .get(`/payments/${created.body.paymentId}/status`)
      .query({ tenantId: 'tenant-integration' });

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.status).toBe('AWAITING_PAYMENT');
  });

  it('confirms payment status and returns provider reference', async () => {
    const { default: app } = await import('../index');
    const created = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-confirm')
      .send(createPayload());

    const confirmResponse = await request(app)
      .post(`/payments/${created.body.paymentId}/confirm`)
      .send({ tenantId: 'tenant-integration' });

    expect(confirmResponse.status).toBe(200);
    expect(confirmResponse.body.paymentId).toBe(created.body.paymentId);
    expect(confirmResponse.body.providerPaymentId).toBe(created.body.providerPaymentId);
    expect(confirmResponse.body.status).toBe('AWAITING_PAYMENT');
  });

  it('creates hosted checkout for card payments', async () => {
    const { default: app } = await import('../index');
    const response = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-hosted-checkout')
      .send({
        ...createPayload(),
        method: 'card',
        checkoutItems: [{ id: 'prod_test_1', quantity: 1 }],
        returnUrl: 'https://store.test/checkout/return',
        completionUrl: 'https://store.test/checkout/success',
        maxInstallments: 3,
      });

    expect(response.status).toBe(201);
    expect(response.body.hostedCheckout.url).toContain('https://app.abacatepay.com/pay/');
    expect(response.body.pix).toBeUndefined();
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

    const paidWebhookBody = {
      tenantId: 'tenant-integration',
      paymentId: created.body.paymentId,
      providerStatus: 'paid',
    };
    const verifier = new WebhookSignatureVerifier('integration-webhook-secret');
    const paidSignature = verifier.sign(JSON.stringify(paidWebhookBody));
    await request(app)
      .post('/payments/webhook')
      .set('x-abacatepay-signature', paidSignature)
      .send(paidWebhookBody);

    const refundResponse = await request(app).post('/payments/refund').send({
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

  it('accepts official checkout.completed webhook payload shape', async () => {
    const { default: app } = await import('../index');
    const payload = {
      ...createPayload(),
      method: 'card',
      checkoutItems: [{ id: 'prod_test_1', quantity: 1 }],
    };

    const created = await request(app)
      .post('/payments')
      .set('Idempotency-Key', 'http-idem-official-checkout-webhook')
      .send(payload);

    const webhookBody = {
      id: 'log_official_checkout_1',
      event: 'checkout.completed',
      apiVersion: 2,
      devMode: true,
      data: {
        checkout: {
          id: created.body.providerPaymentId,
          externalId: payload.orderId,
          amount: 199,
          status: 'PAID',
          metadata: {
            tenantId: 'tenant-integration',
            orderId: payload.orderId,
            paymentId: created.body.paymentId,
          },
        },
      },
    };

    const verifier = new WebhookSignatureVerifier('integration-webhook-secret');
    const signature = verifier.sign(JSON.stringify(webhookBody));

    const webhookResponse = await request(app)
      .post('/payments/webhook')
      .set('x-webhook-signature', signature)
      .send(webhookBody);

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.body.status).toBe('PAID');
  });
});
