type FirestoreMock = ReturnType<typeof createFirestoreMock>;

let mockFirestore: FirestoreMock;

function createFirestoreMock() {
  const store = new Map<string, Record<string, unknown>>();

  const collection = (path: string): any => {
    const listDocs = () => {
      const prefix = `${path}/`;
      return Array.from(store.entries())
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, data]) => ({
          id: key.slice(prefix.length),
          data: () => data,
        }));
    };

    const collectionApi: any = {
      doc: (id: string) => {
      const key = `${path}/${id}`;

      return {
        set: jest.fn(async (payload: Record<string, unknown>, options?: { merge?: boolean }) => {
          const current = store.get(key) || {};
          store.set(key, options?.merge ? { ...current, ...payload } : payload);
        }),
        get: jest.fn(async () => {
          const data = store.get(key);
          return {
            exists: Boolean(data),
            id,
            data: () => data,
          };
        }),
        delete: jest.fn(async () => {
          store.delete(key);
        }),
      };
    },
      where: jest.fn(() => collectionApi),
      orderBy: jest.fn(() => collectionApi),
      offset: jest.fn(() => collectionApi),
      limit: jest.fn(() => collectionApi),
      get: jest.fn(async () => ({ docs: listDocs(), size: listDocs().length })),
      count: jest.fn(() => ({
        get: jest.fn(async () => ({ data: () => ({ count: listDocs().length }) })),
      })),
      aggregate: jest.fn(() => ({
        get: jest.fn(async () => ({
          data: () => ({
            revenue: listDocs().reduce((sum, doc) => sum + Number(doc.data().total || 0), 0),
          }),
        })),
      })),
    };

    return collectionApi;
  };

  const batchOperations: Array<() => Promise<void>> = [];

  return {
    collection,
    batch: jest.fn(() => ({
      set: jest.fn((docRef: { set: (payload: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void> }, payload: Record<string, unknown>, options?: { merge?: boolean }) => {
        batchOperations.push(() => docRef.set(payload, options));
      }),
      commit: jest.fn(async () => {
        await Promise.all(batchOperations.splice(0).map((operation) => operation()));
      }),
    })),
  };
}

jest.mock('../firebase', () => ({
  initializeFirestore: jest.fn(() => mockFirestore),
  getFirestore: jest.fn(() => mockFirestore),
}));

import { AdminService } from '../admin-service';

describe('AdminService', () => {
  let service: AdminService;
  const tenantId = 'tenant-test';

  beforeEach(() => {
    mockFirestore = createFirestoreMock();
    service = new AdminService();
  });

  it('supports product management', async () => {
    const created = await service.createProduct({
      tenantId,
      name: 'Produto A',
      sku: 'PROD-A',
      price: 100,
      stock: 10,
      status: 'active',
      category: 'geral',
    });

    expect(created.id).toBeDefined();

    const updated = await service.updateProduct(tenantId, created.id, { stock: 8 });
    expect(updated.stock).toBe(8);

    const list = await service.listProducts(tenantId);
    expect(list).toHaveLength(1);

    const deleted = await service.deleteProduct(tenantId, created.id);
    expect(deleted).toBe(true);
  });

  it('supports order and customer management', async () => {
    const customer = await service.createCustomer({
      tenantId,
      name: 'Cliente 1',
      email: 'cliente1@test.com',
      phone: '11999999999',
    });

    const order = await service.createOrder({
      tenantId,
      customerId: customer.id,
      items: [{ productId: 'p1', quantity: 2, price: 50 }],
      total: 100,
      status: 'pending',
    });

    expect(order.id).toBeDefined();

    const updatedOrder = await service.updateOrder(tenantId, order.id, { status: 'completed' });
    expect(updatedOrder.status).toBe('completed');

    const updatedCustomer = await service.updateCustomer(tenantId, customer.id, {
      totalSpent: 100,
      totalOrders: 1,
    });
    expect(updatedCustomer.totalSpent).toBe(100);
  });

  it('supports analytics, reports and dashboard', async () => {
    await service.createCustomer({
      tenantId,
      name: 'Cliente 2',
      email: 'cliente2@test.com',
    });

    await service.createOrder({
      tenantId,
      customerId: 'customer-x',
      items: [{ productId: 'product-x', quantity: 1, price: 120 }],
      total: 120,
      status: 'completed',
    });

    const analytics = await service.getAnalytics(
      tenantId,
      '2026-01-01T00:00:00.000Z',
      '2026-12-31T23:59:59.999Z'
    );
    expect(analytics.sales.totalRevenue).toBeGreaterThanOrEqual(120);

    const report = await service.generateReport(tenantId, 'sales');
    expect(report.reportType).toBe('sales');

    const dashboard = await service.getDashboard(tenantId);
    expect(dashboard.kpis.orders).toBeGreaterThan(0);
  });

  it('supports settings, users and audit logs', async () => {
    const settings = await service.updateSettings(tenantId, {
      currency: 'USD',
      lowStockThreshold: 3,
    });
    expect(settings.currency).toBe('USD');

    const user = await service.createUser({
      tenantId,
      username: 'gestor',
      password: 'admin123',
      name: 'Gestor',
      email: 'gestor@test.com',
      role: 'usuario',
      active: true,
    });

    const updated = await service.updateUser(tenantId, user.id, { role: 'admin' });
    expect(updated.role).toBe('admin');

    const logs = await service.listAuditLogs(tenantId);
    expect(logs.length).toBeGreaterThan(0);

    const deleted = await service.deleteUser(tenantId, user.id);
    expect(deleted).toBe(true);
  });

  it('supports tenant configuration management', async () => {
    const current = await service.getTenantConfiguration(tenantId);
    expect(current.tenantId).toBe(tenantId);
    expect(current.displayName).toContain(tenantId);

    const updated = await service.updateTenantConfiguration(tenantId, {
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

    const logs = await service.listAuditLogs(tenantId);
    expect(logs.some((log) => log.action === 'tenant.configuration.updated')).toBe(true);
  });
});
