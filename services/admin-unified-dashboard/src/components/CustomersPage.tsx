import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import {
  AdminSessionUser,
  CustomerCrmRecord,
  CustomerDetails,
  CustomerListFilters,
  CustomerRiskStatus,
  CustomerStatus,
  customerCrmApi,
} from '../apiClient';
import { Badge, Button, Card, Dropdown, Input, Table, Tabs } from '../design-system/components/primitives';
import '../styles/CustomersPage.css';

type CustomersPageProps = {
  tenantId: string;
  currentUser: AdminSessionUser;
  onOpenOrders: () => void;
};

type CustomerListData = {
  items: CustomerCrmRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  segments?: Record<string, number>;
};

type CustomerView = 'list' | 'create' | 'edit' | 'details';

const emptyCustomer: Partial<CustomerCrmRecord> = {
  customerType: 'pf',
  name: '',
  email: '',
  phone: '',
  documentNumber: '',
  status: 'novo',
  source: 'Cadastro manual',
  acquisitionChannel: '',
  city: '',
  state: '',
  tags: [],
  acceptsEmailMarketing: false,
  acceptsWhatsappMarketing: false,
  acceptsSmsMarketing: false,
  riskStatus: 'normal',
};

const statusOptions: Array<{ value: CustomerStatus | ''; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'novo', label: 'Novo' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'recorrente', label: 'Recorrente' },
  { value: 'vip', label: 'VIP' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'bloqueado', label: 'Bloqueado' },
  { value: 'em_analise', label: 'Em analise' },
  { value: 'descadastrado', label: 'Descadastrado' },
  { value: 'anonimizado', label: 'Anonimizado' },
];

const detailTabs = [
  { id: 'overview', label: 'Visao geral' },
  { id: 'profile', label: 'Dados cadastrais' },
  { id: 'contacts', label: 'Contatos' },
  { id: 'addresses', label: 'Enderecos' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'products', label: 'Produtos comprados' },
  { id: 'financial', label: 'Financeiro' },
  { id: 'tags', label: 'Tags' },
  { id: 'notes', label: 'Observacoes' },
  { id: 'consents', label: 'Consentimentos' },
  { id: 'privacy', label: 'LGPD' },
  { id: 'audit', label: 'Auditoria' },
];

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatMoney(value?: number): string {
  return currency.format(Number(value || 0));
}

function formatDate(value?: string): string {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
}

function badgeTone(status?: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (status === 'vip' || status === 'recorrente') return 'success';
  if (status === 'bloqueado' || status === 'anonimizado') return 'danger';
  if (status === 'em_analise' || status === 'inativo') return 'warning';
  if (status === 'novo') return 'primary';
  return 'default';
}

function normalizeTags(value?: string[] | string): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function usePermission(user: AdminSessionUser) {
  return (permission: string): boolean => user.role === 'admin' || Boolean(user.permissions?.includes(permission));
}

export function CustomersPage({ tenantId, currentUser, onOpenOrders }: CustomersPageProps) {
  const can = usePermission(currentUser);
  const [view, setView] = useState<CustomerView>('list');
  const [filters, setFilters] = useState<CustomerListFilters>({ page: 1, limit: 10 });
  const [draftFilters, setDraftFilters] = useState<CustomerListFilters>({ page: 1, limit: 10 });
  const [listData, setListData] = useState<CustomerListData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<CustomerDetails | null>(null);
  const [formData, setFormData] = useState<Partial<CustomerCrmRecord>>(emptyCustomer);
  const [activeTab, setActiveTab] = useState('overview');
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [financial, setFinancial] = useState<Record<string, any> | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [riskReason, setRiskReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const summaryCards = useMemo(() => {
    const segments = listData?.segments || {};
    return [
      { label: 'Clientes', value: listData?.pagination.total || 0 },
      { label: 'Novos', value: segments.novo || 0 },
      { label: 'Recorrentes', value: segments.recorrente || 0 },
      { label: 'VIP', value: segments.vip || 0 },
      { label: 'Bloqueados', value: segments.bloqueado || 0 },
    ];
  }, [listData]);

  const loadCustomers = async (nextFilters = filters) => {
    if (!can('visualizar_clientes')) {
      setError('Voce nao tem permissao para visualizar clientes.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await customerCrmApi.list(nextFilters, tenantId);
      if (!result.success) {
        setError(result.error || 'Nao foi possivel carregar os clientes.');
        return;
      }
      setListData(result.data);
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (customerId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const result = await customerCrmApi.get(customerId, tenantId);
      if (!result.success) {
        setError(result.error || 'Nao foi possivel carregar os detalhes do cliente.');
        return;
      }
      setDetails(result.data);
      setSelectedId(customerId);
      setActiveTab('overview');
      setView('details');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers(filters);
  }, [tenantId, filters.page, filters.limit]);

  useEffect(() => {
    if (!selectedId || view !== 'details') return;

    const loadTabData = async () => {
      if (activeTab === 'orders') {
        const result = await customerCrmApi.orders(selectedId, 1, 20, tenantId);
        if (result.success) setOrders(result.data.items || result.data || []);
      }
      if (activeTab === 'products') {
        const result = await customerCrmApi.products(selectedId, tenantId);
        if (result.success) setProducts(result.data || []);
      }
      if (activeTab === 'financial') {
        const result = await customerCrmApi.financial(selectedId, tenantId);
        if (result.success) setFinancial(result.data);
      }
    };

    loadTabData();
  }, [activeTab, selectedId, tenantId, view]);

  const applyFilters = () => {
    const next = { ...draftFilters, page: 1, limit: filters.limit || 10 };
    setFilters(next);
    loadCustomers(next);
  };

  const clearFilters = () => {
    const next = { page: 1, limit: 10 };
    setDraftFilters(next);
    setFilters(next);
    loadCustomers(next);
  };

  const openCreate = () => {
    setFormData(emptyCustomer);
    setSelectedId(null);
    setView('create');
  };

  const openEdit = (customer: CustomerCrmRecord) => {
    setFormData({
      ...customer,
      documentNumber: customer.documentNumber || customer.document_number || customer.document || customer.cpfCnpj || '',
      tags: customer.tags || [],
    });
    setSelectedId(customer.id);
    setView('edit');
  };

  const saveCustomer = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...formData,
        tags: normalizeTags(formData.tags),
      };
      const result =
        view === 'edit' && selectedId
          ? await customerCrmApi.update(selectedId, payload, tenantId)
          : await customerCrmApi.create(payload, tenantId);

      if (!result.success) {
        setError(result.error || 'Nao foi possivel salvar o cliente.');
        return;
      }

      setSuccess('Cliente salvo com sucesso.');
      setView('list');
      await loadCustomers(filters);
    } finally {
      setLoading(false);
    }
  };

  const exportCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await customerCrmApi.exportList(filters, tenantId);
      if (!result.success) {
        setError(result.error || 'Nao foi possivel exportar clientes.');
        return;
      }
      const blob = new Blob([result.data.content], { type: result.data.contentType || 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.data.fileName || 'clientes.csv';
      link.click();
      URL.revokeObjectURL(url);
      setSuccess('Exportacao gerada respeitando os filtros atuais.');
    } finally {
      setLoading(false);
    }
  };

  const reloadSelectedCustomer = async () => {
    if (!selectedId) return;
    await loadDetails(selectedId);
    await loadCustomers(filters);
  };

  const addTag = async () => {
    if (!selectedId || !tagInput.trim()) return;
    const result = await customerCrmApi.addTag(selectedId, tagInput.trim(), tenantId);
    if (!result.success) {
      setError(result.error || 'Nao foi possivel adicionar a tag.');
      return;
    }
    setTagInput('');
    await reloadSelectedCustomer();
  };

  const addNote = async () => {
    if (!selectedId || !noteInput.trim()) return;
    const result = await customerCrmApi.addNote(
      selectedId,
      { type: 'geral', note: noteInput.trim(), visibility: 'interna' },
      tenantId
    );
    if (!result.success) {
      setError(result.error || 'Nao foi possivel adicionar a observacao.');
      return;
    }
    setNoteInput('');
    await reloadSelectedCustomer();
  };

  const updateRisk = async (riskStatus: CustomerRiskStatus) => {
    if (!selectedId) return;
    const result = await customerCrmApi.updateRiskStatus(
      selectedId,
      { riskStatus, reason: riskReason },
      tenantId
    );
    if (!result.success) {
      setError(result.error || 'Nao foi possivel atualizar risco.');
      return;
    }
    setRiskReason('');
    await reloadSelectedCustomer();
  };

  const anonymizeCustomer = async () => {
    if (!selectedId) return;
    const confirmed = window.confirm('Anonimizar este cliente? Esta acao mascara dados pessoais e registra auditoria.');
    if (!confirmed) return;
    const result = await customerCrmApi.anonymize(selectedId, tenantId);
    if (!result.success) {
      setError(result.error || 'Nao foi possivel anonimizar o cliente.');
      return;
    }
    await reloadSelectedCustomer();
  };

  if (!can('visualizar_clientes')) {
    return (
      <div className="customers-page">
        <Card title="Clientes" eyebrow="Permissao">
          <p>Voce nao tem permissao para acessar o CRM de clientes deste tenant.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="customers-page">
      <div className="customers-toolbar">
        <div>
          <span className="customers-eyebrow">CRM leve para e-commerce</span>
          <h2>Clientes</h2>
          <p>
            Consulta, segmentacao, privacidade e historico comercial sempre filtrados por tenant.
          </p>
        </div>
        <div className="customers-actions">
          <Button onClick={() => loadCustomers(filters)}>Atualizar</Button>
          {can('exportar_clientes') && <Button onClick={exportCustomers}>Exportar CSV</Button>}
          {can('criar_clientes') && (
            <Button tone="primary" onClick={openCreate}>
              Novo cliente
            </Button>
          )}
        </div>
      </div>

      {error && <div className="customers-alert customers-alert--error">{error}</div>}
      {success && <div className="customers-alert customers-alert--success">{success}</div>}

      {view === 'list' && (
        <>
          <section className="customers-kpis">
            {summaryCards.map((card) => (
              <Card key={card.label} className="customer-kpi">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </Card>
            ))}
          </section>

          <Card title="Busca e filtros" eyebrow="Backend filters">
            <div className="customer-filter-grid">
              <Input
                placeholder="Nome, e-mail, telefone, CPF/CNPJ ou ID"
                value={draftFilters.search || ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, search: event.target.value }))
                }
              />
              <Dropdown
                value={draftFilters.status || ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    status: event.target.value as CustomerStatus | '',
                  }))
                }
              >
                {statusOptions.map((status) => (
                  <option key={status.value || 'all'} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Dropdown>
              <Dropdown
                value={draftFilters.customerType || ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    customerType: event.target.value as 'pf' | 'pj' | '',
                  }))
                }
              >
                <option value="">Pessoa fisica e juridica</option>
                <option value="pf">Pessoa fisica</option>
                <option value="pj">Pessoa juridica</option>
              </Dropdown>
              <Input
                placeholder="Cidade"
                value={draftFilters.city || ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, city: event.target.value }))
                }
              />
              <Input
                placeholder="UF"
                maxLength={2}
                value={draftFilters.state || ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, state: event.target.value.toUpperCase() }))
                }
              />
              <Input
                placeholder="Origem"
                value={draftFilters.source || ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, source: event.target.value }))
                }
              />
              <Input
                placeholder="Tag"
                value={draftFilters.tag || ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, tag: event.target.value }))
                }
              />
              <Dropdown
                value={draftFilters.hasOrders || ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    hasOrders: event.target.value as 'with' | 'without' | '',
                  }))
                }
              >
                <option value="">Com ou sem pedidos</option>
                <option value="with">Com pedidos</option>
                <option value="without">Sem pedidos</option>
              </Dropdown>
            </div>
            <div className="customer-filter-actions">
              <Button tone="primary" onClick={applyFilters}>
                Aplicar filtros
              </Button>
              <Button onClick={clearFilters}>Limpar filtros</Button>
            </div>
          </Card>

          <Card title="Listagem de clientes" eyebrow="Dados mascarados por padrao">
            {loading ? (
              <CustomerSkeleton />
            ) : listData?.items?.length ? (
              <>
                <Table>
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Contato</th>
                        <th>Documento</th>
                        <th>Status</th>
                        <th>Cidade/UF</th>
                        <th>Pedidos</th>
                        <th>Total gasto</th>
                        <th>Ticket medio</th>
                        <th>Ultima compra</th>
                        <th>Origem</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listData.items.map((customer) => (
                        <tr key={customer.id}>
                          <td>
                            <strong>{customer.name}</strong>
                            <span>{customer.customerType === 'pj' ? 'Pessoa juridica' : 'Pessoa fisica'}</span>
                          </td>
                          <td>
                            <span>{customer.email || 'Sem e-mail'}</span>
                            <span>{customer.phone || 'Sem telefone'}</span>
                          </td>
                          <td>{customer.documentNumber || customer.document || customer.cpfCnpj || 'Nao informado'}</td>
                          <td>
                            <Badge tone={badgeTone(customer.status)}>{customer.status || 'ativo'}</Badge>
                          </td>
                          <td>{[customer.city, customer.state].filter(Boolean).join('/') || 'Nao informado'}</td>
                          <td>{customer.totalOrders || 0}</td>
                          <td>{formatMoney(customer.totalSpent)}</td>
                          <td>{formatMoney(customer.averageTicket)}</td>
                          <td>{formatDate(customer.lastOrderAt)}</td>
                          <td>{customer.source || customer.origin || 'Manual'}</td>
                          <td>
                            <div className="customer-row-actions">
                              <Button onClick={() => loadDetails(customer.id)}>Detalhes</Button>
                              {can('editar_clientes') && <Button onClick={() => openEdit(customer)}>Editar</Button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Table>
                <div className="customer-pagination">
                  <span>
                    Pagina {listData.pagination.page} de {listData.pagination.totalPages} -{' '}
                    {listData.pagination.total} clientes
                  </span>
                  <div>
                    <Button
                      disabled={!listData.pagination.hasPreviousPage}
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          page: Math.max(1, Number(current.page || 1) - 1),
                        }))
                      }
                    >
                      Anterior
                    </Button>
                    <Button
                      disabled={!listData.pagination.hasNextPage}
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          page: Number(current.page || 1) + 1,
                        }))
                      }
                    >
                      Proxima
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <CustomerEmptyState message="Nenhum cliente encontrado para os filtros selecionados." />
            )}
          </Card>
        </>
      )}

      {(view === 'create' || view === 'edit') && (
        <Card
          title={view === 'create' ? 'Novo cliente' : 'Editar cliente'}
          eyebrow="Cadastro"
          actions={<Button onClick={() => setView('list')}>Voltar</Button>}
        >
          <CustomerForm formData={formData} setFormData={setFormData} />
          <div className="customer-form-actions">
            <Button onClick={() => setView('list')}>Cancelar</Button>
            <Button tone="primary" disabled={loading} onClick={saveCustomer}>
              Salvar cliente
            </Button>
          </div>
        </Card>
      )}

      {view === 'details' && (
        <CustomerDetailsPanel
          details={details}
          loading={detailLoading}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          orders={orders}
          products={products}
          financial={financial}
          can={can}
          tagInput={tagInput}
          setTagInput={setTagInput}
          noteInput={noteInput}
          setNoteInput={setNoteInput}
          riskReason={riskReason}
          setRiskReason={setRiskReason}
          onBack={() => setView('list')}
          onEdit={() => details?.customer && openEdit(details.customer)}
          onOpenOrders={onOpenOrders}
          onAddTag={addTag}
          onAddNote={addNote}
          onUpdateRisk={updateRisk}
          onAnonymize={anonymizeCustomer}
          onRevokeConsent={async () => {
            if (!selectedId) return;
            const result = await customerCrmApi.revokeConsent(selectedId, tenantId);
            if (!result.success) {
              setError(result.error || 'Nao foi possivel revogar consentimento.');
              return;
            }
            await reloadSelectedCustomer();
          }}
          onPrivacyRequest={async () => {
            if (!selectedId) return;
            const result = await customerCrmApi.createPrivacyRequest(
              selectedId,
              { type: 'acesso', notes: 'Solicitacao registrada pelo painel administrativo.' },
              tenantId
            );
            if (!result.success) {
              setError(result.error || 'Nao foi possivel registrar solicitacao LGPD.');
              return;
            }
            await reloadSelectedCustomer();
          }}
        />
      )}
    </div>
  );
}

function CustomerForm({
  formData,
  setFormData,
}: {
  formData: Partial<CustomerCrmRecord>;
  setFormData: Dispatch<SetStateAction<Partial<CustomerCrmRecord>>>;
}) {
  const setField = (field: keyof CustomerCrmRecord, value: any) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="customer-form-grid">
      <label>
        Tipo
        <Dropdown
          value={formData.customerType || 'pf'}
          onChange={(event) => setField('customerType', event.target.value)}
        >
          <option value="pf">Pessoa fisica</option>
          <option value="pj">Pessoa juridica</option>
        </Dropdown>
      </label>
      <label>
        Nome
        <Input value={formData.name || ''} onChange={(event) => setField('name', event.target.value)} />
      </label>
      <label>
        E-mail
        <Input value={formData.email || ''} onChange={(event) => setField('email', event.target.value)} />
      </label>
      <label>
        Telefone
        <Input value={formData.phone || ''} onChange={(event) => setField('phone', event.target.value)} />
      </label>
      <label>
        CPF/CNPJ
        <Input
          value={formData.documentNumber || ''}
          onChange={(event) => setField('documentNumber', event.target.value)}
        />
      </label>
      <label>
        Status
        <Dropdown
          value={formData.status || 'novo'}
          onChange={(event) => setField('status', event.target.value)}
        >
          {statusOptions
            .filter((status) => status.value)
            .map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
        </Dropdown>
      </label>
      <label>
        Origem
        <Input value={formData.source || ''} onChange={(event) => setField('source', event.target.value)} />
      </label>
      <label>
        Canal de aquisicao
        <Input
          value={formData.acquisitionChannel || ''}
          onChange={(event) => setField('acquisitionChannel', event.target.value)}
        />
      </label>
      <label>
        Cidade
        <Input value={formData.city || ''} onChange={(event) => setField('city', event.target.value)} />
      </label>
      <label>
        UF
        <Input
          maxLength={2}
          value={formData.state || ''}
          onChange={(event) => setField('state', event.target.value.toUpperCase())}
        />
      </label>
      <label>
        Tags
        <Input
          value={(formData.tags || []).join(', ')}
          onChange={(event) => setField('tags', normalizeTags(event.target.value))}
        />
      </label>
      <label>
        Status de risco
        <Dropdown
          value={formData.riskStatus || 'normal'}
          onChange={(event) => setField('riskStatus', event.target.value)}
        >
          <option value="normal">Normal</option>
          <option value="em_analise">Em analise</option>
          <option value="alto_risco">Alto risco</option>
          <option value="bloqueado">Bloqueado</option>
          <option value="liberado_manualmente">Liberado manualmente</option>
        </Dropdown>
      </label>
      <label className="customer-form-wide">
        Observacoes internas
        <textarea
          className="ds-input"
          rows={4}
          value={formData.internalNotes || ''}
          onChange={(event) => setField('internalNotes', event.target.value)}
        />
      </label>
      <div className="customer-consent-row customer-form-wide">
        <label>
          <input
            type="checkbox"
            checked={Boolean(formData.acceptsEmailMarketing)}
            onChange={(event) => setField('acceptsEmailMarketing', event.target.checked)}
          />
          Aceita e-mail marketing
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(formData.acceptsWhatsappMarketing)}
            onChange={(event) => setField('acceptsWhatsappMarketing', event.target.checked)}
          />
          Aceita WhatsApp marketing
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(formData.acceptsSmsMarketing)}
            onChange={(event) => setField('acceptsSmsMarketing', event.target.checked)}
          />
          Aceita SMS marketing
        </label>
      </div>
    </div>
  );
}

function CustomerDetailsPanel({
  details,
  loading,
  activeTab,
  setActiveTab,
  orders,
  products,
  financial,
  can,
  tagInput,
  setTagInput,
  noteInput,
  setNoteInput,
  riskReason,
  setRiskReason,
  onBack,
  onEdit,
  onOpenOrders,
  onAddTag,
  onAddNote,
  onUpdateRisk,
  onAnonymize,
  onRevokeConsent,
  onPrivacyRequest,
}: {
  details: CustomerDetails | null;
  loading: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  orders: any[];
  products: any[];
  financial: Record<string, any> | null;
  can: (permission: string) => boolean;
  tagInput: string;
  setTagInput: (value: string) => void;
  noteInput: string;
  setNoteInput: (value: string) => void;
  riskReason: string;
  setRiskReason: (value: string) => void;
  onBack: () => void;
  onEdit: () => void;
  onOpenOrders: () => void;
  onAddTag: () => void;
  onAddNote: () => void;
  onUpdateRisk: (riskStatus: CustomerRiskStatus) => void;
  onAnonymize: () => void;
  onRevokeConsent: () => void;
  onPrivacyRequest: () => void;
}) {
  if (loading || !details) {
    return (
      <Card title="Detalhes do cliente" actions={<Button onClick={onBack}>Voltar</Button>}>
        <CustomerSkeleton />
      </Card>
    );
  }

  const customer = details.customer;
  const summary = details.summary;
  const blocked = customer.status === 'bloqueado' || customer.riskStatus === 'bloqueado';

  return (
    <div className="customer-details">
      <Card
        title={customer.name}
        eyebrow="Detalhes do cliente"
        actions={
          <div className="customers-actions">
            <Button onClick={onBack}>Voltar</Button>
            {can('editar_clientes') && <Button onClick={onEdit}>Editar</Button>}
            <Button onClick={onOpenOrders}>Ver pedidos</Button>
          </div>
        }
      >
        {blocked && (
          <div className="customers-alert customers-alert--error">
            Cliente bloqueado ou em alto risco. Revise o historico antes de novas operacoes.
          </div>
        )}
        <div className="customer-profile-head">
          <div className="customer-avatar">{customer.name?.slice(0, 2).toUpperCase() || 'CL'}</div>
          <div>
            <div className="customer-badges">
              <Badge tone={badgeTone(customer.status)}>{customer.status || 'ativo'}</Badge>
              <Badge>{customer.customerType === 'pj' ? 'Pessoa juridica' : 'Pessoa fisica'}</Badge>
              <Badge tone={badgeTone(customer.riskStatus)}>{customer.riskStatus || 'normal'}</Badge>
            </div>
            <p>
              Cliente desde {formatDate(customer.createdAt)} - Ultima compra {formatDate(summary.lastOrderAt)}
            </p>
          </div>
        </div>
      </Card>

      <section className="customer-summary-grid">
        <Card>
          <span>Total gasto</span>
          <strong>{formatMoney(summary.totalSpent)}</strong>
        </Card>
        <Card>
          <span>Pedidos</span>
          <strong>{summary.totalOrders}</strong>
        </Card>
        <Card>
          <span>Ticket medio</span>
          <strong>{formatMoney(summary.averageTicket)}</strong>
        </Card>
        <Card>
          <span>Produtos comprados</span>
          <strong>{summary.productsPurchased}</strong>
        </Card>
        <Card>
          <span>Pedidos cancelados</span>
          <strong>{summary.cancelledOrdersCount}</strong>
        </Card>
        <Card>
          <span>Tempo entre compras</span>
          <strong>{summary.averageDaysBetweenOrders ?? 'Dados insuficientes'}</strong>
        </Card>
      </section>

      <Card title="CRM do cliente" eyebrow="Abas operacionais">
        <Tabs tabs={detailTabs} active={activeTab} onChange={setActiveTab} />
        <div className="customer-tab-panel">
          {activeTab === 'overview' && (
            <OverviewTab customer={customer} summary={summary} products={products} />
          )}
          {activeTab === 'profile' && <ProfileTab customer={customer} />}
          {activeTab === 'contacts' && <SimpleList title="Contatos" rows={details.contacts} />}
          {activeTab === 'addresses' && <SimpleList title="Enderecos" rows={details.addresses} />}
          {activeTab === 'orders' && <OrdersTab rows={orders} />}
          {activeTab === 'products' && <ProductsTab rows={products} />}
          {activeTab === 'financial' && <FinancialTab data={financial} summary={summary} />}
          {activeTab === 'tags' && (
            <TagsTab
              tags={details.tags}
              tagInput={tagInput}
              setTagInput={setTagInput}
              canManage={can('gerenciar_tags_cliente')}
              onAddTag={onAddTag}
            />
          )}
          {activeTab === 'notes' && (
            <NotesTab
              rows={details.notes}
              noteInput={noteInput}
              setNoteInput={setNoteInput}
              canManage={can('gerenciar_observacoes_cliente')}
              onAddNote={onAddNote}
            />
          )}
          {activeTab === 'consents' && (
            <ConsentsTab rows={details.consents} canManage={can('gerenciar_consentimentos_cliente')} onRevoke={onRevokeConsent} />
          )}
          {activeTab === 'privacy' && (
            <PrivacyTab
              rows={details.privacyRequests}
              canExport={can('exportar_clientes')}
              canAnonymize={can('anonimizar_clientes')}
              onPrivacyRequest={onPrivacyRequest}
              onAnonymize={onAnonymize}
            />
          )}
          {activeTab === 'audit' && <AuditTab rows={details.auditLogs} canView={can('visualizar_logs_cliente')} />}
        </div>
      </Card>

      {can('bloquear_cliente') && (
        <Card title="Risco e bloqueio" eyebrow="Controle operacional">
          <div className="customer-risk-actions">
            <Input
              placeholder="Motivo ou observacao de risco"
              value={riskReason}
              onChange={(event) => setRiskReason(event.target.value)}
            />
            <Button tone="warning" onClick={() => onUpdateRisk('em_analise')}>
              Marcar em analise
            </Button>
            <Button tone="danger" onClick={() => onUpdateRisk('bloqueado')}>
              Bloquear
            </Button>
            <Button tone="success" onClick={() => onUpdateRisk('liberado_manualmente')}>
              Liberar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function OverviewTab({
  customer,
  summary,
  products,
}: {
  customer: CustomerCrmRecord;
  summary: CustomerDetails['summary'];
  products: any[];
}) {
  const alerts = [
    summary.lastOrderAt ? '' : 'Cliente sem compras registradas.',
    customer.status === 'vip' ? 'Cliente VIP.' : '',
    customer.status === 'bloqueado' ? 'Cliente bloqueado.' : '',
    !customer.acceptsEmailMarketing && !customer.acceptsWhatsappMarketing
      ? 'Cliente sem consentimento de marketing.'
      : '',
    !customer.email || !customer.phone ? 'Dados cadastrais incompletos.' : '',
  ].filter(Boolean);

  return (
    <div className="customer-detail-grid">
      <div>
        <h4>Resumo</h4>
        <p>Origem: {customer.source || customer.origin || 'Nao informada'}</p>
        <p>Cidade/UF: {[customer.city, customer.state].filter(Boolean).join('/') || 'Nao informado'}</p>
        <p>Primeira compra: {formatDate(summary.firstOrderAt)}</p>
        <p>Maior compra: {formatMoney(summary.highestOrder)}</p>
        <p>Forma de pagamento favorita: {summary.favoritePaymentMethod || 'Dados insuficientes'}</p>
      </div>
      <div>
        <h4>Alertas</h4>
        {alerts.length ? alerts.map((alert) => <p key={alert}>{alert}</p>) : <p>Nenhum alerta comercial.</p>}
      </div>
      <div>
        <h4>Produtos em destaque</h4>
        {products.slice(0, 4).map((product) => (
          <p key={product.productId || product.sku}>{product.name} - {product.quantity} un.</p>
        ))}
        {!products.length && <p>Abra a aba Produtos comprados para carregar o ranking.</p>}
      </div>
    </div>
  );
}

function ProfileTab({ customer }: { customer: CustomerCrmRecord }) {
  return (
    <div className="customer-detail-grid">
      <p>Nome: {customer.name}</p>
      <p>E-mail: {customer.email || 'Nao informado'}</p>
      <p>Telefone: {customer.phone || 'Nao informado'}</p>
      <p>Documento: {customer.documentNumber || customer.document || 'Nao informado'}</p>
      <p>Status: {customer.status || 'ativo'}</p>
      <p>Origem: {customer.source || customer.origin || 'Nao informada'}</p>
      <p>Canal de aquisicao: {customer.acquisitionChannel || 'Nao informado'}</p>
      <p>Cadastrado em: {formatDate(customer.createdAt)}</p>
      <p>Atualizado em: {formatDate(customer.updatedAt)}</p>
    </div>
  );
}

function SimpleList({ title, rows }: { title: string; rows: Array<Record<string, any>> }) {
  if (!rows.length) return <CustomerEmptyState message={`Nenhum registro em ${title.toLowerCase()}.`} />;
  return (
    <Table>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Descricao</th>
            <th>Status</th>
            <th>Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.type || row.label || 'registro'}</td>
              <td>
                {row.value ||
                  [row.street, row.number, row.city, row.state].filter(Boolean).join(', ') ||
                  row.recipientName ||
                  'Sem descricao'}
              </td>
              <td>{row.status || (row.isDefault ? 'padrao' : 'ativo')}</td>
              <td>{formatDate(row.updatedAt || row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Table>
  );
}

function OrdersTab({ rows }: { rows: any[] }) {
  if (!rows.length) return <CustomerEmptyState message="Nenhum pedido vinculado a este cliente." />;
  return (
    <Table>
      <table>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Data</th>
            <th>Canal</th>
            <th>Status</th>
            <th>Pagamento</th>
            <th>Total</th>
            <th>Itens</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((order) => (
            <tr key={order.id}>
              <td>{order.orderNumber || order.id}</td>
              <td>{formatDate(order.createdAt)}</td>
              <td>{order.channel || order.marketplace || 'Loja propria'}</td>
              <td>{order.status}</td>
              <td>{order.paymentStatus || 'Nao informado'}</td>
              <td>{formatMoney(order.total)}</td>
              <td>{order.items?.length || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Table>
  );
}

function ProductsTab({ rows }: { rows: any[] }) {
  if (!rows.length) return <CustomerEmptyState message="Nenhum produto comprado encontrado." />;
  return (
    <Table>
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>SKU</th>
            <th>Categoria</th>
            <th>Quantidade</th>
            <th>Total gasto</th>
            <th>Pedidos</th>
            <th>Ultima compra</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((product) => (
            <tr key={product.productId || product.sku || product.name}>
              <td>{product.name}</td>
              <td>{product.sku || 'Sem SKU'}</td>
              <td>{product.category || 'Nao informada'}</td>
              <td>{product.quantity}</td>
              <td>{formatMoney(product.totalSpent)}</td>
              <td>{product.orders}</td>
              <td>{formatDate(product.lastPurchasedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Table>
  );
}

function FinancialTab({ data, summary }: { data: Record<string, any> | null; summary: CustomerDetails['summary'] }) {
  const source = data || summary;
  return (
    <div className="customer-detail-grid">
      <p>Total gasto: {formatMoney(source.totalSpent)}</p>
      <p>Total pago: {formatMoney(source.totalPaid)}</p>
      <p>Total pendente: {formatMoney(source.totalPending)}</p>
      <p>Total cancelado: {formatMoney(source.totalCancelled)}</p>
      <p>Ticket medio: {formatMoney(source.averageTicket)}</p>
      <p>Maior pedido: {formatMoney(source.highestOrder)}</p>
      <p>Menor pedido: {formatMoney(source.lowestOrder)}</p>
      <p>Pagamentos aprovados: {data?.approvedPayments ?? summary.paidOrders}</p>
      {(source.missingFields || summary.missingFields || []).map((field: any) => (
        <p key={`${field.metric}-${field.field}`}>Dados insuficientes: {field.metric} depende de {field.collection}.{field.field}</p>
      ))}
    </div>
  );
}

function TagsTab({
  tags,
  tagInput,
  setTagInput,
  canManage,
  onAddTag,
}: {
  tags: string[];
  tagInput: string;
  setTagInput: (value: string) => void;
  canManage: boolean;
  onAddTag: () => void;
}) {
  return (
    <div className="customer-stack">
      <div className="customer-badges">
        {tags.length ? tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span>Nenhuma tag aplicada.</span>}
      </div>
      {canManage && (
        <div className="customer-inline-form">
          <Input value={tagInput} placeholder="Nova tag" onChange={(event) => setTagInput(event.target.value)} />
          <Button tone="primary" onClick={onAddTag}>Adicionar tag</Button>
        </div>
      )}
    </div>
  );
}

function NotesTab({
  rows,
  noteInput,
  setNoteInput,
  canManage,
  onAddNote,
}: {
  rows: Array<Record<string, any>>;
  noteInput: string;
  setNoteInput: (value: string) => void;
  canManage: boolean;
  onAddNote: () => void;
}) {
  return (
    <div className="customer-stack">
      {rows.length ? (
        rows.map((note) => (
          <div className="customer-note" key={note.id}>
            <strong>{note.type || 'geral'}</strong>
            <p>{note.note}</p>
            <span>{formatDate(note.createdAt)}</span>
          </div>
        ))
      ) : (
        <CustomerEmptyState message="Nenhuma observacao interna cadastrada." />
      )}
      {canManage && (
        <div className="customer-inline-form">
          <textarea
            className="ds-input"
            rows={3}
            value={noteInput}
            placeholder="Nova observacao interna"
            onChange={(event) => setNoteInput(event.target.value)}
          />
          <Button tone="primary" onClick={onAddNote}>Adicionar observacao</Button>
        </div>
      )}
    </div>
  );
}

function ConsentsTab({
  rows,
  canManage,
  onRevoke,
}: {
  rows: Array<Record<string, any>>;
  canManage: boolean;
  onRevoke: () => void;
}) {
  return (
    <div className="customer-stack">
      <SimpleList title="Consentimentos" rows={rows} />
      {canManage && <Button tone="warning" onClick={onRevoke}>Revogar marketing</Button>}
    </div>
  );
}

function PrivacyTab({
  rows,
  canExport,
  canAnonymize,
  onPrivacyRequest,
  onAnonymize,
}: {
  rows: Array<Record<string, any>>;
  canExport: boolean;
  canAnonymize: boolean;
  onPrivacyRequest: () => void;
  onAnonymize: () => void;
}) {
  return (
    <div className="customer-stack">
      <p>
        LGPD: registre solicitacoes do titular, preserve historico transacional necessario e prefira
        anonimizar quando exclusao completa comprometer obrigações legais.
      </p>
      <SimpleList title="Solicitacoes LGPD" rows={rows} />
      <div className="customer-inline-form">
        {canExport && <Button onClick={onPrivacyRequest}>Registrar solicitacao de acesso</Button>}
        {canAnonymize && <Button tone="danger" onClick={onAnonymize}>Anonimizar cliente</Button>}
      </div>
    </div>
  );
}

function AuditTab({ rows, canView }: { rows: Array<Record<string, any>>; canView: boolean }) {
  if (!canView) return <CustomerEmptyState message="Sem permissao para visualizar logs deste cliente." />;
  return <SimpleList title="Auditoria" rows={rows.map((row) => ({ ...row, type: row.action, value: row.fieldChanged || row.newValueMasked }))} />;
}

function CustomerSkeleton() {
  return (
    <div className="customer-skeleton">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function CustomerEmptyState({ message }: { message: string }) {
  return (
    <div className="customer-empty">
      <strong>{message}</strong>
      <span>Use filtros, cadastre um novo cliente ou aguarde dados importados por pedidos existentes.</span>
    </div>
  );
}
