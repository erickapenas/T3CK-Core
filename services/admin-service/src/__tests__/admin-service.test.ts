import { AdminService } from '../admin-service';

describe('AdminService', () => {
  let service: AdminService;
  const tenantId = 'tenant-test';

  beforeEach(() => {
    service = new AdminService();
  });

  it('supports product management', () => {
    const created = service.createProduct({
      tenantId,
      name: 'Produto A',
      sku: 'PROD-A',
      price: 100,
      stock: 10,
      status: 'active',
      category: 'geral',
    });

    expect(created.id).toBeDefined();

    const updated = service.updateProduct(tenantId, created.id, { stock: 8 });
    expect(updated.stock).toBe(8);

    const list = service.listProducts(tenantId);
    expect(list).toHaveLength(1);

    const deleted = service.deleteProduct(tenantId, created.id);
    expect(deleted).toBe(true);
  });

  it('supports order and customer management', () => {
    const customer = service.createCustomer({
      tenantId,
      name: 'Cliente 1',
      email: 'cliente1@test.com',
      phone: '11999999999',
    });

    const order = service.createOrder({
      tenantId,
      customerId: customer.id,
      items: [{ productId: 'p1', quantity: 2, price: 50 }],
      total: 100,
      status: 'pending',
    });

    expect(order.id).toBeDefined();

    const updatedOrder = service.updateOrder(tenantId, order.id, { status: 'completed' });
    expect(updatedOrder.status).toBe('completed');

    const updatedCustomer = service.updateCustomer(tenantId, customer.id, { totalSpent: 100, totalOrders: 1 });
    expect(updatedCustomer.totalSpent).toBe(100);
  });

  it('supports analytics, reports and dashboard', () => {
    service.createCustomer({
      tenantId,
      name: 'Cliente 2',
      email: 'cliente2@test.com',
    });

    service.createOrder({
      tenantId,
      customerId: 'customer-x',
      items: [{ productId: 'product-x', quantity: 1, price: 120 }],
      total: 120,
      status: 'completed',
    });

    const analytics = service.getAnalytics(tenantId, '2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z');
    expect(analytics.sales.totalRevenue).toBeGreaterThanOrEqual(120);

    const report = service.generateReport(tenantId, 'sales');
    expect(report.reportType).toBe('sales');

    const dashboard = service.getDashboard(tenantId);
    expect(dashboard.kpis.orders).toBeGreaterThan(0);
  });

  it('supports settings, users and audit logs', () => {
    const settings = service.updateSettings(tenantId, { currency: 'USD', lowStockThreshold: 3 });
    expect(settings.currency).toBe('USD');

    const user = service.createUser({
      tenantId,
      name: 'Gestor',
      email: 'gestor@test.com',
      role: 'manager',
      active: true,
    });

    const updated = service.updateUser(tenantId, user.id, { role: 'admin' });
    expect(updated.role).toBe('admin');

    const logs = service.listAuditLogs(tenantId);
    expect(logs.length).toBeGreaterThan(0);

    const deleted = service.deleteUser(tenantId, user.id);
    expect(deleted).toBe(true);
  });

  it('supports tenant configuration management', () => {
    const current = service.getTenantConfiguration(tenantId);
    expect(current.tenantId).toBe(tenantId);
    expect(current.displayName).toContain(tenantId);

    const updated = service.updateTenantConfiguration(tenantId, {
      displayName: 'T3CK Store BR',
      supportEmail: 'suporte@t3ck.com',
      customDomain: 'admin.t3ck.com',
      locale: 'pt-BR',
      maintenanceMode: true,
    });

    expect(updated.displayName).toBe('T3CK Store BR');
    expect(updated.supportEmail).toBe('suporte@t3ck.com');
    expect(updated.customDomain).toBe('admin.t3ck.com');
    expect(updated.maintenanceMode).toBe(true);

    const logs = service.listAuditLogs(tenantId);
    expect(logs.some((log) => log.action === 'tenant.configuration.updated')).toBe(true);
  });
});
