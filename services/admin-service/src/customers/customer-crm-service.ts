import type * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { AdminOrder, AdminSessionUser, PaginatedResult, PaginationOptions } from '../types';
import { getFirestore, initializeFirestore } from '../firebase';
import {
  CustomerAddress,
  CustomerAuditLog,
  CustomerConsent,
  CustomerContact,
  CustomerCrmRecord,
  CustomerDetails,
  CustomerFinancialSummary,
  CustomerListFilters,
  CustomerListResult,
  CustomerNote,
  CustomerPermissions,
  CustomerPrivacyRequest,
  CustomerProductSummary,
  CustomerSummary,
  CustomerTag,
  RiskStatus,
} from './types';

const now = (): string => new Date().toISOString();
const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const validPaidStatuses = new Set(['paid', 'pago', 'approved', 'aprovado', 'completed', 'concluido', 'captured']);
const validOrderStatuses = new Set(['completed', 'processing', 'paid', 'pago', 'aprovado', 'approved']);

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
  const area = digits.slice(0, 2);
  const suffix = digits.slice(-4);
  return area ? `(${area}) *****-${suffix}` : `*****-${suffix}`;
}

export function maskDocument(document?: string): string {
  const digits = onlyDigits(document);
  if (digits.length === 11) {
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  }
  if (digits.length === 14) {
    return `**.***.***/${digits.slice(8, 12)}-**`;
  }
  return digits ? '***' : '';
}

function safeValue(value?: unknown): string {
  const text = String(value || '');
  if (text.includes('@')) return maskEmail(text);
  const digits = onlyDigits(text);
  if (digits.length === 11 || digits.length === 14) return maskDocument(text);
  if (digits.length >= 8) return maskPhone(text);
  return text.slice(0, 80);
}

function isPaidOrder(order: AdminOrder): boolean {
  return validPaidStatuses.has(String(order.paymentStatus || order.status || '').toLowerCase());
}

function isValidOrder(order: AdminOrder): boolean {
  return validOrderStatuses.has(String(order.paymentStatus || order.status || '').toLowerCase());
}

function getOrderTotal(order: AdminOrder): number {
  return Number(order.total || 0);
}

function getCustomerDocument(customer: Partial<CustomerCrmRecord>): string {
  return String(
    customer.documentNumber ||
      customer.document_number ||
      customer.document ||
      customer.taxId ||
      customer.cpfCnpj ||
      ''
  );
}

function getCustomerType(customer: Partial<CustomerCrmRecord>): 'pf' | 'pj' {
  const explicit = customer.customerType || customer.customer_type;
  if (explicit === 'pf' || explicit === 'pj') return explicit;
  return onlyDigits(getCustomerDocument(customer)).length === 14 ? 'pj' : 'pf';
}

function getCustomerStatus(customer: Partial<CustomerCrmRecord>, summary?: CustomerSummary): string {
  if (customer.status) return customer.status;
  if (customer.riskStatus === 'bloqueado' || customer.risk_status === 'bloqueado') return 'bloqueado';
  const totalOrders = summary?.totalOrders ?? Number(customer.totalOrders || 0);
  const totalSpent = summary?.totalSpent ?? Number(customer.totalSpent || 0);
  const lastOrderAt = summary?.lastOrderAt || customer.lastOrderAt || customer.last_order_at;
  if (totalSpent >= 5000 || totalOrders >= 10) return 'vip';
  if (totalOrders > 1) return 'recorrente';
  if (totalOrders === 1) return 'novo';
  if (lastOrderAt) {
    const days = (Date.now() - new Date(lastOrderAt).getTime()) / 86400000;
    if (days > 90) return 'inativo';
  }
  return 'ativo';
}

export class CustomerCrmService {
  constructor() {
    initializeFirestore();
  }

  private firestore(): admin.firestore.Firestore {
    const firestore = getFirestore();
    if (!firestore) {
      throw new Error('Firestore is required for customer CRM persistence');
    }
    return firestore;
  }

  private collection(tenantId: string, name: string): admin.firestore.CollectionReference {
    return this.firestore().collection(`tenants/${tenantId}/admin/data/${name}`);
  }

  permissionsFor(user: AdminSessionUser): CustomerPermissions {
    const has = (permission: string) => user.role === 'admin' || Boolean(user.permissions?.includes(permission));
    return {
      canViewSensitive: has('visualizar_dados_sensiveis_cliente'),
      canExport: has('exportar_clientes'),
      canEdit: has('editar_clientes'),
      canDelete: has('excluir_clientes'),
      canManageTags: has('gerenciar_tags_cliente'),
      canManageConsents: has('gerenciar_consentimentos_cliente'),
      canViewLogs: has('visualizar_logs_cliente'),
      canBlock: has('bloquear_cliente'),
      canManageNotes: has('gerenciar_observacoes_cliente'),
      canViewFinancial: has('visualizar_financeiro_cliente'),
    };
  }

  maskCustomer(customer: CustomerCrmRecord, permissions: CustomerPermissions): CustomerCrmRecord {
    const document = getCustomerDocument(customer);
    const masked: CustomerCrmRecord = {
      ...customer,
      tenant_id: customer.tenant_id || customer.tenantId,
      customerType: getCustomerType(customer),
      documentType: onlyDigits(document).length === 14 ? 'cnpj' : 'cpf',
      documentNumber: permissions.canViewSensitive ? document : maskDocument(document),
      document_number: permissions.canViewSensitive ? document : maskDocument(document),
      email: permissions.canViewSensitive ? customer.email : maskEmail(customer.email),
      phone: permissions.canViewSensitive ? customer.phone : maskPhone(customer.phone),
      cpfCnpj: permissions.canViewSensitive ? customer.cpfCnpj : maskDocument(customer.cpfCnpj),
      document: permissions.canViewSensitive ? customer.document : maskDocument(customer.document),
      taxId: permissions.canViewSensitive ? customer.taxId : maskDocument(customer.taxId),
      averageTicket:
        customer.averageTicket ??
        customer.average_ticket ??
        (Number(customer.totalOrders || 0) > 0 ? Number(customer.totalSpent || 0) / Number(customer.totalOrders) : 0),
      status: getCustomerStatus(customer) as CustomerCrmRecord['status'],
      riskStatus: customer.riskStatus || customer.risk_status || 'normal',
    };
    return masked;
  }

  async requireCustomer(tenantId: string, customerId: string): Promise<CustomerCrmRecord> {
    const snapshot = await this.collection(tenantId, 'customers').doc(customerId).get();
    if (!snapshot.exists) {
      throw new Error('Cliente nao encontrado');
    }
    const customer = { id: snapshot.id, ...snapshot.data() } as CustomerCrmRecord;
    if (customer.tenantId !== tenantId && customer.tenant_id !== tenantId) {
      throw new Error('Cliente nao encontrado');
    }
    return customer;
  }

  private async listCustomerOrders(tenantId: string, customerId: string, limit = 500): Promise<AdminOrder[]> {
    const snapshot = await this.collection(tenantId, 'orders')
      .where('customerId', '==', customerId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AdminOrder);
  }

  private buildSearchHaystack(customer: CustomerCrmRecord): string {
    return [
      customer.id,
      customer.name,
      customer.email,
      customer.phone,
      customer.document,
      customer.taxId,
      customer.cpfCnpj,
      customer.documentNumber,
      customer.document_number,
      customer.city,
      customer.state,
      customer.source,
      customer.acquisitionChannel,
      ...(customer.tags || []),
    ]
      .map((item) => normalizeText(item))
      .join(' ');
  }

  private matchesFilters(customer: CustomerCrmRecord, filters: CustomerListFilters): boolean {
    const search = normalizeText(filters.search);
    if (search && !this.buildSearchHaystack(customer).includes(search)) return false;
    if (filters.status && getCustomerStatus(customer) !== filters.status) return false;
    if (filters.customerType && getCustomerType(customer) !== filters.customerType) return false;
    if (filters.city && normalizeText(customer.city) !== normalizeText(filters.city)) return false;
    if (filters.state && normalizeText(customer.state) !== normalizeText(filters.state)) return false;
    if (filters.source && normalizeText(customer.source || customer.origin) !== normalizeText(filters.source)) return false;
    if (
      filters.acquisitionChannel &&
      normalizeText(customer.acquisitionChannel || customer.acquisition_channel) !== normalizeText(filters.acquisitionChannel)
    ) {
      return false;
    }
    if (filters.tag && !(customer.tags || []).map(normalizeText).includes(normalizeText(filters.tag))) return false;
    if (filters.marketingConsent === 'with' && !customer.acceptsEmailMarketing && !customer.acceptsWhatsappMarketing) return false;
    if (filters.marketingConsent === 'without' && (customer.acceptsEmailMarketing || customer.acceptsWhatsappMarketing)) return false;
    const totalOrders = Number(customer.totalOrders || 0);
    const totalSpent = Number(customer.totalSpent || 0);
    if (filters.hasOrders === 'with' && totalOrders <= 0) return false;
    if (filters.hasOrders === 'without' && totalOrders > 0) return false;
    if (filters.minSpent !== undefined && totalSpent < filters.minSpent) return false;
    if (filters.maxSpent !== undefined && totalSpent > filters.maxSpent) return false;
    if (filters.minOrders !== undefined && totalOrders < filters.minOrders) return false;
    if (filters.maxOrders !== undefined && totalOrders > filters.maxOrders) return false;
    if (filters.createdFrom && String(customer.createdAt || '') < filters.createdFrom) return false;
    if (filters.createdTo && String(customer.createdAt || '') > filters.createdTo) return false;
    const lastOrderAt = String(customer.lastOrderAt || customer.last_order_at || '');
    if (filters.lastOrderFrom && lastOrderAt < filters.lastOrderFrom) return false;
    if (filters.lastOrderTo && lastOrderAt > filters.lastOrderTo) return false;
    return true;
  }

  async listCustomers(
    tenantId: string,
    options: PaginationOptions,
    filters: CustomerListFilters,
    permissions: CustomerPermissions
  ): Promise<CustomerListResult> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    let query: admin.firestore.Query = this.collection(tenantId, 'customers');

    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.customerType) query = query.where('customerType', '==', filters.customerType);
    if (filters.state) query = query.where('state', '==', filters.state);
    if (filters.source) query = query.where('source', '==', filters.source);

    const snapshot = await query.orderBy('createdAt', 'desc').limit(500).get();
    const all = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as CustomerCrmRecord)
      .filter((customer) => !customer.deletedAt && !customer.deleted_at)
      .filter((customer) => this.matchesFilters(customer, filters));
    const start = (page - 1) * limit;
    const items = all.slice(start, start + limit).map((customer) => this.maskCustomer(customer, permissions));

    const segments = all.reduce(
      (acc, customer) => {
        acc[getCustomerStatus(customer)] = (acc[getCustomerStatus(customer)] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      items,
      filters,
      segments,
      pagination: {
        page,
        limit,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / limit)),
        hasNextPage: start + limit < all.length,
        hasPreviousPage: page > 1,
      },
    };
  }

  async createCustomer(
    tenantId: string,
    input: Partial<CustomerCrmRecord>,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<CustomerCrmRecord> {
    await this.assertUniqueCustomer(tenantId, input);
    const id = randomId('cus');
    const document = getCustomerDocument(input);
    const customer: CustomerCrmRecord = {
      ...(input as CustomerCrmRecord),
      id,
      tenantId,
      tenant_id: tenantId,
      customerType: getCustomerType(input),
      documentType: onlyDigits(document).length === 14 ? 'cnpj' : 'cpf',
      documentNumber: document,
      document_number: document,
      emailNormalized: normalizeText(input.email),
      phoneNormalized: onlyDigits(input.phone),
      documentNormalized: onlyDigits(document),
      status: input.status || 'novo',
      riskStatus: input.riskStatus || 'normal',
      totalOrders: Number(input.totalOrders || 0),
      totalSpent: Number(input.totalSpent || 0),
      averageTicket: Number(input.averageTicket || 0),
      tags: input.tags || [],
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now(),
      updatedAt: now(),
    };

    await this.collection(tenantId, 'customers').doc(id).set(customer, { merge: true });
    await this.addAuditLog(tenantId, id, user.id, 'cliente.criado', requestMeta);
    return customer;
  }

  async updateCustomer(
    tenantId: string,
    customerId: string,
    updates: Partial<CustomerCrmRecord>,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<CustomerCrmRecord> {
    const current = await this.requireCustomer(tenantId, customerId);
    await this.assertUniqueCustomer(tenantId, updates, customerId);
    const document = getCustomerDocument(updates) || getCustomerDocument(current);
    const updated: CustomerCrmRecord = {
      ...current,
      ...updates,
      id: customerId,
      tenantId,
      tenant_id: tenantId,
      documentNumber: document,
      document_number: document,
      emailNormalized: normalizeText(updates.email || current.email),
      phoneNormalized: onlyDigits(updates.phone || current.phone),
      documentNormalized: onlyDigits(document),
      customerType: updates.customerType || updates.customer_type || getCustomerType({ ...current, ...updates }),
      documentType: onlyDigits(document).length === 14 ? 'cnpj' : 'cpf',
      updatedBy: user.id,
      updatedAt: now(),
    };

    await this.collection(tenantId, 'customers').doc(customerId).set(updated, { merge: true });
    for (const field of ['email', 'phone', 'documentNumber', 'document_number', 'document', 'taxId', 'cpfCnpj', 'status']) {
      if ((updates as Record<string, unknown>)[field] !== undefined) {
        await this.addAuditLog(tenantId, customerId, user.id, `cliente.${field}.alterado`, requestMeta, {
          fieldChanged: field,
          oldValueMasked: safeValue((current as unknown as Record<string, unknown>)[field]),
          newValueMasked: safeValue((updated as unknown as Record<string, unknown>)[field]),
        });
      }
    }
    return updated;
  }

  async softDeleteCustomer(
    tenantId: string,
    customerId: string,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await this.requireCustomer(tenantId, customerId);
    await this.collection(tenantId, 'customers').doc(customerId).set(
      {
        status: 'descadastrado',
        deletedAt: now(),
        deleted_at: now(),
        updatedBy: user.id,
        updatedAt: now(),
      },
      { merge: true }
    );
    await this.addAuditLog(tenantId, customerId, user.id, 'cliente.excluido', requestMeta);
  }

  async assertUniqueCustomer(
    tenantId: string,
    input: Partial<CustomerCrmRecord>,
    ignoreCustomerId?: string
  ): Promise<void> {
    const email = normalizeText(input.email);
    const document = onlyDigits(getCustomerDocument(input));
    if (email) {
      const snapshot = await this.collection(tenantId, 'customers').where('emailNormalized', '==', email).limit(1).get();
      if (!snapshot.empty && snapshot.docs[0].id !== ignoreCustomerId) throw new Error('E-mail ja cadastrado neste tenant');
    }
    if (document) {
      const snapshot = await this.collection(tenantId, 'customers').where('documentNormalized', '==', document).limit(1).get();
      if (!snapshot.empty && snapshot.docs[0].id !== ignoreCustomerId) throw new Error('Documento ja cadastrado neste tenant');
    }
  }

  private async syncCustomerMetrics(tenantId: string, customerId: string, summary: CustomerSummary): Promise<void> {
    await this.collection(tenantId, 'customers').doc(customerId).set(
      {
        totalOrders: summary.totalOrders,
        totalSpent: summary.totalSpent,
        averageTicket: summary.averageTicket,
        average_ticket: summary.averageTicket,
        firstOrderAt: summary.firstOrderAt || null,
        first_order_at: summary.firstOrderAt || null,
        lastOrderAt: summary.lastOrderAt || null,
        last_order_at: summary.lastOrderAt || null,
        updatedAt: now(),
      },
      { merge: true }
    );
  }

  async getSummary(tenantId: string, customerId: string): Promise<CustomerSummary> {
    await this.requireCustomer(tenantId, customerId);
    const orders = await this.listCustomerOrders(tenantId, customerId);
    const paid = orders.filter(isPaidOrder);
    const valid = orders.filter(isValidOrder);
    const totals = valid.map(getOrderTotal).filter((value) => Number.isFinite(value));
    const dates = valid.map((order) => order.createdAt).filter(Boolean).sort();
    const paymentCounts = new Map<string, number>();
    for (const order of valid) {
      const method = String(order.paymentMethod || '');
      if (method) paymentCounts.set(method, (paymentCounts.get(method) || 0) + 1);
    }
    const averageDaysBetweenOrders =
      dates.length > 1
        ? Math.round((new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000 / (dates.length - 1))
        : null;
    const totalSpent = totals.reduce((sum, value) => sum + value, 0);
    const summary: CustomerSummary = {
      totalOrders: orders.length,
      paidOrders: paid.length,
      pendingOrders: orders.filter((order) => String(order.paymentStatus || order.status).includes('pending')).length,
      cancelledOrders: orders.filter((order) => order.status === 'cancelled').length,
      totalSpent,
      totalPaid: paid.reduce((sum, order) => sum + getOrderTotal(order), 0),
      totalPending: orders.filter((order) => String(order.paymentStatus || order.status).includes('pending')).reduce((sum, order) => sum + getOrderTotal(order), 0),
      totalCancelled: orders.filter((order) => order.status === 'cancelled').reduce((sum, order) => sum + getOrderTotal(order), 0),
      averageTicket: paid.length ? paid.reduce((sum, order) => sum + getOrderTotal(order), 0) / paid.length : 0,
      highestOrder: totals.length ? Math.max(...totals) : 0,
      lowestOrder: totals.length ? Math.min(...totals) : 0,
      firstOrderAt: dates[0],
      lastOrderAt: dates[dates.length - 1],
      productsPurchased: valid.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0),
      cancelledOrdersCount: orders.filter((order) => order.status === 'cancelled').length,
      openOrdersCount: orders.filter((order) => ['pending', 'processing'].includes(order.status)).length,
      averageDaysBetweenOrders,
      favoritePaymentMethod: [...paymentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
      missingFields: [
        { metric: 'Reembolsos', collection: 'payments/orders', field: 'refundedAt/refundTotal' },
        { metric: 'Pagamentos recusados', collection: 'payments', field: 'status=refused' },
        { metric: 'Chargebacks', collection: 'payments', field: 'chargebackStatus' },
      ],
    };
    await this.syncCustomerMetrics(tenantId, customerId, summary);
    return summary;
  }

  async getDetails(
    tenantId: string,
    customerId: string,
    permissions: CustomerPermissions
  ): Promise<CustomerDetails> {
    const [customer, summary, addresses, contacts, notes, consents, privacyRequests, auditLogs] =
      await Promise.all([
        this.requireCustomer(tenantId, customerId),
        this.getSummary(tenantId, customerId),
        this.listChild<CustomerAddress>(tenantId, 'customer_addresses', customerId),
        this.listChild<CustomerContact>(tenantId, 'customer_contacts', customerId),
        this.listChild<CustomerNote>(tenantId, 'customer_notes', customerId),
        this.listChild<CustomerConsent>(tenantId, 'customer_consents', customerId),
        this.listChild<CustomerPrivacyRequest>(tenantId, 'customer_privacy_requests', customerId),
        permissions.canViewLogs
          ? this.listAuditLogs(tenantId, customerId, { page: 1, limit: 20 })
          : Promise.resolve({
              items: [],
              pagination: { page: 1, limit: 20, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
            }),
      ]);
    return {
      customer: this.maskCustomer(customer, permissions),
      summary,
      addresses: permissions.canViewSensitive ? addresses : addresses.map((address) => ({ ...address, street: '***', number: '***', zipcode: '***' })),
      contacts: permissions.canViewSensitive ? contacts : contacts.map((contact) => ({ ...contact, value: contact.type === 'email' ? maskEmail(contact.value) : maskPhone(contact.value) })),
      tags: customer.tags || [],
      notes: permissions.canManageNotes ? notes : [],
      consents,
      privacyRequests,
      auditLogs: auditLogs.items,
    };
  }

  async listOrders(
    tenantId: string,
    customerId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<AdminOrder>> {
    await this.requireCustomer(tenantId, customerId);
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const all = await this.listCustomerOrders(tenantId, customerId, 500);
    const start = (page - 1) * limit;
    return {
      items: all.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / limit)),
        hasNextPage: start + limit < all.length,
        hasPreviousPage: page > 1,
      },
    };
  }

  async listProducts(tenantId: string, customerId: string): Promise<CustomerProductSummary[]> {
    const orders = (await this.listCustomerOrders(tenantId, customerId)).filter(isValidOrder);
    const byProduct = new Map<string, CustomerProductSummary>();
    for (const order of orders) {
      for (const item of order.items || []) {
        const key = item.productId || item.sku || item.name || 'unknown';
        const current = byProduct.get(key) || {
          productId: item.productId,
          sku: item.sku || '',
          name: item.name || item.productId,
          quantity: 0,
          totalSpent: 0,
          orders: 0,
          lastPurchasedAt: order.createdAt,
          channel: order.marketplace,
        };
        current.quantity += Number(item.quantity || 0);
        current.totalSpent += Number(item.quantity || 0) * Number(item.price || 0);
        current.orders += 1;
        current.lastPurchasedAt = current.lastPurchasedAt && current.lastPurchasedAt > order.createdAt ? current.lastPurchasedAt : order.createdAt;
        byProduct.set(key, current);
      }
    }
    return [...byProduct.values()].sort((a, b) => b.totalSpent - a.totalSpent);
  }

  async getFinancial(tenantId: string, customerId: string): Promise<CustomerFinancialSummary> {
    const summary = await this.getSummary(tenantId, customerId);
    return {
      totalSpent: summary.totalSpent,
      totalPaid: summary.totalPaid,
      totalPending: summary.totalPending,
      totalCancelled: summary.totalCancelled,
      totalRefunded: null,
      averageTicket: summary.averageTicket,
      highestOrder: summary.highestOrder,
      lowestOrder: summary.lowestOrder,
      favoritePaymentMethod: summary.favoritePaymentMethod,
      approvedPayments: summary.paidOrders,
      refusedPayments: null,
      missingFields: summary.missingFields,
    };
  }

  async listChild<T>(tenantId: string, collection: string, customerId: string): Promise<T[]> {
    const snapshot = await this.collection(tenantId, collection)
      .where('customerId', '==', customerId)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
  }

  async upsertChild<T extends { id: string; tenantId: string; customerId: string; createdAt: string; updatedAt: string }>(
    tenantId: string,
    collection: string,
    customerId: string,
    input: Partial<T>,
    user: AdminSessionUser,
    action: string,
    requestMeta: { ipAddress?: string; userAgent?: string },
    id = input.id || randomId(collection.slice(0, 4))
  ): Promise<T> {
    await this.requireCustomer(tenantId, customerId);
    const ref = this.collection(tenantId, collection).doc(id);
    const existing = await ref.get();
    const record = {
      ...input,
      id,
      tenantId,
      tenant_id: tenantId,
      customerId,
      customer_id: customerId,
      createdAt: existing.exists ? existing.data()?.createdAt || now() : now(),
      updatedAt: now(),
    } as unknown as T;
    await ref.set(record, { merge: true });
    await this.addAuditLog(tenantId, customerId, user.id, action, requestMeta);
    return record;
  }

  async deleteChild(
    tenantId: string,
    collection: string,
    customerId: string,
    id: string,
    user: AdminSessionUser,
    action: string,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await this.requireCustomer(tenantId, customerId);
    await this.collection(tenantId, collection).doc(id).delete();
    await this.addAuditLog(tenantId, customerId, user.id, action, requestMeta);
  }

  async listTags(tenantId: string): Promise<CustomerTag[]> {
    const snapshot = await this.collection(tenantId, 'customer_tags').orderBy('name', 'asc').limit(200).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CustomerTag);
  }

  async createTag(tenantId: string, input: Partial<CustomerTag>, user: AdminSessionUser): Promise<CustomerTag> {
    const id = randomId('tag');
    const tag: CustomerTag = {
      id,
      tenantId,
      name: String(input.name || '').trim(),
      color: input.color || 'oklch(55% 0.14 220)',
      createdAt: now(),
      updatedAt: now(),
    };
    await this.collection(tenantId, 'customer_tags').doc(id).set(tag);
    const logId = randomId('log');
    await this.collection(tenantId, 'customer_audit_logs').doc(logId).set({
      id: logId,
      tenantId,
      customerId: '',
      userId: user.id,
      action: 'tag.criada',
      createdAt: now(),
    });
    return tag;
  }

  async addTag(
    tenantId: string,
    customerId: string,
    tag: string,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<CustomerCrmRecord> {
    await this.requireCustomer(tenantId, customerId);
    await this.collection(tenantId, 'customers').doc(customerId).set(
      {
        tags: FieldValue.arrayUnion(tag),
        updatedAt: now(),
      },
      { merge: true }
    );
    await this.addAuditLog(tenantId, customerId, user.id, 'tag.adicionada', requestMeta, { newValueMasked: tag });
    return this.requireCustomer(tenantId, customerId);
  }

  async removeTag(
    tenantId: string,
    customerId: string,
    tag: string,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<CustomerCrmRecord> {
    await this.requireCustomer(tenantId, customerId);
    await this.collection(tenantId, 'customers').doc(customerId).set(
      {
        tags: FieldValue.arrayRemove(tag),
        updatedAt: now(),
      },
      { merge: true }
    );
    await this.addAuditLog(tenantId, customerId, user.id, 'tag.removida', requestMeta, { oldValueMasked: tag });
    return this.requireCustomer(tenantId, customerId);
  }

  async revokeConsent(
    tenantId: string,
    customerId: string,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<CustomerConsent> {
    const consent = await this.upsertChild<CustomerConsent>(
      tenantId,
      'customer_consents',
      customerId,
      {
        channel: 'email',
        purpose: 'marketing',
        status: 'revogado',
        source: 'admin-unified-dashboard',
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        revokedAt: now(),
      } as Partial<CustomerConsent>,
      user,
      'consentimento.revogado',
      requestMeta
    );
    await this.collection(tenantId, 'customers').doc(customerId).set(
      {
        acceptsEmailMarketing: false,
        acceptsWhatsappMarketing: false,
        acceptsSmsMarketing: false,
        updatedAt: now(),
      },
      { merge: true }
    );
    return consent;
  }

  async exportCustomer(
    tenantId: string,
    customerId: string,
    permissions: CustomerPermissions,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<CustomerDetails> {
    if (!permissions.canExport) throw new Error('Permissao para exportar clientes e obrigatoria');
    const details = await this.getDetails(tenantId, customerId, { ...permissions, canViewSensitive: permissions.canViewSensitive });
    await this.addAuditLog(tenantId, customerId, user.id, 'dados.exportados', requestMeta);
    return details;
  }

  async exportCustomers(
    tenantId: string,
    filters: CustomerListFilters,
    permissions: CustomerPermissions,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<{ fileName: string; contentType: string; content: string }> {
    if (!permissions.canExport) throw new Error('Permissao para exportar clientes e obrigatoria');
    const result = await this.listCustomers(tenantId, { page: 1, limit: 100 }, filters, permissions);
    const header = ['Nome', 'Email', 'Telefone', 'Documento', 'Status', 'Cidade/UF', 'Pedidos', 'Total gasto', 'Ticket medio', 'Ultima compra', 'Tags', 'Origem'];
    const rows = result.items.map((customer) => [
      customer.name,
      customer.email,
      customer.phone || '',
      customer.documentNumber || customer.document || '',
      customer.status || '',
      [customer.city, customer.state].filter(Boolean).join('/'),
      String(customer.totalOrders || 0),
      String(customer.totalSpent || 0),
      String(customer.averageTicket || 0),
      String(customer.lastOrderAt || customer.last_order_at || ''),
      (customer.tags || []).join('|'),
      customer.source || customer.origin || '',
    ]);
    await this.addAuditLog(tenantId, '', user.id, 'clientes.exportados', requestMeta);
    return {
      fileName: `clientes-${tenantId}-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv',
      content: [header, ...rows].map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n'),
    };
  }

  async anonymizeCustomer(
    tenantId: string,
    customerId: string,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<CustomerCrmRecord> {
    await this.requireCustomer(tenantId, customerId);
    await this.collection(tenantId, 'customers').doc(customerId).set(
      {
        name: 'Cliente anonimizado',
        email: `anonimizado-${customerId}@privacy.local`,
        phone: '',
        document: '',
        taxId: '',
        cpfCnpj: '',
        documentNumber: '',
        document_number: '',
        status: 'anonimizado',
        acceptsEmailMarketing: false,
        acceptsWhatsappMarketing: false,
        acceptsSmsMarketing: false,
        updatedBy: user.id,
        updatedAt: now(),
      },
      { merge: true }
    );
    await this.addAuditLog(tenantId, customerId, user.id, 'cliente.anonimizado', requestMeta);
    return this.requireCustomer(tenantId, customerId);
  }

  async updateRiskStatus(
    tenantId: string,
    customerId: string,
    riskStatus: RiskStatus,
    reason: string | undefined,
    user: AdminSessionUser,
    requestMeta: { ipAddress?: string; userAgent?: string }
  ): Promise<CustomerCrmRecord> {
    await this.requireCustomer(tenantId, customerId);
    const status = riskStatus === 'bloqueado' ? 'bloqueado' : riskStatus === 'em_analise' ? 'em_analise' : undefined;
    await this.collection(tenantId, 'customers').doc(customerId).set(
      {
        ...(status ? { status } : {}),
        riskStatus,
        risk_status: riskStatus,
        blockedReason: reason || '',
        blocked_reason: reason || '',
        updatedBy: user.id,
        updatedAt: now(),
      },
      { merge: true }
    );
    await this.addAuditLog(tenantId, customerId, user.id, `risco.${riskStatus}`, requestMeta, {
      newValueMasked: reason || riskStatus,
    });
    return this.requireCustomer(tenantId, customerId);
  }

  async listAuditLogs(
    tenantId: string,
    customerId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<CustomerAuditLog>> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    let query: admin.firestore.Query = this.collection(tenantId, 'customer_audit_logs');
    if (customerId) query = query.where('customerId', '==', customerId);
    const snapshot = await query.orderBy('createdAt', 'desc').limit(500).get();
    const all = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CustomerAuditLog);
    const start = (page - 1) * limit;
    return {
      items: all.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / limit)),
        hasNextPage: start + limit < all.length,
        hasPreviousPage: page > 1,
      },
    };
  }

  async addAuditLog(
    tenantId: string,
    customerId: string,
    userId: string,
    action: string,
    requestMeta: { ipAddress?: string; userAgent?: string },
    extra: Partial<CustomerAuditLog> = {}
  ): Promise<void> {
    const id = randomId('calog');
    const log: CustomerAuditLog = {
      id,
      tenantId,
      customerId,
      userId,
      action,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      createdAt: now(),
      ...extra,
    };
    await this.collection(tenantId, 'customer_audit_logs').doc(id).set(log, { merge: true });
  }
}
