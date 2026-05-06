import request from 'supertest';

describe('order-service HTTP integration', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_STORE = 'memory';
  });

  it('creates order, updates status, returns history and analytics', async () => {
    const { default: app } = await import('../index');

    const created = await request(app)
      .post('/orders')
      .send({
        tenantId: 'tenant-http',
        customerId: 'customer-http',
        shippingCost: 15,
        items: [{ productId: 'p1', name: 'Produto 1', quantity: 2, unitPrice: 50 }],
      });

    expect(created.status).toBe(201);
    expect(created.body.data.id).toBeDefined();

    const orderId = created.body.data.id as string;

    const statusUpdated = await request(app)
      .patch(`/orders/${orderId}/status`)
      .send({ tenantId: 'tenant-http', status: 'confirmed' });

    expect(statusUpdated.status).toBe(200);
    expect(statusUpdated.body.data.status).toBe('confirmed');

    const history = await request(app)
      .get(`/orders/${orderId}/history`)
      .query({ tenantId: 'tenant-http' });

    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(2);

    const analytics = await request(app)
      .get('/orders/analytics/summary')
      .query({ tenantId: 'tenant-http', period: 'daily' });

    expect(analytics.status).toBe(200);
    expect(analytics.body.data.totalOrders).toBeGreaterThanOrEqual(1);
  });

  it('cancels order', async () => {
    const { default: app } = await import('../index');

    const created = await request(app)
      .post('/orders')
      .send({
        tenantId: 'tenant-http-cancel',
        customerId: 'customer-http-cancel',
        items: [{ productId: 'p2', name: 'Produto 2', quantity: 1, unitPrice: 99 }],
      });

    const orderId = created.body.data.id as string;

    const cancelled = await request(app)
      .post(`/orders/${orderId}/cancel`)
      .send({ tenantId: 'tenant-http-cancel', reason: 'customer_request' });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');
  });
});
