import { useEffect, useMemo, useState } from 'react';
import { adminUnifiedApi, OrderDetailsData, TaxDocument } from '../apiClient';
import '../styles/OrderDetailsPage.css';

type OrderDetailsPageProps = {
  tenantId: string;
  onOpenFiscalSettings: () => void;
  onChange?: () => void;
};

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function dateTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

function statusText(value?: string) {
  return value || '-';
}

function getCustomerDocument(order: Record<string, any>, customer?: Record<string, any> | null) {
  return (
    order.customer?.document ||
    order.customer?.taxId ||
    order.customer?.cpfCnpj ||
    customer?.document ||
    customer?.taxId ||
    customer?.cpfCnpj ||
    '-'
  );
}

function getAddress(order: Record<string, any>, customer?: Record<string, any> | null) {
  const address = order.shippingAddress || order.deliveryAddress || order.customer?.address || customer?.address;
  if (!address) return '-';
  return [
    address.street || address.logradouro || address.addressStreet,
    address.number || address.numero || address.addressNumber,
    address.neighborhood || address.bairro || address.addressNeighborhood,
    address.city || address.cidade || address.addressCity,
    address.state || address.uf || address.addressState,
    address.zipcode || address.cep || address.addressZipcode,
  ]
    .filter(Boolean)
    .join(', ');
}

function fiscalConfigIsReady(details?: OrderDetailsData | null) {
  const status = details?.fiscalStatus?.status;
  return status === 'homologacao_ativa' || status === 'producao_ativa' || status === 'configurado';
}

export function OrderDetailsPage({ tenantId, onOpenFiscalSettings, onChange }: OrderDetailsPageProps) {
  const [orders, setOrders] = useState<Array<Record<string, any>>>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [details, setDetails] = useState<OrderDetailsData | null>(null);
  const [invoiceType, setInvoiceType] = useState<'nfe' | 'nfce' | 'nfse'>('nfe');
  const [cancelReason, setCancelReason] = useState('Cancelamento solicitado pelo operador.');
  const [trackingForm, setTrackingForm] = useState({
    carrier: '',
    trackingCode: '',
    trackingUrl: '',
    status: 'postado',
    eventDescription: '',
    location: '',
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    const response = await adminUnifiedApi.orders(tenantId);
    if (response.success) {
      const items = Array.isArray(response.data) ? response.data : response.data?.items || [];
      setOrders(items);
      if (!selectedOrderId && items[0]?.id) {
        setSelectedOrderId(items[0].id);
      }
    } else {
      setError(response.error || 'Falha ao carregar pedidos.');
    }
    setLoading(false);
  };

  const loadDetails = async (orderId: string) => {
    if (!orderId) return;
    setBusy(true);
    setError('');
    const response = await adminUnifiedApi.orderDetails(orderId, tenantId);
    if (response.success) {
      setDetails(response.data);
    } else {
      setError(response.error || 'Falha ao carregar pedido.');
      setDetails(null);
    }
    setBusy(false);
  };

  useEffect(() => {
    loadOrders();
  }, [tenantId]);

  useEffect(() => {
    loadDetails(selectedOrderId);
  }, [selectedOrderId, tenantId]);

  const selectedOrder = details?.order;
  const invoice = details?.invoice as TaxDocument | null | undefined;
  const invoiceBlocked = !fiscalConfigIsReady(details);
  const canCancel = invoice?.status === 'autorizada';
  const totalItems = useMemo(
    () => (selectedOrder?.items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
    [selectedOrder]
  );

  const runAction = async (action: () => Promise<any>, okMessage: string) => {
    setBusy(true);
    setError('');
    setSuccess('');
    const response = await action();
    if (response.success) {
      setSuccess(okMessage);
      onChange?.();
      await loadDetails(selectedOrderId);
    } else {
      setError(response.error || 'Operacao nao concluida.');
    }
    setBusy(false);
  };

  const downloadFile = async (kind: 'xml' | 'pdf') => {
    if (!selectedOrderId) return;
    setBusy(true);
    setError('');
    const response = await adminUnifiedApi.downloadInvoiceFile(selectedOrderId, kind, tenantId);
    if (response.success && response.data) {
      const url = URL.createObjectURL(response.data.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.data.fileName;
      link.click();
      URL.revokeObjectURL(url);
      setSuccess(kind === 'xml' ? 'XML baixado.' : 'DANFE baixado.');
    } else {
      setError(response.error || 'Falha ao baixar arquivo.');
    }
    setBusy(false);
  };

  return (
    <div className="order-details-module">
      <aside className="order-list-panel">
        <div className="order-list-head">
          <h3>Pedidos</h3>
          <button type="button" onClick={loadOrders} disabled={loading}>Atualizar</button>
        </div>
        <div className="order-list">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              className={selectedOrderId === order.id ? 'active' : ''}
              onClick={() => setSelectedOrderId(order.id)}
            >
              <strong>{order.number || order.id}</strong>
              <span>{statusText(order.status)} - {money(order.total)}</span>
            </button>
          ))}
          {!orders.length && <div className="order-empty">Sem pedidos.</div>}
        </div>
      </aside>

      <section className="order-workspace">
        {error && <div className="order-alert">{error}</div>}
        {success && <div className="order-success">{success}</div>}
        {busy && <div className="order-state">Processando...</div>}

        {!selectedOrder && !busy ? (
          <div className="order-state">Selecione um pedido.</div>
        ) : selectedOrder ? (
          <>
            <div className="order-summary-grid">
              <article>
                <span>Pedido</span>
                <strong>{selectedOrder.number || selectedOrder.id}</strong>
              </article>
              <article>
                <span>Status</span>
                <strong>{statusText(selectedOrder.status)}</strong>
              </article>
              <article>
                <span>Pagamento</span>
                <strong>{statusText(selectedOrder.paymentStatus || selectedOrder.payment_status)}</strong>
              </article>
              <article>
                <span>Origem</span>
                <strong>{selectedOrder.marketplace || selectedOrder.origin || 'loja_propria'}</strong>
              </article>
              <article>
                <span>Itens</span>
                <strong>{totalItems}</strong>
              </article>
              <article>
                <span>Total</span>
                <strong>{money(selectedOrder.total)}</strong>
              </article>
            </div>

            <div className="order-section-grid">
              <section className="order-panel">
                <div className="order-panel-head">
                  <h3>Cliente</h3>
                </div>
                <dl className="order-data-list">
                  <div><dt>Nome</dt><dd>{selectedOrder.customer?.name || details?.customer?.name || selectedOrder.customerId}</dd></div>
                  <div><dt>CPF/CNPJ</dt><dd>{getCustomerDocument(selectedOrder, details?.customer)}</dd></div>
                  <div><dt>E-mail</dt><dd>{selectedOrder.customer?.email || details?.customer?.email || '-'}</dd></div>
                  <div><dt>Telefone</dt><dd>{selectedOrder.customer?.phone || details?.customer?.phone || '-'}</dd></div>
                  <div><dt>Endereco</dt><dd>{getAddress(selectedOrder, details?.customer)}</dd></div>
                </dl>
              </section>

              <section className="order-panel">
                <div className="order-panel-head">
                  <h3>Pagamento e envio</h3>
                </div>
                <dl className="order-data-list">
                  <div><dt>Forma</dt><dd>{selectedOrder.paymentMethod || '-'}</dd></div>
                  <div><dt>Frete</dt><dd>{money(selectedOrder.shippingCost || selectedOrder.freight)}</dd></div>
                  <div><dt>Desconto</dt><dd>{money(selectedOrder.discount)}</dd></div>
                  <div><dt>Envio</dt><dd>{selectedOrder.shippingStatus || '-'}</dd></div>
                  <div><dt>Criado em</dt><dd>{dateTime(selectedOrder.createdAt)}</dd></div>
                </dl>
              </section>
            </div>

            <section className="order-panel">
              <div className="order-panel-head">
                <h3>Produtos</h3>
              </div>
              <div className="order-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Produto</th>
                      <th>Qtd</th>
                      <th>Unitario</th>
                      <th>Total</th>
                      <th>NCM</th>
                      <th>CFOP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.items || []).map((item: any) => (
                      <tr key={`${item.productId}-${item.sku || item.name}`}>
                        <td>{item.sku || item.productId}</td>
                        <td>{item.name || item.productId}</td>
                        <td>{item.quantity}</td>
                        <td>{money(item.unitPrice || item.price)}</td>
                        <td>{money(item.totalPrice || Number(item.quantity || 0) * Number(item.unitPrice || item.price || 0))}</td>
                        <td>{item.ncm || '-'}</td>
                        <td>{item.cfop || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="order-panel invoice-panel">
              <div className="order-panel-head">
                <h3>Nota Fiscal</h3>
                <span>{invoice?.status || 'sem nota'}</span>
              </div>
              {invoiceBlocked && (
                <div className="order-warning">
                  Configuracao fiscal incompleta. Finalize as configuracoes fiscais da empresa antes de emitir notas fiscais.
                  <button type="button" onClick={onOpenFiscalSettings}>Ir para Configuracoes Fiscais</button>
                </div>
              )}
              <dl className="order-data-list">
                <div><dt>Status fiscal</dt><dd>{selectedOrder.fiscalStatus || invoice?.status || '-'}</dd></div>
                <div><dt>Configuracao</dt><dd>{details?.fiscalStatus?.status || '-'}</dd></div>
                <div><dt>Provedor</dt><dd>{details?.fiscalStatus?.provider || '-'}</dd></div>
                <div><dt>Ambiente</dt><dd>{details?.fiscalStatus?.environment || '-'}</dd></div>
                <div><dt>Serie/numero</dt><dd>{invoice ? `${invoice.series}/${invoice.number}` : '-'}</dd></div>
                <div><dt>Chave</dt><dd>{invoice?.accessKey || '-'}</dd></div>
                <div><dt>Protocolo</dt><dd>{invoice?.protocol || '-'}</dd></div>
                <div><dt>Rejeicao</dt><dd>{invoice?.rejectionReason || '-'}</dd></div>
              </dl>
              <div className="order-actions">
                <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as 'nfe' | 'nfce' | 'nfse')}>
                  <option value="nfe">NF-e</option>
                  <option value="nfce">NFC-e</option>
                  <option value="nfse">NFS-e</option>
                </select>
                <button type="button" disabled={busy || invoiceBlocked} onClick={() => runAction(() => adminUnifiedApi.issueInvoice(selectedOrderId, { type: invoiceType }, tenantId), 'Emissao fiscal iniciada.')}>Emitir Nota Fiscal</button>
                <button type="button" disabled={busy || !invoice} onClick={() => runAction(() => adminUnifiedApi.invoiceStatus(selectedOrderId, tenantId), 'Status fiscal atualizado.')}>Consultar Status</button>
                <button type="button" disabled={busy || !invoice} onClick={() => downloadFile('xml')}>Baixar XML</button>
                <button type="button" disabled={busy || !invoice} onClick={() => downloadFile('pdf')}>Baixar DANFE</button>
                <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} aria-label="Motivo do cancelamento" />
                <button type="button" className="danger" disabled={busy || !canCancel} onClick={() => runAction(() => adminUnifiedApi.cancelInvoice(selectedOrderId, { reason: cancelReason }, tenantId), 'Nota fiscal cancelada.')}>Cancelar Nota</button>
              </div>
            </section>

            <div className="order-section-grid">
              <section className="order-panel">
                <div className="order-panel-head">
                  <h3>Estoque</h3>
                  <span>{details?.stock.available ? 'disponivel' : 'insuficiente'}</span>
                </div>
                <div className="stock-list">
                  {details?.stock.items.map((item) => (
                    <div key={item.productId} className={item.ok ? 'ok' : 'fail'}>
                      <strong>{item.sku || item.productId}</strong>
                      <span>{item.requested} / {item.available}</span>
                    </div>
                  ))}
                </div>
                <div className="order-actions">
                  <button type="button" disabled={busy} onClick={() => runAction(() => adminUnifiedApi.stockMovement(selectedOrderId, 'reserve', { reason: 'Reserva do pedido' }, tenantId), 'Estoque reservado.')}>Reservar</button>
                  <button type="button" disabled={busy} onClick={() => runAction(() => adminUnifiedApi.stockMovement(selectedOrderId, 'decrease', { reason: 'Baixa por faturamento' }, tenantId), 'Estoque baixado.')}>Baixar</button>
                  <button type="button" disabled={busy} onClick={() => runAction(() => adminUnifiedApi.stockMovement(selectedOrderId, 'release', { reason: 'Liberacao de reserva' }, tenantId), 'Reserva liberada.')}>Liberar</button>
                  <button type="button" disabled={busy} onClick={() => runAction(() => adminUnifiedApi.stockMovement(selectedOrderId, 'revert', { reason: 'Estorno operacional' }, tenantId), 'Estoque estornado.')}>Estornar</button>
                </div>
              </section>

              <section className="order-panel">
                <div className="order-panel-head">
                  <h3>Rastreio</h3>
                  <span>{details?.shipments.length || 0}</span>
                </div>
                <div className="tracking-form">
                  <input placeholder="Transportadora" value={trackingForm.carrier} onChange={(e) => setTrackingForm((current) => ({ ...current, carrier: e.target.value }))} />
                  <input placeholder="Codigo" value={trackingForm.trackingCode} onChange={(e) => setTrackingForm((current) => ({ ...current, trackingCode: e.target.value }))} />
                  <input placeholder="URL" value={trackingForm.trackingUrl} onChange={(e) => setTrackingForm((current) => ({ ...current, trackingUrl: e.target.value }))} />
                  <input placeholder="Status" value={trackingForm.status} onChange={(e) => setTrackingForm((current) => ({ ...current, status: e.target.value }))} />
                  <input placeholder="Evento" value={trackingForm.eventDescription} onChange={(e) => setTrackingForm((current) => ({ ...current, eventDescription: e.target.value }))} />
                  <input placeholder="Local" value={trackingForm.location} onChange={(e) => setTrackingForm((current) => ({ ...current, location: e.target.value }))} />
                  <button type="button" disabled={busy} onClick={() => runAction(() => adminUnifiedApi.updateTracking(selectedOrderId, trackingForm, tenantId), 'Rastreio atualizado.')}>Atualizar rastreio</button>
                </div>
                <div className="tracking-list">
                  {details?.shipments.map((shipment) => (
                    <div key={shipment.id}>
                      <strong>{shipment.carrier}</strong>
                      <span>{shipment.trackingCode} - {shipment.status}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="order-section-grid">
              <section className="order-panel">
                <div className="order-panel-head">
                  <h3>Historico</h3>
                </div>
                <div className="timeline-list">
                  {details?.history.map((item) => (
                    <div key={item.id}>
                      <time>{dateTime(item.createdAt)}</time>
                      <strong>{item.action}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="order-panel">
                <div className="order-panel-head">
                  <h3>Logs</h3>
                </div>
                <div className="timeline-list">
                  {details?.logs.map((item) => (
                    <div key={item.id}>
                      <time>{dateTime(item.createdAt)}</time>
                      <strong>{item.action}</strong>
                      <span>{item.errorMessage || item.nextStatus || ''}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
