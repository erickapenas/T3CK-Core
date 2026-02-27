import { ShippingService } from '../shipping-service';

describe('ShippingService', () => {
  const tenantId = 'tenant-1';
  let service: ShippingService;

  beforeEach(() => {
    service = new ShippingService();
  });

  it('calculates shipping options', () => {
    const options = service.calculateOptions({
      tenantId,
      orderId: 'order-1',
      destinationZip: '01000-000',
      weightKg: 2,
      dimensionsCm: { length: 20, width: 20, height: 20 },
    });

    expect(options.length).toBe(3);
    expect(options[0].amount).toBeGreaterThan(0);
  });

  it('integrates carrier (mock integration)', () => {
    const result = service.integrateCarrier(tenantId, 'order-1', 'correios');
    expect(result.success).toBe(true);
    expect(result.externalReference).toContain('correios');
  });

  it('creates shipment and generates label', () => {
    const shipment = service.createShipment({
      tenantId,
      orderId: 'order-1',
      carrier: 'loggi',
      serviceLevel: 'express',
    });

    const label = service.generateLabel(tenantId, shipment.shipmentId);
    const loaded = service.getShipment(tenantId, shipment.shipmentId);

    expect(label.labelUrl).toContain(shipment.shipmentId);
    expect(loaded?.status).toBe('label_generated');
  });

  it('supports tracking API', () => {
    const shipment = service.createShipment({
      tenantId,
      orderId: 'order-2',
      carrier: 'melhor_envio',
      serviceLevel: 'standard',
    });

    service.updateTracking(tenantId, shipment.shipmentId, 'in_transit', 'São Paulo', 'Saiu da central');
    service.updateTracking(tenantId, shipment.shipmentId, 'out_for_delivery', 'Campinas', 'Em rota');

    const tracking = service.getTracking(tenantId, shipment.shipmentId);
    expect(tracking.length).toBeGreaterThanOrEqual(3);
    expect(tracking[tracking.length - 1].status).toBe('out_for_delivery');
  });

  it('sends shipping notifications', () => {
    const shipment = service.createShipment({
      tenantId,
      orderId: 'order-3',
      carrier: 'correios',
      serviceLevel: 'economy',
    });

    const notification = service.sendNotification({
      tenantId,
      shipmentId: shipment.shipmentId,
      channel: 'email',
      recipient: 'user@test.com',
      message: 'Seu pedido saiu para entrega',
    });

    const list = service.listNotifications(tenantId, shipment.shipmentId);

    expect(notification.id).toBeDefined();
    expect(list).toHaveLength(1);
    expect(list[0].channel).toBe('email');
  });
});