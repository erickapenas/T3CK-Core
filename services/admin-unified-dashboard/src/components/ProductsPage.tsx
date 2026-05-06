import { useEffect, useMemo, useState } from 'react';
import {
  AdminSessionUser,
  InventoryAlert,
  InventoryMovement,
  ProductDetails,
  ProductListFilters,
  ProductRecord,
  ReplenishmentSuggestion,
  productCatalogApi,
} from '../apiClient';
import { Badge, Button, Card, Dropdown, Input, Modal, Table, Tabs } from '../design-system/components/primitives';
import '../styles/ProductsPage.css';

type ProductsPageProps = {
  tenantId: string;
  currentUser: AdminSessionUser;
  onChange?: () => void;
};

type ProductListData = {
  items: ProductRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  segments?: Record<string, number>;
  missingFields?: Array<{ metric: string; collection: string; field: string }>;
};

type ProductView = 'list' | 'create' | 'edit' | 'details' | 'intelligence';
type StockOperation = 'adjust' | 'increase' | 'decrease' | 'reserve' | 'release' | 'block' | 'unblock';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const emptyProduct: Partial<ProductRecord> = {
  name: '',
  slug: '',
  shortDescription: '',
  description: '',
  sku: '',
  barcode: '',
  productType: 'produto_simples',
  category: '',
  brand: '',
  status: 'ativo',
  unitOfMeasure: 'unidade',
  price: 0,
  promotionalPrice: null,
  costPrice: null,
  trackInventory: true,
  initialStock: 0,
  minimumStock: 0,
  maximumStock: 0,
  safetyStock: 0,
  leadTimeDays: 7,
  locationCode: '',
  mainImageUrl: '',
  tags: [],
  ncm: '',
  cfop: '',
  cest: '',
  taxOrigin: '',
  seoTitle: '',
  metaDescription: '',
};

const productTabs = [
  { id: 'overview', label: 'Visao geral' },
  { id: 'registration', label: 'Cadastro' },
  { id: 'variants', label: 'Variacoes/SKUs' },
  { id: 'pricing', label: 'Precos e custos' },
  { id: 'stock', label: 'Estoque' },
  { id: 'movements', label: 'Movimentacoes' },
  { id: 'intelligence', label: 'Inteligencia de estoque' },
  { id: 'sales', label: 'Vendas do produto' },
  { id: 'images', label: 'Imagens e midia' },
  { id: 'seo', label: 'SEO e conteudo' },
  { id: 'fiscal', label: 'Dados fiscais' },
  { id: 'audit', label: 'Logs e auditoria' },
];

function money(value?: number | null): string {
  return value === null || value === undefined ? 'Restrito' : currency.format(Number(value || 0));
}

function numberText(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Dados insuficientes';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}

function dateText(value?: string): string {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
}

function toneForStock(status?: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (status === 'saudavel') return 'success';
  if (status === 'reservado') return 'primary';
  if (status === 'baixo_estoque' || status === 'excesso_de_estoque' || status === 'produto_parado') return 'warning';
  if (status === 'sem_estoque' || status === 'risco_de_ruptura' || status === 'bloqueado') return 'danger';
  return 'default';
}

function toneForStatus(status?: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (status === 'ativo') return 'success';
  if (status === 'rascunho') return 'primary';
  if (status === 'inativo' || status === 'arquivado') return 'warning';
  if (status === 'bloqueado' || status === 'esgotado') return 'danger';
  return 'default';
}

function toneForSeverity(severity?: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (severity === 'critica' || severity === 'alta') return 'danger';
  if (severity === 'media') return 'warning';
  if (severity === 'baixa') return 'primary';
  return 'default';
}

function usePermission(user: AdminSessionUser) {
  return (permission: string): boolean => user.role === 'admin' || Boolean(user.permissions?.includes(permission));
}

function normalizeTags(value?: string[] | string): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function stockActionLabel(operation: StockOperation): string {
  const labels: Record<StockOperation, string> = {
    adjust: 'Ajustar estoque',
    increase: 'Registrar entrada',
    decrease: 'Registrar saida',
    reserve: 'Reservar estoque',
    release: 'Liberar reserva',
    block: 'Bloquear estoque',
    unblock: 'Desbloquear estoque',
  };
  return labels[operation];
}

export function ProductsPage({ tenantId, currentUser, onChange }: ProductsPageProps) {
  const can = usePermission(currentUser);
  const [view, setView] = useState<ProductView>('list');
  const [filters, setFilters] = useState<ProductListFilters>({ page: 1, limit: 10, analysisPeriodDays: 30 });
  const [draftFilters, setDraftFilters] = useState<ProductListFilters>({ page: 1, limit: 10, analysisPeriodDays: 30 });
  const [listData, setListData] = useState<ProductListData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<ProductDetails | null>(null);
  const [formData, setFormData] = useState<Partial<ProductRecord>>(emptyProduct);
  const [activeTab, setActiveTab] = useState('overview');
  const [intelligence, setIntelligence] = useState<{ alerts: InventoryAlert[]; suggestions: ReplenishmentSuggestion[] } | null>(null);
  const [stockModal, setStockModal] = useState<{ productId: string; operation: StockOperation } | null>(null);
  const [stockForm, setStockForm] = useState({ quantity: '0', reason: '', notes: '' });
  const [variantForm, setVariantForm] = useState({ name: '', sku: '', attributes: '', price: '', costPrice: '' });
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const summaryCards = useMemo(() => {
    const segments = listData?.segments || {};
    return [
      { label: 'Produtos', value: listData?.pagination.total || 0, tone: 'primary' },
      { label: 'Sem estoque', value: segments.sem_estoque || 0, tone: 'danger' },
      { label: 'Baixo estoque', value: segments.baixo_estoque || 0, tone: 'warning' },
      { label: 'Risco ruptura', value: segments.risco_de_ruptura || 0, tone: 'danger' },
      { label: 'Parados', value: segments.produto_parado || 0, tone: 'warning' },
      { label: 'Classe A', value: segments.abc_A || 0, tone: 'success' },
    ];
  }, [listData]);

  const loadProducts = async (nextFilters = filters) => {
    if (!can('visualizar_produtos')) {
      setError('Voce nao tem permissao para visualizar produtos.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await productCatalogApi.list(nextFilters, tenantId);
      if (!result.success) {
        setError(result.error || 'Nao foi possivel carregar os produtos.');
        return;
      }
      setListData(result.data);
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (productId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const result = await productCatalogApi.get(productId, tenantId);
      if (!result.success) {
        setError(result.error || 'Nao foi possivel carregar o produto.');
        return;
      }
      setDetails(result.data);
      setSelectedId(productId);
      setActiveTab('overview');
      setView('details');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadIntelligence = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await productCatalogApi.intelligence(filters, tenantId);
      if (!result.success) {
        setError(result.error || 'Nao foi possivel carregar inteligencia de estoque.');
        return;
      }
      setIntelligence({ alerts: result.data.alerts || [], suggestions: result.data.suggestions || [] });
      setView('intelligence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts(filters);
  }, [tenantId, filters.page, filters.limit]);

  const applyFilters = () => {
    const next = { ...draftFilters, page: 1, limit: filters.limit || 10 };
    setFilters(next);
    loadProducts(next);
  };

  const clearFilters = () => {
    const next = { page: 1, limit: 10, analysisPeriodDays: 30 };
    setDraftFilters(next);
    setFilters(next);
    loadProducts(next);
  };

  const openCreate = () => {
    setFormData(emptyProduct);
    setSelectedId(null);
    setView('create');
  };

  const openEdit = (product: ProductRecord) => {
    setFormData({
      ...product,
      tags: product.tags || [],
      costPrice: product.costPrice ?? null,
    });
    setSelectedId(product.id);
    setView('edit');
  };

  const saveProduct = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Partial<ProductRecord> = {
        ...formData,
        price: Number(formData.price || 0),
        promotionalPrice: formData.promotionalPrice === null || formData.promotionalPrice === undefined ? null : Number(formData.promotionalPrice),
        costPrice: formData.costPrice === null || formData.costPrice === undefined ? null : Number(formData.costPrice),
        minimumStock: Number(formData.minimumStock || 0),
        maximumStock: Number(formData.maximumStock || 0),
        safetyStock: Number(formData.safetyStock || 0),
        initialStock: Number(formData.initialStock || 0),
        leadTimeDays: Number(formData.leadTimeDays || 7),
        tags: normalizeTags(formData.tags),
      };
      const result = view === 'edit' && selectedId
        ? await productCatalogApi.update(selectedId, payload, tenantId)
        : await productCatalogApi.create(payload, tenantId);
      if (!result.success) {
        setError(result.error || 'Nao foi possivel salvar o produto.');
        return;
      }
      setSuccess('Produto salvo com sucesso.');
      setSelectedId(result.data.id);
      await loadProducts(filters);
      await loadDetails(result.data.id);
      onChange?.();
    } finally {
      setSaving(false);
    }
  };

  const archiveProduct = async (productId: string) => {
    if (!window.confirm('Arquivar este produto? Ele ficara oculto por padrao.')) return;
    const result = await productCatalogApi.delete(productId, tenantId);
    if (!result.success) {
      setError(result.error || 'Nao foi possivel arquivar o produto.');
      return;
    }
    setSuccess('Produto arquivado.');
    await loadProducts(filters);
    onChange?.();
  };

  const duplicateProduct = async (productId: string) => {
    const result = await productCatalogApi.duplicate(productId, tenantId);
    if (!result.success) {
      setError(result.error || 'Nao foi possivel duplicar o produto.');
      return;
    }
    setSuccess('Produto duplicado.');
    await loadProducts(filters);
    onChange?.();
  };

  const submitStockOperation = async () => {
    if (!stockModal) return;
    setSaving(true);
    setError(null);
    try {
      const result = await productCatalogApi.moveStock(
        stockModal.productId,
        stockModal.operation,
        {
          quantity: Number(stockForm.quantity),
          reason: stockForm.reason,
          notes: stockForm.notes,
          idempotencyKey: `${stockModal.operation}_${stockModal.productId}_${Date.now()}`,
        },
        tenantId
      );
      if (!result.success) {
        setError(result.error || 'Nao foi possivel movimentar estoque.');
        return;
      }
      setStockModal(null);
      setStockForm({ quantity: '0', reason: '', notes: '' });
      if (selectedId) await loadDetails(selectedId);
      await loadProducts(filters);
      setSuccess('Movimentacao registrada.');
    } finally {
      setSaving(false);
    }
  };

  const createVariant = async () => {
    if (!selectedId) return;
    const attributes = variantForm.attributes
      .split(',')
      .map((pair) => pair.split(':').map((part) => part.trim()))
      .filter(([key, value]) => key && value)
      .reduce<Record<string, string>>((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    const result = await productCatalogApi.createVariant(
      selectedId,
      {
        name: variantForm.name,
        sku: variantForm.sku,
        attributes,
        price: variantForm.price ? Number(variantForm.price) : undefined,
        costPrice: variantForm.costPrice ? Number(variantForm.costPrice) : undefined,
      },
      tenantId
    );
    if (!result.success) {
      setError(result.error || 'Nao foi possivel criar variacao.');
      return;
    }
    setVariantForm({ name: '', sku: '', attributes: '', price: '', costPrice: '' });
    await loadDetails(selectedId);
  };

  const resolveAlert = async (alertId: string) => {
    const result = await productCatalogApi.resolveAlert(alertId, tenantId);
    if (!result.success) {
      setError(result.error || 'Nao foi possivel resolver alerta.');
      return;
    }
    if (selectedId) await loadDetails(selectedId);
    await loadIntelligence();
  };

  const actOnSuggestion = async (suggestionId: string, action: 'accept' | 'ignore') => {
    const result = action === 'accept'
      ? await productCatalogApi.acceptSuggestion(suggestionId, tenantId)
      : await productCatalogApi.ignoreSuggestion(suggestionId, tenantId);
    if (!result.success) {
      setError(result.error || 'Nao foi possivel atualizar sugestao.');
      return;
    }
    if (selectedId) await loadDetails(selectedId);
    await loadIntelligence();
  };

  const exportProducts = async () => {
    const result = await productCatalogApi.exportList(filters, tenantId);
    if (!result.success) {
      setError(result.error || 'Nao foi possivel exportar produtos.');
      return;
    }
    setSuccess(`Exportacao gerada com ${result.data.total} produtos.`);
  };

  return (
    <div className="products-page">
      <div className="products-toolbar">
        <div>
          <span className="products-eyebrow">Catalogo + Estoque inteligente</span>
          <h2>Produtos</h2>
          <p>Cadastro multitenant de produtos, SKUs, precos, estoque por ledger, alertas e reposicao explicavel.</p>
        </div>
        <div className="products-actions">
          <Button onClick={() => setView('list')}>Listagem</Button>
          <Button onClick={loadIntelligence}>Inteligencia</Button>
          {can('exportar_produtos') && <Button onClick={exportProducts}>Exportar</Button>}
          {can('criar_produtos') && <Button tone="primary" onClick={openCreate}>Novo produto</Button>}
        </div>
      </div>

      {error && <div className="products-alert products-alert--error">{error}</div>}
      {success && <div className="products-alert products-alert--success">{success}</div>}

      {view === 'list' && (
        <>
          <section className="products-kpis">
            {summaryCards.map((card) => (
              <Card key={card.label} className="product-kpi">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </Card>
            ))}
          </section>

          <Card title="Busca e filtros" eyebrow="Backend filters">
            <div className="product-filter-grid">
              <Input placeholder="Nome, SKU, EAN, categoria, marca..." value={draftFilters.search || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} />
              <Dropdown value={draftFilters.status || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as ProductListFilters['status'] }))}>
                <option value="">Todos os status</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="rascunho">Rascunho</option>
                <option value="arquivado">Arquivado</option>
                <option value="bloqueado">Bloqueado</option>
                <option value="esgotado">Esgotado</option>
              </Dropdown>
              <Dropdown value={draftFilters.stockStatus || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, stockStatus: event.target.value as ProductListFilters['stockStatus'] }))}>
                <option value="">Todos os estoques</option>
                <option value="saudavel">Saudavel</option>
                <option value="baixo_estoque">Baixo estoque</option>
                <option value="sem_estoque">Sem estoque</option>
                <option value="risco_de_ruptura">Risco de ruptura</option>
                <option value="excesso_de_estoque">Excesso</option>
                <option value="produto_parado">Produto parado</option>
              </Dropdown>
              <Input placeholder="Categoria" value={draftFilters.category || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, category: event.target.value }))} />
              <Input placeholder="Marca" value={draftFilters.brand || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, brand: event.target.value }))} />
              <Input type="number" placeholder="Preco minimo" value={draftFilters.minPrice ?? ''} onChange={(event) => setDraftFilters((current) => ({ ...current, minPrice: event.target.value ? Number(event.target.value) : undefined }))} />
              <Input type="number" placeholder="Preco maximo" value={draftFilters.maxPrice ?? ''} onChange={(event) => setDraftFilters((current) => ({ ...current, maxPrice: event.target.value ? Number(event.target.value) : undefined }))} />
              <Dropdown value={String(draftFilters.analysisPeriodDays || 30)} onChange={(event) => setDraftFilters((current) => ({ ...current, analysisPeriodDays: Number(event.target.value) }))}>
                <option value="7">Ultimos 7 dias</option>
                <option value="15">Ultimos 15 dias</option>
                <option value="30">Ultimos 30 dias</option>
                <option value="60">Ultimos 60 dias</option>
                <option value="90">Ultimos 90 dias</option>
              </Dropdown>
            </div>
            <div className="product-check-filters">
              {[
                ['lowStock', 'Estoque baixo'],
                ['noStock', 'Sem estoque'],
                ['reservedStock', 'Com reserva'],
                ['excessStock', 'Excesso'],
                ['stalled', 'Parado'],
                ['stockoutRisk', 'Risco ruptura'],
                ['archived', 'Mostrar arquivados'],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean((draftFilters as any)[key])}
                    onChange={(event) => setDraftFilters((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="product-filter-actions">
              <Button onClick={clearFilters}>Limpar filtros</Button>
              <Button tone="primary" onClick={applyFilters}>Aplicar filtros</Button>
            </div>
          </Card>

          <Card title="Produtos cadastrados" eyebrow="Tabela paginada">
            {loading ? (
              <ProductSkeleton />
            ) : !listData?.items?.length ? (
              <EmptyState text={filters.search ? 'Nenhum produto corresponde aos filtros selecionados.' : 'Nenhum produto cadastrado ainda.'} />
            ) : (
              <>
                <Table>
                  <table>
                    <thead>
                      <tr>
                        <th>Imagem</th>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th>Preco</th>
                        <th>Custo</th>
                        <th>Margem</th>
                        <th>Estoque</th>
                        <th>Vendas</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listData.items.map((product) => (
                        <tr key={product.id}>
                          <td>
                            {product.mainImageUrl ? (
                              <img className="product-thumb" src={product.mainImageUrl} alt="" />
                            ) : (
                              <span className="product-thumb product-thumb--empty">{product.name.slice(0, 2).toUpperCase()}</span>
                            )}
                          </td>
                          <td>
                            <strong>{product.name}</strong>
                            <span>SKU {product.sku || 'sem SKU'} | EAN {product.barcode || 'nao informado'}</span>
                            <div className="product-row-badges">
                              <Badge tone={toneForStatus(product.status)}>{product.status}</Badge>
                              <Badge tone={toneForStock(product.inventory.stockStatus)}>{product.inventory.stockStatus}</Badge>
                            </div>
                          </td>
                          <td>
                            {product.category || 'Sem categoria'}
                            <span>{product.brand || 'Sem marca'}</span>
                          </td>
                          <td>{money(product.price)}</td>
                          <td>{money(product.costPrice)}</td>
                          <td>{product.inventory.marginPercent === null ? 'Dados insuficientes' : `${numberText(product.inventory.marginPercent)}%`}</td>
                          <td>
                            <strong>{numberText(product.inventory.availableQuantity)}</strong>
                            <span>Total {product.inventory.stockQuantity} | Reservado {product.inventory.reservedQuantity}</span>
                            <span>Min. {product.inventory.minimumStock}</span>
                          </td>
                          <td>
                            {numberText(product.sales.quantitySold)} un.
                            <span>{money(product.sales.revenue)}</span>
                            <span>Ultima: {dateText(product.sales.lastSaleAt)}</span>
                          </td>
                          <td>
                            <div className="product-row-actions">
                              <Button onClick={() => loadDetails(product.id)}>Detalhes</Button>
                              {can('editar_produtos') && <Button onClick={() => openEdit(product)}>Editar</Button>}
                              {can('ajustar_estoque') && <Button onClick={() => setStockModal({ productId: product.id, operation: 'adjust' })}>Estoque</Button>}
                              {can('duplicar_produtos') && <Button onClick={() => duplicateProduct(product.id)}>Duplicar</Button>}
                              {can('excluir_produtos') && <Button tone="danger" onClick={() => archiveProduct(product.id)}>Arquivar</Button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Table>
                <Pagination
                  page={listData.pagination.page}
                  totalPages={listData.pagination.totalPages}
                  total={listData.pagination.total}
                  onPrev={() => setFilters((current) => ({ ...current, page: Math.max(1, Number(current.page || 1) - 1) }))}
                  onNext={() => setFilters((current) => ({ ...current, page: Number(current.page || 1) + 1 }))}
                  hasPrev={listData.pagination.hasPreviousPage}
                  hasNext={listData.pagination.hasNextPage}
                />
              </>
            )}
          </Card>
        </>
      )}

      {(view === 'create' || view === 'edit') && (
        <ProductForm
          mode={view}
          formData={formData}
          setFormData={setFormData}
          can={can}
          onCancel={() => setView('list')}
          onSave={saveProduct}
          saving={saving}
        />
      )}

      {view === 'details' && (
        <ProductDetailsView
          details={details}
          loading={detailLoading}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          can={can}
          onBack={() => setView('list')}
          onEdit={() => details && openEdit(details.product)}
          onStock={(operation) => details && setStockModal({ productId: details.product.id, operation })}
          onCreateVariant={createVariant}
          variantForm={variantForm}
          setVariantForm={setVariantForm}
          onResolveAlert={resolveAlert}
          onSuggestion={actOnSuggestion}
        />
      )}

      {view === 'intelligence' && (
        <IntelligenceView
          loading={loading}
          data={intelligence}
          onBack={() => setView('list')}
          onResolveAlert={resolveAlert}
          onSuggestion={actOnSuggestion}
        />
      )}

      <Modal
        open={Boolean(stockModal)}
        title={stockModal ? stockActionLabel(stockModal.operation) : 'Movimentacao de estoque'}
        onClose={() => setStockModal(null)}
      >
        <div className="product-stock-form">
          <label>
            Quantidade
            <Input type="number" value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} />
          </label>
          <label>
            Motivo obrigatorio
            <Input value={stockForm.reason} onChange={(event) => setStockForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Ex.: contagem fisica, avaria, reposicao" />
          </label>
          <label>
            Observacao
            <Input value={stockForm.notes} onChange={(event) => setStockForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          <div className="product-form-actions">
            <Button onClick={() => setStockModal(null)}>Cancelar</Button>
            <Button tone="primary" onClick={submitStockOperation} disabled={saving || !stockForm.reason.trim()}>
              Registrar movimentacao
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ProductForm({
  mode,
  formData,
  setFormData,
  can,
  onCancel,
  onSave,
  saving,
}: {
  mode: 'create' | 'edit';
  formData: Partial<ProductRecord>;
  setFormData: (updater: Partial<ProductRecord> | ((current: Partial<ProductRecord>) => Partial<ProductRecord>)) => void;
  can: (permission: string) => boolean;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const update = (field: keyof ProductRecord, value: any) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };
  return (
    <Card title={mode === 'create' ? 'Novo produto' : 'Editar produto'} eyebrow="Cadastro">
      <div className="product-form-grid">
        <label>Nome<Input value={formData.name || ''} onChange={(event) => update('name', event.target.value)} /></label>
        <label>SKU<Input value={formData.sku || ''} onChange={(event) => update('sku', event.target.value)} /></label>
        <label>Codigo de barras/EAN<Input value={formData.barcode || ''} onChange={(event) => update('barcode', event.target.value)} /></label>
        <label>Categoria<Input value={formData.category || ''} onChange={(event) => update('category', event.target.value)} /></label>
        <label>Subcategoria<Input value={formData.subcategory || ''} onChange={(event) => update('subcategory', event.target.value)} /></label>
        <label>Marca<Input value={formData.brand || ''} onChange={(event) => update('brand', event.target.value)} /></label>
        <label>Status<Dropdown value={formData.status || 'ativo'} onChange={(event) => update('status', event.target.value)}><option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="rascunho">Rascunho</option><option value="arquivado">Arquivado</option><option value="bloqueado">Bloqueado</option><option value="esgotado">Esgotado</option></Dropdown></label>
        <label>Tipo<Dropdown value={formData.productType || 'produto_simples'} onChange={(event) => update('productType', event.target.value)}><option value="produto_simples">Produto simples</option><option value="produto_com_variacao">Produto com variacao</option><option value="kit">Kit</option><option value="bundle">Bundle</option><option value="servico">Servico</option><option value="digital">Digital</option></Dropdown></label>
        <label>Unidade<Dropdown value={formData.unitOfMeasure || 'unidade'} onChange={(event) => update('unitOfMeasure', event.target.value)}><option value="unidade">Unidade</option><option value="caixa">Caixa</option><option value="pacote">Pacote</option><option value="metro">Metro</option><option value="litro">Litro</option><option value="quilo">Quilo</option><option value="grama">Grama</option><option value="par">Par</option><option value="conjunto">Conjunto</option></Dropdown></label>
        <label>Preco de venda<Input type="number" value={formData.price ?? 0} onChange={(event) => update('price', Number(event.target.value))} disabled={mode === 'edit' && !can('editar_preco_produto')} /></label>
        <label>Preco promocional<Input type="number" value={formData.promotionalPrice ?? ''} onChange={(event) => update('promotionalPrice', event.target.value ? Number(event.target.value) : null)} disabled={mode === 'edit' && !can('editar_preco_produto')} /></label>
        <label>Custo<Input type="number" value={formData.costPrice ?? ''} onChange={(event) => update('costPrice', event.target.value ? Number(event.target.value) : null)} disabled={mode === 'edit' && !can('editar_custo_produto')} /></label>
        <label>Estoque inicial<Input type="number" value={formData.initialStock ?? 0} onChange={(event) => update('initialStock', Number(event.target.value))} disabled={mode === 'edit'} /></label>
        <label>Estoque minimo<Input type="number" value={formData.minimumStock ?? 0} onChange={(event) => update('minimumStock', Number(event.target.value))} /></label>
        <label>Estoque maximo<Input type="number" value={formData.maximumStock ?? 0} onChange={(event) => update('maximumStock', Number(event.target.value))} /></label>
        <label>Estoque seguranca<Input type="number" value={formData.safetyStock ?? 0} onChange={(event) => update('safetyStock', Number(event.target.value))} /></label>
        <label>Lead time dias<Input type="number" value={formData.leadTimeDays ?? 7} onChange={(event) => update('leadTimeDays', Number(event.target.value))} /></label>
        <label>Localizacao<Input value={formData.locationCode || ''} onChange={(event) => update('locationCode', event.target.value)} /></label>
        <label>Imagem principal<Input value={formData.mainImageUrl || ''} onChange={(event) => update('mainImageUrl', event.target.value)} /></label>
        <label>Tags<Input value={(formData.tags || []).join(', ')} onChange={(event) => update('tags', normalizeTags(event.target.value))} /></label>
        <label>Peso<Input type="number" value={formData.weight ?? ''} onChange={(event) => update('weight', event.target.value ? Number(event.target.value) : null)} /></label>
        <label>Altura<Input type="number" value={formData.height ?? ''} onChange={(event) => update('height', event.target.value ? Number(event.target.value) : null)} /></label>
        <label>Largura<Input type="number" value={formData.width ?? ''} onChange={(event) => update('width', event.target.value ? Number(event.target.value) : null)} /></label>
        <label>Comprimento<Input type="number" value={formData.length ?? ''} onChange={(event) => update('length', event.target.value ? Number(event.target.value) : null)} /></label>
        <label>NCM<Input value={formData.ncm || ''} onChange={(event) => update('ncm', event.target.value)} disabled={mode === 'edit' && !can('editar_dados_fiscais_produto')} /></label>
        <label>CFOP<Input value={formData.cfop || ''} onChange={(event) => update('cfop', event.target.value)} disabled={mode === 'edit' && !can('editar_dados_fiscais_produto')} /></label>
        <label>CEST<Input value={formData.cest || ''} onChange={(event) => update('cest', event.target.value)} disabled={mode === 'edit' && !can('editar_dados_fiscais_produto')} /></label>
        <label>Origem fiscal<Input value={formData.taxOrigin || ''} onChange={(event) => update('taxOrigin', event.target.value)} disabled={mode === 'edit' && !can('editar_dados_fiscais_produto')} /></label>
        <label className="product-form-wide">Descricao curta<Input value={formData.shortDescription || ''} onChange={(event) => update('shortDescription', event.target.value)} /></label>
        <label className="product-form-wide">Descricao completa<textarea value={formData.description || ''} onChange={(event) => update('description', event.target.value)} /></label>
      </div>
      <div className="product-form-actions">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button tone="primary" onClick={onSave} disabled={saving || !formData.name || !formData.sku}>Salvar produto</Button>
      </div>
    </Card>
  );
}

function ProductDetailsView({
  details,
  loading,
  activeTab,
  setActiveTab,
  can,
  onBack,
  onEdit,
  onStock,
  onCreateVariant,
  variantForm,
  setVariantForm,
  onResolveAlert,
  onSuggestion,
}: {
  details: ProductDetails | null;
  loading: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  can: (permission: string) => boolean;
  onBack: () => void;
  onEdit: () => void;
  onStock: (operation: StockOperation) => void;
  onCreateVariant: () => void;
  variantForm: { name: string; sku: string; attributes: string; price: string; costPrice: string };
  setVariantForm: (updater: any) => void;
  onResolveAlert: (alertId: string) => void;
  onSuggestion: (suggestionId: string, action: 'accept' | 'ignore') => void;
}) {
  if (loading) return <ProductSkeleton />;
  if (!details) return <EmptyState text="Produto nao encontrado." />;
  const product = details.product;
  return (
    <div className="product-details">
      <Card>
        <div className="product-profile-head">
          {product.mainImageUrl ? <img className="product-hero-image" src={product.mainImageUrl} alt="" /> : <div className="product-hero-image product-hero-image--empty">{product.name.slice(0, 2).toUpperCase()}</div>}
          <div>
            <span className="products-eyebrow">Produto desde {dateText(product.createdAt)}</span>
            <h2>{product.name}</h2>
            <p>SKU {product.sku} | {product.category || 'Sem categoria'} | {product.brand || 'Sem marca'}</p>
            <div className="product-row-badges">
              <Badge tone={toneForStatus(product.status)}>{product.status}</Badge>
              <Badge tone={toneForStock(product.inventory.stockStatus)}>{product.inventory.stockStatus}</Badge>
              <Badge tone="primary">ABC {product.inventory.abcClass}</Badge>
            </div>
          </div>
          <div className="products-actions">
            <Button onClick={onBack}>Voltar</Button>
            {can('editar_produtos') && <Button onClick={onEdit}>Editar</Button>}
            {can('ajustar_estoque') && <Button tone="primary" onClick={() => onStock('adjust')}>Ajustar estoque</Button>}
          </div>
        </div>
      </Card>

      <section className="products-kpis">
        {[
          ['Disponivel', product.inventory.availableQuantity],
          ['Reservado', product.inventory.reservedQuantity],
          ['Total', product.inventory.stockQuantity],
          ['Minimo', product.inventory.minimumStock],
          ['Vendido', product.sales.quantitySold],
          ['Faturamento', money(product.sales.revenue)],
          ['Margem', product.inventory.marginPercent === null ? 'Dados insuficientes' : `${numberText(product.inventory.marginPercent)}%`],
          ['Cobertura', product.inventory.daysOfCoverage === null ? 'Dados insuficientes' : `${numberText(product.inventory.daysOfCoverage)} dias`],
        ].map(([label, value]) => (
          <Card key={label} className="product-kpi"><span>{label}</span><strong>{value}</strong></Card>
        ))}
      </section>

      <Card>
        <Tabs tabs={productTabs} active={activeTab} onChange={setActiveTab} />
        <div className="product-tab-panel">
          {activeTab === 'overview' && <OverviewTab product={product} alerts={details.alerts} />}
          {activeTab === 'registration' && <KeyValueGrid rows={[
            ['Nome', product.name], ['SKU', product.sku], ['EAN', product.barcode || 'Nao informado'], ['Categoria', product.category || 'Nao informada'],
            ['Marca', product.brand || 'Nao informada'], ['Tipo', product.productType || 'produto_simples'], ['Unidade', product.unitOfMeasure || 'unidade'],
            ['Tags', (product.tags || []).join(', ') || 'Sem tags'], ['Descricao curta', product.shortDescription || 'Nao informada'],
          ]} />}
          {activeTab === 'variants' && <VariantsTab variants={details.variants} variantForm={variantForm} setVariantForm={setVariantForm} onCreateVariant={onCreateVariant} canCreate={can('editar_produtos')} />}
          {activeTab === 'pricing' && <PricingTab product={product} history={details.priceHistory} />}
          {activeTab === 'stock' && <StockTab balances={details.balances} onStock={onStock} canMove={can('ajustar_estoque')} />}
          {activeTab === 'movements' && <MovementsTable movements={details.movements} />}
          {activeTab === 'intelligence' && <IntelligencePanel alerts={details.alerts} suggestions={details.replenishmentSuggestions} onResolveAlert={onResolveAlert} onSuggestion={onSuggestion} />}
          {activeTab === 'sales' && <SalesTab product={product} orders={details.recentOrders} />}
          {activeTab === 'images' && <ImagesTab images={details.images} product={product} />}
          {activeTab === 'seo' && <KeyValueGrid rows={[['Slug', product.slug], ['Titulo SEO', product.seoTitle || 'Nao informado'], ['Meta descricao', product.metaDescription || 'Nao informada'], ['URL amigavel', product.urlSlug || product.slug]]} />}
          {activeTab === 'fiscal' && <KeyValueGrid rows={[['NCM', product.ncm || 'Nao informado'], ['CFOP', product.cfop || 'Nao informado'], ['CEST', product.cest || 'Nao informado'], ['Origem', product.taxOrigin || 'Nao informada'], ['Unidade tributavel', product.taxableUnit || 'Nao informada'], ['Codigo fiscal', product.fiscalCode || 'Nao informado']]} />}
          {activeTab === 'audit' && <AuditTab logs={details.auditLogs} />}
        </div>
      </Card>
    </div>
  );
}

function OverviewTab({ product, alerts }: { product: ProductRecord; alerts: InventoryAlert[] }) {
  return (
    <div className="product-detail-grid">
      <Card title="Resumo operacional">
        <p>{product.inventory.recommendation}</p>
        <p>Ruptura prevista: {dateText(product.inventory.stockoutDate)}</p>
        <p>Giro: {numberText(product.inventory.turnover)}</p>
        <p>Lucro estimado/unidade: {money(product.inventory.estimatedUnitProfit)}</p>
      </Card>
      <Card title="Alertas simples">
        {alerts.length ? alerts.slice(0, 6).map((alert) => (
          <div className="product-alert-item" key={alert.id}>
            <Badge tone={toneForSeverity(alert.severity)}>{alert.severity}</Badge>
            <strong>{alert.title}</strong>
            <span>{alert.description}</span>
          </div>
        )) : <EmptyState text="Nenhum alerta ativo para este produto." />}
      </Card>
    </div>
  );
}

function VariantsTab({ variants, variantForm, setVariantForm, onCreateVariant, canCreate }: {
  variants: ProductDetails['variants'];
  variantForm: { name: string; sku: string; attributes: string; price: string; costPrice: string };
  setVariantForm: (updater: any) => void;
  onCreateVariant: () => void;
  canCreate: boolean;
}) {
  return (
    <div className="product-stack">
      {canCreate && (
        <div className="product-inline-form">
          <Input placeholder="Nome da variacao" value={variantForm.name} onChange={(event) => setVariantForm((current: any) => ({ ...current, name: event.target.value }))} />
          <Input placeholder="SKU unico" value={variantForm.sku} onChange={(event) => setVariantForm((current: any) => ({ ...current, sku: event.target.value }))} />
          <Input placeholder="Atributos: Cor:Preto,Tamanho:M" value={variantForm.attributes} onChange={(event) => setVariantForm((current: any) => ({ ...current, attributes: event.target.value }))} />
          <Input type="number" placeholder="Preco" value={variantForm.price} onChange={(event) => setVariantForm((current: any) => ({ ...current, price: event.target.value }))} />
          <Button tone="primary" onClick={onCreateVariant} disabled={!variantForm.name || !variantForm.sku}>Adicionar SKU</Button>
        </div>
      )}
      <Table>
        <table>
          <thead><tr><th>Variacao</th><th>SKU</th><th>Atributos</th><th>Preco</th><th>Status</th></tr></thead>
          <tbody>
            {variants.map((variant) => (
              <tr key={variant.id}><td>{variant.name}</td><td>{variant.sku}</td><td>{Object.entries(variant.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}</td><td>{money(variant.price)}</td><td><Badge tone={toneForStatus(variant.status)}>{variant.status}</Badge></td></tr>
            ))}
            {!variants.length && <tr><td colSpan={5}>Nenhuma variacao cadastrada.</td></tr>}
          </tbody>
        </table>
      </Table>
    </div>
  );
}

function PricingTab({ product, history }: { product: ProductRecord; history: Array<Record<string, any>> }) {
  return (
    <div className="product-detail-grid">
      <Card title="Precificacao atual">
        <KeyValueGrid rows={[
          ['Preco de venda', money(product.price)],
          ['Promocional', money(product.promotionalPrice)],
          ['Custo', money(product.costPrice)],
          ['Margem bruta', product.inventory.marginPercent === null ? 'Dados insuficientes' : `${numberText(product.inventory.marginPercent)}%`],
          ['Markup', numberText(product.inventory.markup)],
          ['Lucro/unidade', money(product.inventory.estimatedUnitProfit)],
        ]} />
      </Card>
      <Card title="Historico de precos">
        {history.length ? history.slice(0, 10).map((item) => (
          <p key={item.id}>{dateText(item.createdAt)}: {money(item.oldPrice)} para {money(item.newPrice)} | custo {money(item.oldCost)} para {money(item.newCost)}</p>
        )) : <EmptyState text="Nenhuma mudanca de preco registrada." />}
      </Card>
    </div>
  );
}

function StockTab({ balances, onStock, canMove }: { balances: ProductDetails['balances']; onStock: (operation: StockOperation) => void; canMove: boolean }) {
  return (
    <div className="product-stack">
      {canMove && <div className="product-row-actions">{(['increase', 'decrease', 'reserve', 'release', 'block', 'unblock'] as StockOperation[]).map((op) => <Button key={op} onClick={() => onStock(op)}>{stockActionLabel(op)}</Button>)}</div>}
      <Table>
        <table>
          <thead><tr><th>Deposito</th><th>Total</th><th>Reservado</th><th>Bloqueado</th><th>Disponivel</th><th>Min/Max</th><th>Localizacao</th></tr></thead>
          <tbody>
            {balances.map((balance) => (
              <tr key={balance.id}><td>{balance.warehouseId}</td><td>{balance.stockQuantity}</td><td>{balance.reservedQuantity}</td><td>{balance.blockedQuantity}</td><td>{balance.availableQuantity}</td><td>{balance.minimumStock}/{balance.maximumStock}</td><td>{balance.locationCode || '-'}</td></tr>
            ))}
            {!balances.length && <tr><td colSpan={7}>Nenhum saldo registrado. Use uma movimentacao de entrada ou ajuste.</td></tr>}
          </tbody>
        </table>
      </Table>
    </div>
  );
}

function MovementsTable({ movements }: { movements: InventoryMovement[] }) {
  return (
    <Table>
      <table>
        <thead><tr><th>Data</th><th>Tipo</th><th>Qtd anterior</th><th>Movimento</th><th>Qtd final</th><th>Motivo</th><th>Origem</th><th>Idempotencia</th></tr></thead>
        <tbody>
          {movements.map((movement) => (
            <tr key={movement.id}><td>{dateText(movement.createdAt)}</td><td>{movement.type}</td><td>{movement.quantityBefore}</td><td>{movement.quantity}</td><td>{movement.quantityAfter}</td><td>{movement.reason}</td><td>{movement.origin}</td><td>{movement.idempotencyKey}</td></tr>
          ))}
          {!movements.length && <tr><td colSpan={8}>Nenhuma movimentacao encontrada.</td></tr>}
        </tbody>
      </table>
    </Table>
  );
}

function IntelligencePanel({ alerts, suggestions, onResolveAlert, onSuggestion }: {
  alerts: InventoryAlert[];
  suggestions: ReplenishmentSuggestion[];
  onResolveAlert: (alertId: string) => void;
  onSuggestion: (suggestionId: string, action: 'accept' | 'ignore') => void;
}) {
  return (
    <div className="product-detail-grid">
      <AlertsList alerts={alerts} onResolveAlert={onResolveAlert} />
      <SuggestionsList suggestions={suggestions} onSuggestion={onSuggestion} />
    </div>
  );
}

function IntelligenceView({ loading, data, onBack, onResolveAlert, onSuggestion }: {
  loading: boolean;
  data: { alerts: InventoryAlert[]; suggestions: ReplenishmentSuggestion[] } | null;
  onBack: () => void;
  onResolveAlert: (alertId: string) => void;
  onSuggestion: (suggestionId: string, action: 'accept' | 'ignore') => void;
}) {
  return (
    <div className="product-details">
      <div className="products-toolbar">
        <div>
          <span className="products-eyebrow">Reposicao inteligente</span>
          <h2>Alertas e recomendacoes</h2>
          <p>Regras explicaveis com media diaria, cobertura, ruptura, produtos parados e excesso de estoque.</p>
        </div>
        <Button onClick={onBack}>Voltar</Button>
      </div>
      {loading ? <ProductSkeleton /> : <IntelligencePanel alerts={data?.alerts || []} suggestions={data?.suggestions || []} onResolveAlert={onResolveAlert} onSuggestion={onSuggestion} />}
    </div>
  );
}

function AlertsList({ alerts, onResolveAlert }: { alerts: InventoryAlert[]; onResolveAlert: (alertId: string) => void }) {
  return (
    <Card title="Alertas inteligentes">
      <div className="product-stack">
        {alerts.map((alert) => (
          <div key={alert.id} className="product-alert-item">
            <Badge tone={toneForSeverity(alert.severity)}>{alert.severity}</Badge>
            <strong>{alert.title}</strong>
            <span>{alert.description}</span>
            <small>{alert.recommendation}</small>
            <Button onClick={() => onResolveAlert(alert.id)}>Resolver</Button>
          </div>
        ))}
        {!alerts.length && <EmptyState text="Nenhum alerta ativo." />}
      </div>
    </Card>
  );
}

function SuggestionsList({ suggestions, onSuggestion }: { suggestions: ReplenishmentSuggestion[]; onSuggestion: (suggestionId: string, action: 'accept' | 'ignore') => void }) {
  return (
    <Card title="Reposicao Inteligente">
      <Table>
        <table>
          <thead><tr><th>Produto</th><th>Media diaria</th><th>Lead time</th><th>Ruptura</th><th>Qtd sugerida</th><th>Prioridade</th><th>Acoes</th></tr></thead>
          <tbody>
            {suggestions.map((suggestion) => (
              <tr key={suggestion.id}><td>{suggestion.productId}</td><td>{numberText(suggestion.averageDailySales)}</td><td>{suggestion.leadTimeDays} dias</td><td>{numberText(suggestion.daysUntilStockout)} dias</td><td>{numberText(suggestion.suggestedQuantity)}</td><td><Badge tone={toneForSeverity(suggestion.priority === 'critica' ? 'critica' : suggestion.priority === 'alta' ? 'alta' : 'media')}>{suggestion.priority}</Badge></td><td><div className="product-row-actions"><Button onClick={() => onSuggestion(suggestion.id, 'accept')}>Aceitar</Button><Button onClick={() => onSuggestion(suggestion.id, 'ignore')}>Ignorar</Button></div></td></tr>
            ))}
            {!suggestions.length && <tr><td colSpan={7}>Nenhuma recomendacao ativa.</td></tr>}
          </tbody>
        </table>
      </Table>
    </Card>
  );
}

function SalesTab({ product, orders }: { product: ProductRecord; orders: Array<Record<string, any>> }) {
  return (
    <div className="product-detail-grid">
      <Card title="Metricas de venda">
        <KeyValueGrid rows={[
          ['Unidades vendidas', numberText(product.sales.quantitySold)],
          ['Faturamento', money(product.sales.revenue)],
          ['Pedidos com produto', numberText(product.sales.orders)],
          ['Ticket medio produto', money(product.sales.averageTicket)],
          ['Media diaria', numberText(product.sales.averageDailySales)],
          ['Ultima venda', dateText(product.sales.lastSaleAt)],
        ]} />
      </Card>
      <Card title="Pedidos recentes">
        {orders.length ? orders.slice(0, 8).map((order) => <p key={String(order.id)}>{order.id} | {money(Number(order.total || 0))} | {dateText(order.createdAt)}</p>) : <EmptyState text="Nenhum pedido vinculado no periodo analisado." />}
      </Card>
    </div>
  );
}

function ImagesTab({ images, product }: { images: Array<Record<string, any>>; product: ProductRecord }) {
  const rows = images.length ? images : product.mainImageUrl ? [{ id: 'main', url: product.mainImageUrl, altText: product.name, isMain: true }] : [];
  return (
    <div className="product-images-grid">
      {rows.map((image) => (
        <Card key={String(image.id)}>
          <img src={String(image.url)} alt={String(image.altText || '')} />
          <p>{image.altText || 'Sem texto alternativo'}</p>
          {image.isMain && <Badge tone="primary">Principal</Badge>}
        </Card>
      ))}
      {!rows.length && <EmptyState text="Produto sem imagens cadastradas." />}
    </div>
  );
}

function AuditTab({ logs }: { logs: Array<Record<string, any>> }) {
  return (
    <Table>
      <table>
        <thead><tr><th>Data</th><th>Acao</th><th>Ator</th><th>Resultado</th><th>Descricao</th></tr></thead>
        <tbody>
          {logs.map((log) => (
            <tr key={String(log.id)}><td>{dateText(String(log.created_at || log.createdAt || ''))}</td><td>{String(log.action || '')}</td><td>{String(log.actor_name || log.actorUserId || '')}</td><td>{String(log.outcome || 'success')}</td><td>{String(log.description || '')}</td></tr>
          ))}
          {!logs.length && <tr><td colSpan={5}>Nenhum log de auditoria encontrado.</td></tr>}
        </tbody>
      </table>
    </Table>
  );
}

function KeyValueGrid({ rows }: { rows: Array<[string, any]> }) {
  return (
    <div className="product-key-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value || 'Nao informado'}</strong>
        </div>
      ))}
    </div>
  );
}

function Pagination({ page, totalPages, total, hasPrev, hasNext, onPrev, onNext }: {
  page: number; totalPages: number; total: number; hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void;
}) {
  return (
    <div className="product-pagination">
      <span>{total} produtos | pagina {page} de {totalPages}</span>
      <div><Button onClick={onPrev} disabled={!hasPrev}>Anterior</Button><Button onClick={onNext} disabled={!hasNext}>Proxima</Button></div>
    </div>
  );
}

function ProductSkeleton() {
  return <div className="product-skeleton">{Array.from({ length: 6 }).map((_, index) => <span key={index} />)}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="product-empty"><strong>{text}</strong><span>Os dados permanecem filtrados por tenant e permissao.</span></div>;
}
