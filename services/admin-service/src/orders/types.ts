import { PaginatedResult } from '../types';

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

export interface OrderItemRecord {
  id: string;
  tenantId: string;
  orderId: string;
  productId: string;
  variantId?: string;
  sku: string;
  name: string;
  productSnapshot?: Record<string, unknown>;
  quantity: number;
  unitPrice: number;
  discountTotal: number;
  taxTotal: number;
  totalPrice: number;
  costPrice?: number | null;
  stockReservedQuantity?: number;
  stockDecreasedQuantity?: number;
  ncm?: string;
  cfop?: string;
  cest?: string;
  taxOrigin?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderRecord {
  id: string;
  tenantId: string;
  tenant_id?: string;
  orderNumber: string;
  order_number?: string;
  customerId?: string;
  customer_id?: string;
  customerSnapshot?: Record<string, unknown>;
  customer_snapshot_json?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  items: OrderItemRecord[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  payment_status?: PaymentStatus;
  fiscalStatus: OrderFiscalStatus;
  fiscal_status?: OrderFiscalStatus;
  stockStatus: OrderStockStatus;
  stock_status?: OrderStockStatus;
  shippingStatus: ShippingStatus;
  shipping_status?: ShippingStatus;
  fulfillmentStatus?: string;
  channel?: string;
  marketplace?: string;
  externalOrderId?: string;
  external_order_id?: string;
  source?: string;
  subtotal: number;
  discountTotal: number;
  discount_total?: number;
  shippingTotal: number;
  shipping_total?: number;
  taxTotal: number;
  tax_total?: number;
  feeTotal: number;
  fee_total?: number;
  total: number;
  paidTotal: number;
  paid_total?: number;
  refundedTotal: number;
  refunded_total?: number;
  netTotal: number;
  net_total?: number;
  currency: string;
  paymentMethod?: string;
  payment_method?: string;
  shippingMethod?: string;
  shipping_method?: string;
  notes?: string;
  internalNotesCount: number;
  internal_notes_count?: number;
  tags?: string[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  created_at?: string;
  paidAt?: string;
  paid_at?: string;
  cancelledAt?: string;
  cancelled_at?: string;
  shippedAt?: string;
  shipped_at?: string;
  deliveredAt?: string;
  delivered_at?: string;
  updatedAt: string;
  updated_at?: string;
  deletedAt?: string;
}

export interface OrderListFilters {
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
  status?: string;
  paymentStatus?: string;
  fiscalStatus?: string;
  stockStatus?: string;
  shippingStatus?: string;
  channel?: string;
  marketplace?: string;
  paymentMethod?: string;
  customerId?: string;
  productId?: string;
  sku?: string;
  minTotal?: number;
  maxTotal?: number;
  hasInvoice?: 'with' | 'without' | 'error';
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
}

export interface OrderPermissions {
  canViewSensitive: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canDelete: boolean;
  canChangeStatus: boolean;
  canViewPayment: boolean;
  canConfirmPayment: boolean;
  canRefund: boolean;
  canViewStock: boolean;
  canReserveStock: boolean;
  canDecreaseStock: boolean;
  canViewInvoice: boolean;
  canIssueInvoice: boolean;
  canCancelInvoice: boolean;
  canViewShipping: boolean;
  canUpdateTracking: boolean;
  canExport: boolean;
  canBulkActions: boolean;
  canViewLogs: boolean;
  canManageNotes: boolean;
  canViewCost: boolean;
}

export interface StockCheckItem {
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
}

export interface OrderStockCheck {
  orderId: string;
  tenantId: string;
  available: boolean;
  items: StockCheckItem[];
}

export interface OrderPayment {
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
}

export interface OrderRefund {
  id: string;
  tenantId: string;
  orderId: string;
  paymentId?: string;
  amount: number;
  reason: string;
  status: 'pendente' | 'processado' | 'falhou';
  externalRefundId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderShipment {
  id: string;
  tenantId: string;
  orderId: string;
  carrier: string;
  shippingMethod?: string;
  trackingCode: string;
  trackingUrl?: string;
  status: ShippingStatus | string;
  shippingCost?: number;
  postedAt?: string;
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderTrackingEvent {
  id: string;
  tenantId: string;
  orderId: string;
  shipmentId: string;
  status: string;
  description?: string;
  location?: string;
  eventDate: string;
  rawPayload?: Record<string, unknown>;
  createdAt: string;
}

export interface OrderHistoryEntry {
  id: string;
  tenantId: string;
  orderId: string;
  actorType: 'user' | 'system' | 'job' | 'webhook' | 'integration';
  userId?: string;
  action: string;
  description: string;
  oldStatus?: string;
  newStatus?: string;
  beforeDataMasked?: Record<string, unknown>;
  afterDataMasked?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  createdAt: string;
}

export interface OrderNote {
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
}

export interface OrderDetails {
  order: OrderRecord;
  customer?: Record<string, unknown> | null;
  payments: OrderPayment[];
  refunds: OrderRefund[];
  stock: OrderStockCheck;
  invoice?: Record<string, unknown> | null;
  shipments: OrderShipment[];
  trackingEvents: OrderTrackingEvent[];
  history: OrderHistoryEntry[];
  notes: OrderNote[];
  auditLogs: Array<Record<string, unknown>>;
  alerts: Array<{ type: string; severity: string; description: string; recommendation: string }>;
}

export interface OrderListResult extends PaginatedResult<OrderRecord> {
  segments: Record<string, number>;
  alerts: Array<{ type: string; severity: string; orderId: string; description: string }>;
}

export interface OrderCreateInput {
  customerId?: string;
  customer?: Record<string, unknown>;
  items: Array<Partial<OrderItemRecord>>;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  fiscalStatus?: OrderFiscalStatus;
  stockStatus?: OrderStockStatus;
  shippingStatus?: ShippingStatus;
  channel?: string;
  marketplace?: string;
  externalOrderId?: string;
  source?: string;
  discountTotal?: number;
  shippingTotal?: number;
  taxTotal?: number;
  feeTotal?: number;
  paymentMethod?: string;
  shippingMethod?: string;
  notes?: string;
  tags?: string[];
  idempotencyKey?: string;
}

export interface OrderStatusInput {
  status: OrderStatus;
  reason?: string;
}

export interface OrderPaymentInput {
  method?: string;
  provider?: string;
  amount?: number;
  reason: string;
  externalPaymentId?: string;
  idempotencyKey?: string;
}

export interface OrderRefundInput {
  amount: number;
  reason: string;
  paymentId?: string;
  idempotencyKey?: string;
}

export interface OrderCancelInput {
  reason: string;
  notes?: string;
  refundPayment?: boolean;
  releaseStock?: boolean;
  cancelInvoice?: boolean;
  idempotencyKey?: string;
}

export interface OrderShippingInput {
  carrier: string;
  shippingMethod?: string;
  trackingCode: string;
  trackingUrl?: string;
  status?: string;
  shippingCost?: number;
  estimatedDeliveryAt?: string;
  eventDescription?: string;
  location?: string;
}
