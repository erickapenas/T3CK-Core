// Este modulo centraliza motor de cupons e simulacao de frete.
// A consulta a transportadoras continua desacoplada via provider para facilitar adaptacao ao projeto real.
export interface Coupon {
  id: string;
  storeId: string;
  code: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'free-shipping';
  value: number;
  minimumOrderValue?: number;
  maximumDiscountValue?: number;
  usageLimit?: number;
  usageCount: number;
  startsAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  eligibleCategoryIds?: string[];
  eligibleProductIds?: string[];
  priority?: number;
  promotionGroup?: string;
  exclusiveWithCouponIds?: string[];
}

export interface ShippingTableRule {
  id: string;
  storeId: string;
  name: string;
  zipCodeStart: string;
  zipCodeEnd: string;
  minimumDeliveryDays: number;
  maximumDeliveryDays: number;
  cost: number;
  freeShippingMinimumOrderValue?: number;
  carrierName: string;
  isActive: boolean;
  regionName?: string;
  minimumWeightKg?: number;
  maximumWeightKg?: number;
}

export interface CarrierIntegrationConfig {
  id: string;
  storeId: string;
  carrierName: string;
  apiBaseUrl: string;
  apiTokenReference: string;
  serviceCodes: string[];
  isActive: boolean;
}

export interface CarrierQuoteRequest {
  storeId: string;
  zipCode: string;
  orderValue: number;
  totalWeightKg: number;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
}

export interface CarrierQuote {
  carrierName: string;
  serviceName: string;
  price: number;
  deliveryDays: number;
  isAvailable: boolean;
  externalReference?: string;
  errorMessage?: string;
}

export interface BestCarrierRecommendation {
  cheapest?: CarrierQuote;
  fastest?: CarrierQuote;
  bestValue?: CarrierQuote;
  allAvailableQuotes: CarrierQuote[];
}

export interface AppliedCouponResult {
  isValid: boolean;
  discountAmount: number;
  finalOrderValue: number;
  freeShippingApplied: boolean;
  reason?: string;
  coupon?: Coupon;
  appliedCoupons?: Coupon[];
  conflicts?: string[];
}

export interface ShippingSimulationResult {
  matchedTableRules: ShippingTableRule[];
  bestCarrierRecommendation: BestCarrierRecommendation;
  unavailableQuotes?: CarrierQuote[];
}

export interface CouponApplicationAudit {
  storeId: string;
  couponCodes: string[];
  orderValue: number;
  appliedAt: Date;
  result: AppliedCouponResult;
}

export interface CouponRepository {
  createCoupon(coupon: Coupon): Promise<Coupon>;
  updateCoupon(storeId: string, couponId: string, data: Partial<Coupon>): Promise<Coupon>;
  deleteCoupon(storeId: string, couponId: string): Promise<void>;
  findCouponByCode(storeId: string, code: string): Promise<Coupon | null>;
  listCoupons(storeId: string): Promise<Coupon[]>;
  incrementUsage(storeId: string, couponId: string): Promise<void>;
  saveCouponAudit?(audit: CouponApplicationAudit): Promise<void>;
}

export interface ShippingTableRepository {
  createRule(rule: ShippingTableRule): Promise<ShippingTableRule>;
  updateRule(
    storeId: string,
    ruleId: string,
    data: Partial<ShippingTableRule>
  ): Promise<ShippingTableRule>;
  deleteRule(storeId: string, ruleId: string): Promise<void>;
  findActiveRulesByZipCode(storeId: string, zipCode: string): Promise<ShippingTableRule[]>;
  listRules(storeId: string): Promise<ShippingTableRule[]>;
}

export interface CarrierConfigRepository {
  createConfig(config: CarrierIntegrationConfig): Promise<CarrierIntegrationConfig>;
  updateConfig(
    storeId: string,
    configId: string,
    data: Partial<CarrierIntegrationConfig>
  ): Promise<CarrierIntegrationConfig>;
  deleteConfig(storeId: string, configId: string): Promise<void>;
  listActiveConfigs(storeId: string): Promise<CarrierIntegrationConfig[]>;
}

export interface CarrierQuoteProvider {
  getQuotes(input: CarrierQuoteRequest): Promise<CarrierQuote[]>;
}

export class EcommerceCouponAndShippingEngine {
  constructor(
    private readonly couponRepository: CouponRepository,
    private readonly shippingTableRepository: ShippingTableRepository,
    private readonly carrierConfigRepository: CarrierConfigRepository,
    private readonly carrierQuoteProvider: CarrierQuoteProvider
  ) {}

  public async createCoupon(input: Coupon): Promise<Coupon> {
    return this.couponRepository.createCoupon(input);
  }

  public async updateCoupon(
    storeId: string,
    couponId: string,
    data: Partial<Coupon>
  ): Promise<Coupon> {
    return this.couponRepository.updateCoupon(storeId, couponId, data);
  }

  public async deleteCoupon(storeId: string, couponId: string): Promise<void> {
    await this.couponRepository.deleteCoupon(storeId, couponId);
  }

  public async listCoupons(storeId: string): Promise<Coupon[]> {
    return this.couponRepository.listCoupons(storeId);
  }

  public async createShippingRule(input: ShippingTableRule): Promise<ShippingTableRule> {
    return this.shippingTableRepository.createRule(input);
  }

  public async updateShippingRule(
    storeId: string,
    ruleId: string,
    data: Partial<ShippingTableRule>
  ): Promise<ShippingTableRule> {
    return this.shippingTableRepository.updateRule(storeId, ruleId, data);
  }

  public async deleteShippingRule(storeId: string, ruleId: string): Promise<void> {
    await this.shippingTableRepository.deleteRule(storeId, ruleId);
  }

  public async listShippingRules(storeId: string): Promise<ShippingTableRule[]> {
    return this.shippingTableRepository.listRules(storeId);
  }

  public async createCarrierConfig(
    input: CarrierIntegrationConfig
  ): Promise<CarrierIntegrationConfig> {
    return this.carrierConfigRepository.createConfig(input);
  }

  public async updateCarrierConfig(
    storeId: string,
    configId: string,
    data: Partial<CarrierIntegrationConfig>
  ): Promise<CarrierIntegrationConfig> {
    return this.carrierConfigRepository.updateConfig(storeId, configId, data);
  }

  public async deleteCarrierConfig(storeId: string, configId: string): Promise<void> {
    await this.carrierConfigRepository.deleteConfig(storeId, configId);
  }

  public async listActiveCarrierConfigs(storeId: string): Promise<CarrierIntegrationConfig[]> {
    return this.carrierConfigRepository.listActiveConfigs(storeId);
  }

  public async applyCoupon(params: {
    storeId: string;
    couponCode: string;
    orderValue: number;
    productIds: string[];
    categoryIds: string[];
  }): Promise<AppliedCouponResult> {
    // As validacoes seguem a ordem mais barata para falhar rapido quando o cupom nao e elegivel.
    const coupon = await this.couponRepository.findCouponByCode(params.storeId, params.couponCode);

    if (!coupon || !coupon.isActive) {
      return this.invalidCoupon('Cupom nao encontrado ou inativo.', params.orderValue);
    }

    if (coupon.startsAt > new Date()) {
      return this.invalidCoupon('Cupom ainda nao iniciou.', params.orderValue);
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return this.invalidCoupon('Cupom expirado.', params.orderValue);
    }

    if (coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) {
      return this.invalidCoupon('Cupom atingiu o limite de uso.', params.orderValue);
    }

    if (coupon.minimumOrderValue !== undefined && params.orderValue < coupon.minimumOrderValue) {
      return this.invalidCoupon('Pedido nao atingiu o valor minimo do cupom.', params.orderValue);
    }

    if (
      coupon.eligibleProductIds?.length &&
      !coupon.eligibleProductIds.some((productId) => params.productIds.includes(productId))
    ) {
      return this.invalidCoupon('Cupom nao se aplica aos produtos do carrinho.', params.orderValue);
    }

    if (
      coupon.eligibleCategoryIds?.length &&
      !coupon.eligibleCategoryIds.some((categoryId) => params.categoryIds.includes(categoryId))
    ) {
      return this.invalidCoupon(
        'Cupom nao se aplica as categorias do carrinho.',
        params.orderValue
      );
    }

    let discountAmount = 0;
    let freeShippingApplied = false;

    if (coupon.type === 'percentage') {
      discountAmount = (params.orderValue * coupon.value) / 100;
    } else if (coupon.type === 'fixed') {
      discountAmount = coupon.value;
    } else if (coupon.type === 'free-shipping') {
      freeShippingApplied = true;
    }

    if (coupon.maximumDiscountValue !== undefined) {
      discountAmount = Math.min(discountAmount, coupon.maximumDiscountValue);
    }

    // O desconto nunca pode passar do valor do pedido.
    discountAmount = Math.min(discountAmount, params.orderValue);

    const result: AppliedCouponResult = {
      isValid: true,
      discountAmount,
      finalOrderValue: Math.max(0, params.orderValue - discountAmount),
      freeShippingApplied,
      coupon,
    };

    await Promise.allSettled([
      this.couponRepository.incrementUsage(params.storeId, coupon.id),
      this.couponRepository.saveCouponAudit?.({
        storeId: params.storeId,
        couponCodes: [coupon.code],
        orderValue: params.orderValue,
        appliedAt: new Date(),
        result,
      }) ?? Promise.resolve(),
    ]);

    return result;
  }

  public async applyCoupons(params: {
    storeId: string;
    couponCodes: string[];
    orderValue: number;
    productIds: string[];
    categoryIds: string[];
  }): Promise<AppliedCouponResult> {
    const coupons = (
      await Promise.all(
        params.couponCodes.map((couponCode) =>
          this.couponRepository.findCouponByCode(params.storeId, couponCode)
        )
      )
    )
      .filter((coupon): coupon is Coupon => Boolean(coupon?.isActive))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    if (coupons.length === 0) {
      return this.invalidCoupon('Nenhum cupom elegivel foi encontrado.', params.orderValue);
    }

    const appliedCoupons: Coupon[] = [];
    const conflicts: string[] = [];
    let runningOrderValue = params.orderValue;
    let totalDiscountAmount = 0;
    let freeShippingApplied = false;

    for (const coupon of coupons) {
      const hasConflict =
        coupon.exclusiveWithCouponIds?.some((couponId) =>
          appliedCoupons.some((applied) => applied.id === couponId)
        ) ?? false;

      if (hasConflict) {
        conflicts.push(`Cupom ${coupon.code} conflita com outro cupom aplicado.`);
        continue;
      }

      const singleResult = await this.applyCoupon({
        storeId: params.storeId,
        couponCode: coupon.code,
        orderValue: runningOrderValue,
        productIds: params.productIds,
        categoryIds: params.categoryIds,
      });

      if (!singleResult.isValid) {
        conflicts.push(singleResult.reason ?? `Cupom ${coupon.code} invalido.`);
        continue;
      }

      appliedCoupons.push(coupon);
      totalDiscountAmount += singleResult.discountAmount;
      runningOrderValue = singleResult.finalOrderValue;
      freeShippingApplied = freeShippingApplied || singleResult.freeShippingApplied;
    }

    return {
      isValid: appliedCoupons.length > 0,
      discountAmount: totalDiscountAmount,
      finalOrderValue: Math.max(0, runningOrderValue),
      freeShippingApplied,
      appliedCoupons,
      conflicts,
      reason:
        appliedCoupons.length === 0 ? 'Nao foi possivel aplicar os cupons informados.' : undefined,
    };
  }

  public async simulateShipping(input: CarrierQuoteRequest): Promise<ShippingSimulationResult> {
    // Regras internas e cotacoes externas sao avaliadas em paralelo para manter a simulacao leve.
    const [matchedTableRules, carrierQuotes] = await Promise.all([
      this.shippingTableRepository.findActiveRulesByZipCode(input.storeId, input.zipCode),
      this.carrierQuoteProvider.getQuotes(input),
    ]);

    const availableQuotes = carrierQuotes.filter((quote) => quote.isAvailable);
    const unavailableQuotes = carrierQuotes.filter((quote) => !quote.isAvailable);
    const cheapest = [...availableQuotes].sort((a, b) => a.price - b.price)[0];
    const fastest = [...availableQuotes].sort((a, b) => a.deliveryDays - b.deliveryDays)[0];
    const bestValue = [...availableQuotes].sort((a, b) => {
      const scoreA = a.price * 0.7 + a.deliveryDays * 0.3;
      const scoreB = b.price * 0.7 + b.deliveryDays * 0.3;
      return scoreA - scoreB;
    })[0];

    return {
      matchedTableRules,
      bestCarrierRecommendation: {
        cheapest,
        fastest,
        bestValue,
        allAvailableQuotes: availableQuotes,
      },
      unavailableQuotes,
    };
  }

  private invalidCoupon(reason: string, orderValue: number): AppliedCouponResult {
    return {
      isValid: false,
      discountAmount: 0,
      finalOrderValue: orderValue,
      freeShippingApplied: false,
      reason,
    };
  }
}
