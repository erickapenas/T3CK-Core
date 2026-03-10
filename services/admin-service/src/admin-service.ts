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
import { getFirestore, initializeFirestore } from './firebase';

const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const now = (): string => new Date().toISOString();

type CollectionName = 'products' | 'orders' | 'customers' | 'users' | 'auditLogs';

export class AdminService {
  private products = new Map<string, AdminProduct>();
  private orders = new Map<string, AdminOrder>();
  private customers = new Map<string, AdminCustomer>();
  private settings = new Map<string, AdminSettings>();
  private tenantConfigurations = new Map<string, AdminTenantConfiguration>();
  private users = new Map<string, AdminUser>();
  private auditLogs: AuditLog[] = [];
  private firestoreHealthy = true;

  constructor() {
    initializeFirestore();
  }

  private firestoreEnabled(): boolean {
    return this.firestoreHealthy && Boolean(getFirestore());
  }

  private disableFirestore(error: unknown): void {
    this.firestoreHealthy = false;
    const message = (error as Error).message || String(error);
    console.warn(`[admin-service] Firestore disabled, using in-memory fallback: ${message}`);
  }

  private collectionPath(tenantId: string, collection: CollectionName): string {
    return `tenants/${tenantId}/admin/data/${collection}`;
  }

  private async ensureTenantDocument(tenantId: string): Promise<void> {
    const firestore = getFirestore();
    if (!firestore) {
      return;
    }

    try {
      await firestore.collection('tenants').doc(tenantId).set(
        {
          id: tenantId,
          updatedAt: now(),
        },
        { merge: true }
      );
    } catch (error) {
      this.disableFirestore(error);
    }
  }

  private async listCollection<T>(tenantId: string, collection: CollectionName): Promise<T[]> {
    const firestore = getFirestore();
    if (!firestore) {
      return [];
    }

    try {
      const snapshot = await firestore
        .collection(this.collectionPath(tenantId, collection))
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
    } catch (error) {
      this.disableFirestore(error);
      return [];
    }
  }

  private async getDoc<T>(tenantId: string, collection: CollectionName, id: string): Promise<T | null> {
    const firestore = getFirestore();
    if (!firestore) {
      return null;
    }

    try {
      const snapshot = await firestore.collection(this.collectionPath(tenantId, collection)).doc(id).get();
      if (!snapshot.exists) {
        return null;
      }

      return { id: snapshot.id, ...snapshot.data() } as T;
    } catch (error) {
      this.disableFirestore(error);
      return null;
    }
  }

  private async setDoc(tenantId: string, collection: CollectionName, id: string, payload: Record<string, unknown>): Promise<void> {
    const firestore = getFirestore();
    if (!firestore) {
      return;
    }

    try {
      await this.ensureTenantDocument(tenantId);
      await firestore.collection(this.collectionPath(tenantId, collection)).doc(id).set(payload, { merge: true });
    } catch (error) {
      this.disableFirestore(error);
    }
  }

  private async deleteDoc(tenantId: string, collection: CollectionName, id: string): Promise<void> {
    const firestore = getFirestore();
    if (!firestore) {
      return;
    }

    try {
      await firestore.collection(this.collectionPath(tenantId, collection)).doc(id).delete();
    } catch (error) {
      this.disableFirestore(error);
    }
  }

  async getDashboard(tenantId: string): Promise<DashboardData> {
    const tenantProducts = await this.listProducts(tenantId);
    const tenantOrders = await this.listOrders(tenantId);
    const tenantCustomers = await this.listCustomers(tenantId);
    const revenue = tenantOrders
      .filter((order) => order.status === 'completed')
      .reduce((sum, order) => sum + order.total, 0);

    const lowStockThreshold = (await this.getSettings(tenantId)).lowStockThreshold;
    const lowStockProducts = tenantProducts.filter((product) => product.stock <= lowStockThreshold);
    const recentOrders = [...tenantOrders]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 10);
    const recentAuditLogs = (await this.listAuditLogs(tenantId)).slice(0, 20);

    await this.addAuditLog(tenantId, {
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

  async createProduct(input: Omit<AdminProduct, 'id' | 'createdAt' | 'updatedAt'>): Promise<AdminProduct> {
    const product: AdminProduct = {
      ...input,
      id: randomId('prd'),
      createdAt: now(),
      updatedAt: now(),
    };

    this.products.set(product.id, product);
    await this.setDoc(product.tenantId, 'products', product.id, product as unknown as Record<string, unknown>);
    await this.addAuditLog(product.tenantId, {
      actorUserId: 'system',
      action: 'product.created',
      resourceType: 'product',
      resourceId: product.id,
      metadata: { name: product.name, sku: product.sku },
    });

    return product;
  }

  async listProducts(tenantId: string): Promise<AdminProduct[]> {
    if (this.firestoreEnabled()) {
      return this.listCollection<AdminProduct>(tenantId, 'products');
    }

    return Array.from(this.products.values()).filter((item) => item.tenantId === tenantId);
  }

  async updateProduct(tenantId: string, productId: string, updates: Partial<AdminProduct>): Promise<AdminProduct> {
    const current = await this.requireProduct(tenantId, productId);
    const updated: AdminProduct = { ...current, ...updates, updatedAt: now() };

    this.products.set(productId, updated);
    await this.setDoc(tenantId, 'products', productId, updated as unknown as Record<string, unknown>);
    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'product.updated',
      resourceType: 'product',
      resourceId: productId,
      metadata: updates as Record<string, unknown>,
    });

    return updated;
  }

  async deleteProduct(tenantId: string, productId: string): Promise<boolean> {
    const existing = await this.getProductIfExists(tenantId, productId);
    if (!existing) {
      return false;
    }

    this.products.delete(productId);
    await this.deleteDoc(tenantId, 'products', productId);
    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'product.deleted',
      resourceType: 'product',
      resourceId: productId,
    });

    return true;
  }

  async createOrder(input: Omit<AdminOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<AdminOrder> {
    const order: AdminOrder = {
      ...input,
      id: randomId('ord'),
      createdAt: now(),
      updatedAt: now(),
    };

    this.orders.set(order.id, order);
    await this.setDoc(order.tenantId, 'orders', order.id, order as unknown as Record<string, unknown>);
    await this.addAuditLog(order.tenantId, {
      actorUserId: 'system',
      action: 'order.created',
      resourceType: 'order',
      resourceId: order.id,
      metadata: { total: order.total, status: order.status },
    });

    return order;
  }

  async listOrders(tenantId: string): Promise<AdminOrder[]> {
    if (this.firestoreEnabled()) {
      return this.listCollection<AdminOrder>(tenantId, 'orders');
    }

    return Array.from(this.orders.values()).filter((item) => item.tenantId === tenantId);
  }

  async updateOrder(tenantId: string, orderId: string, updates: Partial<AdminOrder>): Promise<AdminOrder> {
    const current = await this.requireOrder(tenantId, orderId);
    const updated: AdminOrder = { ...current, ...updates, updatedAt: now() };

    this.orders.set(orderId, updated);
    await this.setDoc(tenantId, 'orders', orderId, updated as unknown as Record<string, unknown>);
    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'order.updated',
      resourceType: 'order',
      resourceId: orderId,
      metadata: updates as Record<string, unknown>,
    });

    return updated;
  }

  async createCustomer(input: Omit<AdminCustomer, 'id' | 'createdAt' | 'updatedAt' | 'totalOrders' | 'totalSpent'>): Promise<AdminCustomer> {
    const customer: AdminCustomer = {
      ...input,
      id: randomId('cus'),
      totalOrders: 0,
      totalSpent: 0,
      createdAt: now(),
      updatedAt: now(),
    };

    this.customers.set(customer.id, customer);
    await this.setDoc(customer.tenantId, 'customers', customer.id, customer as unknown as Record<string, unknown>);
    await this.addAuditLog(customer.tenantId, {
      actorUserId: 'system',
      action: 'customer.created',
      resourceType: 'customer',
      resourceId: customer.id,
      metadata: { email: customer.email },
    });

    return customer;
  }

  async listCustomers(tenantId: string): Promise<AdminCustomer[]> {
    if (this.firestoreEnabled()) {
      return this.listCollection<AdminCustomer>(tenantId, 'customers');
    }

    return Array.from(this.customers.values()).filter((item) => item.tenantId === tenantId);
  }

  async updateCustomer(tenantId: string, customerId: string, updates: Partial<AdminCustomer>): Promise<AdminCustomer> {
    const current = await this.requireCustomer(tenantId, customerId);
    const updated: AdminCustomer = { ...current, ...updates, updatedAt: now() };

    this.customers.set(customerId, updated);
    await this.setDoc(tenantId, 'customers', customerId, updated as unknown as Record<string, unknown>);
    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'customer.updated',
      resourceType: 'customer',
      resourceId: customerId,
      metadata: updates as Record<string, unknown>,
    });

    return updated;
  }

  async getSettings(tenantId: string): Promise<AdminSettings> {
    if (this.firestoreEnabled()) {
      const firestore = getFirestore();
      if (firestore) {
        try {
          const snapshot = await firestore.collection(`tenants/${tenantId}/admin/data/settings`).doc('current').get();
          if (snapshot.exists) {
            return snapshot.data() as AdminSettings;
          }
        } catch (error) {
          this.disableFirestore(error);
        }
      }
    }

    const existing = this.settings.get(tenantId);
    if (existing) {
      return existing;
    }

    const defaults: AdminSettings = {
      tenantId,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      notificationsEnabled: true,
      lowStockThreshold: 5,
      updatedAt: now(),
    };

    this.settings.set(tenantId, defaults);
    if (this.firestoreEnabled()) {
      const firestore = getFirestore();
      if (firestore) {
        try {
          await this.ensureTenantDocument(tenantId);
          await firestore.collection(`tenants/${tenantId}/admin/data/settings`).doc('current').set(defaults, { merge: true });
        } catch (error) {
          this.disableFirestore(error);
        }
      }
    }

    return defaults;
  }

  async updateSettings(tenantId: string, updates: Partial<AdminSettings>): Promise<AdminSettings> {
    const current = await this.getSettings(tenantId);
    const updated: AdminSettings = { ...current, ...updates, updatedAt: now(), tenantId };

    this.settings.set(tenantId, updated);
    if (this.firestoreEnabled()) {
      const firestore = getFirestore();
      if (firestore) {
        try {
          await this.ensureTenantDocument(tenantId);
          await firestore.collection(`tenants/${tenantId}/admin/data/settings`).doc('current').set(updated, { merge: true });
        } catch (error) {
          this.disableFirestore(error);
        }
      }
    }

    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'settings.updated',
      resourceType: 'settings',
      resourceId: tenantId,
      metadata: updates as Record<string, unknown>,
    });

    return updated;
  }

  async getTenantConfiguration(tenantId: string): Promise<AdminTenantConfiguration> {
    if (this.firestoreEnabled()) {
      const firestore = getFirestore();
      if (firestore) {
        try {
          const snapshot = await firestore.collection(`tenants/${tenantId}/admin/data/tenantConfig`).doc('current').get();
          if (snapshot.exists) {
            return snapshot.data() as AdminTenantConfiguration;
          }
        } catch (error) {
          this.disableFirestore(error);
        }
      }
    }

    const existing = this.tenantConfigurations.get(tenantId);
    if (existing) {
      return existing;
    }

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
    if (this.firestoreEnabled()) {
      const firestore = getFirestore();
      if (firestore) {
        try {
          await this.ensureTenantDocument(tenantId);
          await firestore.collection(`tenants/${tenantId}/admin/data/tenantConfig`).doc('current').set(defaults, { merge: true });
        } catch (error) {
          this.disableFirestore(error);
        }
      }
    }

    return defaults;
  }

  async updateTenantConfiguration(
    tenantId: string,
    updates: Partial<AdminTenantConfiguration>
  ): Promise<AdminTenantConfiguration> {
    const current = await this.getTenantConfiguration(tenantId);
    const updated: AdminTenantConfiguration = {
      ...current,
      ...updates,
      tenantId,
      updatedAt: now(),
    };

    this.tenantConfigurations.set(tenantId, updated);
    if (this.firestoreEnabled()) {
      const firestore = getFirestore();
      if (firestore) {
        try {
          await this.ensureTenantDocument(tenantId);
          await firestore.collection(`tenants/${tenantId}/admin/data/tenantConfig`).doc('current').set(updated, { merge: true });
        } catch (error) {
          this.disableFirestore(error);
        }
      }
    }

    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'tenant.configuration.updated',
      resourceType: 'tenant',
      resourceId: tenantId,
      metadata: updates as Record<string, unknown>,
    });

    return updated;
  }

  async createUser(input: Omit<AdminUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<AdminUser> {
    const user: AdminUser = {
      ...input,
      id: randomId('usr'),
      createdAt: now(),
      updatedAt: now(),
    };

    this.users.set(user.id, user);
    await this.setDoc(user.tenantId, 'users', user.id, user as unknown as Record<string, unknown>);
    await this.addAuditLog(user.tenantId, {
      actorUserId: 'system',
      action: 'user.created',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { role: user.role, email: user.email },
    });

    return user;
  }

  async listUsers(tenantId: string): Promise<AdminUser[]> {
    if (this.firestoreEnabled()) {
      return this.listCollection<AdminUser>(tenantId, 'users');
    }

    return Array.from(this.users.values()).filter((item) => item.tenantId === tenantId);
  }

  async updateUser(tenantId: string, userId: string, updates: Partial<AdminUser>): Promise<AdminUser> {
    const current = await this.requireUser(tenantId, userId);
    const updated: AdminUser = { ...current, ...updates, updatedAt: now() };

    this.users.set(userId, updated);
    await this.setDoc(tenantId, 'users', userId, updated as unknown as Record<string, unknown>);
    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'user.updated',
      resourceType: 'user',
      resourceId: userId,
      metadata: updates as Record<string, unknown>,
    });

    return updated;
  }

  async deleteUser(tenantId: string, userId: string): Promise<boolean> {
    const existing = await this.getUserIfExists(tenantId, userId);
    if (!existing) {
      return false;
    }

    this.users.delete(userId);
    await this.deleteDoc(tenantId, 'users', userId);
    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'user.deleted',
      resourceType: 'user',
      resourceId: userId,
    });

    return true;
  }

  async getAnalytics(tenantId: string, from: string, to: string): Promise<AnalyticsData> {
    const orders = await this.listOrders(tenantId);
    const products = await this.listProducts(tenantId);
    const customers = await this.listCustomers(tenantId);

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

    await this.addAuditLog(tenantId, {
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

  async generateReport(tenantId: string, reportType: ReportData['reportType']): Promise<ReportData> {
    let data: Record<string, unknown> = {};

    if (reportType === 'sales') {
      const analytics = await this.getAnalytics(tenantId, new Date(Date.now() - 30 * 86400000).toISOString(), now());
      data = analytics as unknown as Record<string, unknown>;
    }

    if (reportType === 'inventory') {
      const products = await this.listProducts(tenantId);
      data = {
        totalProducts: products.length,
        lowStock: products.filter((p) => p.stock <= (this.settings.get(tenantId)?.lowStockThreshold || 5)),
      };
    }

    if (reportType === 'customers') {
      const customers = await this.listCustomers(tenantId);
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

    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'report.generated',
      resourceType: 'analytics',
      metadata: { reportType },
    });

    return report;
  }

  async listAuditLogs(tenantId: string): Promise<AuditLog[]> {
    if (this.firestoreEnabled()) {
      const logs = await this.listCollection<AuditLog>(tenantId, 'auditLogs');
      return logs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    return this.auditLogs
      .filter((log) => log.tenantId === tenantId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  private async addAuditLog(
    tenantId: string,
    input: Omit<AuditLog, 'id' | 'tenantId' | 'createdAt'>
  ): Promise<AuditLog> {
    const audit: AuditLog = {
      id: randomId('audit'),
      tenantId,
      createdAt: now(),
      ...input,
    };

    this.auditLogs.push(audit);
    await this.setDoc(tenantId, 'auditLogs', audit.id, audit as unknown as Record<string, unknown>);
    return audit;
  }

  private async getProductIfExists(tenantId: string, productId: string): Promise<AdminProduct | null> {
    if (this.firestoreEnabled()) {
      return this.getDoc<AdminProduct>(tenantId, 'products', productId);
    }

    const value = this.products.get(productId);
    if (!value || value.tenantId !== tenantId) {
      return null;
    }

    return value;
  }

  private async getUserIfExists(tenantId: string, userId: string): Promise<AdminUser | null> {
    if (this.firestoreEnabled()) {
      return this.getDoc<AdminUser>(tenantId, 'users', userId);
    }

    const value = this.users.get(userId);
    if (!value || value.tenantId !== tenantId) {
      return null;
    }

    return value;
  }

  private async requireProduct(tenantId: string, productId: string): Promise<AdminProduct> {
    const value = await this.getProductIfExists(tenantId, productId);
    if (!value) {
      throw new Error('Product not found');
    }

    return value;
  }

  private async requireOrder(tenantId: string, orderId: string): Promise<AdminOrder> {
    if (this.firestoreEnabled()) {
      const value = await this.getDoc<AdminOrder>(tenantId, 'orders', orderId);
      if (!value) {
        throw new Error('Order not found');
      }
      return value;
    }

    const value = this.orders.get(orderId);
    if (!value || value.tenantId !== tenantId) {
      throw new Error('Order not found');
    }

    return value;
  }

  private async requireCustomer(tenantId: string, customerId: string): Promise<AdminCustomer> {
    if (this.firestoreEnabled()) {
      const value = await this.getDoc<AdminCustomer>(tenantId, 'customers', customerId);
      if (!value) {
        throw new Error('Customer not found');
      }
      return value;
    }

    const value = this.customers.get(customerId);
    if (!value || value.tenantId !== tenantId) {
      throw new Error('Customer not found');
    }

    return value;
  }

  private async requireUser(tenantId: string, userId: string): Promise<AdminUser> {
    const value = await this.getUserIfExists(tenantId, userId);
    if (!value) {
      throw new Error('User not found');
    }

    return value;
  }
}
