import * as admin from 'firebase-admin';
import type {
  AnalyticsFilter,
  AnalyticsRepository,
  AnalyticsSnapshot,
  CatalogCategory,
  CatalogRepository,
  CarrierConfigRepository,
  CarrierIntegrationConfig,
  CarrierQuote,
  CarrierQuoteProvider,
  CarrierQuoteRequest,
  CartRepository,
  ChatMessage,
  ChatbotAnalyticsEvent,
  ChatbotAnalyticsRepository,
  ChatbotConversationMemory,
  ChatbotHandoffRepository,
  ChatbotHandoffRequest,
  ChatbotSessionRepository,
  CheckoutItem,
  ConversationMemoryRepository,
  Coupon,
  CouponApplicationAudit,
  CouponRepository,
  CRMCustomerRecord,
  CRMRepository,
  CustomerCart,
  CustomerAddress,
  CustomerBehaviorSignal,
  CustomerExchangeOrReturnRequest,
  CustomerExchangeOrReturnRequestInput,
  CustomerInteractionEvent,
  CustomerInteractionRepository,
  CustomerOrderDetails,
  CustomerOrderDocument,
  CustomerOrderFinancialDetails,
  CustomerOrderHistoryResult,
  CustomerOrderNotification,
  CustomerOrderSummary,
  CustomerOrderSupportTicket,
  CustomerPortalActionRequest,
  CustomerPortalActionResult,
  CustomerPortalPage,
  CustomerPortalQueryOptions,
  CustomerPortalRepository,
  CustomerPreferenceProfile,
  CustomerPreferenceRepository,
  CustomerRecoveryProfile,
  CustomerRecoveryRepository,
  CustomerSegment,
  CustomerSupportRequestInput,
  CustomerTimelineEvent,
  EmailCampaignDraft,
  EmailCampaignRecord,
  GeneratedLegalDocument,
  InvoicePayload,
  InvoiceRepository,
  InvoiceResponse,
  LegalAcceptanceRecord,
  LegalDocumentRepository,
  LegalDocumentsBundle,
  OrderStatus,
  PersonalizedCustomerSnapshot,
  PersonalizedProduct,
  PersonalizedProductQueryOptions,
  PersonalizedProductRepository,
  PersonalizationSnapshotRepository,
  Product,
  ProductQueryOptions,
  ProductRankingItem,
  RecoveryCampaignRepository,
  RecoveryExecutionResult,
  ReportPdfExport,
  SalesReport,
  ShippingTableRepository,
  ShippingTableRule,
  StoreLegalProfileInput,
  StoreLegalProfileRepository,
  TaxRule,
  TaxRuleRepository,
  TimeSeriesPoint,
  WishlistItem,
} from '@t3ck/shared';
import { getFirestore } from '../firebase';

type Firestore = admin.firestore.Firestore;
type StoredRecord = Record<string, unknown>;
type CatalogProduct = Product & PersonalizedProduct;

const randomId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const hasToDate = (value: unknown): value is { toDate: () => Date } =>
  typeof value === 'object' &&
  value !== null &&
  'toDate' in value &&
  typeof (value as { toDate?: unknown }).toDate === 'function';

const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value;
  }

  if (hasToDate(value)) {
    return value.toDate();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as StoredRecord).map(([key, item]) => [key, normalizeValue(item)])
    );
  }

  return value;
};

const asRecord = (value: unknown): StoredRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? ({ ...(normalizeValue(value) as StoredRecord) } as StoredRecord)
    : {};

const toDate = (value: unknown, fallback = new Date()): Date => {
  if (value instanceof Date) {
    return value;
  }

  if (hasToDate(value)) {
    return value.toDate();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  return fallback;
};

const optionalDate = (value: unknown): Date | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return toDate(value);
};

const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanValue = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String).filter(Boolean) : [];

const inDateRange = (value: unknown, filter: AnalyticsFilter): boolean => {
  const date = toDate(value, new Date(0));
  return date >= filter.startDate && date <= filter.endDate;
};

const stripUndefined = (record: StoredRecord): StoredRecord =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));

abstract class EcommerceFirestoreRepository {
  constructor(protected readonly db: Firestore | null = getFirestore()) {}

  protected requireFirestore(): Firestore {
    if (!this.db) {
      throw new Error('Firestore is required for ecommerce persistence');
    }

    return this.db;
  }

  protected storeCollection(storeId: string, collectionName: string): string {
    return `lojas/${storeId}/${collectionName}`;
  }

  protected adminCollection(storeId: string, collectionName: string): string {
    return `tenants/${storeId}/admin/data/${collectionName}`;
  }

  protected async saveRecord<T>(
    collectionPath: string,
    id: string,
    data: StoredRecord
  ): Promise<T> {
    const payload = stripUndefined({ ...data, id });
    await this.requireFirestore().collection(collectionPath).doc(id).set(payload, { merge: true });

    return normalizeValue(payload) as T;
  }

  protected async updateRecord<T>(
    collectionPath: string,
    id: string,
    data: StoredRecord,
    label = 'Documento'
  ): Promise<T> {
    const current = await this.getRecord<T>(collectionPath, id);

    if (!current) {
      throw new Error(`${label} not found`);
    }

    return this.saveRecord<T>(collectionPath, id, {
      ...(current as StoredRecord),
      ...data,
      updatedAt: new Date(),
    });
  }

  protected async deleteRecord(collectionPath: string, id: string): Promise<void> {
    await this.requireFirestore().collection(collectionPath).doc(id).delete();
  }

  protected async getRecord<T>(collectionPath: string, id: string): Promise<T | null> {
    const snapshot = await this.requireFirestore().collection(collectionPath).doc(id).get();

    if (snapshot.exists) {
      return normalizeValue({ id: snapshot.id, ...snapshot.data() }) as T;
    }

    return null;
  }

  protected async listRecords<T>(collectionPath: string): Promise<T[]> {
    const snapshot = await this.requireFirestore().collection(collectionPath).get();
    return snapshot.docs.map((item) => normalizeValue({ id: item.id, ...item.data() }) as T);
  }

  protected async listManyRecords<T>(collectionPaths: string[]): Promise<T[]> {
    const records = await Promise.all(
      collectionPaths.map((path) => this.listRecords<StoredRecord>(path))
    );
    const byId = new Map<string, StoredRecord>();

    for (const record of records.flat()) {
      const id = String(record.id ?? randomId('record'));
      byId.set(id, { ...record, id });
    }

    return Array.from(byId.values()) as T[];
  }
}

export class CatalogRepositoryImpl
  extends EcommerceFirestoreRepository
  implements CatalogRepository, PersonalizedProductRepository
{
  public async findActiveCatalogProducts(
    storeId: string,
    options?: ProductQueryOptions | PersonalizedProductQueryOptions
  ): Promise<CatalogProduct[]> {
    const records = await this.listManyRecords<StoredRecord>([
      this.storeCollection(storeId, 'produtos'),
      this.adminCollection(storeId, 'products'),
    ]);
    const categoryIds = options?.categoryIds ?? [];
    const maxPrice = options && 'maxPrice' in options ? options.maxPrice : undefined;

    return records
      .map((item) => this.mapProduct(item, storeId))
      .filter((product) => product.isActive && product.inStock)
      .filter((product) => categoryIds.length === 0 || categoryIds.includes(product.categoryId))
      .filter((product) => maxPrice === undefined || product.price <= maxPrice)
      .slice(0, options?.limit ?? 25);
  }

  public async findProductsByIds(storeId: string, productIds: string[]): Promise<CatalogProduct[]> {
    const wanted = new Set(productIds);
    const records = await this.findActiveCatalogProducts(storeId, {
      limit: Math.max(productIds.length, 1) * 5,
    });
    return records.filter((product) => wanted.has(product.id));
  }

  public async findActiveCategories(
    storeId: string,
    options?: ProductQueryOptions
  ): Promise<CatalogCategory[]> {
    const categories = (
      await this.listRecords<StoredRecord>(this.storeCollection(storeId, 'categorias'))
    )
      .map((item) => this.mapCategory(item, storeId))
      .filter((category) => category.isActive);

    if (categories.length > 0) {
      return categories.slice(0, options?.limit ?? 25);
    }

    const products = await this.findActiveCatalogProducts(storeId, { limit: options?.limit ?? 50 });
    const byCategory = new Map<string, CatalogCategory>();

    for (const product of products) {
      byCategory.set(product.categoryId, {
        id: product.categoryId,
        storeId,
        name: product.categoryName,
        aliases: [product.categoryName],
        isActive: true,
      });
    }

    return Array.from(byCategory.values()).slice(0, options?.limit ?? 25);
  }

  private mapProduct(data: StoredRecord, storeId: string): CatalogProduct {
    const categoryName = String(data.categoryName ?? data.category ?? data.categoryId ?? 'geral');
    const stock = numberValue(
      data.stock ?? data.stockQuantity,
      booleanValue(data.inStock, true) ? 1 : 0
    );
    const status = String(data.status ?? (data.isActive === false ? 'inactive' : 'active'));

    return {
      id: String(data.id ?? data.productId ?? randomId('prd')),
      storeId: String(data.storeId ?? data.tenantId ?? storeId),
      name: String(data.name ?? data.productName ?? 'Produto sem nome'),
      categoryId: String(data.categoryId ?? categoryName),
      categoryName,
      description: String(data.description ?? ''),
      price: numberValue(data.price ?? data.productPrice),
      tags: stringArray(data.tags),
      attributes: asRecord(data.attributes) as Record<string, string | number | boolean>,
      inStock: stock > 0 && booleanValue(data.inStock, true),
      isActive: status !== 'inactive' && booleanValue(data.isActive, true),
      popularity: numberValue(data.popularity, 0),
      stock,
    };
  }

  private mapCategory(data: StoredRecord, storeId: string): CatalogCategory {
    return {
      id: String(data.id ?? data.categoryId ?? randomId('cat')),
      storeId: String(data.storeId ?? data.tenantId ?? storeId),
      name: String(data.name ?? 'Categoria'),
      aliases: stringArray(data.aliases),
      isActive: String(data.status ?? 'active') !== 'inactive' && booleanValue(data.isActive, true),
    };
  }
}

export class ChatbotSessionRepositoryImpl
  extends EcommerceFirestoreRepository
  implements ChatbotSessionRepository
{
  public async getMessages(storeId: string, sessionId: string): Promise<ChatMessage[]> {
    const path = this.storeCollection(storeId, `sessoesChat/${sessionId}/mensagens`);
    const records = await this.listRecords<StoredRecord>(path);

    return records
      .map((item) => ({
        role: String(item.role ?? 'user') as ChatMessage['role'],
        content: String(item.content ?? ''),
        createdAt: toDate(item.createdAt),
      }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  public async saveMessage(
    storeId: string,
    sessionId: string,
    message: ChatMessage
  ): Promise<void> {
    const path = this.storeCollection(storeId, `sessoesChat/${sessionId}/mensagens`);
    await this.saveRecord(path, randomId('msg'), message as unknown as StoredRecord);
  }
}

export class CustomerPreferenceRepositoryImpl
  extends EcommerceFirestoreRepository
  implements CustomerPreferenceRepository
{
  public async getProfile(
    storeId: string,
    sessionId: string
  ): Promise<CustomerPreferenceProfile | null> {
    return this.getRecord<CustomerPreferenceProfile>(
      this.storeCollection(storeId, 'preferenciasChat'),
      sessionId
    );
  }

  public async saveProfile(
    storeId: string,
    sessionId: string,
    profile: CustomerPreferenceProfile
  ): Promise<void> {
    await this.saveRecord(this.storeCollection(storeId, 'preferenciasChat'), sessionId, {
      ...profile,
      updatedAt: new Date(),
    } as StoredRecord);
  }
}

export class ConversationMemoryRepositoryImpl
  extends EcommerceFirestoreRepository
  implements ConversationMemoryRepository
{
  public async getMemory(
    storeId: string,
    sessionId: string
  ): Promise<ChatbotConversationMemory | null> {
    return this.getRecord<ChatbotConversationMemory>(
      this.storeCollection(storeId, 'memoriasChat'),
      sessionId
    );
  }

  public async saveMemory(memory: ChatbotConversationMemory): Promise<void> {
    await this.saveRecord(this.storeCollection(memory.storeId, 'memoriasChat'), memory.sessionId, {
      ...memory,
    } as StoredRecord);
  }
}

export class ChatbotAnalyticsRepositoryImpl
  extends EcommerceFirestoreRepository
  implements ChatbotAnalyticsRepository
{
  public async trackEvent(event: ChatbotAnalyticsEvent): Promise<void> {
    await this.saveRecord(
      this.storeCollection(event.storeId, 'eventosChatbot'),
      randomId('chat_evt'),
      {
        ...event,
      } as StoredRecord
    );
  }
}

export class ChatbotHandoffRepositoryImpl
  extends EcommerceFirestoreRepository
  implements ChatbotHandoffRepository
{
  public async createHandoff(request: ChatbotHandoffRequest): Promise<void> {
    await this.saveRecord(
      this.storeCollection(request.storeId, 'handoffsChatbot'),
      randomId('handoff'),
      {
        ...request,
      } as StoredRecord
    );
  }
}

export class CustomerInteractionRepositoryImpl
  extends EcommerceFirestoreRepository
  implements CustomerInteractionRepository
{
  public async saveInteraction(event: CustomerInteractionEvent): Promise<void> {
    await this.saveRecord(
      this.storeCollection(event.storeId, 'interacoesClientes'),
      randomId('interaction'),
      event as unknown as StoredRecord
    );
  }

  public async findInteractionsByCustomer(
    storeId: string,
    customerId: string
  ): Promise<CustomerInteractionEvent[]> {
    const records = await this.listRecords<StoredRecord>(
      this.storeCollection(storeId, 'interacoesClientes')
    );

    return records
      .filter((item) => String(item.customerId) === customerId)
      .map((item) => ({
        storeId,
        customerId,
        productId: String(item.productId),
        type: String(item.type) as CustomerInteractionEvent['type'],
        createdAt: toDate(item.createdAt),
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export class PersonalizationSnapshotRepositoryImpl
  extends EcommerceFirestoreRepository
  implements PersonalizationSnapshotRepository
{
  public async getSnapshot(
    storeId: string,
    customerId: string
  ): Promise<PersonalizedCustomerSnapshot | null> {
    return this.getRecord<PersonalizedCustomerSnapshot>(
      this.storeCollection(storeId, 'snapshotsPersonalizacao'),
      customerId
    );
  }

  public async saveSnapshot(snapshot: PersonalizedCustomerSnapshot): Promise<void> {
    await this.saveRecord(
      this.storeCollection(snapshot.storeId, 'snapshotsPersonalizacao'),
      snapshot.customerId,
      snapshot as unknown as StoredRecord
    );
  }
}

export class CartRepositoryImpl extends EcommerceFirestoreRepository implements CartRepository {
  public async findAbandonedCarts(storeId: string, referenceDate: Date): Promise<CustomerCart[]> {
    const records = await this.listRecords<StoredRecord>(
      this.storeCollection(storeId, 'carrinhos')
    );
    const cutoff = referenceDate.getTime() - 30 * 60 * 1000;

    return records
      .map((item) => this.mapCart(item, storeId))
      .filter(
        (cart) =>
          cart.status === 'abandoned' ||
          ((cart.status === 'active' || cart.status === 'hesitating') &&
            cart.updatedAt.getTime() <= cutoff)
      );
  }

  public async findCartById(storeId: string, cartId: string): Promise<CustomerCart | null> {
    const cart = await this.getRecord<StoredRecord>(
      this.storeCollection(storeId, 'carrinhos'),
      cartId
    );
    return cart ? this.mapCart(cart, storeId) : null;
  }

  public async createCart(cart: CustomerCart): Promise<CustomerCart> {
    return this.saveRecord<CustomerCart>(
      this.storeCollection(cart.storeId, 'carrinhos'),
      cart.cartId,
      cart as unknown as StoredRecord
    );
  }

  public async updateCart(
    storeId: string,
    cartId: string,
    data: Partial<CustomerCart>
  ): Promise<CustomerCart> {
    return this.updateRecord<CustomerCart>(
      this.storeCollection(storeId, 'carrinhos'),
      cartId,
      data as StoredRecord,
      'Cart'
    );
  }

  public async deleteCart(storeId: string, cartId: string): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'carrinhos'), cartId);
  }

  public async updateCartStatus(
    storeId: string,
    cartId: string,
    status: CustomerCart['status']
  ): Promise<void> {
    await this.updateCart(storeId, cartId, { status, updatedAt: new Date() });
  }

  private mapCart(data: StoredRecord, storeId: string): CustomerCart {
    const items = Array.isArray(data.items) ? data.items.map((item) => asRecord(item)) : [];

    return {
      cartId: String(data.cartId ?? data.id ?? randomId('cart')),
      storeId: String(data.storeId ?? storeId),
      customerId: String(data.customerId ?? ''),
      items: items.map((item) => ({
        productId: String(item.productId ?? ''),
        productName: String(item.productName ?? item.name ?? ''),
        category: String(item.category ?? item.categoryName ?? ''),
        unitPrice: numberValue(item.unitPrice ?? item.price),
        quantity: numberValue(item.quantity, 1),
        stockQuantity: numberValue(item.stockQuantity ?? item.stock, 0),
        inStock: booleanValue(item.inStock, true),
        isActive: booleanValue(item.isActive, true),
        tags: stringArray(item.tags),
      })),
      subtotal: numberValue(data.subtotal ?? data.totalAmount),
      updatedAt: toDate(data.updatedAt),
      status: String(data.status ?? 'active') as CustomerCart['status'],
    };
  }
}

export class CustomerRecoveryRepositoryImpl
  extends EcommerceFirestoreRepository
  implements CustomerRecoveryRepository
{
  public async findCustomerProfile(
    storeId: string,
    customerId: string
  ): Promise<CustomerRecoveryProfile | null> {
    return this.getRecord<CustomerRecoveryProfile>(
      this.storeCollection(storeId, 'perfisRecuperacao'),
      customerId
    );
  }

  public async saveCustomerProfile(
    profile: CustomerRecoveryProfile
  ): Promise<CustomerRecoveryProfile> {
    return this.saveRecord<CustomerRecoveryProfile>(
      this.storeCollection(profile.storeId, 'perfisRecuperacao'),
      profile.customerId,
      profile as unknown as StoredRecord
    );
  }

  public async updateCustomerProfile(
    storeId: string,
    customerId: string,
    data: Partial<CustomerRecoveryProfile>
  ): Promise<CustomerRecoveryProfile> {
    return this.updateRecord<CustomerRecoveryProfile>(
      this.storeCollection(storeId, 'perfisRecuperacao'),
      customerId,
      data as StoredRecord,
      'Customer recovery profile'
    );
  }
}

export class RecoveryCampaignRepositoryImpl
  extends EcommerceFirestoreRepository
  implements RecoveryCampaignRepository
{
  public async saveRecoverySuggestion(result: RecoveryExecutionResult): Promise<void> {
    await this.saveRecord(
      this.storeCollection(result.storeId, 'sugestoesRecuperacao'),
      randomId('recovery'),
      result as unknown as StoredRecord
    );
  }

  public async saveBehaviorSignal(signal: CustomerBehaviorSignal): Promise<void> {
    await this.saveRecord(
      this.storeCollection(signal.storeId, 'sinaisComportamento'),
      signal.signalId ?? randomId('signal'),
      signal as unknown as StoredRecord
    );
  }

  public async findBehaviorSignals(
    storeId: string,
    cartId: string
  ): Promise<CustomerBehaviorSignal[]> {
    const records = await this.listRecords<StoredRecord>(
      this.storeCollection(storeId, 'sinaisComportamento')
    );

    return records
      .filter((item) => String(item.cartId) === cartId)
      .map((item) => ({
        signalId: String(item.signalId ?? item.id),
        storeId,
        customerId: String(item.customerId ?? ''),
        cartId,
        type: String(item.type) as CustomerBehaviorSignal['type'],
        createdAt: toDate(item.createdAt),
        metadata: asRecord(item.metadata) as CustomerBehaviorSignal['metadata'],
      }));
  }

  public async deleteBehaviorSignal(
    storeId: string,
    _cartId: string,
    signalId: string
  ): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'sinaisComportamento'), signalId);
  }
}

export class CouponRepositoryImpl extends EcommerceFirestoreRepository implements CouponRepository {
  public async createCoupon(coupon: Coupon): Promise<Coupon> {
    return this.saveRecord<Coupon>(
      this.storeCollection(coupon.storeId, 'cupons'),
      coupon.id,
      coupon as unknown as StoredRecord
    );
  }

  public async updateCoupon(
    storeId: string,
    couponId: string,
    data: Partial<Coupon>
  ): Promise<Coupon> {
    return this.updateRecord<Coupon>(
      this.storeCollection(storeId, 'cupons'),
      couponId,
      data as StoredRecord,
      'Coupon'
    );
  }

  public async deleteCoupon(storeId: string, couponId: string): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'cupons'), couponId);
  }

  public async findCouponByCode(storeId: string, code: string): Promise<Coupon | null> {
    const normalizedCode = code.trim().toUpperCase();
    const coupons = await this.listCoupons(storeId);
    return coupons.find((coupon) => coupon.code.toUpperCase() === normalizedCode) ?? null;
  }

  public async listCoupons(storeId: string): Promise<Coupon[]> {
    const records = await this.listRecords<StoredRecord>(this.storeCollection(storeId, 'cupons'));
    return records.map((item) => this.mapCoupon(item, storeId));
  }

  public async incrementUsage(storeId: string, couponId: string): Promise<void> {
    const coupon = await this.getRecord<Coupon>(this.storeCollection(storeId, 'cupons'), couponId);

    if (!coupon) {
      return;
    }

    await this.updateCoupon(storeId, couponId, { usageCount: (coupon.usageCount ?? 0) + 1 });
  }

  public async saveCouponAudit(audit: CouponApplicationAudit): Promise<void> {
    await this.saveRecord(
      this.storeCollection(audit.storeId, 'auditoriasCupons'),
      randomId('coupon_audit'),
      audit as unknown as StoredRecord
    );
  }

  private mapCoupon(data: StoredRecord, storeId: string): Coupon {
    return {
      id: String(data.id ?? randomId('coupon')),
      storeId: String(data.storeId ?? storeId),
      code: String(data.code ?? '').toUpperCase(),
      description: data.description ? String(data.description) : undefined,
      type: String(data.type ?? 'fixed') as Coupon['type'],
      value: numberValue(data.value),
      minimumOrderValue:
        data.minimumOrderValue === undefined ? undefined : numberValue(data.minimumOrderValue),
      maximumDiscountValue:
        data.maximumDiscountValue === undefined
          ? undefined
          : numberValue(data.maximumDiscountValue),
      usageLimit: data.usageLimit === undefined ? undefined : numberValue(data.usageLimit),
      usageCount: numberValue(data.usageCount),
      startsAt: toDate(data.startsAt),
      expiresAt: optionalDate(data.expiresAt),
      isActive: booleanValue(data.isActive, true),
      eligibleCategoryIds: stringArray(data.eligibleCategoryIds),
      eligibleProductIds: stringArray(data.eligibleProductIds),
      priority: data.priority === undefined ? undefined : numberValue(data.priority),
      promotionGroup: data.promotionGroup ? String(data.promotionGroup) : undefined,
      exclusiveWithCouponIds: stringArray(data.exclusiveWithCouponIds),
    };
  }
}

export class ShippingTableRepositoryImpl
  extends EcommerceFirestoreRepository
  implements ShippingTableRepository
{
  public async createRule(rule: ShippingTableRule): Promise<ShippingTableRule> {
    return this.saveRecord<ShippingTableRule>(
      this.storeCollection(rule.storeId, 'regrasFrete'),
      rule.id,
      rule as unknown as StoredRecord
    );
  }

  public async updateRule(
    storeId: string,
    ruleId: string,
    data: Partial<ShippingTableRule>
  ): Promise<ShippingTableRule> {
    return this.updateRecord<ShippingTableRule>(
      this.storeCollection(storeId, 'regrasFrete'),
      ruleId,
      data as StoredRecord,
      'Shipping rule'
    );
  }

  public async deleteRule(storeId: string, ruleId: string): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'regrasFrete'), ruleId);
  }

  public async findActiveRulesByZipCode(
    storeId: string,
    zipCode: string
  ): Promise<ShippingTableRule[]> {
    const normalizedZip = zipCode.replace(/\D/g, '');
    return (await this.listRules(storeId)).filter((rule) => {
      const start = rule.zipCodeStart.replace(/\D/g, '');
      const end = rule.zipCodeEnd.replace(/\D/g, '');
      return rule.isActive && normalizedZip >= start && normalizedZip <= end;
    });
  }

  public async listRules(storeId: string): Promise<ShippingTableRule[]> {
    const records = await this.listRecords<StoredRecord>(
      this.storeCollection(storeId, 'regrasFrete')
    );
    return records.map((item) => ({
      id: String(item.id ?? randomId('ship_rule')),
      storeId: String(item.storeId ?? storeId),
      name: String(item.name ?? 'Regra de frete'),
      zipCodeStart: String(item.zipCodeStart ?? '00000000'),
      zipCodeEnd: String(item.zipCodeEnd ?? '99999999'),
      minimumDeliveryDays: numberValue(item.minimumDeliveryDays, 1),
      maximumDeliveryDays: numberValue(item.maximumDeliveryDays, 7),
      cost: numberValue(item.cost),
      freeShippingMinimumOrderValue:
        item.freeShippingMinimumOrderValue === undefined
          ? undefined
          : numberValue(item.freeShippingMinimumOrderValue),
      carrierName: String(item.carrierName ?? 'transportadora'),
      isActive: booleanValue(item.isActive, true),
      regionName: item.regionName ? String(item.regionName) : undefined,
      minimumWeightKg:
        item.minimumWeightKg === undefined ? undefined : numberValue(item.minimumWeightKg),
      maximumWeightKg:
        item.maximumWeightKg === undefined ? undefined : numberValue(item.maximumWeightKg),
    }));
  }
}

export class CarrierConfigRepositoryImpl
  extends EcommerceFirestoreRepository
  implements CarrierConfigRepository
{
  public async createConfig(config: CarrierIntegrationConfig): Promise<CarrierIntegrationConfig> {
    return this.saveRecord<CarrierIntegrationConfig>(
      this.storeCollection(config.storeId, 'configuracoesTransportadora'),
      config.id,
      config as unknown as StoredRecord
    );
  }

  public async updateConfig(
    storeId: string,
    configId: string,
    data: Partial<CarrierIntegrationConfig>
  ): Promise<CarrierIntegrationConfig> {
    return this.updateRecord<CarrierIntegrationConfig>(
      this.storeCollection(storeId, 'configuracoesTransportadora'),
      configId,
      data as StoredRecord,
      'Carrier config'
    );
  }

  public async deleteConfig(storeId: string, configId: string): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'configuracoesTransportadora'), configId);
  }

  public async listActiveConfigs(storeId: string): Promise<CarrierIntegrationConfig[]> {
    const records = await this.listRecords<StoredRecord>(
      this.storeCollection(storeId, 'configuracoesTransportadora')
    );

    return records
      .map((item) => ({
        id: String(item.id ?? randomId('carrier')),
        storeId: String(item.storeId ?? storeId),
        carrierName: String(item.carrierName ?? 'transportadora'),
        apiBaseUrl: String(item.apiBaseUrl ?? ''),
        apiTokenReference: String(item.apiTokenReference ?? ''),
        serviceCodes: stringArray(item.serviceCodes),
        isActive: booleanValue(item.isActive, true),
      }))
      .filter((item) => item.isActive);
  }
}

export class ConfiguredCarrierQuoteProvider implements CarrierQuoteProvider {
  public constructor(private readonly carrierConfigRepository: CarrierConfigRepository) {}

  public async getQuotes(input: CarrierQuoteRequest): Promise<CarrierQuote[]> {
    const configs = await this.carrierConfigRepository.listActiveConfigs(input.storeId);

    return configs.map((config) => ({
      carrierName: config.carrierName,
      serviceName: config.serviceCodes[0] ?? 'padrao',
      price: 0,
      deliveryDays: 0,
      isAvailable: false,
      errorMessage: 'Cotacao externa ainda nao configurada para este carrier.',
    }));
  }
}

export class AnalyticsRepositoryImpl
  extends EcommerceFirestoreRepository
  implements AnalyticsRepository
{
  public async getTotalRevenue(filter: AnalyticsFilter): Promise<number> {
    const snapshot = await this.getSnapshotForFilter(filter);
    if (snapshot) {
      return snapshot.totalRevenue;
    }

    return this.filteredOrders(filter).then((orders) =>
      orders.reduce((sum, order) => sum + this.orderTotal(order), 0)
    );
  }

  public async getTotalOrders(filter: AnalyticsFilter): Promise<number> {
    const snapshot = await this.getSnapshotForFilter(filter);
    if (snapshot) {
      return snapshot.totalOrders;
    }

    return this.filteredOrders(filter).then((orders) => orders.length);
  }

  public async getTotalVisitors(filter: AnalyticsFilter): Promise<number> {
    return (await this.getSnapshotForFilter(filter))?.totalVisitors ?? 0;
  }

  public async getTotalCustomers(filter: AnalyticsFilter): Promise<number> {
    const snapshot = await this.getSnapshotForFilter(filter);
    if (snapshot) {
      return snapshot.totalCustomers;
    }

    const customers = await this.listManyRecords<StoredRecord>([
      this.storeCollection(filter.storeId, 'clientes'),
      this.adminCollection(filter.storeId, 'customers'),
    ]);
    return customers.length;
  }

  public async getTotalMarketingSpend(filter: AnalyticsFilter): Promise<number> {
    return (await this.getSnapshotForFilter(filter))?.totalMarketingSpend ?? 0;
  }

  public async getRevenueSeries(filter: AnalyticsFilter): Promise<TimeSeriesPoint[]> {
    const snapshot = await this.getSnapshotForFilter(filter);
    if (snapshot) {
      return snapshot.revenueSeries;
    }

    return this.buildSeries(filter, (order) => this.orderTotal(order));
  }

  public async getOrdersSeries(filter: AnalyticsFilter): Promise<TimeSeriesPoint[]> {
    const snapshot = await this.getSnapshotForFilter(filter);
    if (snapshot) {
      return snapshot.ordersSeries;
    }

    return this.buildSeries(filter, () => 1);
  }

  public async getProductSalesRanking(filter: AnalyticsFilter): Promise<ProductRankingItem[]> {
    const snapshot = await this.getSnapshotForFilter(filter);
    if (snapshot) {
      return snapshot.productRanking;
    }

    const orders = await this.filteredOrders(filter);
    const products = await new CatalogRepositoryImpl(this.db).findActiveCatalogProducts(
      filter.storeId,
      {
        limit: 500,
      }
    );
    const productNameById = new Map(products.map((product) => [product.id, product.name]));
    const byProduct = new Map<string, ProductRankingItem>();

    for (const order of orders) {
      const items = Array.isArray(order.items) ? order.items.map((item) => asRecord(item)) : [];

      for (const item of items) {
        const productId = String(item.productId ?? '');
        const current = byProduct.get(productId) ?? {
          productId,
          productName: productNameById.get(productId) ?? String(item.productName ?? productId),
          quantitySold: 0,
          revenue: 0,
          rank: 0,
        };
        const quantity = numberValue(item.quantity, 1);
        current.quantitySold += quantity;
        current.revenue += quantity * numberValue(item.price ?? item.unitPrice);
        byProduct.set(productId, current);
      }
    }

    return Array.from(byProduct.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }

  public async saveSnapshot(snapshot: AnalyticsSnapshot): Promise<AnalyticsSnapshot> {
    return this.saveRecord<AnalyticsSnapshot>(
      this.storeCollection(snapshot.storeId, 'snapshotsAnalytics'),
      snapshot.snapshotId,
      snapshot as unknown as StoredRecord
    );
  }

  public async updateSnapshot(
    storeId: string,
    snapshotId: string,
    data: Partial<AnalyticsSnapshot>
  ): Promise<AnalyticsSnapshot> {
    return this.updateRecord<AnalyticsSnapshot>(
      this.storeCollection(storeId, 'snapshotsAnalytics'),
      snapshotId,
      data as StoredRecord,
      'Analytics snapshot'
    );
  }

  public async deleteSnapshot(storeId: string, snapshotId: string): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'snapshotsAnalytics'), snapshotId);
  }

  public async saveSalesReport(report: SalesReport): Promise<SalesReport> {
    return this.saveRecord<SalesReport>(
      this.storeCollection(report.storeId, 'relatoriosVendas'),
      report.reportId,
      report as unknown as StoredRecord
    );
  }

  public async getSalesReport(storeId: string, reportId: string): Promise<SalesReport | null> {
    return this.getRecord<SalesReport>(this.storeCollection(storeId, 'relatoriosVendas'), reportId);
  }

  public async listSalesReports(storeId: string): Promise<SalesReport[]> {
    return this.listRecords<SalesReport>(this.storeCollection(storeId, 'relatoriosVendas'));
  }

  public async savePdfExport(pdfExport: ReportPdfExport): Promise<ReportPdfExport> {
    return this.saveRecord<ReportPdfExport>(
      this.storeCollection(pdfExport.storeId, 'pdfsRelatoriosVendas'),
      pdfExport.exportId,
      pdfExport as unknown as StoredRecord
    );
  }

  public async updatePdfExport(
    storeId: string,
    exportId: string,
    data: Partial<ReportPdfExport>
  ): Promise<ReportPdfExport> {
    return this.updateRecord<ReportPdfExport>(
      this.storeCollection(storeId, 'pdfsRelatoriosVendas'),
      exportId,
      data as StoredRecord,
      'PDF export'
    );
  }

  public async getPdfExport(storeId: string, exportId: string): Promise<ReportPdfExport | null> {
    return this.getRecord<ReportPdfExport>(
      this.storeCollection(storeId, 'pdfsRelatoriosVendas'),
      exportId
    );
  }

  public async listPdfExports(storeId: string, reportId?: string): Promise<ReportPdfExport[]> {
    const exports = await this.listRecords<ReportPdfExport>(
      this.storeCollection(storeId, 'pdfsRelatoriosVendas')
    );
    return reportId ? exports.filter((item) => item.reportId === reportId) : exports;
  }

  private async getSnapshotForFilter(filter: AnalyticsFilter): Promise<AnalyticsSnapshot | null> {
    const snapshotId = `${filter.period}_${filter.startDate.toISOString()}_${filter.endDate.toISOString()}`;
    const direct = await this.getRecord<AnalyticsSnapshot>(
      this.storeCollection(filter.storeId, 'snapshotsAnalytics'),
      snapshotId
    );

    if (direct) {
      return direct;
    }

    const snapshots = await this.listRecords<AnalyticsSnapshot>(
      this.storeCollection(filter.storeId, 'snapshotsAnalytics')
    );

    return (
      snapshots.find(
        (item) =>
          item.period === filter.period &&
          toDate(item.startDate).getTime() === filter.startDate.getTime() &&
          toDate(item.endDate).getTime() === filter.endDate.getTime()
      ) ?? null
    );
  }

  private async filteredOrders(filter: AnalyticsFilter): Promise<StoredRecord[]> {
    const orders = await this.listManyRecords<StoredRecord>([
      this.storeCollection(filter.storeId, 'pedidos'),
      this.adminCollection(filter.storeId, 'orders'),
    ]);

    return orders.filter((order) => inDateRange(order.createdAt, filter));
  }

  private orderTotal(order: StoredRecord): number {
    return numberValue(order.totalAmount ?? order.total);
  }

  private async buildSeries(
    filter: AnalyticsFilter,
    getValue: (order: StoredRecord) => number
  ): Promise<TimeSeriesPoint[]> {
    const buckets = new Map<string, number>();

    for (const order of await this.filteredOrders(filter)) {
      const date = toDate(order.createdAt);
      const label =
        filter.period === 'year'
          ? String(date.getUTCFullYear())
          : filter.period === 'month'
            ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
            : date.toISOString().slice(0, 10);
      buckets.set(label, (buckets.get(label) ?? 0) + getValue(order));
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }));
  }
}

export class TaxRuleRepositoryImpl
  extends EcommerceFirestoreRepository
  implements TaxRuleRepository
{
  public async findApplicableRule(input: {
    storeId: string;
    originState: string;
    destinationState: string;
    category?: string;
    ncmCode?: string;
  }): Promise<TaxRule | null> {
    const rules = await this.listTaxRules(input.storeId);

    return (
      rules
        .filter((rule) => rule.isActive)
        .filter((rule) => rule.originState === input.originState)
        .filter((rule) => rule.destinationState === input.destinationState)
        .filter((rule) => !rule.category || rule.category === input.category)
        .filter((rule) => !rule.ncmCode || rule.ncmCode === input.ncmCode)
        .sort((a, b) => Number(Boolean(b.ncmCode)) - Number(Boolean(a.ncmCode)))[0] ?? null
    );
  }

  public async createTaxRule(rule: TaxRule): Promise<TaxRule> {
    return this.saveRecord<TaxRule>(
      this.storeCollection(rule.storeId, 'regrasFiscais'),
      rule.id,
      rule as unknown as StoredRecord
    );
  }

  public async updateTaxRule(
    storeId: string,
    ruleId: string,
    data: Partial<TaxRule>
  ): Promise<TaxRule> {
    return this.updateRecord<TaxRule>(
      this.storeCollection(storeId, 'regrasFiscais'),
      ruleId,
      data as StoredRecord,
      'Tax rule'
    );
  }

  public async deleteTaxRule(storeId: string, ruleId: string): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'regrasFiscais'), ruleId);
  }

  public async listTaxRules(storeId: string): Promise<TaxRule[]> {
    return this.listRecords<TaxRule>(this.storeCollection(storeId, 'regrasFiscais'));
  }
}

export class InvoiceRepositoryImpl
  extends EcommerceFirestoreRepository
  implements InvoiceRepository
{
  public async saveInvoiceResult(
    payload: InvoicePayload,
    response: InvoiceResponse
  ): Promise<void> {
    await this.saveRecord(this.storeCollection(payload.storeId, 'notasFiscais'), payload.orderId, {
      ...payload,
      response,
      updatedAt: new Date(),
    } as unknown as StoredRecord);
  }
}

export class StoreLegalProfileRepositoryImpl
  extends EcommerceFirestoreRepository
  implements StoreLegalProfileRepository
{
  public async saveProfile(profile: StoreLegalProfileInput): Promise<StoreLegalProfileInput> {
    return this.saveRecord<StoreLegalProfileInput>(
      this.storeCollection(profile.storeId, 'perfisJuridicos'),
      'profile',
      profile as unknown as StoredRecord
    );
  }

  public async getProfile(storeId: string): Promise<StoreLegalProfileInput | null> {
    return this.getRecord<StoreLegalProfileInput>(
      this.storeCollection(storeId, 'perfisJuridicos'),
      'profile'
    );
  }

  public async updateProfile(
    storeId: string,
    data: Partial<StoreLegalProfileInput>
  ): Promise<StoreLegalProfileInput> {
    return this.updateRecord<StoreLegalProfileInput>(
      this.storeCollection(storeId, 'perfisJuridicos'),
      'profile',
      data as StoredRecord,
      'Legal profile'
    );
  }

  public async deleteProfile(storeId: string): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'perfisJuridicos'), 'profile');
  }
}

export class LegalDocumentRepositoryImpl
  extends EcommerceFirestoreRepository
  implements LegalDocumentRepository
{
  public async saveGeneratedDocuments(bundle: LegalDocumentsBundle): Promise<void> {
    await Promise.all(
      bundle.documents.map((document) =>
        this.saveRecord(this.storeCollection(bundle.storeId, 'documentosLegais'), document.type, {
          ...document,
          storeId: bundle.storeId,
        } as unknown as StoredRecord)
      )
    );
  }

  public async getGeneratedDocuments(storeId: string): Promise<LegalDocumentsBundle | null> {
    const documents = await this.listRecords<GeneratedLegalDocument>(
      this.storeCollection(storeId, 'documentosLegais')
    );

    return documents.length > 0 ? { storeId, documents } : null;
  }

  public async deleteGeneratedDocument(
    storeId: string,
    type: GeneratedLegalDocument['type']
  ): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'documentosLegais'), type);
  }

  public async publishGeneratedDocument(
    storeId: string,
    type: GeneratedLegalDocument['type'],
    version: string
  ): Promise<void> {
    await this.updateRecord<GeneratedLegalDocument>(
      this.storeCollection(storeId, 'documentosLegais'),
      type,
      { version, status: 'published' },
      'Legal document'
    );
  }

  public async saveAcceptanceRecord(record: LegalAcceptanceRecord): Promise<void> {
    await this.saveRecord(
      this.storeCollection(record.storeId, 'aceitesLegais'),
      randomId('legal_acceptance'),
      record as unknown as StoredRecord
    );
  }
}

export class CRMRepositoryImpl extends EcommerceFirestoreRepository implements CRMRepository {
  public async createCustomer(record: CRMCustomerRecord): Promise<CRMCustomerRecord> {
    return this.saveRecord<CRMCustomerRecord>(
      this.storeCollection(record.storeId, 'clientesCrm'),
      record.customerId,
      record as unknown as StoredRecord
    );
  }

  public async updateCustomer(
    storeId: string,
    customerId: string,
    data: Partial<CRMCustomerRecord>
  ): Promise<CRMCustomerRecord> {
    return this.updateRecord<CRMCustomerRecord>(
      this.storeCollection(storeId, 'clientesCrm'),
      customerId,
      data as StoredRecord,
      'CRM customer'
    );
  }

  public async deleteCustomer(storeId: string, customerId: string): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'clientesCrm'), customerId);
  }

  public async getCustomer(storeId: string, customerId: string): Promise<CRMCustomerRecord | null> {
    return this.getRecord<CRMCustomerRecord>(
      this.storeCollection(storeId, 'clientesCrm'),
      customerId
    );
  }

  public async listCustomers(storeId: string): Promise<CRMCustomerRecord[]> {
    return this.listRecords<CRMCustomerRecord>(this.storeCollection(storeId, 'clientesCrm'));
  }

  public async createSegment(segment: CustomerSegment): Promise<CustomerSegment> {
    return this.saveRecord<CustomerSegment>(
      this.storeCollection(segment.storeId, 'segmentosCrm'),
      segment.id,
      segment as unknown as StoredRecord
    );
  }

  public async updateSegment(
    storeId: string,
    segmentId: string,
    data: Partial<CustomerSegment>
  ): Promise<CustomerSegment> {
    return this.updateRecord<CustomerSegment>(
      this.storeCollection(storeId, 'segmentosCrm'),
      segmentId,
      data as StoredRecord,
      'CRM segment'
    );
  }

  public async deleteSegment(storeId: string, segmentId: string): Promise<void> {
    await this.deleteRecord(this.storeCollection(storeId, 'segmentosCrm'), segmentId);
  }

  public async listSegments(storeId: string): Promise<CustomerSegment[]> {
    return this.listRecords<CustomerSegment>(this.storeCollection(storeId, 'segmentosCrm'));
  }

  public async saveEmailCampaignDraft(draft: EmailCampaignDraft): Promise<EmailCampaignDraft> {
    return this.saveRecord<EmailCampaignDraft>(
      this.storeCollection(draft.storeId, 'rascunhosCampanhasEmail'),
      draft.id,
      draft as unknown as StoredRecord
    );
  }

  public async listEmailCampaignDrafts(storeId: string): Promise<EmailCampaignDraft[]> {
    return this.listRecords<EmailCampaignDraft>(
      this.storeCollection(storeId, 'rascunhosCampanhasEmail')
    );
  }

  public async saveTimelineEvent(event: CustomerTimelineEvent): Promise<CustomerTimelineEvent> {
    return this.saveRecord<CustomerTimelineEvent>(
      this.storeCollection(event.storeId, `clientesCrm/${event.customerId}/timeline`),
      event.id,
      event as unknown as StoredRecord
    );
  }

  public async listTimelineEvents(
    storeId: string,
    customerId: string
  ): Promise<CustomerTimelineEvent[]> {
    const events = await this.listRecords<CustomerTimelineEvent>(
      this.storeCollection(storeId, `clientesCrm/${customerId}/timeline`)
    );
    return events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async saveCampaignRecord(campaign: EmailCampaignRecord): Promise<EmailCampaignRecord> {
    return this.saveRecord<EmailCampaignRecord>(
      this.storeCollection(campaign.storeId, 'campanhasEmail'),
      campaign.id,
      campaign as unknown as StoredRecord
    );
  }

  public async getCampaignRecord(
    storeId: string,
    campaignId: string
  ): Promise<EmailCampaignRecord | null> {
    return this.getRecord<EmailCampaignRecord>(
      this.storeCollection(storeId, 'campanhasEmail'),
      campaignId
    );
  }
}

export class CustomerPortalRepositoryImpl
  extends EcommerceFirestoreRepository
  implements CustomerPortalRepository
{
  public async getOrderById(
    storeId: string,
    customerId: string,
    orderId: string
  ): Promise<CustomerOrderDetails | null> {
    const orders = await this.listOrderRecords(storeId);
    const order = orders.find((item) => String(item.id ?? item.orderId) === orderId);

    if (!order || String(order.customerId ?? '') !== customerId) {
      return null;
    }

    return this.mapOrderDetails(order, storeId);
  }

  public async listOrders(
    storeId: string,
    customerId: string,
    options?: CustomerPortalQueryOptions
  ): Promise<CustomerPortalPage<CustomerOrderSummary>> {
    const limit = options?.limit ?? 10;
    const start = options?.cursor ? numberValue(options.cursor) : 0;
    const orders = (await this.listOrderRecords(storeId))
      .filter((item) => String(item.customerId ?? '') === customerId)
      .map((item) => this.mapOrderSummary(item, storeId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const pageItems = orders.slice(start, start + limit);
    const nextCursor = start + limit < orders.length ? String(start + limit) : undefined;

    return {
      items: pageItems,
      nextCursor,
      hasMore: Boolean(nextCursor),
    };
  }

  public async cancelOrder(
    request: CustomerPortalActionRequest
  ): Promise<CustomerPortalActionResult> {
    await this.patchOrderStatus(request.storeId, request.orderId, 'cancelled');
    return {
      orderId: request.orderId,
      action: 'cancel',
      success: true,
      message: 'Pedido cancelado com sucesso.',
    };
  }

  public async reorderItems(
    request: CustomerPortalActionRequest
  ): Promise<CustomerPortalActionResult> {
    return {
      orderId: request.orderId,
      action: 'reorder',
      success: true,
      message: 'Itens enviados para um novo carrinho.',
      reorderedCartId: randomId('cart'),
    };
  }

  public async requestOrderSupport(
    request: CustomerSupportRequestInput
  ): Promise<CustomerPortalActionResult> {
    const ticketId = randomId('support');
    const ticket: CustomerOrderSupportTicket = {
      ticketId,
      orderId: request.orderId,
      status: 'open',
      subject: request.subject,
      messages: [
        {
          authorType: 'customer',
          message: request.message,
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.saveRecord(
      this.storeCollection(request.storeId, `clientes/${request.customerId}/ticketsSuporte`),
      ticketId,
      ticket as unknown as StoredRecord
    );

    return {
      orderId: request.orderId,
      action: 'support',
      success: true,
      message: 'Chamado de suporte aberto.',
      supportTicketId: ticketId,
    };
  }

  public async requestExchangeOrReturn(
    request: CustomerExchangeOrReturnRequestInput
  ): Promise<CustomerPortalActionResult> {
    const requestId = randomId(request.type);
    const record: CustomerExchangeOrReturnRequest = {
      requestId,
      orderId: request.orderId,
      type: request.type,
      status: 'requested',
      reason: request.reason,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.saveRecord(
      this.storeCollection(request.storeId, `clientes/${request.customerId}/trocasDevolucoes`),
      requestId,
      record as unknown as StoredRecord
    );

    return {
      orderId: request.orderId,
      action: request.type,
      success: true,
      message:
        request.type === 'exchange'
          ? 'Solicitacao de troca aberta.'
          : 'Solicitacao de devolucao aberta.',
      exchangeOrReturnRequestId: requestId,
    };
  }

  public async listOrderNotifications(
    storeId: string,
    customerId: string,
    orderId: string
  ): Promise<CustomerOrderNotification[]> {
    const notifications = await this.listRecords<CustomerOrderNotification>(
      this.storeCollection(storeId, `clientes/${customerId}/notificacoesPedidos`)
    );
    return notifications.filter((item) => item.orderId === orderId);
  }

  public async markOrderNotificationAsRead(
    storeId: string,
    customerId: string,
    notificationId: string
  ): Promise<void> {
    await this.updateRecord(
      this.storeCollection(storeId, `clientes/${customerId}/notificacoesPedidos`),
      notificationId,
      { isRead: true },
      'Order notification'
    );
  }

  public async createAddress(address: CustomerAddress): Promise<CustomerAddress> {
    return this.saveRecord<CustomerAddress>(
      this.storeCollection(address.storeId, `clientes/${address.customerId}/enderecos`),
      address.addressId,
      address as unknown as StoredRecord
    );
  }

  public async updateAddress(
    storeId: string,
    customerId: string,
    addressId: string,
    data: Partial<CustomerAddress>
  ): Promise<CustomerAddress> {
    return this.updateRecord<CustomerAddress>(
      this.storeCollection(storeId, `clientes/${customerId}/enderecos`),
      addressId,
      data as StoredRecord,
      'Customer address'
    );
  }

  public async deleteAddress(
    storeId: string,
    customerId: string,
    addressId: string
  ): Promise<void> {
    await this.deleteRecord(
      this.storeCollection(storeId, `clientes/${customerId}/enderecos`),
      addressId
    );
  }

  public async listAddresses(
    storeId: string,
    customerId: string,
    options?: CustomerPortalQueryOptions
  ): Promise<CustomerAddress[]> {
    const addresses = await this.listRecords<CustomerAddress>(
      this.storeCollection(storeId, `clientes/${customerId}/enderecos`)
    );
    return addresses.slice(0, options?.limit ?? 10);
  }

  public async addWishlistItem(item: WishlistItem): Promise<WishlistItem> {
    return this.saveRecord<WishlistItem>(
      this.storeCollection(item.storeId, `clientes/${item.customerId}/wishlist`),
      item.wishlistItemId,
      item as unknown as StoredRecord
    );
  }

  public async removeWishlistItem(
    storeId: string,
    customerId: string,
    wishlistItemId: string
  ): Promise<void> {
    await this.deleteRecord(
      this.storeCollection(storeId, `clientes/${customerId}/wishlist`),
      wishlistItemId
    );
  }

  public async listWishlistItems(
    storeId: string,
    customerId: string,
    options?: CustomerPortalQueryOptions
  ): Promise<WishlistItem[]> {
    const items = await this.listRecords<WishlistItem>(
      this.storeCollection(storeId, `clientes/${customerId}/wishlist`)
    );
    return items.slice(0, options?.limit ?? 10);
  }

  private async listOrderRecords(storeId: string): Promise<StoredRecord[]> {
    return this.listManyRecords<StoredRecord>([
      this.storeCollection(storeId, 'pedidos'),
      this.adminCollection(storeId, 'orders'),
    ]);
  }

  private async patchOrderStatus(
    storeId: string,
    orderId: string,
    status: OrderStatus
  ): Promise<void> {
    const ecommercePath = this.storeCollection(storeId, 'pedidos');
    const adminPath = this.adminCollection(storeId, 'orders');
    const existing = await this.getRecord<StoredRecord>(ecommercePath, orderId);
    const path = existing ? ecommercePath : adminPath;
    await this.updateRecord(path, orderId, { status, updatedAt: new Date() }, 'Order');
  }

  private mapOrderSummary(data: StoredRecord, storeId: string): CustomerOrderSummary {
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      orderId: String(data.orderId ?? data.id ?? randomId('ord')),
      storeId,
      customerId: String(data.customerId ?? ''),
      status: this.mapStatus(data.status),
      totalAmount: numberValue(data.totalAmount ?? data.total),
      itemCount: numberValue(data.itemCount, items.length),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt ?? data.createdAt),
      estimatedDeliveryDate: optionalDate(data.estimatedDeliveryDate),
      trackingCode: data.trackingCode ? String(data.trackingCode) : undefined,
      carrierName: data.carrierName ? String(data.carrierName) : undefined,
    };
  }

  private mapOrderDetails(data: StoredRecord, storeId: string): CustomerOrderDetails {
    const summary = this.mapOrderSummary(data, storeId);
    const items = Array.isArray(data.items) ? data.items.map((item) => asRecord(item)) : [];
    const documents = Array.isArray(data.documents)
      ? (normalizeValue(data.documents) as CustomerOrderDocument[])
      : [];

    return {
      ...summary,
      timeline: [
        {
          status: summary.status,
          label: `Pedido ${summary.status}`,
          createdAt: summary.updatedAt,
          visualVariant: summary.status === 'cancelled' ? 'warning' : 'info',
          isCustomerVisible: true,
        },
      ],
      items: items.map((item) => ({
        productId: String(item.productId ?? ''),
        productName: String(item.productName ?? item.name ?? ''),
        quantity: numberValue(item.quantity, 1),
        unitPrice: numberValue(item.unitPrice ?? item.price),
        totalPrice: numberValue(
          item.totalPrice,
          numberValue(item.quantity, 1) * numberValue(item.unitPrice ?? item.price)
        ),
        imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
      })),
      financialDetails: {
        subtotalAmount: numberValue(data.subtotalAmount ?? data.subtotal ?? data.total),
        discountAmount: numberValue(data.discountAmount),
        shippingAmount: numberValue(data.shippingAmount),
        totalAmount: summary.totalAmount,
        paymentMethodLabel: data.paymentMethodLabel ? String(data.paymentMethodLabel) : undefined,
        installmentsLabel: data.installmentsLabel ? String(data.installmentsLabel) : undefined,
      } satisfies CustomerOrderFinancialDetails,
      trackingDetails: {
        trackingCode: summary.trackingCode,
        carrierName: summary.carrierName,
        carrierTrackingUrl: data.carrierTrackingUrl ? String(data.carrierTrackingUrl) : undefined,
        estimatedDeliveryDate: summary.estimatedDeliveryDate,
      },
      documents,
    };
  }

  private mapStatus(status: unknown): OrderStatus {
    const value = String(status ?? 'pending');
    if (value === 'completed') {
      return 'delivered';
    }
    if (value === 'processing') {
      return 'processing';
    }
    if (value === 'cancelled') {
      return 'cancelled';
    }
    if (value === 'paid') {
      return 'paid';
    }
    if (value === 'shipped') {
      return 'shipped';
    }
    return 'pending';
  }
}

export type { CustomerOrderHistoryResult, CheckoutItem };
