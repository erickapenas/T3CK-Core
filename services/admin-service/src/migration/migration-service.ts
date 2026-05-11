import { randomUUID } from 'crypto';
import type * as admin from 'firebase-admin';
import { AuditLogService } from '../audit/audit-log-service';
import { getFirestore, initializeFirestore } from '../firebase';
import { AdminSessionUser } from '../types';
import { defaultMigrationConnectorRegistry, MigrationConnectorRegistry } from './connectors';
import {
  MigrationConnector,
  MigrationConnectorCredentials,
  MigrationConnectorFetchResult,
  MigrationConnectorInput,
} from './connectors/types';
import {
  MigrationAccessMethod,
  MigrationChecklistItem,
  MigrationColumnMapping,
  MigrationDiscoverySummary,
  MigrationEvent,
  MigrationImportSummary,
  MigrationModuleKey,
  MigrationModuleStatus,
  MigrationNormalizedRecord,
  MigrationNormalizedRecordStatus,
  MigrationPipelineOperation,
  MigrationPipelineSnapshot,
  MigrationProject,
  MigrationRawBatch,
  MigrationRecord,
  MigrationRecordStatus,
  MigrationRun,
  MigrationRunStatus,
  MigrationSourceMapping,
  MigrationSourceResourceType,
  MigrationStoredValidationIssue,
  MigrationSourcePlatform,
  MigrationT3ckResourceType,
  MigrationImportResult,
  MigrationRedirect,
  MigrationValidationIssue,
  MigrationValidationSummary,
} from './types';
import { MigrationNormalizedPreview, normalizeMigrationRecord } from './normalizer';

const now = (): string => new Date().toISOString();
const randomId = (prefix: string): string => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 18)}`;

const allModules: MigrationModuleKey[] = [
  'catalog',
  'customers',
  'orders',
  'seo',
  'layout',
  'content',
  'redirects',
];

const defaultChecklist: MigrationChecklistItem[] = [
  { key: 'catalog_validated', label: 'Catalogo validado', done: false, required: true },
  { key: 'prices_validated', label: 'Precos validados', done: false, required: true },
  { key: 'stock_validated', label: 'Estoque validado', done: false, required: true },
  { key: 'customers_reviewed', label: 'Clientes revisados', done: false, required: true },
  { key: 'orders_imported', label: 'Historico comercial importado', done: false, required: false },
  { key: 'pages_recreated', label: 'Paginas recriadas', done: false, required: false },
  { key: 'layout_approved', label: 'Layout aprovado', done: false, required: true },
  { key: 'redirects_configured', label: 'Redirects 301 configurados', done: false, required: true },
  { key: 'new_sitemap_generated', label: 'Novo sitemap gerado', done: false, required: true },
  { key: 'checkout_tested', label: 'Checkout T3CK testado', done: false, required: true },
  { key: 'shipping_tested', label: 'Frete testado', done: false, required: true },
  { key: 'payment_tested', label: 'Pagamento testado', done: false, required: true },
  { key: 'rollback_plan', label: 'Plano de rollback definido', done: false, required: true },
];

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string | string[];
};

type MigrationConnectorPayload = Partial<
  Pick<
    MigrationConnectorInput,
    'feedUrl' | 'fileName' | 'fileContent' | 'fileContentBase64' | 'contentType' | 'timeoutMs' | 'perPage'
  >
> &
  MigrationConnectorCredentials & {
    authorizationConfirmed?: boolean;
  };

type MigrationColumnMappingInput = {
  module: MigrationModuleKey;
  targetField: string;
  sourceField?: string;
  required?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  status?: 'suggested' | 'confirmed' | 'ignored';
};

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)])
    );
  }
  return value;
}

function headerValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value.join(', ') : value;
}

function normalizeModules(selected?: MigrationModuleKey[]): Record<MigrationModuleKey, MigrationModuleStatus> {
  return allModules.reduce(
    (acc, module) => {
      acc[module] = !selected || selected.includes(module) ? 'pending' : 'blocked';
      return acc;
    },
    {} as Record<MigrationModuleKey, MigrationModuleStatus>
  );
}

function selectedModules(project: MigrationProject): MigrationModuleKey[] {
  return allModules.filter((module) => project.modules[module] !== 'blocked');
}

function resourceTypeForModule(module: MigrationModuleKey): MigrationSourceResourceType {
  const map: Record<MigrationModuleKey, MigrationSourceResourceType> = {
    catalog: 'product',
    customers: 'customer',
    orders: 'order',
    seo: 'url',
    layout: 'layout',
    content: 'page',
    redirects: 'redirect',
  };
  return map[module];
}

function countForModule(module: MigrationModuleKey, discovery?: MigrationDiscoverySummary): number {
  if (!discovery) return 0;
  const map: Record<MigrationModuleKey, number> = {
    catalog: discovery.products,
    customers: discovery.customers,
    orders: discovery.orders,
    seo: discovery.indexableUrls,
    layout: discovery.pages,
    content: discovery.pages,
    redirects: discovery.redirects,
  };
  return map[module] || 0;
}

function seedFrom(value: string): number {
  return Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 80);
  return normalized || randomUUID().replace(/-/g, '').slice(0, 12);
}

function isEmptyField(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function mappingKeyForService(module: MigrationModuleKey, targetField: string): string {
  return `${module}:${targetField}`;
}

function countNormalizedByModule(
  records: MigrationNormalizedRecord[],
  module: MigrationModuleKey,
  status: MigrationNormalizedRecordStatus | MigrationNormalizedRecordStatus[]
): number {
  const statuses = Array.isArray(status) ? status : [status];
  return records.filter((record) => record.module === module && statuses.includes(record.status)).length;
}

export class MigrationService {
  constructor(
    private readonly auditLogService = new AuditLogService(),
    private readonly connectorRegistry: MigrationConnectorRegistry = defaultMigrationConnectorRegistry
  ) {
    initializeFirestore();
  }

  private firestore(): admin.firestore.Firestore {
    const firestore = getFirestore();
    if (!firestore) throw new Error('Firestore is required for migration persistence');
    return firestore;
  }

  private collection(tenantId: string, name: string): admin.firestore.CollectionReference {
    return this.firestore().collection(`tenants/${tenantId}/admin/data/${name}`);
  }

  private docTo<T extends { id: string }>(doc: admin.firestore.DocumentSnapshot): T {
    return { id: doc.id, ...doc.data() } as T;
  }

  private buildConnectorInput(project: MigrationProject, payload: MigrationConnectorPayload = {}): MigrationConnectorInput {
    return {
      sourcePlatform: project.sourcePlatform,
      sourceUrl: project.sourceUrl,
      accessMethod: project.accessMethod,
      modules: selectedModules(project),
      credentials: {
        apiKey: payload.apiKey,
        accessToken: payload.accessToken,
        consumerKey: payload.consumerKey,
        consumerSecret: payload.consumerSecret,
      },
      feedUrl: payload.feedUrl,
      fileName: payload.fileName,
      fileContent: payload.fileContent,
      fileContentBase64: payload.fileContentBase64,
      contentType: payload.contentType,
      timeoutMs: payload.timeoutMs,
      perPage: payload.perPage,
    };
  }

  private fallbackDiscovery(project: MigrationProject): MigrationDiscoverySummary {
    const seed = seedFrom(`${project.sourceUrl}:${project.sourcePlatform}`);
    return {
      platformDetected: project.sourcePlatform,
      products: 250 + (seed % 1800),
      categories: 12 + (seed % 80),
      images: 900 + (seed % 6500),
      customers: selectedModules(project).includes('customers') ? 1200 + (seed % 12000) : 0,
      orders: selectedModules(project).includes('orders') ? 2500 + (seed % 30000) : 0,
      indexableUrls: selectedModules(project).includes('seo') ? 300 + (seed % 2500) : 0,
      pages: selectedModules(project).includes('content') ? 8 + (seed % 120) : 0,
      redirects: selectedModules(project).includes('redirects') ? 200 + (seed % 2200) : 0,
      complexity: seed % 5 === 0 ? 'alta' : seed % 2 === 0 ? 'media' : 'baixa',
      availableSources: [project.accessMethod, 'sitemap', 'manual'],
    };
  }

  private async fetchConnectorSamples(
    connector: MigrationConnector,
    input: MigrationConnectorInput,
    modules: MigrationModuleKey[]
  ): Promise<MigrationConnectorFetchResult[]> {
    if (!connector.fetchModule) return [];
    const results: MigrationConnectorFetchResult[] = [];
    for (const module of modules) {
      const result = await connector.fetchModule(input, module).catch((error) => ({
        module,
        records: [],
        metadata: { errorMessage: (error as Error).message },
      }));
      results.push(result);
    }
    return results;
  }

  async listProjects(tenantId: string): Promise<MigrationProject[]> {
    const snapshot = await this.collection(tenantId, 'migration_projects').get();
    return snapshot.docs
      .map((doc) => this.docTo<MigrationProject>(doc))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  async getProject(tenantId: string, projectId: string): Promise<MigrationProject> {
    const doc = await this.collection(tenantId, 'migration_projects').doc(projectId).get();
    if (!doc.exists) throw new Error('Projeto de migracao nao encontrado');
    const project = this.docTo<MigrationProject>(doc);
    if (project.tenantId !== tenantId) throw new Error('Projeto pertence a outro tenant');
    return project;
  }

  async createProject(
    tenantId: string,
    user: AdminSessionUser,
    input: {
      name: string;
      sourcePlatform: MigrationSourcePlatform;
      sourceUrl: string;
      accessMethod: MigrationAccessMethod;
      modules?: MigrationModuleKey[];
      notes?: string;
    },
    meta?: RequestMeta
  ): Promise<MigrationProject> {
    const timestamp = now();
    const project: MigrationProject = {
      id: randomId('mig'),
      tenantId,
      name: input.name,
      sourcePlatform: input.sourcePlatform,
      sourceUrl: input.sourceUrl,
      accessMethod: input.accessMethod,
      status: 'draft',
      environment: 'homologacao',
      modules: normalizeModules(input.modules),
      credentialsConfigured: false,
      authorizationConfirmed: false,
      temporaryDataExpiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      goLiveChecklist: defaultChecklist,
      notes: input.notes,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.collection(tenantId, 'migration_projects')
      .doc(project.id)
      .set(removeUndefined(project) as Record<string, unknown>, { merge: false });
    await this.addEvent(tenantId, user, project.id, 'migration.project.created', 'success', 'Projeto de migracao criado.', meta);
    return project;
  }

  async updateProject(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    input: Partial<Pick<MigrationProject, 'name' | 'sourcePlatform' | 'sourceUrl' | 'accessMethod' | 'notes' | 'status'>> & {
      modules?: MigrationModuleKey[];
    },
    meta?: RequestMeta
  ): Promise<MigrationProject> {
    const current = await this.getProject(tenantId, projectId);
    const updated: MigrationProject = {
      ...current,
      ...input,
      modules: input.modules ? normalizeModules(input.modules) : current.modules,
      updatedBy: user.id,
      updatedAt: now(),
    };
    await this.collection(tenantId, 'migration_projects')
      .doc(projectId)
      .set(removeUndefined(updated) as Record<string, unknown>, { merge: false });
    await this.addEvent(tenantId, user, projectId, 'migration.project.updated', 'success', 'Projeto de migracao atualizado.', meta);
    return updated;
  }

  async connect(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    input: MigrationConnectorPayload,
    meta?: RequestMeta
  ): Promise<MigrationProject> {
    const current = await this.getProject(tenantId, projectId);
    const run = await this.startRun(tenantId, user, projectId, 'connect');
    const connectorInput = this.buildConnectorInput(current, input);
    const connector = this.connectorRegistry.find(connectorInput);
    const testResult = connector ? await connector.testConnection(connectorInput) : undefined;
    if (testResult && !testResult.ok) {
      await this.finishRun(run, 'failed', {
        connectorId: connector?.id,
        statusCode: testResult.statusCode,
        secretsStored: false,
      }, testResult.message);
      await this.addEvent(tenantId, user, projectId, 'migration.source.connection_failed', 'error', testResult.message, meta, {
        runId: run.id,
        connectorId: connector?.id,
        secretsStored: false,
      });
      throw new Error(testResult.message);
    }
    const updated: MigrationProject = {
      ...current,
      status: 'connected',
      credentialsConfigured: true,
      authorizationConfirmed: input.authorizationConfirmed !== false,
      notes: [current.notes, input.feedUrl ? `Feed: ${input.feedUrl}` : '', input.fileName ? `Arquivo: ${input.fileName}` : '']
        .filter(Boolean)
        .join('\n'),
      updatedBy: user.id,
      updatedAt: now(),
      lastRunAt: now(),
    };
    await this.saveProject(updated);
    await this.finishRun(run, 'completed', {
      credentialsConfigured: true,
      authorizationConfirmed: updated.authorizationConfirmed,
      connectorId: connector?.id,
      connectorMessage: testResult?.message,
      connectorCapabilities: testResult?.capabilities,
      connectorMetadata: testResult?.metadata,
    });
    await this.addEvent(tenantId, user, projectId, 'migration.source.connected', 'success', 'Origem conectada sem persistir secrets em claro.', meta, {
      runId: run.id,
      accessMethod: updated.accessMethod,
      connectorId: connector?.id,
      connectorCapabilities: testResult?.capabilities,
      secretsStored: false,
    });
    return updated;
  }

  async discover(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    meta?: RequestMeta,
    connectorPayload: MigrationConnectorPayload = {}
  ): Promise<MigrationProject> {
    const current = await this.getProject(tenantId, projectId);
    const run = await this.startRun(tenantId, user, projectId, 'discover');
    const connectorInput = this.buildConnectorInput(current, connectorPayload);
    const connector = this.connectorRegistry.find(connectorInput);
    let fetchResults: MigrationConnectorFetchResult[] = [];
    let discovery: MigrationDiscoverySummary;
    let connectorError: string | undefined;

    if (connector) {
      try {
        discovery = await connector.discover(connectorInput);
        fetchResults = connector.fetchModule
          ? await this.fetchConnectorSamples(connector, connectorInput, selectedModules(current))
          : [];
      } catch (error) {
        connectorError = (error as Error).message;
        discovery = this.fallbackDiscovery(current);
      }
    } else {
      discovery = this.fallbackDiscovery(current);
    }

    const updated = this.withModuleStatus({ ...current, discovery, status: 'discovered' }, 'ready');
    await this.persistDiscoveryPipeline(updated, run, fetchResults);
    await this.saveProject({ ...updated, updatedBy: user.id, updatedAt: now(), lastRunAt: now() });
    await this.finishRun(run, connectorError ? 'partial' : 'completed', {
      ...(discovery as unknown as Record<string, unknown>),
      connectorId: connector?.id,
      connectorError,
      sampledRecords: fetchResults.reduce((total, result) => total + result.records.length, 0),
    });
    await this.addEvent(tenantId, user, projectId, 'migration.source.discovered', connectorError ? 'warning' : 'success', 'Descoberta da loja concluida.', meta, {
      runId: run.id,
      connectorId: connector?.id,
      connectorError,
      ...discovery,
    });
    return this.getProject(tenantId, projectId);
  }

  async validate(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    meta?: RequestMeta
  ): Promise<MigrationProject> {
    const current = await this.getProject(tenantId, projectId);
    const run = await this.startRun(tenantId, user, projectId, 'validate');
    const sourceProject = current.discovery ? current : await this.discover(tenantId, user, projectId, meta);
    const discovery = sourceProject.discovery;
    if (!discovery) throw new Error('Descoberta da origem nao concluida');

    const [records, columnMappings] = await Promise.all([
      this.listRecords(tenantId, projectId),
      this.listColumnMappings(tenantId, projectId),
    ]);
    const normalizedRecords = this.buildNormalizedRecords(sourceProject, run, records, columnMappings);
    const issues = normalizedRecords.length
      ? this.buildValidationIssuesFromNormalized(normalizedRecords)
      : this.buildFallbackValidationIssues(sourceProject, discovery);
    const validRecords = normalizedRecords.length
      ? normalizedRecords.filter((record) => record.status === 'ready').length
      : discovery.products + discovery.customers + discovery.orders - issues.length * 25;
    const warningRecords = normalizedRecords.length
      ? normalizedRecords.filter((record) => record.status === 'warning').length
      : issues.length * 25;
    const blockedRecords = normalizedRecords.filter((record) => record.status === 'blocked').length;

    const validation: MigrationValidationSummary = {
      validRecords: Math.max(validRecords, 0),
      warningRecords,
      blockedRecords,
      issues,
      lgpdWarnings: [
        'Senhas, tokens, cookies e dados de cartao nao devem ser importados.',
        'Dados temporarios devem expirar apos a homologacao.',
        'Consentimentos de marketing devem ser importados somente quando houver base legal.',
      ],
      generatedAt: now(),
    };
    const nextModules = { ...sourceProject.modules };
    issues.forEach((issue) => {
      nextModules[issue.module] = issue.severity === 'critical' || issue.severity === 'error' ? 'blocked' : 'warning';
    });
    const updated: MigrationProject = {
      ...sourceProject,
      status: validation.blockedRecords > 0 ? 'blocked' : 'validated',
      validation,
      modules: nextModules,
      updatedBy: user.id,
      updatedAt: now(),
      lastRunAt: now(),
    };
    await this.persistValidationIssues(tenantId, projectId, run.id, issues);
    await this.persistValidationRecords(sourceProject, run, issues);
    await this.persistNormalizedRecords(normalizedRecords);
    await this.saveProject(updated);
    await this.finishRun(run, validation.blockedRecords > 0 ? 'partial' : 'completed', {
      issues: issues.length,
      blockedRecords: validation.blockedRecords,
      normalizedRecords: normalizedRecords.length,
    });
    await this.addEvent(tenantId, user, projectId, 'migration.data.validated', validation.blockedRecords > 0 ? 'warning' : 'success', 'Validacao de dados concluida.', meta, {
      runId: run.id,
      issues: issues.length,
      blockedRecords: validation.blockedRecords,
      normalizedRecords: normalizedRecords.length,
    });
    return updated;
  }

  async importToStaging(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    meta?: RequestMeta
  ): Promise<MigrationProject> {
    const current = await this.getProject(tenantId, projectId);
    const run = await this.startRun(tenantId, user, projectId, 'import');
    const validated = current.validation ? current : await this.validate(tenantId, user, projectId, meta);
    const discovery = validated.discovery;
    if (!discovery) throw new Error('Descoberta da origem nao concluida');
    const normalizedRecords = await this.listNormalizedRecords(tenantId, projectId);
    if (validated.status === 'blocked') {
      await this.finishRun(run, 'failed', { blockedRecords: validated.validation?.blockedRecords || 0 }, 'Projeto bloqueado por validacao critica');
      throw new Error('Projeto bloqueado por validacao critica');
    }
    const importableRecords = normalizedRecords.filter((record) =>
      record.status === 'ready' || record.status === 'warning' || record.status === 'imported'
    );
    const blockedNormalizedRecords = normalizedRecords.filter((record) => record.status === 'blocked');

    const importSummary: MigrationImportSummary = {
      importedProducts: normalizedRecords.length
        ? countNormalizedByModule(importableRecords, 'catalog', ['ready', 'warning', 'imported'])
        : selectedModules(validated).includes('catalog') ? discovery.products : 0,
      importedCustomers: normalizedRecords.length
        ? countNormalizedByModule(importableRecords, 'customers', ['ready', 'warning', 'imported'])
        : selectedModules(validated).includes('customers') ? discovery.customers : 0,
      importedOrders: normalizedRecords.length
        ? countNormalizedByModule(importableRecords, 'orders', ['ready', 'warning', 'imported'])
        : selectedModules(validated).includes('orders') ? discovery.orders : 0,
      importedPages: normalizedRecords.length
        ? countNormalizedByModule(importableRecords, 'content', ['ready', 'warning', 'imported'])
        : selectedModules(validated).includes('content') ? discovery.pages : 0,
      createdRedirects: normalizedRecords.length
        ? countNormalizedByModule(importableRecords, 'redirects', ['ready', 'warning', 'imported'])
        : selectedModules(validated).includes('redirects') ? discovery.redirects : 0,
      skippedSensitiveFields: ['passwords', 'card_data', 'payment_tokens', 'cookies', 'sessions'],
      environment: 'homologacao',
      generatedAt: now(),
    };
    const modules = { ...validated.modules };
    selectedModules(validated).forEach((module) => {
      modules[module] = 'imported';
    });
    const updated: MigrationProject = {
      ...validated,
      status: 'imported',
      modules,
      importSummary,
      updatedBy: user.id,
      updatedAt: now(),
      lastRunAt: now(),
    };
    await this.saveProject(updated);
    await this.persistImportResults(updated, run, importSummary, normalizedRecords);
    await this.finishRun(run, blockedNormalizedRecords.length ? 'partial' : 'completed', {
      ...(importSummary as unknown as Record<string, unknown>),
      normalizedRecords: normalizedRecords.length,
      importedNormalizedRecords: importableRecords.length,
      skippedBlockedRecords: blockedNormalizedRecords.length,
    });
    await this.addEvent(tenantId, user, projectId, 'migration.data.imported_to_staging', blockedNormalizedRecords.length ? 'warning' : 'success', 'Importacao em homologacao concluida.', meta, {
      runId: run.id,
      ...importSummary,
      normalizedRecords: normalizedRecords.length,
      importedNormalizedRecords: importableRecords.length,
      skippedBlockedRecords: blockedNormalizedRecords.length,
    });
    return updated;
  }

  async incrementalSync(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    meta?: RequestMeta
  ): Promise<MigrationProject> {
    const current = await this.getProject(tenantId, projectId);
    if (!['imported', 'syncing', 'ready_for_go_live'].includes(current.status)) {
      throw new Error('Sync incremental exige importacao inicial em homologacao');
    }
    const run = await this.startRun(tenantId, user, projectId, 'incremental_sync');
    const updated: MigrationProject = {
      ...current,
      status: 'syncing',
      updatedBy: user.id,
      updatedAt: now(),
      lastRunAt: now(),
    };
    await this.saveProject(updated);
    await this.finishRun(run, 'completed', { mode: 'delta' });
    await this.addEvent(tenantId, user, projectId, 'migration.incremental_sync.completed', 'success', 'Sincronizacao incremental registrada.', meta, {
      runId: run.id,
      mode: 'delta',
    });
    return updated;
  }

  async updateChecklist(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    input: Array<{ key: string; done: boolean }>,
    meta?: RequestMeta
  ): Promise<MigrationProject> {
    const current = await this.getProject(tenantId, projectId);
    const run = await this.startRun(tenantId, user, projectId, 'go_live_checklist');
    const doneByKey = new Map(input.map((item) => [item.key, item.done]));
    const checklist = current.goLiveChecklist.map((item) => ({
      ...item,
      done: doneByKey.has(item.key) ? Boolean(doneByKey.get(item.key)) : item.done,
    }));
    const requiredDone = checklist.filter((item) => item.required).every((item) => item.done);
    const updated: MigrationProject = {
      ...current,
      goLiveChecklist: checklist,
      status: requiredDone && current.status === 'imported' ? 'ready_for_go_live' : current.status,
      updatedBy: user.id,
      updatedAt: now(),
    };
    await this.saveProject(updated);
    await this.persistGoLiveChecks(updated, run.id);
    await this.finishRun(run, requiredDone ? 'completed' : 'partial', { requiredDone });
    await this.addEvent(tenantId, user, projectId, 'migration.go_live_checklist.updated', 'success', 'Checklist de go-live atualizado.', meta, {
      runId: run.id,
      requiredDone,
    });
    return updated;
  }

  async report(tenantId: string, projectId: string): Promise<{
    project: MigrationProject;
    events: MigrationEvent[];
  }> {
    const project = await this.getProject(tenantId, projectId);
    const snapshot = await this.collection(tenantId, 'migration_events')
      .where('projectId', '==', projectId)
      .get();
    return {
      project,
      events: snapshot.docs
        .map((doc) => this.docTo<MigrationEvent>(doc))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    };
  }

  async listRuns(tenantId: string, projectId: string): Promise<MigrationRun[]> {
    await this.getProject(tenantId, projectId);
    return this.listByProject<MigrationRun>(tenantId, 'migration_runs', projectId, 100);
  }

  async listRecords(tenantId: string, projectId: string): Promise<MigrationRecord[]> {
    await this.getProject(tenantId, projectId);
    return this.listByProject<MigrationRecord>(tenantId, 'migration_records', projectId, 500);
  }

  async listSourceMappings(tenantId: string, projectId: string): Promise<MigrationSourceMapping[]> {
    await this.getProject(tenantId, projectId);
    return this.listByProject<MigrationSourceMapping>(tenantId, 'migration_source_mappings', projectId, 500);
  }

  async listColumnMappings(tenantId: string, projectId: string): Promise<MigrationColumnMapping[]> {
    await this.getProject(tenantId, projectId);
    return this.listByProject<MigrationColumnMapping>(tenantId, 'migration_column_mappings', projectId, 500);
  }

  async listNormalizedRecords(tenantId: string, projectId: string): Promise<MigrationNormalizedRecord[]> {
    await this.getProject(tenantId, projectId);
    return this.listByProject<MigrationNormalizedRecord>(tenantId, 'migration_normalized_records', projectId, 500);
  }

  async saveColumnMappings(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    input: MigrationColumnMappingInput[],
    meta?: RequestMeta
  ): Promise<MigrationColumnMapping[]> {
    await this.getProject(tenantId, projectId);
    const timestamp = now();
    const mappings = input.map((item) => {
      const mapping: MigrationColumnMapping = {
        id: this.columnMappingId(projectId, item.module, item.targetField),
        tenantId,
        projectId,
        module: item.module,
        targetField: item.targetField,
        sourceField: item.sourceField,
        required: Boolean(item.required),
        confidence: item.confidence || (item.sourceField ? 'high' : 'low'),
        status: item.status || 'confirmed',
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return mapping;
    });
    await Promise.all(
      mappings.map((mapping) =>
        this.collection(tenantId, 'migration_column_mappings')
          .doc(mapping.id)
          .set(removeUndefined(mapping) as Record<string, unknown>, { merge: true })
      )
    );
    await this.addEvent(tenantId, user, projectId, 'migration.column_mappings.saved', 'success', 'Mapeamento de colunas salvo.', meta, {
      mappings: mappings.length,
      modules: Array.from(new Set(mappings.map((mapping) => mapping.module))),
    });
    return this.listColumnMappings(tenantId, projectId);
  }

  async listRedirects(tenantId: string, projectId: string): Promise<MigrationRedirect[]> {
    await this.getProject(tenantId, projectId);
    return this.listByProject<MigrationRedirect>(tenantId, 'migration_redirects', projectId, 500);
  }

  async pipelineSnapshot(tenantId: string, projectId: string): Promise<MigrationPipelineSnapshot> {
    const project = await this.getProject(tenantId, projectId);
    const [runs, rawBatches, records, normalizedRecords, validationIssues, importResults, sourceMappings, columnMappings, redirects] = await Promise.all([
      this.listByProject<MigrationRun>(tenantId, 'migration_runs', projectId, 100),
      this.listByProject<MigrationRawBatch>(tenantId, 'migration_raw_batches', projectId, 500),
      this.listByProject<MigrationRecord>(tenantId, 'migration_records', projectId, 500),
      this.listByProject<MigrationNormalizedRecord>(tenantId, 'migration_normalized_records', projectId, 500),
      this.listByProject<MigrationStoredValidationIssue>(tenantId, 'migration_validation_issues', projectId, 500),
      this.listByProject<MigrationImportResult>(tenantId, 'migration_import_results', projectId, 500),
      this.listByProject<MigrationSourceMapping>(tenantId, 'migration_source_mappings', projectId, 500),
      this.listByProject<MigrationColumnMapping>(tenantId, 'migration_column_mappings', projectId, 500),
      this.listByProject<MigrationRedirect>(tenantId, 'migration_redirects', projectId, 500),
    ]);
    return { project, runs, rawBatches, records, normalizedRecords, validationIssues, importResults, sourceMappings, columnMappings, redirects };
  }

  private async startRun(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    operation: MigrationPipelineOperation
  ): Promise<MigrationRun> {
    const run: MigrationRun = {
      id: randomId('mig_run'),
      tenantId,
      projectId,
      operation,
      status: 'running',
      createdBy: user.id,
      startedAt: now(),
    };
    await this.collection(tenantId, 'migration_runs')
      .doc(run.id)
      .set(removeUndefined(run) as Record<string, unknown>, { merge: false });
    return run;
  }

  private async finishRun(
    run: MigrationRun,
    status: MigrationRunStatus,
    stats?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<MigrationRun> {
    const updated: MigrationRun = {
      ...run,
      status,
      stats,
      errorMessage,
      finishedAt: now(),
    };
    await this.collection(run.tenantId, 'migration_runs')
      .doc(run.id)
      .set(removeUndefined(updated) as Record<string, unknown>, { merge: true });
    return updated;
  }

  private async persistDiscoveryPipeline(
    project: MigrationProject,
    run: MigrationRun,
    fetchResults: MigrationConnectorFetchResult[] = []
  ): Promise<void> {
    const timestamp = now();
    const fetchByModule = new Map(fetchResults.map((result) => [result.module, result]));
    const writes = selectedModules(project).map(async (module) => {
      const recordCount = countForModule(module, project.discovery);
      const fetchResult = fetchByModule.get(module);
      const rawBatch: MigrationRawBatch = {
        id: `${run.id}_${module}`,
        tenantId: project.tenantId,
        projectId: project.id,
        runId: run.id,
        module,
        sourcePlatform: project.sourcePlatform,
        accessMethod: project.accessMethod,
        recordCount,
        payloadStored: false,
        sanitized: true,
        createdAt: timestamp,
      };
      const sampledRecords: MigrationRecord[] =
        fetchResult?.records.length
          ? fetchResult.records.map((sample, index) => ({
              id: `${run.id}_${module}_${index + 1}`,
              tenantId: project.tenantId,
              projectId: project.id,
              runId: run.id,
              module,
              sourcePlatform: project.sourcePlatform,
              sourceResourceType: sample.sourceResourceType,
              sourceId: sample.sourceId,
              recordLabel: sample.label,
              status: 'raw',
              recordCount: 1,
              issueCount: 0,
              metadata: {
                sampledRecord: true,
                sourceUrl: project.sourceUrl,
                environment: project.environment,
                sourceFields: Object.keys(sample.data).slice(0, 40),
                normalizedPreview: normalizeMigrationRecord(sample.module, sample.data),
                connector: fetchResult.metadata,
              },
              createdAt: timestamp,
              updatedAt: timestamp,
            }))
          : [
              {
                id: `${run.id}_${module}`,
                tenantId: project.tenantId,
                projectId: project.id,
                runId: run.id,
                module,
                sourcePlatform: project.sourcePlatform,
                sourceResourceType: resourceTypeForModule(module),
                sourceId: `${project.id}:${module}:summary`,
                recordLabel: `${module} discovery summary`,
                status: 'raw',
                recordCount,
                issueCount: 0,
                metadata: {
                  summaryOnly: true,
                  sourceUrl: project.sourceUrl,
                  environment: project.environment,
                  connector: fetchResult?.metadata,
                },
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ];
      await Promise.all([
        this.collection(project.tenantId, 'migration_raw_batches')
          .doc(rawBatch.id)
          .set(removeUndefined(rawBatch) as Record<string, unknown>, { merge: false }),
        ...sampledRecords.map((record) =>
          this.collection(project.tenantId, 'migration_records')
            .doc(record.id)
            .set(removeUndefined(record) as Record<string, unknown>, { merge: false })
        ),
      ]);
    });
    await Promise.all(writes);
    await this.persistColumnMappingSuggestions(project, fetchResults);
  }

  private columnMappingId(projectId: string, module: MigrationModuleKey, targetField: string): string {
    return `${projectId}_${module}_${targetField.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }

  private async persistColumnMappingSuggestions(
    project: MigrationProject,
    fetchResults: MigrationConnectorFetchResult[]
  ): Promise<void> {
    const timestamp = now();
    const suggestions = new Map<string, MigrationColumnMapping>();

    fetchResults.forEach((result) => {
      result.records.slice(0, 10).forEach((sample) => {
        const preview: MigrationNormalizedPreview = normalizeMigrationRecord(sample.module, sample.data);
        preview.columnMappings.forEach((mapping) => {
          const id = this.columnMappingId(project.id, sample.module, mapping.target);
          if (suggestions.has(id)) return;
          suggestions.set(id, {
            id,
            tenantId: project.tenantId,
            projectId: project.id,
            module: sample.module,
            targetField: mapping.target,
            sourceField: mapping.source,
            required: mapping.required,
            confidence: mapping.confidence,
            status: mapping.source ? 'suggested' : 'ignored',
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        });
      });
    });

    await Promise.all(
      Array.from(suggestions.values()).map(async (mapping) => {
        const ref = this.collection(project.tenantId, 'migration_column_mappings').doc(mapping.id);
        const existing = await ref.get();
        const existingData = existing.data() as MigrationColumnMapping | undefined;
        if (existingData?.status === 'confirmed') return;
        await ref.set(removeUndefined(mapping) as Record<string, unknown>, { merge: true });
      })
    );
  }

  private normalizedPreviewFromRecord(record: MigrationRecord): MigrationNormalizedPreview | undefined {
    const preview = record.metadata?.normalizedPreview;
    if (!preview || typeof preview !== 'object') return undefined;
    const candidate = preview as Partial<MigrationNormalizedPreview>;
    if (!candidate.module || !candidate.targetResourceType || !candidate.fields || !Array.isArray(candidate.columnMappings)) {
      return undefined;
    }
    return candidate as MigrationNormalizedPreview;
  }

  private buildNormalizedRecords(
    project: MigrationProject,
    run: MigrationRun,
    records: MigrationRecord[],
    columnMappings: MigrationColumnMapping[]
  ): MigrationNormalizedRecord[] {
    const sampledRecords = records
      .filter((record) => Boolean(record.metadata?.sampledRecord && this.normalizedPreviewFromRecord(record)))
      .sort((left, right) => this.sortTimestamp(right) - this.sortTimestamp(left));
    const latestSampleRunId = sampledRecords[0]?.runId;
    const candidates = latestSampleRunId
      ? sampledRecords.filter((record) => record.runId === latestSampleRunId)
      : sampledRecords;
    const timestamp = now();
    const savedMappingsByKey = new Map(
      columnMappings.map((mapping) => [mappingKeyForService(mapping.module, mapping.targetField), mapping])
    );

    return candidates.map((record) => {
      const preview = this.normalizedPreviewFromRecord(record) as MigrationNormalizedPreview;
      const targetFields = new Set<string>();
      const mappings = preview.columnMappings.map((mapping) => {
        targetFields.add(mapping.target);
        const saved = savedMappingsByKey.get(mappingKeyForService(record.module, mapping.target));
        return {
          targetField: mapping.target,
          sourceField: saved?.sourceField ?? mapping.source,
          required: saved?.required ?? mapping.required,
          confidence: saved?.confidence ?? mapping.confidence,
          status: saved?.status ?? (mapping.source ? 'suggested' : 'ignored'),
        };
      });
      columnMappings
        .filter((mapping) => mapping.module === record.module && !targetFields.has(mapping.targetField))
        .forEach((mapping) => {
          mappings.push({
            targetField: mapping.targetField,
            sourceField: mapping.sourceField,
            required: mapping.required,
            confidence: mapping.confidence,
            status: mapping.status,
          });
        });

      const warnings = new Set(preview.warnings);
      mappings
        .filter((mapping) => mapping.required && !mapping.sourceField)
        .forEach((mapping) => warnings.add(`Mapeamento obrigatorio ausente: ${mapping.targetField}`));
      mappings
        .filter((mapping) => mapping.required && isEmptyField(preview.fields[mapping.targetField]))
        .forEach((mapping) => warnings.add(`Campo obrigatorio sem valor normalizado: ${mapping.targetField}`));
      const hasBlocker = Array.from(warnings).some((warning) => warning.includes('obrigatorio'));
      const status: MigrationNormalizedRecordStatus = hasBlocker
        ? 'blocked'
        : warnings.size
          ? 'warning'
          : 'ready';

      return {
        id: `${run.id}_${record.id}`,
        tenantId: project.tenantId,
        projectId: project.id,
        runId: run.id,
        module: record.module,
        sourcePlatform: project.sourcePlatform,
        sourceResourceType: record.sourceResourceType,
        sourceId: record.sourceId,
        recordLabel: record.recordLabel,
        t3ckResourceType: preview.targetResourceType,
        fields: preview.fields,
        columnMappings: mappings,
        warnings: Array.from(warnings),
        status,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
  }

  private buildValidationIssuesFromNormalized(records: MigrationNormalizedRecord[]): MigrationValidationIssue[] {
    return records
      .filter((record) => record.status === 'blocked' || record.status === 'warning')
      .map((record) => ({
        id: randomId('issue'),
        module: record.module,
        severity: record.status === 'blocked' ? 'error' : 'warning',
        title: record.status === 'blocked' ? 'Registro bloqueado pela validacao' : 'Registro com alerta de saneamento',
        description: `${record.recordLabel || record.sourceId}: ${record.warnings.slice(0, 4).join(' | ')}`,
        recommendation: record.status === 'blocked'
          ? 'Corrigir campos obrigatorios ou confirmar mapeamentos antes de importar em homologacao.'
          : 'Revisar os alertas antes do go-live e manter a importacao apenas em homologacao.',
      }));
  }

  private buildFallbackValidationIssues(
    sourceProject: MigrationProject,
    discovery: MigrationDiscoverySummary
  ): MigrationValidationIssue[] {
    const issues: MigrationValidationIssue[] = [];
    if (selectedModules(sourceProject).includes('catalog')) {
      issues.push({
        id: randomId('issue'),
        module: 'catalog',
        severity: 'warning',
        title: 'Produtos sem SKU ou imagem',
        description: 'Parte do catalogo exige saneamento antes da importacao definitiva.',
        recommendation: 'Corrigir SKU, imagem principal e preco antes do go-live.',
      });
    }
    if (selectedModules(sourceProject).includes('seo')) {
      issues.push({
        id: randomId('issue'),
        module: 'seo',
        severity: discovery.indexableUrls > 1200 ? 'warning' : 'info',
        title: 'URLs antigas pendentes de destino',
        description: 'Nem todas as URLs indexaveis possuem destino T3CK definido.',
        recommendation: 'Gerar mapa 301 e revisar URLs sem correspondencia.',
      });
    }
    if (selectedModules(sourceProject).includes('customers')) {
      issues.push({
        id: randomId('issue'),
        module: 'customers',
        severity: 'warning',
        title: 'Clientes sem e-mail',
        description: 'Clientes sem e-mail nao podem receber convite de ativacao.',
        recommendation: 'Importar como pendente/incompleto e nao migrar senhas.',
      });
    }
    return issues;
  }

  private async persistNormalizedRecords(records: MigrationNormalizedRecord[]): Promise<void> {
    await Promise.all(
      records.map((record) =>
        this.collection(record.tenantId, 'migration_normalized_records')
          .doc(record.id)
          .set(removeUndefined(record) as Record<string, unknown>, { merge: false })
      )
    );
  }

  private async persistValidationIssues(
    tenantId: string,
    projectId: string,
    runId: string,
    issues: MigrationValidationIssue[]
  ): Promise<void> {
    const timestamp = now();
    await Promise.all(
      issues.map((issue) => {
        const stored: MigrationStoredValidationIssue = {
          ...issue,
          tenantId,
          projectId,
          runId,
          status: 'open',
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        return this.collection(tenantId, 'migration_validation_issues')
          .doc(stored.id)
          .set(removeUndefined(stored) as Record<string, unknown>, { merge: false });
      })
    );
  }

  private async persistValidationRecords(
    project: MigrationProject,
    run: MigrationRun,
    issues: MigrationValidationIssue[]
  ): Promise<void> {
    const timestamp = now();
    await Promise.all(
      selectedModules(project).map((module) => {
        const moduleIssues = issues.filter((issue) => issue.module === module);
        const hasBlocker = moduleIssues.some((issue) => issue.severity === 'error' || issue.severity === 'critical');
        const status: MigrationRecordStatus = hasBlocker ? 'blocked' : moduleIssues.length ? 'warning' : 'validated';
        const record: MigrationRecord = {
          id: `${run.id}_${module}`,
          tenantId: project.tenantId,
          projectId: project.id,
          runId: run.id,
          module,
          sourcePlatform: project.sourcePlatform,
          sourceResourceType: resourceTypeForModule(module),
          sourceId: `${project.id}:${module}:summary`,
          recordLabel: `${module} validation summary`,
          status,
          recordCount: countForModule(module, project.discovery),
          issueCount: moduleIssues.length,
          metadata: {
            summaryOnly: true,
            issueIds: moduleIssues.map((issue) => issue.id),
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        return this.collection(project.tenantId, 'migration_records')
          .doc(record.id)
          .set(removeUndefined(record) as Record<string, unknown>, { merge: false });
      })
    );
  }

  private async persistImportResults(
    project: MigrationProject,
    run: MigrationRun,
    importSummary: MigrationImportSummary,
    normalizedRecords: MigrationNormalizedRecord[] = []
  ): Promise<void> {
    const timestamp = now();
    const countByModule: Record<MigrationModuleKey, number> = {
      catalog: importSummary.importedProducts,
      customers: importSummary.importedCustomers,
      orders: importSummary.importedOrders,
      content: importSummary.importedPages,
      redirects: importSummary.createdRedirects,
      seo: importSummary.createdRedirects,
      layout: 0,
    };
    const importableRecords = normalizedRecords.filter((record) =>
      record.status === 'ready' || record.status === 'warning' || record.status === 'imported'
    );
    await Promise.all(
      selectedModules(project).map(async (module) => {
        const moduleNormalizedRecords = normalizedRecords.filter((record) => record.module === module);
        const importedRecords = moduleNormalizedRecords.length
          ? moduleNormalizedRecords.filter((record) => record.status === 'ready' || record.status === 'warning' || record.status === 'imported').length
          : countByModule[module] || 0;
        const failedRecords = moduleNormalizedRecords.filter((record) => record.status === 'failed').length;
        const skippedRecords = moduleNormalizedRecords.length
          ? moduleNormalizedRecords.filter((record) => record.status === 'blocked' || record.status === 'skipped').length
          : Math.max(countForModule(module, project.discovery) - importedRecords, 0);
        const expectedRecords = countForModule(module, project.discovery);
        const importResult: MigrationImportResult = {
          id: `${run.id}_${module}`,
          tenantId: project.tenantId,
          projectId: project.id,
          runId: run.id,
          module,
          status: failedRecords ? 'failed' : skippedRecords ? 'partial' : 'success',
          importedRecords,
          skippedRecords,
          failedRecords,
          targetEnvironment: 'homologacao',
          metadata: {
            summaryOnly: !moduleNormalizedRecords.length,
            expectedRecords,
            normalizedRecords: moduleNormalizedRecords.length,
            skippedSensitiveFields: importSummary.skippedSensitiveFields,
          },
          createdAt: timestamp,
        };
        const record: MigrationRecord = {
          id: `${run.id}_${module}`,
          tenantId: project.tenantId,
          projectId: project.id,
          runId: run.id,
          module,
          sourcePlatform: project.sourcePlatform,
          sourceResourceType: resourceTypeForModule(module),
          sourceId: `${project.id}:${module}:summary`,
          recordLabel: `${module} import summary`,
          status: 'imported',
          recordCount: importedRecords,
          issueCount: 0,
          metadata: {
            summaryOnly: true,
            targetEnvironment: 'homologacao',
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await Promise.all([
          this.collection(project.tenantId, 'migration_import_results')
            .doc(importResult.id)
            .set(removeUndefined(importResult) as Record<string, unknown>, { merge: false }),
          this.collection(project.tenantId, 'migration_records')
            .doc(record.id)
            .set(removeUndefined(record) as Record<string, unknown>, { merge: false }),
        ]);
      })
    );
    await Promise.all([
      ...importableRecords.map((record) => {
        const t3ckResourceId = this.stagingResourceId(record.t3ckResourceType, record.sourceId);
        const mapping: MigrationSourceMapping = {
          id: this.sourceMappingId(project.id, record.sourceResourceType, record.sourceId),
          tenantId: project.tenantId,
          projectId: project.id,
          sourcePlatform: project.sourcePlatform,
          sourceResourceType: record.sourceResourceType,
          sourceId: record.sourceId,
          t3ckResourceType: record.t3ckResourceType,
          t3ckResourceId,
          t3ckResourceLabel: this.normalizedRecordLabel(record),
          createdAt: timestamp,
          updatedAt: timestamp,
          lastSyncedAt: timestamp,
        };
        return this.collection(project.tenantId, 'migration_source_mappings')
          .doc(mapping.id)
          .set(removeUndefined(mapping) as Record<string, unknown>, { merge: true });
      }),
      ...importableRecords.map((record) => {
        const importedRecord: MigrationNormalizedRecord = {
          ...record,
          status: 'imported',
          t3ckResourceId: this.stagingResourceId(record.t3ckResourceType, record.sourceId),
          updatedAt: timestamp,
        };
        return this.collection(project.tenantId, 'migration_normalized_records')
          .doc(record.id)
          .set(removeUndefined(importedRecord) as Record<string, unknown>, { merge: true });
      }),
    ]);
  }

  private sourceMappingId(
    projectId: string,
    sourceResourceType: MigrationSourceResourceType,
    sourceId: string
  ): string {
    return `${projectId}_${sourceResourceType}_${safeId(sourceId)}`;
  }

  private stagingResourceId(t3ckResourceType: MigrationT3ckResourceType, sourceId: string): string {
    return `stg_${t3ckResourceType}_${safeId(sourceId)}`;
  }

  private normalizedRecordLabel(record: MigrationNormalizedRecord): string {
    const preferredFields = ['name', 'title', 'orderNumber', 'email', 'oldUrl', 'url', 'slug'];
    const value = preferredFields.map((field) => record.fields[field]).find((fieldValue) => !isEmptyField(fieldValue));
    return value ? String(value).slice(0, 160) : (record.recordLabel || record.sourceId);
  }

  private async persistGoLiveChecks(project: MigrationProject, runId: string): Promise<void> {
    const timestamp = now();
    await Promise.all(
      project.goLiveChecklist.map((item) =>
        this.collection(project.tenantId, 'migration_go_live_checks')
          .doc(`${project.id}_${item.key}`)
          .set(
            removeUndefined({
              id: `${project.id}_${item.key}`,
              tenantId: project.tenantId,
              projectId: project.id,
              runId,
              ...item,
              updatedAt: timestamp,
            }) as Record<string, unknown>,
            { merge: true }
          )
      )
    );
  }

  private async listByProject<T extends { id: string }>(
    tenantId: string,
    collectionName: string,
    projectId: string,
    limit = 100
  ): Promise<T[]> {
    const snapshot = await this.collection(tenantId, collectionName)
      .where('projectId', '==', projectId)
      .limit(limit)
      .get();
    return snapshot.docs
      .map((doc) => this.docTo<T>(doc))
      .sort((left, right) => this.sortTimestamp(right) - this.sortTimestamp(left));
  }

  private sortTimestamp(value: Record<string, unknown>): number {
    const raw = value.updatedAt || value.createdAt || value.finishedAt || value.startedAt;
    return typeof raw === 'string' ? Date.parse(raw) || 0 : 0;
  }

  private withModuleStatus(project: MigrationProject, status: MigrationModuleStatus): MigrationProject {
    const modules = { ...project.modules };
    selectedModules(project).forEach((module) => {
      modules[module] = modules[module] === 'blocked' ? 'blocked' : status;
    });
    return { ...project, modules };
  }

  private async saveProject(project: MigrationProject): Promise<void> {
    await this.collection(project.tenantId, 'migration_projects')
      .doc(project.id)
      .set(removeUndefined(project) as Record<string, unknown>, { merge: false });
  }

  private async addEvent(
    tenantId: string,
    user: AdminSessionUser,
    projectId: string,
    action: string,
    status: 'success' | 'warning' | 'error',
    message: string,
    meta?: RequestMeta,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event: MigrationEvent = {
      id: randomId('mig_evt'),
      tenantId,
      projectId,
      userId: user.id,
      action,
      status,
      message,
      metadata,
      createdAt: now(),
    };
    await this.collection(tenantId, 'migration_events').doc(event.id).set(removeUndefined(event) as Record<string, unknown>, {
      merge: false,
    });
    await this.auditLogService
      .record({
        tenantId,
        actor: user,
        category: 'integrations',
        action,
        operation: 'execute',
        severity: status === 'error' ? 'warning' : 'notice',
        outcome: status === 'error' ? 'failure' : 'success',
        module: 'migration',
        description: message,
        resource: { type: 'migration_project', id: projectId, label: projectId },
        metadata,
        ipAddress: meta?.ipAddress,
        userAgent: headerValue(meta?.userAgent),
      })
      .catch(() => undefined);
  }
}
