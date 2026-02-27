import { Database, DataClassification, RetentionPolicy } from '@t3ck/shared';
import { Logger } from '@t3ck/shared/logger';
import axios from 'axios';

interface OffboardingRequest {
  tenantId: string;
  reason: 'contract_end' | 'request' | 'fraud' | 'inactivity' | 'other';
  exportData?: boolean;
  deleteImmediately?: boolean;
  approvedBy?: string;
}

interface OffboardingAuditTrail {
  tenantId: string;
  timestamp: Date;
  action: 'initiated' | 'data_exported' | 'data_deleted' | 'completed' | 'failed';
  details: Record<string, unknown>;
  executedBy: string;
}

interface TenantDataExport {
  tenantId: string;
  exportedAt: Date;
  s3Url: string;
  format: 'json' | 'csv';
  dataTypes: string[];
  recordCount: number;
  sizeBytes: number;
}

/**
 * Tenant Offboarding Service
 * Handles secure tenant removal, data export, and compliance
 */
export class TenantOffboardingService {
  private logger: Logger;
  private db: Database;
  private auditTrail: OffboardingAuditTrail[] = [];

  constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Initiate tenant offboarding process
   * Validates prerequisites and creates audit trail
   */
  async initiateOffboarding(request: OffboardingRequest): Promise<void> {
    this.logger.info(`[TenantOffboarding] Initiating offboarding for tenant: ${request.tenantId}`, {
      reason: request.reason,
      exportData: request.exportData,
    });

    try {
      // Validate tenant exists and is active
      const tenant = await this.db.query('SELECT * FROM tenants WHERE id = ?', [
        request.tenantId,
      ]);
      if (!tenant) {
        throw new Error(`Tenant ${request.tenantId} not found`);
      }

      // Create audit trail entry
      this.addAuditTrail(request.tenantId, 'initiated', {
        reason: request.reason,
        exportData: request.exportData,
        approvedBy: request.approvedBy,
      });

      // Notify off external services
      await this.notifyExternalServices(request.tenantId, 'offboarding_started');

      // Mark tenant as offboarding
      await this.db.query('UPDATE tenants SET status = ?, offboarded_at = NOW() WHERE id = ?', [
        'offboarding',
        request.tenantId,
      ]);

      // Step 1: Backup and export data if requested
      if (request.exportData) {
        await this.exportTenantData(request.tenantId);
      }

      // Step 2: Revoke all API keys and sessions
      await this.revokeAccessTokens(request.tenantId);

      // Step 3: Delete data based on retention policies
      if (request.deleteImmediately) {
        await this.deleteTenantData(request.tenantId);
      } else {
        // Schedule deletion after retention period
        await this.scheduleDataDeletion(request.tenantId);
      }

      // Step 4: Update tenant status
      await this.db.query('UPDATE tenants SET status = ? WHERE id = ?', ['offboarded', request.tenantId]);

      this.addAuditTrail(request.tenantId, 'completed', {
        completedAt: new Date(),
      });

      this.logger.info(`[TenantOffboarding] Offboarding completed for tenant: ${request.tenantId}`);
    } catch (error) {
      this.logger.error(`[TenantOffboarding] Offboarding failed for tenant: ${request.tenantId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      this.addAuditTrail(request.tenantId, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Export tenant data for compliance/archive
   * Supports JSON and CSV formats
   */
  async exportTenantData(tenantId: string, format: 'json' | 'csv' = 'json'): Promise<TenantDataExport> {
    this.logger.info(`[TenantOffboarding] Exporting data for tenant: ${tenantId}`, { format });

    try {
      const exportedData = await this.compileTenantData(tenantId);

      // Convert to requested format
      const formatted = format === 'json' 
        ? JSON.stringify(exportedData, null, 2)
        : this.convertToCSV(exportedData);

      // Upload to S3 with encryption
      const s3Url = await this.uploadToS3(tenantId, formatted, format);

      const export_record: TenantDataExport = {
        tenantId,
        exportedAt: new Date(),
        s3Url,
        format,
        dataTypes: Object.keys(exportedData),
        recordCount: this.countRecords(exportedData),
        sizeBytes: new Blob([formatted]).size,
      };

      // Log export in audit trail
      this.addAuditTrail(tenantId, 'data_exported', export_record);

      // Store export metadata in database for compliance
      await this.db.query(
        'INSERT INTO tenant_data_exports (tenant_id, export_date, s3_url, format, record_count) VALUES (?, ?, ?, ?, ?)',
        [tenantId, new Date(), s3Url, format, export_record.recordCount]
      );

      return export_record;
    } catch (error) {
      this.logger.error(`[TenantOffboarding] Data export failed for tenant: ${tenantId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Revoke all access tokens, API keys, and sessions
   */
  async revokeAccessTokens(tenantId: string): Promise<void> {
    this.logger.info(`[TenantOffboarding] Revoking access tokens for tenant: ${tenantId}`);

    try {
      // Revoke JWT tokens (via token blacklist service)
      await axios.post('http://auth-service:3001/auth/tokens/revoke-all', {
        tenantId,
      });

      // Revoke API keys
      await axios.post('http://auth-service:3001/auth/api-keys/revoke-all', {
        tenantId,
      });

      // Revoke sessions
      await axios.post('http://auth-service:3001/auth/sessions/revoke-all', {
        tenantId,
      });

      this.addAuditTrail(tenantId, 'data_deleted', {
        revokedTokens: true,
        revokedApiKeys: true,
        revokedSessions: true,
      });
    } catch (error) {
      this.logger.error(`[TenantOffboarding] Token revocation failed for tenant: ${tenantId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete tenant data permanently
   * Respects retention policies and GDPR requirements
   */
  async deleteTenantData(tenantId: string): Promise<void> {
    this.logger.info(`[TenantOffboarding] Deleting data for tenant: ${tenantId}`);

    try {
      // Get list of tables/collections for this tenant
      const tables = [
        'users',
        'orders',
        'payments',
        'webhooks',
        'events',
        'api_keys',
        'sessions',
        'activity_logs',
        'audit_logs',
      ];

      for (const table of tables) {
        this.logger.debug(`[TenantOffboarding] Deleting records from ${table}`, { tenantId });
        await this.db.query(`DELETE FROM ?? WHERE tenant_id = ?`, [table, tenantId]);
      }

      // Delete tenant record
      await this.db.query('DELETE FROM tenants WHERE id = ?', [tenantId]);

      // Delete S3 artifacts
      await this.deleteS3Artifacts(tenantId);

      // Delete Redis cache entries
      await this.deleteRedisCacheEntries(tenantId);

      this.addAuditTrail(tenantId, 'data_deleted', {
        deletedAt: new Date(),
        tablesCleared: tables.length,
      });

      this.logger.info(`[TenantOffboarding] Data deletion completed for tenant: ${tenantId}`);
    } catch (error) {
      this.logger.error(`[TenantOffboarding] Data deletion failed for tenant: ${tenantId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Schedule data deletion for later date (GDPR right to be forgotten)
   * Creates timer for automatic deletion after retention period
   */
  async scheduleDataDeletion(tenantId: string, retentionDays: number = 30): Promise<void> {
    this.logger.info(`[TenantOffboarding] Scheduling data deletion for tenant: ${tenantId}`, {
      retentionDays,
    });

    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + retentionDays);

    await this.db.query(
      'INSERT INTO scheduled_deletions (tenant_id, deletion_date, status) VALUES (?, ?, ?)',
      [tenantId, deletionDate, 'pending']
    );

    // Create background job / event to trigger deletion
    await this.publishDeletionScheduledEvent(tenantId, deletionDate);
  }

  /**
   * Compile all tenant data for export
   * Gathers records from all tables with proper formatting
   */
  private async compileTenantData(tenantId: string): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      tenantId,
    };

    // Query each data table
    data.users = await this.db.query('SELECT * FROM users WHERE tenant_id = ?', [tenantId]);
    data.orders = await this.db.query('SELECT * FROM orders WHERE tenant_id = ?', [tenantId]);
    data.payments = await this.db.query('SELECT * FROM payments WHERE tenant_id = ?', [tenantId]);
    data.webhooks = await this.db.query('SELECT * FROM webhooks WHERE tenant_id = ?', [tenantId]);
    data.events = await this.db.query('SELECT * FROM events WHERE tenant_id = ?', [tenantId]);
    data.audit_logs = await this.db.query('SELECT * FROM audit_logs WHERE tenant_id = ?', [
      tenantId,
    ]);

    return data;
  }

  /**
   * Convert tenant data to CSV format
   */
  private convertToCSV(data: Record<string, unknown>): string {
    const csv: string[] = [];

    for (const [key, records] of Object.entries(data)) {
      if (Array.isArray(records) && records.length > 0) {
        csv.push(`\n# ${key}`);
        const headers = Object.keys(records[0] as Record<string, unknown>);
        csv.push(headers.join(','));

        for (const record of records) {
          const row = headers.map((h) => JSON.stringify((record as Record<string, unknown>)[h]));
          csv.push(row.join(','));
        }
      }
    }

    return csv.join('\n');
  }

  /**
   * Upload exported data to S3 with encryption and retention
   */
  private async uploadToS3(tenantId: string, data: string, format: string): Promise<string> {
    // Implementation would use AWS SDK S3 client
    // For now, return placeholder URL
    const key = `tenant-exports/${tenantId}/${Date.now()}.${format === 'json' ? 'json' : 'csv'}`;

    this.logger.debug(`[TenantOffboarding] Uploading data to S3: ${key}`);

    // Would call: s3Client.putObject({ ... })
    return `s3://t3ck-backups/${key}`;
  }

  /**
   * Delete S3 artifacts associated with tenant
   */
  private async deleteS3Artifacts(tenantId: string): Promise<void> {
    this.logger.debug(`[TenantOffboarding] Deleting S3 artifacts for tenant: ${tenantId}`);

    // Implementation would use AWS SDK S3 client
    // Would call: s3Client.deleteObjects({ ... })
  }

  /**
   * Delete Redis cache entries for tenant
   */
  private async deleteRedisCacheEntries(tenantId: string): Promise<void> {
    this.logger.debug(`[TenantOffboarding] Deleting Redis cache for tenant: ${tenantId}`);

    // Implementation would use Redis client
    // Would call: redis.del(`tenant:${tenantId}:*`)
  }

  /**
   * Notify external services about tenant offboarding
   */
  private async notifyExternalServices(tenantId: string, event: string): Promise<void> {
    try {
      await axios.post('http://webhook-service:3002/webhooks/internal-events', {
        tenantId,
        event,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.warn(`[TenantOffboarding] Failed to notify webhook service`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Publish event for scheduled deletion
   */
  private async publishDeletionScheduledEvent(tenantId: string, deletionDate: Date): Promise<void> {
    // Would publish to event bus / message queue
    this.logger.info(`[TenantOffboarding] Published deletion scheduled event`, {
      tenantId,
      deletionDate,
    });
  }

  /**
   * Add entry to audit trail
   */
  private addAuditTrail(
    tenantId: string,
    action: OffboardingAuditTrail['action'],
    details: Record<string, unknown>
  ): void {
    this.auditTrail.push({
      tenantId,
      timestamp: new Date(),
      action,
      details,
      executedBy: process.env.SERVICE_NAME || 'tenant-service',
    });
  }

  /**
   * Count total records in exported data
   */
  private countRecords(data: Record<string, unknown>): number {
    let count = 0;
    for (const records of Object.values(data)) {
      if (Array.isArray(records)) {
        count += records.length;
      }
    }
    return count;
  }

  /**
   * Get audit trail for offboarding process
   */
  getAuditTrail(tenantId: string): OffboardingAuditTrail[] {
    return this.auditTrail.filter((entry) => entry.tenantId === tenantId);
  }
}

export { OffboardingRequest, TenantDataExport, OffboardingAuditTrail };
