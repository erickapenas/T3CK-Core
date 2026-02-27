import {
  AdminCustomer,
  AdminOrder,
  AdminProduct,
  AdminSettings,
  AdminTenantConfiguration,
  AdminUser,
  AnalyticsData,
  AuditLog,
  DashboardData,
  ReportData,
} from './types';

const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const now = (): string => new Date().toISOString();

export class AdminService {
  private products = new Map<string, AdminProduct>();
  private orders = new Map<string, AdminOrder>();
  private customers = new Map<string, AdminCustomer>();
  private settings = new Map<string, AdminSettings>();
  private tenantConfigurations = new Map<string, AdminTenantConfiguration>();
  private users = new Map<string, AdminUser>();
  private auditLogs: AuditLog[] = [];

  constructor() {
    this.seedDemoData();
  }

  getDashboard(tenantId: string): DashboardData {
    const tenantProducts = this.listProducts(tenantId);
    const tenantOrders = this.listOrders(tenantId);
    const tenantCustomers = this.listCustomers(tenantId);
    const revenue = tenantOrders
      .filter((order) => order.status === 'completed')
      .reduce((sum, order) => sum + order.total, 0);

    const lowStockThreshold = this.getSettings(tenantId).lowStockThreshold;
    const lowStockProducts = tenantProducts.filter((product) => product.stock <= lowStockThreshold);
    const recentOrders = [...tenantOrders]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 10);
    const recentAuditLogs = this.listAuditLogs(tenantId).slice(0, 20);

    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'dashboard.viewed',
      resourceType: 'dashboard',
      metadata: { orders: tenantOrders.length, products: tenantProducts.length },
    });

    return {
      kpis: {
        revenue,
        orders: tenantOrders.length,
        customers: tenantCustomers.length,
        products: tenantProducts.length,
        averageTicket: tenantOrders.length ? revenue / tenantOrders.length : 0,
      },
      lowStockProducts,
      recentOrders,
      recentAuditLogs,
    };
  }

  createProduct(input: Omit<AdminProduct, 'id' | 'createdAt' | 'updatedAt'>): AdminProduct {
    const product: AdminProduct = {
      ...input,
      id: randomId('prd'),
      createdAt: now(),
      updatedAt: now(),
    };
    this.products.set(product.id, product);
    this.addAuditLog(product.tenantId, {
      actorUserId: 'system',
      action: 'product.created',
      resourceType: 'product',
      resourceId: product.id,
      metadata: { name: product.name, sku: product.sku },
    });
    return product;
  }

  listProducts(tenantId: string): AdminProduct[] {
    return Array.from(this.products.values()).filter((item) => item.tenantId === tenantId);
  }

  updateProduct(tenantId: string, productId: string, updates: Partial<AdminProduct>): AdminProduct {
    const current = this.requireProduct(tenantId, productId);
    const updated: AdminProduct = { ...current, ...updates, updatedAt: now() };
    this.products.set(productId, updated);
    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'product.updated',
      resourceType: 'product',
      resourceId: productId,
      metadata: updates,
    });
    return updated;
  }

  deleteProduct(tenantId: string, productId: string): boolean {
    const existing = this.products.get(productId);
    if (!existing || existing.tenantId !== tenantId) return false;
    this.products.delete(productId);
    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'product.deleted',
      resourceType: 'product',
      resourceId: productId,
    });
    return true;
  }

  createOrder(input: Omit<AdminOrder, 'id' | 'createdAt' | 'updatedAt'>): AdminOrder {
    const order: AdminOrder = {
      ...input,
      id: randomId('ord'),
      createdAt: now(),
      updatedAt: now(),
    };
    this.orders.set(order.id, order);
    this.addAuditLog(order.tenantId, {
      actorUserId: 'system',
      action: 'order.created',
      resourceType: 'order',
      resourceId: order.id,
      metadata: { total: order.total, status: order.status },
    });
    return order;
  }

  listOrders(tenantId: string): AdminOrder[] {
    return Array.from(this.orders.values()).filter((item) => item.tenantId === tenantId);
  }

  updateOrder(tenantId: string, orderId: string, updates: Partial<AdminOrder>): AdminOrder {
    const current = this.requireOrder(tenantId, orderId);
    const updated: AdminOrder = { ...current, ...updates, updatedAt: now() };
    this.orders.set(orderId, updated);
    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'order.updated',
      resourceType: 'order',
      resourceId: orderId,
      metadata: updates,
    });
    return updated;
  }

  createCustomer(input: Omit<AdminCustomer, 'id' | 'createdAt' | 'updatedAt' | 'totalOrders' | 'totalSpent'>): AdminCustomer {
    const customer: AdminCustomer = {
      ...input,
      id: randomId('cus'),
      totalOrders: 0,
      totalSpent: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    this.customers.set(customer.id, customer);
    this.addAuditLog(customer.tenantId, {
      actorUserId: 'system',
      action: 'customer.created',
      resourceType: 'customer',
      resourceId: customer.id,
      metadata: { email: customer.email },
    });
    return customer;
  }

  listCustomers(tenantId: string): AdminCustomer[] {
    return Array.from(this.customers.values()).filter((item) => item.tenantId === tenantId);
  }

  updateCustomer(tenantId: string, customerId: string, updates: Partial<AdminCustomer>): AdminCustomer {
    const current = this.requireCustomer(tenantId, customerId);
    const updated: AdminCustomer = { ...current, ...updates, updatedAt: now() };
    this.customers.set(customerId, updated);
    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'customer.updated',
      resourceType: 'customer',
      resourceId: customerId,
      metadata: updates,
    });
    return updated;
  }

  getSettings(tenantId: string): AdminSettings {
    const existing = this.settings.get(tenantId);
    if (existing) return existing;
    const defaults: AdminSettings = {
      tenantId,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      notificationsEnabled: true,
      lowStockThreshold: 5,
      updatedAt: now(),
    };
    this.settings.set(tenantId, defaults);
    return defaults;
  }

  updateSettings(tenantId: string, updates: Partial<AdminSettings>): AdminSettings {
    const current = this.getSettings(tenantId);
    const updated: AdminSettings = { ...current, ...updates, updatedAt: now(), tenantId };
    this.settings.set(tenantId, updated);
    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'settings.updated',
      resourceType: 'settings',
      resourceId: tenantId,
      metadata: updates,
    });
    return updated;
  }

  getTenantConfiguration(tenantId: string): AdminTenantConfiguration {
    const existing = this.tenantConfigurations.get(tenantId);
    if (existing) return existing;

    const defaults: AdminTenantConfiguration = {
      tenantId,
      displayName: `Tenant ${tenantId}`,
      supportEmail: `support@${tenantId}.local`,
      supportPhone: '',
      customDomain: '',
      locale: 'pt-BR',
      maintenanceMode: false,
      updatedAt: now(),
    };

    this.tenantConfigurations.set(tenantId, defaults);
    return defaults;
  }

  updateTenantConfiguration(
    tenantId: string,
    updates: Partial<AdminTenantConfiguration>
  ): AdminTenantConfiguration {
    const current = this.getTenantConfiguration(tenantId);
    const updated: AdminTenantConfiguration = {
      ...current,
      ...updates,
      tenantId,
      updatedAt: now(),
    };

    this.tenantConfigurations.set(tenantId, updated);
    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'tenant.configuration.updated',
      resourceType: 'tenant',
      resourceId: tenantId,
      metadata: updates,
    });

    return updated;
  }

  createUser(input: Omit<AdminUser, 'id' | 'createdAt' | 'updatedAt'>): AdminUser {
    const user: AdminUser = {
      ...input,
      id: randomId('usr'),
      createdAt: now(),
      updatedAt: now(),
    };
    this.users.set(user.id, user);
    this.addAuditLog(user.tenantId, {
      actorUserId: 'system',
      action: 'user.created',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { role: user.role, email: user.email },
    });
    return user;
  }

  listUsers(tenantId: string): AdminUser[] {
    return Array.from(this.users.values()).filter((item) => item.tenantId === tenantId);
  }

  updateUser(tenantId: string, userId: string, updates: Partial<AdminUser>): AdminUser {
    const current = this.requireUser(tenantId, userId);
    const updated: AdminUser = { ...current, ...updates, updatedAt: now() };
    this.users.set(userId, updated);
    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'user.updated',
      resourceType: 'user',
      resourceId: userId,
      metadata: updates,
    });
    return updated;
  }

  deleteUser(tenantId: string, userId: string): boolean {
    const existing = this.users.get(userId);
    if (!existing || existing.tenantId !== tenantId) return false;
    this.users.delete(userId);
    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'user.deleted',
      resourceType: 'user',
      resourceId: userId,
    });
    return true;
  }

  getAnalytics(tenantId: string, from: string, to: string): AnalyticsData {
    const orders = this.listOrders(tenantId);
    const products = this.listProducts(tenantId);
    const customers = this.listCustomers(tenantId);

    const totalRevenue = orders
      .filter((order) => order.status === 'completed')
      .reduce((sum, order) => sum + order.total, 0);

    const orderProductMap = new Map<string, { quantity: number; revenue: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const current = orderProductMap.get(item.productId) || { quantity: 0, revenue: 0 };
        current.quantity += item.quantity;
        current.revenue += item.quantity * item.price;
        orderProductMap.set(item.productId, current);
      }
    }

    const topProducts = Array.from(orderProductMap.entries())
      .map(([productId, metrics]) => ({
        productId,
        name: products.find((p) => p.id === productId)?.name || productId,
        quantity: metrics.quantity,
        revenue: metrics.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const repeatCustomers = customers.filter((customer) => customer.totalOrders > 1).length;
    const repeatRate = customers.length > 0 ? repeatCustomers / customers.length : 0;

    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'analytics.viewed',
      resourceType: 'analytics',
      metadata: { from, to },
    });

    return {
      period: { from, to },
      sales: {
        totalRevenue,
        totalOrders: orders.length,
        averageTicket: orders.length > 0 ? totalRevenue / orders.length : 0,
      },
      topProducts,
      customerMetrics: {
        totalCustomers: customers.length,
        repeatRate,
      },
    };
  }

  generateReport(tenantId: string, reportType: ReportData['reportType']): ReportData {
    let data: Record<string, unknown> = {};

    if (reportType === 'sales') {
      const analytics = this.getAnalytics(tenantId, new Date(Date.now() - 30 * 86400000).toISOString(), now());
      data = analytics as unknown as Record<string, unknown>;
    }

    if (reportType === 'inventory') {
      const products = this.listProducts(tenantId);
      data = {
        totalProducts: products.length,
        lowStock: products.filter((p) => p.stock <= this.getSettings(tenantId).lowStockThreshold),
      };
    }

    if (reportType === 'customers') {
      const customers = this.listCustomers(tenantId);
      data = {
        totalCustomers: customers.length,
        topCustomers: [...customers]
          .sort((a, b) => b.totalSpent - a.totalSpent)
          .slice(0, 10),
      };
    }

    const report: ReportData = {
      reportType,
      generatedAt: now(),
      tenantId,
      data,
    };

    this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'report.generated',
      resourceType: 'analytics',
      metadata: { reportType },
    });

    return report;
  }

  listAuditLogs(tenantId: string): AuditLog[] {
    return this.auditLogs
      .filter((log) => log.tenantId === tenantId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  private addAuditLog(
    tenantId: string,
    input: Omit<AuditLog, 'id' | 'tenantId' | 'createdAt'>
  ): AuditLog {
    const audit: AuditLog = {
      id: randomId('audit'),
      tenantId,
      createdAt: now(),
      ...input,
    };

    this.auditLogs.push(audit);
    return audit;
  }

  private requireProduct(tenantId: string, productId: string): AdminProduct {
    const value = this.products.get(productId);
    if (!value || value.tenantId !== tenantId) throw new Error('Product not found');
    return value;
  }

  private requireOrder(tenantId: string, orderId: string): AdminOrder {
    const value = this.orders.get(orderId);
    if (!value || value.tenantId !== tenantId) throw new Error('Order not found');
    return value;
  }

  private requireCustomer(tenantId: string, customerId: string): AdminCustomer {
    const value = this.customers.get(customerId);
    if (!value || value.tenantId !== tenantId) throw new Error('Customer not found');
    return value;
  }

  private requireUser(tenantId: string, userId: string): AdminUser {
    const value = this.users.get(userId);
    if (!value || value.tenantId !== tenantId) throw new Error('User not found');
    return value;
  }

  private seedDemoData(): void {
    const tenantId = 'tenant-demo';

    const product1 = this.createProduct({
      tenantId,
      name: 'Notebook Pro',
      sku: 'NB-PRO-01',
      price: 4999,
      stock: 8,
      status: 'active',
      category: 'notebooks',
    });

    const product2 = this.createProduct({
      tenantId,
      name: 'Mouse Gamer',
      sku: 'MS-GM-01',
      price: 299,
      stock: 3,
      status: 'active',
      category: 'perifericos',
    });

    const customer = this.createCustomer({
      tenantId,
      name: 'Maria Oliveira',
      email: 'maria@example.com',
      phone: '+5511999999999',
    });

    const order = this.createOrder({
      tenantId,
      customerId: customer.id,
      items: [
        { productId: product1.id, quantity: 1, price: 4999 },
        { productId: product2.id, quantity: 1, price: 299 },
      ],
      total: 5298,
      status: 'completed',
    });

    this.updateCustomer(tenantId, customer.id, {
      totalOrders: 1,
      totalSpent: order.total,
    });

    this.createUser({
      tenantId,
      name: 'Admin Principal',
      email: 'admin@t3ck.com',
      role: 'owner',
      active: true,
    });
  }
}
