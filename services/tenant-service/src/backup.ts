import { Logger } from '@t3ck/shared';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const logger = new Logger('backup');

export interface BackupOptions {
  schedule?: string;
  s3Bucket?: string;
  gcsBucket?: string;
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
      await this.backupFirestore();
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
    if (!this.options.gcsBucket) {
      logger.warn('No gcsBucket configured; skipping Firestore backup');
      return;
    }

    const project = process.env.GCP_PROJECT;
    if (!project) {
      logger.warn('GCP_PROJECT not set; cannot run gcloud export');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = `gs://${this.options.gcsBucket}/firestore-backups/${project}/${timestamp}`;

    const cmd = `gcloud firestore export ${destination} --project=${project}`;
    logger.info('Running Firestore export command', { cmd });
    try {
      const { stdout, stderr } = await execAsync(cmd);
      logger.info('gcloud stdout', { stdout });
      if (stderr) logger.warn('gcloud stderr', { stderr });
    } catch (err) {
      logger.error('gcloud export failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async backupRedis(): Promise<void> {
    logger.info('backupRedis: starting');
    if (!this.options.s3Bucket) {
      logger.warn('No s3Bucket configured; skipping Redis backup');
      return;
    }

    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = parseInt(String(process.env.REDIS_PORT || '6379'));
    const dumpPath = process.env.REDIS_DUMP_PATH || '/data/dump.rdb';

    try {
      const saveCmd = `redis-cli -h ${host} -p ${port} SAVE`;
      logger.info('Running redis SAVE', { cmd: saveCmd });
      const { stdout, stderr } = await execAsync(saveCmd);
      logger.info('redis-cli stdout', { stdout });
      if (stderr) logger.warn('redis-cli stderr', { stderr });
    } catch (err) {
      logger.error('redis-cli SAVE failed', { error: err instanceof Error ? err.message : String(err) });
    }

    const s3Key = `redis-backups/${new Date().toISOString().replace(/[:.]/g, '-')}/dump.rdb`;
    const awsCmd = `aws s3 cp ${dumpPath} s3://${this.options.s3Bucket}/${s3Key}`;
    logger.info('Uploading Redis dump to S3 (aws cli)', { cmd: awsCmd });
    try {
      const { stdout, stderr } = await execAsync(awsCmd);
      logger.info('aws s3 cp stdout', { stdout });
      if (stderr) logger.warn('aws s3 cp stderr', { stderr });
    } catch (err) {
      logger.error('aws s3 cp failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  clearSchedule(): void {
    logger.info('clearSchedule called (not implemented)');
  }

  close(): void {
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
  return singleton;
}
