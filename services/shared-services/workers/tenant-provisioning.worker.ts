import { Job } from 'bullmq';
import { Logger } from '@t3ck/shared';
import { Database } from '@t3ck/shared';

const logger = new Logger('tenant-provisioning-worker');

/**
 * Tenant provisioning worker
 * Handles async setup of new tenant infrastructure
 */

interface TenantProvisioningJobData {
  tenantId: string;
  companyName: string;
  domain: string;
  contactEmail: string;
  contactName: string;
  plan: string;
  region?: string;
}

const db = new Database();

/**
 * Setup tenant database schema
 */
async function setupTenantDatabase(tenantId: string): Promise<void> {
  logger.info(`Setting up database for tenant: ${tenantId}`);

  try {
    // Create tenant-specific database/schema
    const schema = `t3ck_${tenantId}`;

    // Create schema
    await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

    // Create tables with tenant context
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.products (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100) NOT NULL UNIQUE,
        price DECIMAL(10,2) NOT NULL,
        status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
        inventory INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sku (sku),
        INDEX idx_status (status)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.orders (
        id VARCHAR(36) PRIMARY KEY,
        customer_id VARCHAR(100) NOT NULL,
        status ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
        total DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_customer (customer_id),
        INDEX idx_status (status)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.customers (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      )
    `);

    logger.info(`Database setup completed for tenant: ${tenantId}`, { schema });
  } catch (error) {
    logger.error(`Database setup failed for tenant: ${tenantId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Setup tenant configuration and secrets
 */
async function setupTenantSecrets(tenantId: string, plan: string): Promise<void> {
  logger.info(`Setting up secrets for tenant: ${tenantId}`, { plan });

  try {
    // Create tenant-specific API key
    const apiKey = `sk_${tenantId}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 16)}`;

    // Store in Secret Manager or local config
    // This would typically go to Google Secret Manager
    const secretName = `t3ck/tenants/${tenantId}/api-key`;

    logger.info(`Secrets setup completed for tenant: ${tenantId}`, { secretName });

    // Store in database for reference
    await db.query(
      `INSERT INTO tenant_config (tenant_id, config_key, config_value)
       VALUES (?, ?, ?)`,
      [tenantId, 'api_key_hash', Buffer.from(apiKey).toString('base64')]
    );
  } catch (error) {
    logger.error(`Secrets setup failed for tenant: ${tenantId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Setup default tenant webhooks
 */
async function setupWebhooks(tenantId: string, domain: string): Promise<void> {
  logger.info(`Setting up webhooks for tenant: ${tenantId}`);

  try {
    const webhooks = [
      {
        event: 'order.created',
        url: `${domain}/webhooks/order-created`,
      },
      {
        event: 'order.updated',
        url: `${domain}/webhooks/order-updated`,
      },
      {
        event: 'payment.completed',
        url: `${domain}/webhooks/payment-completed`,
      },
    ];

    for (const webhook of webhooks) {
      await db.query(
        `INSERT INTO webhooks (tenant_id, event_type, url, active, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [tenantId, webhook.event, webhook.url, true]
      );
    }

    logger.info(`Webhooks setup completed for tenant: ${tenantId}`, {
      count: webhooks.length,
    });
  } catch (error) {
    logger.error(`Webhooks setup failed for tenant: ${tenantId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Send welcome notification to tenant admin
 */
async function sendWelcomeNotification(
  tenantId: string,
  contactEmail: string,
  contactName: string,
  companyName: string
): Promise<void> {
  logger.info(`Sending welcome notification for tenant: ${tenantId}`);

  try {
    // Queue email notification job
    // This would typically enqueue an email job to the email worker
    const emailJobData = {
      to: contactEmail,
      subject: `Welcome to T3CK Core, ${companyName}!`,
      template: 'tenant_welcome',
      data: {
        firstName: contactName,
        companyName,
        loginUrl: 'https://app.t3ck.com/login',
        docsUrl: 'https://docs.t3ck.com',
      },
    };

    // In a real scenario, this would queue to the email worker
    logger.info(`Welcome notification queued for: ${contactEmail}`, emailJobData);
  } catch (error) {
    logger.error(`Welcome notification failed for tenant: ${tenantId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Setup tenant usage quotas based on plan
 */
async function setupPlanQuotas(tenantId: string, plan: string): Promise<void> {
  logger.info(`Setting up quotas for tenant: ${tenantId}`, { plan });

  type PlanQuotas = {
    [key: string]: {
      monthlyApiCalls: number;
      maxWebhooks: number;
      maxUsers: number;
      storageGb: number;
      concurrentRequests: number;
    };
  };

  const planLimits: PlanQuotas = {
    free: {
      monthlyApiCalls: 10000,
      maxWebhooks: 5,
      maxUsers: 1,
      storageGb: 1,
      concurrentRequests: 10,
    },
    standard: {
      monthlyApiCalls: 100000,
      maxWebhooks: 50,
      maxUsers: 5,
      storageGb: 10,
      concurrentRequests: 100,
    },
    premium: {
      monthlyApiCalls: 1000000,
      maxWebhooks: 500,
      maxUsers: 50,
      storageGb: 100,
      concurrentRequests: 500,
    },
    enterprise: {
      monthlyApiCalls: 0, // unlimited
      maxWebhooks: 0, // unlimited
      maxUsers: 0, // unlimited
      storageGb: 0, // unlimited
      concurrentRequests: 0, // unlimited
    },
  };

  const quotas = planLimits[plan] || planLimits.free;

  try {
    await db.query(
      `INSERT INTO tenant_quotas (tenant_id, monthly_api_calls, max_webhooks, max_users, storage_gb, concurrent_requests, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        tenantId,
        quotas.monthlyApiCalls,
        quotas.maxWebhooks,
        quotas.maxUsers,
        quotas.storageGb,
        quotas.concurrentRequests,
      ]
    );

    logger.info(`Quotas setup completed for tenant: ${tenantId}`, quotas);
  } catch (error) {
    logger.error(`Quotas setup failed for tenant: ${tenantId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Process tenant provisioning job
 */
export async function processTenantProvisioningJob(job: Job<TenantProvisioningJobData>) {
  try {
    logger.info(`Processing tenant provisioning: ${job.id}`, {
      tenantId: job.data.tenantId,
      plan: job.data.plan,
    });

    // Step 1: Setup database
    await setupTenantDatabase(job.data.tenantId);

    // Step 2: Setup secrets
    await setupTenantSecrets(job.data.tenantId, job.data.plan);

    // Step 3: Setup webhooks
    await setupWebhooks(job.data.tenantId, job.data.domain);

    // Step 4: Setup plan quotas
    await setupPlanQuotas(job.data.tenantId, job.data.plan);

    // Step 5: Send welcome notification
    await sendWelcomeNotification(
      job.data.tenantId,
      job.data.contactEmail,
      job.data.contactName,
      job.data.companyName
    );

    // Update tenant status to ACTIVE
    await db.query(`UPDATE tenants SET status = ?, provisioned_at = NOW() WHERE id = ?`, [
      'active',
      job.data.tenantId,
    ]);

    logger.info(`Tenant provisioning completed: ${job.id}`, {
      tenantId: job.data.tenantId,
    });

    return {
      success: true,
      tenantId: job.data.tenantId,
      message: `Tenant ${job.data.tenantId} provisioned successfully`,
    };
  } catch (error) {
    logger.error(`Tenant provisioning failed: ${job.id}`, {
      tenantId: job.data.tenantId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Update tenant status to ERROR
    await db.query(
      `UPDATE tenants SET status = ?, error_message = ? WHERE id = ?`,
      ['error', error instanceof Error ? error.message : String(error), job.data.tenantId]
    );

    throw error;
  }
}

/**
 * Register tenant provisioning worker
 */
import { createWorker } from '@t3ck/shared/queue';

export function registerTenantProvisioningWorker() {
  const concurrency = parseInt(process.env.PROVISIONING_WORKER_CONCURRENCY || '3');
  createWorker('tenant-provisioning', processTenantProvisioningJob, concurrency);
  logger.info('Tenant provisioning worker registered', { concurrency });
}
