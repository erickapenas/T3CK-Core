import type * as admin from 'firebase-admin';
import { getFirestore, initializeFirestore } from '../firebase';
import { AdminSessionUser, AuditLog as LegacyAuditLog, PaginatedResult } from '../types';
import { AuditEventBuilder } from './audit-event-builder';
import {
  AuditAlert,
  AuditAlertRule,
  AuditExportRecord,
  AuditIntegrityCheck,
  AuditListResult,
  AuditLogFilters,
  AuditLogInput,
  AuditLogRecord,
  AuditRetentionPolicy,
  AuditStats,
} from './types';

const now = (): string => new Date().toISOString();
const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const DEFAULT_RETENTION: AuditRetentionPolicy = {
  id: 'default',
  tenant_id: '',
  category: 'default',
  retention_days: 180,
  archive_enabled: false,
  created_at: '',
  updated_at: '',
};

function normalize(value?: unknown): string {
  return String(value || '').toLowerCase().trim();
}

function getPeriodRange(filters: AuditLogFilters): { from?: string; to?: string } {
  const nowDate = new Date();
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  if (filters.period === 'custom') return { from: filters.from, to: filters.to };
  if (filters.period === 'today') return { from: startOfDay(nowDate).toISOString(), to: endOfDay(nowDate).toISOString() };
  if (filters.period === 'yesterday') {
    const date = new Date(nowDate);
    date.setDate(date.getDate() - 1);
    return { from: startOfDay(date).toISOString(), to: endOfDay(date).toISOString() };
  }
  if (filters.period === 'last7' || filters.period === 'last15' || filters.period === 'last30') {
    const days = filters.period === 'last7' ? 7 : filters.period === 'last15' ? 15 : 30;
    const from = new Date(nowDate);
    from.setDate(nowDate.getDate() - days + 1);
    return { from: startOfDay(from).toISOString(), to: endOfDay(nowDate).toISOString() };
  }
  if (filters.period === 'thisMonth') {
    return {
      from: new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).toISOString(),
      to: endOfDay(nowDate).toISOString(),
    };
  }
  if (filters.period === 'lastMonth') {
    return {
      from: new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1).toISOString(),
      to: new Date(nowDate.getFullYear(), nowDate.getMonth(), 0, 23, 59, 59, 999).toISOString(),
    };
  }
  return { from: filters.from, to: filters.to };
}

function matchesSearch(log: AuditLogRecord, search?: string): boolean {
  const query = normalize(search);
  if (!query) return true;
  return [
    log.id,
    log.event_id,
    log.action,
    log.actor_id,
    log.actor_name,
    log.resource_type,
    log.resource_id,
    log.resource_label,
    log.description,
    log.ip_address,
    log.correlation_id,
    log.request_id,
  ]
    .map(normalize)
    .join(' ')
    .includes(query);
}

function matchesFilters(log: AuditLogRecord, filters: AuditLogFilters): boolean {
  const { from, to } = getPeriodRange(filters);
  const createdAt = log.created_at || log.createdAt || '';
  if (from && createdAt < from) return false;
  if (to && createdAt > to) return false;
  if (!matchesSearch(log, filters.search)) return false;
  if (filters.category && log.category !== filters.category) return false;
  if (filters.action && !log.action.includes(filters.action)) return false;
  if (filters.module && log.module !== filters.module) return false;
  if (filters.severity && log.severity !== filters.severity) return false;
  if (filters.outcome && log.outcome !== filters.outcome) return false;
  if (filters.actorId && log.actor_id !== filters.actorId) return false;
  if (filters.actorType && log.actor_type !== filters.actorType) return false;
  if (filters.resourceType && log.resource_type !== filters.resourceType) return false;
  if (filters.resourceId && log.resource_id !== filters.resourceId) return false;
  if (filters.ipAddress && log.ip_address !== filters.ipAddress) return false;
  if (filters.origin && log.origin !== filters.origin) return false;
  if (filters.endpoint && !String(log.endpoint || '').includes(filters.endpoint)) return false;
  if (filters.statusCode && log.status_code !== Number(filters.statusCode)) return false;
  if (filters.correlationId && log.correlation_id !== filters.correlationId) return false;
  if (filters.requestId && log.request_id !== filters.requestId) return false;
  if (filters.isSensitive !== undefined && log.is_sensitive !== filters.isSensitive) return false;
  if (filters.isSecurityEvent !== undefined && log.is_security_event !== filters.isSecurityEvent) return false;
  if (filters.isExportEvent !== undefined && log.is_export_event !== filters.isExportEvent) return false;
  if (filters.failuresOnly && !['failure', 'denied', 'partial'].includes(log.outcome)) return false;
  if (filters.criticalOnly && log.severity !== 'critical') return false;
  if (filters.manualOnly && log.is_system_event) return false;
  if (filters.automaticOnly && !log.is_system_event) return false;
  return true;
}

function buildStats(logs: AuditLogRecord[]): AuditStats {
  return logs.reduce(
    (stats, log) => {
      stats.total += 1;
      if (log.severity === 'critical') stats.critical += 1;
      if (log.outcome === 'failure') stats.failures += 1;
      if (log.outcome === 'denied') stats.denied += 1;
      if (log.is_export_event) stats.exports += 1;
      if (log.is_sensitive) stats.sensitive += 1;
      if (log.is_security_event) stats.security += 1;
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
      stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;
      return stats;
    },
    {
      total: 0,
      critical: 0,
      failures: 0,
      denied: 0,
      exports: 0,
      sensitive: 0,
      security: 0,
      byCategory: {},
      bySeverity: {},
    } as AuditStats
  );
}

export class AuditLogService {
  constructor(private readonly builder = new AuditEventBuilder()) {
    initializeFirestore();
  }

  private firestore(): admin.firestore.Firestore {
    const firestore = getFirestore();
    if (!firestore) {
      throw new Error('Firestore is required for audit log persistence');
    }
    return firestore;
  }

  private collection(tenantId: string, name: string): admin.firestore.CollectionReference {
    return this.firestore().collection(`tenants/${tenantId}/admin/data/${name}`);
  }

  async record(input: AuditLogInput): Promise<AuditLogRecord> {
    const previous = await this.collection(input.tenantId, 'audit_logs')
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
    const previousHash = previous.docs[0]?.data()?.hash as string | undefined;
    const log = this.builder.fromInput(input, previousHash);
    await this.collection(input.tenantId, 'audit_logs').doc(log.id).set(log, { merge: false });
    await this.evaluateAlerts(input.tenantId, log);
    return log;
  }

  async recordLegacy(
    tenantId: string,
    legacy: Omit<LegacyAuditLog, 'id' | 'tenantId' | 'createdAt'>,
    actor?: Partial<AdminSessionUser>
  ): Promise<AuditLogRecord> {
    return this.record(this.builder.legacyToInput(tenantId, legacy, actor));
  }

  async listLogs(tenantId: string, filters: AuditLogFilters): Promise<AuditListResult> {
    const page = Math.max(1, Number(filters.page || 1));
    const limit = Math.max(1, Math.min(100, Number(filters.limit || 20)));
    const snapshot = await this.collection(tenantId, 'audit_logs')
      .orderBy('created_at', 'desc')
      .limit(1000)
      .get();
    const normalized = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AuditLogRecord);
    const legacy = await this.listLegacyLogs(tenantId);
    const all = [...normalized, ...legacy]
      .filter((log) => matchesFilters(log, filters))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const start = (page - 1) * limit;
    return {
      items: all.slice(start, start + limit).map((log) => this.compactForList(log)),
      filters,
      stats: buildStats(all),
      pagination: {
        page,
        limit,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / limit)),
        hasNextPage: start + limit < all.length,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getLog(tenantId: string, logId: string): Promise<AuditLogRecord> {
    const snapshot = await this.collection(tenantId, 'audit_logs').doc(logId).get();
    if (snapshot.exists) {
      return { id: snapshot.id, ...snapshot.data() } as AuditLogRecord;
    }
    const legacy = await this.listLegacyLogs(tenantId);
    const found = legacy.find((log) => log.id === logId || log.event_id === logId);
    if (!found) throw new Error('Log de auditoria nao encontrado');
    return found;
  }

  async resourceTimeline(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    filters: AuditLogFilters
  ): Promise<AuditListResult> {
    return this.listLogs(tenantId, { ...filters, resourceType, resourceId });
  }

  async actorTimeline(tenantId: string, actorId: string, filters: AuditLogFilters): Promise<AuditListResult> {
    return this.listLogs(tenantId, { ...filters, actorId });
  }

  async stats(tenantId: string, filters: AuditLogFilters): Promise<AuditStats> {
    return (await this.listLogs(tenantId, { ...filters, page: 1, limit: 1 })).stats;
  }

  async exportLogs(
    tenantId: string,
    filters: AuditLogFilters,
    format: 'csv' | 'json',
    user: AdminSessionUser,
    requestMeta: Partial<AuditLogInput>
  ): Promise<AuditExportRecord> {
    const startedAt = now();
    const logs = await this.listLogs(tenantId, { ...filters, page: 1, limit: 500 });
    const content =
      format === 'json'
        ? JSON.stringify(logs.items, null, 2)
        : this.toCsv(logs.items);
    const record: AuditExportRecord = {
      id: randomId('audit_export'),
      tenant_id: tenantId,
      requested_by: user.id,
      filters_json: filters,
      file_format: format,
      status: 'completed',
      total_records: logs.pagination.total,
      content,
      started_at: startedAt,
      finished_at: now(),
      created_at: startedAt,
    };
    await this.collection(tenantId, 'audit_log_exports').doc(record.id).set(record, { merge: false });
    await this.record({
      tenantId,
      actor: user,
      category: 'reports',
      action: 'reports.audit_logs.exported',
      operation: 'export',
      severity: logs.stats.sensitive || logs.stats.critical ? 'critical' : 'notice',
      outcome: 'success',
      module: 'audit',
      description: `Logs de auditoria exportados em ${format.toUpperCase()}.`,
      resource: { type: 'audit_export', id: record.id, label: record.id },
      metadata: { totalRecords: record.total_records, format, filters },
      exportEvent: true,
      sensitive: true,
      ...requestMeta,
    });
    return record;
  }

  async getExport(tenantId: string, exportId: string): Promise<AuditExportRecord> {
    const snapshot = await this.collection(tenantId, 'audit_log_exports').doc(exportId).get();
    if (!snapshot.exists) throw new Error('Exportacao de logs nao encontrada');
    return { id: snapshot.id, ...snapshot.data() } as AuditExportRecord;
  }

  async listExports(tenantId: string, filters: AuditLogFilters): Promise<PaginatedResult<AuditExportRecord>> {
    const page = Math.max(1, Number(filters.page || 1));
    const limit = Math.max(1, Math.min(100, Number(filters.limit || 20)));
    const snapshot = await this.collection(tenantId, 'audit_log_exports')
      .orderBy('created_at', 'desc')
      .limit(500)
      .get();
    const all = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AuditExportRecord);
    const start = (page - 1) * limit;
    return {
      items: all.slice(start, start + limit).map((item) => ({ ...item, content: undefined })),
      pagination: {
        page,
        limit,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / limit)),
        hasNextPage: start + limit < all.length,
        hasPreviousPage: page > 1,
      },
    };
  }

  async listAlerts(tenantId: string): Promise<AuditAlert[]> {
    const snapshot = await this.collection(tenantId, 'audit_log_alerts').orderBy('created_at', 'desc').limit(200).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AuditAlert);
  }

  async updateAlertStatus(tenantId: string, alertId: string, status: AuditAlert['status']): Promise<AuditAlert> {
    const ref = this.collection(tenantId, 'audit_log_alerts').doc(alertId);
    await ref.set({ status, resolved_at: status === 'resolvido' ? now() : undefined }, { merge: true });
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('Alerta de auditoria nao encontrado');
    return { id: snapshot.id, ...snapshot.data() } as AuditAlert;
  }

  async upsertAlertRule(tenantId: string, ruleId: string | undefined, input: Partial<AuditAlertRule>): Promise<AuditAlertRule> {
    const id = ruleId || randomId('audit_rule');
    const current = await this.collection(tenantId, 'audit_log_alert_rules').doc(id).get();
    const rule: AuditAlertRule = {
      id,
      tenant_id: tenantId,
      name: input.name || 'Regra de auditoria',
      category: input.category,
      action: input.action,
      severity: input.severity,
      condition_json: input.condition_json || {},
      enabled: input.enabled ?? true,
      notify_roles_json: input.notify_roles_json || ['admin'],
      created_at: (current.data()?.created_at as string | undefined) || now(),
      updated_at: now(),
    };
    await this.collection(tenantId, 'audit_log_alert_rules').doc(id).set(rule, { merge: true });
    return rule;
  }

  async getRetentionPolicy(tenantId: string): Promise<AuditRetentionPolicy[]> {
    const snapshot = await this.collection(tenantId, 'audit_log_retention_policies').orderBy('category', 'asc').get();
    if (snapshot.empty) {
      return [
        { ...DEFAULT_RETENTION, tenant_id: tenantId, created_at: now(), updated_at: now() },
        { ...DEFAULT_RETENTION, id: 'security', tenant_id: tenantId, category: 'security', retention_days: 365, created_at: now(), updated_at: now() },
        { ...DEFAULT_RETENTION, id: 'sensitive', tenant_id: tenantId, category: 'sensitive', retention_days: 1825, created_at: now(), updated_at: now() },
      ];
    }
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AuditRetentionPolicy);
  }

  async updateRetentionPolicy(tenantId: string, policies: Array<Partial<AuditRetentionPolicy>>): Promise<AuditRetentionPolicy[]> {
    const batch = this.firestore().batch();
    for (const policy of policies) {
      const id = policy.id || policy.category || randomId('retention');
      const payload: AuditRetentionPolicy = {
        id,
        tenant_id: tenantId,
        category: policy.category || id,
        retention_days: Number(policy.retention_days || 180),
        archive_enabled: Boolean(policy.archive_enabled),
        archive_location: policy.archive_location,
        created_at: policy.created_at || now(),
        updated_at: now(),
      };
      batch.set(this.collection(tenantId, 'audit_log_retention_policies').doc(id), payload, { merge: true });
    }
    await batch.commit();
    return this.getRetentionPolicy(tenantId);
  }

  async runIntegrityCheck(tenantId: string, filters: AuditLogFilters): Promise<AuditIntegrityCheck> {
    const logs = await this.listLogs(tenantId, { ...filters, page: 1, limit: 1000 });
    const normalized = logs.items.filter((log) => !log.id.startsWith('legacy_'));
    const failed = normalized.filter((log) => !log.hash || (log.previous_hash && log.previous_hash.length < 32));
    const check: AuditIntegrityCheck = {
      id: randomId('audit_integrity'),
      tenant_id: tenantId,
      period_start: filters.from,
      period_end: filters.to,
      status: failed.length ? 'invalid' : 'valid',
      checked_logs_count: normalized.length,
      failed_logs_count: failed.length,
      created_at: now(),
    };
    await this.collection(tenantId, 'audit_log_integrity_checks').doc(check.id).set(check);
    return check;
  }

  async listIntegrityChecks(tenantId: string): Promise<AuditIntegrityCheck[]> {
    const snapshot = await this.collection(tenantId, 'audit_log_integrity_checks')
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AuditIntegrityCheck);
  }

  private async listLegacyLogs(tenantId: string): Promise<AuditLogRecord[]> {
    const snapshot = await this.collection(tenantId, 'auditLogs').orderBy('createdAt', 'desc').limit(500).get();
    return snapshot.docs.map((doc) => {
      const legacy = { id: doc.id, ...doc.data() } as LegacyAuditLog;
      const input = this.builder.legacyToInput(tenantId, legacy);
      const record = this.builder.fromInput(input, undefined);
      return {
        ...record,
        id: legacy.id || `legacy_${doc.id}`,
        event_id: legacy.id || `legacy_${doc.id}`,
        created_at: legacy.createdAt,
        createdAt: legacy.createdAt,
        hash: `legacy_${legacy.id || doc.id}`,
      };
    });
  }

  private compactForList(log: AuditLogRecord): AuditLogRecord {
    return {
      ...log,
      before_data_masked: undefined,
      after_data_masked: undefined,
      metadata_json: log.is_sensitive ? { note: 'Metadata sensivel disponivel nos detalhes autorizados.' } : log.metadata_json,
    };
  }

  private toCsv(logs: AuditLogRecord[]): string {
    const header = ['created_at', 'severity', 'category', 'action', 'outcome', 'actor_id', 'resource_type', 'resource_id', 'ip_address', 'correlation_id'];
    const rows = logs.map((log) =>
      header.map((field) => `"${String((log as unknown as Record<string, unknown>)[field] || '').replace(/"/g, '""')}"`).join(',')
    );
    return [header.join(','), ...rows].join('\n');
  }

  private async evaluateAlerts(tenantId: string, log: AuditLogRecord): Promise<void> {
    if (log.severity !== 'critical' && log.outcome !== 'denied' && log.outcome !== 'failure') return;
    const alert: AuditAlert = {
      id: randomId('audit_alert'),
      tenant_id: tenantId,
      audit_log_id: log.id,
      severity: log.severity,
      title: log.severity === 'critical' ? 'Evento critico de auditoria' : 'Evento de auditoria requer atencao',
      description: log.description,
      status: 'novo',
      created_at: now(),
    };
    await this.collection(tenantId, 'audit_log_alerts').doc(alert.id).set(alert, { merge: false });
  }
}
