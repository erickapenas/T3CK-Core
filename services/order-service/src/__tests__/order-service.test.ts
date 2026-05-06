import { OrderService } from '../order-service';

describe('OrderService', () => {
  const tenantId = 'tenant-1';
  const customerId = 'customer-1';
  let service: OrderService;

  beforeEach(() => {
    service = new OrderService();
  });

  it('supports order creation and retrieval', () => {
    const order = service.createOrder({
      tenantId,
      customerId,
      shippingCost: 10,
      items: [{ productId: 'p1', name: 'Produto 1', quantity: 2, unitPrice: 50 }],
    });

    expect(order.id).toBeDefined();
    expect(order.total).toBe(110);
    expect(service.getOrder(tenantId, order.id)?.id).toBe(order.id);
  });

  it('supports order status tracking and history', () => {
    const order = service.createOrder({
      tenantId,
      customerId,
      items: [{ productId: 'p1', name: 'Produto 1', quantity: 1, unitPrice: 100 }],
    });

    service.updateStatus(tenantId, order.id, 'confirmed');
    service.updateStatus(tenantId, order.id, 'processing');
    service.updateStatus(tenantId, order.id, 'shipped');

    const history = service.getOrderHistory(tenantId, order.id);
    expect(history.length).toBeGreaterThanOrEqual(4);
    expect(history[history.length - 1].to).toBe('shipped');
  });

  it('supports cancellation', () => {
    const order = service.createOrder({
      tenantId,
      customerId,
      items: [{ productId: 'p2', name: 'Produto 2', quantity: 1, unitPrice: 100 }],
    });

    const cancelled = service.cancelOrder(tenantId, order.id, 'customer_request');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancellationReason).toBe('customer_request');
  });

  it('returns analytics', () => {
    service.createOrder({
      tenantId,
      customerId,
      items: [{ productId: 'p1', name: 'Produto 1', quantity: 1, unitPrice: 100 }],
    });
    service.createOrder({
      tenantId,
      customerId,
      items: [{ productId: 'p2', name: 'Produto 2', quantity: 1, unitPrice: 200 }],
    });

    const analytics = service.getAnalytics(tenantId, 'daily');
    expect(analytics.totalOrders).toBe(2);
    expect(analytics.totalRevenue).toBe(300);
  });

  it('lists order history by customer and status', () => {
    const orderA = service.createOrder({
      tenantId,
      customerId,
      items: [{ productId: 'p1', name: 'Produto 1', quantity: 1, unitPrice: 100 }],
    });
    const orderB = service.createOrder({
      tenantId,
      customerId: 'customer-2',
      items: [{ productId: 'p2', name: 'Produto 2', quantity: 1, unitPrice: 200 }],
    });

    service.updateStatus(tenantId, orderA.id, 'confirmed');

    const byCustomer = service.listOrders(tenantId, { customerId });
    const byStatus = service.listOrders(tenantId, { status: 'confirmed' });

    expect(byCustomer.some((item) => item.id === orderA.id)).toBe(true);
    expect(byCustomer.some((item) => item.id === orderB.id)).toBe(false);
    expect(byStatus.some((item) => item.id === orderA.id)).toBe(true);
  });
});
