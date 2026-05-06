const sensitiveKeyPattern =
  /(password|senha|token|secret|api[_-]?key|certificate|certificado|private[_-]?key|refresh|access[_-]?token|client[_-]?secret|csc|credential|credencial|card|cartao|bank|banco)/i;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function maskEmail(email?: string): string {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}***@${domain}`;
}

export function maskPhone(phone?: string): string {
  const digits = onlyDigits(phone || '');
  if (!digits) return '';
  const area = digits.slice(0, 2);
  const suffix = digits.slice(-4);
  return area ? `(${area}) *****-${suffix}` : `*****-${suffix}`;
}

export function maskDocument(document?: string): string {
  const digits = onlyDigits(document || '');
  if (digits.length === 11) return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  if (digits.length === 14) return `**.***.***/${digits.slice(8, 12)}-**`;
  return digits ? '***' : '';
}

function maskToken(value: string): string {
  const clean = value.trim();
  if (clean.length <= 8) return '****';
  return `${clean.slice(0, 4)}****${clean.slice(-4)}`;
}

function sanitizeString(key: string, value: string): string | undefined {
  if (sensitiveKeyPattern.test(key)) {
    if (/password|senha|secret|private/i.test(key)) return undefined;
    return maskToken(value);
  }

  if (value.includes('@')) return maskEmail(value);
  const digits = onlyDigits(value);
  if (digits.length >= 8 && /(phone|telefone|whatsapp|celular)/i.test(key)) return maskPhone(value);
  if (digits.length === 11 || digits.length === 14) return maskDocument(value);
  if (value.length > 500) return `${value.slice(0, 500)}...`;
  return value;
}

export class AuditSanitizerService {
  sanitizeRecord(value: unknown, depth = 0): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 5) {
      return {};
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 120)) {
      if (sensitiveKeyPattern.test(key) && /password|senha|secret|private|certificate|certificado/i.test(key)) {
        continue;
      }

      const cleanValue = this.sanitizeValue(key, rawValue, depth + 1);
      if (cleanValue !== undefined) {
        sanitized[key] = cleanValue;
      }
    }
    return sanitized;
  }

  sanitizeValue(key: string, value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') return sanitizeString(key, value);
    if (Array.isArray(value)) {
      return value.slice(0, 30).map((item) => this.sanitizeValue(key, item, depth + 1));
    }
    if (typeof value === 'object') {
      return this.sanitizeRecord(value, depth + 1);
    }
    return undefined;
  }
}
