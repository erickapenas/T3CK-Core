import * as admin from 'firebase-admin';
import {
  AnalyticsRepositoryImpl,
  CRMRepositoryImpl,
  CatalogRepositoryImpl,
  CartRepositoryImpl,
  CarrierConfigRepositoryImpl,
  ChatbotAnalyticsRepositoryImpl,
  ChatbotHandoffRepositoryImpl,
  ChatbotSessionRepositoryImpl,
  ConversationMemoryRepositoryImpl,
  CouponRepositoryImpl,
  CustomerInteractionRepositoryImpl,
  CustomerPortalRepositoryImpl,
  CustomerPreferenceRepositoryImpl,
  CustomerRecoveryRepositoryImpl,
  InvoiceRepositoryImpl,
  LegalDocumentRepositoryImpl,
  PersonalizationSnapshotRepositoryImpl,
  RecoveryCampaignRepositoryImpl,
  ShippingTableRepositoryImpl,
  StoreLegalProfileRepositoryImpl,
  TaxRuleRepositoryImpl,
} from './firebase-repositories';

export interface LazyFirebaseRepositories {
  getCatalogRepository(): CatalogRepositoryImpl;
  getChatbotSessionRepository(): ChatbotSessionRepositoryImpl;
  getCustomerPreferenceRepository(): CustomerPreferenceRepositoryImpl;
  getConversationMemoryRepository(): ConversationMemoryRepositoryImpl;
  getChatbotAnalyticsRepository(): ChatbotAnalyticsRepositoryImpl;
  getChatbotHandoffRepository(): ChatbotHandoffRepositoryImpl;
  getCustomerInteractionRepository(): CustomerInteractionRepositoryImpl;
  getPersonalizationSnapshotRepository(): PersonalizationSnapshotRepositoryImpl;
  getCustomerPortalRepository(): CustomerPortalRepositoryImpl;
  getCartRepository(): CartRepositoryImpl;
  getCustomerRecoveryRepository(): CustomerRecoveryRepositoryImpl;
  getRecoveryCampaignRepository(): RecoveryCampaignRepositoryImpl;
  getCouponRepository(): CouponRepositoryImpl;
  getShippingTableRepository(): ShippingTableRepositoryImpl;
  getCarrierConfigRepository(): CarrierConfigRepositoryImpl;
  getAnalyticsRepository(): AnalyticsRepositoryImpl;
  getCRMRepository(): CRMRepositoryImpl;
  getTaxRuleRepository(): TaxRuleRepositoryImpl;
  getInvoiceRepository(): InvoiceRepositoryImpl;
  getStoreLegalProfileRepository(): StoreLegalProfileRepositoryImpl;
  getLegalDocumentRepository(): LegalDocumentRepositoryImpl;
}

export function createLazyFirebaseRepositories(
  db: admin.firestore.Firestore | null
): LazyFirebaseRepositories {
  let catalogRepository: CatalogRepositoryImpl | undefined;
  let chatbotSessionRepository: ChatbotSessionRepositoryImpl | undefined;
  let customerPreferenceRepository: CustomerPreferenceRepositoryImpl | undefined;
  let conversationMemoryRepository: ConversationMemoryRepositoryImpl | undefined;
  let chatbotAnalyticsRepository: ChatbotAnalyticsRepositoryImpl | undefined;
  let chatbotHandoffRepository: ChatbotHandoffRepositoryImpl | undefined;
  let customerInteractionRepository: CustomerInteractionRepositoryImpl | undefined;
  let personalizationSnapshotRepository: PersonalizationSnapshotRepositoryImpl | undefined;
  let customerPortalRepository: CustomerPortalRepositoryImpl | undefined;
  let cartRepository: CartRepositoryImpl | undefined;
  let customerRecoveryRepository: CustomerRecoveryRepositoryImpl | undefined;
  let recoveryCampaignRepository: RecoveryCampaignRepositoryImpl | undefined;
  let couponRepository: CouponRepositoryImpl | undefined;
  let shippingTableRepository: ShippingTableRepositoryImpl | undefined;
  let carrierConfigRepository: CarrierConfigRepositoryImpl | undefined;
  let analyticsRepository: AnalyticsRepositoryImpl | undefined;
  let crmRepository: CRMRepositoryImpl | undefined;
  let taxRuleRepository: TaxRuleRepositoryImpl | undefined;
  let invoiceRepository: InvoiceRepositoryImpl | undefined;
  let storeLegalProfileRepository: StoreLegalProfileRepositoryImpl | undefined;
  let legalDocumentRepository: LegalDocumentRepositoryImpl | undefined;

  return {
    getCatalogRepository: () => (catalogRepository ??= new CatalogRepositoryImpl(db)),
    getChatbotSessionRepository: () =>
      (chatbotSessionRepository ??= new ChatbotSessionRepositoryImpl(db)),
    getCustomerPreferenceRepository: () =>
      (customerPreferenceRepository ??= new CustomerPreferenceRepositoryImpl(db)),
    getConversationMemoryRepository: () =>
      (conversationMemoryRepository ??= new ConversationMemoryRepositoryImpl(db)),
    getChatbotAnalyticsRepository: () =>
      (chatbotAnalyticsRepository ??= new ChatbotAnalyticsRepositoryImpl(db)),
    getChatbotHandoffRepository: () =>
      (chatbotHandoffRepository ??= new ChatbotHandoffRepositoryImpl(db)),
    getCustomerInteractionRepository: () =>
      (customerInteractionRepository ??= new CustomerInteractionRepositoryImpl(db)),
    getPersonalizationSnapshotRepository: () =>
      (personalizationSnapshotRepository ??= new PersonalizationSnapshotRepositoryImpl(db)),
    getCustomerPortalRepository: () =>
      (customerPortalRepository ??= new CustomerPortalRepositoryImpl(db)),
    getCartRepository: () => (cartRepository ??= new CartRepositoryImpl(db)),
    getCustomerRecoveryRepository: () =>
      (customerRecoveryRepository ??= new CustomerRecoveryRepositoryImpl(db)),
    getRecoveryCampaignRepository: () =>
      (recoveryCampaignRepository ??= new RecoveryCampaignRepositoryImpl(db)),
    getCouponRepository: () => (couponRepository ??= new CouponRepositoryImpl(db)),
    getShippingTableRepository: () =>
      (shippingTableRepository ??= new ShippingTableRepositoryImpl(db)),
    getCarrierConfigRepository: () =>
      (carrierConfigRepository ??= new CarrierConfigRepositoryImpl(db)),
    getAnalyticsRepository: () => (analyticsRepository ??= new AnalyticsRepositoryImpl(db)),
    getCRMRepository: () => (crmRepository ??= new CRMRepositoryImpl(db)),
    getTaxRuleRepository: () => (taxRuleRepository ??= new TaxRuleRepositoryImpl(db)),
    getInvoiceRepository: () => (invoiceRepository ??= new InvoiceRepositoryImpl(db)),
    getStoreLegalProfileRepository: () =>
      (storeLegalProfileRepository ??= new StoreLegalProfileRepositoryImpl(db)),
    getLegalDocumentRepository: () =>
      (legalDocumentRepository ??= new LegalDocumentRepositoryImpl(db)),
  };
}
