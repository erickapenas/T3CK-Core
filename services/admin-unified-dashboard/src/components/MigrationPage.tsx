import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AdminSessionUser,
  MigrationAccessMethod,
  MigrationColumnMapping,
  MigrationConnectionPayload,
  MigrationModuleKey,
  MigrationNormalizedRecord,
  MigrationPipelineSnapshot,
  MigrationRecord,
  MigrationProject,
  MigrationSourcePlatform,
  migrationApi,
} from '../apiClient';
import '../styles/MigrationPage.css';

type MigrationPageProps = {
  tenantId: string;
  currentUser: AdminSessionUser;
};

const platformOptions: Array<{ value: MigrationSourcePlatform; label: string }> = [
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'nuvemshop', label: 'Nuvemshop' },
  { value: 'tray', label: 'Tray' },
  { value: 'vtex', label: 'VTEX' },
  { value: 'loja_integrada', label: 'Loja Integrada' },
  { value: 'magento', label: 'Magento' },
  { value: 'csv', label: 'CSV' },
  { value: 'xml', label: 'XML' },
  { value: 'merchant_feed', label: 'Merchant Feed' },
  { value: 'sitemap', label: 'Sitemap' },
  { value: 'other', label: 'Outra' },
];

const accessOptions: Array<{ value: MigrationAccessMethod; label: string }> = [
  { value: 'api', label: 'API oficial' },
  { value: 'file', label: 'Arquivo CSV/XML/JSON/XLSX' },
  { value: 'feed', label: 'Feed comercial' },
  { value: 'sitemap', label: 'Sitemap' },
  { value: 'public_read', label: 'Leitura publica assistida' },
  { value: 'manual', label: 'Mapeamento manual' },
];

const moduleOptions: Array<{ value: MigrationModuleKey; label: string }> = [
  { value: 'catalog', label: 'Catalogo' },
  { value: 'customers', label: 'Clientes' },
  { value: 'orders', label: 'Historico de pedidos' },
  { value: 'seo', label: 'SEO' },
  { value: 'layout', label: 'Layout equivalente' },
  { value: 'content', label: 'Paginas e conteudo' },
  { value: 'redirects', label: 'Redirects 301' },
];

const initialModules: MigrationModuleKey[] = [
  'catalog',
  'customers',
  'orders',
  'seo',
  'layout',
  'content',
  'redirects',
];

function isSuccess<T>(result: { success?: boolean; data?: T; error?: string }): result is {
  success: true;
  data: T;
} {
  return Boolean(result.success);
}

function unwrap<T>(result: { success?: boolean; data?: T; error?: string }, fallback: string): T {
  if (!isSuccess<T>(result)) {
    throw new Error(result.error || fallback);
  }
  return result.data;
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function numberValue(value?: number): string {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

type NormalizedPreview = {
  module: MigrationModuleKey;
  targetResourceType: string;
  fields: Record<string, unknown>;
  columnMappings: Array<{ target: string; source?: string; required: boolean; confidence: string }>;
  warnings: string[];
};

type MigrationConnectionState = MigrationConnectionPayload & {
  apiKey: string;
  accessToken: string;
  consumerKey: string;
  consumerSecret: string;
  feedUrl: string;
  fileName: string;
  fileContentBase64: string;
  contentType: string;
  authorizationConfirmed: boolean;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function previewFromRecord(record: MigrationRecord): NormalizedPreview | null {
  const preview = record.metadata?.normalizedPreview;
  if (!preview || typeof preview !== 'object') return null;
  return preview as NormalizedPreview;
}

function sourceFieldsFromRecords(records: MigrationRecord[]): Record<MigrationModuleKey, string[]> {
  const grouped = {} as Record<MigrationModuleKey, string[]>;
  records.forEach((record) => {
    const fields = record.metadata?.sourceFields;
    if (!Array.isArray(fields)) return;
    const current = new Set(grouped[record.module] || []);
    fields.forEach((field) => {
      if (typeof field === 'string' && field.trim()) current.add(field);
    });
    grouped[record.module] = Array.from(current).sort();
  });
  return grouped;
}

function mappingKey(module: MigrationModuleKey, targetField: string): string {
  return `${module}:${targetField}`;
}

export function MigrationPage({ tenantId, currentUser }: MigrationPageProps) {
  const [projects, setProjects] = useState<MigrationProject[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [pipeline, setPipeline] = useState<MigrationPipelineSnapshot | null>(null);
  const [form, setForm] = useState({
    name: 'Migracao assistida',
    sourcePlatform: 'woocommerce' as MigrationSourcePlatform,
    sourceUrl: 'https://loja-exemplo.com',
    accessMethod: 'api' as MigrationAccessMethod,
    modules: initialModules,
    notes: '',
  });
  const [connection, setConnection] = useState<MigrationConnectionState>({
    apiKey: '',
    accessToken: '',
    consumerKey: '',
    consumerSecret: '',
    feedUrl: '',
    fileName: '',
    fileContentBase64: '',
    contentType: '',
    authorizationConfirmed: true,
  });

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) || projects[0] || null,
    [projects, selectedId]
  );

  async function refresh(nextSelectedId?: string): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const data = unwrap<MigrationProject[]>(
        await migrationApi.listProjects(tenantId),
        'Falha ao carregar projetos de migracao'
      );
      setProjects(data);
      setSelectedId(nextSelectedId || selectedId || data[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar migracao');
    } finally {
      setLoading(false);
    }
  }

  async function refreshPipeline(projectId?: string): Promise<void> {
    if (!projectId) {
      setPipeline(null);
      return;
    }
    try {
      const data = unwrap<MigrationPipelineSnapshot>(
        await migrationApi.pipeline(projectId, tenantId),
        'Falha ao carregar pipeline de migracao'
      );
      setPipeline(data);
    } catch {
      setPipeline(null);
    }
  }

  useEffect(() => {
    refresh();
  }, [tenantId]);

  useEffect(() => {
    refreshPipeline(selectedProject?.id);
  }, [tenantId, selectedProject?.id]);

  async function run(label: string, action: () => Promise<MigrationProject>, message: string): Promise<void> {
    setBusy(label);
    setError('');
    setStatus('');
    try {
      const project = await action();
      setStatus(message);
      await refresh(project.id);
      await refreshPipeline(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operacao de migracao');
    } finally {
      setBusy('');
    }
  }

  function toggleModule(module: MigrationModuleKey): void {
    setForm((current) => ({
      ...current,
      modules: current.modules.includes(module)
        ? current.modules.filter((item) => item !== module)
        : [...current.modules, module],
    }));
  }

  function createProject(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    run(
      'create',
      async () =>
        unwrap<MigrationProject>(
          await migrationApi.createProject(
            {
              name: form.name,
              sourcePlatform: form.sourcePlatform,
              sourceUrl: form.sourceUrl,
              accessMethod: form.accessMethod,
              modules: form.modules,
              notes: form.notes,
            },
            tenantId
          ),
          'Falha ao criar projeto'
        ),
      'Projeto de migracao criado.'
    );
  }

  function action(project: MigrationProject, step: string): void {
    const actions: Record<string, () => Promise<MigrationProject>> = {
      connect: async () => unwrap<MigrationProject>(await migrationApi.connect(project.id, connection, tenantId), 'Falha ao conectar origem'),
      discover: async () => unwrap<MigrationProject>(await migrationApi.discover(project.id, tenantId, connection), 'Falha na descoberta'),
      validate: async () => unwrap<MigrationProject>(await migrationApi.validate(project.id, tenantId), 'Falha na validacao'),
      import: async () => unwrap<MigrationProject>(await migrationApi.importToStaging(project.id, tenantId), 'Falha na importacao'),
      sync: async () => unwrap<MigrationProject>(await migrationApi.incrementalSync(project.id, tenantId), 'Falha no sync incremental'),
    };
    const messages: Record<string, string> = {
      connect: 'Origem conectada sem armazenar secrets em claro.',
      discover: 'Descoberta da loja concluida.',
      validate: 'Validacao concluida.',
      import: 'Importacao em homologacao concluida.',
      sync: 'Sync incremental registrado.',
    };
    run(step, actions[step], messages[step]);
  }

  function updateChecklist(project: MigrationProject, key: string, done: boolean): void {
    const checklist = project.goLiveChecklist.map((item) => ({
      key: item.key,
      done: item.key === key ? done : item.done,
    }));
    run(
      `checklist:${key}`,
      async () => unwrap<MigrationProject>(await migrationApi.updateChecklist(project.id, checklist, tenantId), 'Falha ao atualizar checklist'),
      'Checklist atualizado.'
    );
  }

  async function saveColumnMappings(
    project: MigrationProject,
    mappings: Array<{
      module: MigrationModuleKey;
      targetField: string;
      sourceField?: string;
      required?: boolean;
      confidence?: 'high' | 'medium' | 'low';
      status?: 'suggested' | 'confirmed' | 'ignored';
    }>
  ): Promise<void> {
    setBusy('column-mappings');
    setError('');
    setStatus('');
    try {
      unwrap<MigrationColumnMapping[]>(
        await migrationApi.saveColumnMappings(project.id, mappings, tenantId),
        'Falha ao salvar mapeamento de colunas'
      );
      setStatus('Mapeamento de colunas salvo.');
      await refreshPipeline(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar mapeamento de colunas');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="migration-page">
      <section className="migration-hero">
        <div>
          <span>Plugin de Migracao Assistida T3CK</span>
          <h2>Migracao controlada para o motor proprio T3CK</h2>
          <p>
            Exporta dados autorizados da plataforma atual, normaliza para o padrao T3CK, valida riscos
            e importa em homologacao antes do go-live. Backend, checkout, senhas, tokens e dados de cartao
            ficam fora do escopo.
          </p>
        </div>
        <div className="migration-hero-meta">
          <strong>{tenantId}</strong>
          <small>{currentUser.name || currentUser.username}</small>
        </div>
      </section>

      {error ? <div className="migration-alert error">{error}</div> : null}
      {status ? <div className="migration-alert success">{status}</div> : null}
      {loading ? <div className="migration-muted">Carregando projetos...</div> : null}

      <div className="migration-grid">
        <section className="migration-panel">
          <div className="migration-panel-head">
            <h3>Novo projeto</h3>
            <span>Homologacao primeiro</span>
          </div>
          <form className="migration-form" onSubmit={createProject}>
            <label>
              Nome
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Plataforma
              <select
                value={form.sourcePlatform}
                onChange={(event) => setForm({ ...form, sourcePlatform: event.target.value as MigrationSourcePlatform })}
              >
                {platformOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              URL da loja
              <input value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} />
            </label>
            <label>
              Metodo de acesso
              <select
                value={form.accessMethod}
                onChange={(event) => setForm({ ...form, accessMethod: event.target.value as MigrationAccessMethod })}
              >
                {accessOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="migration-wide">
              Observacoes
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
            <div className="migration-module-list">
              {moduleOptions.map((module) => (
                <label key={module.value}>
                  <input
                    type="checkbox"
                    checked={form.modules.includes(module.value)}
                    onChange={() => toggleModule(module.value)}
                  />
                  {module.label}
                </label>
              ))}
            </div>
            <button type="submit" disabled={busy === 'create'}>
              {busy === 'create' ? 'Criando...' : 'Criar projeto'}
            </button>
          </form>
        </section>

        <section className="migration-panel">
          <div className="migration-panel-head">
            <h3>Projetos</h3>
            <span>{projects.length} ativo(s)</span>
          </div>
          <div className="migration-project-list">
            {projects.map((project) => (
              <button
                type="button"
                key={project.id}
                className={selectedProject?.id === project.id ? 'active' : ''}
                onClick={() => setSelectedId(project.id)}
              >
                <strong>{project.name}</strong>
                <span>{project.sourcePlatform} - {project.status}</span>
                <small>{formatDate(project.updatedAt)}</small>
              </button>
            ))}
            {!projects.length ? <p className="migration-muted">Nenhum projeto criado.</p> : null}
          </div>
        </section>
      </div>

      {selectedProject ? (
        <ProjectWorkspace
          project={selectedProject}
          connection={connection}
          setConnection={setConnection}
          pipeline={pipeline}
          busy={busy}
          onAction={action}
          onChecklist={updateChecklist}
          onSaveColumnMappings={saveColumnMappings}
        />
      ) : null}
    </div>
  );
}

function ProjectWorkspace({
  project,
  connection,
  setConnection,
  pipeline,
  busy,
  onAction,
  onChecklist,
  onSaveColumnMappings,
}: {
  project: MigrationProject;
  connection: MigrationConnectionState;
  setConnection: (value: MigrationConnectionState) => void;
  pipeline: MigrationPipelineSnapshot | null;
  busy: string;
  onAction: (project: MigrationProject, step: string) => void;
  onChecklist: (project: MigrationProject, key: string, done: boolean) => void;
  onSaveColumnMappings: (
    project: MigrationProject,
    mappings: Array<{
      module: MigrationModuleKey;
      targetField: string;
      sourceField?: string;
      required?: boolean;
      confidence?: 'high' | 'medium' | 'low';
      status?: 'suggested' | 'confirmed' | 'ignored';
    }>
  ) => Promise<void>;
}) {
  const discovery = project.discovery;
  const validation = project.validation;
  const imported = project.importSummary;
  const previews = (pipeline?.records || [])
    .map(previewFromRecord)
    .filter((preview): preview is NormalizedPreview => Boolean(preview));
  const sourceFields = sourceFieldsFromRecords(pipeline?.records || []);

  async function handleFile(file?: File): Promise<void> {
    if (!file) return;
    const fileContentBase64 = await fileToBase64(file);
    setConnection({
      ...connection,
      fileName: file.name,
      fileContentBase64,
      contentType: file.type || 'application/octet-stream',
    });
  }

  return (
    <section className="migration-workspace">
      <div className="migration-panel migration-project-header">
        <div>
          <span className={`migration-status ${project.status}`}>{project.status}</span>
          <h3>{project.name}</h3>
          <p>{project.sourceUrl}</p>
        </div>
        <div className="migration-actions">
          <button type="button" onClick={() => onAction(project, 'connect')} disabled={busy === 'connect'}>
            Conectar
          </button>
          <button type="button" onClick={() => onAction(project, 'discover')} disabled={busy === 'discover'}>
            Descobrir
          </button>
          <button type="button" onClick={() => onAction(project, 'validate')} disabled={busy === 'validate'}>
            Validar
          </button>
          <button type="button" onClick={() => onAction(project, 'import')} disabled={busy === 'import'}>
            Importar homologacao
          </button>
          <button type="button" onClick={() => onAction(project, 'sync')} disabled={busy === 'sync'}>
            Sync incremental
          </button>
        </div>
      </div>

      <div className="migration-grid three">
        <div className="migration-panel">
          <div className="migration-panel-head">
            <h3>Conexao autorizada</h3>
            <span>{project.credentialsConfigured ? 'Configurada' : 'Pendente'}</span>
          </div>
          <div className="migration-form compact">
            <label>
              API key
              <input value={connection.apiKey} onChange={(event) => setConnection({ ...connection, apiKey: event.target.value })} />
            </label>
            <label>
              Access token
              <input
                type="password"
                value={connection.accessToken}
                onChange={(event) => setConnection({ ...connection, accessToken: event.target.value })}
              />
            </label>
            <label>
              Consumer key
              <input
                value={connection.consumerKey}
                onChange={(event) => setConnection({ ...connection, consumerKey: event.target.value })}
              />
            </label>
            <label>
              Consumer secret
              <input
                type="password"
                value={connection.consumerSecret}
                onChange={(event) => setConnection({ ...connection, consumerSecret: event.target.value })}
              />
            </label>
            <label>
              Feed URL
              <input value={connection.feedUrl} onChange={(event) => setConnection({ ...connection, feedUrl: event.target.value })} />
            </label>
            <label>
              Arquivo
              <input value={connection.fileName} onChange={(event) => setConnection({ ...connection, fileName: event.target.value })} />
            </label>
            <label>
              Upload
              <input
                type="file"
                accept=".csv,.json,.xls,.xlsx"
                onChange={(event) => handleFile(event.target.files?.[0]).catch(() => undefined)}
              />
            </label>
          </div>
          <p className="migration-muted">
            Secrets sao usados somente para validacao da origem. A API grava apenas flags e metadados saneados.
          </p>
        </div>

        <div className="migration-panel">
          <div className="migration-panel-head">
            <h3>Modulos</h3>
            <span>Normalizacao T3CK</span>
          </div>
          <div className="migration-module-status">
            {Object.entries(project.modules).map(([module, status]) => (
              <div key={module}>
                <span>{module}</span>
                <strong className={`migration-status ${status}`}>{status}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="migration-panel">
          <div className="migration-panel-head">
            <h3>Seguranca/LGPD</h3>
            <span>Fora do escopo</span>
          </div>
          <ul className="migration-security-list">
            <li>Sem migrar senhas.</li>
            <li>Sem dados de cartao.</li>
            <li>Sem tokens de pagamento.</li>
            <li>Sem copiar backend, checkout ou tema proprietario.</li>
            <li>Dados temporarios expiram em {formatDate(project.temporaryDataExpiresAt)}.</li>
          </ul>
        </div>
      </div>

      <div className="migration-grid three">
        <MetricPanel
          title="Descoberta"
          values={[
            ['Produtos', discovery?.products],
            ['Categorias', discovery?.categories],
            ['Imagens', discovery?.images],
            ['Clientes', discovery?.customers],
            ['Pedidos', discovery?.orders],
            ['URLs indexaveis', discovery?.indexableUrls],
          ]}
          footer={discovery ? `Complexidade ${discovery.complexity}` : 'Execute a descoberta da loja.'}
        />
        <MetricPanel
          title="Validacao"
          values={[
            ['Registros validos', validation?.validRecords],
            ['Alertas', validation?.warningRecords],
            ['Bloqueios', validation?.blockedRecords],
          ]}
          footer={validation ? `${validation.issues.length} inconsistencia(s) encontrada(s).` : 'Valide antes da importacao.'}
        />
        <MetricPanel
          title="Importacao"
          values={[
            ['Produtos', imported?.importedProducts],
            ['Clientes', imported?.importedCustomers],
            ['Pedidos', imported?.importedOrders],
            ['Paginas', imported?.importedPages],
            ['Redirects', imported?.createdRedirects],
          ]}
          footer={imported ? 'Dados importados em homologacao.' : 'Nada foi importado em producao.'}
        />
      </div>

      <div className="migration-grid">
        <MigrationPreviewPanel
          previews={previews}
          normalizedRecords={pipeline?.normalizedRecords || []}
          sourceFields={sourceFields}
          savedMappings={pipeline?.columnMappings || []}
          saving={busy === 'column-mappings'}
          onSave={(mappings) => onSaveColumnMappings(project, mappings)}
        />

        <section className="migration-panel">
          <div className="migration-panel-head">
            <h3>Inconsistencias</h3>
            <span>{validation?.issues.length || 0}</span>
          </div>
          <div className="migration-issue-list">
            {validation?.issues.map((issue) => (
              <article key={issue.id}>
                <span className={`migration-status ${issue.severity}`}>{issue.severity}</span>
                <strong>{issue.title}</strong>
                <p>{issue.description}</p>
                <small>{issue.recommendation}</small>
              </article>
            ))}
            {!validation?.issues.length ? <p className="migration-muted">Nenhuma validacao executada.</p> : null}
          </div>
        </section>

        <section className="migration-panel">
          <div className="migration-panel-head">
            <h3>Checklist de go-live</h3>
            <span>{project.goLiveChecklist.filter((item) => item.done).length}/{project.goLiveChecklist.length}</span>
          </div>
          <div className="migration-checklist">
            {project.goLiveChecklist.map((item) => (
              <label key={item.key}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(event) => onChecklist(project, item.key, event.target.checked)}
                />
                <span>{item.label}</span>
                {item.required ? <strong>Obrigatorio</strong> : <em>Opcional</em>}
              </label>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function compactValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 80);
  return String(value);
}

function MigrationPreviewPanel({
  previews,
  normalizedRecords,
  sourceFields,
  savedMappings,
  saving,
  onSave,
}: {
  previews: NormalizedPreview[];
  normalizedRecords: MigrationNormalizedRecord[];
  sourceFields: Record<MigrationModuleKey, string[]>;
  savedMappings: MigrationColumnMapping[];
  saving: boolean;
  onSave: (
    mappings: Array<{
      module: MigrationModuleKey;
      targetField: string;
      sourceField?: string;
      required?: boolean;
      confidence?: 'high' | 'medium' | 'low';
      status?: 'suggested' | 'confirmed' | 'ignored';
    }>
  ) => Promise<void>;
}) {
  const [draftMappings, setDraftMappings] = useState<Record<string, string>>({});
  const mappingByKey = useMemo(() => {
    const map = new Map<string, MigrationColumnMapping>();
    savedMappings.forEach((mapping) => map.set(mappingKey(mapping.module, mapping.targetField), mapping));
    return map;
  }, [savedMappings]);
  const uniqueMappings = useMemo(() => {
    const map = new Map<string, NormalizedPreview['columnMappings'][number] & { module: MigrationModuleKey }>();
    previews.forEach((preview) => {
      preview.columnMappings.forEach((mapping) => {
        const key = mappingKey(preview.module, mapping.target);
        if (!map.has(key)) map.set(key, { ...mapping, module: preview.module });
      });
    });
    return Array.from(map.values()).filter((mapping) => mapping.source || mapping.required);
  }, [previews]);
  const normalizedStats = useMemo(() => ({
    ready: normalizedRecords.filter((record) => record.status === 'ready').length,
    warning: normalizedRecords.filter((record) => record.status === 'warning').length,
    blocked: normalizedRecords.filter((record) => record.status === 'blocked').length,
    imported: normalizedRecords.filter((record) => record.status === 'imported').length,
  }), [normalizedRecords]);

  function selectedSource(module: MigrationModuleKey, targetField: string, suggested?: string): string {
    const key = mappingKey(module, targetField);
    return draftMappings[key] ?? mappingByKey.get(key)?.sourceField ?? suggested ?? '';
  }

  function saveMappings(): void {
    const payload = uniqueMappings.map((mapping) => ({
      module: mapping.module,
      targetField: mapping.target,
      sourceField: selectedSource(mapping.module, mapping.target, mapping.source) || undefined,
      required: mapping.required,
      confidence: selectedSource(mapping.module, mapping.target, mapping.source) ? 'high' as const : 'low' as const,
      status: selectedSource(mapping.module, mapping.target, mapping.source) ? 'confirmed' as const : 'ignored' as const,
    }));
    onSave(payload).catch(() => undefined);
  }

  return (
    <section className="migration-panel migration-preview-panel">
      <div className="migration-panel-head">
        <h3>Mapeamento e preview</h3>
        <span>{previews.length} amostra(s)</span>
      </div>
      {normalizedRecords.length ? (
        <div className="migration-normalized-strip">
          <span><strong>{normalizedStats.ready}</strong> prontos</span>
          <span><strong>{normalizedStats.warning}</strong> alertas</span>
          <span><strong>{normalizedStats.blocked}</strong> bloqueados</span>
          <span><strong>{normalizedStats.imported}</strong> homologados</span>
        </div>
      ) : null}
      {uniqueMappings.length ? (
        <div className="migration-column-mapper">
          {uniqueMappings.map((mapping) => {
            const key = mappingKey(mapping.module, mapping.target);
            const options = sourceFields[mapping.module] || [];
            return (
              <label key={key}>
                <span>{mapping.module}.{mapping.target}</span>
                <select
                  value={selectedSource(mapping.module, mapping.target, mapping.source)}
                  onChange={(event) => setDraftMappings((current) => ({ ...current, [key]: event.target.value }))}
                >
                  <option value="">Nao mapear</option>
                  {options.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          <button type="button" onClick={saveMappings} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar mapeamento'}
          </button>
        </div>
      ) : null}
      <div className="migration-preview-list">
        {previews.slice(0, 6).map((preview, index) => (
          <article key={`${preview.module}-${index}`}>
            <div className="migration-preview-title">
              <span className="migration-status ready">{preview.module}</span>
              <strong>{preview.targetResourceType}</strong>
            </div>
            <div className="migration-field-grid">
              {Object.entries(preview.fields)
                .slice(0, 8)
                .map(([field, value]) => (
                  <div key={field}>
                    <span>{field}</span>
                    <strong>{compactValue(value)}</strong>
                  </div>
                ))}
            </div>
            <div className="migration-mapping-list">
              {preview.columnMappings
                .filter((mapping) => mapping.source || mapping.required)
                .slice(0, 8)
                .map((mapping) => (
                  <span key={mapping.target}>
                    {mapping.target}: {mapping.source || 'pendente'}
                  </span>
                ))}
            </div>
            {preview.warnings.length ? (
              <p className="migration-muted">{preview.warnings.join(' | ')}</p>
            ) : null}
          </article>
        ))}
        {!previews.length ? <p className="migration-muted">Execute a descoberta para gerar amostras normalizadas.</p> : null}
      </div>
    </section>
  );
}

function MetricPanel({
  title,
  values,
  footer,
}: {
  title: string;
  values: Array<[string, number | undefined]>;
  footer: string;
}) {
  return (
    <section className="migration-panel">
      <div className="migration-panel-head">
        <h3>{title}</h3>
      </div>
      <div className="migration-metrics">
        {values.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{numberValue(value)}</strong>
          </div>
        ))}
      </div>
      <p className="migration-muted">{footer}</p>
    </section>
  );
}
