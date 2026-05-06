import request from 'supertest';

describe('Order + Payment integration', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENT_MOCK_MODE = 'true';
    process.env.ABACATEPAY_WEBHOOK_SECRET = 'integration-secret';
  });

  it('creates order and then processes payment for same tenant/order', async () => {
    const [{ default: orderApp }, { default: paymentApp }] = await Promise.all([
      import('../index'),
      import('../../../payment-service/src/index'),
    ]);

    const orderRes = await request(orderApp)
      .post('/orders')
      .send({
        tenantId: 'tenant-flow',
        customerId: 'customer-flow',
        items: [{ productId: 'p1', name: 'Produto 1', quantity: 1, unitPrice: 100 }],
      });

    expect(orderRes.status).toBe(201);

    const paymentRes = await request(paymentApp)
      .post('/payments')
      .set('Idempotency-Key', 'order-payment-flow-1')
      .send({
        tenantId: 'tenant-flow',
        orderId: orderRes.body.data.id,
        customerId: 'customer-flow',
        amount: 100,
        currency: 'BRL',
        method: 'pix',
        description: 'Pagamento pedido fluxo',
      });

    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.status).toBe('AWAITING_PAYMENT');
    expect(paymentRes.body.paymentId).toBeDefined();

    const paymentStatusRes = await request(orderApp)
      .patch(`/orders/${orderRes.body.data.id}/payment-status`)
      .send({
        tenantId: 'tenant-flow',
        paymentId: paymentRes.body.paymentId,
        paymentStatus: paymentRes.body.status,
      });

    expect(paymentStatusRes.status).toBe(200);
    expect(paymentStatusRes.body.data.paymentId).toBe(paymentRes.body.paymentId);
    expect(paymentStatusRes.body.data.paymentStatus).toBe('AWAITING_PAYMENT');
  });
});
