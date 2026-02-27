import axios, { AxiosError } from 'axios';
import Redis from 'ioredis';
import { Logger } from '@t3ck/shared';

export interface Webhook {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttemptAt?: string;
  responseCode?: number;
  responseBody?: string;
  error?: string;
}

export class WebhookManager {
  private redis: Redis | null;
  private logger: Logger;
  private maxRetries: number = 5;
  private retryDelays: number[] = [1000, 2000, 5000, 10000, 30000]; // em ms
  private memoryWebhooks: Map<string, Webhook> = new Map();
  private memoryTenantWebhooks: Map<string, Set<string>> = new Map();
  private memoryDeliveries: Map<string, WebhookDelivery[]> = new Map();
  private memoryDlq: Array<{ webhook: Webhook; delivery: WebhookDelivery }> = [];
  private useRedis: boolean;

  constructor(redisUrl?: string) {
    this.logger = new Logger('webhook-manager');
    this.useRedis =
      process.env.REDIS_DISABLED !== 'true' &&
      (process.env.REDIS_ENABLED === 'true' || process.env.NODE_ENV === 'production');

    if (this.useRedis) {
      this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
      });

      this.redis.on('error', (error) => {
        this.logger.warn('WebhookManager Redis unavailable, using in-memory fallback', { error: String(error) });
        this.useRedis = false;
      });
    } else {
      this.redis = null;
    }
  }

  async createWebhook(webhook: Omit<Webhook, 'id' | 'createdAt' | 'updatedAt'>): Promise<Webhook> {
    const id = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const newWebhook: Webhook = {
      ...webhook,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.setWebhook(id, newWebhook);
    await this.addTenantWebhook(webhook.tenantId, id);

    this.logger.info('Webhook created', { webhookId: id, tenantId: webhook.tenantId });
    return newWebhook;
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    const data = await this.getWebhookData(id);
    return data;
  }

  async getWebhooksByTenant(tenantId: string): Promise<Webhook[]> {
    const webhookIds = await this.getTenantWebhookIds(tenantId);
    const webhooks: Webhook[] = [];

    for (const id of webhookIds) {
      const webhook = await this.getWebhook(id);
      if (webhook) {
        webhooks.push(webhook);
      }
    }

    return webhooks;
  }

  async updateWebhook(id: string, updates: Partial<Webhook>): Promise<Webhook | null> {
    const webhook = await this.getWebhook(id);
    if (!webhook) {
      return null;
    }

    const updated: Webhook = {
      ...webhook,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.setWebhook(id, updated);
    this.logger.info('Webhook updated', { webhookId: id });
    return updated;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const webhook = await this.getWebhook(id);
    if (!webhook) {
      return false;
    }

    await this.deleteWebhookData(id);
    await this.removeTenantWebhook(webhook.tenantId, id);
    this.logger.info('Webhook deleted', { webhookId: id });
    return true;
  }

  async deliverWebhook(
    webhook: Webhook,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!webhook.active) {
      this.logger.warn('Webhook is inactive', { webhookId: webhook.id });
      return;
    }

    if (!webhook.events.includes(eventType)) {
      this.logger.debug('Event type not subscribed', {
        webhookId: webhook.id,
        eventType,
      });
      return;
    }

    const delivery: WebhookDelivery = {
      id: `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      webhookId: webhook.id,
      eventType,
      payload,
      status: 'pending',
      attempts: 0,
    };

    await this.retryDelivery(webhook, delivery);
  }

  private async retryDelivery(webhook: Webhook, delivery: WebhookDelivery): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      delivery.attempts = attempt + 1;
      delivery.lastAttemptAt = new Date().toISOString();

      try {
        const response = await axios.post(
          webhook.url,
          {
            event: delivery.eventType,
            data: delivery.payload,
            timestamp: new Date().toISOString(),
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-T3CK-Event': delivery.eventType,
              'X-T3CK-Delivery-ID': delivery.id,
              ...(webhook.secret && {
                'X-T3CK-Signature': this.generateSignature(webhook.secret, delivery.payload),
              }),
            },
            timeout: 10000,
          }
        );

        delivery.status = 'success';
        delivery.responseCode = response.status;
        delivery.responseBody = JSON.stringify(response.data);

        await this.saveDelivery(webhook.id, delivery);
        this.logger.info('Webhook delivered successfully', {
          webhookId: webhook.id,
          deliveryId: delivery.id,
          attempt: delivery.attempts,
        });

        return;
      } catch (error) {
        const axiosError = error as AxiosError;
        delivery.responseCode = axiosError.response?.status;
        delivery.error = axiosError.message;

        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelays[attempt] || 30000;
          await this.sleep(delay);
        } else {
          delivery.status = 'failed';
          await this.saveDelivery(webhook.id, delivery);
          await this.sendToDeadLetterQueue(webhook, delivery);

          this.logger.error('Webhook delivery failed after retries', {
            webhookId: webhook.id,
            deliveryId: delivery.id,
            attempts: delivery.attempts,
            error: delivery.error,
          });
        }
      }
    }
  }

  private async saveDelivery(webhookId: string, delivery: WebhookDelivery): Promise<void> {
    if (this.useRedis && this.redis) {
      await this.redis.lpush(`webhook:${webhookId}:deliveries`, JSON.stringify(delivery));
      await this.redis.ltrim(`webhook:${webhookId}:deliveries`, 0, 99); // Manter últimos 100
      return;
    }

    const deliveries = this.memoryDeliveries.get(webhookId) || [];
    deliveries.unshift(delivery);
    this.memoryDeliveries.set(webhookId, deliveries.slice(0, 100));
  }

  async getDeliveryLogs(webhookId: string, limit: number = 50): Promise<WebhookDelivery[]> {
    if (this.useRedis && this.redis) {
      const deliveries = await this.redis.lrange(`webhook:${webhookId}:deliveries`, 0, limit - 1);
      return deliveries.map((d) => JSON.parse(d)).reverse();
    }

    return (this.memoryDeliveries.get(webhookId) || []).slice(0, limit).reverse();
  }

  private async sendToDeadLetterQueue(webhook: Webhook, delivery: WebhookDelivery): Promise<void> {
    if (this.useRedis && this.redis) {
      await this.redis.lpush('dlq:webhooks', JSON.stringify({ webhook, delivery }));
      return;
    }

    this.memoryDlq.unshift({ webhook, delivery });
  }

  private async setWebhook(id: string, webhook: Webhook): Promise<void> {
    if (this.useRedis && this.redis) {
      await this.redis.set(`webhook:${id}`, JSON.stringify(webhook));
      return;
    }
    this.memoryWebhooks.set(id, webhook);
  }

  private async getWebhookData(id: string): Promise<Webhook | null> {
    if (this.useRedis && this.redis) {
      const data = await this.redis.get(`webhook:${id}`);
      return data ? (JSON.parse(data) as Webhook) : null;
    }

    return this.memoryWebhooks.get(id) || null;
  }

  private async deleteWebhookData(id: string): Promise<void> {
    if (this.useRedis && this.redis) {
      await this.redis.del(`webhook:${id}`);
      return;
    }

    this.memoryWebhooks.delete(id);
  }

  private async addTenantWebhook(tenantId: string, webhookId: string): Promise<void> {
    if (this.useRedis && this.redis) {
      await this.redis.sadd(`tenant:${tenantId}:webhooks`, webhookId);
      return;
    }

    const set = this.memoryTenantWebhooks.get(tenantId) || new Set<string>();
    set.add(webhookId);
    this.memoryTenantWebhooks.set(tenantId, set);
  }

  private async removeTenantWebhook(tenantId: string, webhookId: string): Promise<void> {
    if (this.useRedis && this.redis) {
      await this.redis.srem(`tenant:${tenantId}:webhooks`, webhookId);
      return;
    }

    const set = this.memoryTenantWebhooks.get(tenantId);
    if (!set) {
      return;
    }

    set.delete(webhookId);
    if (set.size === 0) {
      this.memoryTenantWebhooks.delete(tenantId);
    }
  }

  private async getTenantWebhookIds(tenantId: string): Promise<string[]> {
    if (this.useRedis && this.redis) {
      return this.redis.smembers(`tenant:${tenantId}:webhooks`);
    }

    return Array.from(this.memoryTenantWebhooks.get(tenantId) || []);
  }

  private generateSignature(secret: string, payload: Record<string, unknown>): string {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
