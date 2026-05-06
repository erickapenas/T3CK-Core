import { PaginatedResult } from '../types';

export type ProductStatus =
  | 'ativo'
  | 'inativo'
  | 'rascunho'
  | 'arquivado'
  | 'bloqueado'
  | 'esgotado';

export type ProductType =
  | 'produto_simples'
  | 'produto_com_variacao'
  | 'kit'
  | 'bundle'
  | 'servico'
  | 'digital';

export type UnitOfMeasure =
  | 'unidade'
  | 'caixa'
  | 'pacote'
  | 'metro'
  | 'litro'
  | 'quilo'
  | 'grama'
  | 'par'
  | 'conjunto';

export type StockStatus =
  | 'saudavel'
  | 'baixo_estoque'
  | 'sem_estoque'
  | 'reservado'
  | 'bloqueado'
  | 'risco_de_ruptura'
  | 'excesso_de_estoque'
  | 'produto_parado'
  | 'aguardando_reposicao';

export type InventoryMovementType =
  | 'entrada'
  | 'saida'
  | 'ajuste'
  | 'reserva'
  | 'liberacao_de_reserva'
  | 'baixa_por_pedido'
  | 'estorno'
  | 'devolucao'
  | 'perda'
  | 'avaria'
  | 'transferencia'
  | 'contagem'
  | 'bloqueio'
  | 'desbloqueio';

export type InventoryAlertType =
  | 'sem_estoque'
  | 'baixo_estoque'
  | 'risco_de_ruptura'
  | 'produto_parado'
  | 'excesso_de_estoque'
  | 'sem_custo'
  | 'sem_sku'
  | 'sem_imagem'
  | 'margem_baixa'
  | 'reservado_alto'
  | 'divergencia_estoque'
  | 'venda_acelerada'
  | 'classe_a_baixo_estoque';

export type AlertSeverity = 'baixa' | 'media' | 'alta' | 'critica';
export type AlertStatus = 'novo' | 'visto' | 'resolvido' | 'ignorado';
export type ReplenishmentPriority = 'critica' | 'alta' | 'media' | 'baixa';
export type ReplenishmentStatus = 'nova' | 'aceita' | 'ignorada' | 'resolvida';

export interface ProductRecord {
  id: string;
  tenantId: string;
  tenant_id?: string;
  name: string;
  slug: string;
  shortDescription?: string;
  short_description?: string;
  description?: string;
  sku: string;
  barcode?: string;
  productType: ProductType;
  product_type?: ProductType;
  categoryId?: string;
  category_id?: string;
  category?: string;
  subcategory?: string;
  brandId?: string;
  brand_id?: string;
  brand?: string;
  status: ProductStatus;
  unitOfMeasure: UnitOfMeasure;
  unit_of_measure?: UnitOfMeasure;
  price: number;
  promotionalPrice?: number | null;
  promotional_price?: number | null;
  costPrice?: number | null;
  cost_price?: number | null;
  weight?: number | null;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  trackInventory: boolean;
  track_inventory?: boolean;
  mainImageUrl?: string;
  main_image_url?: string;
  tags?: string[];
  tags_json?: string[];
  metadata?: Record<string, unknown>;
  metadata_json?: Record<string, unknown>;
  minimumStock?: number;
  maximumStock?: number;
  safetyStock?: number;
  leadTimeDays?: number;
  locationCode?: string;
  ncm?: string;
  cfop?: string;
  cest?: string;
  taxOrigin?: string;
  taxableUnit?: string;
  fiscalCode?: string;
  seoTitle?: string;
  metaDescription?: string;
  urlSlug?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ProductVariant {
  id: string;
  tenantId: string;
  productId: string;
  name: string;
  sku: string;
  barcode?: string;
  attributes: Record<string, string>;
  price?: number | null;
  promotionalPrice?: number | null;
  costPrice?: number | null;
  weight?: number | null;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  status: ProductStatus;
  imageUrl?: string;
  minimumStock?: number;
  maximumStock?: number;
  safetyStock?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  url: string;
  altText?: string;
  isMain: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  tenantId: string;
  parentId?: string;
  name: string;
  slug: string;
  description?: string;
  status: 'ativa' | 'inativa';
  createdAt: string;
  updatedAt: string;
}

export interface ProductBrand {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  status: 'ativa' | 'inativa';
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBalance {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  warehouseId: string;
  stockQuantity: number;
  reservedQuantity: number;
  blockedQuantity: number;
  availableQuantity: number;
  minimumStock: number;
  maximumStock: number;
  safetyStock: number;
  locationCode?: string;
  lastCountedAt?: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  warehouseId: string;
  type: InventoryMovementType;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  origin: 'manual' | 'pedido' | 'importacao' | 'ajuste' | 'devolucao' | 'contagem' | 'sistema' | 'api';
  orderId?: string;
  referenceId?: string;
  idempotencyKey: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface InventoryAlert {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  type: InventoryAlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  recommendation: string;
  status: AlertStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface ReplenishmentSuggestion {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  warehouseId: string;
  averageDailySales: number | null;
  leadTimeDays: number;
  safetyStock: number;
  currentAvailableStock: number;
  suggestedMinimumStock: number | null;
  suggestedMaximumStock: number | null;
  suggestedQuantity: number | null;
  daysUntilStockout: number | null;
  priority: ReplenishmentPriority;
  status: ReplenishmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPriceHistory {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  oldPrice?: number | null;
  newPrice?: number | null;
  oldCost?: number | null;
  newCost?: number | null;
  changedBy: string;
  createdAt: string;
}

export interface ProductListFilters {
  page?: number;
  limit?: number;
  productId?: string;
  variantId?: string;
  search?: string;
  status?: string;
  stockStatus?: string;
  categoryId?: string;
  category?: string;
  brandId?: string;
  brand?: string;
  lowStock?: boolean;
  noStock?: boolean;
  healthyStock?: boolean;
  reservedStock?: boolean;
  excessStock?: boolean;
  stalled?: boolean;
  stockoutRisk?: boolean;
  archived?: boolean;
  minPrice?: number;
  maxPrice?: number;
  minCost?: number;
  maxCost?: number;
  minMargin?: number;
  maxMargin?: number;
  createdFrom?: string;
  createdTo?: string;
  lastSaleFrom?: string;
  lastSaleTo?: string;
  hasImage?: 'with' | 'without';
  hasSku?: 'with' | 'without';
  hasBarcode?: 'with' | 'without';
  hasCost?: 'with' | 'without';
  analysisPeriodDays?: number;
}

export interface ProductPermissions {
  canViewCost: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canDuplicate: boolean;
  canImport: boolean;
  canExport: boolean;
  canEditPrice: boolean;
  canEditCost: boolean;
  canEditFiscal: boolean;
  canViewStock: boolean;
  canAdjustStock: boolean;
  canCreateStockMovement: boolean;
  canReserveStock: boolean;
  canReleaseReservation: boolean;
  canBlockStock: boolean;
  canTransferStock: boolean;
  canViewStockMovements: boolean;
  canViewInventoryAlerts: boolean;
  canManageReplenishment: boolean;
}

export interface ProductSalesMetrics {
  quantitySold: number;
  revenue: number;
  orders: number;
  averageTicket: number | null;
  averageDailySales: number | null;
  lastSaleAt?: string;
  firstSaleAt?: string;
}

export interface ProductInventoryMetrics {
  stockQuantity: number;
  reservedQuantity: number;
  blockedQuantity: number;
  availableQuantity: number;
  minimumStock: number;
  maximumStock: number;
  safetyStock: number;
  marginPercent: number | null;
  markup: number | null;
  estimatedUnitProfit: number | null;
  daysOfCoverage: number | null;
  stockoutDate?: string;
  turnover: number | null;
  abcClass: 'A' | 'B' | 'C' | 'insuficiente';
  stockStatus: StockStatus;
  recommendation: string;
  missingFields: Array<{ metric: string; collection: string; field: string }>;
}

export interface ProductListItem extends ProductRecord {
  categoryName?: string;
  brandName?: string;
  inventory: ProductInventoryMetrics;
  sales: ProductSalesMetrics;
}

export interface ProductListResult extends PaginatedResult<ProductListItem> {
  segments: Record<string, number>;
  missingFields: Array<{ metric: string; collection: string; field: string }>;
}

export interface ProductDetails {
  product: ProductListItem;
  variants: ProductVariant[];
  images: ProductImage[];
  balances: InventoryBalance[];
  movements: InventoryMovement[];
  alerts: InventoryAlert[];
  replenishmentSuggestions: ReplenishmentSuggestion[];
  priceHistory: ProductPriceHistory[];
  recentOrders: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
}

export interface StockMovementInput {
  variantId?: string;
  warehouseId?: string;
  quantity: number;
  reason: string;
  origin?: InventoryMovement['origin'];
  orderId?: string;
  referenceId?: string;
  idempotencyKey?: string;
  notes?: string;
  minimumStock?: number;
  maximumStock?: number;
  safetyStock?: number;
  locationCode?: string;
}
