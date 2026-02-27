export enum DataClassification {
  Public = 'public',
  Internal = 'internal',
  Confidential = 'confidential',
  Restricted = 'restricted',
}

export interface RetentionPolicy {
  classification: DataClassification;
  retentionDays: number;
  legalHold?: boolean;
}

export interface RetentionMetadata {
  classification: DataClassification;
  createdAt: string;
  expiresAt: string;
  legalHold?: boolean;
}

export function calculateRetentionDate(createdAt: Date, retentionDays: number): Date {
  const expiresAt = new Date(createdAt.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
  return expiresAt;
}

export function applyRetentionMetadata<T extends Record<string, unknown>>(
  record: T,
  policy: RetentionPolicy,
  createdAt: Date = new Date()
): T & { retention: RetentionMetadata } {
  const expiresAt = calculateRetentionDate(createdAt, policy.retentionDays);

  return {
    ...record,
    retention: {
      classification: policy.classification,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      legalHold: policy.legalHold,
    },
  };
}

export function anonymizeFields<T extends Record<string, unknown>>(
  record: T,
  fields: string[],
  replacement: string = '[redacted]'
): T {
  const result: Record<string, unknown> = { ...record };
  for (const field of fields) {
    if (field in result) {
      result[field] = replacement;
    }
  }
  return result as T;
}

export function redactForLogs<T extends Record<string, unknown>>(
  record: T,
  classification: DataClassification
): T {
  if (classification === DataClassification.Restricted) {
    return anonymizeFields(record, Object.keys(record));
  }

  if (classification === DataClassification.Confidential) {
    return anonymizeFields(record, ['email', 'phone', 'address', 'cpf', 'cnpj', 'token']);
  }

  return record;
}
