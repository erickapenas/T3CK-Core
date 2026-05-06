import { useEffect, useMemo, useState } from 'react';
import {
  AdminSessionUser,
  AuditLogFilters,
  AuditLogRecord,
  AuditStats,
  auditApi,
} from '../apiClient';
import { Badge, Button, Card, Dropdown, Input, Modal, Table, Tabs } from '../design-system/components/primitives';
import '../styles/AuditLogsPage.css';

type AuditLogsPageProps = {
  tenantId: string;
  currentUser: AdminSessionUser;
};

type AuditListData = {
  items: AuditLogRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  stats: AuditStats;
};

const tabs = [
  { id: 'all', label: 'Todos os logs' },
  { id: 'security', label: 'Seguranca' },
  { id: 'exports', label: 'Exportacoes' },
  { id: 'critical', label: 'Eventos criticos' },
  { id: 'actor', label: 'Por usuario' },
  { id: 'resource', label: 'Por recurso' },
  { id: 'alerts', label: 'Alertas' },
  { id: 'retention', label: 'Retencao' },
];

const categoryOptions = [
  '',
  'security',
  'users',
  'tenants',
  'customers',
  'products',
  'inventory',
  'orders',
  'payments',
  'fiscal',
  'integrations',
  'themes',
  'reports',
  'settings',
  'system',
];

const periodOptions = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last7', label: 'Ultimos 7 dias' },
  { value: 'last15', label: 'Ultimos 15 dias' },
  { value: 'last30', label: 'Ultimos 30 dias' },
  { value: 'thisMonth', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes passado' },
  { value: 'custom', label: 'Personalizado' },
];

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

function formatDate(value?: string): string {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function usePermission(user: AdminSessionUser) {
  return (permission: string): boolean => user.role === 'admin' || Boolean(user.permissions?.includes(permission));
}

function severityTone(severity?: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (severity === 'critical' || severity === 'error') return 'danger';
  if (severity === 'warning') return 'warning';
  if (severity === 'notice') return 'primary';
  return 'default';
}

function outcomeTone(outcome?: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (outcome === 'success') return 'success';
  if (outcome === 'failure' || outcome === 'denied') return 'danger';
  if (outcome === 'partial' || outcome === 'pending') return 'warning';
  return 'default';
}

function cleanFilters(filters: AuditLogFilters): AuditLogFilters {
  return Object.entries(filters).reduce((acc, [key, value]) => {
    if (value !== '' && value !== undefined && value !== null) {
      (acc as Record<string, unknown>)[key] = value;
    }
    return acc;
  }, {} as AuditLogFilters);
}

export function AuditLogsPage({ tenantId, currentUser }: AuditLogsPageProps) {
  const can = usePermission(currentUser);
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState<AuditLogFilters>({ page: 1, limit: 15, period: 'last30' });
  const [draftFilters, setDraftFilters] = useState<AuditLogFilters>({ page: 1, limit: 15, period: 'last30' });
  const [data, setData] = useState<AuditListData | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const [alerts, setAlerts] = useState<Array<Record<string, any>>>([]);
  const [retention, setRetention] = useState<Array<Record<string, any>>>([]);
  const [integrityChecks, setIntegrityChecks] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(false);
  const [sideLoading, setSideLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const effectiveFilters = useMemo(() => {
    const next = { ...filters };
    if (activeTab === 'security') next.isSecurityEvent = true;
    if (activeTab === 'exports') next.isExportEvent = true;
    if (activeTab === 'critical') next.criticalOnly = true;
    if (activeTab === 'actor' && currentUser.id) next.actorId = filters.actorId || currentUser.id;
    return cleanFilters(next);
  }, [activeTab, currentUser.id, filters]);

  const loadLogs = async () => {
    if (!can('visualizar_logs_auditoria')) {
      setError('Voce nao possui permissao para visualizar logs de auditoria.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result =
        activeTab === 'security'
          ? await auditApi.security(effectiveFilters, tenantId)
          : activeTab === 'exports'
            ? await auditApi.exports(effectiveFilters, tenantId)
            : await auditApi.list(effectiveFilters, tenantId);

      if (!result.success) {
        setError(result.error || 'Nao foi possivel carregar os logs de auditoria.');
        return;
      }
      setData(result.data);
    } finally {
      setLoading(false);
    }
  };

  const loadSideData = async () => {
    setSideLoading(true);
    try {
      if (activeTab === 'alerts') {
        const result = await auditApi.alerts(tenantId);
        if (result.success) setAlerts(result.data || []);
      }
      if (activeTab === 'retention') {
        const [policyRes, checksRes] = await Promise.all([
          auditApi.retentionPolicy(tenantId),
          auditApi.integrityChecks(tenantId),
        ]);
        if (policyRes.success) setRetention(policyRes.data || []);
        if (checksRes.success) setIntegrityChecks(checksRes.data || []);
      }
    } finally {
      setSideLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'alerts' || activeTab === 'retention') {
      loadSideData();
      return;
    }
    loadLogs();
  }, [tenantId, activeTab, filters.page, filters.limit]);

  const applyFilters = () => {
    const next = { ...draftFilters, page: 1, limit: filters.limit || 15 };
    setFilters(next);
    if (activeTab !== 'alerts' && activeTab !== 'retention') {
      loadLogs();
    }
  };

  const clearFilters = () => {
    const next = { page: 1, limit: 15, period: 'last30' as const };
    setDraftFilters(next);
    setFilters(next);
  };

  const openDetails = async (log: AuditLogRecord) => {
    if (!can('visualizar_detalhes_log')) {
      setError('Voce nao tem permissao para visualizar detalhes deste log.');
      return;
    }

    setError(null);
    const result = await auditApi.get(log.id, tenantId);
    if (!result.success) {
      setError(result.error || 'Nao foi possivel carregar o detalhe do log.');
      return;
    }
    setSelectedLog(result.data);
  };

  const exportLogs = async (format: 'csv' | 'json') => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await auditApi.exportLogs(effectiveFilters, format, tenantId);
      if (!result.success) {
        setError(result.error || 'Nao foi possivel exportar os logs.');
        return;
      }
      setSuccess(`Exportacao ${result.data.id} criada. Use a aba Exportacoes para acompanhar.`);
      await loadLogs();
    } finally {
      setLoading(false);
    }
  };

  const copyValue = async (value?: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setSuccess('Identificador copiado.');
  };

  const runIntegrityCheck = async () => {
    setSideLoading(true);
    try {
      const result = await auditApi.runIntegrityCheck(effectiveFilters, tenantId);
      if (!result.success) {
        setError(result.error || 'Falha na verificacao de integridade.');
        return;
      }
      setSuccess('Verificacao de integridade concluida.');
      await loadSideData();
    } finally {
      setSideLoading(false);
    }
  };

  const saveRetention = async () => {
    setSideLoading(true);
    try {
      const result = await auditApi.saveRetentionPolicy(retention, tenantId);
      if (!result.success) {
        setError(result.error || 'Nao foi possivel salvar a politica de retencao.');
        return;
      }
      setRetention(result.data || []);
      setSuccess('Politica de retencao salva.');
    } finally {
      setSideLoading(false);
    }
  };

  if (!can('visualizar_logs_auditoria')) {
    return (
      <div className="audit-page">
        <Card title="Logs de Auditoria" eyebrow="Permissao">
          <p>Voce nao possui permissao para visualizar logs de auditoria deste tenant.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="audit-page">
      <div className="audit-toolbar">
        <div>
          <span className="audit-eyebrow">Governanca, seguranca e rastreabilidade</span>
          <h2>Logs de Auditoria</h2>
          <p>
            Consulte eventos append-only por tenant, com mascaramento de dados sensiveis,
            correlation_id, request_id, hash e trilha por recurso ou usuario.
          </p>
        </div>
        <div className="audit-actions">
          <Button onClick={activeTab === 'alerts' || activeTab === 'retention' ? loadSideData : loadLogs}>
            Atualizar
          </Button>
          {can('exportar_logs_auditoria') && (
            <>
              <Button onClick={() => exportLogs('csv')}>Exportar CSV</Button>
              <Button onClick={() => exportLogs('json')}>Exportar JSON</Button>
            </>
          )}
        </div>
      </div>

      {error && <div className="audit-alert audit-alert--error">{error}</div>}
      {success && <div className="audit-alert audit-alert--success">{success}</div>}

      <section className="audit-kpis">
        <AuditKpi label="Eventos" value={data?.stats?.total || 0} />
        <AuditKpi label="Criticos" value={data?.stats?.critical || 0} tone="danger" />
        <AuditKpi label="Falhas" value={data?.stats?.failures || 0} tone="warning" />
        <AuditKpi label="Acessos negados" value={data?.stats?.denied || 0} tone="danger" />
        <AuditKpi label="Exportacoes" value={data?.stats?.exports || 0} tone="primary" />
        <AuditKpi label="Sensiveis" value={data?.stats?.sensitive || 0} tone="warning" />
      </section>

      <Card title="Filtros avancados" eyebrow="Aplicados no backend">
        <div className="audit-filter-grid">
          <Input
            placeholder="Buscar por acao, ator, recurso, ID ou correlation_id"
            value={draftFilters.search || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
          />
          <Dropdown
            value={draftFilters.period || 'last30'}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, period: event.target.value as AuditLogFilters['period'] }))
            }
          >
            {periodOptions.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </Dropdown>
          <Dropdown
            value={draftFilters.category || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, category: event.target.value }))}
          >
            {categoryOptions.map((category) => (
              <option key={category || 'all'} value={category}>
                {category || 'Todas categorias'}
              </option>
            ))}
          </Dropdown>
          <Input
            placeholder="Acao padronizada"
            value={draftFilters.action || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, action: event.target.value }))}
          />
          <Dropdown
            value={draftFilters.severity || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, severity: event.target.value as any }))}
          >
            <option value="">Todas severidades</option>
            <option value="info">info</option>
            <option value="notice">notice</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
            <option value="critical">critical</option>
          </Dropdown>
          <Dropdown
            value={draftFilters.outcome || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, outcome: event.target.value as any }))}
          >
            <option value="">Todos resultados</option>
            <option value="success">success</option>
            <option value="failure">failure</option>
            <option value="denied">denied</option>
            <option value="partial">partial</option>
            <option value="pending">pending</option>
          </Dropdown>
          <Input
            placeholder="Actor ID"
            value={draftFilters.actorId || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, actorId: event.target.value }))}
          />
          <Input
            placeholder="Tipo de recurso"
            value={draftFilters.resourceType || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, resourceType: event.target.value }))}
          />
          <Input
            placeholder="ID do recurso"
            value={draftFilters.resourceId || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, resourceId: event.target.value }))}
          />
          <Input
            placeholder="IP"
            value={draftFilters.ipAddress || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, ipAddress: event.target.value }))}
          />
          <Input
            placeholder="Correlation ID"
            value={draftFilters.correlationId || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, correlationId: event.target.value }))}
          />
          <Input
            placeholder="Endpoint"
            value={draftFilters.endpoint || ''}
            onChange={(event) => setDraftFilters((current) => ({ ...current, endpoint: event.target.value }))}
          />
        </div>
        <div className="audit-filter-checks">
          <label><input type="checkbox" checked={Boolean(draftFilters.failuresOnly)} onChange={(event) => setDraftFilters((current) => ({ ...current, failuresOnly: event.target.checked }))} /> Apenas falhas</label>
          <label><input type="checkbox" checked={Boolean(draftFilters.criticalOnly)} onChange={(event) => setDraftFilters((current) => ({ ...current, criticalOnly: event.target.checked }))} /> Apenas criticos</label>
          <label><input type="checkbox" checked={Boolean(draftFilters.isSensitive)} onChange={(event) => setDraftFilters((current) => ({ ...current, isSensitive: event.target.checked }))} /> Evento sensivel</label>
          <label><input type="checkbox" checked={Boolean(draftFilters.isSecurityEvent)} onChange={(event) => setDraftFilters((current) => ({ ...current, isSecurityEvent: event.target.checked }))} /> Seguranca</label>
          <label><input type="checkbox" checked={Boolean(draftFilters.isExportEvent)} onChange={(event) => setDraftFilters((current) => ({ ...current, isExportEvent: event.target.checked }))} /> Exportacao</label>
        </div>
        <div className="audit-actions audit-actions--filters">
          <Button tone="primary" onClick={applyFilters}>Aplicar filtros</Button>
          <Button onClick={clearFilters}>Limpar filtros</Button>
        </div>
      </Card>

      <Card title="Eventos de auditoria" eyebrow="Append-only">
        <Tabs tabs={tabs} active={activeTab} onChange={(tab) => {
          setActiveTab(tab);
          setFilters((current) => ({ ...current, page: 1 }));
        }} />

        {activeTab === 'alerts' ? (
          <AuditAlerts alerts={alerts} loading={sideLoading} onResolve={async (id) => {
            const result = await auditApi.resolveAlert(id, tenantId);
            if (!result.success) setError(result.error || 'Nao foi possivel resolver o alerta.');
            await loadSideData();
          }} />
        ) : activeTab === 'retention' ? (
          <AuditRetention
            retention={retention}
            setRetention={setRetention}
            integrityChecks={integrityChecks}
            loading={sideLoading}
            canManage={can('gerenciar_retencao_auditoria')}
            canIntegrity={can('executar_verificacao_integridade_logs')}
            onSave={saveRetention}
            onIntegrity={runIntegrityCheck}
          />
        ) : (
          <AuditTable
            data={data}
            loading={loading}
            onDetails={openDetails}
            onCopy={copyValue}
            onPage={(page) => setFilters((current) => ({ ...current, page }))}
          />
        )}
      </Card>

      <AuditDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} onCopy={copyValue} />
    </div>
  );
}

function AuditKpi({ label, value, tone = 'default' }: { label: string; value: number; tone?: string }) {
  return (
    <Card className={`audit-kpi audit-kpi--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}

function AuditTable({
  data,
  loading,
  onDetails,
  onCopy,
  onPage,
}: {
  data: AuditListData | null;
  loading: boolean;
  onDetails: (log: AuditLogRecord) => void;
  onCopy: (value?: string) => void;
  onPage: (page: number) => void;
}) {
  if (loading) return <AuditSkeleton />;
  if (!data?.items?.length) return <AuditEmptyState message="Nenhum log encontrado para os filtros selecionados." />;

  return (
    <>
      <Table>
        <table>
          <thead>
            <tr>
              <th>Data/hora</th>
              <th>Severidade</th>
              <th>Categoria</th>
              <th>Acao</th>
              <th>Resultado</th>
              <th>Ator</th>
              <th>Recurso</th>
              <th>IP</th>
              <th>Origem</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((log) => (
              <tr key={log.id}>
                <td>{formatDate(log.created_at || log.createdAt)}</td>
                <td><Badge tone={severityTone(log.severity)}>{log.severity}</Badge></td>
                <td>{log.category}</td>
                <td>
                  <strong>{log.action}</strong>
                  <span>{log.description}</span>
                </td>
                <td><Badge tone={outcomeTone(log.outcome)}>{log.outcome}</Badge></td>
                <td>
                  <strong>{log.actor_name || log.actor_id}</strong>
                  <span>{log.actor_type}</span>
                </td>
                <td>
                  <strong>{log.resource_label || log.resource_type || 'Sistema'}</strong>
                  <span>{log.resource_id || log.module}</span>
                </td>
                <td>{log.ip_address || 'Nao informado'}</td>
                <td>{log.origin || 'web'}</td>
                <td>
                  <div className="audit-row-actions">
                    <Button onClick={() => onDetails(log)}>Detalhes</Button>
                    <Button onClick={() => onCopy(log.correlation_id)}>Copiar CID</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Table>
      <div className="audit-pagination">
        <span>
          Pagina {data.pagination.page} de {data.pagination.totalPages} - {data.pagination.total} eventos
        </span>
        <div>
          <Button disabled={!data.pagination.hasPreviousPage} onClick={() => onPage(data.pagination.page - 1)}>
            Anterior
          </Button>
          <Button disabled={!data.pagination.hasNextPage} onClick={() => onPage(data.pagination.page + 1)}>
            Proxima
          </Button>
        </div>
      </div>
    </>
  );
}

function AuditDetailsModal({
  log,
  onClose,
  onCopy,
}: {
  log: AuditLogRecord | null;
  onClose: () => void;
  onCopy: (value?: string) => void;
}) {
  if (!log) return null;
  return (
    <Modal open title="Detalhes do log de auditoria" onClose={onClose}>
      <div className="audit-details">
        <section>
          <h4>Resumo</h4>
          <p>Data/hora: {formatDate(log.created_at || log.createdAt)}</p>
          <p>Acao: {log.action}</p>
          <p>Categoria: {log.category}</p>
          <p>Resultado: {log.outcome}</p>
          <p>Descricao: {log.description}</p>
        </section>
        <section>
          <h4>Ator</h4>
          <p>Tipo: {log.actor_type}</p>
          <p>Nome: {log.actor_name || log.actor_id}</p>
          <p>E-mail: {log.actor_email_masked || 'Nao informado'}</p>
        </section>
        <section>
          <h4>Contexto</h4>
          <p>Tenant: {log.tenant_id}</p>
          <p>IP: {log.ip_address || 'Nao informado'}</p>
          <p>Endpoint: {log.http_method || ''} {log.endpoint || 'Nao informado'}</p>
          <p>Status code: {log.status_code || 'Nao informado'}</p>
          <p>Request ID: <button type="button" onClick={() => onCopy(log.request_id)}>{log.request_id || 'Nao informado'}</button></p>
          <p>Correlation ID: <button type="button" onClick={() => onCopy(log.correlation_id)}>{log.correlation_id}</button></p>
        </section>
        <section>
          <h4>Recurso</h4>
          <p>Tipo: {log.resource_type || 'Sistema'}</p>
          <p>ID: {log.resource_id || 'Nao informado'}</p>
          <p>Rotulo: {log.resource_label || 'Nao informado'}</p>
        </section>
        <section className="audit-details-wide">
          <h4>Diff antes/depois</h4>
          <AuditDiff before={log.before_data_masked} after={log.after_data_masked} fields={log.changed_fields || []} />
        </section>
        <section className="audit-details-wide">
          <h4>Metadata sanitizada</h4>
          <pre>{JSON.stringify(log.metadata_json || {}, null, 2)}</pre>
        </section>
        <section className="audit-details-wide">
          <h4>Integridade</h4>
          <p>Hash: {log.hash}</p>
          <p>Previous hash: {log.previous_hash || 'Inicio da cadeia ou log legado'}</p>
        </section>
      </div>
    </Modal>
  );
}

function AuditDiff({
  before,
  after,
  fields,
}: {
  before?: Record<string, any>;
  after?: Record<string, any>;
  fields: string[];
}) {
  const allFields = fields.length ? fields : Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
  if (!allFields.length) return <AuditEmptyState message="Este evento nao possui before/after detalhado." />;
  return (
    <Table>
      <table>
        <thead>
          <tr>
            <th>Campo</th>
            <th>Antes</th>
            <th>Depois</th>
          </tr>
        </thead>
        <tbody>
          {allFields.map((field) => (
            <tr key={field}>
              <td>{field}</td>
              <td><code>{JSON.stringify(before?.[field] ?? '')}</code></td>
              <td><code>{JSON.stringify(after?.[field] ?? '')}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Table>
  );
}

function AuditAlerts({
  alerts,
  loading,
  onResolve,
}: {
  alerts: Array<Record<string, any>>;
  loading: boolean;
  onResolve: (id: string) => void;
}) {
  if (loading) return <AuditSkeleton />;
  if (!alerts.length) return <AuditEmptyState message="Nenhum alerta de auditoria em aberto." />;
  return (
    <div className="audit-alert-list">
      {alerts.map((alert) => (
        <div className="audit-alert-card" key={alert.id}>
          <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
          <div>
            <strong>{alert.title}</strong>
            <p>{alert.description}</p>
            <span>Status: {alert.status} - {formatDate(alert.created_at)}</span>
          </div>
          {alert.status !== 'resolvido' && <Button onClick={() => onResolve(alert.id)}>Resolver</Button>}
        </div>
      ))}
    </div>
  );
}

function AuditRetention({
  retention,
  setRetention,
  integrityChecks,
  loading,
  canManage,
  canIntegrity,
  onSave,
  onIntegrity,
}: {
  retention: Array<Record<string, any>>;
  setRetention: (value: Array<Record<string, any>>) => void;
  integrityChecks: Array<Record<string, any>>;
  loading: boolean;
  canManage: boolean;
  canIntegrity: boolean;
  onSave: () => void;
  onIntegrity: () => void;
}) {
  if (loading) return <AuditSkeleton />;
  return (
    <div className="audit-retention">
      <div className="audit-retention-grid">
        {retention.map((policy, index) => (
          <div className="audit-retention-card" key={policy.id || policy.category || index}>
            <strong>{policy.category}</strong>
            <label>
              Retencao em dias
              <Input
                type="number"
                disabled={!canManage}
                value={policy.retention_days || 180}
                onChange={(event) => {
                  const next = [...retention];
                  next[index] = { ...policy, retention_days: Number(event.target.value) };
                  setRetention(next);
                }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                disabled={!canManage}
                checked={Boolean(policy.archive_enabled)}
                onChange={(event) => {
                  const next = [...retention];
                  next[index] = { ...policy, archive_enabled: event.target.checked };
                  setRetention(next);
                }}
              />
              Arquivamento automatico
            </label>
          </div>
        ))}
      </div>
      <div className="audit-actions">
        {canManage && <Button tone="primary" onClick={onSave}>Salvar retencao</Button>}
        {canIntegrity && <Button onClick={onIntegrity}>Verificar integridade</Button>}
      </div>
      <Table>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Status</th>
              <th>Logs verificados</th>
              <th>Falhas</th>
            </tr>
          </thead>
          <tbody>
            {integrityChecks.map((check) => (
              <tr key={check.id}>
                <td>{formatDate(check.created_at)}</td>
                <td><Badge tone={check.status === 'valid' ? 'success' : 'danger'}>{check.status}</Badge></td>
                <td>{check.checked_logs_count}</td>
                <td>{check.failed_logs_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Table>
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="audit-skeleton">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function AuditEmptyState({ message }: { message: string }) {
  return (
    <div className="audit-empty">
      <strong>{message}</strong>
      <span>Refine os filtros ou aguarde novas acoes auditaveis no tenant.</span>
    </div>
  );
}
