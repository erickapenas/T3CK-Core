// Este modulo cobre recuperacao de carrinho em tempo real e em modo batch.
// O caminho online observa hesitacao; o caminho batch atua sobre abandono consolidado.
export interface CartItem {
  productId: string;
  productName: string;
  category: string;
  unitPrice: number;
  quantity: number;
  stockQuantity: number;
  inStock: boolean;
  isActive: boolean;
  tags: string[];
}

export interface CustomerCart {
  cartId: string;
  storeId: string;
  customerId: string;
  items: CartItem[];
  subtotal: number;
  updatedAt: Date;
  status: 'active' | 'hesitating' | 'abandoned' | 'recovered' | 'converted';
}

export interface CustomerRecoveryProfile {
  storeId: string;
  customerId: string;
  firstName?: string;
  email?: string;
  phone?: string;
  preferredChannel?: 'email' | 'whatsapp' | 'sms' | 'push' | 'onsite';
  lastViewedCategories: string[];
  lastViewedProductIds: string[];
  previousPurchases: string[];
  averageTicket?: number;
}

export interface CustomerBehaviorSignal {
  signalId?: string;
  storeId: string;
  customerId: string;
  cartId: string;
  type:
    | 'checkout-stalled'
    | 'exit-intent'
    | 'coupon-search'
    | 'price-comparison'
    | 'cart-idle'
    | 'removed-item'
    | 'revisited-cart';
  createdAt: Date;
  metadata?: Record<string, string | number | boolean>;
}

export interface RecoveryActionSuggestion {
  actionType:
    | 'reminder'
    | 'social-proof'
    | 'benefit-reinforcement'
    | 'discount'
    | 'urgency'
    | 'free-shipping';
  channel: 'email' | 'whatsapp' | 'sms' | 'push' | 'onsite';
  couponCode?: string;
  discountPercentage?: number;
  freeShipping?: boolean;
  subject: string;
  message: string;
  recommendedProducts: CartItem[];
  sendAt: Date;
}

export interface RecoveryExecutionResult {
  cartId: string;
  storeId: string;
  customerId: string;
  isEligible: boolean;
  abandonmentScore: number;
  hesitationScore: number;
  recoverySuggestion?: RecoveryActionSuggestion;
  reason?: string;
}

export interface CartRepository {
  findAbandonedCarts(storeId: string, referenceDate: Date): Promise<CustomerCart[]>;
  findCartById(storeId: string, cartId: string): Promise<CustomerCart | null>;
  createCart(cart: CustomerCart): Promise<CustomerCart>;
  updateCart(storeId: string, cartId: string, data: Partial<CustomerCart>): Promise<CustomerCart>;
  deleteCart(storeId: string, cartId: string): Promise<void>;
  updateCartStatus(storeId: string, cartId: string, status: CustomerCart['status']): Promise<void>;
}

export interface CustomerRecoveryRepository {
  findCustomerProfile(storeId: string, customerId: string): Promise<CustomerRecoveryProfile | null>;
  saveCustomerProfile(profile: CustomerRecoveryProfile): Promise<CustomerRecoveryProfile>;
  updateCustomerProfile(
    storeId: string,
    customerId: string,
    data: Partial<CustomerRecoveryProfile>
  ): Promise<CustomerRecoveryProfile>;
}

export interface RecoveryCampaignRepository {
  saveRecoverySuggestion(result: RecoveryExecutionResult): Promise<void>;
  saveBehaviorSignal(signal: CustomerBehaviorSignal): Promise<void>;
  findBehaviorSignals(storeId: string, cartId: string): Promise<CustomerBehaviorSignal[]>;
  deleteBehaviorSignal(storeId: string, cartId: string, signalId: string): Promise<void>;
}

export interface AIMessageGenerator {
  // Este contrato existe para plugar OpenAI, Gemini ou qualquer motor de IA sem acoplar o dominio a um SDK.
  generateRecoveryMessage(input: {
    customer: CustomerRecoveryProfile;
    cart: CustomerCart;
    strategy: RecoveryActionSuggestion['actionType'];
    trigger: 'hesitation' | 'abandonment';
    recommendedProducts: CartItem[];
    couponCode?: string;
    discountPercentage?: number;
    freeShipping?: boolean;
  }): Promise<{
    subject: string;
    message: string;
  }>;
}

export interface CartRecoveryDependencies {
  cartRepository: CartRepository;
  customerRecoveryRepository: CustomerRecoveryRepository;
  recoveryCampaignRepository: RecoveryCampaignRepository;
  aiMessageGenerator: AIMessageGenerator;
}

export class DefaultRecoveryMessageGenerator implements AIMessageGenerator {
  // Fallback simples para integracao inicial, caso a IA ainda nao esteja conectada.
  public async generateRecoveryMessage(input: {
    customer: CustomerRecoveryProfile;
    cart: CustomerCart;
    strategy: RecoveryActionSuggestion['actionType'];
    trigger: 'hesitation' | 'abandonment';
    recommendedProducts: CartItem[];
    couponCode?: string;
    discountPercentage?: number;
    freeShipping?: boolean;
  }): Promise<{
    subject: string;
    message: string;
  }> {
    const customerName = input.customer.firstName?.trim() || 'cliente';
    const incentiveText = input.freeShipping
      ? 'com frete gratis'
      : input.discountPercentage
        ? `com ${input.discountPercentage}% de desconto`
        : input.couponCode
          ? `com o cupom ${input.couponCode}`
          : 'com uma condicao especial';

    return {
      subject: 'Seu carrinho ainda esta te esperando',
      message: `Oi, ${customerName}! Percebemos que voce ainda nao concluiu sua compra. Voce pode finalizar agora ${incentiveText}.`,
    };
  }
}

const ABANDONMENT_THRESHOLD_MINUTES = 30;
const HESITATION_THRESHOLD = 7;

const SIGNAL_WEIGHT: Record<CustomerBehaviorSignal['type'], number> = {
  'checkout-stalled': 4,
  'exit-intent': 5,
  'coupon-search': 4,
  'price-comparison': 3,
  'cart-idle': 2,
  'removed-item': 3,
  'revisited-cart': 2,
};

export class EcommerceCartRecoveryAI {
  // Debounce curto impede explosao de writes quando o frontend dispara eventos repetidos.
  private readonly signalDebounceWindowMs: number;
  private readonly maxBatchSize: number;
  private readonly maxConcurrency: number;
  private readonly recentSignals = new Map<string, number>();

  constructor(
    private readonly cartRepository: CartRepository,
    private readonly customerRecoveryRepository: CustomerRecoveryRepository,
    private readonly recoveryCampaignRepository: RecoveryCampaignRepository,
    private readonly aiMessageGenerator: AIMessageGenerator,
    options?: {
      signalDebounceWindowMs?: number;
      maxBatchSize?: number;
      maxConcurrency?: number;
    }
  ) {
    this.signalDebounceWindowMs = options?.signalDebounceWindowMs ?? 1500;
    this.maxBatchSize = options?.maxBatchSize ?? 50;
    this.maxConcurrency = options?.maxConcurrency ?? 5;
  }

  public static create(
    dependencies: CartRecoveryDependencies,
    options?: {
      signalDebounceWindowMs?: number;
      maxBatchSize?: number;
      maxConcurrency?: number;
    }
  ): EcommerceCartRecoveryAI {
    // Helper para facilitar o wiring do modulo no container de dependencias do projeto principal.
    return new EcommerceCartRecoveryAI(
      dependencies.cartRepository,
      dependencies.customerRecoveryRepository,
      dependencies.recoveryCampaignRepository,
      dependencies.aiMessageGenerator,
      options
    );
  }

  public async processAbandonedCarts(
    storeId: string,
    referenceDate: Date
  ): Promise<RecoveryExecutionResult[]> {
    // Pensado para job/background, nao para request critica da navegacao.
    const carts = (await this.cartRepository.findAbandonedCarts(storeId, referenceDate)).slice(
      0,
      this.maxBatchSize
    );
    const results: RecoveryExecutionResult[] = [];

    for (let index = 0; index < carts.length; index += this.maxConcurrency) {
      const batch = carts.slice(index, index + this.maxConcurrency);
      const batchResults = await Promise.all(
        batch.map(async (cart) => {
          const result = await this.buildRecoveryPlan(cart, referenceDate, 'abandonment');
          await this.recoveryCampaignRepository.saveRecoverySuggestion(result);
          return result;
        })
      );
      results.push(...batchResults);
    }

    return results;
  }

  public async registerBehaviorSignal(signal: CustomerBehaviorSignal): Promise<void> {
    this.cleanupRecentSignals(signal.createdAt.getTime());

    if (this.shouldDebounce(signal)) {
      return;
    }

    await this.recoveryCampaignRepository.saveBehaviorSignal(signal);
  }

  public async evaluateLiveRecoveryOpportunity(
    storeId: string,
    cartId: string,
    referenceDate: Date
  ): Promise<RecoveryExecutionResult> {
    // O fluxo online trabalha sobre um unico carrinho para manter resposta rapida.
    const cart = await this.cartRepository.findCartById(storeId, cartId);

    if (!cart) {
      return {
        cartId,
        storeId,
        customerId: '',
        isEligible: false,
        abandonmentScore: 0,
        hesitationScore: 0,
        reason: 'Carrinho nao encontrado.',
      };
    }

    const signals = await this.recoveryCampaignRepository.findBehaviorSignals(storeId, cartId);
    const hesitationScore = this.calculateHesitationScore(signals, cart, referenceDate);

    if (hesitationScore < HESITATION_THRESHOLD) {
      return {
        cartId: cart.cartId,
        storeId: cart.storeId,
        customerId: cart.customerId,
        isEligible: false,
        abandonmentScore: 0,
        hesitationScore,
        reason: 'Cliente ainda nao demonstrou sinais suficientes de desistencia.',
      };
    }

    return this.buildRecoveryPlan(cart, referenceDate, 'hesitation', hesitationScore);
  }

  private async buildRecoveryPlan(
    cart: CustomerCart,
    referenceDate: Date,
    trigger: 'hesitation' | 'abandonment',
    preCalculatedHesitationScore?: number
  ): Promise<RecoveryExecutionResult> {
    // Produtos indisponiveis sao removidos antes da estrategia para evitar oferta incorreta.
    const validItems = cart.items.filter((item) => item.inStock && item.isActive);

    if (validItems.length === 0) {
      return {
        cartId: cart.cartId,
        storeId: cart.storeId,
        customerId: cart.customerId,
        isEligible: false,
        abandonmentScore: 0,
        hesitationScore: 0,
        reason: 'Carrinho sem produtos validos para recuperacao.',
      };
    }

    const minutesWithoutUpdate = this.getMinutesDifference(cart.updatedAt, referenceDate);
    const hesitationScore =
      preCalculatedHesitationScore ??
      this.calculateHesitationScore(
        await this.recoveryCampaignRepository.findBehaviorSignals(cart.storeId, cart.cartId),
        cart,
        referenceDate
      );

    if (trigger === 'abandonment' && minutesWithoutUpdate < ABANDONMENT_THRESHOLD_MINUTES) {
      return {
        cartId: cart.cartId,
        storeId: cart.storeId,
        customerId: cart.customerId,
        isEligible: false,
        abandonmentScore: 0,
        hesitationScore,
        reason: 'Carrinho ainda nao atingiu o tempo minimo para abandono.',
      };
    }

    const customer = await this.customerRecoveryRepository.findCustomerProfile(
      cart.storeId,
      cart.customerId
    );

    if (!customer) {
      return {
        cartId: cart.cartId,
        storeId: cart.storeId,
        customerId: cart.customerId,
        isEligible: false,
        abandonmentScore: 0,
        hesitationScore,
        reason: 'Cliente nao encontrado para campanha de recuperacao.',
      };
    }

    const abandonmentScore = this.calculateAbandonmentScore(cart, customer, minutesWithoutUpdate);
    const strategy = this.chooseRecoveryStrategy(cart, customer, abandonmentScore, hesitationScore);
    const channel = trigger === 'hesitation' ? 'onsite' : (customer.preferredChannel ?? 'email');
    const incentive = this.defineIncentive(
      strategy,
      cart.subtotal,
      abandonmentScore,
      hesitationScore
    );
    const sendAt =
      trigger === 'hesitation'
        ? referenceDate
        : this.calculateSendAt(referenceDate, abandonmentScore);

    const generatedMessage = await this.aiMessageGenerator.generateRecoveryMessage({
      customer,
      cart: {
        ...cart,
        items: validItems,
      },
      strategy,
      trigger,
      recommendedProducts: validItems,
      couponCode: incentive.couponCode,
      discountPercentage: incentive.discountPercentage,
      freeShipping: incentive.freeShipping,
    });

    await this.cartRepository.updateCartStatus(
      cart.storeId,
      cart.cartId,
      trigger === 'hesitation' ? 'hesitating' : 'abandoned'
    );

    return {
      cartId: cart.cartId,
      storeId: cart.storeId,
      customerId: cart.customerId,
      isEligible: true,
      abandonmentScore,
      hesitationScore,
      recoverySuggestion: {
        actionType: strategy,
        channel,
        couponCode: incentive.couponCode,
        discountPercentage: incentive.discountPercentage,
        freeShipping: incentive.freeShipping,
        subject: generatedMessage.subject,
        message: generatedMessage.message,
        recommendedProducts: validItems,
        sendAt,
      },
    };
  }

  private calculateHesitationScore(
    signals: CustomerBehaviorSignal[],
    cart: CustomerCart,
    referenceDate: Date
  ): number {
    let score = 0;

    for (const signal of signals) {
      score += SIGNAL_WEIGHT[signal.type] ?? 0;
    }

    const idleMinutes = this.getMinutesDifference(cart.updatedAt, referenceDate);
    score += Math.min(idleMinutes / 5, 6);

    return Number(score.toFixed(2));
  }

  private calculateAbandonmentScore(
    cart: CustomerCart,
    customer: CustomerRecoveryProfile,
    minutesWithoutUpdate: number
  ): number {
    let score = 0;

    score += Math.min(minutesWithoutUpdate / 30, 10);
    score += Math.min(cart.items.length * 1.5, 10);
    score += Math.min(cart.subtotal / 200, 10);

    if (customer.previousPurchases.length > 0) {
      score += 5;
    }

    if (customer.averageTicket && cart.subtotal >= customer.averageTicket) {
      score += 4;
    }

    return Number(score.toFixed(2));
  }

  private chooseRecoveryStrategy(
    cart: CustomerCart,
    customer: CustomerRecoveryProfile,
    abandonmentScore: number,
    hesitationScore: number
  ): RecoveryActionSuggestion['actionType'] {
    if (hesitationScore >= 12 && cart.subtotal < 300) {
      return 'free-shipping';
    }

    if (abandonmentScore >= 20 || hesitationScore >= 14) {
      return 'discount';
    }

    if (cart.items.length >= 3) {
      return 'benefit-reinforcement';
    }

    if (customer.previousPurchases.length > 0) {
      return 'social-proof';
    }

    if (this.hasLimitedStockItem(cart.items)) {
      return 'urgency';
    }

    return 'reminder';
  }

  private defineIncentive(
    strategy: RecoveryActionSuggestion['actionType'],
    subtotal: number,
    abandonmentScore: number,
    hesitationScore: number
  ): {
    couponCode?: string;
    discountPercentage?: number;
    freeShipping?: boolean;
  } {
    if (strategy === 'free-shipping') {
      return {
        couponCode: 'FRETEGRATIS',
        freeShipping: true,
      };
    }

    if (strategy !== 'discount') {
      return {};
    }

    const discountPercentage =
      subtotal >= 1000 || abandonmentScore >= 24 || hesitationScore >= 16 ? 10 : 5;

    return {
      couponCode: `RECUPERA${discountPercentage}`,
      discountPercentage,
    };
  }

  private calculateSendAt(referenceDate: Date, abandonmentScore: number): Date {
    const delayInMinutes = abandonmentScore >= 20 ? 15 : 45;
    return new Date(referenceDate.getTime() + delayInMinutes * 60 * 1000);
  }

  private hasLimitedStockItem(items: CartItem[]): boolean {
    return items.some((item) => item.inStock && item.stockQuantity <= 3);
  }

  private getMinutesDifference(startDate: Date, endDate: Date): number {
    return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 60000));
  }

  private shouldDebounce(signal: CustomerBehaviorSignal): boolean {
    const key = `${signal.storeId}:${signal.cartId}:${signal.customerId}:${signal.type}`;
    const lastTimestamp = this.recentSignals.get(key);
    const currentTimestamp = signal.createdAt.getTime();

    if (
      lastTimestamp !== undefined &&
      currentTimestamp - lastTimestamp < this.signalDebounceWindowMs
    ) {
      return true;
    }

    this.recentSignals.set(key, currentTimestamp);
    return false;
  }

  private cleanupRecentSignals(referenceTimestamp: number): void {
    const cutoff = referenceTimestamp - this.signalDebounceWindowMs * 10;

    for (const [key, timestamp] of this.recentSignals.entries()) {
      if (timestamp < cutoff) {
        this.recentSignals.delete(key);
      }
    }
  }
}
