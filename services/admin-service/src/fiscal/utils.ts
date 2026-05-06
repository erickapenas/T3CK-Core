import { createHash } from 'crypto';
import { FiscalConfiguration, FiscalConfigurationStatus, FiscalInvoiceType } from './types';

export const nowIso = (): string => new Date().toISOString();

export const randomId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const onlyDigits = (value: string | undefined | null): string => String(value || '').replace(/\D/g, '');

export function isValidCnpj(value: string | undefined | null): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) {
    return false;
  }

  const calculateDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return firstDigit === Number(cnpj[12]) && secondDigit === Number(cnpj[13]);
}

export function isValidCpfOrCnpj(value: string | undefined | null): boolean {
  const digits = onlyDigits(value);
  if (digits.length === 14) {
    return isValidCnpj(digits);
  }
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) {
    return false;
  }

  const calculateDigit = (base: string, factor: number): number => {
    const sum = base.split('').reduce((total, digit) => total + Number(digit) * factor--, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const firstDigit = calculateDigit(digits.slice(0, 9), 10);
  const secondDigit = calculateDigit(digits.slice(0, 10), 11);
  return firstDigit === Number(digits[9]) && secondDigit === Number(digits[10]);
}

export function maskSensitiveValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (text.length <= 4) {
    return '*'.repeat(text.length);
  }

  return `${text.slice(0, 2)}${'*'.repeat(Math.max(4, text.length - 4))}${text.slice(-2)}`;
}

export function hashForAudit(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return `sha256:${createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`;
}

export function normalizeFiscalProvider(value: unknown): FiscalConfiguration['invoiceProvider'] {
  const provider = String(value || '').trim().toLowerCase();
  const aliases: Record<string, FiscalConfiguration['invoiceProvider']> = {
    focus: 'focus_nfe',
    focusnfe: 'focus_nfe',
    focus_nfe: 'focus_nfe',
    nuvem: 'nuvem_fiscal',
    nuvemfiscal: 'nuvem_fiscal',
    nuvem_fiscal: 'nuvem_fiscal',
    plugnotas: 'plugnotas',
    enotas: 'enotas',
    tecnospeed: 'tecnospeed',
    sefaz: 'sefaz_direta',
    sefaz_direta: 'sefaz_direta',
    outro: 'outro',
  };

  return aliases[provider] || '';
}

export function normalizeInvoiceType(value: unknown, config: FiscalConfiguration): FiscalInvoiceType {
  const requested = String(value || '').trim().toLowerCase() as FiscalInvoiceType;
  if (requested === 'nfce' && config.nfceEnabled) return 'nfce';
  if (requested === 'nfse' && config.nfseEnabled) return 'nfse';
  if (requested === 'nfe' && config.nfeEnabled) return 'nfe';
  if (config.nfeEnabled) return 'nfe';
  if (config.nfceEnabled) return 'nfce';
  if (config.nfseEnabled) return 'nfse';
  return 'nfe';
}

export function getSeriesForInvoiceType(config: FiscalConfiguration, type: FiscalInvoiceType): string {
  if (type === 'nfce') return config.nfceSeries;
  if (type === 'nfse') return config.nfseSeries;
  return config.nfeSeries;
}

export function getNextNumberForInvoiceType(config: FiscalConfiguration, type: FiscalInvoiceType): number {
  if (type === 'nfce') return Number(config.nextNfceNumber || 1);
  if (type === 'nfse') return Number(config.nextNfseNumber || 1);
  return Number(config.nextNfeNumber || 1);
}

export function fiscalStatusFromValidation(
  valid: boolean,
  environment: FiscalConfiguration['invoiceEnvironment'],
  fallback: FiscalConfigurationStatus = 'incompleto'
): FiscalConfigurationStatus {
  if (!valid) {
    return fallback;
  }

  return environment === 'producao' ? 'producao_ativa' : 'homologacao_ativa';
}

export function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro inesperado';
}
