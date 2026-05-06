import { z } from 'zod';

const optionalNumber = z.preprocess(
  (value) => (value === '' || value === undefined || value === null ? undefined : Number(value)),
  z.number().finite().optional()
);

const optionalBoolean = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());

export const AuditLogQuerySchema = z.object({
  page: optionalNumber,
  limit: optionalNumber,
  search: z.string().max(160).optional(),
  period: z.enum(['today', 'yesterday', 'last7', 'last15', 'last30', 'thisMonth', 'lastMonth', 'custom']).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  category: z.string().max(80).optional(),
  action: z.string().max(120).optional(),
  module: z.string().max(80).optional(),
  severity: z.enum(['info', 'notice', 'warning', 'error', 'critical']).optional(),
  outcome: z.enum(['success', 'failure', 'denied', 'partial', 'pending']).optional(),
  actorId: z.string().max(120).optional(),
  actorType: z.enum(['user', 'system', 'job', 'webhook', 'integration', 'super_admin']).optional(),
  resourceType: z.string().max(80).optional(),
  resourceId: z.string().max(140).optional(),
  ipAddress: z.string().max(80).optional(),
  origin: z.string().max(80).optional(),
  endpoint: z.string().max(180).optional(),
  statusCode: optionalNumber,
  correlationId: z.string().max(140).optional(),
  requestId: z.string().max(140).optional(),
  isSensitive: optionalBoolean,
  isSecurityEvent: optionalBoolean,
  isExportEvent: optionalBoolean,
  failuresOnly: optionalBoolean,
  criticalOnly: optionalBoolean,
  manualOnly: optionalBoolean,
  automaticOnly: optionalBoolean,
});

export const AuditExportSchema = z.object({
  filters: AuditLogQuerySchema.partial().optional().default({}),
  format: z.enum(['csv', 'json']).default('csv'),
});

export const AuditAlertRuleSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().max(80).optional(),
  action: z.string().max(120).optional(),
  severity: z.enum(['info', 'notice', 'warning', 'error', 'critical']).optional(),
  condition_json: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(true),
  notify_roles_json: z.array(z.string().max(80)).max(20).default(['admin']),
});

export const AuditRetentionPolicySchema = z.object({
  policies: z
    .array(
      z.object({
        id: z.string().max(80).optional(),
        category: z.string().min(1).max(80),
        retention_days: z.number().int().min(1).max(3650),
        archive_enabled: z.boolean().default(false),
        archive_location: z.string().max(300).optional(),
      })
    )
    .min(1)
    .max(50),
});
