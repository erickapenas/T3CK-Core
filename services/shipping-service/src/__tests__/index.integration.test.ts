import request from 'supertest';

describe('shipping-service HTTP integration', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_STORE = 'memory';
  });

  it('calculates shipping and runs carrier integration', async () => {
    const { default: app } = await import('../index');

    const calc = await request(app)
      .post('/shipping/calculate')
      .send({
        tenantId: 'tenant-http',
        orderId: 'order-http',
        destinationZip: '01000-000',
        weightKg: 2,
        dimensionsCm: { length: 20, width: 20, height: 20 },
      });

    expect(calc.status).toBe(200);
    expect(calc.body.data.length).toBeGreaterThan(0);

    const carrier = await request(app)
      .post('/shipping/integrate-carrier')
      .send({ tenantId: 'tenant-http', orderId: 'order-http', carrier: 'correios' });

    expect(carrier.status).toBe(200);
    expect(carrier.body.data.success).toBe(true);
  });

  it('creates shipment, generates label, updates tracking and sends notifications', async () => {
    const { default: app } = await import('../index');

    const created = await request(app)
      .post('/shipping/shipments')
      .send({
        tenantId: 'tenant-http-ship',
        orderId: 'order-http-ship',
        carrier: 'loggi',
        serviceLevel: 'express',
      });

    expect(created.status).toBe(201);
    const shipmentId = created.body.data.shipmentId as string;

    const label = await request(app)
      .post(`/shipping/shipments/${shipmentId}/label`)
      .send({ tenantId: 'tenant-http-ship' });

    expect(label.status).toBe(200);
    expect(label.body.data.labelUrl).toContain(shipmentId);

    const trackingUpdate = await request(app)
      .patch(`/shipping/shipments/${shipmentId}/tracking`)
      .send({
        tenantId: 'tenant-http-ship',
        status: 'in_transit',
        location: 'São Paulo',
        message: 'Saiu da central',
      });

    expect(trackingUpdate.status).toBe(200);
    expect(trackingUpdate.body.data.status).toBe('in_transit');

    const tracking = await request(app)
      .get(`/shipping/shipments/${shipmentId}/tracking`)
      .query({ tenantId: 'tenant-http-ship' });

    expect(tracking.status).toBe(200);
    expect(tracking.body.data.length).toBeGreaterThanOrEqual(2);

    const notification = await request(app)
      .post('/shipping/notifications')
      .send({
        tenantId: 'tenant-http-ship',
        shipmentId,
        channel: 'email',
        recipient: 'customer@test.com',
        message: 'Seu pedido está em trânsito',
      });

    expect(notification.status).toBe(201);
    expect(notification.body.data.id).toBeDefined();
  });
});