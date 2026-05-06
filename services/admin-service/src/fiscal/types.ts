export type FiscalInvoiceType = 'nfe' | 'nfce' | 'nfse';
export type FiscalEnvironment = 'homologacao' | 'producao';
export type FiscalProviderName =
  | 'focus_nfe'
  | 'nuvem_fiscal'
  | 'plugnotas'
  | 'enotas'
  | 'tecnospeed'
  | 'sefaz_direta'
  | 'outro';

export type FiscalConfigurationStatus =
  | 'nao_configurado'
  | 'incompleto'
  | 'configurado'
  | 'certificado_invalido'
  | 'credenciais_invalidas'
  | 'homologacao_ativa'
  | 'producao_ativa'
  | 'erro_configuracao';

export type InvoiceStatus =
  | 'pendente'
  | 'em_processamento'
  | 'autorizada'
  | 'rejeitada'
  | 'cancelada'
  | 'erro'
  | 'inutilizada';

export type StockMovementType = 'reserva' | 'liberacao' | 'baixa' | 'estorno';

export type AdminUnifiedPermission =
  | 'visualizar_configuracoes_fiscais'
  | 'editar_configuracoes_fiscais'
  | 'upload_certificado_fiscal'
  | 'validar_configuracao_fiscal'
  | 'alterar_ambiente_fiscal'
  | 'visualizar_logs_fiscais'
  | 'visualizar_pedidos'
  | 'editar_pedidos'
  | 'emitir_nota_fiscal'
  | 'cancelar_nota_fiscal'
  | 'visualizar_xml'
  | 'visualizar_danfe'
  | 'gerenciar_estoque'
  | 'atualizar_rastreio'
  | 'visualizar_logs';

export interface AdminUnifiedRequestContext {
  tenantId: string;
  userId: string;
  userRoles: string[];
  permissions: string[];
  ipAddress?: string;
  userAgent?: string;
  source: 'admin-unified-dashboard' | 'fiscal-webhook' | 'shipping-webhook' | 'system';
}

export interface FiscalConfiguration {
  id: string;
  tenantId: string;
  companyId?: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  cnae: string;
  taxRegime: string;
  taxRegimeCode: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressCityCode: string;
  addressState: string;
  addressZipcode: string;
  phone: string;
  fiscalEmail: string;
  invoiceProvider: FiscalProviderName | '';
  invoiceEnvironment: FiscalEnvironment | '';
  nfeEnabled: boolean;
  nfceEnabled: boolean;
  nfseEnabled: boolean;
  nfeSeries: string;
  nfceSeries: string;
  nfseSeries: string;
  nextNfeNumber: number;
  nextNfceNumber: number;
  nextNfseNumber: number;
  emissionModel: string;
  defaultCfop: string;
  defaultNcm: string;
  defaultTaxOrigin: string;
  defaultOperationNature: string;
  defaultAdditionalInformation: string;
  certificateFileEncrypted?: unknown;
  certificatePasswordEncrypted?: unknown;
  certificateFileName?: string;
  certificateUploadedAt?: string;
  providerApiKeyEncrypted?: unknown;
  providerClientIdEncrypted?: unknown;
  providerClientSecretEncrypted?: unknown;
  nfceCscEncrypted?: unknown;
  nfceCscId: string;
  municipalUsernameEncrypted?: unknown;
  municipalPasswordEncrypted?: unknown;
  municipalProviderConfig?: Record<string, unknown>;
  status: FiscalConfigurationStatus;
  validationErrors: string[];
  lastValidationAt?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type FiscalConfigurationInput = Partial<
  Omit<
    FiscalConfiguration,
    | 'id'
    | 'tenantId'
    | 'certificateFileEncrypted'
    | 'certificatePasswordEncrypted'
    | 'providerApiKeyEncrypted'
    | 'providerClientIdEncrypted'
    | 'providerClientSecretEncrypted'
    | 'nfceCscEncrypted'
    | 'municipalUsernameEncrypted'
    | 'municipalPasswordEncrypted'
    | 'status'
    | 'validationErrors'
    | 'lastValidationAt'
    | 'createdBy'
    | 'updatedBy'
    | 'createdAt'
    | 'updatedAt'
  >
> & {
  certificateFileBase64?: string;
  certificatePassword?: string;
  providerApiKey?: string;
  providerClientId?: string;
  providerClientSecret?: string;
  nfceCsc?: string;
  municipalUsername?: string;
  municipalPassword?: string;
};

export interface PublicFiscalConfiguration
  extends Omit<
    FiscalConfiguration,
    | 'certificateFileEncrypted'
    | 'certificatePasswordEncrypted'
    | 'providerApiKeyEncrypted'
    | 'providerClientIdEncrypted'
    | 'providerClientSecretEncrypted'
    | 'nfceCscEncrypted'
    | 'municipalUsernameEncrypted'
    | 'municipalPasswordEncrypted'
  > {
  secrets: {
    hasCertificate: boolean;
    hasCertificatePassword: boolean;
    hasProviderApiKey: boolean;
    hasProviderClientId: boolean;
    hasProviderClientSecret: boolean;
    hasNfceCsc: boolean;
    hasMunicipalUsername: boolean;
    hasMunicipalPassword: boolean;
  };
}

export interface FiscalConfigurationAuditLog {
  id: string;
  tenantId: string;
  userId: string;
  fiscalConfigurationId: string;
  action: string;
  fieldChanged?: string;
  oldValueMasked?: string;
  newValueMasked?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AdminUnifiedCustomer {
  id: string;
  tenantId?: string;
  name?: string;
  document?: string;
  taxId?: string;
  cpfCnpj?: string;
  email?: string;
  phone?: string;
  address?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AdminUnifiedOrderItem {
  id?: string;
  productId: string;
  sku?: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
  price?: number;
  totalPrice?: number;
  ncm?: string;
  ncmCode?: string;
  cfop?: string;
  cest?: string;
  taxOrigin?: string;
  [key: string]: unknown;
}

export interface AdminUnifiedOrder {
  id: string;
  tenantId: string;
  userId?: string;
  customerId: string;
  customer?: AdminUnifiedCustomer;
  items: AdminUnifiedOrderItem[];
  status: string;
  paymentStatus?: string;
  payment_status?: string;
  fulfillmentStatus?: string;
  fiscalStatus?: string;
  shippingStatus?: string;
  marketplace?: string;
  externalOrderId?: string;
  subtotal?: number;
  discount?: number;
  shippingCost?: number;
  freight?: number;
  total: number;
  paymentMethod?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface TaxDocument {
  id: string;
  tenantId: string;
  fiscalConfigurationId: string;
  orderId: string;
  provider: FiscalProviderName;
  type: FiscalInvoiceType;
  environment: FiscalEnvironment;
  number: number;
  series: string;
  accessKey?: string;
  protocol?: string;
  status: InvoiceStatus;
  xmlContent?: string;
  pdfContentBase64?: string;
  xmlUrl?: string;
  pdfUrl?: string;
  providerInvoiceId?: string;
  rejectionReason?: string;
  protectedPayload?: Record<string, unknown>;
  providerResponse?: Record<string, unknown>;
  issuedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  idempotencyKey: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  tenantId: string;
  productId: string;
  orderId: string;
  type: StockMovementType;
  quantity: number;
  reason: string;
  idempotencyKey: string;
  createdBy: string;
  createdAt: string;
}

export interface Shipment {
  id: string;
  tenantId: string;
  orderId: string;
  carrier: string;
  trackingCode: string;
  trackingUrl?: string;
  status: string;
  postedAt?: string;
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
  updatedAt: string;
  createdAt: string;
}

export interface TrackingEvent {
  id: string;
  tenantId: string;
  shipmentId: string;
  status: string;
  description: string;
  location?: string;
  eventDate: string;
  rawPayload?: Record<string, unknown>;
}

export interface OrderHistoryEntry {
  id: string;
  tenantId: string;
  orderId: string;
  userId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

export interface AdminUnifiedAuditLog {
  id: string;
  tenantId: string;
  userId: string;
  orderId?: string;
  fiscalConfigurationId?: string;
  action: string;
  previousStatus?: string;
  nextStatus?: string;
  source: AdminUnifiedRequestContext['source'];
  errorMessage?: string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface FiscalValidationResult {
  valid: boolean;
  status: FiscalConfigurationStatus;
  errors: string[];
  warnings: string[];
}

export interface StockCheckResult {
  orderId: string;
  tenantId: string;
  available: boolean;
  items: Array<{
    productId: string;
    sku?: string;
    name?: string;
    requested: number;
    available: number;
    reserved: number;
    manageStock: boolean;
    ok: boolean;
  }>;
}

export interface ProviderIssueResult {
  providerInvoiceId: string;
  status: InvoiceStatus;
  number: number;
  series: string;
  accessKey?: string;
  protocol?: string;
  xmlContent?: string;
  pdfContentBase64?: string;
  rejectionReason?: string;
  providerResponse: Record<string, unknown>;
}

export interface FiscalProviderInterface {
  issueInvoice(
    order: AdminUnifiedOrder,
    fiscalConfig: FiscalConfiguration,
    invoice: TaxDocument
  ): Promise<ProviderIssueResult>;
  getInvoiceStatus(invoice: TaxDocument, fiscalConfig: FiscalConfiguration): Promise<ProviderIssueResult>;
  cancelInvoice(
    invoice: TaxDocument,
    reason: string,
    fiscalConfig: FiscalConfiguration
  ): Promise<ProviderIssueResult>;
  downloadXml(invoice: TaxDocument, fiscalConfig: FiscalConfiguration): Promise<string>;
  downloadPdf(invoice: TaxDocument, fiscalConfig: FiscalConfiguration): Promise<Buffer>;
  validateConfig(fiscalConfig: FiscalConfiguration): Promise<FiscalValidationResult>;
}
