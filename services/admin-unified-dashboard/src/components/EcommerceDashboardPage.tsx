import { useEffect, useMemo, useState } from 'react';
import {
  DashboardBreakdown,
  DashboardComparison,
  DashboardPeriodPreset,
  DashboardProductRank,
  EcommerceDashboardFilters,
  EcommerceDashboardOverview,
  ecommerceAnalyticsApi,
} from '../apiClient';
import '../styles/EcommerceDashboardPage.css';

type EcommerceDashboardPageProps = {
  tenantId: string;
  onOpenOrders: () => void;
};

const periodOptions: Array<{ value: DashboardPeriodPreset; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last7', label: 'Ultimos 7 dias' },
  { value: 'last15', label: 'Ultimos 15 dias' },
  { value: 'last30', label: 'Ultimos 30 dias' },
  { value: 'thisMonth', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes passado' },
  { value: 'thisYear', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
];

const money = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const number = (value: unknown) => new Intl.NumberFormat('pt-BR').format(Number(value || 0));

const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? 'dados insuficientes' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

function variationClass(comparison?: DashboardComparison) {
  return comparison?.trend || 'insufficient';
}

function valueByType(value: unknown, type: 'money' | 'number' | 'percent' | 'text' = 'number') {
  if (type === 'money') return money(value);
  if (type === 'percent') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? percent(numeric) : 'dados insuficientes';
  }
  if (type === 'text') return String(value || 'dados insuficientes');
  return number(value);
}

function DashboardLoadingSkeleton() {
  return (
    <div className="ecom-dashboard skeleton">
      <div className="skeleton-line wide" />
      <div className="ecom-kpi-grid">
        {Array.from({ length: 12 }).map((_, index) => (
          <div className="skeleton-card" key={index} />
        ))}
      </div>
      <div className="ecom-main-grid">
        <div className="skeleton-panel" />
        <div className="skeleton-panel" />
      </div>
    </div>
  );
}

function EmptyState() {
  return <div className="ecom-empty">Nenhuma venda encontrada para o periodo selecionado.</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="ecom-error">Nao foi possivel carregar os dados da dashboard. {message}</div>;
}

function KpiCard({
  title,
  value,
  type,
  comparison,
  tooltip,
  onClick,
}: {
  title: string;
  value: unknown;
  type?: 'money' | 'number' | 'percent' | 'text';
  comparison?: DashboardComparison;
  tooltip: string;
  onClick?: () => void;
}) {
  return (
    <button className="ecom-kpi-card" type="button" title={tooltip} onClick={onClick}>
      <span>{title}</span>
      <strong>{valueByType(value, type)}</strong>
      <small className={variationClass(comparison)}>
        {comparison ? `${percent(comparison.variationPercent)} vs periodo anterior` : 'sem comparativo'}
      </small>
    </button>
  );
}

function LineChart({ data }: { data: Array<{ label: string; grossRevenue: number; orders: number }> }) {
  const max = Math.max(1, ...data.map((item) => item.grossRevenue));
  const width = 680;
  const height = 220;
  const points = data
    .map((item, index) => {
      const x = data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width;
      const y = height - (item.grossRevenue / max) * (height - 24) - 12;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="ecom-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolucao do faturamento">
        <polyline points={points} fill="none" stroke="var(--chart-color-1)" strokeWidth="3" />
        {data.map((item, index) => {
          const x = data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width;
          const y = height - (item.grossRevenue / max) * (height - 24) - 12;
          return <circle key={item.label} cx={x} cy={y} r="4" fill="var(--chart-color-2)" />;
        })}
      </svg>
      <div className="ecom-chart-labels">
        {data.slice(0, 6).map((item) => (
          <span key={item.label}>{item.label}</span>
        ))}
      </div>
    </div>
  );
}

function BarList({
  rows,
  value,
}: {
  rows: DashboardBreakdown[];
  value: 'grossRevenue' | 'orders' | 'productsSold';
}) {
  const max = Math.max(1, ...rows.map((row) => Number(row[value] || 0)));
  return (
    <div className="ecom-bar-list">
      {rows.slice(0, 10).map((row) => (
        <div key={row.key}>
          <span>{row.label}</span>
          <div>
            <i style={{ width: `${(Number(row[value] || 0) / max) * 100}%` }} />
          </div>
          <strong>{value === 'grossRevenue' ? money(row.grossRevenue) : number(row[value])}</strong>
        </div>
      ))}
      {!rows.length && <small>dados insuficientes</small>}
    </div>
  );
}

function ProductTable({
  rows,
  mode,
}: {
  rows: DashboardProductRank[];
  mode: 'quantity' | 'revenue';
}) {
  return (
    <div className="ecom-table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Produto</th>
            <th>SKU</th>
            <th>Categoria</th>
            <th>Qtd</th>
            <th>Pedidos</th>
            <th>Faturamento</th>
            <th>Preco medio</th>
            <th>Part.</th>
            <th>Var.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.productId}-${row.sku}`}>
              <td>{index + 1}</td>
              <td className="product-cell">
                {row.imageUrl ? <img src={row.imageUrl} alt="" /> : <span className="product-thumb" />}
                <strong>{row.name}</strong>
              </td>
              <td>{row.sku}</td>
              <td>{row.category || '-'}</td>
              <td>{number(row.quantity)}</td>
              <td>{number(row.orders)}</td>
              <td>{money(row.grossRevenue)}</td>
              <td>{money(row.averageSoldPrice)}</td>
              <td>{percent(row.revenueShare)}</td>
              <td>{percent(row.variationPercent)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={10}>Sem produtos no ranking por {mode === 'quantity' ? 'quantidade' : 'faturamento'}.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CustomersTable({ rows }: { rows: Array<Record<string, any>> }) {
  return (
    <div className="ecom-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>E-mail</th>
            <th>Cidade/UF</th>
            <th>Pedidos</th>
            <th>Total gasto</th>
            <th>Ticket medio</th>
            <th>Ultima compra</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.customerId}>
              <td>{row.name}</td>
              <td>{row.maskedEmail}</td>
              <td>{[row.city, row.state].filter(Boolean).join('/') || '-'}</td>
              <td>{number(row.orders)}</td>
              <td>{money(row.totalSpent)}</td>
              <td>{money(row.averageTicket)}</td>
              <td>{row.lastOrderAt ? new Date(row.lastOrderAt).toLocaleDateString() : '-'}</td>
              <td>{row.type}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={8}>Sem clientes compradores no periodo.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RecentOrdersTable({
  data,
  onPage,
  onOpenOrders,
}: {
  data: EcommerceDashboardOverview['recentOrders'];
  onPage: (page: number) => void;
  onOpenOrders: () => void;
}) {
  return (
    <section className="ecom-panel">
      <div className="ecom-panel-head">
        <h3>Pedidos recentes</h3>
        <button type="button" onClick={onOpenOrders}>Ver detalhes</button>
      </div>
      <div className="ecom-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Pagamento</th>
              <th>Canal</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((order) => (
              <tr key={order.id} onClick={onOpenOrders}>
                <td>{order.orderNumber}</td>
                <td>{order.customer}</td>
                <td>{money(order.total)}</td>
                <td>{order.status}</td>
                <td>{order.paymentStatus || '-'}</td>
                <td>{order.channel || order.origin || '-'}</td>
                <td>{new Date(order.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!data.items.length && (
              <tr>
                <td colSpan={7}>Sem pedidos recentes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="ecom-pagination">
        <button type="button" disabled={!data.pagination.hasPreviousPage} onClick={() => onPage(data.pagination.page - 1)}>Anterior</button>
        <span>{data.pagination.page} / {data.pagination.totalPages}</span>
        <button type="button" disabled={!data.pagination.hasNextPage} onClick={() => onPage(data.pagination.page + 1)}>Proxima</button>
      </div>
    </section>
  );
}

export function EcommerceDashboardPage({ tenantId, onOpenOrders }: EcommerceDashboardPageProps) {
  const [filters, setFilters] = useState<EcommerceDashboardFilters>({ period: 'last30', page: 1, limit: 10 });
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const [data, setData] = useState<EcommerceDashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedFilters(filters), 350);
    return () => window.clearTimeout(timeout);
  }, [filters]);

  const load = async () => {
    setLoading(true);
    setError('');
    const response = await ecommerceAnalyticsApi.overview(debouncedFilters, tenantId);
    if (response.success) {
      setData(response.data);
    } else {
      setError(response.error || 'Falha ao carregar dashboard.');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenantId, debouncedFilters]);

  const setFilter = (field: keyof EcommerceDashboardFilters, value: string | number) => {
    setFilters((current) => ({ ...current, [field]: value, page: field === 'page' ? Number(value) : 1 }));
  };

  const clearFilters = () => setFilters({ period: 'last30', page: 1, limit: 10 });

  const exportReport = async (reportType: string) => {
    setExporting(true);
    setError('');
    const response = await ecommerceAnalyticsApi.export(debouncedFilters, reportType, tenantId);
    if (response.success) {
      const csv = window.atob(response.data.contentBase64);
      const blob = new Blob([csv], { type: response.data.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.data.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      setError(response.error || 'Falha ao exportar relatorio.');
    }
    setExporting(false);
  };

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      ['Faturamento bruto', data.summary.grossRevenue, 'money', data.comparisons.grossRevenue, 'Soma dos pedidos pagos e nao cancelados no periodo.'],
      ['Faturamento liquido', data.summary.netRevenue, 'money', undefined, 'Faturamento bruto menos descontos, taxas e reembolsos quando os campos existem.'],
      ['Total de pedidos', data.summary.totalOrders, 'number', data.comparisons.totalOrders, 'Quantidade de pedidos criados no periodo filtrado.'],
      ['Pedidos pagos', data.summary.paidOrders, 'number', undefined, 'Pedidos com pagamento aprovado, pago, capturado ou concluido.'],
      ['Ticket medio', data.summary.averageTicket, 'money', data.comparisons.averageTicket, 'Faturamento aprovado dividido por pedidos pagos.'],
      ['Produtos vendidos', data.summary.productsSold, 'number', data.comparisons.productsSold, 'Soma das quantidades de itens vendidos em pedidos validos.'],
      ['Produto mais vendido', data.summary.bestSellingProduct?.name, 'text', undefined, 'Produto/SKU com maior quantidade vendida no periodo.'],
      ['Maior faturamento', data.summary.topRevenueProduct?.name, 'text', undefined, 'Produto/SKU com maior receita bruta no periodo.'],
      ['Clientes compradores', data.summary.buyers, 'number', undefined, 'Clientes distintos com compra valida no periodo.'],
      ['Clientes novos', data.summary.newCustomers, 'number', data.comparisons.newCustomers, 'Clientes cuja primeira compra ocorreu no periodo.'],
      ['Clientes recorrentes', data.summary.recurringCustomers, 'number', undefined, 'Clientes que ja haviam comprado antes e voltaram no periodo.'],
      ['Taxa de crescimento', data.summary.growthRate, 'percent', data.comparisons.grossRevenue, 'Comparativo de faturamento bruto contra periodo anterior.'],
    ] as Array<[string, unknown, 'money' | 'number' | 'percent' | 'text', DashboardComparison | undefined, string]>;
  }, [data]);

  if (loading && !data) return <DashboardLoadingSkeleton />;
  if (error && !data) return <ErrorState message={error} />;

  return (
    <div className="ecom-dashboard">
      <div className="ecom-topbar">
        <div>
          <h2>Dashboard de E-commerce</h2>
          <span>{data?.period.label || 'Periodo selecionado'} - atualizado {data ? new Date(data.generatedAt).toLocaleTimeString() : '-'}</span>
        </div>
        <div className="ecom-actions">
          <button type="button" onClick={load} disabled={loading}>Atualizar</button>
          <button type="button" onClick={() => exportReport('overview')} disabled={exporting}>Exportar CSV</button>
        </div>
      </div>

      <section className="ecom-filters">
        <label>
          Periodo
          <select value={filters.period} onChange={(event) => setFilter('period', event.target.value)}>
            {periodOptions.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
          </select>
        </label>
        {filters.period === 'custom' && (
          <>
            <label>De<input type="date" value={filters.from || ''} onChange={(event) => setFilter('from', event.target.value)} /></label>
            <label>Ate<input type="date" value={filters.to || ''} onChange={(event) => setFilter('to', event.target.value)} /></label>
          </>
        )}
        <label>Canal<input value={filters.channel || ''} onChange={(event) => setFilter('channel', event.target.value)} /></label>
        <label>Origem<input value={filters.origin || ''} onChange={(event) => setFilter('origin', event.target.value)} /></label>
        <label>Status<input value={filters.status || ''} onChange={(event) => setFilter('status', event.target.value)} /></label>
        <label>Pagamento<input value={filters.paymentStatus || ''} onChange={(event) => setFilter('paymentStatus', event.target.value)} /></label>
        <label>Categoria<input value={filters.category || ''} onChange={(event) => setFilter('category', event.target.value)} /></label>
        <label>Produto<input value={filters.productId || ''} onChange={(event) => setFilter('productId', event.target.value)} /></label>
        <label>SKU<input value={filters.sku || ''} onChange={(event) => setFilter('sku', event.target.value)} /></label>
        <label>UF<input value={filters.state || ''} onChange={(event) => setFilter('state', event.target.value)} /></label>
        <label>Cidade<input value={filters.city || ''} onChange={(event) => setFilter('city', event.target.value)} /></label>
        <label>Metodo<input value={filters.paymentMethod || ''} onChange={(event) => setFilter('paymentMethod', event.target.value)} /></label>
        <button type="button" onClick={clearFilters}>Limpar</button>
      </section>

      {error && <div className="ecom-error">{error}</div>}
      {loading && <div className="ecom-loading-strip">Atualizando dados...</div>}
      {data && data.summary.totalOrders === 0 && <EmptyState />}

      {data && (
        <>
          <section className="ecom-kpi-grid">
            {kpis.map(([title, value, type, comparison, tooltip]) => (
              <KpiCard key={title} title={title} value={value ?? 'dados insuficientes'} type={type} comparison={comparison} tooltip={tooltip} onClick={title.includes('Pedido') ? onOpenOrders : undefined} />
            ))}
          </section>

          <section className="ecom-main-grid">
            <article className="ecom-panel large">
              <div className="ecom-panel-head">
                <h3>Faturamento ao longo do tempo</h3>
                <span>Media diaria {money(data.revenue.dailyAverage)}</span>
              </div>
              <LineChart data={data.revenue.series} />
              <div className="ecom-mini-metrics">
                <div><span>Melhor dia</span><strong>{data.revenue.bestDay ? `${data.revenue.bestDay.label} - ${money(data.revenue.bestDay.value)}` : 'dados insuficientes'}</strong></div>
                <div><span>Pior dia</span><strong>{data.revenue.worstDay ? `${data.revenue.worstDay.label} - ${money(data.revenue.worstDay.value)}` : 'dados insuficientes'}</strong></div>
              </div>
            </article>
            <article className="ecom-panel">
              <div className="ecom-panel-head">
                <h3>Pedidos por status</h3>
                <span>{number(data.orders.total)} pedidos</span>
              </div>
              <BarList rows={data.orders.byStatus} value="orders" />
            </article>
          </section>

          <section className="ecom-section-grid">
            <article className="ecom-panel">
              <div className="ecom-panel-head">
                <h3>Produtos Mais Vendidos</h3>
                <button type="button" onClick={() => exportReport('products')}>CSV</button>
              </div>
              <ProductTable rows={data.products.topByQuantity.slice(0, 10)} mode="quantity" />
            </article>
            <article className="ecom-panel">
              <div className="ecom-panel-head">
                <h3>Produtos com Maior Faturamento</h3>
                <span>{money(data.revenue.gross)}</span>
              </div>
              <ProductTable rows={data.products.topByRevenue.slice(0, 10)} mode="revenue" />
            </article>
          </section>

          <section className="ecom-section-grid thirds">
            <article className="ecom-panel">
              <div className="ecom-panel-head"><h3>Clientes</h3><span>{number(data.customers.totalBuyers)}</span></div>
              <div className="ecom-mini-metrics vertical">
                <div><span>Novos</span><strong>{number(data.customers.newCustomers)}</strong></div>
                <div><span>Recorrentes</span><strong>{number(data.customers.recurringCustomers)}</strong></div>
                <div><span>Taxa de recompra</span><strong>{data.customers.repeatRate === null ? 'dados insuficientes' : percent(data.customers.repeatRate * 100)}</strong></div>
              </div>
            </article>
            <article className="ecom-panel">
              <div className="ecom-panel-head"><h3>Canais</h3><span>{data.channels.available ? 'ativo' : 'campo ausente'}</span></div>
              {data.channels.available ? <BarList rows={data.channels.rows} value="grossRevenue" /> : <div className="ecom-missing">Depende do campo {data.channels.missingField}.</div>}
            </article>
            <article className="ecom-panel">
              <div className="ecom-panel-head"><h3>Pagamentos</h3><span>{data.payments.available ? 'ativo' : 'campo ausente'}</span></div>
              {data.payments.available ? <BarList rows={data.payments.rows} value="grossRevenue" /> : <div className="ecom-missing">Depende do campo {data.payments.missingField}.</div>}
            </article>
          </section>

          <section className="ecom-section-grid">
            <article className="ecom-panel">
              <div className="ecom-panel-head">
                <h3>Melhores Clientes</h3>
                <button type="button" onClick={() => exportReport('customers')}>CSV</button>
              </div>
              <CustomersTable rows={data.customers.topByRevenue} />
            </article>
            <article className="ecom-panel">
              <div className="ecom-panel-head"><h3>Comparativos e tendencias</h3></div>
              <div className="ecom-comparisons">
                {Object.entries(data.comparisons).map(([key, comparison]) => (
                  <div key={key} className={comparison.trend}>
                    <strong>{comparison.message}</strong>
                    <span>{money(comparison.current)} vs {money(comparison.previous)}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="ecom-section-grid">
            <RecentOrdersTable data={data.recentOrders} onPage={(page) => setFilter('page', page)} onOpenOrders={onOpenOrders} />
            <section className="ecom-panel">
              <div className="ecom-panel-head"><h3>Alertas comerciais</h3><span>{data.alerts.length}</span></div>
              <div className="ecom-alerts">
                {data.alerts.map((alert) => (
                  <article key={alert.id} className={alert.severity}>
                    <strong>{alert.title}</strong>
                    <p>{alert.description}</p>
                    <span>{alert.recommendedAction}</span>
                  </article>
                ))}
              </div>
            </section>
          </section>

          {!!data.dataQuality.missingFields.length && (
            <section className="ecom-panel">
              <div className="ecom-panel-head"><h3>Dados incompletos</h3><span>{data.dataQuality.missingFields.length}</span></div>
              <div className="ecom-missing-grid">
                {data.dataQuality.missingFields.map((field) => (
                  <article key={`${field.metric}-${field.field}`}>
                    <strong>{field.metric}</strong>
                    <span>{field.collection}.{field.field}</span>
                    <p>{field.howToPopulate}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
