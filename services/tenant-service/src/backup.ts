import { getBackupManager, initializeBackups } from '@t3ck/shared';

/**
 * Initialize backup manager for tenant service
 */
export async function initializeBackup(config?: any): Promise<void> {
  await initializeBackups(config);
}

/**
 * Export BackupManager getter for backward compatibility
 */
export function getBackupManagerInstance() {
  return getBackupManager();
}

/**
 * Run backup immediately
 */
export async function runBackupNow() {
  const manager = getBackupManager();
  return manager.runBackupNow();
}

/**
 * Get backup status
 */
export function getBackupStatus() {
  const manager = getBackupManager();
  return manager.getStatus();
}

export { getBackupManager };
