import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { Logger } from '@t3ck/shared';

export interface EventSchema {
  source: string;
  detailType: string;
  detail: Record<string, unknown>;
  tenantId: string;
}

export class EventBus {
  private client: EventBridgeClient;
  private busName: string;
  private logger: Logger;

  constructor() {
    this.client = new EventBridgeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.busName = process.env.EVENT_BUS_NAME || 't3ck-events';
    this.logger = new Logger('event-bus');
  }

  async publish(event: EventSchema): Promise<void> {
    try {
      const command = new PutEventsCommand({
        Entries: [
          {
            Source: event.source,
            DetailType: event.detailType,
            Detail: JSON.stringify(event.detail),
            EventBusName: this.busName,
          },
        ],
      });

      const response = await this.client.send(command);

      if (response.FailedEntryCount && response.FailedEntryCount > 0) {
        throw new Error('Failed to publish event');
      }

      this.logger.info('Event published', {
        source: event.source,
        detailType: event.detailType,
        tenantId: event.tenantId,
      });
    } catch (error) {
      this.logger.error('Failed to publish event', { error, event });
      throw error;
    }
  }
}

// Eventos padrão
export const EventTypes = {
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_CANCELLED: 'order.cancelled',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  SHIPMENT_CREATED: 'shipment.created',
  SHIPMENT_DELIVERED: 'shipment.delivered',
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
} as const;
