import { getMultiRegionManager, initializeMultiRegion } from '@t3ck/shared';
import { Logger } from '@t3ck/shared';

const logger = new Logger('webhook-service-multi-region');

/**
 * Initialize multi-region deployment for webhook service
 */
export async function initializeMultiRegionDeployment(): Promise<void> {
  try {
    await initializeMultiRegion();
    logger.info('Multi-region deployment initialized for webhook service');
  } catch (error) {
    logger.error('Failed to initialize multi-region deployment', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get multi-region manager instance
 */
export function getMultiRegionManagerInstance() {
  return getMultiRegionManager();
}

/**
 * Get failover status
 */
export function getFailoverStatus() {
  const manager = getMultiRegionManager();
  return manager.getFailoverStatus();
}

/**
 * Get region health status
 */
export async function getRegionHealthStatus() {
  const manager = getMultiRegionManager();
  return manager.getRegionHealthStatus();
}

/**
 * Get disaster recovery plan
 */
export function getDisasterRecoveryPlan() {
  const manager = getMultiRegionManager();
  return manager.getDisasterRecoveryPlan();
}

/**
 * Perform health checks
 */
export async function performHealthChecks() {
  const manager = getMultiRegionManager();
  return await manager.performHealthChecks();
}
