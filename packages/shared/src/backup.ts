import { Logger } from './logger';
import { execSync } from 'child_process';

const logger = new Logger('backup-manager');

// Prometheus metrics (if prom-client is available)
let backupLastTimestamp: any;
let backupDurationSeconds: any;
let backupAttempts: any;
let backupFailures: any;

try {
  const { Gauge, Counter } = require('prom-client');
  backupLastTimestamp = new Gauge({
    name: 'backup_last_timestamp_seconds',
    help: 'Timestamp of last backup execution',
  });

  backupDurationSeconds = new Gauge({
    name: 'backup_duration_seconds',
    help: 'Duration of last backup in seconds',
  });

  backupAttempts = new Counter({
    name: 'backup_attempts_total',
    help: 'Total backup attempts',
  });

  backupFailures = new Counter({
    name: 'backup_failures_total',
    help: 'Total backup failures',
  });
} catch {
  // Metrics not available if prom-client is not installed
  logger.debug('Prometheus metrics not available for backups');
}

/**
 * Backup configuration
 */
export interface BackupConfig {
  enabled: boolean;
  gcpProject?: string;
  gcsBucket?: string;
  s3Bucket?: string;
  redisHost?: string;
  redisPort?: number;
  redisDumpPath?: string;
  firebaseProjectId?: string;
  environment: string;
}

/**
 * Backup result with metadata
 */
export interface BackupResult {
  success: boolean;
  timestamp: Date;
  duration: number;
  firestore?: {
    success: boolean;
    path?: string;
    error?: string;
  };
  redis?: {
    success: boolean;
    path?: string;
    error?: string;
  };
  totalSize?: number;
}

/**
 * BackupManager singleton for managing database backups
 */
class BackupManager {
  private static instance: BackupManager;
  private config: BackupConfig;
  private isRunning = false;

  private constructor(config: BackupConfig) {
    this.config = config;
    logger.info('BackupManager initialized', {
      enabled: config.enabled,
      environment: config.environment,
      hasGCP: !!config.gcpProject,
      hasAWS: !!config.s3Bucket,
    });
  }

  /**
   * Initialize or get BackupManager singleton
   */
  static initialize(config: BackupConfig): BackupManager {
    if (!BackupManager.instance) {
      BackupManager.instance = new BackupManager(config);
    }
    return BackupManager.instance;
  }

  /**
   * Get BackupManager singleton
   */
  static getInstance(): BackupManager {
    if (!BackupManager.instance) {
      const config: BackupConfig = {
        enabled: process.env.BACKUPS_ENABLED !== 'false',
        gcpProject: process.env.GCP_PROJECT,
        gcsBucket: process.env.BACKUP_GCS_BUCKET,
        s3Bucket: process.env.BACKUP_S3_BUCKET,
        redisHost: process.env.REDIS_HOST || 'localhost',
        redisPort: parseInt(process.env.REDIS_PORT || '6379'),
        redisDumpPath: process.env.REDIS_DUMP_PATH || '/data/dump.rdb',
        firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
        environment: process.env.NODE_ENV || 'development',
      };
      BackupManager.instance = new BackupManager(config);
    }
    return BackupManager.instance;
  }

  /**
   * Run backup immediately
   */
  async runBackupNow(): Promise<BackupResult> {
    if (!this.config.enabled) {
      logger.warn('Backups are disabled');
      return {
        success: false,
        timestamp: new Date(),
        duration: 0,
      };
    }

    if (this.isRunning) {
      logger.warn('Backup already in progress, skipping');
      return {
        success: false,
        timestamp: new Date(),
        duration: 0,
      };
    }

    backupAttempts?.inc();
    const startTime = Date.now();

    try {
      this.isRunning = true;
      const timestamp = new Date();
      const result: BackupResult = {
        success: true,
        timestamp,
        duration: 0,
        firestore: { success: false },
        redis: { success: false },
      };

      // Backup Firestore
      if (this.config.gcpProject && this.config.gcsBucket) {
        try {
          await this.backupFirestore(timestamp);
          result.firestore!.success = true;
          result.firestore!.path = `gs://${this.config.gcsBucket}/firestore-${timestamp.toISOString()}`;
          logger.info('Firestore backup completed', { path: result.firestore!.path });
        } catch (error) {
          backupFailures?.inc();
          result.firestore!.success = false;
          result.firestore!.error = error instanceof Error ? error.message : String(error);
          logger.error('Firestore backup failed', {
            error: result.firestore!.error,
          });
        }
      }

      // Backup Redis
      if (this.config.s3Bucket && this.config.redisHost) {
        try {
          await this.backupRedis(timestamp);
          result.redis!.success = true;
          result.redis!.path = `s3://${this.config.s3Bucket}/redis-${timestamp.toISOString()}/dump.rdb`;
          logger.info('Redis backup completed', { path: result.redis!.path });
        } catch (error) {
          backupFailures?.inc();
          result.redis!.success = false;
          result.redis!.error = error instanceof Error ? error.message : String(error);
          logger.error('Redis backup failed', {
            error: result.redis!.error,
          });
        }
      }

      result.success = result.firestore!.success || result.redis!.success;
      result.duration = Date.now() - startTime;

      // Update metrics
      if (backupLastTimestamp) {
        backupLastTimestamp.set(timestamp.getTime() / 1000);
      }
      if (backupDurationSeconds) {
        backupDurationSeconds.set(result.duration / 1000);
      }

      logger.info('Backup cycle completed', {
        success: result.success,
        duration: result.duration,
        firestore: result.firestore!.success,
        redis: result.redis!.success,
      });

      return result;
    } catch (error) {
      backupFailures?.inc();
      const duration = Date.now() - startTime;
      logger.error('Backup cycle failed', {
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      return {
        success: false,
        timestamp: new Date(),
        duration,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Backup Firestore using gcloud CLI
   */
  private async backupFirestore(timestamp: Date): Promise<void> {
    if (!this.config.gcpProject || !this.config.gcsBucket) {
      throw new Error('GCP configuration missing for Firestore backup');
    }

    const backupPath = `gs://${this.config.gcsBucket}/firestore-backups/${this.config.gcpProject}/${timestamp.getTime()}`;

    logger.debug('Starting Firestore backup', { destination: backupPath });

    try {
      const cmd = `gcloud firestore export ${backupPath} --project=${this.config.gcpProject}`;
      execSync(cmd, { stdio: 'pipe' });
      logger.info('Firestore backup command executed', { path: backupPath });
    } catch (error) {
      throw new Error(
        `Firestore backup failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Backup Redis using SAVE command and upload to S3
   */
  private async backupRedis(timestamp: Date): Promise<void> {
    if (!this.config.s3Bucket || !this.config.redisHost) {
      throw new Error('Redis/S3 configuration missing for Redis backup');
    }

    const backupKey = `redis-backups/${timestamp.getTime()}/dump.rdb`;
    const dumpPath = this.config.redisDumpPath || '/data/dump.rdb';

    logger.debug('Starting Redis backup', { host: this.config.redisHost, dumpPath });

    try {
      // Trigger SAVE command on Redis
      const redisCmd = `redis-cli -h ${this.config.redisHost} -p ${this.config.redisPort} SAVE`;
      execSync(redisCmd, { stdio: 'pipe' });
      logger.debug('Redis SAVE command executed');

      // Upload to S3
      const s3Cmd = `aws s3 cp ${dumpPath} s3://${this.config.s3Bucket}/${backupKey}`;
      execSync(s3Cmd, { stdio: 'pipe' });
      logger.info('Redis backup uploaded to S3', {
        bucket: this.config.s3Bucket,
        key: backupKey,
      });
    } catch (error) {
      throw new Error(
        `Redis backup failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Schedule automatic backups using node-cron
   * @param cronExpression cron schedule (e.g., '0 2 * * *' for 2 AM daily)
   */
  scheduleBackups(cronExpression: string = '0 2 * * *'): void {
    if (!this.config.enabled) {
      logger.warn('Backups disabled, schedule not started');
      return;
    }

    try {
      // Dynamically require cron only if needed
      const cron = require('node-cron');

      cron.schedule(cronExpression, async () => {
        logger.info('Scheduled backup triggered', { schedule: cronExpression });
        await this.runBackupNow();
      });

      logger.info('Backup scheduler initialized', { schedule: cronExpression });
    } catch (error) {
      logger.error('Failed to initialize backup scheduler', {
        error: error instanceof Error ? error.message : String(error),
        hint: 'Install node-cron if scheduling is needed',
      });
    }
  }

  /**
   * Get backup status and metrics
   */
  getStatus(): {
    enabled: boolean;
    isRunning: boolean;
    environment: string;
    capabilities: {
      firestore: boolean;
      redis: boolean;
    };
  } {
    return {
      enabled: this.config.enabled,
      isRunning: this.isRunning,
      environment: this.config.environment,
      capabilities: {
        firestore: !!this.config.gcpProject && !!this.config.gcsBucket,
        redis: !!this.config.s3Bucket && !!this.config.redisHost,
      },
    };
  }

  /**
   * Close backup manager and cleanup
   */
  async close(): Promise<void> {
    logger.info('BackupManager closed');
  }
}

/**
 * Initialize backup manager with configuration
 */
export async function initializeBackups(config?: Partial<BackupConfig>): Promise<void> {
  const fullConfig: BackupConfig = {
    enabled: process.env.BACKUPS_ENABLED !== 'false',
    gcpProject: process.env.GCP_PROJECT,
    gcsBucket: process.env.BACKUP_GCS_BUCKET,
    s3Bucket: process.env.BACKUP_S3_BUCKET,
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379'),
    redisDumpPath: process.env.REDIS_DUMP_PATH || '/data/dump.rdb',
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
    environment: process.env.NODE_ENV || 'development',
    ...config,
  };

  BackupManager.initialize(fullConfig);
  logger.info('Backups initialized', { enabled: fullConfig.enabled });
}

/**
 * Get BackupManager singleton
 */
export function getBackupManager(): BackupManager {
  return BackupManager.getInstance();
}

export { BackupManager };


