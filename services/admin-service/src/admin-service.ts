import type * as admin from 'firebase-admin';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { AggregateField, FieldValue } from 'firebase-admin/firestore';
import {
  AdminCustomer,
  AdminTheme,
  AdminOrder,
  AdminProduct,
  AdminSettings,
  AdminSessionUser,
  AdminTenantConfiguration,
  AdminUser,
  AnalyticsData,
  AuditLog,
  DashboardLayout,
  DashboardData,
  DashboardWidget,
  DesignTokens,
  PaginatedResult,
  PaginationOptions,
  ReportData,
  TenantTheme,
  ThemeBundle,
  UserThemePreferences,
} from './types';
import { getFirestore, initializeFirestore } from './firebase';
import { DEFAULT_THEME_ID, DEFAULT_WIDGETS, SYSTEM_THEMES } from './theme-defaults';
import { AuditLogService } from './audit/audit-log-service';

const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const now = (): string => new Date().toISOString();
const PASSWORD_PREFIX = 'scrypt';
const AUTH_USERS_COLLECTION = 'adminAuthUsers';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${PASSWORD_PREFIX}:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash) {
    return false;
  }

  const [prefix, salt, hash] = storedHash.split(':');
  if (prefix !== PASSWORD_PREFIX || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sanitizeUser(user: AdminUser): AdminSessionUser {
  const { passwordHash: _passwordHash, ...sessionUser } = user;
  return sessionUser;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeTokenValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return undefined;
  }

  if (value === null || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 240) {
      return undefined;
    }
    if (/javascript:|expression\(|<script|<\/script/i.test(trimmed)) {
      return undefined;
    }
    return trimmed;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 24)
      .map((item) => sanitizeTokenValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (isPlainObject(value)) {
    return sanitizeDesignTokens(value, depth + 1);
  }

  return undefined;
}

function sanitizeDesignTokens(tokens: unknown, depth = 0): DesignTokens {
  if (!isPlainObject(tokens)) {
    return {};
  }

  const sanitized: DesignTokens = {};
  for (const [key, value] of Object.entries(tokens).slice(0, 120)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(key)) {
      continue;
    }
    const safeValue = sanitizeTokenValue(value, depth);
    if (safeValue !== undefined) {
      sanitized[key] = safeValue;
    }
  }

  const serialized = JSON.stringify(sanitized);
  if (serialized.length > 15000) {
    throw new Error('theme tokens exceed the 15kb limit');
  }

  return sanitized;
}

type CollectionName =
  | 'products'
  | 'orders'
  | 'customers'
  | 'users'
  | 'auditLogs'
  | 'productDailyStats';

interface ProductDailyStats {
  id: string;
  tenantId: string;
  productId: string;
  date: string;
  quantity: number;
  revenue: number;
  updatedAt: string;
}

export class AdminService {
  private readonly auditLogService = new AuditLogService();

  constructor() {
    initializeFirestore();
  }

  private requireFirestore(): admin.firestore.Firestore {
    const firestore = getFirestore();

    if (!firestore) {
      throw new Error('Firestore is required for admin-service persistence');
    }

    return firestore;
  }

  private collectionPath(tenantId: string, collection: CollectionName): string {
    return `tenants/${tenantId}/admin/data/${collection}`;
  }

  private async ensureTenantDocument(tenantId: string): Promise<void> {
    await this.requireFirestore().collection('tenants').doc(tenantId).set(
      {
        id: tenantId,
        updatedAt: now(),
      },
      { merge: true }
    );
  }

  private async listCollection<T>(tenantId: string, collection: CollectionName): Promise<T[]> {
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, collection))
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
  }

  private async listCollectionPage<T>(
    tenantId: string,
    collection: CollectionName,
    options: PaginationOptions
  ): Promise<PaginatedResult<T>> {
    const page = Math.max(1, options.page);
    const limit = Math.max(1, Math.min(100, options.limit));
    const collectionRef = this.requireFirestore().collection(
      this.collectionPath(tenantId, collection)
    );
    const [snapshot, countSnapshot] = await Promise.all([
      collectionRef
        .orderBy('createdAt', 'desc')
        .offset((page - 1) * limit)
        .limit(limit)
        .get(),
      collectionRef.count().get(),
    ]);
    const total = countSnapshot.data().count;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  private async countCollection(tenantId: string, collection: CollectionName): Promise<number> {
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, collection))
      .count()
      .get();

    return snapshot.data().count;
  }

  private async listLowStockProducts(
    tenantId: string,
    lowStockThreshold: number,
    limit = 10
  ): Promise<AdminProduct[]> {
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, 'products'))
      .where('stock', '<=', lowStockThreshold)
      .orderBy('stock', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AdminProduct);
  }

  private async countOrdersForAnalytics(
    tenantId: string,
    from: string,
    to: string
  ): Promise<number> {
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, 'orders'))
      .where('createdAt', '>=', from)
      .where('createdAt', '<=', to)
      .count()
      .get();

    return snapshot.data().count;
  }

  private async sumCompletedOrderRevenueForAnalytics(
    tenantId: string,
    from: string,
    to: string
  ): Promise<number> {
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, 'orders'))
      .where('status', '==', 'completed')
      .where('createdAt', '>=', from)
      .where('createdAt', '<=', to)
      .aggregate({ revenue: AggregateField.sum('total') })
      .get();

    return snapshot.data().revenue || 0;
  }

  private async listTopCustomers(tenantId: string, limit = 10): Promise<AdminCustomer[]> {
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, 'customers'))
      .orderBy('totalSpent', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AdminCustomer);
  }

  private async countRepeatCustomers(tenantId: string): Promise<number> {
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, 'customers'))
      .where('totalOrders', '>', 1)
      .count()
      .get();

    return snapshot.data().count;
  }

  private async sumCompletedOrderRevenue(tenantId: string): Promise<number> {
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, 'orders'))
      .where('status', '==', 'completed')
      .aggregate({ revenue: AggregateField.sum('total') })
      .get();

    return snapshot.data().revenue || 0;
  }

  private statsDate(value: string): string {
    return value.slice(0, 10);
  }

  private productStatsDocId(date: string, productId: string): string {
    return `${date}_${productId}`;
  }

  private async applyProductStatsDelta(order: AdminOrder, multiplier: 1 | -1): Promise<void> {
    if (!order.items.length) {
      return;
    }

    await this.ensureTenantDocument(order.tenantId);
    const firestore = this.requireFirestore();
    const batch = firestore.batch();
    const date = this.statsDate(order.createdAt);
    const updatedAt = now();

    for (const item of order.items) {
      const docRef = firestore
        .collection(this.collectionPath(order.tenantId, 'productDailyStats'))
        .doc(this.productStatsDocId(date, item.productId));
      batch.set(
        docRef,
        {
          tenantId: order.tenantId,
          productId: item.productId,
          date,
          quantity: FieldValue.increment(item.quantity * multiplier),
          revenue: FieldValue.increment(item.quantity * item.price * multiplier),
          updatedAt,
        },
        { merge: true }
      );
    }

    await batch.commit();
  }

  private async listTopProductStats(
    tenantId: string,
    from: string,
    to: string,
    limit = 5
  ): Promise<Array<{ productId: string; quantity: number; revenue: number }>> {
    const fromDate = this.statsDate(from);
    const toDate = this.statsDate(to);
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, 'productDailyStats'))
      .where('date', '>=', fromDate)
      .where('date', '<=', toDate)
      .get();
    const byProduct = new Map<string, { quantity: number; revenue: number }>();

    for (const doc of snapshot.docs) {
      const stats = doc.data() as ProductDailyStats;
      const current = byProduct.get(stats.productId) || { quantity: 0, revenue: 0 };
      current.quantity += stats.quantity || 0;
      current.revenue += stats.revenue || 0;
      byProduct.set(stats.productId, current);
    }

    return Array.from(byProduct.entries())
      .map(([productId, stats]) => ({ productId, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  async backfillProductDailyStats(
    tenantId: string,
    from?: string,
    to?: string
  ): Promise<{ processedOrders: number; writtenStats: number }> {
    let query: admin.firestore.Query = this.requireFirestore()
      .collection(this.collectionPath(tenantId, 'orders'))
      .orderBy('createdAt', 'asc');

    if (from) {
      query = query.where('createdAt', '>=', from);
    }

    if (to) {
      query = query.where('createdAt', '<=', to);
    }

    const snapshot = await query.get();
    const byDayAndProduct = new Map<string, ProductDailyStats>();

    for (const doc of snapshot.docs) {
      const order = { id: doc.id, ...doc.data() } as AdminOrder;
      const date = this.statsDate(order.createdAt);

      for (const item of order.items) {
        const id = this.productStatsDocId(date, item.productId);
        const current =
          byDayAndProduct.get(id) ||
          ({
            id,
            tenantId,
            productId: item.productId,
            date,
            quantity: 0,
            revenue: 0,
            updatedAt: now(),
          } satisfies ProductDailyStats);
        current.quantity += item.quantity;
        current.revenue += item.quantity * item.price;
        byDayAndProduct.set(id, current);
      }
    }

    await this.ensureTenantDocument(tenantId);
    const firestore = this.requireFirestore();
    let batch = firestore.batch();
    let operations = 0;

    for (const stats of byDayAndProduct.values()) {
      const docRef = firestore
        .collection(this.collectionPath(tenantId, 'productDailyStats'))
        .doc(stats.id);
      batch.set(docRef, stats, { merge: true });
      operations += 1;

      if (operations % 450 === 0) {
        await batch.commit();
        batch = firestore.batch();
      }
    }

    if (operations > 0 && operations % 450 !== 0) {
      await batch.commit();
    }

    return {
      processedOrders: snapshot.size,
      writtenStats: byDayAndProduct.size,
    };
  }

  private async getDoc<T>(
    tenantId: string,
    collection: CollectionName,
    id: string
  ): Promise<T | null> {
    const snapshot = await this.requireFirestore()
      .collection(this.collectionPath(tenantId, collection))
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    return { id: snapshot.id, ...snapshot.data() } as T;
  }

  private async setDoc(
    tenantId: string,
    collection: CollectionName,
    id: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.ensureTenantDocument(tenantId);
    await this.requireFirestore()
      .collection(this.collectionPath(tenantId, collection))
      .doc(id)
      .set(payload, {
        merge: true,
      });
  }

  private async deleteDoc(tenantId: string, collection: CollectionName, id: string): Promise<void> {
    await this.requireFirestore()
      .collection(this.collectionPath(tenantId, collection))
      .doc(id)
      .delete();
  }

  private async syncAuthUser(user: AdminUser): Promise<void> {
    await this.requireFirestore()
      .collection(AUTH_USERS_COLLECTION)
      .doc(user.username)
      .set(user as unknown as Record<string, unknown>, { merge: true });
  }

  private async deleteAuthUser(username: string): Promise<void> {
    await this.requireFirestore().collection(AUTH_USERS_COLLECTION).doc(username).delete();
  }

  async getDashboard(tenantId: string): Promise<DashboardData> {
    const settings = await this.getSettings(tenantId);
    const [productCount, orderCount, customerCount, recentOrdersPage, recentAuditLogsPage] =
      await Promise.all([
        this.countCollection(tenantId, 'products'),
        this.countCollection(tenantId, 'orders'),
        this.countCollection(tenantId, 'customers'),
        this.listOrdersPage(tenantId, { page: 1, limit: 10 }),
        this.listAuditLogsPage(tenantId, { page: 1, limit: 20 }),
      ]);
    const [revenue, lowStockProducts] = await Promise.all([
      this.sumCompletedOrderRevenue(tenantId),
      this.listLowStockProducts(tenantId, settings.lowStockThreshold),
    ]);

    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'dashboard.viewed',
      resourceType: 'dashboard',
      metadata: { orders: orderCount, products: productCount },
    });

    return {
      kpis: {
        revenue,
        orders: orderCount,
        customers: customerCount,
        products: productCount,
        averageTicket: orderCount ? revenue / orderCount : 0,
      },
      lowStockProducts,
      recentOrders: recentOrdersPage.items,
      recentAuditLogs: recentAuditLogsPage.items,
    };
  }

  async createProduct(
    input: Omit<AdminProduct, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AdminProduct> {
    const product: AdminProduct = {
      ...input,
      id: randomId('prd'),
      createdAt: now(),
      updatedAt: now(),
    };

    await this.setDoc(
      product.tenantId,
      'products',
      product.id,
      product as unknown as Record<string, unknown>
    );
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
    return this.listCollection<AdminProduct>(tenantId, 'products');
  }

  async listProductsPage(
    tenantId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<AdminProduct>> {
    return this.listCollectionPage<AdminProduct>(tenantId, 'products', options);
  }

  async updateProduct(
    tenantId: string,
    productId: string,
    updates: Partial<AdminProduct>
  ): Promise<AdminProduct> {
    const current = await this.requireProduct(tenantId, productId);
    const updated: AdminProduct = { ...current, ...updates, updatedAt: now() };

    await this.setDoc(
      tenantId,
      'products',
      productId,
      updated as unknown as Record<string, unknown>
    );
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

    await this.deleteDoc(tenantId, 'products', productId);
    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'product.deleted',
      resourceType: 'product',
      resourceId: productId,
    });

    return true;
  }

  async createOrder(
    input: Omit<AdminOrder, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AdminOrder> {
    const order: AdminOrder = {
      ...input,
      id: randomId('ord'),
      createdAt: now(),
      updatedAt: now(),
    };

    await this.setDoc(
      order.tenantId,
      'orders',
      order.id,
      order as unknown as Record<string, unknown>
    );
    await this.applyProductStatsDelta(order, 1);
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
    return this.listCollection<AdminOrder>(tenantId, 'orders');
  }

  async listOrdersPage(
    tenantId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<AdminOrder>> {
    return this.listCollectionPage<AdminOrder>(tenantId, 'orders', options);
  }

  async updateOrder(
    tenantId: string,
    orderId: string,
    updates: Partial<AdminOrder>
  ): Promise<AdminOrder> {
    const current = await this.requireOrder(tenantId, orderId);
    const updated: AdminOrder = { ...current, ...updates, updatedAt: now() };

    await this.setDoc(tenantId, 'orders', orderId, updated as unknown as Record<string, unknown>);
    if (updates.items) {
      await this.applyProductStatsDelta(current, -1);
      await this.applyProductStatsDelta(updated, 1);
    }
    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'order.updated',
      resourceType: 'order',
      resourceId: orderId,
      metadata: updates as Record<string, unknown>,
    });

    return updated;
  }

  async createCustomer(
    input: Omit<AdminCustomer, 'id' | 'createdAt' | 'updatedAt' | 'totalOrders' | 'totalSpent'>
  ): Promise<AdminCustomer> {
    const customer: AdminCustomer = {
      ...input,
      id: randomId('cus'),
      totalOrders: 0,
      totalSpent: 0,
      createdAt: now(),
      updatedAt: now(),
    };

    await this.setDoc(
      customer.tenantId,
      'customers',
      customer.id,
      customer as unknown as Record<string, unknown>
    );
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
    return this.listCollection<AdminCustomer>(tenantId, 'customers');
  }

  async listCustomersPage(
    tenantId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<AdminCustomer>> {
    return this.listCollectionPage<AdminCustomer>(tenantId, 'customers', options);
  }

  async getCustomer(tenantId: string, customerId: string): Promise<AdminCustomer | null> {
    return this.getDoc<AdminCustomer>(tenantId, 'customers', customerId);
  }

  async updateCustomer(
    tenantId: string,
    customerId: string,
    updates: Partial<AdminCustomer>
  ): Promise<AdminCustomer> {
    const current = await this.requireCustomer(tenantId, customerId);
    const updated: AdminCustomer = { ...current, ...updates, updatedAt: now() };

    await this.setDoc(
      tenantId,
      'customers',
      customerId,
      updated as unknown as Record<string, unknown>
    );
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
    const settingsRef = this.requireFirestore()
      .collection(`tenants/${tenantId}/admin/data/settings`)
      .doc('current');
    const snapshot = await settingsRef.get();

    if (snapshot.exists) {
      return snapshot.data() as AdminSettings;
    }

    const defaults: AdminSettings = {
      tenantId,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      notificationsEnabled: true,
      lowStockThreshold: 5,
      updatedAt: now(),
    };

    await this.ensureTenantDocument(tenantId);
    await settingsRef.set(defaults, { merge: true });

    return defaults;
  }

  async updateSettings(tenantId: string, updates: Partial<AdminSettings>): Promise<AdminSettings> {
    const current = await this.getSettings(tenantId);
    const updated: AdminSettings = { ...current, ...updates, updatedAt: now(), tenantId };

    await this.ensureTenantDocument(tenantId);
    await this.requireFirestore()
      .collection(`tenants/${tenantId}/admin/data/settings`)
      .doc('current')
      .set(updated, {
        merge: true,
      });

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
    const configRef = this.requireFirestore()
      .collection(`tenants/${tenantId}/admin/data/tenantConfig`)
      .doc('current');
    const snapshot = await configRef.get();

    if (snapshot.exists) {
      return snapshot.data() as AdminTenantConfiguration;
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

    await this.ensureTenantDocument(tenantId);
    await configRef.set(defaults, { merge: true });

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

    await this.ensureTenantDocument(tenantId);
    await this.requireFirestore()
      .collection(`tenants/${tenantId}/admin/data/tenantConfig`)
      .doc('current')
      .set(updated, {
        merge: true,
      });

    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'tenant.configuration.updated',
      resourceType: 'tenant',
      resourceId: tenantId,
      metadata: updates as Record<string, unknown>,
    });

    return updated;
  }

  listThemes(): AdminTheme[] {
    return SYSTEM_THEMES;
  }

  private resolveTheme(themeId?: string): AdminTheme {
    return (
      SYSTEM_THEMES.find((theme) => theme.id === themeId || theme.slug === themeId) ||
      SYSTEM_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID) ||
      SYSTEM_THEMES[0]
    );
  }

  private tenantThemeCollection(tenantId: string): admin.firestore.CollectionReference {
    return this.requireFirestore().collection(`tenants/${tenantId}/admin/data/tenant_themes`);
  }

  private userPreferencesCollection(tenantId: string): admin.firestore.CollectionReference {
    return this.requireFirestore().collection(`tenants/${tenantId}/admin/data/user_theme_preferences`);
  }

  private dashboardLayoutCollection(tenantId: string): admin.firestore.CollectionReference {
    return this.requireFirestore().collection(`tenants/${tenantId}/admin/data/dashboard_layouts`);
  }

  private dashboardWidgetCollection(tenantId: string): admin.firestore.CollectionReference {
    return this.requireFirestore().collection(`tenants/${tenantId}/admin/data/dashboard_widgets`);
  }

  async getTenantTheme(tenantId: string, status: 'active' | 'draft' = 'active'): Promise<TenantTheme> {
    const docId = status === 'draft' ? 'draft' : 'active';
    const ref = this.tenantThemeCollection(tenantId).doc(docId);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      return snapshot.data() as TenantTheme;
    }

    const defaults: TenantTheme = {
      id: docId,
      tenantId,
      themeId: DEFAULT_THEME_ID,
      customTokensJson: {},
      logoUrl: '',
      faviconUrl: '',
      displayName: `Tenant ${tenantId}`,
      status: docId === 'draft' ? 'draft' : 'published',
      isActive: docId === 'active',
      createdAt: now(),
      updatedAt: now(),
    };

    await this.ensureTenantDocument(tenantId);
    await ref.set(defaults, { merge: true });
    return defaults;
  }

  async updateTenantThemeDraft(
    tenantId: string,
    updates: Partial<TenantTheme>,
    userId = 'system'
  ): Promise<TenantTheme> {
    const current = await this.getTenantTheme(tenantId, 'draft');
    const updated: TenantTheme = {
      ...current,
      ...updates,
      id: 'draft',
      tenantId,
      themeId: updates.themeId || current.themeId || DEFAULT_THEME_ID,
      customTokensJson: sanitizeDesignTokens(updates.customTokensJson ?? current.customTokensJson),
      status: 'draft',
      isActive: false,
      updatedBy: userId,
      createdAt: current.createdAt || now(),
      updatedAt: now(),
    };

    await this.ensureTenantDocument(tenantId);
    await this.tenantThemeCollection(tenantId).doc('draft').set(updated, { merge: true });
    await this.addAuditLog(tenantId, {
      actorUserId: userId,
      action: 'theme.draft.updated',
      resourceType: 'theme',
      resourceId: tenantId,
      metadata: { themeId: updated.themeId },
    });

    return updated;
  }

  async publishTenantTheme(
    tenantId: string,
    updates: Partial<TenantTheme> | undefined,
    userId = 'system'
  ): Promise<TenantTheme> {
    const source = updates ? await this.updateTenantThemeDraft(tenantId, updates, userId) : await this.getTenantTheme(tenantId, 'draft');
    const published: TenantTheme = {
      ...source,
      id: 'active',
      tenantId,
      themeId: source.themeId || DEFAULT_THEME_ID,
      customTokensJson: sanitizeDesignTokens(source.customTokensJson),
      status: 'published',
      isActive: true,
      updatedBy: userId,
      createdAt: source.createdAt || now(),
      updatedAt: now(),
    };

    await this.ensureTenantDocument(tenantId);
    await this.tenantThemeCollection(tenantId).doc('active').set(published, { merge: true });
    await this.tenantThemeCollection(tenantId).doc('draft').set(
      {
        ...published,
        id: 'draft',
        status: 'draft',
        isActive: false,
      },
      { merge: true }
    );
    await this.addAuditLog(tenantId, {
      actorUserId: userId,
      action: 'theme.published',
      resourceType: 'theme',
      resourceId: tenantId,
      metadata: { themeId: published.themeId },
    });

    return published;
  }

  async resetTenantTheme(tenantId: string, userId = 'system'): Promise<TenantTheme> {
    const reset: TenantTheme = {
      id: 'active',
      tenantId,
      themeId: DEFAULT_THEME_ID,
      customTokensJson: {},
      logoUrl: '',
      faviconUrl: '',
      displayName: `Tenant ${tenantId}`,
      status: 'published',
      isActive: true,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now(),
      updatedAt: now(),
    };

    await this.ensureTenantDocument(tenantId);
    await this.tenantThemeCollection(tenantId).doc('active').set(reset, { merge: true });
    await this.tenantThemeCollection(tenantId).doc('draft').set(
      {
        ...reset,
        id: 'draft',
        status: 'draft',
        isActive: false,
      },
      { merge: true }
    );
    await this.addAuditLog(tenantId, {
      actorUserId: userId,
      action: 'theme.reset',
      resourceType: 'theme',
      resourceId: tenantId,
      metadata: { themeId: DEFAULT_THEME_ID },
    });

    return reset;
  }

  async getUserThemePreferences(
    tenantId: string,
    userId: string
  ): Promise<UserThemePreferences> {
    const ref = this.userPreferencesCollection(tenantId).doc(userId);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      return snapshot.data() as UserThemePreferences;
    }

    const defaults: UserThemePreferences = {
      id: userId,
      tenantId,
      userId,
      preferredMode: 'system',
      density: 'comfortable',
      fontSize: 'medium',
      reducedMotion: false,
      reducedTransparency: false,
      highContrast: false,
      customTokensJson: {},
      defaultDashboardPeriod: 'last30',
      favoriteShortcuts: ['dashboard', 'orders', 'integrations'],
      visibleTableColumns: {},
      savedFilters: {},
      createdAt: now(),
      updatedAt: now(),
    };

    await this.ensureTenantDocument(tenantId);
    await ref.set(defaults, { merge: true });
    return defaults;
  }

  async updateUserThemePreferences(
    tenantId: string,
    userId: string,
    updates: Partial<UserThemePreferences>
  ): Promise<UserThemePreferences> {
    const current = await this.getUserThemePreferences(tenantId, userId);
    const updated: UserThemePreferences = {
      ...current,
      ...updates,
      id: userId,
      tenantId,
      userId,
      customTokensJson: sanitizeDesignTokens(updates.customTokensJson ?? current.customTokensJson),
      updatedAt: now(),
    };

    await this.ensureTenantDocument(tenantId);
    await this.userPreferencesCollection(tenantId).doc(userId).set(updated, { merge: true });
    await this.addAuditLog(tenantId, {
      actorUserId: userId,
      action: 'theme.user_preferences.updated',
      resourceType: 'theme',
      resourceId: userId,
      metadata: {
        preferredMode: updated.preferredMode,
        density: updated.density,
        highContrast: updated.highContrast,
      },
    });

    return updated;
  }

  async getDashboardLayout(tenantId: string, userId?: string): Promise<DashboardLayout> {
    const docId = userId || 'tenant-default';
    const ref = this.dashboardLayoutCollection(tenantId).doc(docId);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      return snapshot.data() as DashboardLayout;
    }

    const defaults: DashboardLayout = {
      id: docId,
      tenantId,
      userId,
      layoutJson: {
        columns: 12,
        density: 'comfortable',
        widgets: DEFAULT_WIDGETS.map((widget) => ({
          widgetKey: widget.widgetKey,
          position: widget.position,
          size: widget.size,
          visible: widget.visible,
        })),
      },
      isDefault: !userId,
      createdAt: now(),
      updatedAt: now(),
    };

    await this.ensureTenantDocument(tenantId);
    await ref.set(defaults, { merge: true });
    return defaults;
  }

  async updateDashboardLayout(
    tenantId: string,
    userId: string | undefined,
    updates: Partial<DashboardLayout>
  ): Promise<DashboardLayout> {
    const docId = userId || 'tenant-default';
    const current = await this.getDashboardLayout(tenantId, userId);
    const updated: DashboardLayout = {
      ...current,
      ...updates,
      id: docId,
      tenantId,
      userId,
      layoutJson: sanitizeDesignTokens(updates.layoutJson ?? current.layoutJson) as Record<string, unknown>,
      updatedAt: now(),
    };

    await this.ensureTenantDocument(tenantId);
    await this.dashboardLayoutCollection(tenantId).doc(docId).set(updated, { merge: true });
    await this.addAuditLog(tenantId, {
      actorUserId: userId || 'system',
      action: 'dashboard.layout.updated',
      resourceType: 'dashboard_layout',
      resourceId: docId,
      metadata: { isDefault: updated.isDefault },
    });

    return updated;
  }

  async getDashboardWidgets(tenantId: string, userId?: string): Promise<DashboardWidget[]> {
    const snapshot = await this.dashboardWidgetCollection(tenantId)
      .where('userId', '==', userId || '')
      .orderBy('position', 'asc')
      .get();

    if (!snapshot.empty) {
      return snapshot.docs.map((doc) => doc.data() as DashboardWidget);
    }

    return DEFAULT_WIDGETS.map((widget) => ({
      ...widget,
      tenantId,
      userId,
      createdAt: now(),
      updatedAt: now(),
    }));
  }

  async getThemeBundle(tenantId: string, userId: string): Promise<ThemeBundle> {
    const tenantTheme = await this.getTenantTheme(tenantId);
    const userPreferences = await this.getUserThemePreferences(tenantId, userId);
    const dashboardLayout = await this.getDashboardLayout(tenantId, userId);
    const dashboardWidgets = await this.getDashboardWidgets(tenantId, userId);
    const activeTheme = this.resolveTheme(
      userPreferences.highContrast ? 'high-contrast' : tenantTheme.themeId
    );

    return {
      themes: this.listThemes(),
      activeTheme,
      tenantTheme,
      userPreferences,
      dashboardLayout,
      dashboardWidgets,
    };
  }

  async createUser(
    input: Omit<AdminUser, 'id' | 'createdAt' | 'updatedAt'> & { password?: string }
  ): Promise<AdminUser> {
    const payload = input;
    const user: AdminUser = {
      ...payload,
      username: payload.username || payload.email,
      passwordHash: payload.password
        ? hashPassword(payload.password)
        : payload.passwordHash,
      id: randomId('usr'),
      createdAt: now(),
      updatedAt: now(),
    };
    delete (user as AdminUser & { password?: string }).password;

    await this.setDoc(user.tenantId, 'users', user.id, user as unknown as Record<string, unknown>);
    await this.syncAuthUser(user);
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
    return this.listCollection<AdminUser>(tenantId, 'users');
  }

  async listUsersPage(
    tenantId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<AdminUser>> {
    return this.listCollectionPage<AdminUser>(tenantId, 'users', options);
  }

  async updateUser(
    tenantId: string,
    userId: string,
    updates: Partial<AdminUser> & { password?: string }
  ): Promise<AdminUser> {
    const current = await this.requireUser(tenantId, userId);
    const payload = updates;
    const updated: AdminUser = {
      ...current,
      ...payload,
      passwordHash: payload.password ? hashPassword(payload.password) : current.passwordHash,
      updatedAt: now(),
    };
    delete (updated as AdminUser & { password?: string }).password;

    await this.setDoc(tenantId, 'users', userId, updated as unknown as Record<string, unknown>);
    if (current.username !== updated.username) {
      await this.deleteAuthUser(current.username);
    }
    await this.syncAuthUser(updated);
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

    await this.deleteDoc(tenantId, 'users', userId);
    await this.deleteAuthUser(existing.username);
    await this.addAuditLog(tenantId, {
      actorUserId: 'system',
      action: 'user.deleted',
      resourceType: 'user',
      resourceId: userId,
    });

    return true;
  }

  async authenticateUser(username: string, password: string): Promise<AdminSessionUser | null> {
    const normalizedUsername = username.trim();
    const firestore = this.requireFirestore();
    const authUserSnapshot = await firestore
      .collection(AUTH_USERS_COLLECTION)
      .doc(normalizedUsername)
      .get();

    if (authUserSnapshot.exists) {
      const user = { id: authUserSnapshot.id, ...authUserSnapshot.data() } as AdminUser;
      if (user.active !== false && verifyPassword(password, user.passwordHash)) {
        return sanitizeUser(user);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      const fallbackUsername = process.env.ADMIN_BOOTSTRAP_USERNAME || 'admin';
      const fallbackPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin';
      if (normalizedUsername === fallbackUsername && password === fallbackPassword) {
        return {
          id: 'bootstrap-admin',
          tenantId: process.env.ADMIN_BOOTSTRAP_TENANT_ID || 'tenant-demo',
          username: fallbackUsername,
          name: 'Bootstrap Admin',
          email: process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@t3ck.local',
          role: 'admin',
          active: true,
          createdAt: now(),
          updatedAt: now(),
        };
      }
    }

    return null;
  }

  async getAnalytics(tenantId: string, from: string, to: string): Promise<AnalyticsData> {
    const [totalOrders, totalRevenue, topProducts, customerCount, repeatCustomers] =
      await Promise.all([
        this.countOrdersForAnalytics(tenantId, from, to),
        this.sumCompletedOrderRevenueForAnalytics(tenantId, from, to),
        this.listTopProductStats(tenantId, from, to),
        this.countCollection(tenantId, 'customers'),
        this.countRepeatCustomers(tenantId),
      ]);

    const productsById = new Map(
      (
        await Promise.all(
          topProducts.map((product) => this.getProductIfExists(tenantId, product.productId))
        )
      )
        .filter((product): product is AdminProduct => Boolean(product))
        .map((product) => [product.id, product])
    );

    const repeatRate = customerCount > 0 ? repeatCustomers / customerCount : 0;

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
        totalOrders,
        averageTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      },
      topProducts: topProducts.map((product) => ({
        ...product,
        name: productsById.get(product.productId)?.name || product.productId,
      })),
      customerMetrics: {
        totalCustomers: customerCount,
        repeatRate,
      },
    };
  }

  async generateReport(
    tenantId: string,
    reportType: ReportData['reportType']
  ): Promise<ReportData> {
    let data: Record<string, unknown> = {};

    if (reportType === 'sales') {
      const analytics = await this.getAnalytics(
        tenantId,
        new Date(Date.now() - 30 * 86400000).toISOString(),
        now()
      );
      data = analytics as unknown as Record<string, unknown>;
    }

    if (reportType === 'inventory') {
      const lowStockThreshold = (await this.getSettings(tenantId)).lowStockThreshold;
      const [totalProducts, lowStock] = await Promise.all([
        this.countCollection(tenantId, 'products'),
        this.listLowStockProducts(tenantId, lowStockThreshold, 20),
      ]);
      data = {
        totalProducts,
        lowStock,
      };
    }

    if (reportType === 'customers') {
      const [totalCustomers, topCustomers] = await Promise.all([
        this.countCollection(tenantId, 'customers'),
        this.listTopCustomers(tenantId),
      ]);
      data = {
        totalCustomers,
        topCustomers,
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
    const logs = await this.listCollection<AuditLog>(tenantId, 'auditLogs');
    return logs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async listAuditLogsPage(
    tenantId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<AuditLog>> {
    return this.listCollectionPage<AuditLog>(tenantId, 'auditLogs', options);
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

    await this.setDoc(tenantId, 'auditLogs', audit.id, audit as unknown as Record<string, unknown>);
    await this.auditLogService.recordLegacy(tenantId, input).catch(() => {
      // Legacy audit writes must not fail business operations.
    });
    return audit;
  }

  private async getProductIfExists(
    tenantId: string,
    productId: string
  ): Promise<AdminProduct | null> {
    return this.getDoc<AdminProduct>(tenantId, 'products', productId);
  }

  private async getUserIfExists(tenantId: string, userId: string): Promise<AdminUser | null> {
    return this.getDoc<AdminUser>(tenantId, 'users', userId);
  }

  private async requireProduct(tenantId: string, productId: string): Promise<AdminProduct> {
    const value = await this.getProductIfExists(tenantId, productId);
    if (!value) {
      throw new Error('Product not found');
    }

    return value;
  }

  private async requireOrder(tenantId: string, orderId: string): Promise<AdminOrder> {
    const value = await this.getDoc<AdminOrder>(tenantId, 'orders', orderId);
    if (!value) {
      throw new Error('Order not found');
    }

    return value;
  }

  private async requireCustomer(tenantId: string, customerId: string): Promise<AdminCustomer> {
    const value = await this.getDoc<AdminCustomer>(tenantId, 'customers', customerId);
    if (!value) {
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
