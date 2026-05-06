import { AdminSessionUser, PaginatedResult } from '../types';

export type AuditSeverity = 'info' | 'notice' | 'warning' | 'error' | 'critical';
export type AuditOutcome = 'success' | 'failure' | 'denied' | 'partial' | 'pending';
export type AuditActorType = 'user' | 'system' | 'job' | 'webhook' | 'integration' | 'super_admin';
export type AuditOperation =
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'export'
  | 'import'
  | 'login'
  | 'logout'
  | 'execute';

export type AuditCategory =
  | 'security'
  | 'users'
  | 'tenants'
  | 'customers'
  | 'products'
  | 'inventory'
  | 'orders'
  | 'payments'
  | 'fiscal'
  | 'integrations'
  | 'themes'
  | 'reports'
  | 'settings'
  | 'system';

export interface AuditLogRecord {
  id: string;
  tenant_id: string;
  tenantId?: string;
  event_id: string;
  event_version: string;
  category: AuditCategory;
  action: string;
  operation: AuditOperation;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  actor_type: AuditActorType;
  actor_id: string;
  actor_name?: string;
  actor_email_masked?: string;
  impersonator_id?: string;
  impersonator_email_masked?: string;
  resource_type?: string;
  resource_id?: string;
  resource_label?: string;
  parent_resource_type?: string;
  parent_resource_id?: string;
  module: string;
  description: string;
  before_data_masked?: Record<string, unknown>;
  after_data_masked?: Record<string, unknown>;
  changed_fields: string[];
  metadata_json?: Record<string, unknown>;
  request_id?: string;
  correlation_id: string;
  session_id?: string;
  idempotency_key?: string;
  ip_address?: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  country?: string;
  region?: string;
  city?: string;
  origin?: string;
  http_method?: string;
  endpoint?: string;
  status_code?: number;
  error_code?: string;
  error_message?: string;
  is_sensitive: boolean;
  is_security_event: boolean;
  is_export_event: boolean;
  is_system_event: boolean;
  hash: string;
  previous_hash?: string;
  created_at: string;
  createdAt?: string;
}

export interface AuditLogInput {
  tenantId: string;
  actor?: Partial<AdminSessionUser> & { type?: AuditActorType; impersonatorId?: string };
  category: AuditCategory;
  action: string;
  operation?: AuditOperation;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  module?: string;
  description?: string;
  resource?: {
    type?: string;
    id?: string;
    label?: string;
    parentType?: string;
    parentId?: string;
  };
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  requestId?: string;
  correlationId?: string;
  sessionId?: string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
  origin?: string;
  httpMethod?: string;
  endpoint?: string;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  sensitive?: boolean;
  securityEvent?: boolean;
  exportEvent?: boolean;
  systemEvent?: boolean;
}

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  search?: string;
  period?: 'today' | 'yesterday' | 'last7' | 'last15' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';
  from?: string;
  to?: string;
  category?: string;
  action?: string;
  module?: string;
  severity?: string;
  outcome?: string;
  actorId?: string;
  actorType?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  origin?: string;
  endpoint?: string;
  statusCode?: number;
  correlationId?: string;
  requestId?: string;
  isSensitive?: boolean;
  isSecurityEvent?: boolean;
  isExportEvent?: boolean;
  failuresOnly?: boolean;
  criticalOnly?: boolean;
  manualOnly?: boolean;
  automaticOnly?: boolean;
}

export interface AuditStats {
  total: number;
  critical: number;
  failures: number;
  denied: number;
  exports: number;
  sensitive: number;
  security: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export interface AuditExportRecord {
  id: string;
  tenant_id: string;
  requested_by: string;
  filters_json: AuditLogFilters;
  file_format: 'csv' | 'json';
  status: 'pending' | 'completed' | 'failed' | 'expired';
  total_records: number;
  content?: string;
  started_at: string;
  finished_at?: string;
  created_at: string;
}

export interface AuditAlert {
  id: string;
  tenant_id: string;
  audit_log_id?: string;
  rule_id?: string;
  severity: AuditSeverity;
  title: string;
  description: string;
  status: 'novo' | 'visto' | 'em_analise' | 'resolvido' | 'ignorado';
  assigned_to?: string;
  created_at: string;
  resolved_at?: string;
}

export interface AuditAlertRule {
  id: string;
  tenant_id: string;
  name: string;
  category?: string;
  action?: string;
  severity?: AuditSeverity;
  condition_json?: Record<string, unknown>;
  enabled: boolean;
  notify_roles_json: string[];
  created_at: string;
  updated_at: string;
}

export interface AuditRetentionPolicy {
  id: string;
  tenant_id: string;
  category: string;
  retention_days: number;
  archive_enabled: boolean;
  archive_location?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditIntegrityCheck {
  id: string;
  tenant_id: string;
  period_start?: string;
  period_end?: string;
  status: 'valid' | 'invalid' | 'partial' | 'failed';
  checked_logs_count: number;
  failed_logs_count: number;
  created_at: string;
}

export type AuditListResult = PaginatedResult<AuditLogRecord> & {
  filters: AuditLogFilters;
  stats: AuditStats;
};
