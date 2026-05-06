import type * as admin from 'firebase-admin';
import { getFirestore, initializeFirestore } from '../firebase';
import { AdminOrder, AdminSessionUser, PaginationOptions } from '../types';
import { AuditLogService } from '../audit/audit-log-service';
import {
  AlertSeverity,
  AlertStatus,
  InventoryAlert,
  InventoryBalance,
  InventoryMovement,
  InventoryMovementType,
  ProductBrand,
  ProductCategory,
  ProductDetails,
  ProductImage,
  ProductInventoryMetrics,
  ProductListFilters,
  ProductListItem,
  ProductListResult,
  ProductPermissions,
  ProductPriceHistory,
  ProductRecord,
  ProductSalesMetrics,
  ProductStatus,
  ProductVariant,
  ReplenishmentPriority,
  ReplenishmentSuggestion,
  StockMovementInput,
  StockStatus,
} from './types';

const now = (): string => new Date().toISOString();
const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const DEFAULT_SCAN_LIMIT = 2000;
const DEFAULT_ORDER_SCAN_LIMIT = 1500;
const VALID_ORDER_STATUSES = new Set(['completed', 'processing', 'paid', 'pago', 'approved', 'aprovado']);

export function normalizeText(value?: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function buildProductSlug(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140);
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function optionalNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
  return '';
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function dateValue(...values: unknown[]): string {
  for (const value of values) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && value) return value;
  }
  return now();
}

function normalizeStatus(value: unknown, isActive?: unknown): ProductStatus {
  const status = normalizeText(value);
  if (['ativo', 'active'].includes(status)) return 'ativo';
  if (['inativo', 'inactive'].includes(status)) return 'inativo';
  if (['rascunho', 'draft'].includes(status)) return 'rascunho';
  if (['arquivado', 'archived', 'deleted'].includes(status)) return 'arquivado';
  if (['bloqueado', 'blocked'].includes(status)) return 'bloqueado';
  if (['esgotado', 'soldout', 'out_of_stock'].includes(status)) return 'esgotado';
  if (isActive === false) return 'inativo';
  return 'ativo';
}

function inventoryBalanceId(productId: string, variantId = 'main', warehouseId = 'default'): string {
  return `${productId}__${variantId || 'main'}__${warehouseId || 'default'}`;
}

function isValidOrder(order: AdminOrder & Record<string, unknown>): boolean {
  return VALID_ORDER_STATUSES.has(
    normalizeText(order.paymentStatus || order.payment_status || order.status)
  );
}

function getOrderItems(order: AdminOrder & Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
}

function formatStockoutDate(days: number | null): string | undefined {
  if (days === null || !Number.isFinite(days)) return undefined;
  return new Date(Date.now() + days * 86400000).toISOString();
}

export function calculateInventoryMetrics(input: {
  price: number;
  costPrice?: number | null;
  stockQuantity: number;
  reservedQuantity: number;
  blockedQuantity: number;
  minimumStock: number;
  maximumStock: number;
  safetyStock: number;
  quantitySold: number;
  averageDailySales: number | null;
  lastSaleAt?: string;
  analysisPeriodDays: number;
  revenueShareClass?: 'A' | 'B' | 'C' | 'insuficiente';
}): ProductInventoryMetrics {
  const availableQuantity = input.stockQuantity - input.reservedQuantity - input.blockedQuantity;
  const cost = input.costPrice ?? null;
  const marginPercent = cost !== null && input.price > 0 ? ((input.price - cost) / input.price) * 100 : null;
  const markup = cost && cost > 0 ? input.price / cost : null;
  const estimatedUnitProfit = cost !== null ? input.price - cost : null;
  const daysOfCoverage =
    input.averageDailySales && input.averageDailySales > 0
      ? availableQuantity / input.averageDailySales
      : null;
  const turnover =
    input.stockQuantity > 0 ? input.quantitySold / Math.max(input.stockQuantity, 1) : null;

  const missingFields: ProductInventoryMetrics['missingFields'] = [];
  if (cost === null) {
    missingFields.push({
      metric: 'Margem e markup',
      collection: 'products',
      field: 'cost_price/costPrice',
    });
  }
  if (input.averageDailySales === null) {
    missingFields.push({
      metric: 'Previsao de ruptura e cobertura',
      collection: 'orders/order_items',
      field: 'createdAt + items.quantity',
    });
  }

  const stockStatus = calculateStockStatus({
    availableQuantity,
    reservedQuantity: input.reservedQuantity,
    blockedQuantity: input.blockedQuantity,
    minimumStock: input.minimumStock,
    maximumStock: input.maximumStock,
    averageDailySales: input.averageDailySales,
    daysOfCoverage,
    lastSaleAt: input.lastSaleAt,
  });

  return {
    stockQuantity: input.stockQuantity,
    reservedQuantity: input.reservedQuantity,
    blockedQuantity: input.blockedQuantity,
    availableQuantity,
    minimumStock: input.minimumStock,
    maximumStock: input.maximumStock,
    safetyStock: input.safetyStock,
    marginPercent,
    markup,
    estimatedUnitProfit,
    daysOfCoverage,
    stockoutDate: formatStockoutDate(daysOfCoverage),
    turnover,
    abcClass: input.revenueShareClass || 'insuficiente',
    stockStatus,
    recommendation: recommendationFor(stockStatus, availableQuantity, input.minimumStock),
    missingFields,
  };
}

export function calculateStockStatus(input: {
  availableQuantity: number;
  reservedQuantity: number;
  blockedQuantity: number;
  minimumStock: number;
  maximumStock: number;
  averageDailySales: number | null;
  daysOfCoverage: number | null;
  lastSaleAt?: string;
}): StockStatus {
  if (input.availableQuantity <= 0) return 'sem_estoque';
  if (input.blockedQuantity > 0 && input.availableQuantity <= input.minimumStock) return 'bloqueado';
  if (input.averageDailySales && input.daysOfCoverage !== null && input.daysOfCoverage <= 7) {
    return 'risco_de_ruptura';
  }
  if (input.minimumStock > 0 && input.availableQuantity <= input.minimumStock) return 'baixo_estoque';
  if (input.maximumStock > 0 && input.availableQuantity > input.maximumStock) return 'excesso_de_estoque';
  if (input.averageDailySales === 0 && input.availableQuantity > 0 && input.lastSaleAt) {
    const idleDays = (Date.now() - new Date(input.lastSaleAt).getTime()) / 86400000;
    if (idleDays >= 90) return 'produto_parado';
  }
  if (input.reservedQuantity > 0) return 'reservado';
  return 'saudavel';
}

function recommendationFor(status: StockStatus, available: number, minimum: number): string {
  if (status === 'sem_estoque') return 'Repor estoque imediatamente antes de vender novamente.';
  if (status === 'risco_de_ruptura') return 'Priorizar reposicao com base na media diaria de vendas.';
  if (status === 'baixo_estoque') return `Repor pelo menos ${Math.max(minimum - available, 1)} unidades.`;
  if (status === 'excesso_de_estoque') return 'Avaliar promocao, bundle ou reducao de compra futura.';
  if (status === 'produto_parado') return 'Revisar preco, anuncio, categoria ou criar campanha.';
  if (status === 'bloqueado') return 'Revisar bloqueio de estoque antes de liberar vendas.';
  return 'Estoque sem acao urgente.';
}

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string | string[];
};

export class ProductCatalogService {
  private readonly audit: AuditLogService;

  constructor(audit = new AuditLogService()) {
    initializeFirestore();
    this.audit = audit;
  }

  private firestore(): admin.firestore.Firestore {
    const firestore = getFirestore();
    if (!firestore) {
      throw new Error('Firestore is required for product catalog persistence');
    }
    return firestore;
  }

  private collection(tenantId: string, name: string): admin.firestore.CollectionReference {
    return this.firestore().collection(`tenants/${tenantId}/admin/data/${name}`);
  }

  private legacyProductCollection(tenantId: string): admin.firestore.CollectionReference {
    return this.firestore().collection(`tenants/${tenantId}/products`);
  }

  permissionsFor(user: AdminSessionUser): ProductPermissions {
    const has = (permission: string) => user.role === 'admin' || Boolean(user.permissions?.includes(permission));
    return {
      canViewCost: has('visualizar_custo_produto'),
      canEdit: has('editar_produtos'),
      canDelete: has('excluir_produtos'),
      canArchive: has('arquivar_produtos'),
      canDuplicate: has('duplicar_produtos'),
      canImport: has('importar_produtos'),
      canExport: has('exportar_produtos'),
      canEditPrice: has('editar_preco_produto'),
      canEditCost: has('editar_custo_produto'),
      canEditFiscal: has('editar_dados_fiscais_produto'),
      canViewStock: has('visualizar_estoque'),
      canAdjustStock: has('ajustar_estoque'),
      canCreateStockMovement: has('criar_movimentacao_estoque'),
      canReserveStock: has('reservar_estoque'),
      canReleaseReservation: has('liberar_reserva_estoque'),
      canBlockStock: has('bloquear_estoque'),
      canTransferStock: has('transferir_estoque'),
      canViewStockMovements: has('visualizar_movimentacoes_estoque'),
      canViewInventoryAlerts: has('visualizar_alertas_estoque'),
      canManageReplenishment: has('gerenciar_recomendacoes_estoque'),
    };
  }

  private maskProduct(product: ProductListItem, permissions: ProductPermissions): ProductListItem {
    if (permissions.canViewCost) return product;
    return {
      ...product,
      costPrice: null,
      cost_price: null,
      inventory: {
        ...product.inventory,
        marginPercent: null,
        markup: null,
        estimatedUnitProfit: null,
      },
    };
  }

  private normalizeProduct(tenantId: string, docId: string, data: Record<string, unknown>): ProductRecord {
    const name = stringValue(data.name, data.title, docId);
    const sku = stringValue(data.sku, data.id, docId);
    const createdAt = dateValue(data.createdAt, data.created_at);
    const status = normalizeStatus(data.status, data.isActive);
    return {
      id: stringValue(data.id, docId),
      tenantId,
      tenant_id: tenantId,
      name,
      slug: stringValue(data.slug, data.urlSlug, buildProductSlug(name || sku)),
      shortDescription: stringValue(data.shortDescription, data.short_description),
      short_description: stringValue(data.shortDescription, data.short_description),
      description: stringValue(data.description),
      sku,
      barcode: stringValue(data.barcode, data.ean, data.gtin),
      productType: (stringValue(data.productType, data.product_type, 'produto_simples') as ProductRecord['productType']),
      product_type: (stringValue(data.productType, data.product_type, 'produto_simples') as ProductRecord['productType']),
      categoryId: stringValue(data.categoryId, data.category_id),
      category_id: stringValue(data.categoryId, data.category_id),
      category: stringValue(data.category, data.categoryName),
      subcategory: stringValue(data.subcategory),
      brandId: stringValue(data.brandId, data.brand_id),
      brand_id: stringValue(data.brandId, data.brand_id),
      brand: stringValue(data.brand, data.brandName),
      status,
      unitOfMeasure: (stringValue(data.unitOfMeasure, data.unit_of_measure, 'unidade') as ProductRecord['unitOfMeasure']),
      unit_of_measure: (stringValue(data.unitOfMeasure, data.unit_of_measure, 'unidade') as ProductRecord['unitOfMeasure']),
      price: numberValue(data.price, data.salePrice),
      promotionalPrice: optionalNumber(data.promotionalPrice, data.promotional_price, data.oldPrice),
      promotional_price: optionalNumber(data.promotionalPrice, data.promotional_price, data.oldPrice),
      costPrice: optionalNumber(data.costPrice, data.cost_price),
      cost_price: optionalNumber(data.costPrice, data.cost_price),
      weight: optionalNumber(data.weight),
      height: optionalNumber(data.height),
      width: optionalNumber(data.width),
      length: optionalNumber(data.length),
      trackInventory: data.trackInventory !== false && data.track_inventory !== false && data.manageStock !== false,
      track_inventory: data.trackInventory !== false && data.track_inventory !== false && data.manageStock !== false,
      mainImageUrl: stringValue(data.mainImageUrl, data.main_image_url, data.imageUrl),
      main_image_url: stringValue(data.mainImageUrl, data.main_image_url, data.imageUrl),
      tags: arrayValue(data.tags || data.tags_json),
      tags_json: arrayValue(data.tags || data.tags_json),
      metadata: ((data.metadata || data.metadata_json || {}) as Record<string, unknown>),
      metadata_json: ((data.metadata || data.metadata_json || {}) as Record<string, unknown>),
      minimumStock: numberValue(data.minimumStock, data.minimum_stock, data.lowStockThreshold),
      maximumStock: numberValue(data.maximumStock, data.maximum_stock),
      safetyStock: numberValue(data.safetyStock, data.safety_stock),
      leadTimeDays: numberValue(data.leadTimeDays, data.lead_time_days, 7),
      locationCode: stringValue(data.locationCode, data.location_code),
      ncm: stringValue(data.ncm),
      cfop: stringValue(data.cfop),
      cest: stringValue(data.cest),
      taxOrigin: stringValue(data.taxOrigin, data.tax_origin),
      taxableUnit: stringValue(data.taxableUnit, data.taxable_unit),
      fiscalCode: stringValue(data.fiscalCode, data.fiscal_code),
      seoTitle: stringValue(data.seoTitle, data.seo_title),
      metaDescription: stringValue(data.metaDescription, data.meta_description),
      urlSlug: stringValue(data.urlSlug, data.url_slug),
      createdBy: stringValue(data.createdBy, data.created_by),
      updatedBy: stringValue(data.updatedBy, data.updated_by),
      createdAt,
      updatedAt: dateValue(data.updatedAt, data.updated_at, createdAt),
      deletedAt: stringValue(data.deletedAt, data.deleted_at),
    };
  }

  private async scanProducts(tenantId: string): Promise<ProductRecord[]> {
    const [adminSnapshot, legacySnapshot] = await Promise.all([
      this.collection(tenantId, 'products').limit(DEFAULT_SCAN_LIMIT).get(),
      this.legacyProductCollection(tenantId).limit(DEFAULT_SCAN_LIMIT).get().catch(() => ({ docs: [] })),
    ]);
    const byId = new Map<string, ProductRecord>();
    legacySnapshot.docs.forEach((doc) => {
      const product = this.normalizeProduct(tenantId, doc.id, doc.data() as Record<string, unknown>);
      byId.set(product.id, product);
    });
    adminSnapshot.docs.forEach((doc) => {
      const product = this.normalizeProduct(tenantId, doc.id, doc.data() as Record<string, unknown>);
      byId.set(product.id, product);
    });
    return Array.from(byId.values());
  }

  private async scanVariants(tenantId: string, productId?: string): Promise<ProductVariant[]> {
    const query = productId
      ? this.collection(tenantId, 'product_variants').where('productId', '==', productId)
      : this.collection(tenantId, 'product_variants');
    const snapshot = await query.limit(DEFAULT_SCAN_LIMIT).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: stringValue(data.id, doc.id),
        tenantId,
        productId: stringValue(data.productId, data.product_id, productId),
        name: stringValue(data.name, doc.id),
        sku: stringValue(data.sku, doc.id),
        barcode: stringValue(data.barcode, data.ean),
        attributes: ((data.attributes || data.attributes_json || {}) as Record<string, string>),
        price: optionalNumber(data.price),
        promotionalPrice: optionalNumber(data.promotionalPrice, data.promotional_price),
        costPrice: optionalNumber(data.costPrice, data.cost_price),
        weight: optionalNumber(data.weight),
        height: optionalNumber(data.height),
        width: optionalNumber(data.width),
        length: optionalNumber(data.length),
        status: normalizeStatus(data.status),
        imageUrl: stringValue(data.imageUrl, data.image_url),
        minimumStock: numberValue(data.minimumStock, data.minimum_stock),
        maximumStock: numberValue(data.maximumStock, data.maximum_stock),
        safetyStock: numberValue(data.safetyStock, data.safety_stock),
        createdAt: dateValue(data.createdAt, data.created_at),
        updatedAt: dateValue(data.updatedAt, data.updated_at),
      };
    });
  }

  private async scanBalances(tenantId: string, productId?: string): Promise<InventoryBalance[]> {
    const query = productId
      ? this.collection(tenantId, 'inventory_balances').where('productId', '==', productId)
      : this.collection(tenantId, 'inventory_balances');
    const snapshot = await query.limit(DEFAULT_SCAN_LIMIT).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const stockQuantity = numberValue(data.stockQuantity, data.stock_quantity);
      const reservedQuantity = numberValue(data.reservedQuantity, data.reserved_quantity);
      const blockedQuantity = numberValue(data.blockedQuantity, data.blocked_quantity);
      return {
        id: stringValue(data.id, doc.id),
        tenantId,
        productId: stringValue(data.productId, data.product_id, productId),
        variantId: stringValue(data.variantId, data.variant_id) || undefined,
        warehouseId: stringValue(data.warehouseId, data.warehouse_id, 'default'),
        stockQuantity,
        reservedQuantity,
        blockedQuantity,
        availableQuantity: numberValue(data.availableQuantity, data.available_quantity, stockQuantity - reservedQuantity - blockedQuantity),
        minimumStock: numberValue(data.minimumStock, data.minimum_stock),
        maximumStock: numberValue(data.maximumStock, data.maximum_stock),
        safetyStock: numberValue(data.safetyStock, data.safety_stock),
        locationCode: stringValue(data.locationCode, data.location_code),
        lastCountedAt: stringValue(data.lastCountedAt, data.last_counted_at),
        updatedAt: dateValue(data.updatedAt, data.updated_at),
      };
    });
  }

  private async scanOrders(tenantId: string, days = 30): Promise<Array<AdminOrder & Record<string, unknown>>> {
    const from = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString();
    const snapshot = await this.collection(tenantId, 'orders')
      .where('createdAt', '>=', from)
      .orderBy('createdAt', 'desc')
      .limit(DEFAULT_ORDER_SCAN_LIMIT)
      .get()
      .catch(() => this.collection(tenantId, 'orders').limit(DEFAULT_ORDER_SCAN_LIMIT).get());
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AdminOrder & Record<string, unknown>);
  }

  private salesForProduct(
    product: ProductRecord,
    orders: Array<AdminOrder & Record<string, unknown>>,
    analysisPeriodDays: number
  ): ProductSalesMetrics {
    let quantitySold = 0;
    let revenue = 0;
    const orderIds = new Set<string>();
    const saleDates: string[] = [];
    orders.filter(isValidOrder).forEach((order) => {
      getOrderItems(order).forEach((item) => {
        const itemProductId = stringValue(item.productId, item.product_id);
        const itemSku = stringValue(item.sku);
        if (itemProductId !== product.id && normalizeText(itemSku) !== normalizeText(product.sku)) return;
        const quantity = numberValue(item.quantity, item.qty);
        const total = numberValue(item.totalPrice, item.total_price, quantity * numberValue(item.price, item.unitPrice, product.price));
        quantitySold += quantity;
        revenue += total;
        orderIds.add(order.id);
        saleDates.push(dateValue(order.createdAt, order.created_at));
      });
    });
    saleDates.sort();
    return {
      quantitySold,
      revenue,
      orders: orderIds.size,
      averageTicket: orderIds.size ? revenue / orderIds.size : null,
      averageDailySales: quantitySold > 0 ? quantitySold / Math.max(1, analysisPeriodDays) : null,
      firstSaleAt: saleDates[0],
      lastSaleAt: saleDates[saleDates.length - 1],
    };
  }

  private buildProductView(
    product: ProductRecord,
    balances: InventoryBalance[],
    sales: ProductSalesMetrics,
    analysisPeriodDays: number,
    abcClass: ProductInventoryMetrics['abcClass'] = 'insuficiente'
  ): ProductListItem {
    const productBalances = balances.filter((balance) => balance.productId === product.id && !balance.variantId);
    const stockQuantity = productBalances.length
      ? productBalances.reduce((sum, balance) => sum + balance.stockQuantity, 0)
      : numberValue((product as unknown as Record<string, unknown>).stock, (product as unknown as Record<string, unknown>).stockQuantity);
    const reservedQuantity = productBalances.reduce((sum, balance) => sum + balance.reservedQuantity, 0) ||
      numberValue((product as unknown as Record<string, unknown>).reservedStock);
    const blockedQuantity = productBalances.reduce((sum, balance) => sum + balance.blockedQuantity, 0);
    const minimumStock = productBalances.length
      ? Math.max(...productBalances.map((balance) => balance.minimumStock), product.minimumStock || 0)
      : product.minimumStock || 0;
    const maximumStock = productBalances.length
      ? Math.max(...productBalances.map((balance) => balance.maximumStock), product.maximumStock || 0)
      : product.maximumStock || 0;
    const safetyStock = productBalances.length
      ? Math.max(...productBalances.map((balance) => balance.safetyStock), product.safetyStock || 0)
      : product.safetyStock || 0;
    return {
      ...product,
      categoryName: product.category,
      brandName: product.brand,
      inventory: calculateInventoryMetrics({
        price: product.price,
        costPrice: product.costPrice,
        stockQuantity,
        reservedQuantity,
        blockedQuantity,
        minimumStock,
        maximumStock,
        safetyStock,
        quantitySold: sales.quantitySold,
        averageDailySales: sales.averageDailySales,
        lastSaleAt: sales.lastSaleAt,
        analysisPeriodDays,
        revenueShareClass: abcClass,
      }),
      sales,
    };
  }

  private matchesFilters(product: ProductListItem, filters: ProductListFilters): boolean {
    const search = normalizeText(filters.search);
    if (search) {
      const haystack = [
        product.id,
        product.name,
        product.sku,
        product.barcode,
        product.category,
        product.categoryId,
        product.brand,
        product.brandId,
        product.slug,
        ...(product.tags || []),
      ].map(normalizeText).join(' ');
      if (!haystack.includes(search)) return false;
    }
    if (filters.status && product.status !== filters.status) return false;
    if (filters.productId && product.id !== filters.productId) return false;
    if (filters.archived !== true && product.status === 'arquivado') return false;
    if (filters.stockStatus && product.inventory.stockStatus !== filters.stockStatus) return false;
    if (filters.categoryId && product.categoryId !== filters.categoryId) return false;
    if (filters.category && normalizeText(product.category) !== normalizeText(filters.category)) return false;
    if (filters.brandId && product.brandId !== filters.brandId) return false;
    if (filters.brand && normalizeText(product.brand) !== normalizeText(filters.brand)) return false;
    if (filters.lowStock && product.inventory.stockStatus !== 'baixo_estoque') return false;
    if (filters.noStock && product.inventory.stockStatus !== 'sem_estoque') return false;
    if (filters.healthyStock && product.inventory.stockStatus !== 'saudavel') return false;
    if (filters.reservedStock && product.inventory.reservedQuantity <= 0) return false;
    if (filters.excessStock && product.inventory.stockStatus !== 'excesso_de_estoque') return false;
    if (filters.stalled && product.inventory.stockStatus !== 'produto_parado') return false;
    if (filters.stockoutRisk && product.inventory.stockStatus !== 'risco_de_ruptura') return false;
    if (filters.minPrice !== undefined && product.price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && product.price > filters.maxPrice) return false;
    const cost = product.costPrice ?? null;
    if (filters.minCost !== undefined && (cost === null || cost < filters.minCost)) return false;
    if (filters.maxCost !== undefined && (cost === null || cost > filters.maxCost)) return false;
    const margin = product.inventory.marginPercent;
    if (filters.minMargin !== undefined && (margin === null || margin < filters.minMargin)) return false;
    if (filters.maxMargin !== undefined && (margin === null || margin > filters.maxMargin)) return false;
    if (filters.createdFrom && product.createdAt < filters.createdFrom) return false;
    if (filters.createdTo && product.createdAt > filters.createdTo) return false;
    if (filters.lastSaleFrom && (!product.sales.lastSaleAt || product.sales.lastSaleAt < filters.lastSaleFrom)) return false;
    if (filters.lastSaleTo && product.sales.lastSaleAt && product.sales.lastSaleAt > filters.lastSaleTo) return false;
    if (filters.hasImage === 'with' && !product.mainImageUrl) return false;
    if (filters.hasImage === 'without' && product.mainImageUrl) return false;
    if (filters.hasSku === 'with' && !product.sku) return false;
    if (filters.hasSku === 'without' && product.sku) return false;
    if (filters.hasBarcode === 'with' && !product.barcode) return false;
    if (filters.hasBarcode === 'without' && product.barcode) return false;
    if (filters.hasCost === 'with' && product.costPrice === null) return false;
    if (filters.hasCost === 'without' && product.costPrice !== null) return false;
    return true;
  }

  async listProducts(
    tenantId: string,
    pagination: PaginationOptions,
    filters: ProductListFilters,
    permissions: ProductPermissions
  ): Promise<ProductListResult> {
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.max(1, Math.min(100, pagination.limit || 20));
    const analysisPeriodDays = Math.max(1, Math.min(180, Number(filters.analysisPeriodDays || 30)));
    const [products, balances, orders] = await Promise.all([
      this.scanProducts(tenantId),
      this.scanBalances(tenantId),
      this.scanOrders(tenantId, analysisPeriodDays),
    ]);

    const salesByProduct = new Map(products.map((product) => [product.id, this.salesForProduct(product, orders, analysisPeriodDays)]));
    const revenueTotal = Array.from(salesByProduct.values()).reduce((sum, sales) => sum + sales.revenue, 0);
    const revenueSorted = Array.from(salesByProduct.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
    const abcByProduct = new Map<string, ProductInventoryMetrics['abcClass']>();
    let cumulative = 0;
    revenueSorted.forEach(([productId, sales]) => {
      if (revenueTotal <= 0) {
        abcByProduct.set(productId, 'insuficiente');
        return;
      }
      cumulative += sales.revenue / revenueTotal;
      abcByProduct.set(productId, cumulative <= 0.8 ? 'A' : cumulative <= 0.95 ? 'B' : 'C');
    });

    const views = products
      .map((product) =>
        this.buildProductView(
          product,
          balances,
          salesByProduct.get(product.id) || this.salesForProduct(product, [], analysisPeriodDays),
          analysisPeriodDays,
          abcByProduct.get(product.id)
        )
      )
      .filter((product) => this.matchesFilters(product, filters))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    const segments = views.reduce<Record<string, number>>((acc, product) => {
      acc[product.status] = (acc[product.status] || 0) + 1;
      acc[product.inventory.stockStatus] = (acc[product.inventory.stockStatus] || 0) + 1;
      if (product.inventory.abcClass !== 'insuficiente') acc[`abc_${product.inventory.abcClass}`] = (acc[`abc_${product.inventory.abcClass}`] || 0) + 1;
      return acc;
    }, {});

    const start = (page - 1) * limit;
    const items = views.slice(start, start + limit).map((product) => this.maskProduct(product, permissions));
    return {
      items,
      pagination: {
        page,
        limit,
        total: views.length,
        totalPages: Math.max(1, Math.ceil(views.length / limit)),
        hasNextPage: start + limit < views.length,
        hasPreviousPage: page > 1,
      },
      segments,
      missingFields: views.flatMap((product) => product.inventory.missingFields).slice(0, 12),
    };
  }

  async requireProduct(tenantId: string, productId: string): Promise<ProductRecord> {
    const snapshot = await this.collection(tenantId, 'products').doc(productId).get();
    if (snapshot.exists) {
      const product = this.normalizeProduct(tenantId, snapshot.id, snapshot.data() as Record<string, unknown>);
      if (product.tenantId !== tenantId) throw new Error('Produto nao encontrado');
      return product;
    }
    const legacy = await this.legacyProductCollection(tenantId).doc(productId).get().catch(() => null);
    if (legacy?.exists) return this.normalizeProduct(tenantId, legacy.id, legacy.data() as Record<string, unknown>);
    throw new Error('Produto nao encontrado');
  }

  async getDetails(
    tenantId: string,
    productId: string,
    permissions: ProductPermissions
  ): Promise<ProductDetails> {
    const product = await this.requireProduct(tenantId, productId);
    const [balances, variants, images, movements, priceHistory, orders, auditLogs] = await Promise.all([
      this.scanBalances(tenantId, productId),
      this.scanVariants(tenantId, productId),
      this.listImages(tenantId, productId),
      this.listStockMovements(tenantId, { productId, page: 1, limit: 50 }),
      this.listPriceHistory(tenantId, productId),
      this.scanOrders(tenantId, 90),
      this.audit.resourceTimeline(tenantId, 'product', productId, { page: 1, limit: 20 }).catch(() => ({ items: [] })),
    ]);
    const sales = this.salesForProduct(product, orders, 90);
    const view = this.maskProduct(this.buildProductView(product, balances, sales, 90), permissions);
    const intelligence = await this.getInventoryIntelligence(tenantId, { productId, analysisPeriodDays: 30 });
    return {
      product: view,
      variants,
      images,
      balances,
      movements: movements.items,
      alerts: intelligence.alerts.filter((alert) => alert.productId === productId),
      replenishmentSuggestions: intelligence.suggestions.filter((suggestion) => suggestion.productId === productId),
      priceHistory,
      recentOrders: orders
        .filter((order) => getOrderItems(order).some((item) => stringValue(item.productId, item.product_id) === productId || normalizeText(item.sku) === normalizeText(product.sku)))
        .slice(0, 20),
      auditLogs: auditLogs.items as unknown as Array<Record<string, unknown>>,
    };
  }

  private async assertSkuUnique(tenantId: string, sku: string, exclude?: { productId?: string; variantId?: string }): Promise<void> {
    const normalized = normalizeText(sku);
    const [products, variants] = await Promise.all([this.scanProducts(tenantId), this.scanVariants(tenantId)]);
    const productConflict = products.find((product) => normalizeText(product.sku) === normalized && product.id !== exclude?.productId);
    const variantConflict = variants.find((variant) => normalizeText(variant.sku) === normalized && variant.id !== exclude?.variantId);
    if (productConflict || variantConflict) throw new Error('SKU duplicado neste tenant');
  }

  async createProduct(
    tenantId: string,
    input: Partial<ProductRecord> & { initialStock?: number },
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<ProductRecord> {
    await this.assertSkuUnique(tenantId, String(input.sku));
    const id = randomId('prd');
    const timestamp = now();
    const product: ProductRecord = {
      ...input,
      id,
      tenantId,
      tenant_id: tenantId,
      name: String(input.name || ''),
      slug: input.slug || buildProductSlug(String(input.name || input.sku || id)),
      sku: String(input.sku || ''),
      productType: input.productType || 'produto_simples',
      product_type: input.productType || 'produto_simples',
      status: input.status || 'ativo',
      unitOfMeasure: input.unitOfMeasure || 'unidade',
      unit_of_measure: input.unitOfMeasure || 'unidade',
      price: Number(input.price || 0),
      costPrice: input.costPrice ?? null,
      cost_price: input.costPrice ?? null,
      promotionalPrice: input.promotionalPrice ?? null,
      promotional_price: input.promotionalPrice ?? null,
      trackInventory: input.trackInventory !== false,
      track_inventory: input.trackInventory !== false,
      tags: input.tags || [],
      tags_json: input.tags || [],
      metadata: input.metadata || {},
      metadata_json: input.metadata || {},
      minimumStock: Number(input.minimumStock || 0),
      maximumStock: Number(input.maximumStock || 0),
      safetyStock: Number(input.safetyStock || 0),
      leadTimeDays: Number(input.leadTimeDays || 7),
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.collection(tenantId, 'products').doc(id).set(product as unknown as Record<string, unknown>, { merge: false });
    if (Number(input.initialStock || 0) > 0) {
      await this.changeStock(tenantId, id, 'adjust', {
        quantity: Number(input.initialStock),
        reason: 'Estoque inicial do cadastro',
        origin: 'manual',
        idempotencyKey: `initial_${id}`,
        minimumStock: product.minimumStock,
        maximumStock: product.maximumStock,
        safetyStock: product.safetyStock,
        locationCode: product.locationCode,
      }, user, meta);
    }
    await this.recordAudit(tenantId, user, 'products.product.created', 'create', 'notice', 'success', product, undefined, product, meta);
    return product;
  }

  async updateProduct(
    tenantId: string,
    productId: string,
    updates: Partial<ProductRecord>,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<ProductRecord> {
    const current = await this.requireProduct(tenantId, productId);
    if (updates.sku && normalizeText(updates.sku) !== normalizeText(current.sku)) {
      await this.assertSkuUnique(tenantId, updates.sku, { productId });
    }
    const updated: ProductRecord = {
      ...current,
      ...updates,
      id: productId,
      tenantId,
      tenant_id: tenantId,
      slug: updates.slug || current.slug || buildProductSlug(updates.name || current.name),
      updatedBy: user.id,
      updatedAt: now(),
    };
    await this.collection(tenantId, 'products').doc(productId).set(updated as unknown as Record<string, unknown>, { merge: true });
    if (updates.price !== undefined || updates.costPrice !== undefined) {
      await this.addPriceHistory(tenantId, productId, current, updated, user.id);
    }
    await this.recordAudit(tenantId, user, 'products.product.updated', 'update', 'notice', 'success', updated, current, updated, meta);
    if (updates.price !== undefined && updates.price !== current.price) {
      await this.recordAudit(tenantId, user, 'products.product.price_changed', 'update', 'notice', 'success', updated, { price: current.price }, { price: updated.price }, meta);
    }
    if (updates.costPrice !== undefined && updates.costPrice !== current.costPrice) {
      await this.recordAudit(tenantId, user, 'products.product.cost_changed', 'update', 'warning', 'success', updated, { costPrice: current.costPrice }, { costPrice: updated.costPrice }, meta);
    }
    return updated;
  }

  async updateStatus(
    tenantId: string,
    productId: string,
    status: ProductStatus,
    reason: string | undefined,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<ProductRecord> {
    const updated = await this.updateProduct(tenantId, productId, { status }, user, meta);
    await this.recordAudit(tenantId, user, 'products.product.status_changed', 'update', 'notice', 'success', updated, undefined, { status, reason }, meta);
    return updated;
  }

  async archiveProduct(tenantId: string, productId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<ProductRecord> {
    const current = await this.requireProduct(tenantId, productId);
    const updated = await this.updateProduct(tenantId, productId, { status: 'arquivado', deletedAt: now() }, user, meta);
    await this.recordAudit(tenantId, user, 'products.product.archived', 'delete', 'warning', 'success', updated, current, updated, meta);
    return updated;
  }

  async duplicateProduct(tenantId: string, productId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<ProductRecord> {
    const current = await this.requireProduct(tenantId, productId);
    const copySku = `${current.sku}-COPY-${Date.now().toString(36).slice(-4)}`;
    const duplicated = await this.createProduct(
      tenantId,
      {
        ...current,
        name: `${current.name} (copia)`,
        sku: copySku,
        slug: buildProductSlug(`${current.name}-${copySku}`),
        initialStock: 0,
      },
      user,
      meta
    );
    await this.recordAudit(tenantId, user, 'products.product.duplicated', 'create', 'notice', 'success', duplicated, current, duplicated, meta);
    return duplicated;
  }

  async listVariants(tenantId: string, productId: string): Promise<ProductVariant[]> {
    await this.requireProduct(tenantId, productId);
    return this.scanVariants(tenantId, productId);
  }

  async createVariant(tenantId: string, productId: string, input: Partial<ProductVariant>, user: AdminSessionUser, meta: RequestMeta = {}): Promise<ProductVariant> {
    await this.requireProduct(tenantId, productId);
    await this.assertSkuUnique(tenantId, String(input.sku));
    const timestamp = now();
    const variant: ProductVariant = {
      id: randomId('var'),
      tenantId,
      productId,
      name: String(input.name || input.sku || ''),
      sku: String(input.sku || ''),
      barcode: input.barcode,
      attributes: input.attributes || {},
      price: input.price ?? null,
      promotionalPrice: input.promotionalPrice ?? null,
      costPrice: input.costPrice ?? null,
      weight: input.weight ?? null,
      height: input.height ?? null,
      width: input.width ?? null,
      length: input.length ?? null,
      status: input.status || 'ativo',
      imageUrl: input.imageUrl,
      minimumStock: Number(input.minimumStock || 0),
      maximumStock: Number(input.maximumStock || 0),
      safetyStock: Number(input.safetyStock || 0),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.collection(tenantId, 'product_variants').doc(variant.id).set(variant as unknown as Record<string, unknown>, { merge: false });
    await this.recordAudit(tenantId, user, 'products.variant.created', 'create', 'notice', 'success', { id: productId, name: variant.name, sku: variant.sku }, undefined, variant, meta);
    return variant;
  }

  async updateVariant(tenantId: string, productId: string, variantId: string, input: Partial<ProductVariant>, user: AdminSessionUser, meta: RequestMeta = {}): Promise<ProductVariant> {
    await this.requireProduct(tenantId, productId);
    const ref = this.collection(tenantId, 'product_variants').doc(variantId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('Variacao nao encontrada');
    const current = { id: snap.id, ...snap.data() } as ProductVariant;
    if (current.productId !== productId) throw new Error('Variacao nao encontrada');
    if (input.sku && normalizeText(input.sku) !== normalizeText(current.sku)) {
      await this.assertSkuUnique(tenantId, input.sku, { variantId });
    }
    const updated = { ...current, ...input, tenantId, productId, updatedAt: now() };
    await ref.set(updated as unknown as Record<string, unknown>, { merge: true });
    await this.recordAudit(tenantId, user, 'products.variant.updated', 'update', 'notice', 'success', { id: productId, name: updated.name, sku: updated.sku }, current, updated, meta);
    return updated;
  }

  async deleteVariant(tenantId: string, productId: string, variantId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<boolean> {
    const updated = await this.updateVariant(tenantId, productId, variantId, { status: 'arquivado' }, user, meta);
    await this.recordAudit(tenantId, user, 'products.variant.archived', 'delete', 'warning', 'success', { id: productId, name: updated.name, sku: updated.sku }, undefined, updated, meta);
    return true;
  }

  async listImages(tenantId: string, productId: string): Promise<ProductImage[]> {
    const snapshot = await this.collection(tenantId, 'product_images')
      .where('productId', '==', productId)
      .orderBy('position', 'asc')
      .limit(200)
      .get()
      .catch(() => this.collection(tenantId, 'product_images').where('productId', '==', productId).limit(200).get());
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ProductImage);
  }

  async addImage(tenantId: string, productId: string, input: Partial<ProductImage>, user: AdminSessionUser, meta: RequestMeta = {}): Promise<ProductImage> {
    await this.requireProduct(tenantId, productId);
    const timestamp = now();
    const image: ProductImage = {
      id: randomId('img'),
      tenantId,
      productId,
      variantId: input.variantId,
      url: String(input.url || ''),
      altText: input.altText,
      isMain: Boolean(input.isMain),
      position: Number(input.position || 0),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (image.isMain) await this.clearMainImages(tenantId, productId);
    await this.collection(tenantId, 'product_images').doc(image.id).set(image as unknown as Record<string, unknown>, { merge: false });
    if (image.isMain) await this.updateProduct(tenantId, productId, { mainImageUrl: image.url }, user, meta);
    await this.recordAudit(tenantId, user, 'products.product.image_added', 'create', 'info', 'success', { id: productId, name: image.altText || image.url, sku: '' }, undefined, image, meta);
    return image;
  }

  async deleteImage(tenantId: string, productId: string, imageId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<boolean> {
    const ref = this.collection(tenantId, 'product_images').doc(imageId);
    const snap = await ref.get();
    if (!snap.exists) return false;
    const image = { id: snap.id, ...snap.data() } as ProductImage;
    if (image.productId !== productId) throw new Error('Imagem nao encontrada');
    await ref.delete();
    await this.recordAudit(tenantId, user, 'products.product.image_removed', 'delete', 'info', 'success', { id: productId, name: image.url, sku: '' }, image, undefined, meta);
    return true;
  }

  async setMainImage(tenantId: string, productId: string, imageId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<ProductImage> {
    const ref = this.collection(tenantId, 'product_images').doc(imageId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('Imagem nao encontrada');
    const image = { id: snap.id, ...snap.data() } as ProductImage;
    if (image.productId !== productId) throw new Error('Imagem nao encontrada');
    await this.clearMainImages(tenantId, productId);
    const updated = { ...image, isMain: true, updatedAt: now() };
    await ref.set(updated as unknown as Record<string, unknown>, { merge: true });
    await this.updateProduct(tenantId, productId, { mainImageUrl: image.url }, user, meta);
    return updated;
  }

  private async clearMainImages(tenantId: string, productId: string): Promise<void> {
    const images = await this.listImages(tenantId, productId);
    await Promise.all(images.filter((image) => image.isMain).map((image) => this.collection(tenantId, 'product_images').doc(image.id).set({ isMain: false, updatedAt: now() }, { merge: true })));
  }

  async getStock(tenantId: string, productId: string): Promise<{ balances: InventoryBalance[]; movements: InventoryMovement[] }> {
    await this.requireProduct(tenantId, productId);
    const [balances, movements] = await Promise.all([
      this.scanBalances(tenantId, productId),
      this.listStockMovements(tenantId, { productId, page: 1, limit: 50 }),
    ]);
    return { balances, movements: movements.items };
  }

  async changeStock(
    tenantId: string,
    productId: string,
    operation: 'adjust' | 'increase' | 'decrease' | 'reserve' | 'release' | 'block' | 'unblock',
    input: StockMovementInput,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<{ balance: InventoryBalance; movement: InventoryMovement }> {
    const product = await this.requireProduct(tenantId, productId);
    if (product.status === 'arquivado') throw new Error('Produto arquivado nao pode ser movimentado sem reativacao');
    const warehouseId = input.warehouseId || 'default';
    const variantId = input.variantId || undefined;
    const idempotencyKey = input.idempotencyKey || `${operation}_${productId}_${variantId || 'main'}_${Date.now()}`;
    const duplicate = await this.collection(tenantId, 'inventory_movements')
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(1)
      .get()
      .catch(() => this.collection(tenantId, 'inventory_movements').where('idempotency_key', '==', idempotencyKey).limit(1).get());
    if (!duplicate.empty) {
      const movement = { id: duplicate.docs[0].id, ...duplicate.docs[0].data() } as InventoryMovement;
      const balance = (await this.scanBalances(tenantId, productId)).find((item) => item.id === inventoryBalanceId(productId, variantId || 'main', warehouseId));
      if (balance) return { balance, movement };
    }

    const balanceRef = this.collection(tenantId, 'inventory_balances').doc(inventoryBalanceId(productId, variantId || 'main', warehouseId));
    const movementRef = this.collection(tenantId, 'inventory_movements').doc(randomId('mov'));
    const result = await this.firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(balanceRef);
      const data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};
      let stockQuantity = numberValue(data.stockQuantity, data.stock_quantity, (product as unknown as Record<string, unknown>).stock, (product as unknown as Record<string, unknown>).stockQuantity);
      let reservedQuantity = numberValue(data.reservedQuantity, data.reserved_quantity);
      let blockedQuantity = numberValue(data.blockedQuantity, data.blocked_quantity);
      const beforeAvailable = stockQuantity - reservedQuantity - blockedQuantity;
      let movementType: InventoryMovementType = 'ajuste';
      let movementQuantity = Number(input.quantity);

      if (operation === 'adjust') {
        movementType = 'ajuste';
        movementQuantity = Number(input.quantity) - stockQuantity;
        stockQuantity = Number(input.quantity);
      } else if (operation === 'increase') {
        movementType = 'entrada';
        stockQuantity += Number(input.quantity);
      } else if (operation === 'decrease') {
        movementType = 'saida';
        if (beforeAvailable < Number(input.quantity)) throw new Error('Estoque insuficiente para saida');
        stockQuantity -= Number(input.quantity);
        movementQuantity = -Math.abs(Number(input.quantity));
      } else if (operation === 'reserve') {
        movementType = 'reserva';
        if (beforeAvailable < Number(input.quantity)) throw new Error('Estoque insuficiente para reserva');
        reservedQuantity += Number(input.quantity);
      } else if (operation === 'release') {
        movementType = 'liberacao_de_reserva';
        reservedQuantity = Math.max(0, reservedQuantity - Number(input.quantity));
        movementQuantity = -Math.abs(Number(input.quantity));
      } else if (operation === 'block') {
        movementType = 'bloqueio';
        if (beforeAvailable < Number(input.quantity)) throw new Error('Estoque insuficiente para bloqueio');
        blockedQuantity += Number(input.quantity);
      } else if (operation === 'unblock') {
        movementType = 'desbloqueio';
        blockedQuantity = Math.max(0, blockedQuantity - Number(input.quantity));
        movementQuantity = -Math.abs(Number(input.quantity));
      }

      if (stockQuantity < 0) throw new Error('Estoque negativo nao permitido');
      const availableQuantity = stockQuantity - reservedQuantity - blockedQuantity;
      const timestamp = now();
      const balance: InventoryBalance = {
        id: balanceRef.id,
        tenantId,
        productId,
        variantId,
        warehouseId,
        stockQuantity,
        reservedQuantity,
        blockedQuantity,
        availableQuantity,
        minimumStock: Number(input.minimumStock ?? data.minimumStock ?? data.minimum_stock ?? product.minimumStock ?? 0),
        maximumStock: Number(input.maximumStock ?? data.maximumStock ?? data.maximum_stock ?? product.maximumStock ?? 0),
        safetyStock: Number(input.safetyStock ?? data.safetyStock ?? data.safety_stock ?? product.safetyStock ?? 0),
        locationCode: input.locationCode || stringValue(data.locationCode, data.location_code, product.locationCode),
        updatedAt: timestamp,
      };
      const movement: InventoryMovement = {
        id: movementRef.id,
        tenantId,
        productId,
        variantId,
        warehouseId,
        type: movementType,
        quantity: movementQuantity,
        quantityBefore: beforeAvailable,
        quantityAfter: availableQuantity,
        reason: input.reason,
        origin: input.origin || 'manual',
        orderId: input.orderId,
        referenceId: input.referenceId,
        idempotencyKey,
        notes: input.notes,
        createdBy: user.id,
        createdAt: timestamp,
      };
      transaction.set(balanceRef, balance as unknown as Record<string, unknown>, { merge: true });
      transaction.set(movementRef, movement as unknown as Record<string, unknown>, { merge: false });
      return { balance, movement };
    });
    await this.recordAudit(tenantId, user, `inventory.stock.${operation}`, 'update', 'warning', 'success', product, undefined, result.movement, meta);
    return result;
  }

  async listStockMovements(
    tenantId: string,
    filters: { productId?: string; page?: number; limit?: number } = {}
  ): Promise<{ items: InventoryMovement[]; pagination: ProductListResult['pagination'] }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    const query = filters.productId
      ? this.collection(tenantId, 'inventory_movements').where('productId', '==', filters.productId)
      : this.collection(tenantId, 'inventory_movements');
    const snapshot = await query.limit(DEFAULT_SCAN_LIMIT).get();
    const rows = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as InventoryMovement)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    const start = (page - 1) * limit;
    return {
      items: rows.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / limit)),
        hasNextPage: start + limit < rows.length,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getInventoryIntelligence(
    tenantId: string,
    filters: ProductListFilters = {}
  ): Promise<{ products: ProductListItem[]; alerts: InventoryAlert[]; suggestions: ReplenishmentSuggestion[] }> {
    const list = await this.listProducts(tenantId, { page: 1, limit: 100 }, { ...filters, archived: true }, {
      canViewCost: true,
      canEdit: true,
      canDelete: true,
      canArchive: true,
      canDuplicate: true,
      canImport: true,
      canExport: true,
      canEditPrice: true,
      canEditCost: true,
      canEditFiscal: true,
      canViewStock: true,
      canAdjustStock: true,
      canCreateStockMovement: true,
      canReserveStock: true,
      canReleaseReservation: true,
      canBlockStock: true,
      canTransferStock: true,
      canViewStockMovements: true,
      canViewInventoryAlerts: true,
      canManageReplenishment: true,
    });
    const existingAlerts = await this.loadExistingAlerts(tenantId);
    const existingSuggestions = await this.loadExistingSuggestions(tenantId);
    const alerts = list.items.flatMap((product) => this.alertsForProduct(tenantId, product, existingAlerts));
    const suggestions = list.items.flatMap((product) => this.suggestionsForProduct(tenantId, product, existingSuggestions));
    await Promise.all([
      ...alerts.map((alert) => this.collection(tenantId, 'inventory_alerts').doc(alert.id).set(alert as unknown as Record<string, unknown>, { merge: true })),
      ...suggestions.map((suggestion) => this.collection(tenantId, 'replenishment_suggestions').doc(suggestion.id).set(suggestion as unknown as Record<string, unknown>, { merge: true })),
    ]);
    return { products: list.items, alerts, suggestions };
  }

  private async loadExistingAlerts(tenantId: string): Promise<Map<string, InventoryAlert>> {
    const snapshot = await this.collection(tenantId, 'inventory_alerts').limit(DEFAULT_SCAN_LIMIT).get();
    return new Map(snapshot.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() } as InventoryAlert]));
  }

  private async loadExistingSuggestions(tenantId: string): Promise<Map<string, ReplenishmentSuggestion>> {
    const snapshot = await this.collection(tenantId, 'replenishment_suggestions').limit(DEFAULT_SCAN_LIMIT).get();
    return new Map(snapshot.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() } as ReplenishmentSuggestion]));
  }

  private alertsForProduct(
    tenantId: string,
    product: ProductListItem,
    existing: Map<string, InventoryAlert>
  ): InventoryAlert[] {
    const alerts: InventoryAlert[] = [];
    const push = (type: InventoryAlert['type'], severity: AlertSeverity, title: string, description: string, recommendation: string) => {
      const id = `${type}_${product.id}`;
      const current = existing.get(id);
      if (current?.status === 'resolvido' || current?.status === 'ignorado') return;
      alerts.push({
        id,
        tenantId,
        productId: product.id,
        type,
        severity,
        title,
        description,
        recommendation,
        status: current?.status || 'novo',
        createdAt: current?.createdAt || now(),
        resolvedAt: current?.resolvedAt,
      });
    };
    if (product.inventory.stockStatus === 'sem_estoque') push('sem_estoque', 'critica', 'Produto sem estoque', `${product.name} nao possui estoque disponivel.`, 'Registrar entrada ou pausar venda.');
    if (product.inventory.stockStatus === 'baixo_estoque') push('baixo_estoque', 'alta', 'Abaixo do estoque minimo', `${product.name} esta abaixo do estoque minimo.`, product.inventory.recommendation);
    if (product.inventory.stockStatus === 'risco_de_ruptura') push('risco_de_ruptura', 'critica', 'Risco de ruptura', `${product.name} pode acabar em ${Math.ceil(product.inventory.daysOfCoverage || 0)} dias.`, product.inventory.recommendation);
    if (product.inventory.stockStatus === 'produto_parado') push('produto_parado', 'media', 'Produto parado', `${product.name} possui estoque e nao vende ha muito tempo.`, 'Criar promocao ou revisar anuncio.');
    if (product.inventory.stockStatus === 'excesso_de_estoque') push('excesso_de_estoque', 'media', 'Excesso de estoque', `${product.name} tem estoque acima do maximo configurado.`, 'Reduzir compra futura ou criar campanha.');
    if (product.costPrice === null) push('sem_custo', 'media', 'Produto sem custo', `${product.name} nao possui custo cadastrado.`, 'Cadastrar custo para calcular margem.');
    if (!product.sku) push('sem_sku', 'alta', 'Produto sem SKU', `${product.name} esta sem SKU.`, 'Cadastrar SKU unico por tenant.');
    if (!product.mainImageUrl) push('sem_imagem', 'baixa', 'Produto sem imagem', `${product.name} nao possui imagem principal.`, 'Adicionar imagem principal.');
    if (product.inventory.marginPercent !== null && product.inventory.marginPercent < 10) push('margem_baixa', 'alta', 'Margem baixa', `${product.name} tem margem estimada abaixo de 10%.`, 'Revisar preco ou custo.');
    if (product.inventory.abcClass === 'A' && ['baixo_estoque', 'risco_de_ruptura', 'sem_estoque'].includes(product.inventory.stockStatus)) push('classe_a_baixo_estoque', 'critica', 'Classe A com estoque baixo', `${product.name} e relevante no faturamento e precisa de atencao.`, 'Priorizar reposicao.');
    return alerts;
  }

  private suggestionsForProduct(
    tenantId: string,
    product: ProductListItem,
    existing: Map<string, ReplenishmentSuggestion>
  ): ReplenishmentSuggestion[] {
    if (!['baixo_estoque', 'risco_de_ruptura', 'sem_estoque'].includes(product.inventory.stockStatus)) return [];
    const leadTime = product.leadTimeDays || 7;
    const averageDailySales = product.sales.averageDailySales;
    const suggestedMinimumStock = averageDailySales === null ? null : Math.ceil(averageDailySales * leadTime + product.inventory.safetyStock);
    const suggestedMaximumStock = suggestedMinimumStock === null ? null : Math.max(suggestedMinimumStock * 2, product.inventory.maximumStock || 0);
    const suggestedQuantity = suggestedMaximumStock === null ? null : Math.max(0, suggestedMaximumStock - product.inventory.availableQuantity);
    const priority: ReplenishmentPriority =
      product.inventory.stockStatus === 'sem_estoque'
        ? 'critica'
        : product.inventory.stockStatus === 'risco_de_ruptura'
          ? 'alta'
          : 'media';
    const id = `replenishment_${product.id}`;
    const current = existing.get(id);
    if (current?.status === 'aceita' || current?.status === 'ignorada' || current?.status === 'resolvida') return [];
    return [
      {
        id,
        tenantId,
        productId: product.id,
        warehouseId: 'default',
        averageDailySales,
        leadTimeDays: leadTime,
        safetyStock: product.inventory.safetyStock,
        currentAvailableStock: product.inventory.availableQuantity,
        suggestedMinimumStock,
        suggestedMaximumStock,
        suggestedQuantity,
        daysUntilStockout: product.inventory.daysOfCoverage,
        priority,
        status: current?.status || 'nova',
        createdAt: current?.createdAt || now(),
        updatedAt: now(),
      },
    ];
  }

  async updateAlertStatus(tenantId: string, alertId: string, status: AlertStatus): Promise<InventoryAlert> {
    const ref = this.collection(tenantId, 'inventory_alerts').doc(alertId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('Alerta nao encontrado');
    const updated = {
      id: snap.id,
      ...snap.data(),
      status,
      resolvedAt: status === 'resolvido' ? now() : (snap.data() as Record<string, unknown>).resolvedAt,
    } as InventoryAlert;
    await ref.set(updated as unknown as Record<string, unknown>, { merge: true });
    return updated;
  }

  async updateSuggestionStatus(tenantId: string, suggestionId: string, status: ReplenishmentSuggestion['status'], user: AdminSessionUser, meta: RequestMeta = {}): Promise<ReplenishmentSuggestion> {
    const ref = this.collection(tenantId, 'replenishment_suggestions').doc(suggestionId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('Sugestao nao encontrada');
    const updated = { id: snap.id, ...snap.data(), status, updatedAt: now() } as ReplenishmentSuggestion;
    await ref.set(updated as unknown as Record<string, unknown>, { merge: true });
    await this.recordAudit(tenantId, user, `inventory.replenishment.${status}`, 'update', 'notice', 'success', { id: updated.productId, name: updated.id, sku: '' }, undefined, updated, meta);
    return updated;
  }

  async listCategories(tenantId: string): Promise<ProductCategory[]> {
    const snapshot = await this.collection(tenantId, 'product_categories').limit(500).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ProductCategory);
  }

  async saveCategory(tenantId: string, input: Partial<ProductCategory>, categoryId?: string): Promise<ProductCategory> {
    const timestamp = now();
    const id = categoryId || randomId('cat');
    const category: ProductCategory = {
      id,
      tenantId,
      parentId: input.parentId,
      name: String(input.name || ''),
      slug: input.slug || buildProductSlug(String(input.name || id)),
      description: input.description,
      status: input.status || 'ativa',
      createdAt: input.createdAt || timestamp,
      updatedAt: timestamp,
    };
    await this.collection(tenantId, 'product_categories').doc(id).set(category as unknown as Record<string, unknown>, { merge: true });
    return category;
  }

  async deleteCategory(tenantId: string, categoryId: string): Promise<boolean> {
    await this.collection(tenantId, 'product_categories').doc(categoryId).delete();
    return true;
  }

  async listBrands(tenantId: string): Promise<ProductBrand[]> {
    const snapshot = await this.collection(tenantId, 'brands').limit(500).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ProductBrand);
  }

  async saveBrand(tenantId: string, input: Partial<ProductBrand>, brandId?: string): Promise<ProductBrand> {
    const timestamp = now();
    const id = brandId || randomId('brd');
    const brand: ProductBrand = {
      id,
      tenantId,
      name: String(input.name || ''),
      slug: input.slug || buildProductSlug(String(input.name || id)),
      description: input.description,
      logoUrl: input.logoUrl,
      status: input.status || 'ativa',
      createdAt: input.createdAt || timestamp,
      updatedAt: timestamp,
    };
    await this.collection(tenantId, 'brands').doc(id).set(brand as unknown as Record<string, unknown>, { merge: true });
    return brand;
  }

  async deleteBrand(tenantId: string, brandId: string): Promise<boolean> {
    await this.collection(tenantId, 'brands').doc(brandId).delete();
    return true;
  }

  async importProducts(tenantId: string, items: Array<Partial<ProductRecord> & { initialStock?: number }>, mode: 'create_only' | 'upsert', user: AdminSessionUser, meta: RequestMeta = {}): Promise<{ created: number; updated: number; errors: Array<{ row: number; error: string }> }> {
    let created = 0;
    let updated = 0;
    const errors: Array<{ row: number; error: string }> = [];
    const existing = await this.scanProducts(tenantId);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      try {
        const found = existing.find((product) => normalizeText(product.sku) === normalizeText(item.sku));
        if (found && mode === 'upsert') {
          await this.updateProduct(tenantId, found.id, item, user, meta);
          updated += 1;
        } else if (found) {
          throw new Error('SKU duplicado');
        } else {
          await this.createProduct(tenantId, item, user, meta);
          created += 1;
        }
      } catch (error) {
        errors.push({ row: index + 1, error: (error as Error).message });
      }
    }
    await this.recordAudit(tenantId, user, 'products.product.imported', 'import', 'notice', errors.length ? 'partial' : 'success', { id: 'import', name: 'Importacao de produtos', sku: '' }, undefined, { created, updated, errors: errors.length }, meta);
    return { created, updated, errors };
  }

  async exportProducts(tenantId: string, filters: ProductListFilters, format: 'csv' | 'json', permissions: ProductPermissions, user: AdminSessionUser, meta: RequestMeta = {}): Promise<{ format: 'csv' | 'json'; contentBase64: string; total: number; generatedAt: string }> {
    const result = await this.listProducts(tenantId, { page: 1, limit: 500 }, filters, permissions);
    const rows = result.items.map((product) => ({
      id: product.id,
      nome: product.name,
      sku: product.sku,
      categoria: product.category || '',
      marca: product.brand || '',
      status: product.status,
      preco: product.price,
      custo: permissions.canViewCost ? product.costPrice : '',
      estoque_disponivel: product.inventory.availableQuantity,
      estoque_reservado: product.inventory.reservedQuantity,
      estoque_minimo: product.inventory.minimumStock,
      status_estoque: product.inventory.stockStatus,
      vendido_periodo: product.sales.quantitySold,
      ultima_venda: product.sales.lastSaleAt || '',
    }));
    const content = format === 'json'
      ? JSON.stringify(rows, null, 2)
      : [
          Object.keys(rows[0] || { id: '', nome: '', sku: '' }).join(','),
          ...rows.map((row) => Object.values(row).map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')),
        ].join('\n');
    await this.recordAudit(tenantId, user, 'products.product.exported', 'export', 'notice', 'success', { id: 'export', name: 'Exportacao de produtos', sku: '' }, undefined, { total: rows.length, format }, meta);
    return {
      format,
      contentBase64: Buffer.from(content, 'utf8').toString('base64'),
      total: rows.length,
      generatedAt: now(),
    };
  }

  productImportTemplate(): { filename: string; contentBase64: string } {
    const csv = 'name,sku,category,brand,price,costPrice,initialStock,minimumStock,maximumStock,status\nCamiseta Premium,CAM-PRETA-M,Roupas,T3CK,89.90,34.00,50,15,120,ativo';
    return {
      filename: 'modelo_importacao_produtos.csv',
      contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
    };
  }

  private async listPriceHistory(tenantId: string, productId: string): Promise<ProductPriceHistory[]> {
    const snapshot = await this.collection(tenantId, 'product_price_history')
      .where('productId', '==', productId)
      .limit(100)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ProductPriceHistory)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async addPriceHistory(
    tenantId: string,
    productId: string,
    current: ProductRecord,
    updated: ProductRecord,
    userId: string
  ): Promise<void> {
    const history: ProductPriceHistory = {
      id: randomId('price'),
      tenantId,
      productId,
      oldPrice: current.price,
      newPrice: updated.price,
      oldCost: current.costPrice,
      newCost: updated.costPrice,
      changedBy: userId,
      createdAt: now(),
    };
    await this.collection(tenantId, 'product_price_history').doc(history.id).set(history as unknown as Record<string, unknown>, { merge: false });
  }

  private async recordAudit(
    tenantId: string,
    user: AdminSessionUser,
    action: string,
    operation: 'create' | 'update' | 'delete' | 'view' | 'export' | 'import',
    severity: 'info' | 'notice' | 'warning' | 'error' | 'critical',
    outcome: 'success' | 'failure' | 'denied' | 'partial',
    resource: { id: string; name?: string; sku?: string },
    before: unknown,
    after: unknown,
    meta: RequestMeta
  ): Promise<void> {
    await this.audit.record({
      tenantId,
      actor: user,
      category: action.startsWith('inventory.') ? 'inventory' : 'products',
      action,
      operation,
      severity,
      outcome,
      module: action.startsWith('inventory.') ? 'inventory' : 'products',
      description: `Evento de produto/estoque: ${action}`,
      resource: {
        type: action.startsWith('inventory.') ? 'inventory' : 'product',
        id: resource.id,
        label: resource.name || resource.sku || resource.id,
      },
      before: before as Record<string, unknown> | undefined,
      after: after as Record<string, unknown> | undefined,
      ipAddress: meta.ipAddress,
      userAgent: Array.isArray(meta.userAgent) ? meta.userAgent.join(', ') : meta.userAgent,
      sensitive: action.includes('cost') || action.includes('export'),
      exportEvent: operation === 'export',
    }).catch(() => undefined);
  }
}
