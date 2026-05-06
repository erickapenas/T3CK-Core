import { AdminCustomer, AdminOrder, PaginatedResult } from '../types';

export type CustomerStatus =
  | 'novo'
  | 'ativo'
  | 'recorrente'
  | 'vip'
  | 'inativo'
  | 'bloqueado'
  | 'em_analise'
  | 'descadastrado'
  | 'anonimizado';

export type CustomerType = 'pf' | 'pj';
export type RiskStatus = 'normal' | 'em_analise' | 'alto_risco' | 'bloqueado' | 'liberado_manualmente';

export interface CustomerCrmRecord extends AdminCustomer {
  tenant_id?: string;
  customerType?: CustomerType;
  customer_type?: CustomerType;
  documentType?: 'cpf' | 'cnpj';
  document_type?: 'cpf' | 'cnpj';
  documentNumber?: string;
  document_number?: string;
  birthDate?: string;
  birth_date?: string;
  legalName?: string;
  legal_name?: string;
  tradeName?: string;
  trade_name?: string;
  stateRegistration?: string;
  municipalRegistration?: string;
  companyResponsible?: string;
  status?: CustomerStatus;
  source?: string;
  externalId?: string;
  external_id?: string;
  emailNormalized?: string;
  phoneNormalized?: string;
  documentNormalized?: string;
  acquisitionChannel?: string;
  acquisition_channel?: string;
  city?: string;
  state?: string;
  origin?: string;
  tags?: string[];
  internalNotes?: string;
  contactPreference?: string;
  acceptsEmailMarketing?: boolean;
  acceptsWhatsappMarketing?: boolean;
  acceptsSmsMarketing?: boolean;
  riskStatus?: RiskStatus;
  risk_status?: RiskStatus;
  blockedReason?: string;
  blocked_reason?: string;
  averageTicket?: number;
  average_ticket?: number;
  firstOrderAt?: string;
  first_order_at?: string;
  lastOrderAt?: string;
  last_order_at?: string;
  deletedAt?: string;
  deleted_at?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface CustomerAddress {
  id: string;
  tenantId: string;
  tenant_id?: string;
  customerId: string;
  customer_id?: string;
  type: 'entrega' | 'cobranca' | 'fiscal' | 'residencial' | 'comercial';
  recipientName: string;
  zipcode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  country: string;
  reference?: string;
  phone?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerContact {
  id: string;
  tenantId: string;
  customerId: string;
  type: 'email' | 'telefone' | 'whatsapp' | 'sms';
  value: string;
  label: string;
  isPrimary: boolean;
  isVerified: boolean;
  verifiedAt?: string;
  status: 'verificado' | 'nao_verificado' | 'invalido' | 'descadastrado' | 'bloqueado';
  createdAt: string;
  updatedAt: string;
}

export interface CustomerTag {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerNote {
  id: string;
  tenantId: string;
  customerId: string;
  userId: string;
  type: 'geral' | 'atendimento' | 'financeiro' | 'comercial' | 'entrega' | 'risco';
  note: string;
  visibility: 'interna' | 'restrita';
  createdAt: string;
  updatedAt: string;
}

export interface CustomerConsent {
  id: string;
  tenantId: string;
  customerId: string;
  channel: 'email' | 'whatsapp' | 'sms' | 'notificacoes';
  purpose: string;
  status: 'concedido' | 'revogado';
  source?: string;
  ipAddress?: string;
  userAgent?: string;
  consentedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPrivacyRequest {
  id: string;
  tenantId: string;
  customerId: string;
  type:
    | 'acesso'
    | 'correcao'
    | 'revogacao_consentimento'
    | 'eliminacao'
    | 'portabilidade'
    | 'compartilhamento'
    | 'oposicao';
  status: 'aberta' | 'em_analise' | 'concluida' | 'negada';
  requestedAt: string;
  completedAt?: string;
  handledBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAuditLog {
  id: string;
  tenantId: string;
  customerId: string;
  userId: string;
  action: string;
  fieldChanged?: string;
  oldValueMasked?: string;
  newValueMasked?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface CustomerListFilters {
  search?: string;
  status?: string;
  customerType?: string;
  city?: string;
  state?: string;
  source?: string;
  acquisitionChannel?: string;
  tag?: string;
  marketingConsent?: 'with' | 'without';
  hasOrders?: 'with' | 'without';
  minSpent?: number;
  maxSpent?: number;
  minOrders?: number;
  maxOrders?: number;
  createdFrom?: string;
  createdTo?: string;
  lastOrderFrom?: string;
  lastOrderTo?: string;
}

export interface CustomerPermissions {
  canViewSensitive: boolean;
  canExport: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageTags: boolean;
  canManageConsents: boolean;
  canViewLogs: boolean;
  canBlock: boolean;
  canManageNotes: boolean;
  canViewFinancial: boolean;
}

export interface CustomerSummary {
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalSpent: number;
  totalPaid: number;
  totalPending: number;
  totalCancelled: number;
  averageTicket: number;
  highestOrder: number;
  lowestOrder: number;
  firstOrderAt?: string;
  lastOrderAt?: string;
  productsPurchased: number;
  cancelledOrdersCount: number;
  openOrdersCount: number;
  averageDaysBetweenOrders: number | null;
  favoritePaymentMethod?: string;
  missingFields: Array<{ metric: string; collection: string; field: string }>;
}

export interface CustomerProductSummary {
  productId: string;
  sku: string;
  name: string;
  category?: string;
  quantity: number;
  totalSpent: number;
  orders: number;
  lastPurchasedAt?: string;
  channel?: string;
}

export interface CustomerFinancialSummary {
  totalSpent: number;
  totalPaid: number;
  totalPending: number;
  totalCancelled: number;
  totalRefunded: number | null;
  averageTicket: number;
  highestOrder: number;
  lowestOrder: number;
  favoritePaymentMethod?: string;
  approvedPayments: number;
  refusedPayments: number | null;
  missingFields: Array<{ metric: string; collection: string; field: string }>;
}

export interface CustomerDetails {
  customer: CustomerCrmRecord;
  summary: CustomerSummary;
  addresses: CustomerAddress[];
  contacts: CustomerContact[];
  tags: string[];
  notes: CustomerNote[];
  consents: CustomerConsent[];
  privacyRequests: CustomerPrivacyRequest[];
  auditLogs: CustomerAuditLog[];
}

export type CustomerListResult = PaginatedResult<CustomerCrmRecord> & {
  filters: CustomerListFilters;
  segments: Record<string, number>;
};

export type CustomerOrderList = PaginatedResult<AdminOrder>;
