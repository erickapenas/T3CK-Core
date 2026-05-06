import type * as admin from 'firebase-admin';
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore, initializeFirestore } from '../firebase';
import type { AdminProduct } from '../types';
import { createFiscalProvider } from './providers';
import {
  AdminUnifiedAuditLog,
  AdminUnifiedCustomer,
  AdminUnifiedOrder,
  AdminUnifiedOrderItem,
  AdminUnifiedPermission,
  AdminUnifiedRequestContext,
  FiscalConfiguration,
  FiscalConfigurationAuditLog,
  FiscalConfigurationInput,
  FiscalInvoiceType,
  InventoryMovement,
  OrderHistoryEntry,
  PublicFiscalConfiguration,
  Shipment,
  StockCheckResult,
  StockMovementType,
  TaxDocument,
  TrackingEvent,
} from './types';
import {
  fiscalStatusFromValidation,
  getNextNumberForInvoiceType,
  getSeriesForInvoiceType,
  hashForAudit,
  isValidCpfOrCnpj,
  maskSensitiveValue,
  normalizeFiscalProvider,
  normalizeInvoiceType,
  nowIso,
  onlyDigits,
  randomId,
  sanitizeError,
} from './utils';

type FiscalCollection =
  | 'companyFiscalSettings'
  | 'fiscalConfigurationAuditLogs'
  | 'invoices'
  | 'inventoryMovements'
  | 'shipments'
  | 'trackingEvents'
  | 'orderHistory'
  | 'adminUnifiedAuditLogs'
  | 'orders'
  | 'customers'
  | 'products';

type EncryptedSecret = {
  algorithm: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
};

type SaveOptions = {
  action?: string;
};

type WebhookPayload = {
  tenantId?: string;
  orderId?: string;
  invoiceId?: string;
  shipmentId?: string;
  status?: string;
  eventId?: string;
  provider?: string;
  description?: string;
  location?: string;
  rawPayload?: Record<string, unknown>;
};

const ALL_PERMISSIONS: AdminUnifiedPermission[] = [
  'visualizar_configuracoes_fiscais',
  'editar_configuracoes_fiscais',
  'upload_certificado_fiscal',
  'validar_configuracao_fiscal',
  'alterar_ambiente_fiscal',
  'visualizar_logs_fiscais',
  'visualizar_pedidos',
  'editar_pedidos',
  'emitir_nota_fiscal',
  'cancelar_nota_fiscal',
  'visualizar_xml',
  'visualizar_danfe',
  'gerenciar_estoque',
  'atualizar_rastreio',
  'visualizar_logs',
];

const READ_ONLY_PERMISSIONS: AdminUnifiedPermission[] = [
  'visualizar_configuracoes_fiscais',
  'visualizar_pedidos',
  'visualizar_xml',
  'visualizar_danfe',
  'visualizar_logs',
];

const SENSITIVE_INPUT_KEYS = new Set([
  'certificateFileBase64',
  'certificatePassword',
  'providerApiKey',
  'providerClientId',
  'providerClientSecret',
  'nfceCsc',
  'municipalUsername',
  'municipalPassword',
]);

const collectionAliases: Record<FiscalCollection, string> = {
  companyFiscalSettings: 'company_fiscal_settings',
  fiscalConfigurationAuditLogs: 'fiscal_configuration_audit_logs',
  invoices: 'invoices',
  inventoryMovements: 'inventory_movements',
  shipments: 'shipments',
  trackingEvents: 'tracking_events',
  orderHistory: 'order_history',
  adminUnifiedAuditLogs: 'admin_unified_audit_logs',
  orders: 'orders',
  customers: 'customers',
  products: 'products',
};

function toSnakeTenant<T extends { tenantId: string }>(payload: T): T & { tenant_id: string } {
  return { ...payload, tenant_id: payload.tenantId };
}

function createSecretKey(): Buffer {
  const configured =
    process.env.FISCAL_SECRET_ENCRYPTION_KEY ||
    process.env.SECRET_ENCRYPTION_KEY ||
    process.env.ADMIN_SESSION_SECRET ||
    'dev-fiscal-secret-change-me';
  return createHash('sha256').update(configured).digest();
}

function encryptSecret(value: unknown): EncryptedSecret | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createSecretKey(), iv);
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  };
}

function decryptSecret(secret: unknown): string | undefined {
  const encrypted = secret as EncryptedSecret | undefined;
  if (!encrypted?.data || !encrypted.iv || !encrypted.tag) {
    return undefined;
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    createSecretKey(),
    Buffer.from(encrypted.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function buildIdempotencyKey(operation: string, orderId: string, supplied?: string): string {
  return supplied || `${operation}:${orderId}`;
}

function stableDocId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isPaymentApproved(order: AdminUnifiedOrder): boolean {
  const paymentStatus = normalizeStatus(order.paymentStatus || order.payment_status);
  if (!paymentStatus) {
    return normalizeStatus(order.status) === 'completed';
  }

  return ['approved', 'paid', 'pago', 'aprovado', 'completed', 'captured'].includes(paymentStatus);
}

function getCustomerDocument(order: AdminUnifiedOrder, customer?: AdminUnifiedCustomer | null): string {
  return String(
    order.customer?.document ||
      order.customer?.taxId ||
      order.customer?.cpfCnpj ||
      customer?.document ||
      customer?.taxId ||
      customer?.cpfCnpj ||
      ''
  );
}

function hasAddress(value: unknown): boolean {
  const address = value as Record<string, unknown> | undefined;
  if (!address) {
    return false;
  }

  const city = address.city || address.cidade || address.addressCity;
  const state = address.state || address.uf || address.addressState;
  const zipcode = address.zipcode || address.zipCode || address.cep || address.addressZipcode;
  const street = address.street || address.logradouro || address.addressStreet;
  return Boolean(city && state && zipcode && street);
}

function getOrderAddress(order: AdminUnifiedOrder, customer?: AdminUnifiedCustomer | null): unknown {
  return (
    order.shippingAddress ||
    order.deliveryAddress ||
    order.customer?.address ||
    customer?.address ||
    undefined
  );
}

function coerceOrderItem(item: AdminUnifiedOrderItem, product?: AdminProduct | null): AdminUnifiedOrderItem {
  return {
    ...item,
    sku: item.sku || product?.sku || item.productId,
    name: item.name || product?.name || item.productId,
    unitPrice: Number(item.unitPrice ?? item.price ?? product?.price ?? 0),
    totalPrice:
      Number(item.totalPrice ?? 0) ||
      Number(item.quantity || 0) * Number(item.unitPrice ?? item.price ?? product?.price ?? 0),
    ncm: item.ncm || item.ncmCode || product?.ncm,
    cfop: item.cfop || product?.cfop,
    cest: item.cest || product?.cest,
    taxOrigin: item.taxOrigin || product?.taxOrigin,
  };
}

export function permissionsForUser(role: string, permissions?: string[]): AdminUnifiedPermission[] {
  if (role === 'admin') {
    return ALL_PERMISSIONS;
  }

  const explicit = (permissions || []).filter((permission): permission is AdminUnifiedPermission =>
    ALL_PERMISSIONS.includes(permission as AdminUnifiedPermission)
  );

  return explicit.length > 0 ? explicit : READ_ONLY_PERMISSIONS;
}

export function assertPermission(
  context: AdminUnifiedRequestContext,
  permission: AdminUnifiedPermission
): void {
  if (!context.permissions.includes(permission)) {
    throw new Error(`permission denied: ${permission}`);
  }
}

export class FiscalService {
  constructor() {
    initializeFirestore();
  }

  private firestore(): admin.firestore.Firestore {
    const firestore = getFirestore();
    if (!firestore) {
      throw new Error('Firestore is required for admin-service persistence');
    }
    return firestore;
  }

  private collectionPath(tenantId: string, collection: FiscalCollection): string {
    return `tenants/${tenantId}/admin/data/${collection}`;
  }

  private collection<T = admin.firestore.DocumentData>(
    tenantId: string,
    collection: FiscalCollection
  ): admin.firestore.CollectionReference<T> {
    return this.firestore().collection(this.collectionPath(tenantId, collection)) as admin.firestore.CollectionReference<T>;
  }

  private async ensureTenantDocument(tenantId: string): Promise<void> {
    await this.firestore().collection('tenants').doc(tenantId).set(
      {
        id: tenantId,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
  }

  private defaultFiscalConfiguration(context: AdminUnifiedRequestContext): FiscalConfiguration {
    return {
      id: 'current',
      tenantId: context.tenantId,
      legalName: '',
      tradeName: '',
      cnpj: '',
      stateRegistration: '',
      municipalRegistration: '',
      cnae: '',
      taxRegime: '',
      taxRegimeCode: '',
      addressStreet: '',
      addressNumber: '',
      addressComplement: '',
      addressNeighborhood: '',
      addressCity: '',
      addressCityCode: '',
      addressState: '',
      addressZipcode: '',
      phone: '',
      fiscalEmail: '',
      invoiceProvider: '',
      invoiceEnvironment: 'homologacao',
      nfeEnabled: true,
      nfceEnabled: false,
      nfseEnabled: false,
      nfeSeries: '1',
      nfceSeries: '',
      nfseSeries: '',
      nextNfeNumber: 1,
      nextNfceNumber: 1,
      nextNfseNumber: 1,
      emissionModel: 'backend_provider',
      defaultCfop: '',
      defaultNcm: '',
      defaultTaxOrigin: '0',
      defaultOperationNature: 'Venda de mercadoria',
      defaultAdditionalInformation: '',
      nfceCscId: '',
      municipalProviderConfig: {},
      status: 'nao_configurado',
      validationErrors: [],
      createdBy: context.userId,
      updatedBy: context.userId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  private publicFiscalConfiguration(config: FiscalConfiguration): PublicFiscalConfiguration {
    const {
      certificateFileEncrypted,
      certificatePasswordEncrypted,
      providerApiKeyEncrypted,
      providerClientIdEncrypted,
      providerClientSecretEncrypted,
      nfceCscEncrypted,
      municipalUsernameEncrypted,
      municipalPasswordEncrypted,
      ...publicConfig
    } = config;

    return {
      ...publicConfig,
      secrets: {
        hasCertificate: Boolean(certificateFileEncrypted),
        hasCertificatePassword: Boolean(certificatePasswordEncrypted),
        hasProviderApiKey: Boolean(providerApiKeyEncrypted),
        hasProviderClientId: Boolean(providerClientIdEncrypted),
        hasProviderClientSecret: Boolean(providerClientSecretEncrypted),
        hasNfceCsc: Boolean(nfceCscEncrypted),
        hasMunicipalUsername: Boolean(municipalUsernameEncrypted),
        hasMunicipalPassword: Boolean(municipalPasswordEncrypted),
      },
    };
  }

  private async getFiscalConfigurationRaw(
    context: AdminUnifiedRequestContext
  ): Promise<FiscalConfiguration> {
    const snapshot = await this.collection<FiscalConfiguration>(
      context.tenantId,
      'companyFiscalSettings'
    )
      .doc('current')
      .get();

    if (!snapshot.exists) {
      return this.defaultFiscalConfiguration(context);
    }

    return {
      ...this.defaultFiscalConfiguration(context),
      ...snapshot.data(),
      id: snapshot.id,
      tenantId: context.tenantId,
    } as FiscalConfiguration;
  }

  async getFiscalSettings(context: AdminUnifiedRequestContext): Promise<PublicFiscalConfiguration> {
    assertPermission(context, 'visualizar_configuracoes_fiscais');
    return this.publicFiscalConfiguration(await this.getFiscalConfigurationRaw(context));
  }

  async saveFiscalSettings(
    context: AdminUnifiedRequestContext,
    input: FiscalConfigurationInput,
    options: SaveOptions = {}
  ): Promise<PublicFiscalConfiguration> {
    assertPermission(context, 'editar_configuracoes_fiscais');
    const current = await this.getFiscalConfigurationRaw(context);
    const updated: FiscalConfiguration = {
      ...current,
      ...input,
      tenantId: context.tenantId,
      invoiceProvider: input.invoiceProvider
        ? normalizeFiscalProvider(input.invoiceProvider)
        : current.invoiceProvider,
      status: current.status === 'nao_configurado' ? 'incompleto' : current.status,
      updatedBy: context.userId,
      updatedAt: nowIso(),
      createdBy: current.createdBy || context.userId,
      createdAt: current.createdAt || nowIso(),
    };

    if (input.certificateFileBase64) {
      updated.certificateFileEncrypted = encryptSecret(input.certificateFileBase64);
      updated.certificateUploadedAt = nowIso();
    }
    if (input.certificatePassword) {
      updated.certificatePasswordEncrypted = encryptSecret(input.certificatePassword);
    }
    if (input.providerApiKey) {
      updated.providerApiKeyEncrypted = encryptSecret(input.providerApiKey);
    }
    if (input.providerClientId) {
      updated.providerClientIdEncrypted = encryptSecret(input.providerClientId);
    }
    if (input.providerClientSecret) {
      updated.providerClientSecretEncrypted = encryptSecret(input.providerClientSecret);
    }
    if (input.nfceCsc) {
      updated.nfceCscEncrypted = encryptSecret(input.nfceCsc);
    }
    if (input.municipalUsername) {
      updated.municipalUsernameEncrypted = encryptSecret(input.municipalUsername);
    }
    if (input.municipalPassword) {
      updated.municipalPasswordEncrypted = encryptSecret(input.municipalPassword);
    }

    const validation = await createFiscalProvider(updated.invoiceProvider).validateConfig(updated);
    updated.status = fiscalStatusFromValidation(validation.valid, updated.invoiceEnvironment, 'incompleto');
    updated.validationErrors = validation.errors;

    delete (updated as FiscalConfigurationInput).certificateFileBase64;
    delete (updated as FiscalConfigurationInput).certificatePassword;
    delete (updated as FiscalConfigurationInput).providerApiKey;
    delete (updated as FiscalConfigurationInput).providerClientId;
    delete (updated as FiscalConfigurationInput).providerClientSecret;
    delete (updated as FiscalConfigurationInput).nfceCsc;
    delete (updated as FiscalConfigurationInput).municipalUsername;
    delete (updated as FiscalConfigurationInput).municipalPassword;

    await this.ensureTenantDocument(context.tenantId);
    await this.collection<FiscalConfiguration>(context.tenantId, 'companyFiscalSettings')
      .doc('current')
      .set(toSnakeTenant(updated), { merge: true });

    await this.addFiscalConfigurationAuditLog(context, updated.id, options.action || 'fiscal_settings.saved', input);
    await this.addAuditLog(context, {
      fiscalConfigurationId: updated.id,
      action: options.action || 'fiscal_settings.saved',
      previousStatus: current.status,
      nextStatus: updated.status,
    });

    return this.publicFiscalConfiguration(updated);
  }

  async uploadCertificate(
    context: AdminUnifiedRequestContext,
    input: { certificateFileBase64: string; certificateFileName?: string; certificatePassword?: string }
  ): Promise<PublicFiscalConfiguration> {
    assertPermission(context, 'upload_certificado_fiscal');
    if (!input.certificateFileBase64) {
      throw new Error('certificateFileBase64 is required');
    }

    return this.saveFiscalSettings(
      context,
      {
        certificateFileBase64: input.certificateFileBase64,
        certificateFileName: input.certificateFileName || 'certificado-a1.pfx',
        certificatePassword: input.certificatePassword,
      },
      { action: 'fiscal_certificate.uploaded' }
    );
  }

  async validateFiscalSettings(context: AdminUnifiedRequestContext) {
    assertPermission(context, 'validar_configuracao_fiscal');
    const current = await this.getFiscalConfigurationRaw(context);
    const validation = await createFiscalProvider(current.invoiceProvider).validateConfig(current);
    const status = fiscalStatusFromValidation(validation.valid, current.invoiceEnvironment, validation.status);
    const updated = {
      ...current,
      status,
      validationErrors: validation.errors,
      lastValidationAt: nowIso(),
      updatedAt: nowIso(),
      updatedBy: context.userId,
    };

    await this.collection<FiscalConfiguration>(context.tenantId, 'companyFiscalSettings')
      .doc('current')
      .set(toSnakeTenant(updated), { merge: true });

    await this.addAuditLog(context, {
      fiscalConfigurationId: updated.id,
      action: 'fiscal_settings.validated',
      previousStatus: current.status,
      nextStatus: updated.status,
    });

    return {
      ...validation,
      status,
      fiscalConfiguration: this.publicFiscalConfiguration(updated),
    };
  }

  async testProvider(context: AdminUnifiedRequestContext) {
    assertPermission(context, 'validar_configuracao_fiscal');
    const validation = await this.validateFiscalSettings(context);
    await this.addAuditLog(context, {
      fiscalConfigurationId: validation.fiscalConfiguration.id,
      action: 'fiscal_provider.tested',
      nextStatus: validation.status,
      errorMessage: validation.valid ? undefined : validation.errors.join('; '),
    });

    return {
      ok: validation.valid,
      provider: validation.fiscalConfiguration.invoiceProvider,
      environment: validation.fiscalConfiguration.invoiceEnvironment,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  async getFiscalStatus(context: AdminUnifiedRequestContext) {
    const config = await this.getFiscalSettings(context);
    return {
      status: config.status,
      provider: config.invoiceProvider,
      environment: config.invoiceEnvironment,
      enabledTypes: {
        nfe: config.nfeEnabled,
        nfce: config.nfceEnabled,
        nfse: config.nfseEnabled,
      },
      secrets: config.secrets,
      validationErrors: config.validationErrors,
      lastValidationAt: config.lastValidationAt,
    };
  }

  async listFiscalAuditLogs(context: AdminUnifiedRequestContext): Promise<FiscalConfigurationAuditLog[]> {
    assertPermission(context, 'visualizar_logs_fiscais');
    const snapshot = await this.collection<FiscalConfigurationAuditLog>(
      context.tenantId,
      'fiscalConfigurationAuditLogs'
    ).get();
    return snapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as FiscalConfigurationAuditLog)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async listOrders(context: AdminUnifiedRequestContext) {
    assertPermission(context, 'visualizar_pedidos');
    const snapshot = await this.collection<AdminUnifiedOrder>(context.tenantId, 'orders')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as AdminUnifiedOrder);
  }

  async getOrderDetails(context: AdminUnifiedRequestContext, orderId: string) {
    assertPermission(context, 'visualizar_pedidos');
    const order = await this.requireOrder(context.tenantId, orderId);
    const customer = order.customerId
      ? await this.getDoc<AdminUnifiedCustomer>(context.tenantId, 'customers', order.customerId)
      : null;
    const products = await Promise.all(
      (order.items || []).map((item) => this.getDoc<AdminProduct>(context.tenantId, 'products', item.productId))
    );
    const enrichedItems = (order.items || []).map((item, index) => coerceOrderItem(item, products[index]));
    const [invoice, stock, shipments, history, logs, movements] = await Promise.all([
      this.getInvoiceForOrder(context, orderId, false),
      this.stockCheck(context, orderId),
      this.listShipments(context.tenantId, orderId),
      this.getOrderHistory(context, orderId),
      this.listAuditLogsByOrder(context.tenantId, orderId),
      this.listInventoryMovements(context.tenantId, orderId),
    ]);

    return {
      order: { ...order, customer, items: enrichedItems },
      customer,
      invoice,
      fiscalStatus: await this.getFiscalStatus(context),
      stock,
      shipments,
      inventoryMovements: movements,
      history,
      logs,
    };
  }

  async updateOrderStatus(
    context: AdminUnifiedRequestContext,
    orderId: string,
    status: string
  ): Promise<AdminUnifiedOrder> {
    assertPermission(context, 'editar_pedidos');
    const order = await this.requireOrder(context.tenantId, orderId);
    const updated = { ...order, status, updatedAt: nowIso() };
    await this.collection<AdminUnifiedOrder>(context.tenantId, 'orders').doc(orderId).set(updated, { merge: true });
    await this.addOrderHistory(context, orderId, 'order.status.updated', order.status, status);
    await this.addAuditLog(context, {
      orderId,
      action: 'order.status.updated',
      previousStatus: order.status,
      nextStatus: status,
    });
    return updated;
  }

  async getOrderHistory(context: AdminUnifiedRequestContext, orderId: string): Promise<OrderHistoryEntry[]> {
    assertPermission(context, 'visualizar_pedidos');
    const snapshot = await this.collection<OrderHistoryEntry>(context.tenantId, 'orderHistory')
      .where('orderId', '==', orderId)
      .get();
    return snapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as OrderHistoryEntry)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async issueInvoice(
    context: AdminUnifiedRequestContext,
    orderId: string,
    input: { type?: FiscalInvoiceType; idempotencyKey?: string } = {}
  ): Promise<TaxDocument> {
    assertPermission(context, 'emitir_nota_fiscal');
    const order = await this.requireOrder(context.tenantId, orderId);
    const config = await this.requireCompleteFiscalConfiguration(context);
    await this.validateOrderForInvoice(context, order, config);

    const idempotencyKey = buildIdempotencyKey('invoice.issue', orderId, input.idempotencyKey);
    const existing = await this.getInvoiceForOrder(context, orderId, false);
    if (existing) {
      if (existing.idempotencyKey === idempotencyKey) {
        return existing;
      }
      if (!['rejeitada', 'erro', 'cancelada'].includes(existing.status)) {
        throw new Error('Pedido ja possui nota fiscal emitida ou em processamento.');
      }
    }

    const type = normalizeInvoiceType(input.type, config);
    const series = getSeriesForInvoiceType(config, type);
    const number = getNextNumberForInvoiceType(config, type);
    const now = nowIso();
    const invoice: TaxDocument = {
      id: stableDocId('inv', idempotencyKey),
      tenantId: context.tenantId,
      fiscalConfigurationId: config.id,
      orderId,
      provider: config.invoiceProvider || 'outro',
      type,
      environment: config.invoiceEnvironment || 'homologacao',
      number,
      series,
      status: 'pendente',
      protectedPayload: this.buildProtectedFiscalPayload(order, config, type),
      idempotencyKey,
      createdBy: context.userId,
      createdAt: now,
      updatedAt: now,
    };

    await this.collection<TaxDocument>(context.tenantId, 'invoices').doc(invoice.id).set(toSnakeTenant(invoice));
    const provider = createFiscalProvider(config.invoiceProvider);
    const providerResult = await provider.issueInvoice(order, config, invoice);
    const updated: TaxDocument = {
      ...invoice,
      ...providerResult,
      status: providerResult.status,
      updatedAt: nowIso(),
    };

    await this.collection<TaxDocument>(context.tenantId, 'invoices').doc(updated.id).set(toSnakeTenant(updated), {
      merge: true,
    });
    await this.incrementFiscalNumber(context.tenantId, config, type);
    await this.collection<AdminUnifiedOrder>(context.tenantId, 'orders').doc(orderId).set(
      {
        fiscalStatus: updated.status,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    await this.addOrderHistory(context, orderId, 'invoice.issue.requested', undefined, updated.status);
    await this.addAuditLog(context, {
      orderId,
      fiscalConfigurationId: config.id,
      action: 'invoice.issue.requested',
      nextStatus: updated.status,
      idempotencyKey,
    });

    return updated;
  }

  async getInvoiceForOrder(
    context: AdminUnifiedRequestContext,
    orderId: string,
    enforcePermission = true
  ): Promise<TaxDocument | null> {
    if (enforcePermission) {
      assertPermission(context, 'visualizar_pedidos');
    }
    const snapshot = await this.collection<TaxDocument>(context.tenantId, 'invoices')
      .where('orderId', '==', orderId)
      .get();
    const invoices = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as TaxDocument);
    return (
      invoices.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ||
      null
    );
  }

  async refreshInvoiceStatus(context: AdminUnifiedRequestContext, orderId: string): Promise<TaxDocument> {
    assertPermission(context, 'visualizar_pedidos');
    const invoice = await this.requireInvoiceForOrder(context, orderId);
    const config = await this.getFiscalConfigurationRaw(context);
    const result = await createFiscalProvider(invoice.provider).getInvoiceStatus(invoice, config);
    const updated: TaxDocument = {
      ...invoice,
      ...result,
      status: result.status,
      updatedAt: nowIso(),
      issuedAt: result.status === 'autorizada' ? invoice.issuedAt || nowIso() : invoice.issuedAt,
    };

    if (updated.status === 'autorizada' && !updated.xmlContent) {
      updated.xmlContent = await createFiscalProvider(invoice.provider).downloadXml(updated, config);
    }
    if (updated.status === 'autorizada' && !updated.pdfContentBase64) {
      updated.pdfContentBase64 = (await createFiscalProvider(invoice.provider).downloadPdf(updated, config)).toString(
        'base64'
      );
    }

    await this.collection<TaxDocument>(context.tenantId, 'invoices').doc(updated.id).set(toSnakeTenant(updated), {
      merge: true,
    });
    await this.collection<AdminUnifiedOrder>(context.tenantId, 'orders').doc(orderId).set(
      {
        fiscalStatus: updated.status,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    await this.addOrderHistory(context, orderId, 'invoice.status.refreshed', invoice.status, updated.status);
    await this.addAuditLog(context, {
      orderId,
      fiscalConfigurationId: updated.fiscalConfigurationId,
      action: 'invoice.status.refreshed',
      previousStatus: invoice.status,
      nextStatus: updated.status,
    });
    return updated;
  }

  async downloadInvoiceXml(context: AdminUnifiedRequestContext, orderId: string): Promise<string> {
    assertPermission(context, 'visualizar_xml');
    const invoice = await this.requireInvoiceForOrder(context, orderId);
    const config = await this.getFiscalConfigurationRaw(context);
    const xml = await createFiscalProvider(invoice.provider).downloadXml(invoice, config);
    if (!invoice.xmlContent) {
      await this.collection<TaxDocument>(context.tenantId, 'invoices').doc(invoice.id).set(
        {
          xmlContent: xml,
          updatedAt: nowIso(),
        },
        { merge: true }
      );
    }
    await this.addAuditLog(context, {
      orderId,
      fiscalConfigurationId: invoice.fiscalConfigurationId,
      action: 'invoice.xml.downloaded',
    });
    return xml;
  }

  async downloadInvoicePdf(context: AdminUnifiedRequestContext, orderId: string): Promise<Buffer> {
    assertPermission(context, 'visualizar_danfe');
    const invoice = await this.requireInvoiceForOrder(context, orderId);
    const config = await this.getFiscalConfigurationRaw(context);
    const pdf = await createFiscalProvider(invoice.provider).downloadPdf(invoice, config);
    if (!invoice.pdfContentBase64) {
      await this.collection<TaxDocument>(context.tenantId, 'invoices').doc(invoice.id).set(
        {
          pdfContentBase64: pdf.toString('base64'),
          updatedAt: nowIso(),
        },
        { merge: true }
      );
    }
    await this.addAuditLog(context, {
      orderId,
      fiscalConfigurationId: invoice.fiscalConfigurationId,
      action: 'invoice.pdf.downloaded',
    });
    return pdf;
  }

  async cancelInvoice(
    context: AdminUnifiedRequestContext,
    orderId: string,
    input: { reason: string; idempotencyKey?: string }
  ): Promise<TaxDocument> {
    assertPermission(context, 'cancelar_nota_fiscal');
    const invoice = await this.requireInvoiceForOrder(context, orderId);
    const idempotencyKey = buildIdempotencyKey('invoice.cancel', orderId, input.idempotencyKey);
    if (invoice.status === 'cancelada') {
      return invoice;
    }
    const config = await this.getFiscalConfigurationRaw(context);
    const result = await createFiscalProvider(invoice.provider).cancelInvoice(invoice, input.reason, config);
    if (result.status === 'erro') {
      throw new Error(result.rejectionReason || 'Falha ao cancelar nota fiscal.');
    }
    const updated: TaxDocument = {
      ...invoice,
      ...result,
      status: result.status,
      cancellationReason: input.reason,
      cancelledAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.collection<TaxDocument>(context.tenantId, 'invoices').doc(updated.id).set(toSnakeTenant(updated), {
      merge: true,
    });
    await this.collection<AdminUnifiedOrder>(context.tenantId, 'orders').doc(orderId).set(
      {
        fiscalStatus: updated.status,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    await this.addOrderHistory(context, orderId, 'invoice.cancelled', invoice.status, updated.status);
    await this.addAuditLog(context, {
      orderId,
      fiscalConfigurationId: invoice.fiscalConfigurationId,
      action: 'invoice.cancelled',
      previousStatus: invoice.status,
      nextStatus: updated.status,
      idempotencyKey,
    });
    return updated;
  }

  async stockCheck(context: AdminUnifiedRequestContext, orderId: string): Promise<StockCheckResult> {
    assertPermission(context, 'visualizar_pedidos');
    const order = await this.requireOrder(context.tenantId, orderId);
    const items = await Promise.all(
      (order.items || []).map(async (item) => {
        const product = await this.getDoc<AdminProduct>(context.tenantId, 'products', item.productId);
        const manageStock = product?.manageStock !== false;
        const available = Number(product?.stock || 0);
        const reserved = Number(product?.reservedStock || 0);
        const requested = Number(item.quantity || 0);
        return {
          productId: item.productId,
          sku: item.sku || product?.sku,
          name: item.name || product?.name,
          requested,
          available,
          reserved,
          manageStock,
          ok: !manageStock || available >= requested,
        };
      })
    );
    return {
      orderId,
      tenantId: context.tenantId,
      available: items.every((item) => item.ok),
      items,
    };
  }

  async applyStockMovement(
    context: AdminUnifiedRequestContext,
    orderId: string,
    type: StockMovementType,
    input: { reason?: string; idempotencyKey?: string } = {}
  ): Promise<{ movements: InventoryMovement[]; stock: StockCheckResult }> {
    assertPermission(context, 'gerenciar_estoque');
    const order = await this.requireOrder(context.tenantId, orderId);
    const idempotencyKey = buildIdempotencyKey(`stock.${type}`, orderId, input.idempotencyKey);
    const existing = await this.collection<InventoryMovement>(context.tenantId, 'inventoryMovements')
      .where('idempotencyKey', '==', idempotencyKey)
      .get();
    if (!existing.empty) {
      return {
        movements: existing.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as InventoryMovement),
        stock: await this.stockCheck(context, orderId),
      };
    }

    if (type === 'reserva' || type === 'baixa') {
      const stock = await this.stockCheck(context, orderId);
      if (!stock.available) {
        throw new Error('Estoque insuficiente para a operacao solicitada.');
      }
    }

    const firestore = this.firestore();
    const movements: InventoryMovement[] = [];
    await firestore.runTransaction(async (transaction) => {
      for (const item of order.items || []) {
        const productRef = this.collection<AdminProduct>(context.tenantId, 'products').doc(item.productId);
        const productSnapshot = await transaction.get(productRef);
        const product = productSnapshot.data() as AdminProduct | undefined;
        const quantity = Number(item.quantity || 0);
        const multiplier = type === 'reserva' || type === 'baixa' ? -1 : 1;

        if (product?.manageStock !== false) {
          const currentStock = Number(product?.stock || 0);
          if (multiplier < 0 && currentStock < quantity) {
            throw new Error(`Estoque insuficiente para o produto ${item.productId}.`);
          }
          const productUpdate: Record<string, unknown> = {
            stock: FieldValue.increment(quantity * multiplier),
            updatedAt: nowIso(),
          };
          if (type === 'reserva') {
            productUpdate.reservedStock = FieldValue.increment(quantity);
          }
          if (type === 'liberacao') {
            productUpdate.reservedStock = FieldValue.increment(-quantity);
          }
          transaction.set(
            productRef,
            productUpdate,
            { merge: true }
          );
        }

        const movement: InventoryMovement = {
          id: stableDocId('mov', `${idempotencyKey}:${item.productId}`),
          tenantId: context.tenantId,
          productId: item.productId,
          orderId,
          type,
          quantity,
          reason: input.reason || type,
          idempotencyKey,
          createdBy: context.userId,
          createdAt: nowIso(),
        };
        movements.push(movement);
        transaction.set(
          this.collection<InventoryMovement>(context.tenantId, 'inventoryMovements').doc(movement.id),
          toSnakeTenant(movement),
          { merge: true }
        );
      }
    });

    await this.addOrderHistory(context, orderId, `stock.${type}`, undefined, { items: movements.length });
    await this.addAuditLog(context, {
      orderId,
      action: `stock.${type}`,
      idempotencyKey,
    });

    return {
      movements,
      stock: await this.stockCheck(context, orderId),
    };
  }

  async getTracking(context: AdminUnifiedRequestContext, orderId: string) {
    assertPermission(context, 'visualizar_pedidos');
    const shipments = await this.listShipments(context.tenantId, orderId);
    const events = (
      await Promise.all(
        shipments.map(async (shipment) => {
          const snapshot = await this.collection<TrackingEvent>(context.tenantId, 'trackingEvents')
            .where('shipmentId', '==', shipment.id)
            .get();
          return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as TrackingEvent);
        })
      )
    )
      .flat()
      .sort((a, b) => Date.parse(b.eventDate) - Date.parse(a.eventDate));
    return { shipments, events };
  }

  async updateTracking(
    context: AdminUnifiedRequestContext,
    orderId: string,
    input: {
      shipmentId?: string;
      carrier: string;
      trackingCode: string;
      trackingUrl?: string;
      status: string;
      eventDescription?: string;
      location?: string;
      estimatedDeliveryAt?: string;
    }
  ) {
    assertPermission(context, 'atualizar_rastreio');
    await this.requireOrder(context.tenantId, orderId);
    const now = nowIso();
    const shipmentId = input.shipmentId || stableDocId('shp', `${orderId}:${input.carrier}:${input.trackingCode}`);
    const shipment: Shipment = {
      id: shipmentId,
      tenantId: context.tenantId,
      orderId,
      carrier: input.carrier,
      trackingCode: input.trackingCode,
      trackingUrl: input.trackingUrl,
      status: input.status,
      estimatedDeliveryAt: input.estimatedDeliveryAt,
      updatedAt: now,
      createdAt: now,
    };
    await this.collection<Shipment>(context.tenantId, 'shipments').doc(shipment.id).set(toSnakeTenant(shipment), {
      merge: true,
    });

    const event: TrackingEvent = {
      id: randomId('trk'),
      tenantId: context.tenantId,
      shipmentId: shipment.id,
      status: input.status,
      description: input.eventDescription || `Status atualizado para ${input.status}`,
      location: input.location,
      eventDate: now,
      rawPayload: input,
    };
    await this.collection<TrackingEvent>(context.tenantId, 'trackingEvents').doc(event.id).set(toSnakeTenant(event));
    await this.collection<AdminUnifiedOrder>(context.tenantId, 'orders').doc(orderId).set(
      {
        shippingStatus: input.status,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    await this.addOrderHistory(context, orderId, 'tracking.updated', undefined, input.status);
    await this.addAuditLog(context, {
      orderId,
      action: 'tracking.updated',
      nextStatus: input.status,
    });

    return { shipment, event };
  }

  async processFiscalWebhook(payload: WebhookPayload, signature?: string) {
    this.verifyWebhookSignature(payload, signature, process.env.FISCAL_WEBHOOK_SECRET);
    const tenantId = String(payload.tenantId || '');
    if (!tenantId) {
      throw new Error('tenantId is required');
    }
    const context: AdminUnifiedRequestContext = {
      tenantId,
      userId: 'fiscal-webhook',
      userRoles: ['system'],
      permissions: ALL_PERMISSIONS,
      source: 'fiscal-webhook',
    };
    const idempotencyKey = buildIdempotencyKey(
      'webhook.fiscal',
      payload.invoiceId || payload.orderId || 'unknown',
      payload.eventId
    );
    if (await this.hasAuditIdempotency(tenantId, idempotencyKey)) {
      return { processed: false, duplicate: true };
    }

    if (payload.invoiceId && payload.status) {
      await this.collection<TaxDocument>(tenantId, 'invoices').doc(payload.invoiceId).set(
        {
          status: payload.status as TaxDocument['status'],
          updatedAt: nowIso(),
        },
        { merge: true }
      );
    }
    await this.addAuditLog(context, {
      orderId: payload.orderId,
      action: 'webhook.fiscal.processed',
      nextStatus: payload.status,
      idempotencyKey,
    });
    return { processed: true, duplicate: false };
  }

  async processShippingWebhook(payload: WebhookPayload, signature?: string) {
    this.verifyWebhookSignature(payload, signature, process.env.SHIPPING_WEBHOOK_SECRET);
    const tenantId = String(payload.tenantId || '');
    if (!tenantId) {
      throw new Error('tenantId is required');
    }
    const context: AdminUnifiedRequestContext = {
      tenantId,
      userId: 'shipping-webhook',
      userRoles: ['system'],
      permissions: ALL_PERMISSIONS,
      source: 'shipping-webhook',
    };
    const idempotencyKey = buildIdempotencyKey(
      'webhook.shipping',
      payload.shipmentId || payload.orderId || 'unknown',
      payload.eventId
    );
    if (await this.hasAuditIdempotency(tenantId, idempotencyKey)) {
      return { processed: false, duplicate: true };
    }

    if (payload.orderId && payload.status) {
      await this.updateTracking(context, payload.orderId, {
        shipmentId: payload.shipmentId,
        carrier: String(payload.provider || 'shipping-provider'),
        trackingCode: String(payload.rawPayload?.trackingCode || payload.shipmentId || payload.orderId),
        status: payload.status,
        eventDescription: payload.description,
        location: payload.location,
      });
    }
    await this.addAuditLog(context, {
      orderId: payload.orderId,
      action: 'webhook.shipping.processed',
      nextStatus: payload.status,
      idempotencyKey,
    });
    return { processed: true, duplicate: false };
  }

  private async requireCompleteFiscalConfiguration(
    context: AdminUnifiedRequestContext
  ): Promise<FiscalConfiguration> {
    const config = await this.getFiscalConfigurationRaw(context);
    const validation = await createFiscalProvider(config.invoiceProvider).validateConfig(config);
    if (!validation.valid) {
      throw new Error(
        `Configuracao fiscal incompleta. ${validation.errors.join(' ')}`
      );
    }
    return {
      ...config,
      providerApiKeyEncrypted: config.providerApiKeyEncrypted
        ? encryptSecret(decryptSecret(config.providerApiKeyEncrypted))
        : undefined,
    };
  }

  private async validateOrderForInvoice(
    context: AdminUnifiedRequestContext,
    order: AdminUnifiedOrder,
    config: FiscalConfiguration
  ): Promise<void> {
    if (!isPaymentApproved(order)) {
      throw new Error('Pagamento do pedido precisa estar aprovado antes da emissao fiscal.');
    }
    const customer = order.customerId
      ? await this.getDoc<AdminUnifiedCustomer>(context.tenantId, 'customers', order.customerId)
      : null;
    const document = getCustomerDocument(order, customer);
    if (!isValidCpfOrCnpj(document)) {
      throw new Error('CPF/CNPJ do cliente invalido ou ausente.');
    }
    if (!hasAddress(getOrderAddress(order, customer))) {
      throw new Error('Endereco de entrega/faturamento incompleto.');
    }
    if (!order.items?.length) {
      throw new Error('Pedido sem produtos.');
    }

    const products = await Promise.all(
      order.items.map((item) => this.getDoc<AdminProduct>(context.tenantId, 'products', item.productId))
    );
    order.items.forEach((item, index) => {
      const enriched = coerceOrderItem(item, products[index]);
      if (!enriched.sku) throw new Error(`Produto ${item.productId} sem SKU.`);
      if (!enriched.ncm && !config.defaultNcm) throw new Error(`Produto ${item.productId} sem NCM.`);
      if (!enriched.cfop && !config.defaultCfop) throw new Error(`Produto ${item.productId} sem CFOP.`);
      if (!enriched.quantity || Number(enriched.quantity) <= 0) {
        throw new Error(`Produto ${item.productId} com quantidade invalida.`);
      }
      if (Number(enriched.unitPrice || enriched.price || 0) < 0) {
        throw new Error(`Produto ${item.productId} com valor unitario invalido.`);
      }
    });

    const stock = await this.stockCheck(context, order.id);
    if (!stock.available) {
      throw new Error('Estoque insuficiente para emitir nota fiscal.');
    }
  }

  private buildProtectedFiscalPayload(
    order: AdminUnifiedOrder,
    config: FiscalConfiguration,
    type: FiscalInvoiceType
  ): Record<string, unknown> {
    return {
      type,
      tenantId: order.tenantId,
      orderId: order.id,
      provider: config.invoiceProvider,
      environment: config.invoiceEnvironment,
      issuerCnpjHash: hashForAudit(onlyDigits(config.cnpj)),
      customerDocumentHash: hashForAudit(getCustomerDocument(order, order.customer)),
      total: order.total,
      items: order.items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice || item.price,
        ncm: item.ncm || config.defaultNcm,
        cfop: item.cfop || config.defaultCfop,
      })),
    };
  }

  private async incrementFiscalNumber(
    tenantId: string,
    config: FiscalConfiguration,
    type: FiscalInvoiceType
  ): Promise<void> {
    const field =
      type === 'nfce' ? 'nextNfceNumber' : type === 'nfse' ? 'nextNfseNumber' : 'nextNfeNumber';
    await this.collection<FiscalConfiguration>(tenantId, 'companyFiscalSettings').doc(config.id).set(
      {
        [field]: FieldValue.increment(1),
        updatedAt: nowIso(),
      },
      { merge: true }
    );
  }

  private async requireOrder(tenantId: string, orderId: string): Promise<AdminUnifiedOrder> {
    const order = await this.getDoc<AdminUnifiedOrder>(tenantId, 'orders', orderId);
    if (!order) {
      throw new Error('Pedido inexistente ou pertence a outro tenant.');
    }
    return order;
  }

  private async requireInvoiceForOrder(
    context: AdminUnifiedRequestContext,
    orderId: string
  ): Promise<TaxDocument> {
    const invoice = await this.getInvoiceForOrder(context, orderId, false);
    if (!invoice) {
      throw new Error('Nota fiscal nao encontrada para o pedido.');
    }
    return invoice;
  }

  private async getDoc<T>(
    tenantId: string,
    collection: FiscalCollection,
    id: string
  ): Promise<T | null> {
    const snapshot = await this.collection<T>(tenantId, collection).doc(id).get();
    return snapshot.exists ? ({ ...snapshot.data(), id: snapshot.id } as T) : null;
  }

  private async listShipments(tenantId: string, orderId: string): Promise<Shipment[]> {
    const snapshot = await this.collection<Shipment>(tenantId, 'shipments').where('orderId', '==', orderId).get();
    return snapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as Shipment)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  private async listInventoryMovements(tenantId: string, orderId: string): Promise<InventoryMovement[]> {
    const snapshot = await this.collection<InventoryMovement>(tenantId, 'inventoryMovements')
      .where('orderId', '==', orderId)
      .get();
    return snapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as InventoryMovement)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  private async listAuditLogsByOrder(tenantId: string, orderId: string): Promise<AdminUnifiedAuditLog[]> {
    const snapshot = await this.collection<AdminUnifiedAuditLog>(tenantId, 'adminUnifiedAuditLogs')
      .where('orderId', '==', orderId)
      .get();
    return snapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as AdminUnifiedAuditLog)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  private async addOrderHistory(
    context: AdminUnifiedRequestContext,
    orderId: string,
    action: string,
    oldValue?: unknown,
    newValue?: unknown
  ): Promise<void> {
    const history: OrderHistoryEntry = {
      id: randomId('hist'),
      tenantId: context.tenantId,
      orderId,
      userId: context.userId,
      action,
      oldValue,
      newValue,
      createdAt: nowIso(),
    };
    await this.collection<OrderHistoryEntry>(context.tenantId, 'orderHistory').doc(history.id).set(toSnakeTenant(history));
  }

  private async addFiscalConfigurationAuditLog(
    context: AdminUnifiedRequestContext,
    fiscalConfigurationId: string,
    action: string,
    input: FiscalConfigurationInput
  ): Promise<void> {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined && value !== null);
    const batch = this.firestore().batch();
    for (const [field, value] of entries) {
      const log: FiscalConfigurationAuditLog = {
        id: randomId('faudit'),
        tenantId: context.tenantId,
        userId: context.userId,
        fiscalConfigurationId,
        action,
        fieldChanged: field,
        oldValueMasked: SENSITIVE_INPUT_KEYS.has(field) ? '[secret]' : undefined,
        newValueMasked: SENSITIVE_INPUT_KEYS.has(field) ? hashForAudit(value) : maskSensitiveValue(value),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        createdAt: nowIso(),
      };
      batch.set(
        this.collection<FiscalConfigurationAuditLog>(context.tenantId, 'fiscalConfigurationAuditLogs').doc(log.id),
        toSnakeTenant(log)
      );
    }
    await batch.commit();
  }

  private async addAuditLog(
    context: AdminUnifiedRequestContext,
    input: Omit<AdminUnifiedAuditLog, 'id' | 'tenantId' | 'userId' | 'source' | 'ipAddress' | 'userAgent' | 'createdAt'>
  ): Promise<void> {
    const log: AdminUnifiedAuditLog = {
      id: randomId('uaudit'),
      tenantId: context.tenantId,
      userId: context.userId,
      source: context.source,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      createdAt: nowIso(),
      ...input,
    };
    await this.collection<AdminUnifiedAuditLog>(context.tenantId, 'adminUnifiedAuditLogs').doc(log.id).set(toSnakeTenant(log));
  }

  private async hasAuditIdempotency(tenantId: string, idempotencyKey: string): Promise<boolean> {
    const snapshot = await this.collection<AdminUnifiedAuditLog>(tenantId, 'adminUnifiedAuditLogs')
      .where('idempotencyKey', '==', idempotencyKey)
      .get();
    return !snapshot.empty;
  }

  private verifyWebhookSignature(
    payload: WebhookPayload,
    signature: string | undefined,
    secret: string | undefined
  ): void {
    if (!secret) {
      return;
    }
    const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    if (!signature || signature.replace(/^sha256=/, '') !== expected) {
      throw new Error('Invalid webhook signature');
    }
  }

  describeFirestoreSchema() {
    return Object.entries(collectionAliases).map(([collection, firestoreAlias]) => ({
      collection,
      firestoreAlias,
      path: `tenants/{tenantId}/admin/data/${collection}`,
      requiredTenantFields: ['tenantId', 'tenant_id'],
    }));
  }
}

export function toFiscalError(error: unknown): { error: string } {
  return { error: sanitizeError(error) };
}
