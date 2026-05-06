import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Logger } from './logger';

const logger = new Logger('database');

let dataSource: DataSource | null = null;

export interface DatabaseConfig {
  type: 'mysql' | 'postgres' | 'sqlite';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  migrationsRun: boolean;
}

/**
 * Initialize database connection
 */
export async function initializeDatabase(config: DatabaseConfig): Promise<DataSource> {
  if (dataSource && dataSource.isInitialized) {
    logger.info('Database already initialized');
    return dataSource;
  }

  try {
    dataSource = new DataSource({
      type: config.type as any,
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      database: config.database,
      synchronize: config.synchronize,
      logging: config.logging,
      migrationsRun: config.migrationsRun,
      entities: [],
      migrations: [],
      subscribers: [],
    });

    await dataSource.initialize();
    logger.info(`Database connected: ${config.database}`, {
      host: config.host,
      port: config.port,
      type: config.type,
    });

    return dataSource;
  } catch (error) {
    logger.error('Failed to initialize database', { error });
    throw error;
  }
}

/**
 * Get database connection
 */
export function getDatabase(): DataSource {
  if (!dataSource || !dataSource.isInitialized) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return dataSource;
}

/**
 * Run migrations
 */
export async function runMigrations(): Promise<void> {
  if (!dataSource || !dataSource.isInitialized) {
    throw new Error('Database not initialized');
  }

  try {
    const migrations = await dataSource.runMigrations();
    logger.info(`Executed ${migrations.length} migrations`, {
      migrations: migrations.map((m) => m.name),
    });
  } catch (error) {
    logger.error('Failed to run migrations', { error });
    throw error;
  }
}

/**
 * Revert last migration
 */
export async function revertMigration(): Promise<void> {
  if (!dataSource || !dataSource.isInitialized) {
    throw new Error('Database not initialized');
  }

  try {
    await dataSource.undoLastMigration();
    logger.info('Reverted last migration');
  } catch (error) {
    logger.error('Failed to revert migration', { error });
    throw error;
  }
}

/**
 * Get migration status
 */
export async function getMigrationStatus() {
  if (!dataSource || !dataSource.isInitialized) {
    throw new Error('Database not initialized');
  }

  try {
    const migrations = (await dataSource.query(
      `SELECT * FROM typeorm_metadata WHERE type = 'migration'`
    )) as any[];
    return {
      executed: migrations.length,
      pending: 0, // Would need to compare with migration files
      migrations: migrations.map((m: any) => ({
        name: m.name || 'unknown',
        timestamp: m.timestamp,
      })),
    };
  } catch (error) {
    logger.error('Failed to get migration status', { error });
    throw error;
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dataSource && dataSource.isInitialized) {
    try {
      await dataSource.destroy();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection', { error });
    }
  }
}

/**
 * Health check for database
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  if (!dataSource || !dataSource.isInitialized) {
    return false;
  }

  try {
    await dataSource.query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database health check failed', { error });
    return false;
  }
}
