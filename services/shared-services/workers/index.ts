/**
 * Worker registry
 * Centralized place to import and initialize all BullMQ workers
 */

export { processEmailJob, registerEmailWorker } from './email-notification.worker';
export { processWebhookDeliveryJob, registerWebhookDeliveryWorker } from './webhook-delivery.worker';
export { processTenantProvisioningJob, registerTenantProvisioningWorker } from './tenant-provisioning.worker';

/**
 * Initialize all workers
 * Call this in your service initialization
 */
export function initializeAllWorkers() {
  const { registerEmailWorker } = require('./email-notification.worker');
  const { registerWebhookDeliveryWorker } = require('./webhook-delivery.worker');
  const { registerTenantProvisioningWorker } = require('./tenant-provisioning.worker');

  registerEmailWorker();
  registerWebhookDeliveryWorker();
  registerTenantProvisioningWorker();

  console.log('✅ All BullMQ workers initialized');
}
