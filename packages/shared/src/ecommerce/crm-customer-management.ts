// Este modulo representa a camada de CRM e segmentacao de marketing.
// O refresh de segmentos foi separado em job para nao concorrer com requests online.
export interface CustomerContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface CustomerBehaviorSummary {
  totalOrders: number;
  totalRevenue: number;
  lastOrderAt?: Date;
  lastVisitAt?: Date;
  favoriteCategoryIds: string[];
  favoriteProductIds: string[];
  averageTicket?: number;
  lifetimeValueSnapshot?: number;
  acquisitionCostSnapshot?: number;
  daysSinceLastPurchaseSnapshot?: number;
  engagementScoreSnapshot?: number;
  churnRiskSnapshot?: number;
}

export interface CustomerCommunicationConsent {
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
  push: boolean;
  consentedAt?: Date;
  revokedAt?: Date;
  source?: string;
}

export interface CustomerUnifiedProfile {
  preferredChannel?: 'email' | 'whatsapp' | 'sms' | 'push';
  favoriteCategoryIds: string[];
  favoriteProductIds: string[];
  lastInteractionAt?: Date;
  lifetimeValue?: number;
  acquisitionCost?: number;
  daysSinceLastPurchase?: number;
  engagementScore?: number;
  churnRisk?: number;
}

export interface CustomerTimelineEvent {
  id: string;
  storeId: string;
  customerId: string;
  type:
    | 'signup'
    | 'login'
    | 'product-view'
    | 'add-to-cart'
    | 'wishlist'
    | 'purchase'
    | 'campaign-sent'
    | 'campaign-open'
    | 'campaign-click'
    | 'support'
    | 'manual-note';
  title: string;
  description?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: Date;
}

export interface CustomerSegment {
  id: string;
  storeId: string;
  name: string;
  description?: string;
  rules: Array<{
    field:
      | 'totalOrders'
      | 'totalRevenue'
      | 'averageTicket'
      | 'favoriteCategoryIds'
      | 'lastOrderAt'
      | 'lastVisitAt'
      | 'lifetimeValueSnapshot'
      | 'acquisitionCostSnapshot'
      | 'daysSinceLastPurchaseSnapshot'
      | 'engagementScoreSnapshot'
      | 'churnRiskSnapshot'
      | 'tags'
      | 'preferredChannel';
    operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'contains' | 'days_since_gte' | 'in';
    value: string | number;
  }>;
  isActive: boolean;
}

export interface CRMCustomerRecord {
  customerId: string;
  storeId: string;
  contact: CustomerContact;
  behavior: CustomerBehaviorSummary;
  consent: CustomerCommunicationConsent;
  unifiedProfile: CustomerUnifiedProfile;
  tags: string[];
  segmentIds: string[];
  marketingOptIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailCampaignDraft {
  id: string;
  storeId: string;
  name: string;
  segmentIds: string[];
  subject: string;
  previewText?: string;
  body: string;
  status: 'draft' | 'scheduled' | 'sent';
  scheduledAt?: Date;
  createdAt: Date;
}

export interface CampaignMetrics {
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  convertedCount: number;
  revenueAmount: number;
  updatedAt: Date;
}

export interface EmailCampaignRecord extends EmailCampaignDraft {
  metrics: CampaignMetrics;
}

export interface BackgroundJobScheduler {
  enqueue(
    jobName: string,
    payload: Record<string, unknown>
  ): Promise<{
    jobId: string;
    enqueuedAt: Date;
  }>;
}

export interface CRMRepository {
  createCustomer(record: CRMCustomerRecord): Promise<CRMCustomerRecord>;
  updateCustomer(
    storeId: string,
    customerId: string,
    data: Partial<CRMCustomerRecord>
  ): Promise<CRMCustomerRecord>;
  deleteCustomer(storeId: string, customerId: string): Promise<void>;
  getCustomer(storeId: string, customerId: string): Promise<CRMCustomerRecord | null>;
  listCustomers(storeId: string): Promise<CRMCustomerRecord[]>;
  createSegment(segment: CustomerSegment): Promise<CustomerSegment>;
  updateSegment(
    storeId: string,
    segmentId: string,
    data: Partial<CustomerSegment>
  ): Promise<CustomerSegment>;
  deleteSegment(storeId: string, segmentId: string): Promise<void>;
  listSegments(storeId: string): Promise<CustomerSegment[]>;
  saveEmailCampaignDraft(draft: EmailCampaignDraft): Promise<EmailCampaignDraft>;
  listEmailCampaignDrafts(storeId: string): Promise<EmailCampaignDraft[]>;
  saveTimelineEvent(event: CustomerTimelineEvent): Promise<CustomerTimelineEvent>;
  listTimelineEvents(storeId: string, customerId: string): Promise<CustomerTimelineEvent[]>;
  saveCampaignRecord(campaign: EmailCampaignRecord): Promise<EmailCampaignRecord>;
  getCampaignRecord(storeId: string, campaignId: string): Promise<EmailCampaignRecord | null>;
}

export class EcommerceCRMService {
  constructor(
    private readonly crmRepository: CRMRepository,
    private readonly backgroundJobScheduler: BackgroundJobScheduler
  ) {}

  public async createCustomer(record: CRMCustomerRecord): Promise<CRMCustomerRecord> {
    return this.crmRepository.createCustomer({
      ...record,
      consent: record.consent ?? {
        email: record.marketingOptIn,
        whatsapp: false,
        sms: false,
        push: false,
      },
      unifiedProfile: record.unifiedProfile ?? this.buildUnifiedProfile(record),
    });
  }

  public async updateCustomer(
    storeId: string,
    customerId: string,
    data: Partial<CRMCustomerRecord>
  ): Promise<CRMCustomerRecord> {
    return this.crmRepository.updateCustomer(storeId, customerId, data);
  }

  public async deleteCustomer(storeId: string, customerId: string): Promise<void> {
    await this.crmRepository.deleteCustomer(storeId, customerId);
  }

  public async getCustomer(storeId: string, customerId: string): Promise<CRMCustomerRecord | null> {
    const customer = await this.crmRepository.getCustomer(storeId, customerId);

    if (!customer) {
      return null;
    }

    return {
      ...customer,
      consent: customer.consent ?? {
        email: customer.marketingOptIn,
        whatsapp: false,
        sms: false,
        push: false,
      },
      unifiedProfile: customer.unifiedProfile ?? this.buildUnifiedProfile(customer),
    };
  }

  public async listCustomers(storeId: string): Promise<CRMCustomerRecord[]> {
    const customers = await this.crmRepository.listCustomers(storeId);
    return customers.map((customer) => ({
      ...customer,
      consent: customer.consent ?? {
        email: customer.marketingOptIn,
        whatsapp: false,
        sms: false,
        push: false,
      },
      unifiedProfile: customer.unifiedProfile ?? this.buildUnifiedProfile(customer),
    }));
  }

  public async createSegment(segment: CustomerSegment): Promise<CustomerSegment> {
    return this.crmRepository.createSegment(segment);
  }

  public async updateSegment(
    storeId: string,
    segmentId: string,
    data: Partial<CustomerSegment>
  ): Promise<CustomerSegment> {
    return this.crmRepository.updateSegment(storeId, segmentId, data);
  }

  public async deleteSegment(storeId: string, segmentId: string): Promise<void> {
    await this.crmRepository.deleteSegment(storeId, segmentId);
  }

  public async listSegments(storeId: string): Promise<CustomerSegment[]> {
    return this.crmRepository.listSegments(storeId);
  }

  public async refreshCustomerSegments(storeId: string): Promise<{
    jobId: string;
    enqueuedAt: Date;
  }> {
    // O painel apenas agenda a tarefa; a reclassificacao pesada acontece depois.
    return this.backgroundJobScheduler.enqueue('crm.refreshCustomerSegments', {
      storeId,
      requestedAt: new Date().toISOString(),
    });
  }

  public async processSegmentRefreshJob(storeId: string): Promise<CRMCustomerRecord[]> {
    // Worker responsavel por recalcular os segmentos de todos os clientes da loja.
    const [customers, segments] = await Promise.all([
      this.crmRepository.listCustomers(storeId),
      this.crmRepository.listSegments(storeId),
    ]);

    const activeSegments = segments.filter((segment) => segment.isActive);
    const updatedCustomers: CRMCustomerRecord[] = [];

    for (const customer of customers) {
      const matchedSegmentIds = activeSegments
        .filter((segment) => this.matchesSegment(customer, segment))
        .map((segment) => segment.id);

      const updated = await this.crmRepository.updateCustomer(storeId, customer.customerId, {
        segmentIds: matchedSegmentIds,
        unifiedProfile: this.buildUnifiedProfile({
          ...customer,
          segmentIds: matchedSegmentIds,
        }),
        updatedAt: new Date(),
      });

      updatedCustomers.push(updated);
    }

    return updatedCustomers;
  }

  public async createEmailCampaignDraft(input: {
    storeId: string;
    name: string;
    segmentIds: string[];
    subject: string;
    previewText?: string;
    body: string;
    scheduledAt?: Date;
  }): Promise<EmailCampaignDraft> {
    const draft: EmailCampaignDraft = {
      id: `${input.storeId}_${Date.now()}`,
      storeId: input.storeId,
      name: input.name,
      segmentIds: input.segmentIds,
      subject: input.subject,
      previewText: input.previewText,
      body: input.body,
      status: input.scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: input.scheduledAt,
      createdAt: new Date(),
    };

    return this.crmRepository.saveEmailCampaignDraft(draft);
  }

  public async listEmailCampaignDrafts(storeId: string): Promise<EmailCampaignDraft[]> {
    return this.crmRepository.listEmailCampaignDrafts(storeId);
  }

  public async updateCustomerConsent(input: {
    storeId: string;
    customerId: string;
    consent: Partial<CustomerCommunicationConsent>;
  }): Promise<CRMCustomerRecord> {
    const existing = await this.crmRepository.getCustomer(input.storeId, input.customerId);

    if (!existing) {
      throw new Error('Cliente nao encontrado para atualizacao de consentimento.');
    }

    const nextConsent: CustomerCommunicationConsent = {
      email: existing.consent?.email ?? existing.marketingOptIn,
      whatsapp: existing.consent?.whatsapp ?? false,
      sms: existing.consent?.sms ?? false,
      push: existing.consent?.push ?? false,
      consentedAt: input.consent.consentedAt ?? existing.consent?.consentedAt,
      revokedAt: input.consent.revokedAt ?? existing.consent?.revokedAt,
      source: input.consent.source ?? existing.consent?.source,
      ...input.consent,
    };

    return this.crmRepository.updateCustomer(input.storeId, input.customerId, {
      consent: nextConsent,
      marketingOptIn: nextConsent.email,
      updatedAt: new Date(),
    });
  }

  public async addTimelineEvent(event: CustomerTimelineEvent): Promise<CustomerTimelineEvent> {
    // Timeline agrega contexto do cliente sem interferir no fluxo principal do CRM.
    return this.crmRepository.saveTimelineEvent(event);
  }

  public async listCustomerTimeline(
    storeId: string,
    customerId: string
  ): Promise<CustomerTimelineEvent[]> {
    return this.crmRepository.listTimelineEvents(storeId, customerId);
  }

  public async getUnifiedCustomerProfile(
    storeId: string,
    customerId: string
  ): Promise<CustomerUnifiedProfile | null> {
    const customer = await this.getCustomer(storeId, customerId);
    return customer ? customer.unifiedProfile : null;
  }

  public async createCampaignRecord(input: {
    storeId: string;
    name: string;
    segmentIds: string[];
    subject: string;
    previewText?: string;
    body: string;
    scheduledAt?: Date;
  }): Promise<EmailCampaignRecord> {
    const draft = await this.createEmailCampaignDraft(input);

    return this.crmRepository.saveCampaignRecord({
      ...draft,
      metrics: {
        sentCount: 0,
        deliveredCount: 0,
        openedCount: 0,
        clickedCount: 0,
        convertedCount: 0,
        revenueAmount: 0,
        updatedAt: new Date(),
      },
    });
  }

  public async updateCampaignMetrics(input: {
    storeId: string;
    campaignId: string;
    metrics: Partial<CampaignMetrics>;
  }): Promise<EmailCampaignRecord> {
    const existing = await this.crmRepository.getCampaignRecord(input.storeId, input.campaignId);

    if (!existing) {
      throw new Error('Campanha nao encontrada para atualizacao de metricas.');
    }

    return this.crmRepository.saveCampaignRecord({
      ...existing,
      metrics: {
        ...existing.metrics,
        ...input.metrics,
        updatedAt: input.metrics.updatedAt ?? new Date(),
      },
    });
  }

  private matchesSegment(customer: CRMCustomerRecord, segment: CustomerSegment): boolean {
    // Regras usam snapshots simples para evitar queries e calculos pesados em tempo real.
    return segment.rules.every((rule) => {
      const value = this.resolveFieldValue(customer, rule.field);

      if (rule.operator === 'contains') {
        if (Array.isArray(value)) {
          return value.includes(String(rule.value));
        }

        return typeof value === 'string' && value.includes(String(rule.value));
      }

      if (rule.operator === 'in') {
        return Array.isArray(value)
          ? value.includes(String(rule.value))
          : String(value ?? '') === String(rule.value);
      }

      if (rule.operator === 'days_since_gte') {
        const daysValue =
          typeof value === 'number'
            ? value
            : value instanceof Date
              ? Math.floor((Date.now() - value.getTime()) / 86400000)
              : Number.NaN;

        return !Number.isNaN(daysValue) && daysValue >= Number(rule.value);
      }

      const numericValue = typeof value === 'number' ? value : Number.NaN;
      const comparisonValue = Number(rule.value);

      if (Number.isNaN(numericValue) || Number.isNaN(comparisonValue)) {
        return false;
      }

      switch (rule.operator) {
        case 'gt':
          return numericValue > comparisonValue;
        case 'gte':
          return numericValue >= comparisonValue;
        case 'lt':
          return numericValue < comparisonValue;
        case 'lte':
          return numericValue <= comparisonValue;
        case 'eq':
          return numericValue === comparisonValue;
        default:
          return false;
      }
    });
  }

  private resolveFieldValue(
    customer: CRMCustomerRecord,
    field: CustomerSegment['rules'][number]['field']
  ): number | string | string[] | Date | undefined {
    switch (field) {
      case 'totalOrders':
        return customer.behavior.totalOrders;
      case 'totalRevenue':
        return customer.behavior.totalRevenue;
      case 'averageTicket':
        return customer.behavior.averageTicket;
      case 'favoriteCategoryIds':
        return customer.behavior.favoriteCategoryIds;
      case 'lastOrderAt':
        return customer.behavior.lastOrderAt;
      case 'lastVisitAt':
        return customer.behavior.lastVisitAt;
      case 'lifetimeValueSnapshot':
        return customer.behavior.lifetimeValueSnapshot;
      case 'acquisitionCostSnapshot':
        return customer.behavior.acquisitionCostSnapshot;
      case 'daysSinceLastPurchaseSnapshot':
        return customer.behavior.daysSinceLastPurchaseSnapshot;
      case 'engagementScoreSnapshot':
        return customer.behavior.engagementScoreSnapshot;
      case 'churnRiskSnapshot':
        return customer.behavior.churnRiskSnapshot;
      case 'tags':
        return customer.tags;
      case 'preferredChannel':
        return customer.unifiedProfile.preferredChannel;
      default:
        return undefined;
    }
  }

  private buildUnifiedProfile(customer: CRMCustomerRecord): CustomerUnifiedProfile {
    return {
      preferredChannel:
        customer.unifiedProfile?.preferredChannel ??
        (customer.consent?.whatsapp
          ? 'whatsapp'
          : customer.consent?.email || customer.marketingOptIn
            ? 'email'
            : customer.consent?.sms
              ? 'sms'
              : customer.consent?.push
                ? 'push'
                : undefined),
      favoriteCategoryIds: customer.behavior.favoriteCategoryIds,
      favoriteProductIds: customer.behavior.favoriteProductIds,
      lastInteractionAt: customer.behavior.lastVisitAt ?? customer.behavior.lastOrderAt,
      lifetimeValue: customer.behavior.lifetimeValueSnapshot ?? customer.behavior.totalRevenue ?? 0,
      acquisitionCost: customer.behavior.acquisitionCostSnapshot,
      daysSinceLastPurchase: customer.behavior.daysSinceLastPurchaseSnapshot,
      engagementScore: customer.behavior.engagementScoreSnapshot,
      churnRisk: customer.behavior.churnRiskSnapshot,
    };
  }
}
