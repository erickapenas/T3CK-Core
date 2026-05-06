// Este modulo aplica regras fiscais no checkout sem travar a conversao.
// Validacao usa cache; emissao de NF-e e enviada para job/background.
export interface CheckoutItem {
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  ncmCode: string;
  cestCode?: string;
  originState: string;
  destinationState: string;
  taxClassificationId: string;
}

export interface TaxRule {
  id: string;
  storeId: string;
  originState: string;
  destinationState: string;
  category?: string;
  ncmCode?: string;
  icmsRate: number;
  stRate?: number;
  cfop: string;
  isActive: boolean;
}

export interface TaxCalculationItemResult {
  productId: string;
  productName: string;
  baseValue: number;
  icmsAmount: number;
  stAmount: number;
  totalTaxAmount: number;
  appliedRuleId: string;
  cfop: string;
}

export interface TaxCalculationResult {
  items: TaxCalculationItemResult[];
  totalIcmsAmount: number;
  totalStAmount: number;
  totalTaxAmount: number;
  isValidForCheckout: boolean;
  validationErrors: string[];
  completedAt: Date;
}

export interface InvoicePayload {
  orderId: string;
  storeId: string;
  customerId: string;
  items: CheckoutItem[];
  taxes: TaxCalculationResult;
  totalAmount: number;
}

export interface InvoiceResponse {
  success: boolean;
  status: 'queued' | 'issued' | 'failed';
  invoiceNumber?: string;
  accessKey?: string;
  xmlUrl?: string;
  pdfUrl?: string;
  jobId?: string;
  errorMessage?: string;
}

export interface TaxRuleRepository {
  findApplicableRule(input: {
    storeId: string;
    originState: string;
    destinationState: string;
    category?: string;
    ncmCode?: string;
  }): Promise<TaxRule | null>;
  createTaxRule(rule: TaxRule): Promise<TaxRule>;
  updateTaxRule(storeId: string, ruleId: string, data: Partial<TaxRule>): Promise<TaxRule>;
  deleteTaxRule(storeId: string, ruleId: string): Promise<void>;
  listTaxRules(storeId: string): Promise<TaxRule[]>;
}

export interface InvoiceRepository {
  saveInvoiceResult(payload: InvoicePayload, response: InvoiceResponse): Promise<void>;
}

export interface InvoiceProvider {
  issueNFe(payload: InvoicePayload): Promise<InvoiceResponse>;
}

export interface BackgroundInvoiceJobScheduler {
  enqueueInvoiceIssuance(payload: InvoicePayload): Promise<{
    jobId: string;
    acceptedAt: Date;
  }>;
}

export interface TaxAutomationDependencies {
  taxRuleRepository: TaxRuleRepository;
  invoiceRepository: InvoiceRepository;
  invoiceProvider: InvoiceProvider;
  backgroundInvoiceJobScheduler: BackgroundInvoiceJobScheduler;
}

export class DefaultBackgroundInvoiceJobScheduler implements BackgroundInvoiceJobScheduler {
  // Fallback simples para integracao inicial; em producao o ideal e apontar para a fila real do projeto.
  public async enqueueInvoiceIssuance(): Promise<{
    jobId: string;
    acceptedAt: Date;
  }> {
    return {
      jobId: `invoice_job_${Date.now()}`,
      acceptedAt: new Date(),
    };
  }
}

interface CachedTaxRuleEntry {
  expiresAt: number;
  rule: TaxRule | null;
}

export class EcommerceTaxAutomationService {
  // Cache local reduz leituras repetidas de regras fiscais no momento mais sensivel do checkout.
  private readonly taxRuleCache = new Map<string, CachedTaxRuleEntry>();
  private readonly taxRuleCacheTtlMs: number;
  private readonly maxItemsPerValidation: number;

  constructor(
    private readonly taxRuleRepository: TaxRuleRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly invoiceProvider: InvoiceProvider,
    private readonly backgroundInvoiceJobScheduler: BackgroundInvoiceJobScheduler,
    options?: {
      taxRuleCacheTtlMs?: number;
      maxItemsPerValidation?: number;
    }
  ) {
    this.taxRuleCacheTtlMs = options?.taxRuleCacheTtlMs ?? 300000;
    this.maxItemsPerValidation = options?.maxItemsPerValidation ?? 100;
  }

  public static create(
    dependencies: TaxAutomationDependencies,
    options?: {
      taxRuleCacheTtlMs?: number;
      maxItemsPerValidation?: number;
    }
  ): EcommerceTaxAutomationService {
    // Helper para wiring mais simples no projeto principal.
    return new EcommerceTaxAutomationService(
      dependencies.taxRuleRepository,
      dependencies.invoiceRepository,
      dependencies.invoiceProvider,
      dependencies.backgroundInvoiceJobScheduler,
      options
    );
  }

  public async createTaxRule(rule: TaxRule): Promise<TaxRule> {
    return this.taxRuleRepository.createTaxRule(rule);
  }

  public async updateTaxRule(
    storeId: string,
    ruleId: string,
    data: Partial<TaxRule>
  ): Promise<TaxRule> {
    const updatedRule = await this.taxRuleRepository.updateTaxRule(storeId, ruleId, data);
    this.invalidateStoreCache(storeId);
    return updatedRule;
  }

  public async deleteTaxRule(storeId: string, ruleId: string): Promise<void> {
    await this.taxRuleRepository.deleteTaxRule(storeId, ruleId);
    this.invalidateStoreCache(storeId);
  }

  public async listTaxRules(storeId: string): Promise<TaxRule[]> {
    return this.taxRuleRepository.listTaxRules(storeId);
  }

  public async warmTaxRulesCache(storeId: string): Promise<void> {
    // Warm-up opcional para lojas com volume alto antes de picos de checkout.
    const rules = await this.taxRuleRepository.listTaxRules(storeId);
    const now = Date.now();

    for (const rule of rules.filter((item) => item.isActive)) {
      this.taxRuleCache.set(this.buildCacheKeyFromRule(rule), {
        rule,
        expiresAt: now + this.taxRuleCacheTtlMs,
      });
    }
  }

  public async validateCheckoutTaxes(input: {
    storeId: string;
    items: CheckoutItem[];
  }): Promise<TaxCalculationResult> {
    if (input.items.length > this.maxItemsPerValidation) {
      return {
        items: [],
        totalIcmsAmount: 0,
        totalStAmount: 0,
        totalTaxAmount: 0,
        isValidForCheckout: false,
        validationErrors: [
          `Checkout excedeu o limite de ${this.maxItemsPerValidation} itens para validacao fiscal online.`,
        ],
        completedAt: new Date(),
      };
    }

    // Cada item e calculado em paralelo para encurtar a ultima etapa assincrona do checkout.
    const itemResults = await Promise.all(
      input.items.map(async (item) => {
        const rule = await this.getApplicableRule(input.storeId, item);

        if (!rule || !rule.isActive) {
          return {
            error: `Regra fiscal nao encontrada para o produto ${item.productName}.`,
          };
        }

        const baseValue = Number((item.unitPrice * item.quantity).toFixed(2));
        const icmsAmount = Number(((baseValue * rule.icmsRate) / 100).toFixed(2));
        const stAmount = Number(((baseValue * (rule.stRate ?? 0)) / 100).toFixed(2));

        return {
          item: {
            productId: item.productId,
            productName: item.productName,
            baseValue,
            icmsAmount,
            stAmount,
            totalTaxAmount: Number((icmsAmount + stAmount).toFixed(2)),
            appliedRuleId: rule.id,
            cfop: rule.cfop,
          } satisfies TaxCalculationItemResult,
        };
      })
    );

    const validationErrors = itemResults
      .filter((result): result is { error: string } => 'error' in result)
      .map((result) => result.error);

    const items = itemResults
      .filter((result): result is { item: TaxCalculationItemResult } => 'item' in result)
      .map((result) => result.item);

    const totalIcmsAmount = Number(
      items.reduce((sum, item) => sum + item.icmsAmount, 0).toFixed(2)
    );
    const totalStAmount = Number(items.reduce((sum, item) => sum + item.stAmount, 0).toFixed(2));

    return {
      items,
      totalIcmsAmount,
      totalStAmount,
      totalTaxAmount: Number((totalIcmsAmount + totalStAmount).toFixed(2)),
      isValidForCheckout: validationErrors.length === 0,
      validationErrors,
      completedAt: new Date(),
    };
  }

  public async issueInvoice(payload: InvoicePayload): Promise<InvoiceResponse> {
    // O checkout recebe confirmacao de fila, nao espera emissao completa da nota.
    if (!payload.taxes.isValidForCheckout) {
      return {
        success: false,
        status: 'failed',
        errorMessage:
          'Checkout fiscal invalido. Corrija as regras tributarias antes de emitir a NF-e.',
      };
    }

    const job = await this.backgroundInvoiceJobScheduler.enqueueInvoiceIssuance(payload);
    const queuedResponse: InvoiceResponse = {
      success: true,
      status: 'queued',
      jobId: job.jobId,
    };

    await this.invoiceRepository.saveInvoiceResult(payload, queuedResponse);
    return queuedResponse;
  }

  public async processInvoiceIssuanceJob(payload: InvoicePayload): Promise<InvoiceResponse> {
    // Metodo destinado ao worker que efetivamente chama o provider de NF-e.
    const response = await this.invoiceProvider.issueNFe(payload);
    await this.invoiceRepository.saveInvoiceResult(payload, response);
    return response;
  }

  private async getApplicableRule(storeId: string, item: CheckoutItem): Promise<TaxRule | null> {
    // A chave de cache usa os campos que mais influenciam a regra tributaria aplicavel.
    const cacheKey = this.buildCacheKey(storeId, item);
    const cached = this.taxRuleCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.rule;
    }

    const rule = await this.taxRuleRepository.findApplicableRule({
      storeId,
      originState: item.originState,
      destinationState: item.destinationState,
      category: item.category,
      ncmCode: item.ncmCode,
    });

    this.taxRuleCache.set(cacheKey, {
      rule,
      expiresAt: Date.now() + this.taxRuleCacheTtlMs,
    });

    return rule;
  }

  private buildCacheKey(storeId: string, item: CheckoutItem): string {
    return [storeId, item.originState, item.destinationState, item.category, item.ncmCode].join(
      ':'
    );
  }

  private buildCacheKeyFromRule(rule: TaxRule): string {
    return [
      rule.storeId,
      rule.originState,
      rule.destinationState,
      rule.category ?? '*',
      rule.ncmCode ?? '*',
    ].join(':');
  }

  private invalidateStoreCache(storeId: string): void {
    for (const key of this.taxRuleCache.keys()) {
      if (key.startsWith(`${storeId}:`)) {
        this.taxRuleCache.delete(key);
      }
    }
  }
}
