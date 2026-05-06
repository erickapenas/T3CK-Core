import type * as admin from 'firebase-admin';
import { getFirestore, initializeFirestore } from '../firebase';
import { AdminSessionUser, PaginationOptions } from '../types';
import { AuditLogService } from '../audit/audit-log-service';
import { ProductCatalogService } from '../products/product-catalog-service';
import {
  OrderCancelInput,
  OrderCreateInput,
  OrderDetails,
  OrderFiscalStatus,
  OrderItemRecord,
  OrderListFilters,
  OrderListResult,
  OrderPayment,
  OrderPaymentInput,
  OrderPermissions,
  OrderRecord,
  OrderRefund,
  OrderRefundInput,
  OrderShipment,
  OrderShippingInput,
  OrderStatus,
  OrderStatusInput,
  OrderStockCheck,
  OrderStockStatus,
  OrderTrackingEvent,
  PaymentStatus,
  ShippingStatus,
  StockCheckItem,
  OrderHistoryEntry,
  OrderNote,
} from './types';

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string | string[];
};

type OrderTotalsInput = {
  items: Array<Partial<OrderItemRecord>>;
  discountTotal?: number;
  shippingTotal?: number;
  taxTotal?: number;
  feeTotal?: number;
  paidTotal?: number;
  refundedTotal?: number;
};

type CalculatedTotals = {
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  feeTotal: number;
  total: number;
  paidTotal: number;
  refundedTotal: number;
  netTotal: number;
};

const now = (): string => new Date().toISOString();
const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const DEFAULT_SCAN_LIMIT = 2000;
const FINAL_STATUSES = new Set<OrderStatus>(['cancelado', 'devolvido', 'reembolsado', 'entregue']);

function normalizeText(value?: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function onlyDigits(value?: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function maskEmail(email?: string): string {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}***@${domain}`;
}

export function maskPhone(phone?: string): string {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  return digits.length >= 10 ? `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}` : `*****-${digits.slice(-4)}`;
}

export function maskDocument(document?: string): string {
  const digits = onlyDigits(document);
  if (digits.length === 11) return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  if (digits.length === 14) return `**.***.***/${digits.slice(8, 12)}-**`;
  return digits ? '***' : '';
}

function maskIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.***.***.${parts[3]}`;
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
  return '';
}

function dateValue(...values: unknown[]): string {
  for (const value of values) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && value) return value;
  }
  return now();
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function dateInRange(value: string | undefined, from?: string, to?: string): boolean {
  if (!value) return !from && !to;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

function normalizePaymentStatus(value?: unknown): PaymentStatus {
  const status = normalizeText(value);
  if (['approved', 'aprovado', 'paid', 'pago', 'completed', 'captured'].includes(status)) return 'aprovado';
  if (['refused', 'recusado', 'failed', 'failure'].includes(status)) return 'recusado';
  if (['cancelled', 'canceled', 'cancelado'].includes(status)) return 'cancelado';
  if (['refunded', 'estornado'].includes(status)) return 'estornado';
  if (['partially_refunded', 'parcialmente_estornado'].includes(status)) return 'parcialmente_estornado';
  if (['chargeback'].includes(status)) return 'chargeback';
  if (['review', 'em_analise', 'analysis'].includes(status)) return 'em_analise';
  return 'pendente';
}

function normalizeFiscalStatus(value?: unknown): OrderFiscalStatus {
  const status = normalizeText(value);
  if (['authorized', 'autorizada', 'issued', 'emitida'].includes(status)) return 'autorizada';
  if (['rejected', 'rejeitada'].includes(status)) return 'rejeitada';
  if (['cancelled', 'canceled', 'cancelada'].includes(status)) return 'cancelada';
  if (['processing', 'em_processamento'].includes(status)) return 'em_processamento';
  if (['config', 'aguardando_configuracao', 'incompleto'].includes(status)) return 'aguardando_configuracao';
  if (['erro', 'error', 'failed'].includes(status)) return 'erro';
  if (['nao_aplicavel', 'not_applicable'].includes(status)) return 'nao_aplicavel';
  return 'pendente';
}

function normalizeStockStatus(value?: unknown): OrderStockStatus {
  const status = normalizeText(value);
  if (['available', 'disponivel'].includes(status)) return 'disponivel';
  if (['insufficient', 'insuficiente'].includes(status)) return 'insuficiente';
  if (['reserved', 'reservado'].includes(status)) return 'reservado';
  if (['decreased', 'baixado'].includes(status)) return 'baixado';
  if (['partially_reserved', 'parcialmente_reservado'].includes(status)) return 'parcialmente_reservado';
  if (['reverted', 'estornado'].includes(status)) return 'estornado';
  return 'nao_verificado';
}

function normalizeShippingStatus(value?: unknown): ShippingStatus {
  const status = normalizeText(value);
  if (['waiting_picking', 'aguardando_separacao'].includes(status)) return 'aguardando_separacao';
  if (['picking', 'em_separacao'].includes(status)) return 'em_separacao';
  if (['ready_to_ship', 'pronto_para_envio'].includes(status)) return 'pronto_para_envio';
  if (['shipped', 'enviado'].includes(status)) return 'enviado';
  if (['in_transit', 'em_transito'].includes(status)) return 'em_transito';
  if (['out_for_delivery', 'saiu_para_entrega'].includes(status)) return 'saiu_para_entrega';
  if (['delivered', 'entregue'].includes(status)) return 'entregue';
  if (['late', 'atrasado'].includes(status)) return 'atrasado';
  if (['delivery_failed', 'falha_entrega'].includes(status)) return 'falha_entrega';
  if (['returned', 'devolvido'].includes(status)) return 'devolvido';
  return 'nao_iniciado';
}

function normalizeOrderStatus(value: unknown, payment: PaymentStatus, stock: OrderStockStatus, fiscal: OrderFiscalStatus, shipping: ShippingStatus): OrderStatus {
  const status = normalizeText(value);
  if (['draft', 'rascunho'].includes(status)) return 'rascunho';
  if (['created', 'criado', 'pending'].includes(status)) return 'criado';
  if (['cancelled', 'canceled', 'cancelado'].includes(status)) return 'cancelado';
  if (['returned', 'devolvido'].includes(status)) return 'devolvido';
  if (['refunded', 'reembolsado'].includes(status)) return 'reembolsado';
  if (shipping === 'entregue') return 'entregue';
  if (shipping === 'saiu_para_entrega') return 'saiu_para_entrega';
  if (shipping === 'em_transito') return 'em_transito';
  if (shipping === 'enviado') return 'enviado';
  if (shipping === 'pronto_para_envio') return 'pronto_para_envio';
  if (shipping === 'em_separacao') return 'em_separacao';
  if (fiscal === 'autorizada') return 'nota_fiscal_emitida';
  if (fiscal === 'rejeitada' || fiscal === 'erro') return 'falha_operacional';
  if (stock === 'insuficiente') return 'aguardando_estoque';
  if (stock === 'reservado') return fiscal === 'pendente' ? 'aguardando_nota_fiscal' : 'estoque_reservado';
  if (payment === 'aprovado') return 'pagamento_aprovado';
  if (payment === 'recusado') return 'pagamento_recusado';
  if (payment === 'em_analise') return 'em_analise';
  return 'aguardando_pagamento';
}

export function calculateOrderTotals(input: OrderTotalsInput): CalculatedTotals {
  const subtotal = input.items.reduce((sum, item) => {
    const quantity = numberValue(item.quantity);
    const unitPrice = numberValue(item.unitPrice, (item as Record<string, unknown>).price);
    const itemDiscount = numberValue(item.discountTotal);
    const itemTax = numberValue(item.taxTotal);
    return sum + Math.max(0, quantity * unitPrice - itemDiscount + itemTax);
  }, 0);
  const discountTotal = numberValue(input.discountTotal);
  const shippingTotal = numberValue(input.shippingTotal);
  const taxTotal = numberValue(input.taxTotal);
  const feeTotal = numberValue(input.feeTotal);
  const total = Math.max(0, subtotal - discountTotal + shippingTotal + taxTotal + feeTotal);
  const paidTotal = numberValue(input.paidTotal);
  const refundedTotal = numberValue(input.refundedTotal);
  return {
    subtotal: Number(subtotal.toFixed(2)),
    discountTotal: Number(discountTotal.toFixed(2)),
    shippingTotal: Number(shippingTotal.toFixed(2)),
    taxTotal: Number(taxTotal.toFixed(2)),
    feeTotal: Number(feeTotal.toFixed(2)),
    total: Number(total.toFixed(2)),
    paidTotal: Number(paidTotal.toFixed(2)),
    refundedTotal: Number(refundedTotal.toFixed(2)),
    netTotal: Number((total - refundedTotal).toFixed(2)),
  };
}

export function deriveOrderStatus(input: {
  explicitStatus?: OrderStatus;
  paymentStatus: PaymentStatus;
  stockStatus: OrderStockStatus;
  fiscalStatus: OrderFiscalStatus;
  shippingStatus: ShippingStatus;
}): OrderStatus {
  if (input.explicitStatus && FINAL_STATUSES.has(input.explicitStatus)) return input.explicitStatus;
  return normalizeOrderStatus(
    input.explicitStatus,
    input.paymentStatus,
    input.stockStatus,
    input.fiscalStatus,
    input.shippingStatus
  );
}

export class OrderManagementService {
  constructor(
    private readonly audit = new AuditLogService(),
    private readonly productCatalog = new ProductCatalogService()
  ) {
    initializeFirestore();
  }

  private firestore(): admin.firestore.Firestore {
    const firestore = getFirestore();
    if (!firestore) {
      throw new Error('Firestore is required for order persistence');
    }
    return firestore;
  }

  private collection(tenantId: string, name: string): admin.firestore.CollectionReference {
    return this.firestore().collection(`tenants/${tenantId}/admin/data/${name}`);
  }

  permissionsFor(user: AdminSessionUser): OrderPermissions {
    const has = (permission: string) => user.role === 'admin' || Boolean(user.permissions?.includes(permission));
    return {
      canViewSensitive: has('visualizar_dados_sensiveis_pedido'),
      canCreate: has('criar_pedidos'),
      canEdit: has('editar_pedidos'),
      canCancel: has('cancelar_pedidos'),
      canDelete: has('excluir_pedidos'),
      canChangeStatus: has('alterar_status_pedido'),
      canViewPayment: has('visualizar_pagamento_pedido'),
      canConfirmPayment: has('confirmar_pagamento_manual'),
      canRefund: has('reembolsar_pedido'),
      canViewStock: has('visualizar_estoque_pedido'),
      canReserveStock: has('reservar_estoque_pedido'),
      canDecreaseStock: has('baixar_estoque_pedido'),
      canViewInvoice: has('visualizar_nota_fiscal_pedido'),
      canIssueInvoice: has('emitir_nota_fiscal_pedido'),
      canCancelInvoice: has('cancelar_nota_fiscal_pedido'),
      canViewShipping: has('visualizar_envio_pedido'),
      canUpdateTracking: has('atualizar_rastreio_pedido'),
      canExport: has('exportar_pedidos'),
      canBulkActions: has('executar_acoes_em_massa_pedidos'),
      canViewLogs: has('visualizar_logs_pedido'),
      canManageNotes: has('gerenciar_observacoes_pedido'),
      canViewCost: has('visualizar_custo_produto'),
    };
  }

  async listOrders(
    tenantId: string,
    pagination: PaginationOptions,
    filters: OrderListFilters,
    permissions: OrderPermissions
  ): Promise<OrderListResult> {
    const page = Math.max(1, Number(pagination.page || filters.page || 1));
    const limit = Math.max(1, Math.min(100, Number(pagination.limit || filters.limit || 20)));
    const snapshot = await this.collection(tenantId, 'orders')
      .orderBy('createdAt', 'desc')
      .limit(DEFAULT_SCAN_LIMIT)
      .get()
      .catch(() => this.collection(tenantId, 'orders').limit(DEFAULT_SCAN_LIMIT).get());
    const orders = snapshot.docs
      .map((doc) => this.normalizeOrder(tenantId, doc.id, doc.data()))
      .filter((order) => this.matchesFilters(order, filters))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const start = (page - 1) * limit;
    return {
      items: orders.slice(start, start + limit).map((order) => this.maskOrder(order, permissions)),
      segments: this.buildSegments(orders),
      alerts: this.buildListAlerts(orders).slice(0, 8),
      pagination: {
        page,
        limit,
        total: orders.length,
        totalPages: Math.max(1, Math.ceil(orders.length / limit)),
        hasNextPage: start + limit < orders.length,
        hasPreviousPage: page > 1,
      },
    };
  }

  async createOrder(
    tenantId: string,
    input: OrderCreateInput,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<OrderRecord> {
    if (input.idempotencyKey) {
      const existing = await this.findIdempotentOrder(tenantId, 'create_order', input.idempotencyKey);
      if (existing) return existing;
    }
    if (input.marketplace && input.externalOrderId) {
      await this.assertExternalOrderUnique(tenantId, input.marketplace, input.externalOrderId);
    }
    const timestamp = now();
    const id = randomId('ord');
    const orderNumber = await this.generateOrderNumber(tenantId);
    const customerSnapshot = await this.buildCustomerSnapshot(tenantId, input.customerId, input.customer);
    const paymentStatus = input.paymentStatus || 'pendente';
    const fiscalStatus = input.fiscalStatus || 'pendente';
    const stockStatus = input.stockStatus || 'nao_verificado';
    const shippingStatus = input.shippingStatus || 'nao_iniciado';
    const items = this.normalizeItems(tenantId, id, input.items, timestamp);
    const totals = calculateOrderTotals({ ...input, items });
    const status = input.status || deriveOrderStatus({ paymentStatus, stockStatus, fiscalStatus, shippingStatus });
    const order: OrderRecord = {
      id,
      tenantId,
      tenant_id: tenantId,
      orderNumber,
      order_number: orderNumber,
      customerId: input.customerId,
      customer_id: input.customerId,
      customerSnapshot,
      customer_snapshot_json: customerSnapshot,
      customer: customerSnapshot,
      items,
      status,
      paymentStatus,
      payment_status: paymentStatus,
      fiscalStatus,
      fiscal_status: fiscalStatus,
      stockStatus,
      stock_status: stockStatus,
      shippingStatus,
      shipping_status: shippingStatus,
      channel: input.channel || 'manual',
      marketplace: input.marketplace,
      externalOrderId: input.externalOrderId,
      external_order_id: input.externalOrderId,
      source: input.source || 'cadastro_manual',
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      discount_total: totals.discountTotal,
      shippingTotal: totals.shippingTotal,
      shipping_total: totals.shippingTotal,
      taxTotal: totals.taxTotal,
      tax_total: totals.taxTotal,
      feeTotal: totals.feeTotal,
      fee_total: totals.feeTotal,
      total: totals.total,
      paidTotal: totals.paidTotal,
      paid_total: totals.paidTotal,
      refundedTotal: totals.refundedTotal,
      refunded_total: totals.refundedTotal,
      netTotal: totals.netTotal,
      net_total: totals.netTotal,
      currency: 'BRL',
      paymentMethod: input.paymentMethod,
      payment_method: input.paymentMethod,
      shippingMethod: input.shippingMethod,
      shipping_method: input.shippingMethod,
      notes: input.notes,
      internalNotesCount: 0,
      internal_notes_count: 0,
      tags: input.tags || [],
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: timestamp,
      created_at: timestamp,
      updatedAt: timestamp,
      updated_at: timestamp,
    };
    await this.collection(tenantId, 'orders').doc(id).set(order as unknown as Record<string, unknown>, { merge: false });
    await this.persistItems(tenantId, id, items);
    if (input.idempotencyKey) await this.saveIdempotency(tenantId, id, 'create_order', input.idempotencyKey);
    await this.recordHistory(tenantId, id, user, 'orders.order.created', 'Pedido criado.', undefined, order, meta);
    await this.recordAudit(tenantId, user, 'orders.order.created', 'create', 'notice', 'success', order, undefined, order, meta);
    return order;
  }

  async getDetails(tenantId: string, orderId: string, permissions: OrderPermissions): Promise<OrderDetails> {
    const order = await this.requireOrder(tenantId, orderId);
    const [customer, payments, refunds, stock, invoice, shipments, history, notes, auditLogs] = await Promise.all([
      this.getCustomerForOrder(tenantId, order, permissions),
      permissions.canViewPayment ? this.listChildren<OrderPayment>(tenantId, 'order_payments', orderId) : Promise.resolve([]),
      permissions.canViewPayment ? this.listChildren<OrderRefund>(tenantId, 'order_refunds', orderId) : Promise.resolve([]),
      permissions.canViewStock ? this.stockCheck(tenantId, orderId) : Promise.resolve(this.emptyStockCheck(tenantId, orderId)),
      permissions.canViewInvoice ? this.getInvoice(tenantId, orderId) : Promise.resolve(null),
      permissions.canViewShipping ? this.listChildren<OrderShipment>(tenantId, 'order_shipments', orderId) : Promise.resolve([]),
      this.listHistory(tenantId, orderId),
      this.listNotes(tenantId, orderId),
      permissions.canViewLogs
        ? this.audit.resourceTimeline(tenantId, 'order', orderId, { page: 1, limit: 50 }).then((result) =>
            result.items.map((item) => ({ ...(item as unknown as Record<string, unknown>) }))
          )
        : Promise.resolve([]),
    ]);
    const trackingEvents = await this.listTrackingEvents(tenantId, orderId, shipments);
    const masked = this.maskOrder(order, permissions);
    return {
      order: masked,
      customer,
      payments,
      refunds,
      stock,
      invoice,
      shipments,
      trackingEvents,
      history,
      notes,
      auditLogs,
      alerts: this.buildDetailAlerts(order, stock, invoice),
    };
  }

  async updateOrder(
    tenantId: string,
    orderId: string,
    input: Partial<OrderCreateInput>,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<OrderRecord> {
    const current = await this.requireOrder(tenantId, orderId);
    this.assertEditable(current);
    const timestamp = now();
    const items = input.items ? this.normalizeItems(tenantId, orderId, input.items, timestamp) : current.items;
    const totals = calculateOrderTotals({
      items,
      discountTotal: input.discountTotal ?? current.discountTotal,
      shippingTotal: input.shippingTotal ?? current.shippingTotal,
      taxTotal: input.taxTotal ?? current.taxTotal,
      feeTotal: input.feeTotal ?? current.feeTotal,
      paidTotal: current.paidTotal,
      refundedTotal: current.refundedTotal,
    });
    const paymentStatus = input.paymentStatus || current.paymentStatus;
    const fiscalStatus = input.fiscalStatus || current.fiscalStatus;
    const stockStatus = input.stockStatus || current.stockStatus;
    const shippingStatus = input.shippingStatus || current.shippingStatus;
    const status = input.status || deriveOrderStatus({ paymentStatus, stockStatus, fiscalStatus, shippingStatus });
    const updated: OrderRecord = {
      ...current,
      customerId: input.customerId ?? current.customerId,
      customer_id: input.customerId ?? current.customerId,
      customerSnapshot: input.customer || current.customerSnapshot,
      customer_snapshot_json: input.customer || current.customerSnapshot,
      customer: input.customer || current.customerSnapshot,
      items,
      status,
      paymentStatus,
      payment_status: paymentStatus,
      fiscalStatus,
      fiscal_status: fiscalStatus,
      stockStatus,
      stock_status: stockStatus,
      shippingStatus,
      shipping_status: shippingStatus,
      channel: input.channel ?? current.channel,
      marketplace: input.marketplace ?? current.marketplace,
      externalOrderId: input.externalOrderId ?? current.externalOrderId,
      external_order_id: input.externalOrderId ?? current.externalOrderId,
      source: input.source ?? current.source,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      discount_total: totals.discountTotal,
      shippingTotal: totals.shippingTotal,
      shipping_total: totals.shippingTotal,
      taxTotal: totals.taxTotal,
      tax_total: totals.taxTotal,
      feeTotal: totals.feeTotal,
      fee_total: totals.feeTotal,
      total: totals.total,
      netTotal: totals.netTotal,
      net_total: totals.netTotal,
      paymentMethod: input.paymentMethod ?? current.paymentMethod,
      payment_method: input.paymentMethod ?? current.paymentMethod,
      shippingMethod: input.shippingMethod ?? current.shippingMethod,
      shipping_method: input.shippingMethod ?? current.shippingMethod,
      notes: input.notes ?? current.notes,
      tags: input.tags ?? current.tags,
      updatedBy: user.id,
      updatedAt: timestamp,
      updated_at: timestamp,
    };
    await this.collection(tenantId, 'orders').doc(orderId).set(updated as unknown as Record<string, unknown>, { merge: true });
    await this.persistItems(tenantId, orderId, items);
    await this.recordHistory(tenantId, orderId, user, 'orders.order.updated', 'Pedido editado.', current, updated, meta);
    await this.recordAudit(tenantId, user, 'orders.order.updated', 'update', 'notice', 'success', updated, current, updated, meta);
    return updated;
  }

  async softDeleteOrder(tenantId: string, orderId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<void> {
    const current = await this.requireOrder(tenantId, orderId);
    const updated = { ...current, deletedAt: now(), status: 'cancelado' as OrderStatus, updatedAt: now(), updated_at: now() };
    await this.collection(tenantId, 'orders').doc(orderId).set(updated as unknown as Record<string, unknown>, { merge: true });
    await this.recordHistory(tenantId, orderId, user, 'orders.order.deleted', 'Pedido removido logicamente.', current, updated, meta);
    await this.recordAudit(tenantId, user, 'orders.order.deleted', 'delete', 'warning', 'success', updated, current, updated, meta);
  }

  async updateStatus(
    tenantId: string,
    orderId: string,
    input: OrderStatusInput,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<OrderRecord> {
    const current = await this.requireOrder(tenantId, orderId);
    const updated = await this.patchOrderStatus(tenantId, current, { status: input.status }, user.id);
    await this.recordHistory(tenantId, orderId, user, 'orders.order.status_changed', input.reason || 'Status alterado.', current, updated, meta);
    await this.recordAudit(tenantId, user, 'orders.order.status_changed', 'update', 'notice', 'success', updated, { status: current.status }, { status: updated.status, reason: input.reason }, meta);
    return updated;
  }

  async duplicateOrder(tenantId: string, orderId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderRecord> {
    const current = await this.requireOrder(tenantId, orderId);
    const duplicated = await this.createOrder(
      tenantId,
      {
        customerId: current.customerId,
        customer: current.customerSnapshot,
        items: current.items,
        channel: current.channel,
        source: 'duplicacao_manual',
        paymentMethod: current.paymentMethod,
        shippingMethod: current.shippingMethod,
        discountTotal: current.discountTotal,
        shippingTotal: current.shippingTotal,
        taxTotal: current.taxTotal,
        feeTotal: current.feeTotal,
        notes: current.notes,
        tags: current.tags,
      },
      user,
      meta
    );
    await this.recordAudit(tenantId, user, 'orders.order.duplicated', 'create', 'notice', 'success', duplicated, current, duplicated, meta);
    return duplicated;
  }

  async cancelOrder(
    tenantId: string,
    orderId: string,
    input: OrderCancelInput,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<OrderRecord> {
    if (input.idempotencyKey) {
      const existing = await this.findIdempotentOrder(tenantId, 'cancel_order', input.idempotencyKey);
      if (existing) return existing;
    }
    const current = await this.requireOrder(tenantId, orderId);
    if (current.status === 'cancelado') throw new Error('Esta operacao ja foi processada anteriormente');
    const updated = await this.patchOrderStatus(
      tenantId,
      current,
      {
        status: 'cancelado',
        paymentStatus: input.refundPayment ? 'estornado' : current.paymentStatus,
        stockStatus: input.releaseStock ? 'estornado' : current.stockStatus,
        fiscalStatus: input.cancelInvoice ? 'cancelada' : current.fiscalStatus,
        cancelledAt: now(),
      },
      user.id
    );
    if (input.releaseStock) await this.runStockOperation(tenantId, updated, 'release', input.reason, user, meta, input.idempotencyKey);
    if (input.refundPayment && updated.paidTotal > updated.refundedTotal) {
      await this.refundOrder(tenantId, orderId, { amount: updated.paidTotal - updated.refundedTotal, reason: input.reason }, user, meta);
    }
    if (input.idempotencyKey) await this.saveIdempotency(tenantId, orderId, 'cancel_order', input.idempotencyKey);
    await this.recordHistory(tenantId, orderId, user, 'orders.order.cancelled', input.reason, current, updated, meta);
    await this.recordAudit(tenantId, user, 'orders.order.cancelled', 'update', 'warning', 'success', updated, current, { ...updated, reason: input.reason, notes: input.notes }, meta);
    return updated;
  }

  async addItem(tenantId: string, orderId: string, input: Partial<OrderItemRecord>, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderRecord> {
    const order = await this.requireOrder(tenantId, orderId);
    return this.updateOrder(tenantId, orderId, { items: [...order.items, input] }, user, meta);
  }

  async updateItem(tenantId: string, orderId: string, itemId: string, input: Partial<OrderItemRecord>, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderRecord> {
    const order = await this.requireOrder(tenantId, orderId);
    const items = order.items.map((item) => (item.id === itemId ? { ...item, ...input } : item));
    return this.updateOrder(tenantId, orderId, { items }, user, meta);
  }

  async deleteItem(tenantId: string, orderId: string, itemId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderRecord> {
    const order = await this.requireOrder(tenantId, orderId);
    const items = order.items.filter((item) => item.id !== itemId);
    if (!items.length) throw new Error('Pedido precisa ter ao menos um item');
    return this.updateOrder(tenantId, orderId, { items }, user, meta);
  }

  async recalculateTotals(tenantId: string, orderId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderRecord> {
    const order = await this.requireOrder(tenantId, orderId);
    const totals = calculateOrderTotals({
      items: order.items,
      discountTotal: order.discountTotal,
      shippingTotal: order.shippingTotal,
      taxTotal: order.taxTotal,
      feeTotal: order.feeTotal,
      paidTotal: order.paidTotal,
      refundedTotal: order.refundedTotal,
    });
    const updated = { ...order, ...totals, updatedBy: user.id, updatedAt: now(), updated_at: now() };
    await this.collection(tenantId, 'orders').doc(orderId).set(updated as unknown as Record<string, unknown>, { merge: true });
    await this.recordHistory(tenantId, orderId, user, 'orders.order.totals_recalculated', 'Totais recalculados no backend.', order, updated, meta);
    return updated;
  }

  async listPayments(tenantId: string, orderId: string): Promise<OrderPayment[]> {
    await this.requireOrder(tenantId, orderId);
    return this.listChildren<OrderPayment>(tenantId, 'order_payments', orderId);
  }

  async confirmPaymentManual(
    tenantId: string,
    orderId: string,
    input: OrderPaymentInput,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<{ order: OrderRecord; payment: OrderPayment }> {
    const current = await this.requireOrder(tenantId, orderId);
    const amount = input.amount ?? current.total;
    const timestamp = now();
    const payment: OrderPayment = {
      id: randomId('pay'),
      tenantId,
      orderId,
      provider: input.provider || 'manual',
      method: input.method || current.paymentMethod || 'manual',
      status: 'aprovado',
      grossAmount: amount,
      feeAmount: 0,
      netAmount: amount,
      externalPaymentId: input.externalPaymentId,
      paidAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.collection(tenantId, 'order_payments').doc(payment.id).set(payment as unknown as Record<string, unknown>, { merge: false });
    const updated = await this.patchOrderStatus(
      tenantId,
      current,
      { paymentStatus: 'aprovado', status: 'pagamento_aprovado', paidAt: timestamp, paidTotal: current.paidTotal + amount },
      user.id
    );
    await this.recordHistory(tenantId, orderId, user, 'payments.payment.manually_confirmed', input.reason, current, updated, meta);
    await this.recordAudit(tenantId, user, 'payments.payment.manually_confirmed', 'update', 'critical', 'success', updated, { paymentStatus: current.paymentStatus }, payment, meta);
    return { order: updated, payment };
  }

  async refundOrder(
    tenantId: string,
    orderId: string,
    input: OrderRefundInput,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<{ order: OrderRecord; refund: OrderRefund }> {
    const current = await this.requireOrder(tenantId, orderId);
    if (input.amount > current.paidTotal - current.refundedTotal) throw new Error('Reembolso maior que valor pago');
    const timestamp = now();
    const refund: OrderRefund = {
      id: randomId('refund'),
      tenantId,
      orderId,
      paymentId: input.paymentId,
      amount: input.amount,
      reason: input.reason,
      status: 'processado',
      createdBy: user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.collection(tenantId, 'order_refunds').doc(refund.id).set(refund as unknown as Record<string, unknown>, { merge: false });
    const refundedTotal = current.refundedTotal + input.amount;
    const paymentStatus: PaymentStatus = refundedTotal >= current.paidTotal ? 'estornado' : 'parcialmente_estornado';
    const updated = await this.patchOrderStatus(
      tenantId,
      current,
      { paymentStatus, status: paymentStatus === 'estornado' ? 'reembolsado' : current.status, refundedTotal },
      user.id
    );
    await this.recordHistory(tenantId, orderId, user, 'payments.payment.refunded', input.reason, current, updated, meta);
    await this.recordAudit(tenantId, user, 'payments.payment.refunded', 'update', 'critical', 'success', updated, { refundedTotal: current.refundedTotal }, refund, meta);
    return { order: updated, refund };
  }

  async checkPaymentStatus(tenantId: string, orderId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<{ order: OrderRecord; payments: OrderPayment[] }> {
    const order = await this.requireOrder(tenantId, orderId);
    const payments = await this.listPayments(tenantId, orderId);
    await this.recordAudit(tenantId, user, 'payments.payment.status_checked', 'view', 'info', 'success', order, undefined, { payments: payments.length }, meta);
    return { order, payments };
  }

  async stockCheck(tenantId: string, orderId: string): Promise<OrderStockCheck> {
    const order = await this.requireOrder(tenantId, orderId);
    const items = await Promise.all(order.items.map((item) => this.stockCheckItem(tenantId, item)));
    return {
      orderId,
      tenantId,
      available: items.every((item) => item.ok),
      items,
    };
  }

  async getStock(tenantId: string, orderId: string): Promise<OrderStockCheck> {
    return this.stockCheck(tenantId, orderId);
  }

  async reserveStock(tenantId: string, orderId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderRecord> {
    const order = await this.requireOrder(tenantId, orderId);
    const check = await this.stockCheck(tenantId, orderId);
    if (!check.available) throw new Error('Estoque insuficiente para reservar os itens do pedido');
    await this.runStockOperation(tenantId, order, 'reserve', 'Reserva de estoque do pedido', user, meta);
    const updated = await this.patchOrderStatus(tenantId, order, { stockStatus: 'reservado' }, user.id);
    await this.recordHistory(tenantId, orderId, user, 'inventory.stock.reserved', 'Estoque reservado para o pedido.', order, updated, meta);
    return updated;
  }

  async releaseStock(tenantId: string, orderId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderRecord> {
    const order = await this.requireOrder(tenantId, orderId);
    await this.runStockOperation(tenantId, order, 'release', 'Liberacao de reserva do pedido', user, meta);
    const updated = await this.patchOrderStatus(tenantId, order, { stockStatus: 'estornado' }, user.id);
    await this.recordHistory(tenantId, orderId, user, 'inventory.stock.released', 'Reserva de estoque liberada.', order, updated, meta);
    return updated;
  }

  async decreaseStock(tenantId: string, orderId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderRecord> {
    const order = await this.requireOrder(tenantId, orderId);
    if (order.stockStatus === 'baixado') throw new Error('Estoque ja baixado');
    await this.runStockOperation(tenantId, order, 'decrease', 'Baixa de estoque do pedido', user, meta);
    const updated = await this.patchOrderStatus(tenantId, order, { stockStatus: 'baixado' }, user.id);
    await this.recordHistory(tenantId, orderId, user, 'inventory.stock.decreased', 'Estoque baixado para o pedido.', order, updated, meta);
    return updated;
  }

  async revertStock(tenantId: string, orderId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderRecord> {
    const order = await this.requireOrder(tenantId, orderId);
    await this.runStockOperation(tenantId, order, 'increase', 'Estorno de estoque do pedido', user, meta);
    const updated = await this.patchOrderStatus(tenantId, order, { stockStatus: 'estornado' }, user.id);
    await this.recordHistory(tenantId, orderId, user, 'inventory.stock.reverted', 'Estoque estornado para o pedido.', order, updated, meta);
    return updated;
  }

  async getShipping(tenantId: string, orderId: string): Promise<{ shipments: OrderShipment[]; trackingEvents: OrderTrackingEvent[] }> {
    await this.requireOrder(tenantId, orderId);
    const shipments = await this.listChildren<OrderShipment>(tenantId, 'order_shipments', orderId);
    const trackingEvents = await this.listTrackingEvents(tenantId, orderId, shipments);
    return { shipments, trackingEvents };
  }

  async saveShipping(
    tenantId: string,
    orderId: string,
    input: OrderShippingInput,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<{ order: OrderRecord; shipment: OrderShipment; event: OrderTrackingEvent }> {
    const order = await this.requireOrder(tenantId, orderId);
    const timestamp = now();
    const shipment: OrderShipment = {
      id: randomId('ship'),
      tenantId,
      orderId,
      carrier: input.carrier,
      shippingMethod: input.shippingMethod || order.shippingMethod,
      trackingCode: input.trackingCode,
      trackingUrl: input.trackingUrl,
      status: input.status || 'enviado',
      shippingCost: input.shippingCost,
      estimatedDeliveryAt: input.estimatedDeliveryAt,
      postedAt: ['enviado', 'em_transito'].includes(String(input.status || 'enviado')) ? timestamp : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const event = this.buildTrackingEvent(tenantId, orderId, shipment.id, input.status || 'enviado', input.eventDescription || 'Rastreio adicionado ao pedido.', input.location);
    await this.collection(tenantId, 'order_shipments').doc(shipment.id).set(shipment as unknown as Record<string, unknown>, { merge: false });
    await this.collection(tenantId, 'order_tracking_events').doc(event.id).set(event as unknown as Record<string, unknown>, { merge: false });
    const shippingStatus = normalizeShippingStatus(shipment.status);
    const updated = await this.patchOrderStatus(tenantId, order, { shippingStatus, status: deriveOrderStatus({ paymentStatus: order.paymentStatus, stockStatus: order.stockStatus, fiscalStatus: order.fiscalStatus, shippingStatus }) }, user.id);
    await this.recordHistory(tenantId, orderId, user, 'orders.shipping.tracking_added', 'Rastreio adicionado.', order, updated, meta);
    await this.recordAudit(tenantId, user, 'orders.shipping.tracking_added', 'update', 'notice', 'success', updated, undefined, shipment, meta);
    return { order: updated, shipment, event };
  }

  async updateShippingStatus(
    tenantId: string,
    orderId: string,
    status: string,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<OrderRecord> {
    const order = await this.requireOrder(tenantId, orderId);
    const shippingStatus = normalizeShippingStatus(status);
    const updated = await this.patchOrderStatus(tenantId, order, { shippingStatus }, user.id);
    await this.recordHistory(tenantId, orderId, user, 'orders.shipping.status_changed', `Envio alterado para ${shippingStatus}.`, order, updated, meta);
    return updated;
  }

  async updateTracking(tenantId: string, orderId: string, input: OrderShippingInput, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderTrackingEvent> {
    await this.requireOrder(tenantId, orderId);
    const shipments = await this.listChildren<OrderShipment>(tenantId, 'order_shipments', orderId);
    const shipment = shipments.find((item) => item.trackingCode === input.trackingCode) || shipments[0];
    if (!shipment) {
      return (await this.saveShipping(tenantId, orderId, input, user, meta)).event;
    }
    const event = this.buildTrackingEvent(tenantId, orderId, shipment.id, input.status || shipment.status, input.eventDescription || 'Rastreio atualizado.', input.location);
    await this.collection(tenantId, 'order_tracking_events').doc(event.id).set(event as unknown as Record<string, unknown>, { merge: false });
    await this.recordAudit(tenantId, user, 'orders.shipping.tracking_updated', 'update', 'notice', 'success', { id: orderId, orderNumber: orderId }, undefined, event, meta);
    return event;
  }

  async listHistory(tenantId: string, orderId: string): Promise<OrderHistoryEntry[]> {
    await this.requireOrder(tenantId, orderId);
    return this.listChildren<OrderHistoryEntry>(tenantId, 'order_history', orderId, 100);
  }

  async listNotes(tenantId: string, orderId: string): Promise<OrderNote[]> {
    await this.requireOrder(tenantId, orderId);
    return this.listChildren<OrderNote>(tenantId, 'order_notes', orderId, 100);
  }

  async addNote(tenantId: string, orderId: string, input: Partial<OrderNote>, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderNote> {
    await this.requireOrder(tenantId, orderId);
    const timestamp = now();
    const note: OrderNote = {
      id: randomId('note'),
      tenantId,
      orderId,
      userId: user.id,
      type: input.type || 'geral',
      note: String(input.note || ''),
      isPinned: Boolean(input.isPinned),
      visibility: input.visibility || 'interna',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.collection(tenantId, 'order_notes').doc(note.id).set(note as unknown as Record<string, unknown>, { merge: false });
    const order = await this.requireOrder(tenantId, orderId);
    await this.collection(tenantId, 'orders').doc(orderId).set({ internalNotesCount: order.internalNotesCount + 1, internal_notes_count: order.internalNotesCount + 1, updatedAt: timestamp }, { merge: true });
    await this.recordHistory(tenantId, orderId, user, 'orders.note.created', 'Observacao interna adicionada.', undefined, note, meta);
    await this.recordAudit(tenantId, user, 'orders.note.created', 'create', 'notice', 'success', order, undefined, note, meta);
    return note;
  }

  async updateNote(tenantId: string, orderId: string, noteId: string, input: Partial<OrderNote>, user: AdminSessionUser, meta: RequestMeta = {}): Promise<OrderNote> {
    const current = await this.requireChild<OrderNote>(tenantId, 'order_notes', orderId, noteId);
    const updated: OrderNote = { ...current, ...input, id: noteId, tenantId, orderId, updatedAt: now() };
    await this.collection(tenantId, 'order_notes').doc(noteId).set(updated as unknown as Record<string, unknown>, { merge: true });
    await this.recordHistory(tenantId, orderId, user, 'orders.note.updated', 'Observacao interna editada.', current, updated, meta);
    return updated;
  }

  async deleteNote(tenantId: string, orderId: string, noteId: string, user: AdminSessionUser, meta: RequestMeta = {}): Promise<boolean> {
    const note = await this.requireChild<OrderNote>(tenantId, 'order_notes', orderId, noteId);
    await this.collection(tenantId, 'order_notes').doc(noteId).delete();
    await this.recordHistory(tenantId, orderId, user, 'orders.note.deleted', 'Observacao interna removida.', note, undefined, meta);
    return true;
  }

  async exportOrders(
    tenantId: string,
    filters: OrderListFilters,
    format: 'csv' | 'json',
    permissions: OrderPermissions,
    user: AdminSessionUser,
    meta: RequestMeta = {}
  ): Promise<{ format: 'csv' | 'json'; contentBase64: string; total: number; generatedAt: string }> {
    const data = await this.listOrders(tenantId, { page: 1, limit: 500 }, filters, permissions);
    const rows = data.items.map((order) => ({
      numero: order.orderNumber,
      cliente: stringValue(order.customerSnapshot?.name, order.customer?.name),
      status: order.status,
      pagamento: order.paymentStatus,
      fiscal: order.fiscalStatus,
      estoque: order.stockStatus,
      envio: order.shippingStatus,
      total: order.total,
      itens: order.items.length,
      canal: order.channel || '',
      marketplace: order.marketplace || '',
      criado_em: order.createdAt,
    }));
    const content = format === 'json'
      ? JSON.stringify(rows, null, 2)
      : [
          Object.keys(rows[0] || { numero: '', cliente: '', total: '' }).join(','),
          ...rows.map((row) => Object.values(row).map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')),
        ].join('\n');
    await this.recordAudit(tenantId, user, 'orders.order.exported', 'export', 'notice', 'success', { id: 'export', orderNumber: 'Exportacao de pedidos' }, undefined, { total: rows.length, format, filters }, meta);
    return {
      format,
      contentBase64: Buffer.from(content, 'utf8').toString('base64'),
      total: rows.length,
      generatedAt: now(),
    };
  }

  async bulkStatus(tenantId: string, orderIds: string[], status: OrderStatus, reason: string | undefined, user: AdminSessionUser, meta: RequestMeta = {}): Promise<{ updated: number; errors: Array<{ orderId: string; error: string }> }> {
    let updated = 0;
    const errors: Array<{ orderId: string; error: string }> = [];
    for (const orderId of orderIds) {
      try {
        await this.updateStatus(tenantId, orderId, { status, reason }, user, meta);
        updated += 1;
      } catch (error) {
        errors.push({ orderId, error: (error as Error).message });
      }
    }
    await this.recordAudit(tenantId, user, 'orders.bulk.status_changed', 'update', errors.length ? 'warning' : 'notice', errors.length ? 'partial' : 'success', { id: 'bulk', orderNumber: 'Acao em massa' }, undefined, { updated, errors: errors.length, status }, meta);
    return { updated, errors };
  }

  async bulkStockCheck(tenantId: string, orderIds: string[]): Promise<Array<OrderStockCheck & { error?: string }>> {
    const result: Array<OrderStockCheck & { error?: string }> = [];
    for (const orderId of orderIds) {
      try {
        result.push(await this.stockCheck(tenantId, orderId));
      } catch (error) {
        result.push({ ...this.emptyStockCheck(tenantId, orderId), error: (error as Error).message });
      }
    }
    return result;
  }

  private normalizeOrder(tenantId: string, id: string, data: admin.firestore.DocumentData): OrderRecord {
    const paymentStatus = normalizePaymentStatus(data.paymentStatus || data.payment_status);
    const fiscalStatus = normalizeFiscalStatus(data.fiscalStatus || data.fiscal_status);
    const stockStatus = normalizeStockStatus(data.stockStatus || data.stock_status);
    const shippingStatus = normalizeShippingStatus(data.shippingStatus || data.shipping_status);
    const createdAt = dateValue(data.createdAt, data.created_at);
    const items = this.normalizeItems(tenantId, id, Array.isArray(data.items) ? data.items : [], createdAt);
    const totals = calculateOrderTotals({
      items,
      discountTotal: data.discountTotal ?? data.discount_total ?? data.discount,
      shippingTotal: data.shippingTotal ?? data.shipping_total ?? data.shippingCost ?? data.freight,
      taxTotal: data.taxTotal ?? data.tax_total,
      feeTotal: data.feeTotal ?? data.fee_total,
      paidTotal: data.paidTotal ?? data.paid_total,
      refundedTotal: data.refundedTotal ?? data.refunded_total,
    });
    const explicitStatus = data.status as OrderStatus | undefined;
    const status = normalizeOrderStatus(explicitStatus, paymentStatus, stockStatus, fiscalStatus, shippingStatus);
    const orderNumber = stringValue(data.orderNumber, data.order_number, id);
    const customerSnapshot = recordValue(data.customerSnapshot || data.customer_snapshot_json || data.customer);
    return {
      id,
      tenantId,
      tenant_id: tenantId,
      orderNumber,
      order_number: orderNumber,
      customerId: stringValue(data.customerId, data.customer_id) || undefined,
      customer_id: stringValue(data.customerId, data.customer_id) || undefined,
      customerSnapshot,
      customer_snapshot_json: customerSnapshot,
      customer: customerSnapshot,
      items,
      status,
      paymentStatus,
      payment_status: paymentStatus,
      fiscalStatus,
      fiscal_status: fiscalStatus,
      stockStatus,
      stock_status: stockStatus,
      shippingStatus,
      shipping_status: shippingStatus,
      fulfillmentStatus: stringValue(data.fulfillmentStatus, data.fulfillment_status) || undefined,
      channel: stringValue(data.channel) || undefined,
      marketplace: stringValue(data.marketplace) || undefined,
      externalOrderId: stringValue(data.externalOrderId, data.external_order_id) || undefined,
      external_order_id: stringValue(data.externalOrderId, data.external_order_id) || undefined,
      source: stringValue(data.source) || undefined,
      subtotal: numberValue(data.subtotal, totals.subtotal),
      discountTotal: totals.discountTotal,
      discount_total: totals.discountTotal,
      shippingTotal: totals.shippingTotal,
      shipping_total: totals.shippingTotal,
      taxTotal: totals.taxTotal,
      tax_total: totals.taxTotal,
      feeTotal: totals.feeTotal,
      fee_total: totals.feeTotal,
      total: numberValue(data.total, totals.total),
      paidTotal: totals.paidTotal,
      paid_total: totals.paidTotal,
      refundedTotal: totals.refundedTotal,
      refunded_total: totals.refundedTotal,
      netTotal: totals.netTotal,
      net_total: totals.netTotal,
      currency: stringValue(data.currency) || 'BRL',
      paymentMethod: stringValue(data.paymentMethod, data.payment_method) || undefined,
      payment_method: stringValue(data.paymentMethod, data.payment_method) || undefined,
      shippingMethod: stringValue(data.shippingMethod, data.shipping_method) || undefined,
      shipping_method: stringValue(data.shippingMethod, data.shipping_method) || undefined,
      notes: stringValue(data.notes, data.internalNotes) || undefined,
      internalNotesCount: numberValue(data.internalNotesCount, data.internal_notes_count),
      internal_notes_count: numberValue(data.internalNotesCount, data.internal_notes_count),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      createdBy: stringValue(data.createdBy, data.created_by) || undefined,
      updatedBy: stringValue(data.updatedBy, data.updated_by) || undefined,
      createdAt,
      created_at: createdAt,
      paidAt: stringValue(data.paidAt, data.paid_at) || undefined,
      paid_at: stringValue(data.paidAt, data.paid_at) || undefined,
      cancelledAt: stringValue(data.cancelledAt, data.cancelled_at) || undefined,
      cancelled_at: stringValue(data.cancelledAt, data.cancelled_at) || undefined,
      shippedAt: stringValue(data.shippedAt, data.shipped_at) || undefined,
      shipped_at: stringValue(data.shippedAt, data.shipped_at) || undefined,
      deliveredAt: stringValue(data.deliveredAt, data.delivered_at) || undefined,
      delivered_at: stringValue(data.deliveredAt, data.delivered_at) || undefined,
      updatedAt: dateValue(data.updatedAt, data.updated_at, createdAt),
      updated_at: dateValue(data.updatedAt, data.updated_at, createdAt),
      deletedAt: stringValue(data.deletedAt, data.deleted_at) || undefined,
    };
  }

  private normalizeItems(tenantId: string, orderId: string, items: Array<Partial<OrderItemRecord>>, timestamp: string): OrderItemRecord[] {
    return items.map((item, index) => {
      const raw = item as Partial<OrderItemRecord> & Record<string, unknown>;
      const quantity = numberValue(raw.quantity);
      const unitPrice = numberValue(raw.unitPrice, raw.unit_price, raw.price);
      const discountTotal = numberValue(raw.discountTotal, raw.discount_total);
      const taxTotal = numberValue(raw.taxTotal, raw.tax_total);
      const totalPrice = Math.max(0, quantity * unitPrice - discountTotal + taxTotal);
      return {
        id: stringValue(raw.id) || `${orderId}_item_${index + 1}`,
        tenantId,
        orderId,
        productId: stringValue(raw.productId, raw.product_id),
        variantId: stringValue(raw.variantId, raw.variant_id) || undefined,
        sku: stringValue(raw.sku),
        name: stringValue(raw.name, raw.productName) || stringValue(raw.sku) || 'Produto sem nome',
        productSnapshot: recordValue(raw.productSnapshot || raw.product_snapshot_json),
        quantity,
        unitPrice,
        discountTotal,
        taxTotal,
        totalPrice: Number(totalPrice.toFixed(2)),
        costPrice: raw.costPrice === null ? null : numberValue(raw.costPrice, raw.cost_price) || null,
        stockReservedQuantity: numberValue(raw.stockReservedQuantity, raw.stock_reserved_quantity),
        stockDecreasedQuantity: numberValue(raw.stockDecreasedQuantity, raw.stock_decreased_quantity),
        ncm: stringValue(raw.ncm) || undefined,
        cfop: stringValue(raw.cfop) || undefined,
        cest: stringValue(raw.cest) || undefined,
        taxOrigin: stringValue(raw.taxOrigin, raw.tax_origin) || undefined,
        imageUrl: stringValue(raw.imageUrl, raw.image_url) || undefined,
        createdAt: dateValue(raw.createdAt, raw.created_at, timestamp),
        updatedAt: timestamp,
      };
    });
  }

  private maskOrder(order: OrderRecord, permissions: OrderPermissions): OrderRecord {
    const customer = recordValue(order.customerSnapshot || order.customer);
    const maskedCustomer = permissions.canViewSensitive
      ? customer
      : {
          ...customer,
          email: maskEmail(stringValue(customer.email)),
          phone: maskPhone(stringValue(customer.phone)),
          document: maskDocument(stringValue(customer.document, customer.taxId, customer.cpfCnpj, customer.documentNumber)),
          taxId: maskDocument(stringValue(customer.taxId)),
          cpfCnpj: maskDocument(stringValue(customer.cpfCnpj)),
          documentNumber: maskDocument(stringValue(customer.documentNumber)),
        };
    const items = permissions.canViewCost ? order.items : order.items.map((item) => ({ ...item, costPrice: null }));
    return {
      ...order,
      customerSnapshot: maskedCustomer,
      customer_snapshot_json: maskedCustomer,
      customer: maskedCustomer,
      items,
    };
  }

  private matchesFilters(order: OrderRecord, filters: OrderListFilters): boolean {
    if (order.deletedAt) return false;
    if (!dateInRange(order.createdAt, filters.createdFrom, filters.createdTo)) return false;
    if (!dateInRange(order.paidAt, filters.paidFrom, filters.paidTo)) return false;
    if (!dateInRange(order.shippedAt, filters.shippedFrom, filters.shippedTo)) return false;
    if (!dateInRange(order.deliveredAt, filters.deliveredFrom, filters.deliveredTo)) return false;
    const quickPeriod = this.quickPeriodRange(filters.period);
    if (quickPeriod && !dateInRange(order.createdAt, quickPeriod.from, quickPeriod.to)) return false;
    if (filters.status && order.status !== filters.status) return false;
    if (filters.paymentStatus && order.paymentStatus !== filters.paymentStatus) return false;
    if (filters.fiscalStatus && order.fiscalStatus !== filters.fiscalStatus) return false;
    if (filters.stockStatus && order.stockStatus !== filters.stockStatus) return false;
    if (filters.shippingStatus && order.shippingStatus !== filters.shippingStatus) return false;
    if (filters.channel && normalizeText(order.channel) !== normalizeText(filters.channel)) return false;
    if (filters.marketplace && normalizeText(order.marketplace) !== normalizeText(filters.marketplace)) return false;
    if (filters.paymentMethod && normalizeText(order.paymentMethod) !== normalizeText(filters.paymentMethod)) return false;
    if (filters.customerId && order.customerId !== filters.customerId) return false;
    if (filters.productId && !order.items.some((item) => item.productId === filters.productId)) return false;
    if (filters.sku && !order.items.some((item) => normalizeText(item.sku).includes(normalizeText(filters.sku)))) return false;
    if (filters.minTotal !== undefined && order.total < Number(filters.minTotal)) return false;
    if (filters.maxTotal !== undefined && order.total > Number(filters.maxTotal)) return false;
    if (filters.hasInvoice === 'with' && !['autorizada', 'cancelada'].includes(order.fiscalStatus)) return false;
    if (filters.hasInvoice === 'without' && order.fiscalStatus !== 'pendente') return false;
    if (filters.hasInvoice === 'error' && !['rejeitada', 'erro'].includes(order.fiscalStatus)) return false;
    if (filters.stockIssue && order.stockStatus !== 'insuficiente') return false;
    if (filters.awaitingPicking && order.shippingStatus !== 'aguardando_separacao') return false;
    if (filters.awaitingShipping && order.shippingStatus !== 'pronto_para_envio') return false;
    if (filters.shipped && !['enviado', 'em_transito', 'saiu_para_entrega'].includes(order.shippingStatus)) return false;
    if (filters.delivered && order.shippingStatus !== 'entregue') return false;
    if (filters.cancelled && order.status !== 'cancelado') return false;
    if (filters.delayed && order.shippingStatus !== 'atrasado') return false;
    if (filters.hasInternalNotes && order.internalNotesCount <= 0) return false;
    if (filters.imported && !order.externalOrderId) return false;
    if (filters.manual && order.source !== 'cadastro_manual' && order.channel !== 'manual') return false;
    const query = normalizeText(filters.search);
    if (query && !this.searchHaystack(order).includes(query)) return false;
    return true;
  }

  private searchHaystack(order: OrderRecord): string {
    const customer = recordValue(order.customerSnapshot || order.customer);
    return [
      order.id,
      order.orderNumber,
      order.customerId,
      customer.name,
      customer.email,
      customer.phone,
      customer.document,
      customer.taxId,
      order.externalOrderId,
      order.marketplace,
      order.channel,
      order.items.map((item) => `${item.productId} ${item.sku} ${item.name}`).join(' '),
    ]
      .map(normalizeText)
      .join(' ');
  }

  private quickPeriodRange(period?: string): { from: string; to: string } | null {
    if (!period) return null;
    const today = new Date();
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    if (period === 'today') return { from: startOfDay(today).toISOString(), to: endOfDay(today).toISOString() };
    if (period === 'yesterday') {
      const date = new Date(today);
      date.setDate(today.getDate() - 1);
      return { from: startOfDay(date).toISOString(), to: endOfDay(date).toISOString() };
    }
    if (['last7', 'last15', 'last30'].includes(period)) {
      const days = period === 'last7' ? 7 : period === 'last15' ? 15 : 30;
      const from = new Date(today);
      from.setDate(today.getDate() - days + 1);
      return { from: startOfDay(from).toISOString(), to: endOfDay(today).toISOString() };
    }
    if (period === 'thisMonth') {
      return { from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(), to: endOfDay(today).toISOString() };
    }
    if (period === 'lastMonth') {
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString(),
        to: new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999).toISOString(),
      };
    }
    return null;
  }

  private buildSegments(orders: OrderRecord[]): Record<string, number> {
    return orders.reduce(
      (segments, order) => {
        segments.total += 1;
        segments[order.status] = (segments[order.status] || 0) + 1;
        segments[`payment_${order.paymentStatus}`] = (segments[`payment_${order.paymentStatus}`] || 0) + 1;
        segments[`fiscal_${order.fiscalStatus}`] = (segments[`fiscal_${order.fiscalStatus}`] || 0) + 1;
        segments[`stock_${order.stockStatus}`] = (segments[`stock_${order.stockStatus}`] || 0) + 1;
        segments[`shipping_${order.shippingStatus}`] = (segments[`shipping_${order.shippingStatus}`] || 0) + 1;
        return segments;
      },
      { total: 0 } as Record<string, number>
    );
  }

  private buildListAlerts(orders: OrderRecord[]): OrderListResult['alerts'] {
    return orders.flatMap((order) => {
      const alerts: OrderListResult['alerts'] = [];
      if (order.paymentStatus === 'aprovado' && order.stockStatus === 'nao_verificado') {
        alerts.push({ type: 'estoque_nao_verificado', severity: 'alta', orderId: order.id, description: `Pedido ${order.orderNumber} pago sem verificacao de estoque.` });
      }
      if (order.stockStatus === 'insuficiente') {
        alerts.push({ type: 'estoque_insuficiente', severity: 'critica', orderId: order.id, description: `Pedido ${order.orderNumber} com estoque insuficiente.` });
      }
      if (['rejeitada', 'erro'].includes(order.fiscalStatus)) {
        alerts.push({ type: 'falha_fiscal', severity: 'critica', orderId: order.id, description: `Pedido ${order.orderNumber} com erro fiscal.` });
      }
      if (order.shippingStatus === 'atrasado') {
        alerts.push({ type: 'envio_atrasado', severity: 'alta', orderId: order.id, description: `Pedido ${order.orderNumber} atrasado.` });
      }
      return alerts;
    });
  }

  private buildDetailAlerts(order: OrderRecord, stock: OrderStockCheck, invoice: Record<string, unknown> | null): OrderDetails['alerts'] {
    const alerts: OrderDetails['alerts'] = [];
    if (order.paymentStatus === 'pendente') alerts.push({ type: 'pagamento_pendente', severity: 'media', description: 'Pagamento ainda pendente.', recommendation: 'Consultar status ou confirmar manualmente com permissao.' });
    if (!stock.available) alerts.push({ type: 'estoque_insuficiente', severity: 'critica', description: 'Um ou mais itens nao possuem estoque suficiente.', recommendation: 'Reservar parcialmente, ajustar estoque ou revisar itens.' });
    if (order.paymentStatus === 'aprovado' && order.fiscalStatus === 'pendente') alerts.push({ type: 'nota_pendente', severity: 'media', description: 'Pedido pago aguardando nota fiscal.', recommendation: 'Emitir nota fiscal quando a configuracao fiscal estiver completa.' });
    if (invoice && ['rejeitada', 'erro'].includes(String(invoice.status || invoice.fiscalStatus || ''))) alerts.push({ type: 'nota_rejeitada', severity: 'critica', description: 'Nota fiscal rejeitada ou com erro.', recommendation: 'Abrir a aba fiscal e corrigir a causa informada pelo provedor.' });
    if (!order.items.length) alerts.push({ type: 'pedido_sem_itens', severity: 'critica', description: 'Pedido sem produtos.', recommendation: 'Adicionar itens antes de confirmar o fluxo operacional.' });
    return alerts;
  }

  private async requireOrder(tenantId: string, orderId: string): Promise<OrderRecord> {
    const snapshot = await this.collection(tenantId, 'orders').doc(orderId).get();
    if (!snapshot.exists) throw new Error('Pedido nao encontrado');
    const order = this.normalizeOrder(tenantId, snapshot.id, snapshot.data() || {});
    if (order.tenantId !== tenantId && order.tenant_id !== tenantId) throw new Error('Pedido nao encontrado');
    return order;
  }

  private assertEditable(order: OrderRecord): void {
    if (order.status === 'cancelado') throw new Error('Pedido cancelado nao pode ser editado');
    if (order.fiscalStatus === 'autorizada') throw new Error('Este pedido nao pode ser editado porque ja possui nota fiscal emitida');
    if (['enviado', 'em_transito', 'saiu_para_entrega', 'entregue'].includes(order.shippingStatus)) {
      throw new Error('Pedido enviado possui edicao restrita');
    }
  }

  private async patchOrderStatus(
    tenantId: string,
    current: OrderRecord,
    patch: {
      status?: OrderStatus;
      paymentStatus?: PaymentStatus;
      fiscalStatus?: OrderFiscalStatus;
      stockStatus?: OrderStockStatus;
      shippingStatus?: ShippingStatus;
      paidAt?: string;
      cancelledAt?: string;
      shippedAt?: string;
      deliveredAt?: string;
      paidTotal?: number;
      refundedTotal?: number;
    },
    userId: string
  ): Promise<OrderRecord> {
    const paymentStatus = patch.paymentStatus || current.paymentStatus;
    const fiscalStatus = patch.fiscalStatus || current.fiscalStatus;
    const stockStatus = patch.stockStatus || current.stockStatus;
    const shippingStatus = patch.shippingStatus || current.shippingStatus;
    const status = patch.status || deriveOrderStatus({ paymentStatus, stockStatus, fiscalStatus, shippingStatus });
    const totals = calculateOrderTotals({
      items: current.items,
      discountTotal: current.discountTotal,
      shippingTotal: current.shippingTotal,
      taxTotal: current.taxTotal,
      feeTotal: current.feeTotal,
      paidTotal: patch.paidTotal ?? current.paidTotal,
      refundedTotal: patch.refundedTotal ?? current.refundedTotal,
    });
    const updated: OrderRecord = {
      ...current,
      status,
      paymentStatus,
      payment_status: paymentStatus,
      fiscalStatus,
      fiscal_status: fiscalStatus,
      stockStatus,
      stock_status: stockStatus,
      shippingStatus,
      shipping_status: shippingStatus,
      paidTotal: totals.paidTotal,
      paid_total: totals.paidTotal,
      refundedTotal: totals.refundedTotal,
      refunded_total: totals.refundedTotal,
      netTotal: totals.netTotal,
      net_total: totals.netTotal,
      paidAt: patch.paidAt || current.paidAt,
      paid_at: patch.paidAt || current.paidAt,
      cancelledAt: patch.cancelledAt || current.cancelledAt,
      cancelled_at: patch.cancelledAt || current.cancelledAt,
      shippedAt: patch.shippedAt || current.shippedAt || (shippingStatus === 'enviado' ? now() : undefined),
      shipped_at: patch.shippedAt || current.shippedAt || (shippingStatus === 'enviado' ? now() : undefined),
      deliveredAt: patch.deliveredAt || current.deliveredAt || (shippingStatus === 'entregue' ? now() : undefined),
      delivered_at: patch.deliveredAt || current.deliveredAt || (shippingStatus === 'entregue' ? now() : undefined),
      updatedBy: userId,
      updatedAt: now(),
      updated_at: now(),
    };
    await this.collection(tenantId, 'orders').doc(current.id).set(updated as unknown as Record<string, unknown>, { merge: true });
    return updated;
  }

  private async buildCustomerSnapshot(tenantId: string, customerId?: string, input?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (customerId) {
      const snapshot = await this.collection(tenantId, 'customers').doc(customerId).get();
      if (snapshot.exists) {
        const data = snapshot.data() || {};
        return {
          id: snapshot.id,
          name: stringValue(data.name, data.fullName, data.razaoSocial),
          email: stringValue(data.email),
          phone: stringValue(data.phone, data.whatsapp),
          document: stringValue(data.document, data.taxId, data.cpfCnpj, data.documentNumber),
          city: stringValue(data.city),
          state: stringValue(data.state),
          status: stringValue(data.status),
          address: recordValue(data.address),
        };
      }
    }
    const customer = input || {};
    return {
      name: stringValue(customer.name, customer.fullName, customer.razaoSocial),
      email: stringValue(customer.email),
      phone: stringValue(customer.phone, customer.whatsapp),
      document: stringValue(customer.document, customer.taxId, customer.cpfCnpj, customer.documentNumber),
      city: stringValue(customer.city),
      state: stringValue(customer.state),
      address: recordValue(customer.address),
    };
  }

  private async getCustomerForOrder(tenantId: string, order: OrderRecord, permissions: OrderPermissions): Promise<Record<string, unknown> | null> {
    const customerId = order.customerId;
    if (!customerId) return this.maskOrder(order, permissions).customerSnapshot || null;
    const snapshot = await this.collection(tenantId, 'customers').doc(customerId).get();
    const customer = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : order.customerSnapshot;
    if (!customer) return null;
    return permissions.canViewSensitive
      ? customer
      : {
          ...customer,
          email: maskEmail(stringValue((customer as Record<string, unknown>).email)),
          phone: maskPhone(stringValue((customer as Record<string, unknown>).phone)),
          document: maskDocument(stringValue((customer as Record<string, unknown>).document, (customer as Record<string, unknown>).taxId, (customer as Record<string, unknown>).cpfCnpj)),
        };
  }

  private async persistItems(tenantId: string, orderId: string, items: OrderItemRecord[]): Promise<void> {
    const batch = this.firestore().batch();
    const existing = await this.collection(tenantId, 'order_items').where('orderId', '==', orderId).limit(200).get();
    existing.docs.forEach((doc) => batch.delete(doc.ref));
    items.forEach((item) => batch.set(this.collection(tenantId, 'order_items').doc(item.id), item as unknown as Record<string, unknown>, { merge: false }));
    await batch.commit();
  }

  private async listChildren<T>(tenantId: string, collection: string, orderId: string, limit = 100): Promise<T[]> {
    const snapshot = await this.collection(tenantId, collection)
      .where('orderId', '==', orderId)
      .limit(limit)
      .get()
      .catch(() => this.collection(tenantId, collection).limit(limit).get());
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as unknown as T & { createdAt?: string; created_at?: string; eventDate?: string }))
      .filter((item) => (item as Record<string, unknown>).orderId === orderId || (item as Record<string, unknown>).order_id === orderId)
      .sort((left, right) => stringValue(right.createdAt, right.created_at, right.eventDate).localeCompare(stringValue(left.createdAt, left.created_at, left.eventDate))) as T[];
  }

  private async requireChild<T>(tenantId: string, collection: string, orderId: string, id: string): Promise<T> {
    const snapshot = await this.collection(tenantId, collection).doc(id).get();
    if (!snapshot.exists) throw new Error('Registro nao encontrado');
    const data = { id: snapshot.id, ...snapshot.data() } as unknown as T & { orderId?: string };
    if (data.orderId !== orderId) throw new Error('Registro nao encontrado');
    return data;
  }

  private async getInvoice(tenantId: string, orderId: string): Promise<Record<string, unknown> | null> {
    const snapshot = await this.collection(tenantId, 'invoices').where('orderId', '==', orderId).limit(1).get();
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }

  private async listTrackingEvents(tenantId: string, orderId: string, shipments: OrderShipment[]): Promise<OrderTrackingEvent[]> {
    const events = await this.listChildren<OrderTrackingEvent>(tenantId, 'order_tracking_events', orderId, 200);
    const shipmentIds = new Set(shipments.map((shipment) => shipment.id));
    return events.filter((event) => event.orderId === orderId || shipmentIds.has(event.shipmentId));
  }

  private buildTrackingEvent(tenantId: string, orderId: string, shipmentId: string, status: string, description?: string, location?: string): OrderTrackingEvent {
    return {
      id: randomId('track'),
      tenantId,
      orderId,
      shipmentId,
      status,
      description,
      location,
      eventDate: now(),
      createdAt: now(),
    };
  }

  private emptyStockCheck(tenantId: string, orderId: string): OrderStockCheck {
    return { tenantId, orderId, available: true, items: [] };
  }

  private async stockCheckItem(tenantId: string, item: OrderItemRecord): Promise<StockCheckItem> {
    if (!item.productId) {
      return {
        productId: '',
        variantId: item.variantId,
        sku: item.sku,
        name: item.name,
        requested: item.quantity,
        available: 0,
        reserved: 0,
        minimumStock: 0,
        manageStock: false,
        ok: true,
      };
    }
    const balanceSnapshot = await this.collection(tenantId, 'inventory_balances')
      .where('productId', '==', item.productId)
      .limit(100)
      .get()
      .catch(() => this.collection(tenantId, 'inventory_balances').limit(100).get());
    const balances = balanceSnapshot.docs
      .map((doc) => doc.data())
      .filter((balance) => stringValue(balance.productId, balance.product_id) === item.productId)
      .filter((balance) => !item.variantId || stringValue(balance.variantId, balance.variant_id) === item.variantId);
    const available = balances.reduce((sum, balance) => sum + numberValue(balance.availableQuantity, balance.available_quantity, numberValue(balance.stockQuantity, balance.stock_quantity) - numberValue(balance.reservedQuantity, balance.reserved_quantity) - numberValue(balance.blockedQuantity, balance.blocked_quantity)), 0);
    const reserved = balances.reduce((sum, balance) => sum + numberValue(balance.reservedQuantity, balance.reserved_quantity), 0);
    const minimumStock = balances.reduce((sum, balance) => sum + numberValue(balance.minimumStock, balance.minimum_stock), 0);
    return {
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      name: item.name,
      requested: item.quantity,
      available,
      reserved,
      minimumStock,
      manageStock: true,
      ok: available >= item.quantity,
    };
  }

  private async runStockOperation(
    tenantId: string,
    order: OrderRecord,
    operation: 'reserve' | 'release' | 'decrease' | 'increase',
    reason: string,
    user: AdminSessionUser,
    meta: RequestMeta,
    idempotencySeed?: string
  ): Promise<void> {
    for (const item of order.items) {
      if (!item.productId) continue;
      await this.productCatalog.changeStock(
        tenantId,
        item.productId,
        operation,
        {
          variantId: item.variantId,
          quantity: item.quantity,
          reason,
          origin: 'pedido',
          orderId: order.id,
          referenceId: order.orderNumber,
          idempotencyKey: `${idempotencySeed || operation}_${order.id}_${item.id}`,
          notes: `Pedido ${order.orderNumber}`,
        },
        user,
        meta
      );
    }
  }

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const number = `PD-${stamp}-${suffix}`;
    const existing = await this.collection(tenantId, 'orders').where('orderNumber', '==', number).limit(1).get();
    return existing.empty ? number : `PD-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  private async assertExternalOrderUnique(tenantId: string, marketplace: string, externalOrderId: string): Promise<void> {
    const snapshot = await this.collection(tenantId, 'orders')
      .where('marketplace', '==', marketplace)
      .where('externalOrderId', '==', externalOrderId)
      .limit(1)
      .get();
    if (!snapshot.empty) throw new Error('Pedido externo duplicado para este marketplace');
  }

  private async findIdempotentOrder(tenantId: string, operation: string, idempotencyKey: string): Promise<OrderRecord | null> {
    const snapshot = await this.collection(tenantId, 'order_idempotency_keys').doc(`${operation}_${idempotencyKey}`).get();
    const orderId = snapshot.exists ? stringValue(snapshot.data()?.orderId) : '';
    return orderId ? this.requireOrder(tenantId, orderId) : null;
  }

  private async saveIdempotency(tenantId: string, orderId: string, operation: string, idempotencyKey: string): Promise<void> {
    const timestamp = now();
    await this.collection(tenantId, 'order_idempotency_keys').doc(`${operation}_${idempotencyKey}`).set({
      id: `${operation}_${idempotencyKey}`,
      tenantId,
      orderId,
      operation,
      idempotencyKey,
      status: 'completed',
      createdAt: timestamp,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { merge: true });
  }

  private async recordHistory(
    tenantId: string,
    orderId: string,
    user: AdminSessionUser,
    action: string,
    description: string,
    before: unknown,
    after: unknown,
    meta: RequestMeta
  ): Promise<void> {
    const entry: OrderHistoryEntry = {
      id: randomId('hist'),
      tenantId,
      orderId,
      actorType: 'user',
      userId: user.id,
      action,
      description,
      oldStatus: recordValue(before).status as string | undefined,
      newStatus: recordValue(after).status as string | undefined,
      beforeDataMasked: this.sanitizeForHistory(before),
      afterDataMasked: this.sanitizeForHistory(after),
      metadata: { ipAddress: maskIp(meta.ipAddress), userAgent: Array.isArray(meta.userAgent) ? meta.userAgent.join(', ') : meta.userAgent },
      correlationId: randomId('corr'),
      createdAt: now(),
    };
    await this.collection(tenantId, 'order_history').doc(entry.id).set(entry as unknown as Record<string, unknown>, { merge: false });
  }

  private sanitizeForHistory(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const data = { ...(value as Record<string, unknown>) };
    delete data.items;
    const customer = recordValue(data.customerSnapshot || data.customer);
    if (Object.keys(customer).length) {
      data.customerSnapshot = {
        ...customer,
        email: maskEmail(stringValue(customer.email)),
        phone: maskPhone(stringValue(customer.phone)),
        document: maskDocument(stringValue(customer.document, customer.taxId, customer.cpfCnpj)),
      };
    }
    return data;
  }

  private async recordAudit(
    tenantId: string,
    user: AdminSessionUser,
    action: string,
    operation: 'create' | 'update' | 'delete' | 'view' | 'export',
    severity: 'info' | 'notice' | 'warning' | 'error' | 'critical',
    outcome: 'success' | 'failure' | 'denied' | 'partial',
    resource: { id: string; orderNumber?: string },
    before: unknown,
    after: unknown,
    meta: RequestMeta
  ): Promise<void> {
    await this.audit.record({
      tenantId,
      actor: user,
      category: action.startsWith('payments.') ? 'payments' : action.startsWith('inventory.') ? 'inventory' : 'orders',
      action,
      operation,
      severity,
      outcome,
      module: action.startsWith('payments.') ? 'payments' : action.startsWith('inventory.') ? 'inventory' : 'orders',
      description: `Evento de pedido: ${action}`,
      resource: {
        type: 'order',
        id: resource.id,
        label: resource.orderNumber || resource.id,
      },
      before: before as Record<string, unknown> | undefined,
      after: after as Record<string, unknown> | undefined,
      ipAddress: meta.ipAddress,
      userAgent: Array.isArray(meta.userAgent) ? meta.userAgent.join(', ') : meta.userAgent,
      sensitive: action.includes('sensitive') || action.includes('exported'),
      exportEvent: operation === 'export',
    });
  }
}
