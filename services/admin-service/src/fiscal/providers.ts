import { createHash } from 'crypto';
import {
  AdminUnifiedOrder,
  FiscalConfiguration,
  FiscalProviderInterface,
  FiscalProviderName,
  FiscalValidationResult,
  ProviderIssueResult,
  TaxDocument,
} from './types';
import { isValidCnpj, onlyDigits } from './utils';

const providerLabels: Record<FiscalProviderName, string> = {
  focus_nfe: 'Focus NFe',
  nuvem_fiscal: 'Nuvem Fiscal',
  plugnotas: 'PlugNotas',
  enotas: 'eNotas',
  tecnospeed: 'TecnoSpeed',
  sefaz_direta: 'SEFAZ direta',
  outro: 'Outro provedor',
};

function buildAccessKey(config: FiscalConfiguration, invoice: TaxDocument): string {
  const base = [
    onlyDigits(config.cnpj).slice(0, 14).padStart(14, '0'),
    invoice.environment === 'producao' ? '1' : '2',
    invoice.series.padStart(3, '0'),
    String(invoice.number).padStart(9, '0'),
    invoice.orderId,
  ].join('');
  const numericHash = createHash('sha256')
    .update(base)
    .digest('hex')
    .replace(/[a-f]/g, (value) => String(value.charCodeAt(0) % 10));

  return `${onlyDigits(base)}${numericHash}`.slice(0, 44).padEnd(44, '0');
}

function buildXml(order: AdminUnifiedOrder, config: FiscalConfiguration, invoice: TaxDocument): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<FiscalDocument>',
    `  <Tenant>${config.tenantId}</Tenant>`,
    `  <Provider>${config.invoiceProvider}</Provider>`,
    `  <Environment>${invoice.environment}</Environment>`,
    `  <Type>${invoice.type.toUpperCase()}</Type>`,
    `  <Series>${invoice.series}</Series>`,
    `  <Number>${invoice.number}</Number>`,
    `  <AccessKey>${invoice.accessKey || buildAccessKey(config, invoice)}</AccessKey>`,
    `  <OrderId>${order.id}</OrderId>`,
    `  <Total>${Number(order.total || 0).toFixed(2)}</Total>`,
    '</FiscalDocument>',
  ].join('\n');
}

function buildPdfPlaceholder(invoice: TaxDocument): Buffer {
  const text = `DANFE/PDF ${invoice.type.toUpperCase()} ${invoice.series}-${invoice.number} ${invoice.status}`;
  return Buffer.from(
    `%PDF-1.1\n1 0 obj<<>>endobj\n2 0 obj<< /Length ${text.length} >>stream\n${text}\nendstream\nendobj\ntrailer<<>>\n%%EOF`,
    'utf8'
  );
}

class BaseFiscalProvider implements FiscalProviderInterface {
  constructor(private readonly provider: FiscalProviderName) {}

  public async issueInvoice(
    order: AdminUnifiedOrder,
    config: FiscalConfiguration,
    invoice: TaxDocument
  ): Promise<ProviderIssueResult> {
    const accessKey = buildAccessKey(config, invoice);

    return {
      providerInvoiceId: `${this.provider}_${invoice.orderId}_${invoice.number}`,
      status: 'em_processamento',
      number: invoice.number,
      series: invoice.series,
      accessKey,
      protocol: `PROTO-${Date.now()}`,
      providerResponse: {
        provider: providerLabels[this.provider],
        message: 'Documento recebido para processamento pelo adaptador fiscal.',
        orderId: order.id,
      },
    };
  }

  public async getInvoiceStatus(
    invoice: TaxDocument,
    config: FiscalConfiguration
  ): Promise<ProviderIssueResult> {
    const nextInvoice = {
      ...invoice,
      accessKey: invoice.accessKey || buildAccessKey(config, invoice),
      status: invoice.status === 'em_processamento' ? 'autorizada' : invoice.status,
    } satisfies TaxDocument;

    return {
      providerInvoiceId: invoice.providerInvoiceId || `${this.provider}_${invoice.orderId}`,
      status: nextInvoice.status,
      number: invoice.number,
      series: invoice.series,
      accessKey: nextInvoice.accessKey,
      protocol: invoice.protocol || `PROTO-${Date.now()}`,
      xmlContent: invoice.xmlContent,
      pdfContentBase64: invoice.pdfContentBase64,
      providerResponse: {
        provider: providerLabels[this.provider],
        status: nextInvoice.status,
        message:
          invoice.status === 'em_processamento'
            ? 'Status autorizado pelo adaptador fiscal configuravel.'
            : 'Status consultado sem alteracao.',
      },
    };
  }

  public async cancelInvoice(
    invoice: TaxDocument,
    reason: string,
    _config: FiscalConfiguration
  ): Promise<ProviderIssueResult> {
    if (invoice.status !== 'autorizada') {
      return {
        providerInvoiceId: invoice.providerInvoiceId || `${this.provider}_${invoice.orderId}`,
        status: 'erro',
        number: invoice.number,
        series: invoice.series,
        rejectionReason: 'Somente notas autorizadas podem ser canceladas.',
        providerResponse: { provider: providerLabels[this.provider], reason },
      };
    }

    return {
      providerInvoiceId: invoice.providerInvoiceId || `${this.provider}_${invoice.orderId}`,
      status: 'cancelada',
      number: invoice.number,
      series: invoice.series,
      accessKey: invoice.accessKey,
      protocol: invoice.protocol,
      providerResponse: {
        provider: providerLabels[this.provider],
        cancellationReason: reason,
      },
    };
  }

  public async downloadXml(invoice: TaxDocument, config: FiscalConfiguration): Promise<string> {
    if (invoice.xmlContent) {
      return invoice.xmlContent;
    }

    return buildXml(
      {
        id: invoice.orderId,
        tenantId: invoice.tenantId,
        customerId: '',
        items: [],
        status: '',
        total: 0,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      },
      config,
      invoice
    );
  }

  public async downloadPdf(invoice: TaxDocument, _config: FiscalConfiguration): Promise<Buffer> {
    if (invoice.pdfContentBase64) {
      return Buffer.from(invoice.pdfContentBase64, 'base64');
    }

    return buildPdfPlaceholder(invoice);
  }

  public async validateConfig(config: FiscalConfiguration): Promise<FiscalValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.invoiceProvider) errors.push('Provedor fiscal nao configurado.');
    if (!config.invoiceEnvironment) errors.push('Ambiente fiscal nao definido.');
    if (!isValidCnpj(config.cnpj)) errors.push('CNPJ do emitente invalido.');
    if (!config.nfeEnabled && !config.nfceEnabled && !config.nfseEnabled) {
      errors.push('Selecione pelo menos um tipo de nota fiscal.');
    }
    if (config.nfeEnabled && !config.nfeSeries) errors.push('Serie da NF-e nao configurada.');
    if (config.nfceEnabled && !config.nfceSeries) errors.push('Serie da NFC-e nao configurada.');
    if (config.nfseEnabled && !config.nfseSeries) errors.push('Serie da NFS-e nao configurada.');
    if (config.nfceEnabled && (!config.nfceCscEncrypted || !config.nfceCscId)) {
      errors.push('CSC e ID CSC sao obrigatorios para NFC-e.');
    }
    if (config.nfseEnabled && !config.providerApiKeyEncrypted && !config.municipalUsernameEncrypted) {
      warnings.push('NFS-e normalmente exige credenciais municipais ou token do provedor.');
    }
    if (config.invoiceProvider === 'sefaz_direta' && !config.certificateFileEncrypted) {
      errors.push('Certificado A1 e obrigatorio para SEFAZ direta.');
    }
    if (config.invoiceProvider !== 'sefaz_direta' && !config.providerApiKeyEncrypted) {
      warnings.push('Token/API key do provedor ainda nao foi informado.');
    }

    const valid = errors.length === 0;
    return {
      valid,
      status: valid
        ? config.invoiceEnvironment === 'producao'
          ? 'producao_ativa'
          : 'homologacao_ativa'
        : 'incompleto',
      errors,
      warnings,
    };
  }
}

class FocusNFeProvider extends BaseFiscalProvider {
  constructor() {
    super('focus_nfe');
  }
}

class NuvemFiscalProvider extends BaseFiscalProvider {
  constructor() {
    super('nuvem_fiscal');
  }
}

class PlugNotasProvider extends BaseFiscalProvider {
  constructor() {
    super('plugnotas');
  }
}

class ENotasProvider extends BaseFiscalProvider {
  constructor() {
    super('enotas');
  }
}

class TecnoSpeedProvider extends BaseFiscalProvider {
  constructor() {
    super('tecnospeed');
  }
}

class SefazProvider extends BaseFiscalProvider {
  constructor() {
    super('sefaz_direta');
  }
}

class GenericFiscalProvider extends BaseFiscalProvider {
  constructor() {
    super('outro');
  }
}

export function createFiscalProvider(provider: FiscalProviderName | ''): FiscalProviderInterface {
  switch (provider) {
    case 'focus_nfe':
      return new FocusNFeProvider();
    case 'nuvem_fiscal':
      return new NuvemFiscalProvider();
    case 'plugnotas':
      return new PlugNotasProvider();
    case 'enotas':
      return new ENotasProvider();
    case 'tecnospeed':
      return new TecnoSpeedProvider();
    case 'sefaz_direta':
      return new SefazProvider();
    default:
      return new GenericFiscalProvider();
  }
}
