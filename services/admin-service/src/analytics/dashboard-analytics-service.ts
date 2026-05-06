import type * as admin from 'firebase-admin';
import { getFirestore, initializeFirestore } from '../firebase';
import { AdminCustomer, AdminOrder, AdminProduct, AdminSessionUser } from '../types';

type DashboardPeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last15'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom';

type Trend = 'up' | 'down' | 'stable' | 'insufficient';

type DashboardFilters = {
  period: DashboardPeriodPreset;
  from: string;
  to: string;
  channel?: string;
  origin?: string;
  status?: string;
  paymentStatus?: string;
  category?: string;
  productId?: string;
  sku?: string;
  state?: string;
  city?: string;
  paymentMethod?: string;
};

type PeriodRange = {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  label: string;
  granularity: 'day' | 'week' | 'month';
};

type NormalizedOrderItem = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  grossRevenue: number;
  netRevenue?: number;
  discount: number;
  cost?: number;
  product?: AdminProduct | null;
};

type NormalizedOrder = {
  id: string;
  tenantId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerCity?: string;
  customerState?: string;
  status: string;
  paymentStatus: string;
  channel?: string;
  origin?: string;
  paymentMethod?: string;
  createdAt: string;
  paidAt?: string;
  total: number;
  subtotal?: number;
  discount: number;
  shipping: number;
  fees?: number;
  refund?: number;
  netTotal?: number;
  items: NormalizedOrderItem[];
  raw: AdminOrder & Record<string, unknown>;
};

type ProductRank = {
  productId: string;
  name: string;
  sku: string;
  category?: string;
  imageUrl?: string;
  quantity: number;
  orders: number;
  grossRevenue: number;
  netRevenue?: number;
  averageSoldPrice: number;
  revenueShare: number;
  variationPercent: number | null;
};

type CustomerRank = {
  customerId: string;
  name: string;
  maskedEmail: string;
  city?: string;
  state?: string;
  orders: number;
  totalSpent: number;
  averageTicket: number;
  lastOrderAt: string;
  type: 'novo' | 'recorrente' | 'indefinido';
};

type DashboardOverview = {
  filters: DashboardFilters;
  period: PeriodRange;
  generatedAt: string;
  summary: {
    grossRevenue: number;
    netRevenue: number | null;
    totalOrders: number;
    paidOrders: number;
    pendingOrders: number;
    cancelledOrders: number;
    refundedOrders: number;
    averageTicket: number;
    productsSold: number;
    bestSellingProduct?: ProductRank;
    topRevenueProduct?: ProductRank;
    buyers: number;
    newCustomers: number;
    recurringCustomers: number;
    growthRate: number | null;
  };
  comparisons: Record<string, Comparison>;
  revenue: {
    gross: number;
    net: number | null;
    approved: number;
    pending: number;
    cancelled: number;
    dailyAverage: number;
    bestDay?: { label: string; value: number };
    worstDay?: { label: string; value: number };
    series: Array<{ label: string; grossRevenue: number; orders: number }>;
    byChannel: Breakdown[];
    byCategory: Breakdown[];
    byPaymentMethod: Breakdown[];
  };
  orders: {
    total: number;
    paid: number;
    pending: number;
    cancelled: number;
    refunded: number;
    averageOrderValue: number;
    largestOrder?: RecentOrder;
    smallestOrder?: RecentOrder;
    byStatus: Breakdown[];
    byChannel: Breakdown[];
    byPaymentMethod: Breakdown[];
    series: Array<{ label: string; orders: number }>;
  };
  products: {
    topByQuantity: ProductRank[];
    topByRevenue: ProductRank[];
    growth: ProductRank[];
    decline: ProductRank[];
    zeroSales: ProductRank[];
  };
  customers: {
    totalBuyers: number;
    newCustomers: number;
    recurringCustomers: number;
    inactiveCustomers: number | null;
    repeatRate: number | null;
    averageTicketByCustomer: number;
    topByRevenue: CustomerRank[];
    topByOrders: CustomerRank[];
    byRegion: Breakdown[];
    newSeries: Array<{ label: string; customers: number }>;
  };
  channels: {
    available: boolean;
    rows: Breakdown[];
    missingField?: string;
  };
  payments: {
    available: boolean;
    rows: Breakdown[];
    missingField?: string;
  };
  recentOrders: {
    items: RecentOrder[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
  alerts: CommercialAlert[];
  dataQuality: {
    missingFields: Array<{
      metric: string;
      collection: string;
      field: string;
      howToPopulate: string;
    }>;
  };
};

type Comparison = {
  current: number;
  previous: number;
  difference: number;
  variationPercent: number | null;
  trend: Trend;
  message: string;
};

type Breakdown = {
  key: string;
  label: string;
  grossRevenue: number;
  netRevenue?: number | null;
  orders: number;
  productsSold?: number;
  averageTicket: number;
  share: number;
  variationPercent?: number | null;
};

type RecentOrder = {
  id: string;
  orderNumber: string;
  customer: string;
  total: number;
  status: string;
  paymentStatus: string;
  channel?: string;
  origin?: string;
  createdAt: string;
};

type CommercialAlert = {
  id: string;
  title: string;
  description: string;
  severity: 'baixa' | 'media' | 'alta';
  recommendedAction: string;
  link?: string;
};

type CacheEntry = {
  expiresAt: number;
  data: DashboardOverview;
};

const cache = new Map<string, CacheEntry>();
const OVERVIEW_CACHE_MS = Number(process.env.ADMIN_DASHBOARD_ANALYTICS_CACHE_MS || 45_000);
const ORDER_SCAN_LIMIT = Number(process.env.ADMIN_DASHBOARD_ORDER_SCAN_LIMIT || 5000);
const PRODUCT_SCAN_LIMIT = Number(process.env.ADMIN_DASHBOARD_PRODUCT_SCAN_LIMIT || 5000);
const CUSTOMER_SCAN_LIMIT = Number(process.env.ADMIN_DASHBOARD_CUSTOMER_SCAN_LIMIT || 5000);
const PAID_PAYMENT_STATUSES = new Set([
  'approved',
  'paid',
  'pago',
  'aprovado',
  'completed',
  'captured',
]);
const CANCELLED_ORDER_STATUSES = new Set(['cancelled', 'canceled', 'cancelado']);
const REFUNDED_PAYMENT_STATUSES = new Set(['refunded', 'refund', 'estornado', 'reembolsado']);
const PENDING_PAYMENT_STATUSES = new Set(['pending', 'pendente', 'waiting', 'aguardando']);

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const onlyDate = (date: Date): string => date.toISOString().slice(0, 10);

function parseDate(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return 0;
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function dateValue(...values: unknown[]): string {
  for (const value of values) {
    if (!value) continue;
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date(0).toISOString();
}

function calculatePercent(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

function trendFromVariation(value: number | null): Trend {
  if (value === null) return 'insufficient';
  if (value > 0.5) return 'up';
  if (value < -0.5) return 'down';
  return 'stable';
}

function compareMetric(label: string, current: number, previous: number): Comparison {
  const variationPercent = calculatePercent(current, previous);
  const trend = trendFromVariation(variationPercent);
  const difference = current - previous;
  const direction =
    trend === 'up'
      ? 'cresceu'
      : trend === 'down'
        ? 'caiu'
        : trend === 'stable'
          ? 'ficou estavel'
          : 'tem dados insuficientes para comparacao';
  return {
    current,
    previous,
    difference,
    variationPercent,
    trend,
    message:
      variationPercent === null
        ? `${label} nao possui base anterior suficiente.`
        : `${label} ${direction} ${Math.abs(variationPercent).toFixed(1)}% em relacao ao periodo anterior.`,
  };
}

function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return '-';
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(3, name.length - 2))}@${domain}`;
}

function resolvePeriod(query: Record<string, unknown>): { filters: DashboardFilters; range: PeriodRange } {
  const now = new Date();
  const period = String(query.period || 'last30') as DashboardPeriodPreset;
  let from: Date;
  let to: Date;
  let label = 'Ultimos 30 dias';

  switch (period) {
    case 'today':
      from = startOfDay(now);
      to = endOfDay(now);
      label = 'Hoje';
      break;
    case 'yesterday': {
      const yesterday = addDays(now, -1);
      from = startOfDay(yesterday);
      to = endOfDay(yesterday);
      label = 'Ontem';
      break;
    }
    case 'last7':
      from = startOfDay(addDays(now, -6));
      to = endOfDay(now);
      label = 'Ultimos 7 dias';
      break;
    case 'last15':
      from = startOfDay(addDays(now, -14));
      to = endOfDay(now);
      label = 'Ultimos 15 dias';
      break;
    case 'thisMonth':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = endOfDay(now);
      label = 'Este mes';
      break;
    case 'lastMonth':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      label = 'Mes passado';
      break;
    case 'thisYear':
      from = new Date(now.getFullYear(), 0, 1);
      to = endOfDay(now);
      label = 'Este ano';
      break;
    case 'custom':
      from = startOfDay(parseDate(query.from, addDays(now, -29)));
      to = endOfDay(parseDate(query.to, now));
      label = `${onlyDate(from)} a ${onlyDate(to)}`;
      break;
    case 'last30':
    default:
      from = startOfDay(addDays(now, -29));
      to = endOfDay(now);
      label = 'Ultimos 30 dias';
      break;
  }

  const durationMs = Math.max(86_400_000, to.getTime() - from.getTime());
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - durationMs);
  const days = Math.ceil(durationMs / 86_400_000);

  const filters: DashboardFilters = {
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    channel: stringValue(query.channel),
    origin: stringValue(query.origin),
    status: stringValue(query.status),
    paymentStatus: stringValue(query.paymentStatus),
    category: stringValue(query.category),
    productId: stringValue(query.productId),
    sku: stringValue(query.sku),
    state: stringValue(query.state),
    city: stringValue(query.city),
    paymentMethod: stringValue(query.paymentMethod),
  };

  return {
    filters,
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      previousFrom: previousFrom.toISOString(),
      previousTo: previousTo.toISOString(),
      label,
      granularity: days > 120 ? 'month' : days > 31 ? 'week' : 'day',
    },
  };
}

function bucketLabel(value: string, granularity: PeriodRange['granularity']): string {
  const date = new Date(value);
  if (granularity === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'week') {
    const firstDay = startOfDay(addDays(date, -date.getDay()));
    return onlyDate(firstDay);
  }
  return onlyDate(date);
}

function orderIsPaid(order: NormalizedOrder): boolean {
  return PAID_PAYMENT_STATUSES.has(order.paymentStatus) || normalizeText(order.status) === 'completed';
}

function orderIsCancelled(order: NormalizedOrder): boolean {
  return CANCELLED_ORDER_STATUSES.has(order.status);
}

function orderIsRefunded(order: NormalizedOrder): boolean {
  return REFUNDED_PAYMENT_STATUSES.has(order.paymentStatus);
}

function orderIsValidSale(order: NormalizedOrder): boolean {
  return !orderIsCancelled(order) && !orderIsRefunded(order) && orderIsPaid(order);
}

function hasOwnValue(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => record[key] !== undefined && record[key] !== null);
}

function recentOrder(order: NormalizedOrder): RecentOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customer: order.customerName || order.customerId || '-',
    total: order.total,
    status: order.status,
    paymentStatus: order.paymentStatus,
    channel: order.channel,
    origin: order.origin,
    createdAt: order.createdAt,
  };
}

export class DashboardAnalyticsService {
  constructor() {
    initializeFirestore();
  }

  private firestore(): admin.firestore.Firestore {
    const firestore = getFirestore();
    if (!firestore) {
      throw new Error('Firestore is required for admin dashboard analytics');
    }
    return firestore;
  }

  private adminCollection(tenantId: string, collection: string) {
    return this.firestore().collection(`tenants/${tenantId}/admin/data/${collection}`);
  }

  private tenantCollection(tenantId: string, collection: string) {
    return this.firestore().collection(`tenants/${tenantId}/${collection}`);
  }

  async getOverview(
    tenantId: string,
    query: Record<string, unknown>,
    user: AdminSessionUser
  ): Promise<DashboardOverview> {
    this.assertCanViewDashboard(user);
    const { filters, range } = resolvePeriod(query);
    const cacheKey = JSON.stringify({ tenantId, filters, page: query.page, limit: query.limit });
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(5, Math.min(50, Number(query.limit || 10)));
    const [orders, products, tenantProducts, customers] = await Promise.all([
      this.loadOrders(tenantId, range.previousFrom, range.to),
      this.loadProducts(tenantId, 'admin'),
      this.loadProducts(tenantId, 'tenant'),
      this.loadCustomers(tenantId),
    ]);

    const productsById = new Map<string, AdminProduct>();
    [...tenantProducts, ...products].forEach((product) => {
      productsById.set(product.id, product);
      if (product.sku) productsById.set(product.sku, product);
    });
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    const normalizedOrders = orders.map((order) =>
      this.normalizeOrder(order, productsById, customersById)
    );
    const currentOrders = normalizedOrders.filter((order) =>
      this.orderMatchesRangeAndFilters(order, range.from, range.to, filters)
    );
    const previousOrders = normalizedOrders.filter((order) =>
      this.orderMatchesRangeAndFilters(order, range.previousFrom, range.previousTo, filters)
    );
    const allCurrentValid = currentOrders.filter(orderIsValidSale);
    const allPreviousValid = previousOrders.filter(orderIsValidSale);
    const current = this.calculatePeriodMetrics(currentOrders, allCurrentValid, range, customersById);
    const previous = this.calculatePeriodMetrics(previousOrders, allPreviousValid, range, customersById);
    const productStats = this.calculateProductStats(allCurrentValid, allPreviousValid);
    const customerStats = this.calculateCustomerStats(
      allCurrentValid,
      normalizedOrders,
      filters,
      range,
      customersById
    );
    const recent = currentOrders.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const totalPages = Math.max(1, Math.ceil(recent.length / limit));
    const missingFields = this.detectMissingFields(normalizedOrders);
    const byChannel = this.breakdownBy(allCurrentValid, allPreviousValid, 'channel', current.grossRevenue);
    const byPaymentMethod = this.breakdownBy(
      allCurrentValid,
      allPreviousValid,
      'paymentMethod',
      current.grossRevenue
    );
    const byCategory = this.breakdownItemsBy(allCurrentValid, 'category', current.grossRevenue);
    const alerts = this.buildAlerts(current, previous, productStats.topByRevenue, currentOrders);

    const overview: DashboardOverview = {
      filters,
      period: range,
      generatedAt: new Date().toISOString(),
      summary: {
        grossRevenue: current.grossRevenue,
        netRevenue: current.netRevenue,
        totalOrders: currentOrders.length,
        paidOrders: current.paidOrders,
        pendingOrders: current.pendingOrders,
        cancelledOrders: current.cancelledOrders,
        refundedOrders: current.refundedOrders,
        averageTicket: current.averageTicket,
        productsSold: current.productsSold,
        bestSellingProduct: productStats.topByQuantity[0],
        topRevenueProduct: productStats.topByRevenue[0],
        buyers: customerStats.totalBuyers,
        newCustomers: customerStats.newCustomers,
        recurringCustomers: customerStats.recurringCustomers,
        growthRate: calculatePercent(current.grossRevenue, previous.grossRevenue),
      },
      comparisons: {
        grossRevenue: compareMetric('O faturamento bruto', current.grossRevenue, previous.grossRevenue),
        totalOrders: compareMetric('O total de pedidos', currentOrders.length, previousOrders.length),
        averageTicket: compareMetric('O ticket medio', current.averageTicket, previous.averageTicket),
        productsSold: compareMetric('Os produtos vendidos', current.productsSold, previous.productsSold),
        newCustomers: compareMetric('Os clientes novos', customerStats.newCustomers, previous.newCustomers),
      },
      revenue: {
        gross: current.grossRevenue,
        net: current.netRevenue,
        approved: current.approvedRevenue,
        pending: current.pendingRevenue,
        cancelled: current.cancelledRevenue,
        dailyAverage: current.dailyAverage,
        bestDay: current.bestDay,
        worstDay: current.worstDay,
        series: current.series,
        byChannel,
        byCategory,
        byPaymentMethod,
      },
      orders: {
        total: currentOrders.length,
        paid: current.paidOrders,
        pending: current.pendingOrders,
        cancelled: current.cancelledOrders,
        refunded: current.refundedOrders,
        averageOrderValue: current.averageOrderValue,
        largestOrder: recent.length
          ? recentOrder([...currentOrders].sort((a, b) => b.total - a.total)[0])
          : undefined,
        smallestOrder: recent.length
          ? recentOrder([...currentOrders].sort((a, b) => a.total - b.total)[0])
          : undefined,
        byStatus: this.breakdownBy(currentOrders, previousOrders, 'status', current.grossRevenue),
        byChannel,
        byPaymentMethod,
        series: current.series.map((item) => ({ label: item.label, orders: item.orders })),
      },
      products: productStats,
      customers: customerStats,
      channels: {
        available: byChannel.length > 0,
        rows: byChannel,
        missingField: byChannel.length > 0 ? undefined : 'orders.channel ou orders.marketplace',
      },
      payments: {
        available: byPaymentMethod.length > 0,
        rows: byPaymentMethod,
        missingField: byPaymentMethod.length > 0 ? undefined : 'orders.paymentMethod ou payments.method',
      },
      recentOrders: {
        items: recent.slice((page - 1) * limit, page * limit).map(recentOrder),
        pagination: {
          page,
          limit,
          total: recent.length,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      alerts,
      dataQuality: { missingFields },
    };

    cache.set(cacheKey, { expiresAt: Date.now() + OVERVIEW_CACHE_MS, data: overview });
    return overview;
  }

  async getSection(
    tenantId: string,
    query: Record<string, unknown>,
    user: AdminSessionUser,
    section: keyof Pick<
      DashboardOverview,
      'revenue' | 'orders' | 'products' | 'customers' | 'channels' | 'payments' | 'recentOrders' | 'alerts'
    >
  ) {
    const overview = await this.getOverview(tenantId, query, user);
    return overview[section];
  }

  async exportReport(
    tenantId: string,
    query: Record<string, unknown>,
    user: AdminSessionUser,
    body: Record<string, unknown>
  ) {
    this.assertCanViewDashboard(user);
    const reportType = String(body.reportType || 'overview');
    const overview = await this.getOverview(tenantId, { ...query, page: 1, limit: 50 }, user);
    const rows = this.buildExportRows(overview, reportType);
    const header = Object.keys(rows[0] || { message: 'Sem dados' });
    const csv = [
      header.join(','),
      ...rows.map((row) =>
        header
          .map((field) => `"${String(row[field] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n');

    return {
      reportType,
      fileName: `t3ck-dashboard-${reportType}-${overview.period.from.slice(0, 10)}-${overview.period.to.slice(0, 10)}.csv`,
      mimeType: 'text/csv',
      contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
      generatedAt: new Date().toISOString(),
    };
  }

  private assertCanViewDashboard(user: AdminSessionUser): void {
    if (user.role === 'admin') return;
    const permissions = new Set(user.permissions || []);
    if (!permissions.size || permissions.has('visualizar_pedidos') || permissions.has('visualizar_logs')) {
      return;
    }
    throw new Error('permission denied: visualizar_pedidos');
  }

  private async loadOrders(tenantId: string, from: string, to: string): Promise<Array<AdminOrder & Record<string, unknown>>> {
    const snapshot = await this.adminCollection(tenantId, 'orders')
      .where('createdAt', '>=', from)
      .where('createdAt', '<=', to)
      .orderBy('createdAt', 'desc')
      .limit(ORDER_SCAN_LIMIT)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AdminOrder & Record<string, unknown>);
  }

  private async loadProducts(tenantId: string, source: 'admin' | 'tenant'): Promise<AdminProduct[]> {
    const collection =
      source === 'admin' ? this.adminCollection(tenantId, 'products') : this.tenantCollection(tenantId, 'products');
    const snapshot = await collection.limit(PRODUCT_SCAN_LIMIT).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: stringValue(data.id, doc.id),
        tenantId,
        name: stringValue(data.name, data.title, doc.id),
        sku: stringValue(data.sku, data.id, doc.id),
        price: numberValue(data.price, data.salePrice),
        stock: numberValue(data.stock, data.stockQuantity),
        status: normalizeText(data.status || (data.isActive === false ? 'inactive' : 'active')) as AdminProduct['status'],
        category: stringValue(data.category, data.categoryId),
        ncm: stringValue(data.ncm),
        cfop: stringValue(data.cfop),
        createdAt: dateValue(data.createdAt),
        updatedAt: dateValue(data.updatedAt),
        ...(data as Record<string, unknown>),
      } as AdminProduct;
    });
  }

  private async loadCustomers(tenantId: string): Promise<AdminCustomer[]> {
    const snapshot = await this.adminCollection(tenantId, 'customers').limit(CUSTOMER_SCAN_LIMIT).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AdminCustomer);
  }

  private normalizeOrder(
    order: AdminOrder & Record<string, unknown>,
    productsById: Map<string, AdminProduct>,
    customersById: Map<string, AdminCustomer>
  ): NormalizedOrder {
    const customer = customersById.get(String(order.customerId || order.customer_id || ''));
    const customerAddress = (customer?.address || {}) as Record<string, unknown>;
    const rawCustomer = ((order.customer || {}) as Record<string, unknown>) || {};
    const rawAddress = ((order.shippingAddress || order.deliveryAddress || rawCustomer.address || {}) as Record<string, unknown>) || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const normalizedItems = items.map((item: Record<string, unknown>) => {
      const productId = stringValue(item.productId, item.product_id, item.id);
      const sku = stringValue(item.sku, productId);
      const product = productsById.get(productId) || productsById.get(sku) || null;
      const quantity = numberValue(item.quantity, item.qty);
      const unitPrice = numberValue(item.unitPrice, item.unit_price, item.price, product?.price);
      const discount = numberValue(item.discountTotal, item.discount_total, item.discount);
      const grossRevenue = numberValue(item.totalPrice, item.total_price, quantity * unitPrice);
      const netRevenue = hasOwnValue(item, ['netTotal', 'net_total', 'netPrice'])
        ? numberValue(item.netTotal, item.net_total, item.netPrice)
        : undefined;
      return {
        productId,
        sku,
        name: stringValue(item.name, product?.name, productId),
        category: stringValue(item.category, item.categoryId, item.category_id, product?.category),
        quantity,
        unitPrice,
        grossRevenue,
        netRevenue,
        discount,
        cost: hasOwnValue(item, ['costPrice', 'cost_price']) ? numberValue(item.costPrice, item.cost_price) : undefined,
        product,
      };
    });

    const total = numberValue(order.total, order.totalPrice, order.gross_total);
    const subtotal = hasOwnValue(order, ['subtotal']) ? numberValue(order.subtotal) : undefined;
    const discount = numberValue(order.discountTotal, order.discount_total, order.discount);
    const shipping = numberValue(order.shippingTotal, order.shipping_total, order.shippingCost, order.freight);
    const fees = hasOwnValue(order, ['feeAmount', 'fee_amount', 'fees']) ? numberValue(order.feeAmount, order.fee_amount, order.fees) : undefined;
    const refund = hasOwnValue(order, ['refundTotal', 'refund_total', 'refundedAmount'])
      ? numberValue(order.refundTotal, order.refund_total, order.refundedAmount)
      : undefined;
    const netTotal = hasOwnValue(order, ['netTotal', 'net_total'])
      ? numberValue(order.netTotal, order.net_total)
      : undefined;
    const channel = stringValue(order.channel, order.salesChannel, order.marketplace);
    const origin = stringValue(order.origin, order.source, order.marketplace, channel);
    const paymentMethod = stringValue(order.paymentMethod, order.payment_method, order.method);

    return {
      id: stringValue(order.id),
      tenantId: stringValue(order.tenantId, order.tenant_id),
      orderNumber: stringValue(order.orderNumber, order.order_number, order.number, order.id),
      customerId: stringValue(order.customerId, order.customer_id),
      customerName: stringValue(rawCustomer.name, customer?.name, order.customerId),
      customerEmail: stringValue(rawCustomer.email, customer?.email),
      customerCity: stringValue(rawAddress.city, rawAddress.cidade, customerAddress.city, customerAddress.cidade),
      customerState: stringValue(rawAddress.state, rawAddress.uf, customerAddress.state, customerAddress.uf),
      status: normalizeText(order.status),
      paymentStatus: normalizeText(order.paymentStatus || order.payment_status),
      channel,
      origin,
      paymentMethod,
      createdAt: dateValue(order.createdAt, order.created_at),
      paidAt: dateValue(order.paidAt, order.paid_at),
      total,
      subtotal,
      discount,
      shipping,
      fees,
      refund,
      netTotal,
      items: normalizedItems,
      raw: order,
    };
  }

  private orderMatchesRangeAndFilters(
    order: NormalizedOrder,
    from: string,
    to: string,
    filters: DashboardFilters
  ): boolean {
    const createdAt = Date.parse(order.createdAt);
    if (createdAt < Date.parse(from) || createdAt > Date.parse(to)) return false;
    if (filters.channel && normalizeText(order.channel) !== normalizeText(filters.channel)) return false;
    if (filters.origin && normalizeText(order.origin) !== normalizeText(filters.origin)) return false;
    if (filters.status && order.status !== normalizeText(filters.status)) return false;
    if (filters.paymentStatus && order.paymentStatus !== normalizeText(filters.paymentStatus)) return false;
    if (filters.state && normalizeText(order.customerState) !== normalizeText(filters.state)) return false;
    if (filters.city && normalizeText(order.customerCity) !== normalizeText(filters.city)) return false;
    if (filters.paymentMethod && normalizeText(order.paymentMethod) !== normalizeText(filters.paymentMethod)) return false;
    if (filters.productId && !order.items.some((item) => item.productId === filters.productId)) return false;
    if (filters.sku && !order.items.some((item) => normalizeText(item.sku) === normalizeText(filters.sku))) return false;
    if (filters.category && !order.items.some((item) => normalizeText(item.category) === normalizeText(filters.category))) return false;
    return true;
  }

  private calculatePeriodMetrics(
    orders: NormalizedOrder[],
    validOrders: NormalizedOrder[],
    range: PeriodRange,
    customersById: Map<string, AdminCustomer>
  ) {
    const grossRevenue = validOrders.reduce((sum, order) => sum + order.total, 0);
    const netValues = validOrders.map((order) => order.netTotal).filter((value): value is number => value !== undefined);
    const netRevenue =
      netValues.length === validOrders.length
        ? netValues.reduce((sum, value) => sum + value, 0)
        : null;
    const paidOrders = orders.filter(orderIsPaid).length;
    const pendingOrders = orders.filter((order) => PENDING_PAYMENT_STATUSES.has(order.paymentStatus)).length;
    const cancelledOrders = orders.filter(orderIsCancelled).length;
    const refundedOrders = orders.filter(orderIsRefunded).length;
    const productsSold = validOrders.reduce(
      (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0
    );
    const approvedRevenue = validOrders.reduce((sum, order) => sum + order.total, 0);
    const pendingRevenue = orders
      .filter((order) => PENDING_PAYMENT_STATUSES.has(order.paymentStatus))
      .reduce((sum, order) => sum + order.total, 0);
    const cancelledRevenue = orders
      .filter((order) => orderIsCancelled(order) || orderIsRefunded(order))
      .reduce((sum, order) => sum + order.total, 0);
    const seriesMap = new Map<string, { label: string; grossRevenue: number; orders: number }>();
    validOrders.forEach((order) => {
      const label = bucketLabel(order.createdAt, range.granularity);
      const current = seriesMap.get(label) || { label, grossRevenue: 0, orders: 0 };
      current.grossRevenue += order.total;
      current.orders += 1;
      seriesMap.set(label, current);
    });
    const series = Array.from(seriesMap.values()).sort((a, b) => a.label.localeCompare(b.label));
    const byRevenue = [...series].sort((a, b) => b.grossRevenue - a.grossRevenue);
    const dayCount = Math.max(1, Math.ceil((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000));
    const customerFirstOrders = this.firstOrderDates(validOrders, customersById);

    return {
      grossRevenue,
      netRevenue,
      paidOrders,
      pendingOrders,
      cancelledOrders,
      refundedOrders,
      productsSold,
      approvedRevenue,
      pendingRevenue,
      cancelledRevenue,
      averageTicket: paidOrders ? approvedRevenue / paidOrders : 0,
      averageOrderValue: orders.length ? orders.reduce((sum, order) => sum + order.total, 0) / orders.length : 0,
      dailyAverage: grossRevenue / dayCount,
      bestDay: byRevenue[0] ? { label: byRevenue[0].label, value: byRevenue[0].grossRevenue } : undefined,
      worstDay: byRevenue.length ? { label: byRevenue[byRevenue.length - 1].label, value: byRevenue[byRevenue.length - 1].grossRevenue } : undefined,
      series,
      newCustomers: Array.from(customerFirstOrders.values()).filter(
        (date) => Date.parse(date) >= Date.parse(range.from) && Date.parse(date) <= Date.parse(range.to)
      ).length,
    };
  }

  private calculateProductStats(
    currentOrders: NormalizedOrder[],
    previousOrders: NormalizedOrder[]
  ): DashboardOverview['products'] {
    const current = this.productMap(currentOrders);
    const previous = this.productMap(previousOrders);
    const totalRevenue = Array.from(current.values()).reduce((sum, product) => sum + product.grossRevenue, 0);
    const rows = Array.from(current.values()).map((row) => {
      const prev = previous.get(row.productId) || previous.get(row.sku);
      return {
        ...row,
        averageSoldPrice: row.quantity ? row.grossRevenue / row.quantity : 0,
        revenueShare: totalRevenue ? (row.grossRevenue / totalRevenue) * 100 : 0,
        variationPercent: calculatePercent(row.quantity, prev?.quantity || 0),
      };
    });
    return {
      topByQuantity: [...rows].sort((a, b) => b.quantity - a.quantity).slice(0, 20),
      topByRevenue: [...rows].sort((a, b) => b.grossRevenue - a.grossRevenue).slice(0, 20),
      growth: [...rows]
        .filter((row) => row.variationPercent !== null && row.variationPercent > 0)
        .sort((a, b) => (b.variationPercent || 0) - (a.variationPercent || 0))
        .slice(0, 10),
      decline: [...rows]
        .filter((row) => row.variationPercent !== null && row.variationPercent < 0)
        .sort((a, b) => (a.variationPercent || 0) - (b.variationPercent || 0))
        .slice(0, 10),
      zeroSales: [],
    };
  }

  private productMap(orders: NormalizedOrder[]): Map<string, ProductRank> {
    const byProduct = new Map<string, ProductRank & { orderIds: Set<string> }>();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const key = item.sku || item.productId;
        const current =
          byProduct.get(key) ||
          ({
            productId: item.productId,
            name: item.name,
            sku: item.sku,
            category: item.category,
            imageUrl: stringValue(
              (item.product as Record<string, unknown> | null)?.mainImageUrl,
              (item.product as Record<string, unknown> | null)?.imageUrl
            ),
            quantity: 0,
            orders: 0,
            grossRevenue: 0,
            netRevenue: 0,
            averageSoldPrice: 0,
            revenueShare: 0,
            variationPercent: null,
            orderIds: new Set<string>(),
          } as ProductRank & { orderIds: Set<string> });
        current.quantity += item.quantity;
        current.grossRevenue += item.grossRevenue;
        current.netRevenue = (current.netRevenue || 0) + (item.netRevenue || item.grossRevenue - item.discount);
        current.orderIds.add(order.id);
        current.orders = current.orderIds.size;
        byProduct.set(key, current);
      });
    });
    return new Map(
      Array.from(byProduct.entries()).map(([key, value]) => {
        const { orderIds: _orderIds, ...rank } = value;
        return [key, rank];
      })
    );
  }

  private calculateCustomerStats(
    currentValidOrders: NormalizedOrder[],
    allOrders: NormalizedOrder[],
    _filters: DashboardFilters,
    range: PeriodRange,
    customersById: Map<string, AdminCustomer>
  ): DashboardOverview['customers'] {
    const byCustomer = new Map<string, CustomerRank>();
    const firstOrders = this.firstOrderDates(allOrders, customersById);
    const newSeriesMap = new Map<string, Set<string>>();
    currentValidOrders.forEach((order) => {
      const key = order.customerId || order.customerEmail || 'unknown';
      const current =
        byCustomer.get(key) ||
        ({
          customerId: key,
          name: order.customerName || key,
          maskedEmail: maskEmail(order.customerEmail),
          city: order.customerCity,
          state: order.customerState,
          orders: 0,
          totalSpent: 0,
          averageTicket: 0,
          lastOrderAt: order.createdAt,
          type: 'indefinido',
        } satisfies CustomerRank);
      current.orders += 1;
      current.totalSpent += order.total;
      current.averageTicket = current.totalSpent / current.orders;
      current.lastOrderAt = current.lastOrderAt > order.createdAt ? current.lastOrderAt : order.createdAt;
      const firstOrder = firstOrders.get(key);
      current.type = firstOrder && Date.parse(firstOrder) >= Date.parse(range.from) ? 'novo' : 'recorrente';
      byCustomer.set(key, current);

      if (current.type === 'novo') {
        const label = bucketLabel(order.createdAt, range.granularity);
        const bucket = newSeriesMap.get(label) || new Set<string>();
        bucket.add(key);
        newSeriesMap.set(label, bucket);
      }
    });
    const rows = Array.from(byCustomer.values());
    const newCustomers = rows.filter((row) => row.type === 'novo').length;
    const recurringCustomers = rows.filter((row) => row.type === 'recorrente').length;
    const totalRevenue = rows.reduce((sum, row) => sum + row.totalSpent, 0);
    return {
      totalBuyers: rows.length,
      newCustomers,
      recurringCustomers,
      inactiveCustomers: null,
      repeatRate: rows.length ? recurringCustomers / rows.length : null,
      averageTicketByCustomer: rows.length ? totalRevenue / rows.length : 0,
      topByRevenue: [...rows].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10),
      topByOrders: [...rows].sort((a, b) => b.orders - a.orders).slice(0, 10),
      byRegion: this.customerRegionBreakdown(rows, totalRevenue),
      newSeries: Array.from(newSeriesMap.entries())
        .map(([label, values]) => ({ label, customers: values.size }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }

  private firstOrderDates(
    orders: NormalizedOrder[],
    customersById: Map<string, AdminCustomer>
  ): Map<string, string> {
    const result = new Map<string, string>();
    orders.forEach((order) => {
      const key = order.customerId || order.customerEmail || 'unknown';
      const customer = customersById.get(order.customerId);
      const customerRecord = customer as Record<string, unknown> | undefined;
      const firstOrder = dateValue(customerRecord?.firstOrderAt, customerRecord?.first_order_at, order.createdAt);
      const current = result.get(key);
      if (!current || Date.parse(firstOrder) < Date.parse(current)) {
        result.set(key, firstOrder);
      }
    });
    return result;
  }

  private breakdownBy(
    currentOrders: NormalizedOrder[],
    previousOrders: NormalizedOrder[],
    field: keyof Pick<NormalizedOrder, 'channel' | 'paymentMethod' | 'status'>,
    totalRevenue: number
  ): Breakdown[] {
    const current = new Map<string, { revenue: number; orders: number; productsSold: number }>();
    const previous = new Map<string, number>();
    currentOrders.forEach((order) => {
      const key = stringValue(order[field], 'sem_informacao');
      if (key === 'sem_informacao') return;
      const row = current.get(key) || { revenue: 0, orders: 0, productsSold: 0 };
      row.revenue += order.total;
      row.orders += 1;
      row.productsSold += order.items.reduce((sum, item) => sum + item.quantity, 0);
      current.set(key, row);
    });
    previousOrders.filter(orderIsValidSale).forEach((order) => {
      const key = stringValue(order[field], 'sem_informacao');
      previous.set(key, (previous.get(key) || 0) + order.total);
    });
    return Array.from(current.entries())
      .map(([key, row]) => ({
        key,
        label: key,
        grossRevenue: row.revenue,
        netRevenue: null,
        orders: row.orders,
        productsSold: row.productsSold,
        averageTicket: row.orders ? row.revenue / row.orders : 0,
        share: totalRevenue ? (row.revenue / totalRevenue) * 100 : 0,
        variationPercent: calculatePercent(row.revenue, previous.get(key) || 0),
      }))
      .sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  private breakdownItemsBy(
    orders: NormalizedOrder[],
    field: keyof Pick<NormalizedOrderItem, 'category'>,
    totalRevenue: number
  ): Breakdown[] {
    const current = new Map<string, { revenue: number; orders: Set<string>; productsSold: number }>();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const key = stringValue(item[field], 'sem_categoria');
        const row = current.get(key) || { revenue: 0, orders: new Set<string>(), productsSold: 0 };
        row.revenue += item.grossRevenue;
        row.orders.add(order.id);
        row.productsSold += item.quantity;
        current.set(key, row);
      });
    });
    return Array.from(current.entries())
      .map(([key, row]) => ({
        key,
        label: key,
        grossRevenue: row.revenue,
        netRevenue: null,
        orders: row.orders.size,
        productsSold: row.productsSold,
        averageTicket: row.orders.size ? row.revenue / row.orders.size : 0,
        share: totalRevenue ? (row.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  private customerRegionBreakdown(customers: CustomerRank[], totalRevenue: number): Breakdown[] {
    const rows = new Map<string, { revenue: number; orders: number; customers: number }>();
    customers.forEach((customer) => {
      const key = [customer.city, customer.state].filter(Boolean).join('/') || 'sem_regiao';
      const row = rows.get(key) || { revenue: 0, orders: 0, customers: 0 };
      row.revenue += customer.totalSpent;
      row.orders += customer.orders;
      row.customers += 1;
      rows.set(key, row);
    });
    return Array.from(rows.entries())
      .map(([key, row]) => ({
        key,
        label: key,
        grossRevenue: row.revenue,
        orders: row.orders,
        averageTicket: row.orders ? row.revenue / row.orders : 0,
        share: totalRevenue ? (row.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  private buildAlerts(
    current: ReturnType<DashboardAnalyticsService['calculatePeriodMetrics']>,
    previous: ReturnType<DashboardAnalyticsService['calculatePeriodMetrics']>,
    topProducts: ProductRank[],
    orders: NormalizedOrder[]
  ): CommercialAlert[] {
    const alerts: CommercialAlert[] = [];
    const revenueGrowth = calculatePercent(current.grossRevenue, previous.grossRevenue);
    if (revenueGrowth !== null && revenueGrowth < -10) {
      alerts.push({
        id: 'revenue-drop',
        title: 'Faturamento em queda',
        description: `O faturamento caiu ${Math.abs(revenueGrowth).toFixed(1)}% em relacao ao periodo anterior.`,
        severity: revenueGrowth < -25 ? 'alta' : 'media',
        recommendedAction: 'Revise canais, produtos com queda e pedidos cancelados.',
        link: 'revenue',
      });
    }
    const cancelledRate = orders.length ? current.cancelledOrders / orders.length : 0;
    if (cancelledRate > 0.12) {
      alerts.push({
        id: 'cancelled-orders',
        title: 'Cancelamentos acima do normal',
        description: `${(cancelledRate * 100).toFixed(1)}% dos pedidos do periodo estao cancelados.`,
        severity: cancelledRate > 0.25 ? 'alta' : 'media',
        recommendedAction: 'Verifique estoque, pagamento e prazos de envio.',
        link: 'orders',
      });
    }
    if (topProducts[0]?.revenueShare > 35) {
      alerts.push({
        id: 'product-concentration',
        title: 'Receita concentrada em produto',
        description: `${topProducts[0].name} representa ${topProducts[0].revenueShare.toFixed(1)}% do faturamento.`,
        severity: 'media',
        recommendedAction: 'Avalie estoque e diversifique campanhas para reduzir dependencia.',
        link: 'products',
      });
    }
    const ticketGrowth = calculatePercent(current.averageTicket, previous.averageTicket);
    if (ticketGrowth !== null && ticketGrowth < -8) {
      alerts.push({
        id: 'ticket-drop',
        title: 'Ticket medio em queda',
        description: `O ticket medio caiu ${Math.abs(ticketGrowth).toFixed(1)}%.`,
        severity: 'baixa',
        recommendedAction: 'Teste combos, frete progressivo ou recomendacoes de produto.',
        link: 'orders',
      });
    }
    if (alerts.length === 0) {
      alerts.push({
        id: 'stable-performance',
        title: 'Operacao sem alertas criticos',
        description: 'Nenhum desvio comercial relevante foi encontrado no periodo selecionado.',
        severity: 'baixa',
        recommendedAction: 'Acompanhe os rankings de produto e clientes recorrentes.',
        link: 'overview',
      });
    }
    return alerts;
  }

  private detectMissingFields(orders: NormalizedOrder[]) {
    const missing: DashboardOverview['dataQuality']['missingFields'] = [];
    if (!orders.some((order) => order.netTotal !== undefined)) {
      missing.push({
        metric: 'Faturamento liquido',
        collection: 'orders',
        field: 'net_total ou netTotal',
        howToPopulate: 'Salvar total liquido do pedido apos descontos, taxas e reembolsos no fechamento do pagamento.',
      });
    }
    if (!orders.some((order) => order.channel)) {
      missing.push({
        metric: 'Canais de venda',
        collection: 'orders',
        field: 'channel',
        howToPopulate: 'Preencher canal/origem quando o pedido for criado ou importado.',
      });
    }
    if (!orders.some((order) => order.paymentMethod)) {
      missing.push({
        metric: 'Metodos de pagamento',
        collection: 'orders/payments',
        field: 'paymentMethod ou payments.method',
        howToPopulate: 'Persistir metodo de pagamento aprovado junto ao pedido ou em colecao payments.',
      });
    }
    if (!orders.some((order) => order.customerState || order.customerCity)) {
      missing.push({
        metric: 'Clientes por regiao',
        collection: 'orders/customers',
        field: 'shippingAddress.city/state ou customers.city/state',
        howToPopulate: 'Salvar cidade e UF do endereco de entrega/faturamento.',
      });
    }
    return missing;
  }

  private buildExportRows(overview: DashboardOverview, reportType: string): Array<Record<string, unknown>> {
    if (reportType === 'products') {
      return overview.products.topByRevenue.map((row, index) => ({ posicao: index + 1, ...row }));
    }
    if (reportType === 'customers') {
      return overview.customers.topByRevenue.map((row, index) => ({ posicao: index + 1, ...row }));
    }
    if (reportType === 'orders') {
      return overview.recentOrders.items.map((row) => ({ ...row }));
    }
    if (reportType === 'channels') {
      return overview.channels.rows.map((row) => ({ ...row }));
    }
    if (reportType === 'payments') {
      return overview.payments.rows.map((row) => ({ ...row }));
    }
    return Object.entries(overview.summary).map(([metric, value]) => ({ metric, value }));
  }
}
