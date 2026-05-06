// O transport abstrai SDKs reais para que OpenAI/Gemini possam ser plugados sem acoplamento direto.
import {
  Product,
  RealtimeAIProvider,
  RealtimeChatCompletionRequest,
  RealtimeChatCompletionResponse,
} from './chatbot-recommendation';

export interface LLMTransport {
  send(input: {
    model: string;
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
    temperature?: number;
  }): Promise<{
    text: string;
  }>;
}

export class OpenAIRealtimeChatProvider implements RealtimeAIProvider {
  constructor(
    private readonly transport: LLMTransport,
    private readonly model = 'gpt-4.1-mini'
  ) {}

  public async completeChat(
    input: RealtimeChatCompletionRequest
  ): Promise<RealtimeChatCompletionResponse> {
    // O provider converte contexto de negocio para o formato esperado pelo modelo.
    const response = await this.transport.send({
      model: this.model,
      temperature: 0.6,
      messages: this.buildMessages(input),
    });

    return {
      reply: response.text,
      provider: 'openai',
    };
  }

  private buildMessages(input: RealtimeChatCompletionRequest): Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> {
    const historyMessages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = input.conversationHistory.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    return [
      {
        role: 'system',
        content: input.systemPrompt,
      },
      {
        role: 'system',
        content: this.buildContextPrompt(input.recommendedProducts, input.customerProfile),
      },
      ...historyMessages,
      {
        role: 'user',
        content: input.customerMessage,
      },
    ];
  }

  private buildContextPrompt(
    products: Product[],
    profile: RealtimeChatCompletionRequest['customerProfile']
  ): string {
    // O contexto lista apenas produtos reais ja aprovados pelo motor deterministico.
    const productContext =
      products.length > 0
        ? products
            .map(
              (product) =>
                `Produto: ${product.name} | Categoria: ${product.categoryName} | Preco: ${product.price} | Tags: ${product.tags.join(', ')}`
            )
            .join('\n')
        : 'Nenhum produto elegivel foi encontrado no catalogo para esta conversa.';

    return [
      'Contexto do cliente:',
      `Categorias de interesse: ${profile.categoryIds.join(', ') || 'nao identificado'}`,
      `Tags de interesse: ${profile.tags.join(', ') || 'nao identificado'}`,
      `Faixa minima: ${profile.budgetMin ?? 'nao informado'}`,
      `Faixa maxima: ${profile.budgetMax ?? 'nao informado'}`,
      'Produtos reais disponiveis para recomendar:',
      productContext,
    ].join('\n');
  }
}

export class GeminiRealtimeChatProvider implements RealtimeAIProvider {
  constructor(
    private readonly transport: LLMTransport,
    private readonly model = 'gemini-2.0-flash'
  ) {}

  public async completeChat(
    input: RealtimeChatCompletionRequest
  ): Promise<RealtimeChatCompletionResponse> {
    const response = await this.transport.send({
      model: this.model,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: input.systemPrompt,
        },
        {
          role: 'user',
          content: this.buildGeminiPrompt(input),
        },
      ],
    });

    return {
      reply: response.text,
      provider: 'gemini',
    };
  }

  private buildGeminiPrompt(input: RealtimeChatCompletionRequest): string {
    // No Gemini consolidamos contexto e historico em um prompt unico e compacto.
    const historyText = input.conversationHistory
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n');

    const productsText =
      input.recommendedProducts.length > 0
        ? input.recommendedProducts
            .map(
              (product) =>
                `- ${product.name} | ${product.categoryName} | R$ ${product.price.toFixed(2)} | ${product.description}`
            )
            .join('\n')
        : '- Nenhum produto encontrado';

    return [
      'Atue como um vendedor consultivo de ecommerce em portugues do Brasil.',
      'Use apenas os produtos listados abaixo.',
      'Historico da conversa:',
      historyText || 'Sem historico anterior.',
      'Mensagem atual do cliente:',
      input.customerMessage,
      'Perfil inferido:',
      `Categorias: ${input.customerProfile.categoryIds.join(', ') || 'nao identificado'}`,
      `Tags: ${input.customerProfile.tags.join(', ') || 'nao identificado'}`,
      `Budget minimo: ${input.customerProfile.budgetMin ?? 'nao informado'}`,
      `Budget maximo: ${input.customerProfile.budgetMax ?? 'nao informado'}`,
      'Produtos recomendaveis do catalogo:',
      productsText,
      'Responda de forma humana, personalizada e objetiva.',
    ].join('\n');
  }
}
