import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { WebhookManager } from './webhook-manager';
import { Logger } from '@t3ck/shared';

export interface EventBridgeEvent {
  source: string;
  'detail-type': string;
  detail: Record<string, unknown>;
  'detail-type': string;
}

export class EventHandler {
  private webhookManager: WebhookManager;
  private logger: Logger;

  constructor() {
    this.webhookManager = new WebhookManager();
    this.logger = new Logger('event-handler');
  }

  async handleEvent(event: EventBridgeEvent): Promise<void> {
    try {
      const tenantId = this.extractTenantId(event.detail);
      if (!tenantId) {
        this.logger.warn('Tenant ID not found in event', { event });
        return;
      }

      const eventType = event['detail-type'];
      const webhooks = await this.webhookManager.getWebhooksByTenant(tenantId);

      this.logger.info('Processing event', {
        eventType,
        tenantId,
        webhookCount: webhooks.length,
      });

      // Enviar para todos os webhooks que estão inscritos neste evento
      for (const webhook of webhooks) {
        if (webhook.active && webhook.events.includes(eventType)) {
          await this.webhookManager.deliverWebhook(webhook, eventType, event.detail);
        }
      }
    } catch (error) {
      this.logger.error('Failed to handle event', { error, event });
      throw error;
    }
  }

  private extractTenantId(detail: Record<string, unknown>): string | null {
    if (typeof detail.tenantId === 'string') {
      return detail.tenantId;
    }

    if (typeof detail.order === 'object' && detail.order !== null) {
      const order = detail.order as Record<string, unknown>;
      if (typeof order.tenantId === 'string') {
        return order.tenantId;
      }
    }

    return null;
  }
}
