import { randomUUID, createHash } from 'crypto';
import { AdminSessionUser } from '../types';
import { AuditCategory, AuditLogInput, AuditLogRecord, AuditOperation, AuditSeverity } from './types';
import { AuditSanitizerService, maskEmail } from './audit-sanitizer-service';

const now = (): string => new Date().toISOString();

const categoryByPrefix: Record<string, AuditCategory> = {
  auth: 'security',
  security: 'security',
  users: 'users',
  user: 'users',
  tenants: 'tenants',
  tenant: 'tenants',
  customers: 'customers',
  customer: 'customers',
  products: 'products',
  product: 'products',
  inventory: 'inventory',
  stock: 'inventory',
  orders: 'orders',
  order: 'orders',
  payments: 'payments',
  payment: 'payments',
  invoices: 'fiscal',
  invoice: 'fiscal',
  fiscal: 'fiscal',
  integrations: 'integrations',
  integration: 'integrations',
  themes: 'themes',
  theme: 'themes',
  dashboard: 'themes',
  reports: 'reports',
  report: 'reports',
  settings: 'settings',
  system: 'system',
};

const operationBySuffix: Record<string, AuditOperation> = {
  created: 'create',
  updated: 'update',
  deleted: 'delete',
  removed: 'delete',
  viewed: 'view',
  exported: 'export',
  imported: 'import',
  login_success: 'login',
  login_failed: 'login',
  logout: 'logout',
  executed: 'execute',
  issued: 'execute',
  cancelled: 'execute',
};

function inferCategory(action: string): AuditCategory {
  const prefix = action.split('.')[0] || 'system';
  return categoryByPrefix[prefix] || 'system';
}

function inferOperation(action: string): AuditOperation {
  const suffix = action.split('.').pop() || '';
  return operationBySuffix[suffix] || (action.includes('export') ? 'export' : action.includes('login') ? 'login' : 'update');
}

function inferSeverity(input: AuditLogInput): AuditSeverity {
  if (input.severity) return input.severity;
  if (input.outcome === 'failure') return 'error';
  if (input.outcome === 'denied') return 'warning';
  if (input.securityEvent || input.action.includes('permission') || input.action.includes('role')) return 'notice';
  if (input.exportEvent || input.action.includes('export')) return 'notice';
  return 'info';
}

function actorFromInput(input: AuditLogInput): {
  actor_type: AuditLogRecord['actor_type'];
  actor_id: string;
  actor_name?: string;
  actor_email_masked?: string;
  is_system_event: boolean;
} {
  const actor = input.actor || {};
  const actorType = actor.type || (actor.id || actor.username ? 'user' : 'system');
  const actorId = actor.id || actor.username || (actorType === 'system' ? 'system' : 'unknown');
  return {
    actor_type: actorType,
    actor_id: actorId,
    actor_name: actor.name || actor.username,
    actor_email_masked: actor.email ? maskEmail(actor.email) : undefined,
    is_system_event: Boolean(input.systemEvent || actorType === 'system' || actorType === 'job'),
  };
}

export class AuditEventBuilder {
  constructor(private readonly sanitizer = new AuditSanitizerService()) {}

  fromInput(input: AuditLogInput, previousHash?: string): AuditLogRecord {
    const eventId = randomUUID();
    const createdAt = now();
    const category = input.category || inferCategory(input.action);
    const operation = input.operation || inferOperation(input.action);
    const severity = inferSeverity(input);
    const before = this.sanitizer.sanitizeRecord(input.before);
    const after = this.sanitizer.sanitizeRecord(input.after);
    const changedFields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    const actor = actorFromInput(input);
    const userAgent = input.userAgent || '';
    const recordWithoutHash: Omit<AuditLogRecord, 'hash'> = {
      id: eventId,
      tenant_id: input.tenantId,
      tenantId: input.tenantId,
      event_id: eventId,
      event_version: '2026-05-06',
      category,
      action: input.action,
      operation,
      severity,
      outcome: input.outcome || 'success',
      ...actor,
      impersonator_id: input.actor?.impersonatorId,
      resource_type: input.resource?.type,
      resource_id: input.resource?.id,
      resource_label: input.resource?.label,
      parent_resource_type: input.resource?.parentType,
      parent_resource_id: input.resource?.parentId,
      module: input.module || category,
      description: input.description || input.action,
      before_data_masked: Object.keys(before).length ? before : undefined,
      after_data_masked: Object.keys(after).length ? after : undefined,
      changed_fields: changedFields,
      metadata_json: this.sanitizer.sanitizeRecord(input.metadata),
      request_id: input.requestId,
      correlation_id: input.correlationId || input.requestId || eventId,
      session_id: input.sessionId,
      idempotency_key: input.idempotencyKey,
      ip_address: input.ipAddress,
      user_agent: userAgent,
      device_type: /mobile|android|iphone/i.test(userAgent) ? 'mobile' : userAgent ? 'desktop' : undefined,
      browser: /chrome/i.test(userAgent) ? 'Chrome' : /firefox/i.test(userAgent) ? 'Firefox' : /safari/i.test(userAgent) ? 'Safari' : undefined,
      os: /windows/i.test(userAgent) ? 'Windows' : /mac os/i.test(userAgent) ? 'macOS' : /linux/i.test(userAgent) ? 'Linux' : undefined,
      origin: input.origin || 'web',
      http_method: input.httpMethod,
      endpoint: input.endpoint,
      status_code: input.statusCode,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      is_sensitive: Boolean(input.sensitive || input.exportEvent || /sensitive|cpf|cnpj|xml|danfe/i.test(input.action)),
      is_security_event: Boolean(input.securityEvent || category === 'security'),
      is_export_event: Boolean(input.exportEvent || operation === 'export'),
      is_system_event: actor.is_system_event,
      previous_hash: previousHash,
      created_at: createdAt,
      createdAt,
    };

    return {
      ...recordWithoutHash,
      hash: this.hashRecord(recordWithoutHash),
    };
  }

  hashRecord(record: Omit<AuditLogRecord, 'hash'>): string {
    return createHash('sha256').update(JSON.stringify(record)).digest('hex');
  }

  legacyToInput(
    tenantId: string,
    legacy: {
      actorUserId?: string;
      action: string;
      resourceType?: string;
      resourceId?: string;
      metadata?: Record<string, unknown>;
    },
    actor?: Partial<AdminSessionUser>
  ): AuditLogInput {
    const category = inferCategory(legacy.action);
    return {
      tenantId,
      actor: actor || { id: legacy.actorUserId || 'system', type: legacy.actorUserId === 'system' ? 'system' : 'user' },
      category,
      action: legacy.action,
      operation: inferOperation(legacy.action),
      module: category,
      resource: {
        type: legacy.resourceType,
        id: legacy.resourceId,
      },
      metadata: legacy.metadata,
      systemEvent: legacy.actorUserId === 'system',
    };
  }
}
