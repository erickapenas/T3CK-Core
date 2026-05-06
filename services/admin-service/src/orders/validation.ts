import { z } from 'zod';

const optionalBoolean = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean()).optional();

const optionalNumber = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) return undefined;
  return Number(value);
}, z.number()).optional();

const orderStatus = z.enum([
  'rascunho',
  'criado',
  'aguardando_pagamento',
  'pagamento_aprovado',
  'pagamento_recusado',
  'em_analise',
  'aguardando_estoque',
  'estoque_reservado',
  'aguardando_nota_fiscal',
  'nota_fiscal_emitida',
  'em_separacao',
  'pronto_para_envio',
  'enviado',
  'em_transito',
  'saiu_para_entrega',
  'entregue',
  'cancelado',
  'devolvido',
  'reembolsado',
  'falha_operacional',
]);

const paymentStatus = z.enum([
  'pendente',
  'aprovado',
  'recusado',
  'cancelado',
  'estornado',
  'parcialmente_estornado',
  'chargeback',
  'em_analise',
]);

const fiscalStatus = z.enum([
  'nao_aplicavel',
  'pendente',
  'aguardando_configuracao',
  'em_processamento',
  'autorizada',
  'rejeitada',
  'cancelada',
  'erro',
]);

const stockStatus = z.enum([
  'nao_verificado',
  'disponivel',
  'insuficiente',
  'reservado',
  'baixado',
  'parcialmente_reservado',
  'estornado',
]);

const shippingStatus = z.enum([
  'nao_iniciado',
  'aguardando_separacao',
  'em_separacao',
  'pronto_para_envio',
  'enviado',
  'em_transito',
  'saiu_para_entrega',
  'entregue',
  'atrasado',
  'falha_entrega',
  'devolvido',
]);

export const OrderListQuerySchema = z.object({
  page: optionalNumber,
  limit: optionalNumber,
  search: z.string().optional(),
  period: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  paidFrom: z.string().optional(),
  paidTo: z.string().optional(),
  shippedFrom: z.string().optional(),
  shippedTo: z.string().optional(),
  deliveredFrom: z.string().optional(),
  deliveredTo: z.string().optional(),
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  fiscalStatus: z.string().optional(),
  stockStatus: z.string().optional(),
  shippingStatus: z.string().optional(),
  channel: z.string().optional(),
  marketplace: z.string().optional(),
  paymentMethod: z.string().optional(),
  customerId: z.string().optional(),
  productId: z.string().optional(),
  sku: z.string().optional(),
  minTotal: optionalNumber,
  maxTotal: optionalNumber,
  hasInvoice: z.enum(['with', 'without', 'error']).optional(),
  stockIssue: optionalBoolean,
  awaitingPicking: optionalBoolean,
  awaitingShipping: optionalBoolean,
  shipped: optionalBoolean,
  delivered: optionalBoolean,
  cancelled: optionalBoolean,
  delayed: optionalBoolean,
  hasInternalNotes: optionalBoolean,
  imported: optionalBoolean,
  manual: optionalBoolean,
});

export const OrderItemBodySchema = z.object({
  productId: z.string().optional(),
  variantId: z.string().optional(),
  sku: z.string().min(1, 'SKU obrigatorio'),
  name: z.string().min(1, 'Nome do produto obrigatorio'),
  quantity: z.number().min(1, 'Quantidade deve ser maior que zero'),
  unitPrice: z.number().min(0, 'Preco invalido'),
  discountTotal: z.number().min(0).optional(),
  taxTotal: z.number().min(0).optional(),
  costPrice: z.number().min(0).nullable().optional(),
  imageUrl: z.string().optional(),
  ncm: z.string().optional(),
  cfop: z.string().optional(),
  cest: z.string().optional(),
  taxOrigin: z.string().optional(),
  productSnapshot: z.record(z.unknown()).optional(),
});

export const OrderCreateBodySchema = z.object({
  customerId: z.string().optional(),
  customer: z.record(z.unknown()).optional(),
  items: z.array(OrderItemBodySchema).min(1, 'Pedido precisa ter ao menos um item'),
  status: orderStatus.optional(),
  paymentStatus: paymentStatus.optional(),
  fiscalStatus: fiscalStatus.optional(),
  stockStatus: stockStatus.optional(),
  shippingStatus: shippingStatus.optional(),
  channel: z.string().optional(),
  marketplace: z.string().optional(),
  externalOrderId: z.string().optional(),
  source: z.string().optional(),
  discountTotal: z.number().min(0).optional(),
  shippingTotal: z.number().min(0).optional(),
  taxTotal: z.number().min(0).optional(),
  feeTotal: z.number().min(0).optional(),
  paymentMethod: z.string().optional(),
  shippingMethod: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  idempotencyKey: z.string().optional(),
});

export const OrderUpdateBodySchema = OrderCreateBodySchema.partial().extend({
  items: z.array(OrderItemBodySchema).optional(),
});

export const OrderStatusBodySchema = z.object({
  status: orderStatus,
  reason: z.string().optional(),
});

export const OrderPaymentBodySchema = z.object({
  method: z.string().optional(),
  provider: z.string().optional(),
  amount: z.number().min(0).optional(),
  reason: z.string().min(3, 'Motivo obrigatorio'),
  externalPaymentId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const OrderRefundBodySchema = z.object({
  amount: z.number().positive('Valor do reembolso deve ser maior que zero'),
  reason: z.string().min(3, 'Motivo obrigatorio'),
  paymentId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const OrderCancelBodySchema = z.object({
  reason: z.string().min(3, 'Motivo do cancelamento obrigatorio'),
  notes: z.string().optional(),
  refundPayment: z.boolean().optional(),
  releaseStock: z.boolean().optional(),
  cancelInvoice: z.boolean().optional(),
  idempotencyKey: z.string().optional(),
});

export const OrderShippingBodySchema = z.object({
  carrier: z.string().min(1, 'Transportadora obrigatoria'),
  shippingMethod: z.string().optional(),
  trackingCode: z.string().min(1, 'Codigo de rastreio obrigatorio'),
  trackingUrl: z.string().optional(),
  status: z.string().optional(),
  shippingCost: z.number().min(0).optional(),
  estimatedDeliveryAt: z.string().optional(),
  eventDescription: z.string().optional(),
  location: z.string().optional(),
});

export const OrderNoteBodySchema = z.object({
  type: z.enum(['geral', 'atendimento', 'financeiro', 'estoque', 'fiscal', 'envio', 'risco']).default('geral'),
  note: z.string().min(2, 'Observacao obrigatoria'),
  isPinned: z.boolean().optional(),
  visibility: z.enum(['interna', 'restrita']).default('interna'),
});

export const OrderExportBodySchema = z.object({
  filters: OrderListQuerySchema.optional().default({}),
  format: z.enum(['csv', 'json']).default('csv'),
});

export const OrderBulkStatusBodySchema = z.object({
  orderIds: z.array(z.string()).min(1),
  status: orderStatus,
  reason: z.string().optional(),
});

export const OrderBulkIdsBodySchema = z.object({
  orderIds: z.array(z.string()).min(1),
});
