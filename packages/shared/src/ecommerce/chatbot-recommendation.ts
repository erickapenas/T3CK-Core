// Este modulo concentra a regra de negocio do chatbot consultivo.
// A persistencia real e a conexao com LLMs ficam desacopladas via repositories/providers.
export interface Product {
  id: string;
  storeId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string;
  price: number;
  tags: string[];
  attributes?: Record<string, string | number | boolean>;
  inStock: boolean;
  isActive: boolean;
}

export interface CatalogCategory {
  id: string;
  storeId: string;
  name: string;
  aliases: string[];
  isActive: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface CustomerPreferenceProfile {
  categoryIds: string[];
  tags: string[];
  budgetMin?: number;
  budgetMax?: number;
  inferredIntent?: ChatIntent;
  excludedProductIds?: string[];
}

export type ChatIntent =
  | 'product-discovery'
  | 'price-comparison'
  | 'shipping-question'
  | 'return-policy'
  | 'human-support'
  | 'unknown';

export interface ChatbotConversationMemory {
  sessionId: string;
  storeId: string;
  summary: string;
  lastIntent?: ChatIntent;
  updatedAt: Date;
}

export interface ChatbotGuardrailDecision {
  isAllowed: boolean;
  safeReply?: string;
  reason?: string;
}

export interface ChatbotAnalyticsEvent {
  storeId: string;
  sessionId: string;
  eventType:
    | 'widget-opened'
    | 'message-received'
    | 'reply-generated'
    | 'handoff-requested'
    | 'guardrail-blocked';
  provider?: 'openai' | 'gemini' | 'fallback';
  intent?: ChatIntent;
  createdAt: Date;
}

export interface ChatbotHandoffRequest {
  storeId: string;
  sessionId: string;
  reason: string;
  lastCustomerMessage: string;
  createdAt: Date;
}

export interface ChatbotReplyChunk {
  text: string;
  isFinal: boolean;
}

export interface ChatbotWidgetState {
  isVisible: boolean;
  shouldBlink: boolean;
  greeting: string;
  displayMode: 'floating-button';
  buttonLabel: string;
  buttonIcon: string;
  buttonPosition: 'bottom-right' | 'bottom-left';
  startsExpanded: boolean;
  hasUnreadIndicator: boolean;
}

export interface RecommendationResponse {
  reply: string;
  recommendations: Product[];
  widgetState: ChatbotWidgetState;
  profile: CustomerPreferenceProfile;
  provider: 'openai' | 'gemini' | 'fallback';
}

export interface ProductQueryOptions {
  limit?: number;
  categoryIds?: string[];
  maxPrice?: number;
}

export interface RealtimeChatCompletionRequest {
  tenantId: string;
  sessionId: string;
  customerMessage: string;
  systemPrompt: string;
  conversationHistory: ChatMessage[];
  recommendedProducts: Product[];
  customerProfile: CustomerPreferenceProfile;
}

export interface RealtimeChatCompletionResponse {
  reply: string;
  provider: 'openai' | 'gemini';
}

export interface RealtimeAIProvider {
  // Este contrato pode ser implementado por um adapter de OpenAI, Gemini ou outro provedor compatÃ­vel.
  completeChat(input: RealtimeChatCompletionRequest): Promise<RealtimeChatCompletionResponse>;
}

export interface CatalogRepository {
  findActiveCatalogProducts(storeId: string, options?: ProductQueryOptions): Promise<Product[]>;
  findActiveCategories(storeId: string, options?: ProductQueryOptions): Promise<CatalogCategory[]>;
}

export interface ChatbotSessionRepository {
  getMessages(storeId: string, sessionId: string): Promise<ChatMessage[]>;
  saveMessage(storeId: string, sessionId: string, message: ChatMessage): Promise<void>;
}

export interface CustomerPreferenceRepository {
  getProfile(storeId: string, sessionId: string): Promise<CustomerPreferenceProfile | null>;
  saveProfile(
    storeId: string,
    sessionId: string,
    profile: CustomerPreferenceProfile
  ): Promise<void>;
}

export interface ConversationMemoryRepository {
  getMemory(storeId: string, sessionId: string): Promise<ChatbotConversationMemory | null>;
  saveMemory(memory: ChatbotConversationMemory): Promise<void>;
}

export interface ChatbotAnalyticsRepository {
  trackEvent(event: ChatbotAnalyticsEvent): Promise<void>;
}

export interface ChatbotHandoffRepository {
  createHandoff(request: ChatbotHandoffRequest): Promise<void>;
}

export interface ChatbotGuardrail {
  evaluate(input: {
    storeId: string;
    sessionId: string;
    userMessage: string;
    profile: CustomerPreferenceProfile;
  }): Promise<ChatbotGuardrailDecision>;
}

export interface StreamingAIProvider {
  streamChat(input: RealtimeChatCompletionRequest): AsyncIterable<ChatbotReplyChunk>;
}

export interface ChatbotOptionalDependencies {
  memoryRepository?: ConversationMemoryRepository;
  analyticsRepository?: ChatbotAnalyticsRepository;
  handoffRepository?: ChatbotHandoffRepository;
  guardrail?: ChatbotGuardrail;
  streamingProvider?: StreamingAIProvider;
  aiTimeoutMs?: number;
}

export class EcommerceRecommendationChatbot {
  // Limites pequenos ajudam a manter o widget leve em edge, mobile e conexoes lentas.
  private static readonly EDGE_QUERY_LIMIT = 10;
  private static readonly EDGE_RESPONSE_LIMIT = 3;
  private static readonly MAX_HISTORY_MESSAGES = 8;
  private static readonly DEFAULT_AI_TIMEOUT_MS = 2500;

  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly sessionRepository: ChatbotSessionRepository,
    private readonly preferenceRepository: CustomerPreferenceRepository,
    private readonly aiProvider: RealtimeAIProvider,
    private readonly optionalDependencies?: ChatbotOptionalDependencies
  ) {}

  public async getInitialWidgetState(
    storeId: string,
    sessionId: string
  ): Promise<ChatbotWidgetState> {
    // O primeiro acesso ativa o destaque visual do chat sem exigir estado adicional no frontend.
    const history = await this.sessionRepository.getMessages(storeId, sessionId);
    void this.trackAnalyticsEvent({
      storeId,
      sessionId,
      eventType: 'widget-opened',
      createdAt: new Date(),
    });
    return this.buildWidgetState(history.length > 0);
  }

  public async receiveMessage(
    storeId: string,
    sessionId: string,
    userMessage: string
  ): Promise<RecommendationResponse> {
    // Dados independentes sao carregados em paralelo para reduzir latencia percebida.
    const [categories, profile, history] = await Promise.all([
      this.catalogRepository.findActiveCategories(storeId, {
        limit: EcommerceRecommendationChatbot.EDGE_QUERY_LIMIT,
      }),
      this.getOrCreateProfile(storeId, sessionId),
      this.sessionRepository.getMessages(storeId, sessionId),
    ]);

    const userEntry: ChatMessage = {
      role: 'user',
      content: userMessage,
      createdAt: new Date(),
    };

    await this.sessionRepository.saveMessage(storeId, sessionId, userEntry);

    const updatedProfile = this.updateProfile(profile, userMessage, categories);
    const guardrailDecision = await this.optionalDependencies?.guardrail?.evaluate({
      storeId,
      sessionId,
      userMessage,
      profile: updatedProfile,
    });

    if (guardrailDecision && !guardrailDecision.isAllowed) {
      await Promise.allSettled([
        this.preferenceRepository.saveProfile(storeId, sessionId, updatedProfile),
        this.optionalDependencies?.analyticsRepository?.trackEvent({
          storeId,
          sessionId,
          eventType: 'guardrail-blocked',
          intent: updatedProfile.inferredIntent,
          createdAt: new Date(),
        }) ?? Promise.resolve(),
      ]);

      return {
        reply:
          guardrailDecision.safeReply ??
          'Posso te ajudar com produtos, preco, entrega e politica da loja.',
        recommendations: [],
        widgetState: this.buildWidgetState(true),
        profile: updatedProfile,
        provider: 'fallback',
      };
    }

    await this.preferenceRepository.saveProfile(storeId, sessionId, updatedProfile);

    // O ranking de produtos continua deterministico; a IA apenas humaniza a resposta final.
    const recommendations = await this.recommendProducts(storeId, updatedProfile);
    const trimmedRecommendations = recommendations.slice(
      0,
      EcommerceRecommendationChatbot.EDGE_RESPONSE_LIMIT
    );

    const aiReply = await this.generateRealtimeReply({
      storeId,
      sessionId,
      userMessage,
      history,
      profile: updatedProfile,
      recommendations: trimmedRecommendations,
    });

    await Promise.allSettled([
      this.sessionRepository.saveMessage(storeId, sessionId, {
        role: 'assistant',
        content: aiReply.reply,
        createdAt: new Date(),
      }),
      this.persistConversationMemory(storeId, sessionId, updatedProfile, history, userMessage),
      this.optionalDependencies?.analyticsRepository?.trackEvent({
        storeId,
        sessionId,
        eventType: 'reply-generated',
        provider: aiReply.provider,
        intent: updatedProfile.inferredIntent,
        createdAt: new Date(),
      }) ?? Promise.resolve(),
    ]);

    return {
      reply: aiReply.reply,
      recommendations: trimmedRecommendations,
      widgetState: this.buildWidgetState(true),
      profile: updatedProfile,
      provider: aiReply.provider,
    };
  }

  private async generateRealtimeReply(input: {
    storeId: string;
    sessionId: string;
    userMessage: string;
    history: ChatMessage[];
    profile: CustomerPreferenceProfile;
    recommendations: Product[];
  }): Promise<{
    reply: string;
    provider: 'openai' | 'gemini' | 'fallback';
  }> {
    try {
      // A IA recebe apenas historico curto e produtos reais prefiltrados pelo motor de recomendacao.
      const response = await this.withTimeout(
        this.aiProvider.completeChat({
          tenantId: input.storeId,
          sessionId: input.sessionId,
          customerMessage: input.userMessage,
          systemPrompt: this.buildSystemPrompt(),
          conversationHistory: this.trimHistory(input.history),
          recommendedProducts: input.recommendations,
          customerProfile: input.profile,
        }),
        this.optionalDependencies?.aiTimeoutMs ??
          EcommerceRecommendationChatbot.DEFAULT_AI_TIMEOUT_MS
      );

      return response;
    } catch {
      return {
        reply: this.buildFallbackReply(input.profile, input.recommendations),
        provider: 'fallback',
      };
    }
  }

  private async getOrCreateProfile(
    storeId: string,
    sessionId: string
  ): Promise<CustomerPreferenceProfile> {
    // A sessao funciona como ancora de preferencia para clientes anonimos e logados.
    const existing = await this.preferenceRepository.getProfile(storeId, sessionId);

    return (
      existing ?? {
        categoryIds: [],
        tags: [],
        excludedProductIds: [],
      }
    );
  }

  private updateProfile(
    profile: CustomerPreferenceProfile,
    message: string,
    categories: CatalogCategory[]
  ): CustomerPreferenceProfile {
    // O perfil inferido e propositalmente simples para ser barato de atualizar a cada mensagem.
    const normalizedMessage = this.normalize(message);
    const detectedCategoryIds = categories
      .filter((category) => this.matchesCategory(normalizedMessage, category))
      .map((category) => category.id);

    const detectedTags = this.extractPreferenceTags(normalizedMessage);
    const budget = this.extractBudget(normalizedMessage);
    const inferredIntent = this.detectIntent(normalizedMessage);

    return {
      categoryIds: this.mergeUnique(profile.categoryIds, detectedCategoryIds),
      tags: this.mergeUnique(profile.tags, detectedTags),
      budgetMin: budget.budgetMin ?? profile.budgetMin,
      budgetMax: budget.budgetMax ?? profile.budgetMax,
      inferredIntent: inferredIntent !== 'unknown' ? inferredIntent : profile.inferredIntent,
      excludedProductIds: profile.excludedProductIds ?? [],
    };
  }

  private async recommendProducts(
    storeId: string,
    profile: CustomerPreferenceProfile
  ): Promise<Product[]> {
    // Os filtros ja reduzem o universo no repository antes da etapa de score.
    const activeProducts = await this.catalogRepository.findActiveCatalogProducts(storeId, {
      limit: EcommerceRecommendationChatbot.EDGE_QUERY_LIMIT,
      categoryIds: profile.categoryIds,
      maxPrice: profile.budgetMax,
    });

    return activeProducts
      .filter((product) => !(profile.excludedProductIds ?? []).includes(product.id))
      .filter((product) => product.isActive && product.inStock)
      .map((product) => ({
        product,
        score: this.scoreProduct(product, profile),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.product.price - b.product.price)
      .slice(0, EcommerceRecommendationChatbot.EDGE_RESPONSE_LIMIT)
      .map((item) => item.product);
  }

  private scoreProduct(product: Product, profile: CustomerPreferenceProfile): number {
    // O score mistura aderencia por categoria, tags e faixa de preco sem precisar de ML pesado.
    let score = 1;

    if (profile.categoryIds.includes(product.categoryId)) {
      score += 5;
    }

    const normalizedProductText = this.normalize(
      `${product.name} ${product.categoryName} ${product.description} ${product.tags.join(' ')}`
    );

    for (const tag of profile.tags) {
      if (normalizedProductText.includes(this.normalize(tag))) {
        score += 2;
      }
    }

    if (profile.budgetMax !== undefined) {
      score += product.price <= profile.budgetMax ? 3 : -4;
    }

    if (profile.budgetMin !== undefined && product.price >= profile.budgetMin) {
      score += 1;
    }

    return score;
  }

  private buildSystemPrompt(): string {
    // O system prompt restringe o comportamento do LLM ao papel consultivo e ao catalogo real.
    return [
      'Voce e um assistente de vendas de ecommerce.',
      'Fale em portugues do Brasil.',
      'Seja natural, consultivo e objetivo.',
      'Use apenas os produtos reais recebidos no contexto.',
      'Nunca invente produto, preco, estoque ou categoria.',
      'Quando houver recomendacoes, explique rapidamente por que elas combinam com o cliente.',
      'Se faltar informacao, faca no maximo uma pergunta curta para refinar a recomendacao.',
      'Se o cliente pedir atendimento humano, reconheca isso com clareza.',
      'Evite parecer robotico ou presetado.',
    ].join(' ');
  }

  private buildFallbackReply(profile: CustomerPreferenceProfile, products: Product[]): string {
    // O fallback garante continuidade caso o provider externo esteja indisponivel.
    if (products.length === 0) {
      return 'Ainda nao encontrei um produto ideal no catalogo com base na conversa. Me diga categoria, faixa de preco ou o que voce valoriza mais para eu refinar melhor.';
    }

    const budgetText =
      profile.budgetMax !== undefined
        ? ` dentro da faixa de ate R$ ${profile.budgetMax.toFixed(2)}`
        : '';

    const summary = products
      .map((product) => `${product.name} por R$ ${product.price.toFixed(2)}`)
      .join('; ');

    return `Entendi o seu perfil${budgetText}. As melhores opcoes para voce agora sao: ${summary}. Se quiser, eu posso refinar por uso, marca ou custo-beneficio.`;
  }

  private trimHistory(history: ChatMessage[]): ChatMessage[] {
    // Historico curto controla custo de prompt e mantem previsibilidade na resposta.
    return history.slice(-EcommerceRecommendationChatbot.MAX_HISTORY_MESSAGES);
  }

  public async requestHumanHandoff(input: {
    storeId: string;
    sessionId: string;
    reason: string;
    lastCustomerMessage: string;
  }): Promise<void> {
    if (!this.optionalDependencies?.handoffRepository) {
      return;
    }

    await Promise.allSettled([
      this.optionalDependencies.handoffRepository.createHandoff({
        ...input,
        createdAt: new Date(),
      }),
      this.optionalDependencies.analyticsRepository?.trackEvent({
        storeId: input.storeId,
        sessionId: input.sessionId,
        eventType: 'handoff-requested',
        intent: 'human-support',
        createdAt: new Date(),
      }) ?? Promise.resolve(),
    ]);
  }

  public async *streamReply(input: {
    storeId: string;
    sessionId: string;
    userMessage: string;
  }): AsyncIterable<ChatbotReplyChunk> {
    if (!this.optionalDependencies?.streamingProvider) {
      yield { text: 'Streaming nao configurado.', isFinal: true };
      return;
    }

    const [profile, history] = await Promise.all([
      this.getOrCreateProfile(input.storeId, input.sessionId),
      this.sessionRepository.getMessages(input.storeId, input.sessionId),
    ]);

    const recommendedProducts = await this.recommendProducts(input.storeId, profile);

    for await (const chunk of this.optionalDependencies.streamingProvider.streamChat({
      tenantId: input.storeId,
      sessionId: input.sessionId,
      customerMessage: input.userMessage,
      systemPrompt: this.buildSystemPrompt(),
      conversationHistory: this.trimHistory(history),
      recommendedProducts: recommendedProducts.slice(0, 3),
      customerProfile: profile,
    })) {
      yield chunk;
    }
  }

  private detectIntent(normalizedMessage: string): ChatIntent {
    if (normalizedMessage.includes('atendente') || normalizedMessage.includes('humano')) {
      return 'human-support';
    }
    if (normalizedMessage.includes('frete') || normalizedMessage.includes('entrega')) {
      return 'shipping-question';
    }
    if (normalizedMessage.includes('troca') || normalizedMessage.includes('devol')) {
      return 'return-policy';
    }
    if (normalizedMessage.includes('compar') || normalizedMessage.includes('melhor preco')) {
      return 'price-comparison';
    }
    if (normalizedMessage.includes('quero') || normalizedMessage.includes('procuro')) {
      return 'product-discovery';
    }
    return 'unknown';
  }

  private async persistConversationMemory(
    storeId: string,
    sessionId: string,
    profile: CustomerPreferenceProfile,
    history: ChatMessage[],
    userMessage: string
  ): Promise<void> {
    if (!this.optionalDependencies?.memoryRepository) {
      return;
    }

    const recentMessages = [...history.slice(-2).map((item) => item.content), userMessage]
      .filter(Boolean)
      .slice(-3)
      .join(' | ');

    await this.optionalDependencies.memoryRepository.saveMemory({
      storeId,
      sessionId,
      summary: recentMessages,
      lastIntent: profile.inferredIntent,
      updatedAt: new Date(),
    });
  }

  private async trackAnalyticsEvent(event: ChatbotAnalyticsEvent): Promise<void> {
    if (!this.optionalDependencies?.analyticsRepository) {
      return;
    }

    try {
      await this.optionalDependencies.analyticsRepository.trackEvent(event);
    } catch {
      // Analytics nao pode bloquear experiencia do chat em momentos de pico.
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error('AI provider timeout'));
      }, timeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timeoutHandle);
          resolve(value);
        },
        (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        }
      );
    });
  }

  private buildWidgetState(hasHistory: boolean): ChatbotWidgetState {
    return {
      isVisible: true,
      shouldBlink: !hasHistory,
      greeting:
        'Oi! Posso te ajudar em tempo real a encontrar o produto certo com base no seu gosto e no catalogo da loja.',
      displayMode: 'floating-button',
      buttonLabel: 'Ajuda para comprar',
      buttonIcon: 'chat',
      buttonPosition: 'bottom-right',
      startsExpanded: false,
      hasUnreadIndicator: !hasHistory,
    };
  }

  private matchesCategory(normalizedMessage: string, category: CatalogCategory): boolean {
    const searchableTerms = [category.name, ...category.aliases].map((item) =>
      this.normalize(item)
    );
    return searchableTerms.some((term) => term.length > 0 && normalizedMessage.includes(term));
  }

  private extractPreferenceTags(normalizedMessage: string): string[] {
    return normalizedMessage
      .split(/[^a-z0-9]+/i)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4)
      .slice(0, 8);
  }

  private extractBudget(normalizedMessage: string): {
    budgetMin?: number;
    budgetMax?: number;
  } {
    const budgetValues = normalizedMessage.match(/\d+[.,]?\d*/g);

    if (!budgetValues || budgetValues.length === 0) {
      return {};
    }

    const numericValues = budgetValues
      .map((value) => Number(value.replace('.', '').replace(',', '.')))
      .filter((value) => !Number.isNaN(value) && value > 0)
      .sort((a, b) => a - b);

    if (numericValues.length === 1) {
      return {
        budgetMax: numericValues[0],
      };
    }

    return {
      budgetMin: numericValues[0],
      budgetMax: numericValues[numericValues.length - 1],
    };
  }

  private mergeUnique(current: string[], incoming: string[]): string[] {
    return Array.from(new Set([...current, ...incoming]));
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
