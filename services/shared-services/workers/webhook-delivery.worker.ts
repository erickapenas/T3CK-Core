import { Job } from 'bullmq';
import { Logger } from '@t3ck/shared';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';

const logger = new Logger('webhook-worker');

/**
 * Webhook delivery worker
 * Handles retries and delivery of webhook events to tenant endpoints
 */

interface WebhookDeliveryJobData {
  webhookId: string;
  webhookUrl: string;
  webhookSecret?: string;
  eventType: string;
  payload: Record<string, any>;
  tenantId: string;
  deliveryId: string;
  attempt?: number;
}

/**
 * Sign webhook payload with HMAC
 */
function signWebhookPayload(payload: Record<string, any>, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(payload);
  const signedContent = `${timestamp}.${payloadString}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  return `v1=${signature}`;
}

/**
 * Process webhook delivery job
 */
export async function processWebhookDeliveryJob(job: Job<WebhookDeliveryJobData>) {
  const attempt = job.data.attempt || 1;
  const maxRetries = 5;
  const retryDelays = [1000, 2000, 5000, 10000, 30000]; // ms

  try {
    logger.info(`Processing webhook delivery: ${job.id}`, {
      webhookId: job.data.webhookId,
      eventType: job.data.eventType,
      tenantId: job.data.tenantId,
      attempt,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'T3CK-Webhook-Delivery/1.0',
      'X-Webhook-ID': job.data.webhookId,
      'X-Event-Type': job.data.eventType,
      'X-Delivery-ID': job.data.deliveryId,
      'X-Timestamp': new Date().toISOString(),
    };

    // Sign webhook if secret is provided
    if (job.data.webhookSecret) {
      headers['X-Webhook-Signature'] = signWebhookPayload(
        job.data.payload,
        job.data.webhookSecret
      );
    }

    // Send webhook with timeout
    const response = await axios.post(job.data.webhookUrl, job.data.payload, {
      headers,
      timeout: 30000, // 30 second timeout
      maxRedirects: 3,
      validateStatus: (status) => status >= 200 && status < 400, // Accept 2xx and 3xx
    });

    logger.info(`Webhook delivered successfully: ${job.id}`, {
      webhookId: job.data.webhookId,
      statusCode: response.status,
      deliveryId: job.data.deliveryId,
    });

    return {
      success: true,
      webhookId: job.data.webhookId,
      deliveryId: job.data.deliveryId,
      statusCode: response.status,
      attempt,
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = axiosError?.message || String(error);
    const statusCode = axiosError?.response?.status;

    logger.warn(`Webhook delivery failed: ${job.id}`, {
      webhookId: job.data.webhookId,
      eventType: job.data.eventType,
      attempt,
      error: errorMessage,
      statusCode,
    });

    // Determine if we should retry
    const shouldRetry = attempt < maxRetries;

    // Don't retry on 4xx errors (client errors) except 429 (rate limit)
    if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
      logger.error(`Webhook delivery permanent failure: ${job.id}`, {
        webhookId: job.data.webhookId,
        statusCode,
        attempt,
      });
      throw new Error(`Webhook delivery failed with status ${statusCode}: ${errorMessage}`);
    }

    if (shouldRetry) {
      const delayMs = retryDelays[attempt - 1] || 60000;
      const error = new Error(`Webhook delivery failed (attempt ${attempt}/${maxRetries}): ${errorMessage}`);
      (error as any).code = 'WEBHOOK_RETRY';
      (error as any).retryDelay = delayMs;

      logger.info(`Scheduling webhook retry: ${job.id}`, {
        webhookId: job.data.webhookId,
        nextAttempt: attempt + 1,
        delayMs,
      });

      throw error;
    } else {
      logger.error(`Webhook delivery exhausted retries: ${job.id}`, {
        webhookId: job.data.webhookId,
        totalAttempts: maxRetries,
      });
      throw new Error(
        `Webhook delivery failed after ${maxRetries} attempts: ${errorMessage}`
      );
    }
  }
}

/**
 * Register webhook delivery worker
 */
import { createWorker } from '@t3ck/shared/queue';

export function registerWebhookDeliveryWorker() {
  const concurrency = parseInt(process.env.WEBHOOK_WORKER_CONCURRENCY || '10');
  createWorker('webhook-deliveries', processWebhookDeliveryJob, concurrency);
  logger.info('Webhook delivery worker registered', { concurrency });
}
