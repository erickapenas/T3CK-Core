import request from 'supertest';

describe('E2E Business Flows', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENT_MOCK_MODE = 'true';
  });

  it('Cart -> Checkout -> Payment', async () => {
    const [{ default: paymentApp }] = await Promise.all([
      import('../../services/payment-service/src/index'),
    ]);

    const cart = {
      tenantId: 'tenant-e2e',
      customerId: 'customer-e2e',
      items: [{ productId: 'p1', quantity: 2, unitPrice: 50 }],
    };

    const checkoutTotal = cart.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    const payment = await request(paymentApp)
      .post('/payments')
      .set('Idempotency-Key', 'e2e-cart-checkout-payment')
      .send({
        tenantId: cart.tenantId,
        orderId: 'order-e2e-1',
        customerId: cart.customerId,
        amount: checkoutTotal,
        currency: 'BRL',
        method: 'pix',
      });

    expect(payment.status).toBe(201);
    expect(payment.body.amount).toBe(checkoutTotal);
  });

  it('Order Management flow', async () => {
    const { default: orderApp } = await import('../../services/order-service/src/index');

    const created = await request(orderApp)
      .post('/orders')
      .send({
        tenantId: 'tenant-e2e-order',
        customerId: 'customer-e2e-order',
        items: [{ productId: 'p2', name: 'Produto', quantity: 1, unitPrice: 100 }],
      });

    expect(created.status).toBe(201);

    const orderId = created.body.data.id;

    const updated = await request(orderApp)
      .patch(`/orders/${orderId}/status`)
      .send({ tenantId: 'tenant-e2e-order', status: 'confirmed' });

    expect(updated.status).toBe(200);

    const listed = await request(orderApp)
      .get('/orders')
      .query({ tenantId: 'tenant-e2e-order', status: 'confirmed' });

    expect(listed.status).toBe(200);
    expect(listed.body.data.some((item: { id: string }) => item.id === orderId)).toBe(true);
  });

  it('Admin Dashboard flow', async () => {
    const { default: adminApp } = await import('../../services/admin-service/src/index');

    const dashboard = await request(adminApp)
      .get('/api/admin/dashboard')
      .set('X-Tenant-ID', 'tenant-demo');

    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.kpis).toBeDefined();
  });
});
