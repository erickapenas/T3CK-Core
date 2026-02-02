import { Logger } from '@t3ck/shared';

const logger = new Logger('backup');

export interface BackupOptions {
  schedule?: string; // cron expression (optional)
  s3Bucket?: string; // optional target (for Redis snapshots, etc)
  gcsBucket?: string; // optional target for Firestore exports
}

export class BackupManager {
  private options: BackupOptions;
  private running = false;

  constructor(options?: BackupOptions) {
    this.options = options || {};
  }

  async runBackupNow(): Promise<void> {
    if (this.running) {
      logger.warn('Backup already running, skipping');
      return;
    }

    this.running = true;
    logger.info('Starting backup run');

    try {
      // Firestore backup stub
      await this.backupFirestore();

      // Redis backup stub
      await this.backupRedis();

      logger.info('Backup run finished successfully');
    } catch (err) {
      logger.error('Backup run failed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.running = false;
    }
  }

  private async backupFirestore(): Promise<void> {
    logger.info('backupFirestore: starting');
    // TODO: Implement Firestore export to GCS (gcloud SDK or REST)
    // Placeholder behavior: log and return
    if (!this.options.gcsBucket) {
      logger.warn('No gcsBucket configured; skipping Firestore backup');
      return;
    }

    logger.info(`Would export Firestore to gs://${this.options.gcsBucket}`);
    // Example: call gcloud or use Google Cloud Admin SDK
  }

  private async backupRedis(): Promise<void> {
    logger.info('backupRedis: starting');
    // TODO: Implement Redis snapshot export to S3 (ElastiCache snapshot or redis-cli SAVE + upload)
    if (!this.options.s3Bucket) {
      logger.warn('No s3Bucket configured; skipping Redis backup');
      return;
    }

    logger.info(`Would push Redis snapshot to s3://${this.options.s3Bucket}`);
  }

  clearSchedule(): void {
    // TODO: clear cron schedule if implemented
    logger.info('clearSchedule called (not implemented)');
  }

  close(): void {
    // Cleanup any schedulers
    logger.info('BackupManager closed');
  }
}

let singleton: BackupManager | null = null;

export function getBackupManager(): BackupManager {
  if (!singleton) singleton = new BackupManager();
  return singleton;
}

export function initializeBackup(options?: BackupOptions): BackupManager {
  if (!singleton) singleton = new BackupManager(options);
  // Optionally schedule based on options.schedule
  return singleton;
}
