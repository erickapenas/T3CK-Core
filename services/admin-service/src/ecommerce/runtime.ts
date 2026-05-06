import type {
  BackgroundJobScheduler,
  InvoicePayload,
  InvoiceProvider,
  InvoiceResponse,
  LegalTextGenerator,
  RealtimeAIProvider,
  RealtimeChatCompletionRequest,
  RealtimeChatCompletionResponse,
  StoreLegalProfileInput,
} from '@t3ck/shared';
import {
  DefaultBackgroundInvoiceJobScheduler,
  DefaultPdfExportJobScheduler,
  DefaultRecoveryMessageGenerator,
  EcommerceAnalyticsDashboardService,
  EcommerceCartRecoveryAI,
  EcommerceCouponAndShippingEngine,
  EcommerceCRMService,
  EcommerceCustomerAccountPortalService,
  EcommerceHyperPersonalizationEngine,
  EcommerceLegalDocumentGenerator,
  EcommerceRecommendationChatbot,
  EcommerceTaxAutomationService,
} from '@t3ck/shared';
import { getFirestore } from '../firebase';
import { ConfiguredCarrierQuoteProvider } from './firebase-repositories';
import {
  createLazyFirebaseRepositories,
  LazyFirebaseRepositories,
} from './lazy-firebase-repositories';

class DeferredRealtimeAIProvider implements RealtimeAIProvider {
  public async completeChat(
    _input: RealtimeChatCompletionRequest
  ): Promise<RealtimeChatCompletionResponse> {
    throw new Error('Realtime AI provider not configured');
  }
}

class QueueOnlyJobScheduler implements BackgroundJobScheduler {
  public async enqueue(
    jobName: string,
    payload: Record<string, unknown>
  ): Promise<{
    jobId: string;
    enqueuedAt: Date;
  }> {
    return {
      jobId: `${jobName}_${Date.now()}`,
      enqueuedAt: new Date(),
      ...('storeId' in payload ? {} : {}),
    };
  }
}

class TemplateLegalTextGenerator implements LegalTextGenerator {
  public async generate(input: {
    type: 'terms-of-use' | 'privacy-policy' | 'exchange-policy';
    profile: StoreLegalProfileInput;
  }): Promise<{
    title: string;
    content: string;
  }> {
    const brand = input.profile.brandName ?? input.profile.companyName;
    const titles = {
      'terms-of-use': 'Termos de uso',
      'privacy-policy': 'Politica de privacidade',
      'exchange-policy': 'Politica de trocas e devolucoes',
    };

    return {
      title: `${titles[input.type]} - ${brand}`,
      content: [
        `${brand} disponibiliza este documento como minuta operacional.`,
        `Contato principal: ${input.profile.email}.`,
        `Site: ${input.profile.websiteUrl}.`,
        input.profile.returnWindowDays
          ? `Prazo de troca/devolucao informado: ${input.profile.returnWindowDays} dias.`
          : 'Prazo de troca/devolucao sujeito a configuracao da loja.',
        'Revise este texto com assessoria juridica antes de publicar.',
      ].join('\n\n'),
    };
  }
}

class DeferredInvoiceProvider implements InvoiceProvider {
  public async issueNFe(_payload: InvoicePayload): Promise<InvoiceResponse> {
    return {
      success: false,
      status: 'failed',
      errorMessage: 'Provider de NF-e ainda nao configurado.',
    };
  }
}

export interface EcommerceRuntime {
  repositories: LazyFirebaseRepositories;
  chatbot: EcommerceRecommendationChatbot;
  personalization: EcommerceHyperPersonalizationEngine;
  cartRecovery: EcommerceCartRecoveryAI;
  couponShipping: EcommerceCouponAndShippingEngine;
  analytics: EcommerceAnalyticsDashboardService;
  crm: EcommerceCRMService;
  portal: EcommerceCustomerAccountPortalService;
  tax: EcommerceTaxAutomationService;
  legal: EcommerceLegalDocumentGenerator;
}

let runtime: EcommerceRuntime | null = null;

export function getEcommerceRuntime(): EcommerceRuntime {
  if (runtime) {
    return runtime;
  }

  const repositories = createLazyFirebaseRepositories(getFirestore());
  const carrierQuoteProvider = new ConfiguredCarrierQuoteProvider(
    repositories.getCarrierConfigRepository()
  );

  runtime = {
    repositories,
    chatbot: new EcommerceRecommendationChatbot(
      repositories.getCatalogRepository(),
      repositories.getChatbotSessionRepository(),
      repositories.getCustomerPreferenceRepository(),
      new DeferredRealtimeAIProvider(),
      {
        memoryRepository: repositories.getConversationMemoryRepository(),
        analyticsRepository: repositories.getChatbotAnalyticsRepository(),
        handoffRepository: repositories.getChatbotHandoffRepository(),
      }
    ),
    personalization: new EcommerceHyperPersonalizationEngine(
      repositories.getCatalogRepository(),
      repositories.getCustomerInteractionRepository(),
      {
        snapshotRepository: repositories.getPersonalizationSnapshotRepository(),
      }
    ),
    cartRecovery: EcommerceCartRecoveryAI.create({
      cartRepository: repositories.getCartRepository(),
      customerRecoveryRepository: repositories.getCustomerRecoveryRepository(),
      recoveryCampaignRepository: repositories.getRecoveryCampaignRepository(),
      aiMessageGenerator: new DefaultRecoveryMessageGenerator(),
    }),
    couponShipping: new EcommerceCouponAndShippingEngine(
      repositories.getCouponRepository(),
      repositories.getShippingTableRepository(),
      repositories.getCarrierConfigRepository(),
      carrierQuoteProvider
    ),
    analytics: EcommerceAnalyticsDashboardService.create({
      analyticsRepository: repositories.getAnalyticsRepository(),
      pdfExportJobScheduler: new DefaultPdfExportJobScheduler(),
    }),
    crm: new EcommerceCRMService(repositories.getCRMRepository(), new QueueOnlyJobScheduler()),
    portal: new EcommerceCustomerAccountPortalService(repositories.getCustomerPortalRepository()),
    tax: EcommerceTaxAutomationService.create({
      taxRuleRepository: repositories.getTaxRuleRepository(),
      invoiceRepository: repositories.getInvoiceRepository(),
      invoiceProvider: new DeferredInvoiceProvider(),
      backgroundInvoiceJobScheduler: new DefaultBackgroundInvoiceJobScheduler(),
    }),
    legal: new EcommerceLegalDocumentGenerator(
      repositories.getLegalDocumentRepository(),
      repositories.getStoreLegalProfileRepository(),
      new TemplateLegalTextGenerator()
    ),
  };

  return runtime;
}
