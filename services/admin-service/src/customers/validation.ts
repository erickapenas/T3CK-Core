import { z } from 'zod';

const emptyToUndefined = (value: unknown): unknown => {
  if (value === '' || value === null) return undefined;
  return value;
};

const optionalNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().finite().optional()
);

const optionalBoolean = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());

const CustomerStatusSchema = z.enum([
  'novo',
  'ativo',
  'recorrente',
  'vip',
  'inativo',
  'bloqueado',
  'em_analise',
  'descadastrado',
  'anonimizado',
]);

const CustomerTypeSchema = z.enum(['pf', 'pj']);

const RiskStatusSchema = z.enum([
  'normal',
  'em_analise',
  'alto_risco',
  'bloqueado',
  'liberado_manualmente',
]);

export const CustomerListQuerySchema = z.object({
  page: optionalNumber,
  limit: optionalNumber,
  search: z.string().max(120).optional(),
  status: CustomerStatusSchema.optional(),
  customerType: CustomerTypeSchema.optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(2).optional(),
  source: z.string().max(80).optional(),
  acquisitionChannel: z.string().max(80).optional(),
  tag: z.string().max(60).optional(),
  marketingConsent: z.enum(['with', 'without']).optional(),
  hasOrders: z.enum(['with', 'without']).optional(),
  minSpent: optionalNumber,
  maxSpent: optionalNumber,
  minOrders: optionalNumber,
  maxOrders: optionalNumber,
  createdFrom: z.string().max(32).optional(),
  createdTo: z.string().max(32).optional(),
  lastOrderFrom: z.string().max(32).optional(),
  lastOrderTo: z.string().max(32).optional(),
});

export const CustomerCreateBodySchema = z
  .object({
    customerType: CustomerTypeSchema.default('pf'),
    customer_type: CustomerTypeSchema.optional(),
    name: z.string().min(2).max(160),
    email: z.string().email().max(180).optional().or(z.literal('')),
    phone: z.string().max(40).optional(),
    documentNumber: z.string().max(32).optional(),
    document_number: z.string().max(32).optional(),
    document: z.string().max(32).optional(),
    taxId: z.string().max(32).optional(),
    cpfCnpj: z.string().max(32).optional(),
    birthDate: z.string().max(32).optional(),
    legalName: z.string().max(180).optional(),
    tradeName: z.string().max(180).optional(),
    stateRegistration: z.string().max(60).optional(),
    municipalRegistration: z.string().max(60).optional(),
    companyResponsible: z.string().max(160).optional(),
    status: CustomerStatusSchema.default('novo'),
    source: z.string().max(80).optional(),
    acquisitionChannel: z.string().max(80).optional(),
    city: z.string().max(80).optional(),
    state: z.string().max(2).optional(),
    tags: z.array(z.string().min(1).max(60)).max(24).optional(),
    internalNotes: z.string().max(2000).optional(),
    contactPreference: z.string().max(40).optional(),
    acceptsEmailMarketing: optionalBoolean,
    acceptsWhatsappMarketing: optionalBoolean,
    acceptsSmsMarketing: optionalBoolean,
    riskStatus: RiskStatusSchema.default('normal'),
    blockedReason: z.string().max(300).optional(),
  })
  .passthrough();

export const CustomerUpdateBodySchema = CustomerCreateBodySchema.partial();

export const CustomerAddressBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    type: z.enum(['entrega', 'cobranca', 'fiscal', 'residencial', 'comercial']).default('entrega'),
    recipientName: z.string().min(1).max(160),
    zipcode: z.string().min(5).max(16),
    street: z.string().min(1).max(160),
    number: z.string().min(1).max(40),
    complement: z.string().max(120).optional(),
    neighborhood: z.string().max(120).optional(),
    city: z.string().min(1).max(100),
    state: z.string().min(2).max(2),
    country: z.string().min(2).max(80).default('BR'),
    reference: z.string().max(180).optional(),
    phone: z.string().max(40).optional(),
    isDefault: z.boolean().default(false),
  })
  .passthrough();

export const CustomerContactBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    type: z.enum(['email', 'telefone', 'whatsapp', 'sms']),
    value: z.string().min(1).max(180),
    label: z.string().max(80).default('principal'),
    isPrimary: z.boolean().default(false),
    isVerified: z.boolean().default(false),
    verifiedAt: z.string().max(32).optional(),
    status: z
      .enum(['verificado', 'nao_verificado', 'invalido', 'descadastrado', 'bloqueado'])
      .default('nao_verificado'),
  })
  .passthrough();

export const CustomerTagBodySchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().max(80).optional(),
});

export const CustomerTagAssignmentBodySchema = z.object({
  tag: z.string().min(1).max(60),
});

export const CustomerNoteBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    type: z.enum(['geral', 'atendimento', 'financeiro', 'comercial', 'entrega', 'risco']).default('geral'),
    note: z.string().min(1).max(4000),
    visibility: z.enum(['interna', 'restrita']).default('interna'),
  })
  .passthrough();

export const CustomerConsentBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    channel: z.enum(['email', 'whatsapp', 'sms', 'notificacoes']),
    purpose: z.string().min(1).max(120).default('marketing'),
    status: z.enum(['concedido', 'revogado']).default('concedido'),
    source: z.string().max(80).optional(),
    consentedAt: z.string().max(32).optional(),
    revokedAt: z.string().max(32).optional(),
  })
  .passthrough();

export const CustomerPrivacyRequestBodySchema = z.object({
  type: z.enum([
    'acesso',
    'correcao',
    'revogacao_consentimento',
    'eliminacao',
    'portabilidade',
    'compartilhamento',
    'oposicao',
  ]),
  notes: z.string().max(2000).optional(),
});

export const CustomerRiskBodySchema = z.object({
  riskStatus: RiskStatusSchema,
  reason: z.string().max(300).optional(),
});

export const CustomerExportBodySchema = z.object({
  filters: CustomerListQuerySchema.partial().optional().default({}),
  format: z.enum(['csv', 'xlsx', 'pdf']).optional().default('csv'),
});
