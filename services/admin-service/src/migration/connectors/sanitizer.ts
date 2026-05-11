const secretFieldPattern =
  /(password|passwd|secret|token|api[_-]?key|authorization|cookie|session|card|cvv|certificate|private[_-]?key|consumer[_-]?secret|access[_-]?token|refresh[_-]?token|client[_-]?secret)/i;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  if (!local || !domain) return value;
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length < 8) return value;
  return `${digits.slice(0, 2)}*****${digits.slice(-4)}`;
}

function maskDocument(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length === 11) return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  if (digits.length === 14) return `**.***.***/${digits.slice(8, 12)}-**`;
  return value;
}

function sanitizeScalar(key: string, value: unknown): unknown {
  if (secretFieldPattern.test(key)) return undefined;
  if (typeof value !== 'string') return value;
  const normalizedKey = key.toLowerCase();
  if (normalizedKey.includes('email')) return maskEmail(value);
  if (normalizedKey.includes('phone') || normalizedKey.includes('telefone') || normalizedKey.includes('whatsapp')) {
    return maskPhone(value);
  }
  if (
    normalizedKey.includes('cpf') ||
    normalizedKey.includes('cnpj') ||
    normalizedKey.includes('document') ||
    normalizedKey.includes('documento')
  ) {
    return maskDocument(value);
  }
  return value;
}

export function sanitizeMigrationPayload(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMigrationPayload(item, key)).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([itemKey, itemValue]) => [itemKey, sanitizeMigrationPayload(itemValue, itemKey)] as const)
        .filter(([, itemValue]) => itemValue !== undefined)
    );
  }
  return sanitizeScalar(key, value);
}

export function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeMigrationPayload(value) as Record<string, unknown>;
}
