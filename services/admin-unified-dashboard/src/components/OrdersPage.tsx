import { useEffect, useMemo, useState } from 'react';
import {
  AdminSessionUser,
  OrderDetails,
  OrderItemRecord,
  OrderListFilters,
  OrderRecord,
  OrderStatus,
  orderManagementApi,
  adminUnifiedApi,
} from '../apiClient';
import { Badge, Button, Card, Dropdown, Input, Modal, Table, Tabs } from '../design-system/components/primitives';
import '../styles/OrdersPage.css';

type OrdersPageProps = {
  tenantId: string;
  currentUser: AdminSessionUser;
  onChange?: () => void;
  onOpenFiscalSettings?: () => void;
  onOpenCustomers?: () => void;
  onOpenProducts?: () => void;
};

type OrderListData = {
  items: OrderRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  segments?: Record<string, number>;
  alerts?: Array<{ type: string; severity: string; orderId: string; description: string }>;
};

type OrderView = 'list' | 'create' | 'edit' | 'details';

type OrderDraft = {
  customerId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDocument: string;
  channel: string;
  marketplace: string;
  externalOrderId: string;
  source: string;
  paymentMethod: string;
  shippingMethod: string;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  feeTotal: number;
  notes: string;
  items: Array<Partial<OrderItemRecord>>;
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const orderTabs = [
  { id: 'overview', label: 'Visao geral' },
  { id: 'customer', label: 'Cliente' },
  { id: 'items', label: 'Produtos' },
  { id: 'payment', label: 'Pagamento' },
  { id: 'stock', label: 'Estoque' },
  { id: 'invoice', label: 'Nota fiscal' },
  { id: 'shipping', label: 'Envio e rastreio' },
  { id: 'history', label: 'Historico' },
  { id: 'notes', label: 'Observacoes internas' },
  { id: 'audit', label: 'Logs e auditoria' },
];

const emptyDraft: OrderDraft = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerDocument: '',
  channel: 'manual',
  marketplace: '',
  externalOrderId: '',
  source: 'cadastro_manual',
  paymentMethod: 'manual',
  shippingMethod: '',
  discountTotal: 0,
  shippingTotal: 0,
  taxTotal: 0,
  feeTotal: 0,
  notes: '',
  items: [
    {
      sku: '',
      name: '',
      productId: '',
      quantity: 1,
      unitPrice: 0,
      discountTotal: 0,
      taxTotal: 0,
    },
  ],
};

const statusOptions: Array<{ value: OrderStatus; label: string }> = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'criado', label: 'Criado' },
  { value: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { value: 'pagamento_aprovado', label: 'Pagamento aprovado' },
  { value: 'em_analise', label: 'Em analise' },
  { value: 'aguardando_estoque', label: 'Aguardando estoque' },
  { value: 'estoque_reservado', label: 'Estoque reservado' },
  { value: 'aguardando_nota_fiscal', label: 'Aguardando nota fiscal' },
  { value: 'nota_fiscal_emitida', label: 'Nota fiscal emitida' },
  { value: 'em_separacao', label: 'Em separacao' },
  { value: 'pronto_para_envio', label: 'Pronto para envio' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'em_transito', label: 'Em transito' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'reembolsado', label: 'Reembolsado' },
  { value: 'falha_operacional', label: 'Falha operacional' },
];

function usePermission(user: AdminSessionUser) {
  return (permission: string): boolean => user.role === 'admin' || Boolean(user.permissions?.includes(permission));
}

function money(value?: number | null): string {
  return currency.format(Number(value || 0));
}

function dateText(value?: string): string {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
}

function labelize(value?: string): string {
  return String(value || 'nao_informado').replace(/_/g, ' ');
}

function statusTone(status?: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (['pagamento_aprovado', 'estoque_reservado', 'nota_fiscal_emitida', 'entregue', 'aprovado', 'autorizada', 'baixado'].includes(String(status))) return 'success';
  if (['aguardando_pagamento', 'aguardando_estoque', 'aguardando_nota_fiscal', 'pendente', 'nao_verificado', 'em_processamento'].includes(String(status))) return 'warning';
  if (['cancelado', 'devolvido', 'reembolsado', 'pagamento_recusado', 'recusado', 'rejeitada', 'erro', 'insuficiente', 'falha_operacional', 'chargeback'].includes(String(status))) return 'danger';
  if (['enviado', 'em_transito', 'saiu_para_entrega', 'pronto_para_envio'].includes(String(status))) return 'primary';
  return 'default';
}

function severityTone(severity?: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (severity === 'critica' || severity === 'critical' || severity === 'alta') return 'danger';
  if (severity === 'media' || severity === 'warning') return 'warning';
  if (severity === 'baixa') return 'primary';
  return 'default';
}

function cleanFilters(filters: OrderListFilters): OrderListFilters {
  return Object.entries(filters).reduce((acc, [key, value]) => {
    if (value !== '' && value !== undefined && value !== null) {
      (acc as Record<string, unknown>)[key] = value;
    }
    return acc;
  }, {} as OrderListFilters);
}

function draftFromOrder(order: OrderRecord): OrderDraft {
  const customer = order.customerSnapshot || order.customer || {};
  return {
    customerId: order.customerId,
    customerName: String(customer.name || ''),
    customerEmail: String(customer.email || ''),
    customerPhone: String(customer.phone || ''),
    customerDocument: String(customer.document || customer.taxId || customer.cpfCnpj || ''),
    channel: order.channel || 'manual',
    marketplace: order.marketplace || '',
    externalOrderId: order.externalOrderId || '',
    source: order.source || 'cadastro_manual',
    paymentMethod: order.paymentMethod || 'manual',
    shippingMethod: order.shippingMethod || '',
    discountTotal: order.discountTotal || 0,
    shippingTotal: order.shippingTotal || 0,
    taxTotal: order.taxTotal || 0,
    feeTotal: order.feeTotal || 0,
    notes: order.notes || '',
    items: order.items.map((item) => ({ ...item })),
  };
}

function draftPayload(draft: OrderDraft): Record<string, unknown> {
  return {
    customerId: draft.customerId || undefined,
    customer: {
      name: draft.customerName,
      email: draft.customerEmail,
      phone: draft.customerPhone,
      document: draft.customerDocument,
    },
    channel: draft.channel,
    marketplace: draft.marketplace || undefined,
    externalOrderId: draft.externalOrderId || undefined,
    source: draft.source,
    paymentMethod: draft.paymentMethod,
    shippingMethod: draft.shippingMethod || undefined,
    discountTotal: Number(draft.discountTotal || 0),
    shippingTotal: Number(draft.shippingTotal || 0),
    taxTotal: Number(draft.taxTotal || 0),
    feeTotal: Number(draft.feeTotal || 0),
    notes: draft.notes,
    items: draft.items.map((item) => ({
      productId: item.productId || undefined,
      variantId: item.variantId || undefined,
      sku: item.sku,
      name: item.name,
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.unitPrice || 0),
      discountTotal: Number(item.discountTotal || 0),
      taxTotal: Number(item.taxTotal || 0),
      costPrice: item.costPrice === undefined || item.costPrice === null ? undefined : Number(item.costPrice),
    })),
  };
}

export function OrdersPage({
  tenantId,
  currentUser,
  onChange,
  onOpenFiscalSettings,
  onOpenCustomers,
  onOpenProducts,
}: OrdersPageProps) {
  const can = usePermission(currentUser);
  const [view, setView] = useState<OrderView>('list');
  const [filters, setFilters] = useState<OrderListFilters>({ page: 1, limit: 10, period: 'last30' });
  const [draftFilters, setDraftFilters] = useState<OrderListFilters>({ page: 1, limit: 10, period: 'last30' });
  const [listData, setListData] = useState<OrderListData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<OrderDetails | null>(null);
  const [formData, setFormData] = useState<OrderDraft>(emptyDraft);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<{ order: OrderRecord; status: OrderStatus; reason: string } | null>(null);
  const [cancelModal, setCancelModal] = useState<{ order: OrderRecord; reason: string; refundPayment: boolean; releaseStock: boolean; cancelInvoice: boolean } | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ order: OrderRecord; amount: number; reason: string; method: string }>({ order: {} as OrderRecord, amount: 0, reason: '', method: 'manual' });
  const [refundModal, setRefundModal] = useState<{ order: OrderRecord; amount: number; reason: string } | null>(null);
  const [shippingModal, setShippingModal] = useState<{ order: OrderRecord; carrier: string; trackingCode: string; status: string; trackingUrl: string; estimatedDeliveryAt: string } | null>(null);
  const [noteModal, setNoteModal] = useState<{ order: OrderRecord; note: string; type: OrderNoteType; isPinned: boolean } | null>(null);

  const hasOrderView = can('visualizar_pedidos');

  const kpis = useMemo(() => {
    const segments = listData?.segments || {};
    return [
      ['Total no periodo', segments.total || listData?.pagination.total || 0],
      ['Pagos', segments.payment_aprovado || 0],
      ['Aguardando estoque', segments.aguardando_estoque || segments.stock_insuficiente || 0],
      ['Aguardando NF', segments.aguardando_nota_fiscal || segments.fiscal_pendente || 0],
      ['Enviados', (segments.shipping_enviado || 0) + (segments.shipping_em_transito || 0)],
      ['Cancelados', segments.cancelado || 0],
    ];
  }, [listData]);

  async function loadOrders(nextFilters = filters) {
    if (!hasOrderView) return;
    setLoading(true);
    setError(null);
    const response = await orderManagementApi.list(cleanFilters(nextFilters), tenantId);
    if (response.success) {
      setListData(response.data as OrderListData);
    } else {
      setError(response.error || 'Nao foi possivel carregar os pedidos.');
    }
    setLoading(false);
  }

  async function loadDetails(orderId: string) {
    setLoading(true);
    setError(null);
    const response = await orderManagementApi.get(orderId, tenantId);
    if (response.success) {
      setDetails(response.data as OrderDetails);
      setSelectedId(orderId);
      setActiveTab('overview');
      setView('details');
    } else {
      setError(response.error || 'Nao foi possivel carregar o pedido.');
    }
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, [tenantId, filters.page, filters.limit, filters.period, filters.status, filters.paymentStatus, filters.fiscalStatus, filters.stockStatus, filters.shippingStatus]);

  function startCreate() {
    setFormData({ ...emptyDraft, items: emptyDraft.items.map((item) => ({ ...item })) });
    setView('create');
    setError(null);
    setMessage(null);
  }

  function startEdit(order: OrderRecord) {
    setFormData(draftFromOrder(order));
    setSelectedId(order.id);
    setView('edit');
  }

  async function submitForm() {
    setSaving(true);
    setError(null);
    const payload = draftPayload(formData);
    const response = view === 'edit' && selectedId
      ? await orderManagementApi.update(selectedId, payload, tenantId)
      : await orderManagementApi.create(payload, tenantId);
    if (response.success) {
      setMessage(view === 'edit' ? 'Pedido atualizado.' : 'Pedido criado.');
      setView('list');
      await loadOrders();
      onChange?.();
    } else {
      setError(response.error || 'Nao foi possivel salvar o pedido.');
    }
    setSaving(false);
  }

  async function refreshDetails() {
    if (selectedId) await loadDetails(selectedId);
    await loadOrders();
    onChange?.();
  }

  async function runAction(label: string, action: () => Promise<any>) {
    setSaving(true);
    setError(null);
    setMessage(null);
    const response = await action();
    if (response.success) {
      setMessage(label);
      await refreshDetails();
    } else {
      setError(response.error || 'Nao foi possivel executar a acao.');
    }
    setSaving(false);
  }

  if (!hasOrderView) {
    return (
      <section className="orders-page">
        <Card title="Pedidos" eyebrow="Sem permissao">
          <p>Voce nao possui permissao para visualizar ou alterar pedidos.</p>
        </Card>
      </section>
    );
  }

  return (
    <section className="orders-page">
      <header className="orders-toolbar">
        <div>
          <span className="orders-eyebrow">Admin Unified Dashboard</span>
          <h2>Pedidos</h2>
          <p>Operacao multi-tenant com cliente, produtos, pagamento, estoque, fiscal, envio, historico e auditoria.</p>
        </div>
        <div className="orders-actions">
          <Button onClick={() => loadOrders()}>Atualizar</Button>
          {can('exportar_pedidos') && <Button onClick={() => runAction('Exportacao de pedidos gerada.', () => orderManagementApi.exportList(filters, tenantId))}>Exportar</Button>}
          {can('criar_pedidos') && <Button tone="primary" onClick={startCreate}>Novo pedido</Button>}
        </div>
      </header>

      {message && <div className="orders-alert orders-alert--success">{message}</div>}
      {error && <div className="orders-alert orders-alert--error">{error}</div>}

      {view === 'list' && (
        <>
          <div className="orders-kpis">
            {kpis.map(([label, value]) => (
              <Card key={String(label)} className="order-kpi">
                <span>{label}</span>
                <strong>{value}</strong>
              </Card>
            ))}
          </div>

          <Card title="Busca e filtros" eyebrow="Backend filtering">
            <div className="order-filter-grid">
              <Input placeholder="Pedido, cliente, e-mail, telefone, CPF/CNPJ, SKU ou rastreio" value={draftFilters.search || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} />
              <Dropdown value={draftFilters.period || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, period: event.target.value }))}>
                <option value="">Periodo livre</option>
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="last7">Ultimos 7 dias</option>
                <option value="last15">Ultimos 15 dias</option>
                <option value="last30">Ultimos 30 dias</option>
                <option value="thisMonth">Este mes</option>
                <option value="lastMonth">Mes passado</option>
              </Dropdown>
              <Dropdown value={draftFilters.status || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as OrderListFilters['status'] }))}>
                <option value="">Status do pedido</option>
                {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </Dropdown>
              <Dropdown value={draftFilters.paymentStatus || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, paymentStatus: event.target.value as OrderListFilters['paymentStatus'] }))}>
                <option value="">Status pagamento</option>
                <option value="pendente">Pendente</option>
                <option value="aprovado">Aprovado</option>
                <option value="recusado">Recusado</option>
                <option value="estornado">Estornado</option>
                <option value="chargeback">Chargeback</option>
              </Dropdown>
              <Dropdown value={draftFilters.fiscalStatus || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, fiscalStatus: event.target.value as OrderListFilters['fiscalStatus'] }))}>
                <option value="">Status fiscal</option>
                <option value="pendente">Pendente</option>
                <option value="autorizada">Autorizada</option>
                <option value="rejeitada">Rejeitada</option>
                <option value="erro">Erro</option>
                <option value="nao_aplicavel">Nao aplicavel</option>
              </Dropdown>
              <Dropdown value={draftFilters.stockStatus || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, stockStatus: event.target.value as OrderListFilters['stockStatus'] }))}>
                <option value="">Status estoque</option>
                <option value="nao_verificado">Nao verificado</option>
                <option value="disponivel">Disponivel</option>
                <option value="insuficiente">Insuficiente</option>
                <option value="reservado">Reservado</option>
                <option value="baixado">Baixado</option>
              </Dropdown>
              <Dropdown value={draftFilters.shippingStatus || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, shippingStatus: event.target.value as OrderListFilters['shippingStatus'] }))}>
                <option value="">Status envio</option>
                <option value="aguardando_separacao">Aguardando separacao</option>
                <option value="pronto_para_envio">Pronto para envio</option>
                <option value="enviado">Enviado</option>
                <option value="em_transito">Em transito</option>
                <option value="entregue">Entregue</option>
                <option value="atrasado">Atrasado</option>
              </Dropdown>
              <Input placeholder="Canal" value={draftFilters.channel || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, channel: event.target.value }))} />
              <Input placeholder="Marketplace/origem" value={draftFilters.marketplace || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, marketplace: event.target.value }))} />
              <Input type="number" placeholder="Valor minimo" value={draftFilters.minTotal ?? ''} onChange={(event) => setDraftFilters((current) => ({ ...current, minTotal: event.target.value ? Number(event.target.value) : undefined }))} />
              <Input type="number" placeholder="Valor maximo" value={draftFilters.maxTotal ?? ''} onChange={(event) => setDraftFilters((current) => ({ ...current, maxTotal: event.target.value ? Number(event.target.value) : undefined }))} />
            </div>
            <div className="order-check-filters">
              {[
                ['stockIssue', 'Estoque insuficiente'],
                ['awaitingPicking', 'Aguardando separacao'],
                ['awaitingShipping', 'Aguardando envio'],
                ['shipped', 'Enviados'],
                ['delivered', 'Entregues'],
                ['cancelled', 'Cancelados'],
                ['delayed', 'Atrasados'],
                ['imported', 'Importados'],
                ['manual', 'Manuais'],
              ].map(([key, label]) => (
                <label key={key}>
                  <input type="checkbox" checked={Boolean((draftFilters as Record<string, unknown>)[key])} onChange={(event) => setDraftFilters((current) => ({ ...current, [key]: event.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
            <div className="order-filter-actions">
              <Button onClick={() => { setDraftFilters({ page: 1, limit: 10, period: 'last30' }); setFilters({ page: 1, limit: 10, period: 'last30' }); }}>Limpar filtros</Button>
              <Button tone="primary" onClick={() => { const next = { ...draftFilters, page: 1 }; setFilters(next); }}>Aplicar filtros</Button>
            </div>
          </Card>

          <Card title="Listagem de pedidos" eyebrow={`${listData?.pagination.total || 0} registros`}>
            {loading ? (
              <div className="orders-loading">Carregando pedidos...</div>
            ) : !listData?.items?.length ? (
              <div className="orders-empty">{Object.keys(cleanFilters(filters)).length > 3 ? 'Nenhum pedido corresponde aos filtros selecionados.' : 'Nenhum pedido encontrado.'}</div>
            ) : (
              <>
                <Table>
                  <table>
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Cliente</th>
                        <th>Canal</th>
                        <th>Status</th>
                        <th>Pagamento</th>
                        <th>Fiscal</th>
                        <th>Estoque</th>
                        <th>Envio</th>
                        <th>Total</th>
                        <th>Itens</th>
                        <th>Criado em</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listData.items.map((order) => {
                        const customer = order.customerSnapshot || order.customer || {};
                        return (
                          <tr key={order.id}>
                            <td><strong>{order.orderNumber}</strong><small>{order.externalOrderId || order.id}</small></td>
                            <td><strong>{String(customer.name || 'Cliente nao informado')}</strong><small>{String(customer.email || customer.phone || '')}</small></td>
                            <td>{order.marketplace || order.channel || 'manual'}</td>
                            <td><Badge tone={statusTone(order.status)}>{labelize(order.status)}</Badge></td>
                            <td><Badge tone={statusTone(order.paymentStatus)}>{labelize(order.paymentStatus)}</Badge></td>
                            <td><Badge tone={statusTone(order.fiscalStatus)}>{labelize(order.fiscalStatus)}</Badge></td>
                            <td><Badge tone={statusTone(order.stockStatus)}>{labelize(order.stockStatus)}</Badge></td>
                            <td><Badge tone={statusTone(order.shippingStatus)}>{labelize(order.shippingStatus)}</Badge></td>
                            <td>{money(order.total)}</td>
                            <td>{order.items.length}</td>
                            <td>{dateText(order.createdAt)}</td>
                            <td>
                              <div className="order-row-actions">
                                <Button onClick={() => loadDetails(order.id)}>Detalhes</Button>
                                {can('editar_pedidos') && <Button onClick={() => startEdit(order)}>Editar</Button>}
                                {can('alterar_status_pedido') && <Button onClick={() => setStatusModal({ order, status: order.status, reason: '' })}>Status</Button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Table>
                <div className="order-pagination">
                  <span>Pagina {listData.pagination.page} de {listData.pagination.totalPages}</span>
                  <div>
                    <Button disabled={!listData.pagination.hasPreviousPage} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, Number(current.page || 1) - 1) }))}>Anterior</Button>
                    <Button disabled={!listData.pagination.hasNextPage} onClick={() => setFilters((current) => ({ ...current, page: Number(current.page || 1) + 1 }))}>Proxima</Button>
                  </div>
                </div>
              </>
            )}
          </Card>

          {Boolean(listData?.alerts?.length) && (
            <Card title="Alertas operacionais" eyebrow="Pedidos que precisam de atencao">
              <div className="order-alert-list">
                {listData?.alerts?.map((alert) => (
                  <div key={`${alert.orderId}-${alert.type}`} className="order-alert-item">
                    <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
                    <span>{alert.description}</span>
                    <Button onClick={() => loadDetails(alert.orderId)}>Abrir</Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {(view === 'create' || view === 'edit') && (
        <OrderForm
          mode={view}
          draft={formData}
          can={can}
          saving={saving}
          onChange={setFormData}
          onSubmit={submitForm}
          onCancel={() => setView('list')}
        />
      )}

      {view === 'details' && details && (
        <OrderDetailsView
          details={details}
          activeTab={activeTab}
          onTab={setActiveTab}
          can={can}
          saving={saving}
          onBack={() => setView('list')}
          onEdit={() => startEdit(details.order)}
          onRefresh={refreshDetails}
          onOpenFiscalSettings={onOpenFiscalSettings}
          onOpenCustomers={onOpenCustomers}
          onOpenProducts={onOpenProducts}
          onStatus={() => setStatusModal({ order: details.order, status: details.order.status, reason: '' })}
          onCancel={() => setCancelModal({ order: details.order, reason: '', refundPayment: false, releaseStock: true, cancelInvoice: false })}
          onPayment={() => setPaymentModal({ order: details.order, amount: details.order.total, reason: 'Confirmacao manual', method: details.order.paymentMethod || 'manual' })}
          onRefund={() => setRefundModal({ order: details.order, amount: Math.max(0, details.order.paidTotal - details.order.refundedTotal), reason: '' })}
          onShipping={() => setShippingModal({ order: details.order, carrier: '', trackingCode: '', status: 'enviado', trackingUrl: '', estimatedDeliveryAt: '' })}
          onNote={() => setNoteModal({ order: details.order, note: '', type: 'geral', isPinned: false })}
          onStock={(action) => runAction('Operacao de estoque processada.', () => orderManagementApi.stockMovement(details.order.id, action, tenantId))}
          onIssueInvoice={() => runAction('Solicitacao de emissao fiscal enviada.', () => adminUnifiedApi.issueInvoice(details.order.id, { type: 'nfe', idempotencyKey: `invoice_${details.order.id}_${Date.now()}` }, tenantId))}
        />
      )}

      <Modal open={Boolean(statusModal)} title="Alterar status do pedido" onClose={() => setStatusModal(null)}>
        {statusModal && (
          <div className="order-modal-form">
            <label>Status
              <Dropdown value={statusModal.status} onChange={(event) => setStatusModal((current) => current && { ...current, status: event.target.value as OrderStatus })}>
                {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </Dropdown>
            </label>
            <label>Motivo
              <Input value={statusModal.reason} onChange={(event) => setStatusModal((current) => current && { ...current, reason: event.target.value })} placeholder="Ex.: pagamento confirmado, pedido separado" />
            </label>
            <div className="order-form-actions">
              <Button onClick={() => setStatusModal(null)}>Cancelar</Button>
              <Button tone="primary" disabled={saving} onClick={() => {
                const modal = statusModal;
                setStatusModal(null);
                runAction('Status atualizado.', () => orderManagementApi.status(modal.order.id, { status: modal.status, reason: modal.reason }, tenantId));
              }}>Salvar</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(cancelModal)} title="Cancelar pedido" onClose={() => setCancelModal(null)}>
        {cancelModal && (
          <div className="order-modal-form">
            <label>Motivo obrigatório
              <Input value={cancelModal.reason} onChange={(event) => setCancelModal((current) => current && { ...current, reason: event.target.value })} />
            </label>
            <label><input type="checkbox" checked={cancelModal.refundPayment} onChange={(event) => setCancelModal((current) => current && { ...current, refundPayment: event.target.checked })} /> Reembolsar pagamento</label>
            <label><input type="checkbox" checked={cancelModal.releaseStock} onChange={(event) => setCancelModal((current) => current && { ...current, releaseStock: event.target.checked })} /> Liberar estoque</label>
            <label><input type="checkbox" checked={cancelModal.cancelInvoice} onChange={(event) => setCancelModal((current) => current && { ...current, cancelInvoice: event.target.checked })} /> Cancelar nota fiscal, se aplicavel</label>
            <div className="order-form-actions">
              <Button onClick={() => setCancelModal(null)}>Voltar</Button>
              <Button tone="danger" disabled={saving || !cancelModal.reason.trim()} onClick={() => {
                const modal = cancelModal;
                setCancelModal(null);
                runAction('Pedido cancelado.', () => orderManagementApi.cancel(modal.order.id, {
                  reason: modal.reason,
                  refundPayment: modal.refundPayment,
                  releaseStock: modal.releaseStock,
                  cancelInvoice: modal.cancelInvoice,
                  idempotencyKey: `cancel_${modal.order.id}_${Date.now()}`,
                }, tenantId));
              }}>Cancelar pedido</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(paymentModal.order?.id)} title="Confirmar pagamento manual" onClose={() => setPaymentModal({ order: {} as OrderRecord, amount: 0, reason: '', method: 'manual' })}>
        {paymentModal.order?.id && (
          <div className="order-modal-form">
            <label>Metodo<Input value={paymentModal.method} onChange={(event) => setPaymentModal((current) => ({ ...current, method: event.target.value }))} /></label>
            <label>Valor<Input type="number" value={paymentModal.amount} onChange={(event) => setPaymentModal((current) => ({ ...current, amount: Number(event.target.value) }))} /></label>
            <label>Motivo<Input value={paymentModal.reason} onChange={(event) => setPaymentModal((current) => ({ ...current, reason: event.target.value }))} /></label>
            <div className="order-form-actions">
              <Button onClick={() => setPaymentModal({ order: {} as OrderRecord, amount: 0, reason: '', method: 'manual' })}>Cancelar</Button>
              <Button tone="primary" disabled={saving || !paymentModal.reason.trim()} onClick={() => {
                const modal = paymentModal;
                setPaymentModal({ order: {} as OrderRecord, amount: 0, reason: '', method: 'manual' });
                runAction('Pagamento confirmado.', () => orderManagementApi.confirmPayment(modal.order.id, { method: modal.method, amount: modal.amount, reason: modal.reason }, tenantId));
              }}>Confirmar pagamento</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(refundModal)} title="Reembolso" onClose={() => setRefundModal(null)}>
        {refundModal && (
          <div className="order-modal-form">
            <label>Valor<Input type="number" value={refundModal.amount} onChange={(event) => setRefundModal((current) => current && { ...current, amount: Number(event.target.value) })} /></label>
            <label>Motivo<Input value={refundModal.reason} onChange={(event) => setRefundModal((current) => current && { ...current, reason: event.target.value })} /></label>
            <div className="order-form-actions">
              <Button onClick={() => setRefundModal(null)}>Cancelar</Button>
              <Button tone="danger" disabled={saving || refundModal.amount <= 0 || !refundModal.reason.trim()} onClick={() => {
                const modal = refundModal;
                setRefundModal(null);
                runAction('Reembolso processado.', () => orderManagementApi.refund(modal.order.id, { amount: modal.amount, reason: modal.reason }, tenantId));
              }}>Reembolsar</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(shippingModal)} title="Envio e rastreio" onClose={() => setShippingModal(null)}>
        {shippingModal && (
          <div className="order-modal-form">
            <label>Transportadora<Input value={shippingModal.carrier} onChange={(event) => setShippingModal((current) => current && { ...current, carrier: event.target.value })} /></label>
            <label>Codigo de rastreio<Input value={shippingModal.trackingCode} onChange={(event) => setShippingModal((current) => current && { ...current, trackingCode: event.target.value })} /></label>
            <label>Status<Dropdown value={shippingModal.status} onChange={(event) => setShippingModal((current) => current && { ...current, status: event.target.value })}><option value="enviado">Enviado</option><option value="em_transito">Em transito</option><option value="saiu_para_entrega">Saiu para entrega</option><option value="entregue">Entregue</option><option value="atrasado">Atrasado</option><option value="falha_entrega">Falha de entrega</option></Dropdown></label>
            <label>URL de rastreio<Input value={shippingModal.trackingUrl} onChange={(event) => setShippingModal((current) => current && { ...current, trackingUrl: event.target.value })} /></label>
            <label>Previsao de entrega<Input type="date" value={shippingModal.estimatedDeliveryAt} onChange={(event) => setShippingModal((current) => current && { ...current, estimatedDeliveryAt: event.target.value })} /></label>
            <div className="order-form-actions">
              <Button onClick={() => setShippingModal(null)}>Cancelar</Button>
              <Button tone="primary" disabled={saving || !shippingModal.carrier || !shippingModal.trackingCode} onClick={() => {
                const modal = shippingModal;
                setShippingModal(null);
                runAction('Rastreio salvo.', () => orderManagementApi.saveShipping(modal.order.id, modal, tenantId));
              }}>Salvar rastreio</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(noteModal)} title="Observacao interna" onClose={() => setNoteModal(null)}>
        {noteModal && (
          <div className="order-modal-form">
            <label>Tipo<Dropdown value={noteModal.type} onChange={(event) => setNoteModal((current) => current && { ...current, type: event.target.value as OrderNoteType })}><option value="geral">Geral</option><option value="atendimento">Atendimento</option><option value="financeiro">Financeiro</option><option value="estoque">Estoque</option><option value="fiscal">Fiscal</option><option value="envio">Envio</option><option value="risco">Risco</option></Dropdown></label>
            <label>Texto<textarea value={noteModal.note} onChange={(event) => setNoteModal((current) => current && { ...current, note: event.target.value })} /></label>
            <label><input type="checkbox" checked={noteModal.isPinned} onChange={(event) => setNoteModal((current) => current && { ...current, isPinned: event.target.checked })} /> Fixar observacao</label>
            <div className="order-form-actions">
              <Button onClick={() => setNoteModal(null)}>Cancelar</Button>
              <Button tone="primary" disabled={saving || !noteModal.note.trim()} onClick={() => {
                const modal = noteModal;
                setNoteModal(null);
                runAction('Observacao adicionada.', () => orderManagementApi.addNote(modal.order.id, { note: modal.note, type: modal.type, isPinned: modal.isPinned, visibility: 'interna' }, tenantId));
              }}>Salvar observacao</Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

type OrderNoteType = 'geral' | 'atendimento' | 'financeiro' | 'estoque' | 'fiscal' | 'envio' | 'risco';

function OrderForm({
  mode,
  draft,
  can,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  draft: OrderDraft;
  can: (permission: string) => boolean;
  saving: boolean;
  onChange: (draft: OrderDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const update = (key: keyof OrderDraft, value: OrderDraft[keyof OrderDraft]) => onChange({ ...draft, [key]: value });
  const updateItem = (index: number, key: keyof OrderItemRecord, value: unknown) => {
    const next = draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
    update('items', next);
  };
  const subtotal = draft.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const total = Math.max(0, subtotal - Number(draft.discountTotal || 0) + Number(draft.shippingTotal || 0) + Number(draft.taxTotal || 0) + Number(draft.feeTotal || 0));
  const canSubmit = draft.customerName.trim() && draft.items.every((item) => String(item.sku || '').trim() && String(item.name || '').trim() && Number(item.quantity || 0) > 0);

  return (
    <Card title={mode === 'edit' ? 'Editar pedido' : 'Novo pedido'} eyebrow="Totais recalculados no backend">
      <div className="order-form-grid">
        <label>Cliente existente ID<Input value={draft.customerId || ''} onChange={(event) => update('customerId', event.target.value || undefined)} /></label>
        <label>Nome do cliente<Input value={draft.customerName} onChange={(event) => update('customerName', event.target.value)} /></label>
        <label>E-mail<Input value={draft.customerEmail} onChange={(event) => update('customerEmail', event.target.value)} /></label>
        <label>Telefone<Input value={draft.customerPhone} onChange={(event) => update('customerPhone', event.target.value)} /></label>
        <label>CPF/CNPJ<Input value={draft.customerDocument} onChange={(event) => update('customerDocument', event.target.value)} /></label>
        <label>Canal<Input value={draft.channel} onChange={(event) => update('channel', event.target.value)} /></label>
        <label>Marketplace<Input value={draft.marketplace} onChange={(event) => update('marketplace', event.target.value)} /></label>
        <label>ID externo<Input value={draft.externalOrderId} onChange={(event) => update('externalOrderId', event.target.value)} /></label>
        <label>Pagamento<Input value={draft.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value)} /></label>
        <label>Metodo de envio<Input value={draft.shippingMethod} onChange={(event) => update('shippingMethod', event.target.value)} /></label>
        <label>Desconto<Input type="number" value={draft.discountTotal} onChange={(event) => update('discountTotal', Number(event.target.value))} /></label>
        <label>Frete<Input type="number" value={draft.shippingTotal} onChange={(event) => update('shippingTotal', Number(event.target.value))} /></label>
        <label>Taxas<Input type="number" value={draft.feeTotal} onChange={(event) => update('feeTotal', Number(event.target.value))} /></label>
        <label>Impostos<Input type="number" value={draft.taxTotal} onChange={(event) => update('taxTotal', Number(event.target.value))} /></label>
        <label className="order-form-wide">Observacoes internas<Input value={draft.notes} onChange={(event) => update('notes', event.target.value)} /></label>
      </div>

      <div className="order-items-editor">
        <header>
          <strong>Produtos</strong>
          <Button onClick={() => update('items', [...draft.items, { sku: '', name: '', quantity: 1, unitPrice: 0, discountTotal: 0, taxTotal: 0 }])}>Adicionar item</Button>
        </header>
        {draft.items.map((item, index) => (
          <div className="order-item-row" key={`${index}-${item.id || item.sku}`}>
            <Input placeholder="Produto ID" value={item.productId || ''} onChange={(event) => updateItem(index, 'productId', event.target.value)} />
            <Input placeholder="SKU" value={item.sku || ''} onChange={(event) => updateItem(index, 'sku', event.target.value)} />
            <Input placeholder="Produto" value={item.name || ''} onChange={(event) => updateItem(index, 'name', event.target.value)} />
            <Input type="number" placeholder="Qtd" value={item.quantity || 1} onChange={(event) => updateItem(index, 'quantity', Number(event.target.value))} />
            <Input type="number" placeholder="Preco" value={item.unitPrice || 0} onChange={(event) => updateItem(index, 'unitPrice', Number(event.target.value))} />
            {can('visualizar_custo_produto') && <Input type="number" placeholder="Custo" value={item.costPrice ?? ''} onChange={(event) => updateItem(index, 'costPrice', event.target.value ? Number(event.target.value) : null)} />}
            <Button disabled={draft.items.length <= 1} onClick={() => update('items', draft.items.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
          </div>
        ))}
      </div>

      <div className="order-form-total">
        <span>Subtotal: {money(subtotal)}</span>
        <strong>Total estimado: {money(total)}</strong>
        <small>O valor final sempre sera recalculado e persistido pelo backend.</small>
      </div>

      <div className="order-form-actions">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button tone="primary" onClick={onSubmit} disabled={saving || !canSubmit || (mode === 'edit' && !can('editar_pedidos'))}>{saving ? 'Salvando...' : 'Salvar pedido'}</Button>
      </div>
    </Card>
  );
}

function OrderDetailsView({
  details,
  activeTab,
  onTab,
  can,
  saving,
  onBack,
  onEdit,
  onRefresh,
  onOpenFiscalSettings,
  onOpenCustomers,
  onOpenProducts,
  onStatus,
  onCancel,
  onPayment,
  onRefund,
  onShipping,
  onNote,
  onStock,
  onIssueInvoice,
}: {
  details: OrderDetails;
  activeTab: string;
  onTab: (tab: string) => void;
  can: (permission: string) => boolean;
  saving: boolean;
  onBack: () => void;
  onEdit: () => void;
  onRefresh: () => void;
  onOpenFiscalSettings?: () => void;
  onOpenCustomers?: () => void;
  onOpenProducts?: () => void;
  onStatus: () => void;
  onCancel: () => void;
  onPayment: () => void;
  onRefund: () => void;
  onShipping: () => void;
  onNote: () => void;
  onStock: (action: 'reserve' | 'release' | 'decrease' | 'revert') => void;
  onIssueInvoice: () => void;
}) {
  const order = details.order;
  const customer = order.customerSnapshot || order.customer || details.customer || {};
  return (
    <div className="order-details">
      <Card>
        <div className="order-profile-head">
          <div className="order-avatar">#{order.orderNumber.replace(/\D/g, '').slice(-2) || 'PD'}</div>
          <div>
            <span className="orders-eyebrow">Pedido</span>
            <h2>{order.orderNumber}</h2>
            <p>{String(customer.name || 'Cliente nao informado')} · {order.channel || 'manual'} · {money(order.total)}</p>
            <div className="order-row-badges">
              <Badge tone={statusTone(order.status)}>{labelize(order.status)}</Badge>
              <Badge tone={statusTone(order.paymentStatus)}>Pagamento {labelize(order.paymentStatus)}</Badge>
              <Badge tone={statusTone(order.stockStatus)}>Estoque {labelize(order.stockStatus)}</Badge>
              <Badge tone={statusTone(order.fiscalStatus)}>Fiscal {labelize(order.fiscalStatus)}</Badge>
              <Badge tone={statusTone(order.shippingStatus)}>Envio {labelize(order.shippingStatus)}</Badge>
            </div>
          </div>
          <div className="orders-actions">
            <Button onClick={onBack}>Voltar</Button>
            <Button onClick={onRefresh}>Atualizar</Button>
            {can('editar_pedidos') && <Button onClick={onEdit}>Editar</Button>}
            {can('alterar_status_pedido') && <Button onClick={onStatus}>Alterar status</Button>}
            {can('cancelar_pedidos') && <Button tone="danger" onClick={onCancel}>Cancelar</Button>}
          </div>
        </div>
      </Card>

      <div className="orders-kpis">
        <Card className="order-kpi"><span>Total</span><strong>{money(order.total)}</strong></Card>
        <Card className="order-kpi"><span>Itens</span><strong>{order.items.length}</strong></Card>
        <Card className="order-kpi"><span>Pago</span><strong>{money(order.paidTotal)}</strong></Card>
        <Card className="order-kpi"><span>Reembolsado</span><strong>{money(order.refundedTotal)}</strong></Card>
        <Card className="order-kpi"><span>Criado em</span><strong>{dateText(order.createdAt)}</strong></Card>
      </div>

      {details.alerts.length > 0 && (
        <Card title="Alertas do pedido" eyebrow="Operacional">
          <div className="order-alert-list">
            {details.alerts.map((alert) => (
              <div key={`${alert.type}-${alert.description}`} className="order-alert-item">
                <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
                <span><strong>{alert.description}</strong> {alert.recommendation}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <Tabs tabs={orderTabs} active={activeTab} onChange={onTab} />
        <div className="order-tab-panel">
          {activeTab === 'overview' && <OverviewTab details={details} onPayment={onPayment} onRefund={onRefund} onStock={onStock} onIssueInvoice={onIssueInvoice} onShipping={onShipping} can={can} saving={saving} />}
          {activeTab === 'customer' && <CustomerTab order={order} customer={details.customer || customer} onOpenCustomers={onOpenCustomers} />}
          {activeTab === 'items' && <ItemsTab items={order.items} can={can} onOpenProducts={onOpenProducts} />}
          {activeTab === 'payment' && <PaymentTab details={details} onPayment={onPayment} onRefund={onRefund} can={can} />}
          {activeTab === 'stock' && <StockTab stock={details.stock} onStock={onStock} can={can} />}
          {activeTab === 'invoice' && <InvoiceTab order={order} invoice={details.invoice} onIssueInvoice={onIssueInvoice} onOpenFiscalSettings={onOpenFiscalSettings} can={can} />}
          {activeTab === 'shipping' && <ShippingTab details={details} onShipping={onShipping} can={can} />}
          {activeTab === 'history' && <HistoryTab details={details} />}
          {activeTab === 'notes' && <NotesTab details={details} onNote={onNote} can={can} />}
          {activeTab === 'audit' && <AuditTab details={details} can={can} />}
        </div>
      </Card>
    </div>
  );
}

function OverviewTab({
  details,
  onPayment,
  onRefund,
  onStock,
  onIssueInvoice,
  onShipping,
  can,
  saving,
}: {
  details: OrderDetails;
  onPayment: () => void;
  onRefund: () => void;
  onStock: (action: 'reserve' | 'release' | 'decrease' | 'revert') => void;
  onIssueInvoice: () => void;
  onShipping: () => void;
  can: (permission: string) => boolean;
  saving: boolean;
}) {
  const order = details.order;
  return (
    <div className="order-stack">
      <KeyValueGrid rows={[
        ['Numero', order.orderNumber],
        ['Status principal', labelize(order.status)],
        ['Metodo de pagamento', order.paymentMethod || 'Nao informado'],
        ['Metodo de envio', order.shippingMethod || 'Nao informado'],
        ['Subtotal', money(order.subtotal)],
        ['Descontos', money(order.discountTotal)],
        ['Frete', money(order.shippingTotal)],
        ['Taxas', money(order.feeTotal)],
        ['Total final', money(order.total)],
        ['Criado em', dateText(order.createdAt)],
        ['Pago em', dateText(order.paidAt)],
        ['Enviado em', dateText(order.shippedAt)],
        ['Entregue em', dateText(order.deliveredAt)],
      ]} />
      <div className="order-row-actions">
        {can('confirmar_pagamento_manual') && <Button onClick={onPayment} disabled={saving}>Confirmar pagamento</Button>}
        {can('reembolsar_pedido') && <Button onClick={onRefund} disabled={saving}>Reembolsar</Button>}
        {can('reservar_estoque_pedido') && <Button onClick={() => onStock('reserve')} disabled={saving}>Reservar estoque</Button>}
        {can('baixar_estoque_pedido') && <Button onClick={() => onStock('decrease')} disabled={saving}>Baixar estoque</Button>}
        {can('emitir_nota_fiscal_pedido') && <Button onClick={onIssueInvoice} disabled={saving}>Emitir nota fiscal</Button>}
        {can('atualizar_rastreio_pedido') && <Button onClick={onShipping} disabled={saving}>Adicionar rastreio</Button>}
      </div>
    </div>
  );
}

function CustomerTab({ order, customer, onOpenCustomers }: { order: OrderRecord; customer?: Record<string, any> | null; onOpenCustomers?: () => void }) {
  return (
    <div className="order-stack">
      <KeyValueGrid rows={[
        ['Cliente', String(customer?.name || order.customerSnapshot?.name || 'Nao informado')],
        ['CPF/CNPJ', String(customer?.document || customer?.taxId || customer?.cpfCnpj || 'Mascarado/nao informado')],
        ['E-mail', String(customer?.email || 'Mascarado/nao informado')],
        ['Telefone', String(customer?.phone || 'Mascarado/nao informado')],
        ['Cidade/UF', `${String(customer?.city || '')}/${String(customer?.state || '')}`],
        ['Cliente ID', order.customerId || 'Nao vinculado'],
      ]} />
      {onOpenCustomers && <Button onClick={onOpenCustomers}>Abrir Clientes</Button>}
    </div>
  );
}

function ItemsTab({ items, can, onOpenProducts }: { items: OrderItemRecord[]; can: (permission: string) => boolean; onOpenProducts?: () => void }) {
  return (
    <div className="order-stack">
      <Table>
        <table>
          <thead><tr><th>Produto</th><th>SKU</th><th>Qtd</th><th>Preco</th><th>Desconto</th><th>Total</th>{can('visualizar_custo_produto') && <th>Custo</th>}<th>Estoque</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong><small>{item.productId || 'Sem product_id vinculado'}</small></td>
                <td>{item.sku}</td>
                <td>{item.quantity}</td>
                <td>{money(item.unitPrice)}</td>
                <td>{money(item.discountTotal)}</td>
                <td>{money(item.totalPrice)}</td>
                {can('visualizar_custo_produto') && <td>{item.costPrice === null || item.costPrice === undefined ? 'Restrito' : money(item.costPrice)}</td>}
                <td>Reservado {item.stockReservedQuantity || 0} · Baixado {item.stockDecreasedQuantity || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Table>
      {onOpenProducts && <Button onClick={onOpenProducts}>Abrir Produtos</Button>}
    </div>
  );
}

function PaymentTab({ details, onPayment, onRefund, can }: { details: OrderDetails; onPayment: () => void; onRefund: () => void; can: (permission: string) => boolean }) {
  return (
    <div className="order-stack">
      <KeyValueGrid rows={[
        ['Status', labelize(details.order.paymentStatus)],
        ['Total bruto', money(details.order.total)],
        ['Total pago', money(details.order.paidTotal)],
        ['Reembolsado', money(details.order.refundedTotal)],
        ['Liquido', money(details.order.netTotal)],
      ]} />
      <div className="order-row-actions">
        {can('confirmar_pagamento_manual') && <Button onClick={onPayment}>Marcar como pago</Button>}
        {can('reembolsar_pedido') && <Button tone="danger" onClick={onRefund}>Reembolsar</Button>}
      </div>
      <Table>
        <table>
          <thead><tr><th>Data</th><th>Metodo</th><th>Provedor</th><th>Status</th><th>Bruto</th><th>Liquido</th><th>ID externo</th></tr></thead>
          <tbody>
            {details.payments.map((payment) => (
              <tr key={payment.id}><td>{dateText(payment.createdAt)}</td><td>{payment.method}</td><td>{payment.provider || 'manual'}</td><td><Badge tone={statusTone(payment.status)}>{labelize(payment.status)}</Badge></td><td>{money(payment.grossAmount)}</td><td>{money(payment.netAmount)}</td><td>{payment.externalPaymentId || '-'}</td></tr>
            ))}
            {!details.payments.length && <tr><td colSpan={7}>Nenhum pagamento registrado.</td></tr>}
          </tbody>
        </table>
      </Table>
    </div>
  );
}

function StockTab({ stock, onStock, can }: { stock: OrderDetails['stock']; onStock: (action: 'reserve' | 'release' | 'decrease' | 'revert') => void; can: (permission: string) => boolean }) {
  return (
    <div className="order-stack">
      <div className="order-row-actions">
        {can('reservar_estoque_pedido') && <Button onClick={() => onStock('reserve')}>Reservar</Button>}
        {can('reservar_estoque_pedido') && <Button onClick={() => onStock('release')}>Liberar reserva</Button>}
        {can('baixar_estoque_pedido') && <Button onClick={() => onStock('decrease')}>Baixar</Button>}
        {can('baixar_estoque_pedido') && <Button onClick={() => onStock('revert')}>Estornar</Button>}
      </div>
      <Table>
        <table>
          <thead><tr><th>Produto</th><th>SKU</th><th>Solicitado</th><th>Disponivel</th><th>Reservado</th><th>Minimo</th><th>Status</th></tr></thead>
          <tbody>
            {stock.items.map((item) => (
              <tr key={`${item.productId}-${item.sku}`}><td>{item.name || item.productId}</td><td>{item.sku}</td><td>{item.requested}</td><td>{item.available}</td><td>{item.reserved}</td><td>{item.minimumStock}</td><td><Badge tone={item.ok ? 'success' : 'danger'}>{item.ok ? 'Disponivel' : 'Insuficiente'}</Badge></td></tr>
            ))}
            {!stock.items.length && <tr><td colSpan={7}>Estoque nao controlado ou dados insuficientes para verificacao.</td></tr>}
          </tbody>
        </table>
      </Table>
    </div>
  );
}

function InvoiceTab({ order, invoice, onIssueInvoice, onOpenFiscalSettings, can }: { order: OrderRecord; invoice?: Record<string, any> | null; onIssueInvoice: () => void; onOpenFiscalSettings?: () => void; can: (permission: string) => boolean }) {
  return (
    <div className="order-stack">
      <KeyValueGrid rows={[
        ['Status fiscal do pedido', labelize(order.fiscalStatus)],
        ['Status da nota', String(invoice?.status || 'Sem nota emitida')],
        ['Numero', String(invoice?.number || invoice?.invoiceNumber || 'Nao informado')],
        ['Serie', String(invoice?.series || 'Nao informada')],
        ['Chave de acesso', String(invoice?.accessKey || 'Nao informada')],
        ['Protocolo', String(invoice?.protocol || 'Nao informado')],
        ['Emitida em', dateText(String(invoice?.issuedAt || ''))],
        ['Motivo rejeicao', String(invoice?.rejectionReason || invoice?.errorMessage || 'Nenhum')],
      ]} />
      <div className="order-row-actions">
        {can('emitir_nota_fiscal_pedido') && <Button tone="primary" onClick={onIssueInvoice}>Emitir nota fiscal</Button>}
        {onOpenFiscalSettings && <Button onClick={onOpenFiscalSettings}>Configurar fiscal</Button>}
      </div>
    </div>
  );
}

function ShippingTab({ details, onShipping, can }: { details: OrderDetails; onShipping: () => void; can: (permission: string) => boolean }) {
  return (
    <div className="order-stack">
      {can('atualizar_rastreio_pedido') && <Button onClick={onShipping}>Adicionar rastreio</Button>}
      <Table>
        <table>
          <thead><tr><th>Transportadora</th><th>Metodo</th><th>Codigo</th><th>Status</th><th>Postado em</th><th>Previsao</th><th>Link</th></tr></thead>
          <tbody>
            {details.shipments.map((shipment) => (
              <tr key={shipment.id}><td>{shipment.carrier}</td><td>{shipment.shippingMethod || '-'}</td><td>{shipment.trackingCode}</td><td><Badge tone={statusTone(shipment.status)}>{labelize(shipment.status)}</Badge></td><td>{dateText(shipment.postedAt)}</td><td>{dateText(shipment.estimatedDeliveryAt)}</td><td>{shipment.trackingUrl ? <a href={shipment.trackingUrl} target="_blank" rel="noreferrer">Abrir</a> : '-'}</td></tr>
            ))}
            {!details.shipments.length && <tr><td colSpan={7}>Nenhum envio registrado.</td></tr>}
          </tbody>
        </table>
      </Table>
      <Timeline rows={details.trackingEvents.map((event) => ({ date: event.eventDate, title: event.status, description: `${event.description || ''} ${event.location || ''}` }))} />
    </div>
  );
}

function HistoryTab({ details }: { details: OrderDetails }) {
  return <Timeline rows={details.history.map((event) => ({ date: event.createdAt, title: event.action, description: event.description }))} />;
}

function NotesTab({ details, onNote, can }: { details: OrderDetails; onNote: () => void; can: (permission: string) => boolean }) {
  return (
    <div className="order-stack">
      {can('gerenciar_observacoes_pedido') && <Button onClick={onNote}>Adicionar observacao</Button>}
      <div className="order-notes">
        {details.notes.map((note) => (
          <div key={note.id} className="order-note">
            <Badge tone={note.isPinned ? 'warning' : 'default'}>{note.type}</Badge>
            <p>{note.note}</p>
            <small>{dateText(note.createdAt)} · {note.visibility}</small>
          </div>
        ))}
        {!details.notes.length && <div className="orders-empty">Nenhuma observacao interna.</div>}
      </div>
    </div>
  );
}

function AuditTab({ details, can }: { details: OrderDetails; can: (permission: string) => boolean }) {
  if (!can('visualizar_logs_pedido')) {
    return <div className="orders-empty">Voce nao possui permissao para visualizar logs deste pedido.</div>;
  }
  return (
    <Table>
      <table>
        <thead><tr><th>Data</th><th>Acao</th><th>Ator</th><th>Resultado</th><th>Descricao</th></tr></thead>
        <tbody>
          {details.auditLogs.map((log) => (
            <tr key={String(log.id)}><td>{dateText(String(log.created_at || log.createdAt || ''))}</td><td>{String(log.action || '')}</td><td>{String(log.actor_name || log.actor_id || '')}</td><td><Badge tone={statusTone(String(log.outcome || 'success'))}>{String(log.outcome || 'success')}</Badge></td><td>{String(log.description || '')}</td></tr>
          ))}
          {!details.auditLogs.length && <tr><td colSpan={5}>Nenhum log encontrado para este pedido.</td></tr>}
        </tbody>
      </table>
    </Table>
  );
}

function KeyValueGrid({ rows }: { rows: Array<[string, string | number]> }) {
  return (
    <div className="order-key-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Timeline({ rows }: { rows: Array<{ date?: string; title: string; description?: string }> }) {
  if (!rows.length) return <div className="orders-empty">Nenhum evento registrado.</div>;
  return (
    <div className="order-timeline">
      {rows.map((row, index) => (
        <div key={`${row.title}-${index}`}>
          <span>{dateText(row.date)}</span>
          <strong>{row.title}</strong>
          <p>{row.description || 'Sem detalhes adicionais.'}</p>
        </div>
      ))}
    </div>
  );
}
