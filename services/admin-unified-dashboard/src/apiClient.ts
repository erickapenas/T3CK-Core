/**
 * API Client Service for T3CK Core Admin Dashboard
 * Handles all API communication with the backend services
 *
 * API Gateway: http://localhost:3000
 * Service Endpoints:
 *   - Admin Service: /api/v1/admin (port 3006)
 *   - Product Service: /api/v1/products (port 3004)
 *   - Order Service: /api/v1/orders (port 3011)
 *   - Webhook Service: /api/v1/webhooks (port 3002)
 */

import {
  listTenantsFromFirestore,
  saveTenantToFirestore,
} from './tenant-storage';
import type {
  DashboardLayout,
  TenantTheme,
  UserThemePreferences,
} from './design-system/tokens/schema';

const API_BASE = import.meta.env.VITE_GATEWAY_BASE_URL || 'http://localhost:3000';
const DEFAULT_TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-demo';

type RequestTarget = {
  baseUrl: string;
  path: string;
};

function normalizeResponseBody(body: any): any {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    if (
      body.data &&
      typeof body.data === 'object' &&
      !Array.isArray(body.data) &&
      Array.isArray(body.data.items)
    ) {
      return body.data.items;
    }

    return body.data;
  }

  return body;
}

function buildFallbackTargets(path: string): RequestTarget[] {
  const targets: RequestTarget[] = [];
  const addTarget = (baseUrl: string | undefined, rewrittenPath: string) => {
    if (baseUrl) {
      targets.push({ baseUrl, path: rewrittenPath });
    }
  };

  if (path.startsWith('/api/v1/admin/')) {
    addTarget(
      import.meta.env.VITE_ADMIN_SERVICE_URL || 'http://localhost:3006',
      path.replace(/^\/api\/v1\/admin/, '/api/admin')
    );
  } else if (path.startsWith('/api/admin-unified-dashboard/')) {
    addTarget(import.meta.env.VITE_ADMIN_SERVICE_URL || 'http://localhost:3006', path);
  } else if (path.startsWith('/api/v1/provisioning/')) {
    addTarget(
      import.meta.env.VITE_TENANT_SERVICE_URL || 'http://localhost:3003',
      path.replace(/^\/api\/v1\/provisioning/, '/provisioning')
    );
  } else if (path.startsWith('/api/v1/webhooks')) {
    addTarget(
      import.meta.env.VITE_WEBHOOK_SERVICE_URL || 'http://localhost:3002',
      path.replace(/^\/api\/v1\/webhooks/, '/api/webhooks')
    );
  } else if (path.startsWith('/api/v1/user-dashboard')) {
    addTarget(
      import.meta.env.VITE_USER_DASHBOARD_SERVICE_URL || 'http://localhost:3015',
      path.replace(/^\/api\/v1\/user-dashboard/, '/user-dashboard')
    );
  } else if (path.startsWith('/api/v1/products')) {
    addTarget(
      import.meta.env.VITE_PRODUCT_SERVICE_URL || 'http://localhost:3004',
      path.replace(/^\/api\/v1\/products/, '/api/products')
    );
  } else if (path.startsWith('/api/v1/orders')) {
    addTarget(
      import.meta.env.VITE_ORDER_SERVICE_URL || 'http://localhost:3011',
      path.replace(/^\/api\/v1\/orders/, '/orders')
    );
  } else if (path.startsWith('/api/v1/shipping')) {
    addTarget(
      import.meta.env.VITE_SHIPPING_SERVICE_URL || 'http://localhost:3012',
      path.replace(/^\/api\/v1\/shipping/, '/shipping')
    );
  } else if (path.startsWith('/api/v1/payments')) {
    addTarget(
      import.meta.env.VITE_PAYMENT_SERVICE_URL || 'http://localhost:3010',
      path.replace(/^\/api\/v1\/payments/, '/payments')
    );
  }

  return targets;
}

function shouldPreferDirectService(path: string): boolean {
  return path.startsWith('/api/v1/provisioning/');
}

export type DashboardEntity =
  | 'dashboard'
  | 'tenants'
  | 'users'
  | 'products'
  | 'orders'
  | 'fiscal-settings'
  | 'integrations'
  | 'analytics'
  | 'logging'
  | 'customers'
  | 'settings'
  | 'tenant-config'
  | 'webhooks'
  | 'payments'
  | 'cache';

export function getEntityService(entity: DashboardEntity) {
  if (entity === 'logging') {
    return entityApi.logs;
  }

  return entityApi[entity as keyof typeof entityApi];
}

let csrfToken: string | null = null;
let gatewayUnavailable = false;

const SESSION_STORAGE_KEY = 't3ck-admin-session';

export type AdminUserRole = 'admin' | 'usuario';

export type AdminSessionUser = {
  id: string;
  tenantId: string;
  username: string;
  name: string;
  email: string;
  role: AdminUserRole;
  permissions?: string[];
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductStatus =
  | 'ativo'
  | 'inativo'
  | 'rascunho'
  | 'arquivado'
  | 'bloqueado'
  | 'esgotado';

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

export type OrderStatus =
  | 'rascunho'
  | 'criado'
  | 'aguardando_pagamento'
  | 'pagamento_aprovado'
  | 'pagamento_recusado'
  | 'em_analise'
  | 'aguardando_estoque'
  | 'estoque_reservado'
  | 'aguardando_nota_fiscal'
  | 'nota_fiscal_emitida'
  | 'em_separacao'
  | 'pronto_para_envio'
  | 'enviado'
  | 'em_transito'
  | 'saiu_para_entrega'
  | 'entregue'
  | 'cancelado'
  | 'devolvido'
  | 'reembolsado'
  | 'falha_operacional';

export type PaymentStatus =
  | 'pendente'
  | 'aprovado'
  | 'recusado'
  | 'cancelado'
  | 'estornado'
  | 'parcialmente_estornado'
  | 'chargeback'
  | 'em_analise';

export type OrderFiscalStatus =
  | 'nao_aplicavel'
  | 'pendente'
  | 'aguardando_configuracao'
  | 'em_processamento'
  | 'autorizada'
  | 'rejeitada'
  | 'cancelada'
  | 'erro';

export type OrderStockStatus =
  | 'nao_verificado'
  | 'disponivel'
  | 'insuficiente'
  | 'reservado'
  | 'baixado'
  | 'parcialmente_reservado'
  | 'estornado';

export type ShippingStatus =
  | 'nao_iniciado'
  | 'aguardando_separacao'
  | 'em_separacao'
  | 'pronto_para_envio'
  | 'enviado'
  | 'em_transito'
  | 'saiu_para_entrega'
  | 'entregue'
  | 'atrasado'
  | 'falha_entrega'
  | 'devolvido';

export type OrderItemRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  productId: string;
  variantId?: string;
  sku: string;
  name: string;
  productSnapshot?: Record<string, any>;
  quantity: number;
  unitPrice: number;
  discountTotal: number;
  taxTotal: number;
  totalPrice: number;
  costPrice?: number | null;
  stockReservedQuantity?: number;
  stockDecreasedQuantity?: number;
  imageUrl?: string;
  ncm?: string;
  cfop?: string;
  cest?: string;
  taxOrigin?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderRecord = {
  id: string;
  tenantId: string;
  orderNumber: string;
  customerId?: string;
  customerSnapshot?: Record<string, any>;
  customer?: Record<string, any>;
  items: OrderItemRecord[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fiscalStatus: OrderFiscalStatus;
  stockStatus: OrderStockStatus;
  shippingStatus: ShippingStatus;
  fulfillmentStatus?: string;
  channel?: string;
  marketplace?: string;
  externalOrderId?: string;
  source?: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  feeTotal: number;
  total: number;
  paidTotal: number;
  refundedTotal: number;
  netTotal: number;
  currency: string;
  paymentMethod?: string;
  shippingMethod?: string;
  notes?: string;
  internalNotesCount: number;
  tags?: string[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  paidAt?: string;
  cancelledAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  updatedAt: string;
  deletedAt?: string;
};

export type OrderListFilters = {
  page?: number;
  limit?: number;
  search?: string;
  period?: string;
  createdFrom?: string;
  createdTo?: string;
  paidFrom?: string;
  paidTo?: string;
  shippedFrom?: string;
  shippedTo?: string;
  deliveredFrom?: string;
  deliveredTo?: string;
  status?: OrderStatus | '';
  paymentStatus?: PaymentStatus | '';
  fiscalStatus?: OrderFiscalStatus | '';
  stockStatus?: OrderStockStatus | '';
  shippingStatus?: ShippingStatus | '';
  channel?: string;
  marketplace?: string;
  paymentMethod?: string;
  customerId?: string;
  productId?: string;
  sku?: string;
  minTotal?: number;
  maxTotal?: number;
  hasInvoice?: 'with' | 'without' | 'error' | '';
  stockIssue?: boolean;
  awaitingPicking?: boolean;
  awaitingShipping?: boolean;
  shipped?: boolean;
  delivered?: boolean;
  cancelled?: boolean;
  delayed?: boolean;
  hasInternalNotes?: boolean;
  imported?: boolean;
  manual?: boolean;
};

export type OrderStockCheck = {
  orderId: string;
  tenantId: string;
  available: boolean;
  items: Array<{
    productId: string;
    variantId?: string;
    sku?: string;
    name?: string;
    requested: number;
    available: number;
    reserved: number;
    minimumStock: number;
    manageStock: boolean;
    ok: boolean;
  }>;
};

export type OrderPaymentRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  provider?: string;
  method: string;
  status: PaymentStatus;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  installments?: number;
  externalPaymentId?: string;
  paidAt?: string;
  refusedAt?: string;
  refundedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderRefundRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  paymentId?: string;
  amount: number;
  reason: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderShipmentRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  carrier: string;
  shippingMethod?: string;
  trackingCode: string;
  trackingUrl?: string;
  status: string;
  shippingCost?: number;
  postedAt?: string;
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderTrackingEventRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  shipmentId: string;
  status: string;
  description?: string;
  location?: string;
  eventDate: string;
  createdAt: string;
};

export type OrderHistoryRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  actorType: string;
  userId?: string;
  action: string;
  description: string;
  oldStatus?: string;
  newStatus?: string;
  beforeDataMasked?: Record<string, any>;
  afterDataMasked?: Record<string, any>;
  metadata?: Record<string, any>;
  correlationId?: string;
  createdAt: string;
};

export type OrderNoteRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  userId: string;
  type: 'geral' | 'atendimento' | 'financeiro' | 'estoque' | 'fiscal' | 'envio' | 'risco';
  note: string;
  isPinned: boolean;
  visibility: 'interna' | 'restrita';
  createdAt: string;
  updatedAt: string;
};

export type OrderDetails = {
  order: OrderRecord;
  customer?: Record<string, any> | null;
  payments: OrderPaymentRecord[];
  refunds: OrderRefundRecord[];
  stock: OrderStockCheck;
  invoice?: Record<string, any> | null;
  shipments: OrderShipmentRecord[];
  trackingEvents: OrderTrackingEventRecord[];
  history: OrderHistoryRecord[];
  notes: OrderNoteRecord[];
  auditLogs: Array<Record<string, any>>;
  alerts: Array<{ type: string; severity: string; description: string; recommendation: string }>;
};

export type ProductListFilters = {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProductStatus | '';
  stockStatus?: StockStatus | '';
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
};

export type ProductInventoryMetrics = {
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
};

export type ProductSalesMetrics = {
  quantitySold: number;
  revenue: number;
  orders: number;
  averageTicket: number | null;
  averageDailySales: number | null;
  lastSaleAt?: string;
  firstSaleAt?: string;
};

export type ProductRecord = {
  id: string;
  tenantId: string;
  tenant_id?: string;
  name: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  sku: string;
  barcode?: string;
  productType?: string;
  categoryId?: string;
  category?: string;
  subcategory?: string;
  brandId?: string;
  brand?: string;
  status: ProductStatus;
  unitOfMeasure?: string;
  price: number;
  promotionalPrice?: number | null;
  costPrice?: number | null;
  weight?: number | null;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  trackInventory?: boolean;
  initialStock?: number;
  minimumStock?: number;
  maximumStock?: number;
  safetyStock?: number;
  leadTimeDays?: number;
  locationCode?: string;
  mainImageUrl?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  ncm?: string;
  cfop?: string;
  cest?: string;
  taxOrigin?: string;
  taxableUnit?: string;
  fiscalCode?: string;
  seoTitle?: string;
  metaDescription?: string;
  urlSlug?: string;
  inventory: ProductInventoryMetrics;
  sales: ProductSalesMetrics;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
};

export type ProductVariant = {
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
  status: ProductStatus;
  imageUrl?: string;
  minimumStock?: number;
  maximumStock?: number;
  safetyStock?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type InventoryBalance = {
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
  updatedAt?: string;
};

export type InventoryMovement = {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  warehouseId: string;
  type: string;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  origin: string;
  orderId?: string;
  referenceId?: string;
  idempotencyKey: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
};

export type InventoryAlert = {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  type: string;
  severity: 'baixa' | 'media' | 'alta' | 'critica';
  title: string;
  description: string;
  recommendation: string;
  status: 'novo' | 'visto' | 'resolvido' | 'ignorado';
  createdAt: string;
  resolvedAt?: string;
};

export type ReplenishmentSuggestion = {
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
  priority: 'critica' | 'alta' | 'media' | 'baixa';
  status: 'nova' | 'aceita' | 'ignorada' | 'resolvida';
  createdAt: string;
  updatedAt: string;
};

export type ProductDetails = {
  product: ProductRecord;
  variants: ProductVariant[];
  images: Array<Record<string, any>>;
  balances: InventoryBalance[];
  movements: InventoryMovement[];
  alerts: InventoryAlert[];
  replenishmentSuggestions: ReplenishmentSuggestion[];
  priceHistory: Array<Record<string, any>>;
  recentOrders: Array<Record<string, any>>;
  auditLogs: Array<Record<string, any>>;
};

export type CustomerStatus =
  | 'novo'
  | 'ativo'
  | 'recorrente'
  | 'vip'
  | 'inativo'
  | 'bloqueado'
  | 'em_analise'
  | 'descadastrado'
  | 'anonimizado';

export type CustomerType = 'pf' | 'pj';
export type CustomerRiskStatus =
  | 'normal'
  | 'em_analise'
  | 'alto_risco'
  | 'bloqueado'
  | 'liberado_manualmente';

export type CustomerCrmRecord = {
  id: string;
  tenantId: string;
  tenant_id?: string;
  customerType?: CustomerType;
  customer_type?: CustomerType;
  documentType?: 'cpf' | 'cnpj';
  documentNumber?: string;
  document_number?: string;
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  taxId?: string;
  cpfCnpj?: string;
  birthDate?: string;
  legalName?: string;
  tradeName?: string;
  status?: CustomerStatus;
  source?: string;
  origin?: string;
  acquisitionChannel?: string;
  city?: string;
  state?: string;
  tags?: string[];
  internalNotes?: string;
  contactPreference?: string;
  acceptsEmailMarketing?: boolean;
  acceptsWhatsappMarketing?: boolean;
  acceptsSmsMarketing?: boolean;
  riskStatus?: CustomerRiskStatus;
  risk_status?: CustomerRiskStatus;
  blockedReason?: string;
  totalOrders?: number;
  totalSpent?: number;
  averageTicket?: number;
  firstOrderAt?: string;
  lastOrderAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomerSummary = {
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalSpent: number;
  totalPaid: number;
  totalPending: number;
  totalCancelled: number;
  averageTicket: number;
  highestOrder: number;
  lowestOrder: number;
  firstOrderAt?: string;
  lastOrderAt?: string;
  productsPurchased: number;
  cancelledOrdersCount: number;
  openOrdersCount: number;
  averageDaysBetweenOrders: number | null;
  favoritePaymentMethod?: string;
  missingFields: Array<{ metric: string; collection: string; field: string }>;
};

export type CustomerDetails = {
  customer: CustomerCrmRecord;
  summary: CustomerSummary;
  addresses: Array<Record<string, any>>;
  contacts: Array<Record<string, any>>;
  tags: string[];
  notes: Array<Record<string, any>>;
  consents: Array<Record<string, any>>;
  privacyRequests: Array<Record<string, any>>;
  auditLogs: Array<Record<string, any>>;
};

export type CustomerListFilters = {
  page?: number;
  limit?: number;
  search?: string;
  status?: CustomerStatus | '';
  customerType?: CustomerType | '';
  city?: string;
  state?: string;
  source?: string;
  acquisitionChannel?: string;
  tag?: string;
  marketingConsent?: 'with' | 'without' | '';
  hasOrders?: 'with' | 'without' | '';
  minSpent?: number | string;
  maxSpent?: number | string;
  minOrders?: number | string;
  maxOrders?: number | string;
  createdFrom?: string;
  createdTo?: string;
  lastOrderFrom?: string;
  lastOrderTo?: string;
};

export type AuditSeverity = 'info' | 'notice' | 'warning' | 'error' | 'critical';
export type AuditOutcome = 'success' | 'failure' | 'denied' | 'partial' | 'pending';

export type AuditLogRecord = {
  id: string;
  tenant_id: string;
  event_id: string;
  event_version: string;
  category: string;
  action: string;
  operation: string;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  actor_type: string;
  actor_id: string;
  actor_name?: string;
  actor_email_masked?: string;
  resource_type?: string;
  resource_id?: string;
  resource_label?: string;
  module: string;
  description: string;
  before_data_masked?: Record<string, any>;
  after_data_masked?: Record<string, any>;
  changed_fields: string[];
  metadata_json?: Record<string, any>;
  request_id?: string;
  correlation_id: string;
  ip_address?: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  origin?: string;
  http_method?: string;
  endpoint?: string;
  status_code?: number;
  error_code?: string;
  error_message?: string;
  is_sensitive: boolean;
  is_security_event: boolean;
  is_export_event: boolean;
  is_system_event: boolean;
  hash: string;
  previous_hash?: string;
  created_at: string;
  createdAt?: string;
};

export type AuditLogFilters = {
  page?: number;
  limit?: number;
  search?: string;
  period?: 'today' | 'yesterday' | 'last7' | 'last15' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';
  from?: string;
  to?: string;
  category?: string;
  action?: string;
  module?: string;
  severity?: AuditSeverity | '';
  outcome?: AuditOutcome | '';
  actorId?: string;
  actorType?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  origin?: string;
  endpoint?: string;
  statusCode?: number | string;
  correlationId?: string;
  requestId?: string;
  isSensitive?: boolean | string;
  isSecurityEvent?: boolean | string;
  isExportEvent?: boolean | string;
  failuresOnly?: boolean | string;
  criticalOnly?: boolean | string;
  manualOnly?: boolean | string;
  automaticOnly?: boolean | string;
};

export type AuditStats = {
  total: number;
  critical: number;
  failures: number;
  denied: number;
  exports: number;
  sensitive: number;
  security: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
};

export type FiscalInvoiceType = 'nfe' | 'nfce' | 'nfse';
export type FiscalEnvironment = 'homologacao' | 'producao' | '';
export type FiscalProviderName =
  | 'focus_nfe'
  | 'nuvem_fiscal'
  | 'plugnotas'
  | 'enotas'
  | 'tecnospeed'
  | 'sefaz_direta'
  | 'outro'
  | '';
export type FiscalConfigurationStatus =
  | 'nao_configurado'
  | 'incompleto'
  | 'configurado'
  | 'certificado_invalido'
  | 'credenciais_invalidas'
  | 'homologacao_ativa'
  | 'producao_ativa'
  | 'erro_configuracao';

export type PublicFiscalConfiguration = {
  id: string;
  tenantId: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  cnae: string;
  taxRegime: string;
  taxRegimeCode: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressCityCode: string;
  addressState: string;
  addressZipcode: string;
  phone: string;
  fiscalEmail: string;
  invoiceProvider: FiscalProviderName;
  invoiceEnvironment: FiscalEnvironment;
  nfeEnabled: boolean;
  nfceEnabled: boolean;
  nfseEnabled: boolean;
  nfeSeries: string;
  nfceSeries: string;
  nfseSeries: string;
  nextNfeNumber: number;
  nextNfceNumber: number;
  nextNfseNumber: number;
  emissionModel: string;
  defaultCfop: string;
  defaultNcm: string;
  defaultTaxOrigin: string;
  defaultOperationNature: string;
  defaultAdditionalInformation: string;
  certificateFileName?: string;
  certificateUploadedAt?: string;
  nfceCscId: string;
  municipalProviderConfig?: Record<string, unknown>;
  status: FiscalConfigurationStatus;
  validationErrors: string[];
  lastValidationAt?: string;
  createdAt: string;
  updatedAt: string;
  secrets: {
    hasCertificate: boolean;
    hasCertificatePassword: boolean;
    hasProviderApiKey: boolean;
    hasProviderClientId: boolean;
    hasProviderClientSecret: boolean;
    hasNfceCsc: boolean;
    hasMunicipalUsername: boolean;
    hasMunicipalPassword: boolean;
  };
};

export type FiscalAuditLog = {
  id: string;
  tenantId: string;
  userId: string;
  fiscalConfigurationId: string;
  action: string;
  fieldChanged?: string;
  oldValueMasked?: string;
  newValueMasked?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
};

export type TaxDocument = {
  id: string;
  tenantId: string;
  fiscalConfigurationId: string;
  orderId: string;
  provider: FiscalProviderName;
  type: FiscalInvoiceType;
  environment: 'homologacao' | 'producao';
  number: number;
  series: string;
  accessKey?: string;
  protocol?: string;
  status: 'pendente' | 'em_processamento' | 'autorizada' | 'rejeitada' | 'cancelada' | 'erro' | 'inutilizada';
  rejectionReason?: string;
  issuedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type StockCheckResult = {
  orderId: string;
  tenantId: string;
  available: boolean;
  items: Array<{
    productId: string;
    sku?: string;
    name?: string;
    requested: number;
    available: number;
    reserved: number;
    manageStock: boolean;
    ok: boolean;
  }>;
};

export type OrderDetailsData = {
  order: Record<string, any>;
  customer?: Record<string, any> | null;
  invoice?: TaxDocument | null;
  fiscalStatus: Record<string, any>;
  stock: StockCheckResult;
  shipments: Array<Record<string, any>>;
  inventoryMovements: Array<Record<string, any>>;
  history: Array<Record<string, any>>;
  logs: Array<Record<string, any>>;
};

export type AdminSession = {
  token: string;
  user: AdminSessionUser;
};

export type DashboardPeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last15'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom';

export type EcommerceDashboardFilters = {
  period: DashboardPeriodPreset;
  from?: string;
  to?: string;
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
  page?: number;
  limit?: number;
};

export type DashboardComparison = {
  current: number;
  previous: number;
  difference: number;
  variationPercent: number | null;
  trend: 'up' | 'down' | 'stable' | 'insufficient';
  message: string;
};

export type DashboardBreakdown = {
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

export type DashboardProductRank = {
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

export type EcommerceDashboardOverview = {
  filters: EcommerceDashboardFilters;
  period: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    label: string;
    granularity: 'day' | 'week' | 'month';
  };
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
    bestSellingProduct?: DashboardProductRank;
    topRevenueProduct?: DashboardProductRank;
    buyers: number;
    newCustomers: number;
    recurringCustomers: number;
    growthRate: number | null;
  };
  comparisons: Record<string, DashboardComparison>;
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
    byChannel: DashboardBreakdown[];
    byCategory: DashboardBreakdown[];
    byPaymentMethod: DashboardBreakdown[];
  };
  orders: {
    total: number;
    paid: number;
    pending: number;
    cancelled: number;
    refunded: number;
    averageOrderValue: number;
    largestOrder?: Record<string, any>;
    smallestOrder?: Record<string, any>;
    byStatus: DashboardBreakdown[];
    byChannel: DashboardBreakdown[];
    byPaymentMethod: DashboardBreakdown[];
    series: Array<{ label: string; orders: number }>;
  };
  products: {
    topByQuantity: DashboardProductRank[];
    topByRevenue: DashboardProductRank[];
    growth: DashboardProductRank[];
    decline: DashboardProductRank[];
    zeroSales: DashboardProductRank[];
  };
  customers: {
    totalBuyers: number;
    newCustomers: number;
    recurringCustomers: number;
    inactiveCustomers: number | null;
    repeatRate: number | null;
    averageTicketByCustomer: number;
    topByRevenue: Array<Record<string, any>>;
    topByOrders: Array<Record<string, any>>;
    byRegion: DashboardBreakdown[];
    newSeries: Array<{ label: string; customers: number }>;
  };
  channels: { available: boolean; rows: DashboardBreakdown[]; missingField?: string };
  payments: { available: boolean; rows: DashboardBreakdown[]; missingField?: string };
  recentOrders: {
    items: Array<Record<string, any>>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
  alerts: Array<{
    id: string;
    title: string;
    description: string;
    severity: 'baixa' | 'media' | 'alta';
    recommendedAction: string;
    link?: string;
  }>;
  dataQuality: {
    missingFields: Array<{
      metric: string;
      collection: string;
      field: string;
      howToPopulate: string;
    }>;
  };
};

export type MarketplaceProvider = 'mercado_livre' | 'tiktok_shop' | 'shopee' | 'other';
export type IntegrationProvider = MarketplaceProvider | 'google_pagespeed';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'expired' | 'pending';

export type PublicIntegration = {
  id: string;
  kind: 'marketplace' | 'pagespeed';
  provider: IntegrationProvider;
  status: IntegrationStatus;
  displayName: string;
  lastTestedAt?: string;
  lastError?: string;
  updatedAt: string;
  account?: {
    id: string;
    externalAccountId?: string;
    shopName?: string;
    status: IntegrationStatus;
    tokenExpiresAt?: string;
    scopes: string[];
  };
};

export type IntegrationLog = {
  id: string;
  tenantId: string;
  userId: string;
  integrationId?: string;
  provider?: IntegrationProvider;
  action: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type PageSpeedReport = {
  id: string;
  tenantId: string;
  userId: string;
  url: string;
  strategy: 'mobile' | 'desktop';
  metrics: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    lcpMs?: number;
    cls?: number;
    inpMs?: number;
    fidMs?: number;
    totalBlockingTimeMs?: number;
    speedIndexMs?: number;
    loadTimeMs?: number;
  };
  rawSummary: Record<string, unknown>;
  createdAt: string;
};

export type MarketplaceConnectResult = {
  integration: PublicIntegration;
  authorizationUrl?: string;
  state?: string;
};

export type ImportOrdersResult = {
  imported: number;
  skippedDuplicates: number;
  orders: Array<Record<string, unknown>>;
};

export function loadAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearAdminSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function getSessionToken(): string | null {
  return loadAdminSession()?.token || null;
}

/**
 * Fetch CSRF token from gateway
 */
async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;

  try {
    const response = await fetch(`${API_BASE}/api/csrf-token`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies
    });

    if (response.ok) {
      const data = await response.json();
      csrfToken = data.token || data.csrfToken;
      return csrfToken || '';
    }
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
  }

  return '';
}

/**
 * Helper function to make API requests with common headers
 */
async function apiRequest(
  path: string,
  options: RequestInit = {},
  tenantId: string = DEFAULT_TENANT_ID
): Promise<any> {
  const method = options.method?.toUpperCase() || 'GET';
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const directTargets = buildFallbackTargets(path);
  const gatewayTarget = gatewayUnavailable ? [] : [{ baseUrl: API_BASE, path }];
  const session = loadAdminSession();
  const requestTargets: RequestTarget[] = shouldPreferDirectService(path)
    ? [...directTargets, ...gatewayTarget]
    : [...gatewayTarget, ...directTargets];

  const uniqueTargets = requestTargets.filter(
    (target, index, all) =>
      all.findIndex(
        (candidate) => candidate.baseUrl === target.baseUrl && candidate.path === target.path
      ) === index
  );

  const startTime = performance.now();

  const parseErrorMessage = async (response: Response): Promise<string> => {
    try {
      const errorData = await response.json();
      if (errorData?.message) {
        return errorData.message;
      }
      if (errorData?.error) {
        return typeof errorData.error === 'string'
          ? errorData.error
          : JSON.stringify(errorData.error);
      }
    } catch {
      // Ignore JSON parse errors.
    }

    return `API Error: ${response.status} ${response.statusText}`;
  };

  try {
    let lastError: string | null = null;

    for (let index = 0; index < uniqueTargets.length; index += 1) {
      const target = uniqueTargets[index];
      const headers = new Headers(options.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('x-tenant-id', effectiveTenantId);
      const sessionToken = session?.token || null;
      if (sessionToken) {
        headers.set('Authorization', `Bearer ${sessionToken}`);
      }
      if (target.path.startsWith('/user-dashboard') && session?.user) {
        headers.set('X-User-ID', session.user.id);
        headers.set('X-User-Email', session.user.email || session.user.username);
        headers.set('X-User-Roles', session.user.role);
      }

      if (isMutation && target.baseUrl === API_BASE) {
        const token = await getCsrfToken();
        if (token) {
          headers.set('X-CSRF-Token', token);
        }
      }

      try {
        const response = await fetch(new URL(target.path, target.baseUrl).toString(), {
          ...options,
          headers,
          credentials: 'include',
        });

        if (!response.ok) {
          const errorMessage = await parseErrorMessage(response);

          if (target.baseUrl === API_BASE && response.status === 403 && isMutation) {
            csrfToken = null;
            const retryToken = await getCsrfToken();
            if (retryToken) {
              headers.set('X-CSRF-Token', retryToken);
              const retryResponse = await fetch(new URL(target.path, target.baseUrl).toString(), {
                ...options,
                headers,
                credentials: 'include',
              });

              if (retryResponse.ok) {
                const retryBody = await retryResponse.json();
                const endTime = performance.now();
                return {
                  data: normalizeResponseBody(retryBody),
                  raw: retryBody,
                  responseTime: Math.round(endTime - startTime),
                  success: true,
                };
              }

              lastError = await parseErrorMessage(retryResponse);
            } else {
              lastError = errorMessage;
            }

            continue;
          }

          if (
            target.baseUrl === API_BASE &&
            (response.status === 502 ||
              response.status === 503 ||
              response.status === 504 ||
              response.status === 404)
          ) {
            lastError = errorMessage;
            continue;
          }

          throw new Error(errorMessage);
        }

        const body = response.status === 204 ? { data: null } : await response.json();
        const endTime = performance.now();

        return {
          data: normalizeResponseBody(body),
          raw: body,
          responseTime: Math.round(endTime - startTime),
          success: true,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';

        if (target.baseUrl === API_BASE && error instanceof TypeError) {
          gatewayUnavailable = true;
        }

        if (index < uniqueTargets.length - 1) {
          continue;
        }

        throw error;
      }
    }

    throw new Error(lastError || 'Service unavailable');
  } catch (error) {
    const endTime = performance.now();
    const responseTime = Math.round(endTime - startTime);

    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
      success: false,
    };
  }
}

function preserveRawData(result: any): any {
  if (result?.raw?.data) {
    return {
      ...result,
      data: result.raw.data,
    };
  }
  return result;
}

/**
 * Admin Dashboard API Client
 * Provides methods for dashboard data retrieval and CRUD operations
 */
export const dashboardApi = {
  /**
   * Get dashboard overview and metrics
   */
  getDashboard: async (tenantId?: string) => {
    return apiRequest('/api/v1/admin/dashboard', {}, tenantId);
  },

  /**
   * Get analytics and reporting data
   */
  getAnalytics: async (tenantId?: string) => {
    return ecommerceAnalyticsApi.overview({ period: 'today', limit: 5 }, tenantId);
  },

  /**
   * Get audit logs
   */
  getAuditLogs: async (limit = 50, tenantId?: string) => {
    return auditApi.list({ page: 1, limit }, tenantId);
  },

  /**
   * Get API health and status
   * Uses analytics as fallback due to CORS issues with /health endpoint
   */
  getHealth: async (tenantId?: string) => {
    try {
      const result = await ecommerceAnalyticsApi.overview({ period: 'today', limit: 1 }, tenantId);
      if (result.success) {
        return {
          success: true,
          data: { status: 'healthy' },
          responseTime: result.responseTime,
        };
      }
    } catch (error) {
      console.error('Health check error:', error);
    }

    return {
      success: false,
      error: 'Health check unavailable',
      responseTime: 0,
    };
  },

  /**
   * Get system metrics and statistics
   */
  getMetrics: async () => {
    return apiRequest('/metrics', {});
  },
};

function buildDashboardQuery(filters: Partial<EcommerceDashboardFilters> = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

export const ecommerceAnalyticsApi = {
  overview: async (filters: Partial<EcommerceDashboardFilters> = {}, tenantId?: string) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/overview${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  revenue: async (filters: Partial<EcommerceDashboardFilters> = {}, tenantId?: string) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/revenue${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  orders: async (filters: Partial<EcommerceDashboardFilters> = {}, tenantId?: string) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/orders${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  products: async (filters: Partial<EcommerceDashboardFilters> = {}, tenantId?: string) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/products${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  customers: async (filters: Partial<EcommerceDashboardFilters> = {}, tenantId?: string) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/customers${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  channels: async (filters: Partial<EcommerceDashboardFilters> = {}, tenantId?: string) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/channels${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  payments: async (filters: Partial<EcommerceDashboardFilters> = {}, tenantId?: string) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/payments${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  recentOrders: async (filters: Partial<EcommerceDashboardFilters> = {}, tenantId?: string) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/recent-orders${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  alerts: async (filters: Partial<EcommerceDashboardFilters> = {}, tenantId?: string) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/alerts${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  export: async (
    filters: Partial<EcommerceDashboardFilters>,
    reportType: string,
    tenantId?: string
  ) => {
    const query = buildDashboardQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/analytics/export${query ? `?${query}` : ''}`,
      {
        method: 'POST',
        body: JSON.stringify({ reportType }),
      },
      tenantId
    );
  },
};

function buildProductQuery(filters: Record<string, unknown> = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

export const productCatalogApi = {
  list: async (filters: Partial<ProductListFilters> = {}, tenantId?: string) => {
    const query = buildProductQuery(filters);
    const result = await apiRequest(
      `/api/admin-unified-dashboard/products${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  create: async (payload: Partial<ProductRecord>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/products',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  get: async (productId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/products/${encodeURIComponent(productId)}`,
      {},
      tenantId
    );
  },
  update: async (productId: string, payload: Partial<ProductRecord>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/products/${encodeURIComponent(productId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  delete: async (productId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/products/${encodeURIComponent(productId)}`,
      { method: 'DELETE' },
      tenantId
    );
  },
  status: async (productId: string, status: ProductStatus, reason?: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/products/${encodeURIComponent(productId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      },
      tenantId
    );
  },
  duplicate: async (productId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/products/${encodeURIComponent(productId)}/duplicate`,
      { method: 'POST', body: JSON.stringify({}) },
      tenantId
    );
  },
  variants: async (productId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/products/${encodeURIComponent(productId)}/variants`,
      {},
      tenantId
    );
  },
  createVariant: async (productId: string, payload: Partial<ProductVariant>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/products/${encodeURIComponent(productId)}/variants`,
      { method: 'POST', body: JSON.stringify(payload) },
      tenantId
    );
  },
  stock: async (productId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/products/${encodeURIComponent(productId)}/stock`,
      {},
      tenantId
    );
  },
  moveStock: async (
    productId: string,
    operation: 'adjust' | 'increase' | 'decrease' | 'reserve' | 'release' | 'block' | 'unblock',
    payload: Record<string, any>,
    tenantId?: string
  ) => {
    return apiRequest(
      `/api/admin-unified-dashboard/products/${encodeURIComponent(productId)}/stock/${operation}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  stockMovements: async (filters: { productId?: string; page?: number; limit?: number } = {}, tenantId?: string) => {
    if (filters.productId) {
      return apiRequest(
        `/api/admin-unified-dashboard/products/${encodeURIComponent(filters.productId)}/stock-movements?page=${filters.page || 1}&limit=${filters.limit || 20}`,
        {},
        tenantId
      );
    }
    return apiRequest(
      `/api/admin-unified-dashboard/stock-movements?page=${filters.page || 1}&limit=${filters.limit || 20}`,
      {},
      tenantId
    );
  },
  intelligence: async (filters: Partial<ProductListFilters> = {}, tenantId?: string) => {
    const query = buildProductQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/inventory/intelligence${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  alerts: async (filters: Partial<ProductListFilters> = {}, tenantId?: string) => {
    const query = buildProductQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/inventory/alerts${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  resolveAlert: async (alertId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/inventory/alerts/${encodeURIComponent(alertId)}/resolve`,
      { method: 'PATCH', body: JSON.stringify({}) },
      tenantId
    );
  },
  suggestions: async (filters: Partial<ProductListFilters> = {}, tenantId?: string) => {
    const query = buildProductQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/inventory/replenishment-suggestions${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  acceptSuggestion: async (suggestionId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/inventory/replenishment-suggestions/${encodeURIComponent(suggestionId)}/accept`,
      { method: 'POST', body: JSON.stringify({}) },
      tenantId
    );
  },
  ignoreSuggestion: async (suggestionId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/inventory/replenishment-suggestions/${encodeURIComponent(suggestionId)}/ignore`,
      { method: 'POST', body: JSON.stringify({}) },
      tenantId
    );
  },
  categories: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/product-categories', {}, tenantId);
  },
  brands: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/brands', {}, tenantId);
  },
  exportList: async (filters: Partial<ProductListFilters>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/products/export',
      {
        method: 'POST',
        body: JSON.stringify({ filters, format: 'csv' }),
      },
      tenantId
    );
  },
  importProducts: async (items: Partial<ProductRecord>[], tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/products/import',
      {
        method: 'POST',
        body: JSON.stringify({ mode: 'upsert', items }),
      },
      tenantId
    );
  },
};

export const orderManagementApi = {
  list: async (filters: Partial<OrderListFilters> = {}, tenantId?: string) => {
    const query = buildProductQuery(filters as Record<string, unknown>);
    const result = await apiRequest(
      `/api/admin-unified-dashboard/orders${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  create: async (payload: Partial<OrderRecord> & Record<string, any>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/orders',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  get: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}`,
      {},
      tenantId
    );
  },
  update: async (orderId: string, payload: Partial<OrderRecord> & Record<string, any>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  delete: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}`,
      { method: 'DELETE' },
      tenantId
    );
  },
  status: async (orderId: string, payload: { status: OrderStatus; reason?: string }, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  cancel: async (orderId: string, payload: Record<string, any>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  duplicate: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/duplicate`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  addItem: async (orderId: string, payload: Partial<OrderItemRecord>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/items`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  updateItem: async (orderId: string, itemId: string, payload: Partial<OrderItemRecord>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  deleteItem: async (orderId: string, itemId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
      tenantId
    );
  },
  recalculate: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/recalculate`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  payment: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/payment`,
      {},
      tenantId
    );
  },
  confirmPayment: async (orderId: string, payload: Record<string, any>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/payment/confirm-manual`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  refund: async (orderId: string, payload: Record<string, any>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/payment/refund`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  checkPayment: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/payment/check-status`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  stock: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/stock`,
      {},
      tenantId
    );
  },
  stockCheck: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/stock/check`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  stockMovement: async (
    orderId: string,
    action: 'reserve' | 'release' | 'decrease' | 'revert',
    tenantId?: string
  ) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/stock/${action}`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  shipping: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/shipping`,
      {},
      tenantId
    );
  },
  saveShipping: async (orderId: string, payload: Partial<OrderShipmentRecord> & Record<string, any>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/shipping`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  updateTracking: async (orderId: string, payload: Partial<OrderShipmentRecord> & Record<string, any>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/shipping/tracking/update`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  history: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/history`,
      {},
      tenantId
    );
  },
  addNote: async (orderId: string, payload: Partial<OrderNoteRecord>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/notes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  updateNote: async (orderId: string, noteId: string, payload: Partial<OrderNoteRecord>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/notes/${encodeURIComponent(noteId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  deleteNote: async (orderId: string, noteId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/notes/${encodeURIComponent(noteId)}`,
      { method: 'DELETE' },
      tenantId
    );
  },
  exportList: async (filters: Partial<OrderListFilters>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/orders/export',
      {
        method: 'POST',
        body: JSON.stringify({ filters, format: 'csv' }),
      },
      tenantId
    );
  },
  bulkStatus: async (orderIds: string[], status: OrderStatus, reason: string | undefined, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/orders/bulk/status',
      {
        method: 'POST',
        body: JSON.stringify({ orderIds, status, reason }),
      },
      tenantId
    );
  },
  bulkStockCheck: async (orderIds: string[], tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/orders/bulk/stock-check',
      {
        method: 'POST',
        body: JSON.stringify({ orderIds }),
      },
      tenantId
    );
  },
};

function buildCustomerQuery(filters: Partial<CustomerListFilters> = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

export const customerCrmApi = {
  list: async (filters: Partial<CustomerListFilters> = {}, tenantId?: string) => {
    const query = buildCustomerQuery(filters);
    const result = await apiRequest(
      `/api/admin-unified-dashboard/customers${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  create: async (payload: Partial<CustomerCrmRecord>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/customers',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  get: async (customerId: string, tenantId?: string) => {
    const result = await apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  update: async (customerId: string, payload: Partial<CustomerCrmRecord>, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  delete: async (customerId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}`,
      { method: 'DELETE' },
      tenantId
    );
  },
  orders: async (customerId: string, page = 1, limit = 10, tenantId?: string) => {
    const result = await apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/orders?page=${page}&limit=${limit}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  products: async (customerId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/products`,
      {},
      tenantId
    );
  },
  financial: async (customerId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/financial`,
      {},
      tenantId
    );
  },
  addTag: async (customerId: string, tag: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/tags`,
      {
        method: 'POST',
        body: JSON.stringify({ tag }),
      },
      tenantId
    );
  },
  removeTag: async (customerId: string, tag: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/tags/${encodeURIComponent(tag)}`,
      { method: 'DELETE' },
      tenantId
    );
  },
  addNote: async (
    customerId: string,
    payload: { type?: string; note: string; visibility?: string },
    tenantId?: string
  ) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/notes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  revokeConsent: async (customerId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/consents/revoke`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  createPrivacyRequest: async (
    customerId: string,
    payload: { type: string; notes?: string },
    tenantId?: string
  ) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/privacy/request`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  anonymize: async (customerId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/privacy/anonymize`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  block: async (customerId: string, reason: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/block`,
      {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      },
      tenantId
    );
  },
  unblock: async (customerId: string, reason: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/unblock`,
      {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      },
      tenantId
    );
  },
  updateRiskStatus: async (
    customerId: string,
    payload: { riskStatus: CustomerRiskStatus; reason?: string },
    tenantId?: string
  ) => {
    return apiRequest(
      `/api/admin-unified-dashboard/customers/${encodeURIComponent(customerId)}/risk-status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  exportList: async (filters: Partial<CustomerListFilters>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/customers/export',
      {
        method: 'POST',
        body: JSON.stringify({ filters, format: 'csv' }),
      },
      tenantId
    );
  },
};

function buildAuditQuery(filters: Partial<AuditLogFilters> = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

export const auditApi = {
  list: async (filters: Partial<AuditLogFilters> = {}, tenantId?: string) => {
    const query = buildAuditQuery(filters);
    const result = await apiRequest(
      `/api/admin-unified-dashboard/audit-logs${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  get: async (logId: string, tenantId?: string) => {
    return apiRequest(`/api/admin-unified-dashboard/audit-logs/${encodeURIComponent(logId)}`, {}, tenantId);
  },
  security: async (filters: Partial<AuditLogFilters> = {}, tenantId?: string) => {
    const query = buildAuditQuery(filters);
    const result = await apiRequest(
      `/api/admin-unified-dashboard/audit-logs/security${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  exports: async (filters: Partial<AuditLogFilters> = {}, tenantId?: string) => {
    const query = buildAuditQuery(filters);
    const result = await apiRequest(
      `/api/admin-unified-dashboard/audit-logs/exports${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  resourceTimeline: async (
    resourceType: string,
    resourceId: string,
    filters: Partial<AuditLogFilters> = {},
    tenantId?: string
  ) => {
    const query = buildAuditQuery(filters);
    const result = await apiRequest(
      `/api/admin-unified-dashboard/audit-logs/resource/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  actorTimeline: async (actorId: string, filters: Partial<AuditLogFilters> = {}, tenantId?: string) => {
    const query = buildAuditQuery(filters);
    const result = await apiRequest(
      `/api/admin-unified-dashboard/audit-logs/actor/${encodeURIComponent(actorId)}${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
    return preserveRawData(result);
  },
  stats: async (filters: Partial<AuditLogFilters> = {}, tenantId?: string) => {
    const query = buildAuditQuery(filters);
    return apiRequest(
      `/api/admin-unified-dashboard/audit-logs/stats${query ? `?${query}` : ''}`,
      {},
      tenantId
    );
  },
  exportLogs: async (filters: Partial<AuditLogFilters>, format: 'csv' | 'json', tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/audit-logs/export',
      {
        method: 'POST',
        body: JSON.stringify({ filters, format }),
      },
      tenantId
    );
  },
  alerts: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/audit-alerts', {}, tenantId);
  },
  resolveAlert: async (alertId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/audit-alerts/${encodeURIComponent(alertId)}/resolve`,
      { method: 'PATCH', body: JSON.stringify({}) },
      tenantId
    );
  },
  retentionPolicy: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/audit-retention-policy', {}, tenantId);
  },
  saveRetentionPolicy: async (policies: Array<Record<string, any>>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/audit-retention-policy',
      { method: 'PUT', body: JSON.stringify({ policies }) },
      tenantId
    );
  },
  runIntegrityCheck: async (filters: Partial<AuditLogFilters>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/audit-logs/integrity-check',
      { method: 'POST', body: JSON.stringify(filters) },
      tenantId
    );
  },
  integrityChecks: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/audit-logs/integrity-checks', {}, tenantId);
  },
};

export const authApi = {
  login: async (username: string, password: string) => {
    return apiRequest(
      '/api/v1/admin/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
      DEFAULT_TENANT_ID
    );
  },
  me: async (tenantId?: string) => {
    return apiRequest('/api/v1/admin/auth/me', {}, tenantId);
  },
};

export const integrationsApi = {
  list: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/integrations', {}, tenantId);
  },
  logs: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/integrations/logs', {}, tenantId);
  },
  status: async (provider: MarketplaceProvider, tenantId?: string) => {
    return apiRequest(`/api/admin-unified-dashboard/integrations/marketplaces/${provider}/status`, {}, tenantId);
  },
  connectMarketplace: async (
    provider: MarketplaceProvider,
    payload: { redirectUri?: string; scopes?: string[] },
    tenantId?: string
  ) => {
    return apiRequest(
      `/api/admin-unified-dashboard/integrations/marketplaces/${provider}/connect`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  completeOAuth: async (
    provider: MarketplaceProvider,
    payload: { code: string; state: string; redirectUri?: string },
    tenantId?: string
  ) => {
    return apiRequest(
      `/api/admin-unified-dashboard/integrations/marketplaces/${provider}/oauth/callback`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  disconnectMarketplace: async (provider: MarketplaceProvider, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/integrations/marketplaces/${provider}/disconnect`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  refreshMarketplaceToken: async (provider: MarketplaceProvider, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/integrations/marketplaces/${provider}/refresh-token`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  testMarketplace: async (provider: MarketplaceProvider, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/integrations/marketplaces/${provider}/test`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  importMarketplaceOrders: async (provider: MarketplaceProvider, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/integrations/marketplaces/${provider}/import-orders`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  runPageSpeed: async (
    payload: { url: string; strategy?: 'mobile' | 'desktop' },
    tenantId?: string
  ) => {
    return apiRequest(
      '/api/admin-unified-dashboard/integrations/pagespeed/reports',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  pageSpeedHistory: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/integrations/pagespeed/reports', {}, tenantId);
  },
  pageSpeedReport: async (reportId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/integrations/pagespeed/reports/${encodeURIComponent(reportId)}`,
      {},
      tenantId
    );
  },
};

export const themeApi = {
  getBundle: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/theme', {}, tenantId);
  },
  listThemes: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/theme/themes', {}, tenantId);
  },
  saveDraft: async (updates: Partial<TenantTheme>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/theme/draft',
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
      tenantId
    );
  },
  publish: async (updates: Partial<TenantTheme>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/theme/publish',
      {
        method: 'POST',
        body: JSON.stringify(updates || {}),
      },
      tenantId
    );
  },
  reset: async (tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/theme/reset',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  getUserPreferences: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/theme/user-preferences', {}, tenantId);
  },
  updateUserPreferences: async (updates: Partial<UserThemePreferences>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/theme/user-preferences',
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
      tenantId
    );
  },
  getDashboardLayout: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/dashboard-layout', {}, tenantId);
  },
  updateDashboardLayout: async (updates: Partial<DashboardLayout>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/dashboard-layout',
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
      tenantId
    );
  },
};

export const adminUnifiedApi = {
  fiscalSettings: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/fiscal-settings', {}, tenantId);
  },
  saveFiscalSettings: async (payload: Partial<PublicFiscalConfiguration> & Record<string, any>, tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/fiscal-settings',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  uploadCertificate: async (
    payload: { certificateFileBase64: string; certificateFileName?: string; certificatePassword?: string },
    tenantId?: string
  ) => {
    return apiRequest(
      '/api/admin-unified-dashboard/fiscal-settings/upload-certificate',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  validateFiscalSettings: async (tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/fiscal-settings/validate',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  testFiscalProvider: async (tenantId?: string) => {
    return apiRequest(
      '/api/admin-unified-dashboard/fiscal-settings/test-provider',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      tenantId
    );
  },
  fiscalStatus: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/fiscal-settings/status', {}, tenantId);
  },
  fiscalAuditLogs: async (tenantId?: string) => {
    return apiRequest('/api/admin-unified-dashboard/fiscal-settings/audit-logs', {}, tenantId);
  },
  orders: async (tenantId?: string, filters: Partial<OrderListFilters> = { page: 1, limit: 20 }) => {
    return orderManagementApi.list(filters, tenantId);
  },
  orderDetails: async (orderId: string, tenantId?: string) => {
    return orderManagementApi.get(orderId, tenantId);
  },
  updateOrderStatus: async (orderId: string, status: OrderStatus, tenantId?: string) => {
    return orderManagementApi.status(orderId, { status }, tenantId);
  },
  orderHistory: async (orderId: string, tenantId?: string) => {
    return orderManagementApi.history(orderId, tenantId);
  },
  issueInvoice: async (
    orderId: string,
    payload: { type?: FiscalInvoiceType; idempotencyKey?: string },
    tenantId?: string
  ) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/invoice/issue`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  invoice: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/invoice`,
      {},
      tenantId
    );
  },
  invoiceStatus: async (orderId: string, tenantId?: string) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/invoice/status`,
      {},
      tenantId
    );
  },
  invoiceDownloadUrl: (orderId: string, kind: 'xml' | 'pdf') => {
    const path = `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/invoice/${kind}`;
    const directBase = gatewayUnavailable
      ? import.meta.env.VITE_ADMIN_SERVICE_URL || 'http://localhost:3006'
      : API_BASE;
    return new URL(path, directBase).toString();
  },
  downloadInvoiceFile: async (orderId: string, kind: 'xml' | 'pdf', tenantId?: string) => {
    const path = `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/invoice/${kind}`;
    const targets = gatewayUnavailable
      ? buildFallbackTargets(path)
      : [{ baseUrl: API_BASE, path }, ...buildFallbackTargets(path)];
    const headers = new Headers();
    headers.set('x-tenant-id', tenantId || DEFAULT_TENANT_ID);
    const sessionToken = getSessionToken();
    if (sessionToken) {
      headers.set('Authorization', `Bearer ${sessionToken}`);
    }

    for (const target of targets) {
      try {
        const response = await fetch(new URL(target.path, target.baseUrl).toString(), {
          headers,
          credentials: 'include',
        });
        if (response.ok) {
          const blob = await response.blob();
          return {
            success: true,
            data: {
              blob,
              fileName: `${orderId}.${kind === 'xml' ? 'xml' : 'pdf'}`,
            },
          };
        }
      } catch {
        continue;
      }
    }

    return { success: false, error: 'Falha ao baixar arquivo fiscal.' };
  },
  cancelInvoice: async (
    orderId: string,
    payload: { reason: string; idempotencyKey?: string },
    tenantId?: string
  ) => {
    return apiRequest(
      `/api/admin-unified-dashboard/orders/${encodeURIComponent(orderId)}/invoice/cancel`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      tenantId
    );
  },
  stockCheck: async (orderId: string, tenantId?: string) => {
    return orderManagementApi.stockCheck(orderId, tenantId);
  },
  stockMovement: async (
    orderId: string,
    action: 'reserve' | 'release' | 'decrease' | 'revert',
    _payload: { reason?: string; idempotencyKey?: string },
    tenantId?: string
  ) => {
    return orderManagementApi.stockMovement(orderId, action, tenantId);
  },
  tracking: async (orderId: string, tenantId?: string) => {
    return orderManagementApi.shipping(orderId, tenantId);
  },
  updateTracking: async (
    orderId: string,
    payload: Record<string, any>,
    tenantId?: string
  ) => {
    return orderManagementApi.updateTracking(orderId, payload, tenantId);
  },
};

/**
 * Entity Management APIs
 */
export const entityApi = {
  dashboard: {
    list: async (tenantId?: string) => {
      return dashboardApi.getDashboard(tenantId);
    },
  },

  analytics: {
    list: async (tenantId?: string) => {
      return dashboardApi.getAnalytics(tenantId);
    },
  },

  integrations: {
    list: async (tenantId?: string) => {
      return integrationsApi.list(tenantId);
    },
  },

  'fiscal-settings': {
    list: async (tenantId?: string) => {
      return adminUnifiedApi.fiscalSettings(tenantId);
    },
  },

  settings: {
    list: async (tenantId?: string) => {
      return settingsApi.getSettings(tenantId);
    },
    update: async (_id: string, data: any, tenantId?: string) => {
      return settingsApi.updateSettings(data, tenantId);
    },
  },

  'tenant-config': {
    list: async (tenantId?: string) => {
      return settingsApi.getTenantConfig(tenantId);
    },
    update: async (_id: string, data: any, tenantId?: string) => {
      return settingsApi.updateTenantConfig(data, tenantId);
    },
  },

  /**
   * Products Entity
   */
  products: {
    list: async (tenantId?: string) => {
      return productCatalogApi.list({ page: 1, limit: 20 }, tenantId);
    },
    get: async (productId: string, tenantId?: string) => {
      return productCatalogApi.get(productId, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return productCatalogApi.create(data, tenantId);
    },
    update: async (productId: string, data: any, tenantId?: string) => {
      return productCatalogApi.update(productId, data, tenantId);
    },
    delete: async (productId: string, tenantId?: string) => {
      return productCatalogApi.delete(productId, tenantId);
    },
  },

  /**
   * Orders Entity
   */
  orders: {
    list: async (tenantId?: string) => {
      return orderManagementApi.list({ page: 1, limit: 20 }, tenantId);
    },
    get: async (orderId: string, tenantId?: string) => {
      return orderManagementApi.get(orderId, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return orderManagementApi.create(data, tenantId);
    },
    update: async (orderId: string, data: any, tenantId?: string) => {
      return orderManagementApi.update(orderId, data, tenantId);
    },
    delete: async (orderId: string, tenantId?: string) => {
      return orderManagementApi.delete(orderId, tenantId);
    },
  },

  /**
   * Users Entity (Admin Users)
   */
  users: {
    list: async (tenantId?: string) => {
      return apiRequest('/api/v1/admin/users', {}, tenantId);
    },
    get: async (userId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/users/${userId}`, {}, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return apiRequest(
        '/api/v1/admin/users',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    update: async (userId: string, data: any, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/users/${userId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    delete: async (userId: string, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/users/${userId}`,
        {
          method: 'DELETE',
        },
        tenantId
      );
    },
  },

  /**
   * Customers Entity
   */
  customers: {
    list: async (tenantId?: string) => {
      return customerCrmApi.list({ page: 1, limit: 20 }, tenantId);
    },
    get: async (customerId: string, tenantId?: string) => {
      return customerCrmApi.get(customerId, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return customerCrmApi.create(data, tenantId);
    },
    update: async (customerId: string, data: any, tenantId?: string) => {
      return customerCrmApi.update(customerId, data, tenantId);
    },
    delete: async (customerId: string, tenantId?: string) => {
      return customerCrmApi.delete(customerId, tenantId);
    },
  },

  /**
   * Webhooks Entity
   */
  webhooks: {
    list: async (tenantId?: string) => {
      return apiRequest('/api/v1/webhooks', {}, tenantId);
    },
    get: async (webhookId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/webhooks/${webhookId}`, {}, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return apiRequest(
        '/api/v1/webhooks',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    update: async (webhookId: string, data: any, tenantId?: string) => {
      return apiRequest(
        `/api/v1/webhooks/${webhookId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    delete: async (webhookId: string, tenantId?: string) => {
      return apiRequest(
        `/api/v1/webhooks/${webhookId}`,
        {
          method: 'DELETE',
        },
        tenantId
      );
    },
    getLogs: async (webhookId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/webhooks/${webhookId}/logs`, {}, tenantId);
    },
  },

  /**
   * Payments Entity
   */
  payments: {
    list: async (tenantId?: string) => {
      return apiRequest('/api/v1/payments', {}, tenantId);
    },
    get: async (paymentId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/payments/${paymentId}`, {}, tenantId);
    },
  },

  /**
   * Logs/Audit Logs Entity
   */
  logs: {
    list: async (limit = 100, tenantId?: string) => {
      return auditApi.list({ page: 1, limit }, tenantId);
    },
  },

  /**
   * Cache Entity (Stats only)
   */
  cache: {
    getStats: async (tenantId?: string) => {
      return apiRequest('/metrics', {}, tenantId);
    },
  },

  /**
   * Tenants Entity (multi-tenant data)
   */
  tenants: {
    list: async () => {
      const startTime = performance.now();

      try {
        const data = await listTenantsFromFirestore();
        return {
          data,
          raw: data,
          responseTime: Math.round(performance.now() - startTime),
          success: true,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Math.round(performance.now() - startTime),
          success: false,
        };
      }
    },
    create: async (data: any, tenantId?: string) => {
      const startTime = performance.now();

      try {
        const saved = await saveTenantToFirestore({
          ...data,
          id: data.id || data.tenantId || tenantId,
          tenantId: data.tenantId || tenantId,
        });

        return {
          data: saved,
          raw: { message: 'Tenant created in Firestore', tenant: saved },
          responseTime: Math.round(performance.now() - startTime),
          success: true,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Math.round(performance.now() - startTime),
          success: false,
        };
      }
    },
  },
};

/**
 * Settings and Configuration APIs
 */
export const settingsApi = {
  /**
   * Get tenant settings
   */
  getTenantConfig: async (tenantId?: string) => {
    return apiRequest('/api/v1/admin/tenant-config', {}, tenantId);
  },

  /**
   * Update tenant settings
   */
  updateTenantConfig: async (config: any, tenantId?: string) => {
    return apiRequest(
      '/api/v1/admin/tenant-config',
      {
        method: 'PUT',
        body: JSON.stringify(config),
      },
      tenantId
    );
  },

  /**
   * Get system settings
   */
  getSettings: async (tenantId?: string) => {
    return apiRequest('/api/v1/admin/settings', {}, tenantId);
  },

  /**
   * Update system settings
   */
  updateSettings: async (settings: any, tenantId?: string) => {
    return apiRequest(
      '/api/v1/admin/settings',
      {
        method: 'PUT',
        body: JSON.stringify(settings),
      },
      tenantId
    );
  },
};

/**
 * Entity count helper - fetches count for each entity type
 * Only fetches endpoints that don't require special authentication
 */
export async function getEntityCounts(tenantId?: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    dashboard: 0,
    tenants: 0,
    users: 0,
    products: 0,
    orders: 0,
    'fiscal-settings': 0,
    integrations: 0,
    analytics: 0,
    customers: 0,
    settings: 0,
    'tenant-config': 0,
    payments: 0,
    webhooks: 0,
    logging: 0,
    cache: 0,
  };

  try {
    // Only fetch endpoints that work without special auth.
    // Skip webhooks and payments as they return 401.
    const [tenantsRes, usersRes, productsRes, ordersRes, fiscalRes, integrationsRes, customersRes, logsRes] = await Promise.all(
      [
      entityApi.tenants.list(),
      entityApi.users.list(tenantId),
      productCatalogApi.list({ page: 1, limit: 1 }, tenantId),
      adminUnifiedApi.orders(tenantId),
      adminUnifiedApi.fiscalSettings(tenantId),
      integrationsApi.list(tenantId),
      entityApi.customers.list(tenantId),
      entityApi.logs.list(10, tenantId),
    ]);

    if (tenantsRes.success && Array.isArray(tenantsRes.data)) {
      counts.tenants = tenantsRes.data.length;
    }

    if (usersRes.success && Array.isArray(usersRes.data)) {
      counts.users = usersRes.data.length;
    }
    if (productsRes.success && productsRes.data?.pagination?.total !== undefined) {
      counts.products = productsRes.data.pagination.total;
    } else if (productsRes.success && Array.isArray(productsRes.data)) {
      counts.products = productsRes.data.length;
    }
    if (ordersRes.success && ordersRes.data?.pagination?.total !== undefined) {
      counts.orders = ordersRes.data.pagination.total;
    } else if (ordersRes.success && Array.isArray(ordersRes.data)) {
      counts.orders = ordersRes.data.length;
    }
    if (fiscalRes.success && fiscalRes.data) {
      counts['fiscal-settings'] = 1;
    }
    if (integrationsRes.success && Array.isArray(integrationsRes.data)) {
      counts.integrations = integrationsRes.data.length;
    }
    if (customersRes.success && customersRes.data?.pagination?.total !== undefined) {
      counts.customers = customersRes.data.pagination.total;
    } else if (customersRes.success && Array.isArray(customersRes.data)) {
      counts.customers = customersRes.data.length;
    }
    if (logsRes.success && logsRes.data?.pagination?.total !== undefined) {
      counts.logging = logsRes.data.pagination.total;
    } else if (logsRes.success && Array.isArray(logsRes.data)) {
      counts.logging = logsRes.data.length;
    }
    counts.dashboard = 1;
    counts.analytics = 1;
    counts.settings = 1;
    counts['tenant-config'] = 1;
  } catch (error) {
    console.error('Error fetching entity counts:', error);
  }

  return counts;
}
