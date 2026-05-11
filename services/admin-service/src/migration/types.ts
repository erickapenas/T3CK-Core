export type MigrationSourcePlatform =
  | 'shopify'
  | 'woocommerce'
  | 'nuvemshop'
  | 'tray'
  | 'vtex'
  | 'loja_integrada'
  | 'magento'
  | 'csv'
  | 'xml'
  | 'merchant_feed'
  | 'sitemap'
  | 'other';

export type MigrationAccessMethod = 'api' | 'file' | 'feed' | 'sitemap' | 'public_read' | 'manual';

export type MigrationModuleKey =
  | 'catalog'
  | 'customers'
  | 'orders'
  | 'seo'
  | 'layout'
  | 'content'
  | 'redirects';

export type MigrationStatus =
  | 'draft'
  | 'connected'
  | 'discovered'
  | 'validated'
  | 'importing'
  | 'imported'
  | 'syncing'
  | 'ready_for_go_live'
  | 'live'
  | 'blocked';

export type MigrationModuleStatus = 'pending' | 'ready' | 'warning' | 'blocked' | 'imported';

export type MigrationValidationSeverity = 'info' | 'warning' | 'error' | 'critical';

export type MigrationProject = {
  id: string;
  tenantId: string;
  name: string;
  sourcePlatform: MigrationSourcePlatform;
  sourceUrl: string;
  accessMethod: MigrationAccessMethod;
  status: MigrationStatus;
  environment: 'homologacao';
  modules: Record<MigrationModuleKey, MigrationModuleStatus>;
  credentialsConfigured: boolean;
  authorizationConfirmed: boolean;
  temporaryDataExpiresAt?: string;
  discovery?: MigrationDiscoverySummary;
  validation?: MigrationValidationSummary;
  importSummary?: MigrationImportSummary;
  goLiveChecklist: MigrationChecklistItem[];
  notes?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
};

export type MigrationDiscoverySummary = {
  platformDetected: MigrationSourcePlatform;
  products: number;
  categories: number;
  images: number;
  customers: number;
  orders: number;
  indexableUrls: number;
  pages: number;
  redirects: number;
  complexity: 'baixa' | 'media' | 'alta';
  availableSources: MigrationAccessMethod[];
};

export type MigrationValidationIssue = {
  id: string;
  module: MigrationModuleKey;
  severity: MigrationValidationSeverity;
  title: string;
  description: string;
  recommendation: string;
};

export type MigrationValidationSummary = {
  validRecords: number;
  warningRecords: number;
  blockedRecords: number;
  issues: MigrationValidationIssue[];
  lgpdWarnings: string[];
  generatedAt: string;
};

export type MigrationImportSummary = {
  importedProducts: number;
  importedCustomers: number;
  importedOrders: number;
  importedPages: number;
  createdRedirects: number;
  skippedSensitiveFields: string[];
  environment: 'homologacao';
  generatedAt: string;
};

export type MigrationChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  required: boolean;
};

export type MigrationEvent = {
  id: string;
  tenantId: string;
  projectId: string;
  userId: string;
  action: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type MigrationPipelineOperation =
  | 'connect'
  | 'discover'
  | 'validate'
  | 'import'
  | 'incremental_sync'
  | 'go_live_checklist';

export type MigrationRunStatus = 'running' | 'completed' | 'partial' | 'failed';

export type MigrationRun = {
  id: string;
  tenantId: string;
  projectId: string;
  operation: MigrationPipelineOperation;
  status: MigrationRunStatus;
  createdBy: string;
  startedAt: string;
  finishedAt?: string;
  stats?: Record<string, unknown>;
  errorMessage?: string;
};

export type MigrationSourceResourceType =
  | 'product'
  | 'variant'
  | 'category'
  | 'brand'
  | 'customer'
  | 'order'
  | 'page'
  | 'menu'
  | 'banner'
  | 'url'
  | 'redirect'
  | 'layout'
  | 'seo'
  | 'unknown';

export type MigrationT3ckResourceType =
  | 'product'
  | 'variant'
  | 'category'
  | 'brand'
  | 'customer'
  | 'order'
  | 'page'
  | 'redirect'
  | 'theme'
  | 'media'
  | 'unknown';

export type MigrationRecordStatus =
  | 'raw'
  | 'normalized'
  | 'validated'
  | 'warning'
  | 'blocked'
  | 'imported'
  | 'skipped'
  | 'failed';

export type MigrationRawBatch = {
  id: string;
  tenantId: string;
  projectId: string;
  runId: string;
  module: MigrationModuleKey;
  sourcePlatform: MigrationSourcePlatform;
  accessMethod: MigrationAccessMethod;
  recordCount: number;
  payloadStored: boolean;
  sanitized: boolean;
  createdAt: string;
};

export type MigrationRecord = {
  id: string;
  tenantId: string;
  projectId: string;
  runId: string;
  module: MigrationModuleKey;
  sourcePlatform: MigrationSourcePlatform;
  sourceResourceType: MigrationSourceResourceType;
  sourceId: string;
  recordLabel?: string;
  status: MigrationRecordStatus;
  recordCount: number;
  issueCount: number;
  t3ckResourceType?: MigrationT3ckResourceType;
  t3ckResourceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MigrationStoredValidationIssue = MigrationValidationIssue & {
  tenantId: string;
  projectId: string;
  runId: string;
  status: 'open' | 'resolved' | 'ignored';
  createdAt: string;
  updatedAt: string;
};

export type MigrationImportResult = {
  id: string;
  tenantId: string;
  projectId: string;
  runId: string;
  module: MigrationModuleKey;
  status: 'success' | 'partial' | 'failed';
  importedRecords: number;
  skippedRecords: number;
  failedRecords: number;
  targetEnvironment: 'homologacao';
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type MigrationNormalizedRecordStatus =
  | 'ready'
  | 'warning'
  | 'blocked'
  | 'imported'
  | 'skipped'
  | 'failed';

export type MigrationNormalizedRecord = {
  id: string;
  tenantId: string;
  projectId: string;
  runId: string;
  module: MigrationModuleKey;
  sourcePlatform: MigrationSourcePlatform;
  sourceResourceType: MigrationSourceResourceType;
  sourceId: string;
  recordLabel?: string;
  t3ckResourceType: MigrationT3ckResourceType;
  t3ckResourceId?: string;
  fields: Record<string, unknown>;
  columnMappings: Array<{
    targetField: string;
    sourceField?: string;
    required: boolean;
    confidence: 'high' | 'medium' | 'low';
    status: 'suggested' | 'confirmed' | 'ignored';
  }>;
  warnings: string[];
  status: MigrationNormalizedRecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type MigrationSourceMapping = {
  id: string;
  tenantId: string;
  projectId: string;
  sourcePlatform: MigrationSourcePlatform;
  sourceResourceType: MigrationSourceResourceType;
  sourceId: string;
  t3ckResourceType: MigrationT3ckResourceType;
  t3ckResourceId: string;
  t3ckResourceLabel?: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
};

export type MigrationColumnMapping = {
  id: string;
  tenantId: string;
  projectId: string;
  module: MigrationModuleKey;
  targetField: string;
  sourceField?: string;
  required: boolean;
  confidence: 'high' | 'medium' | 'low';
  status: 'suggested' | 'confirmed' | 'ignored';
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type MigrationRedirect = {
  id: string;
  tenantId: string;
  projectId: string;
  oldUrl: string;
  newUrl?: string;
  type: 'product' | 'category' | 'page' | 'manual' | 'unknown';
  status: 'pending' | 'ready' | 'published' | 'ignored';
  source: 'sitemap' | 'api' | 'file' | 'manual';
  createdAt: string;
  updatedAt: string;
};

export type MigrationPipelineSnapshot = {
  project: MigrationProject;
  runs: MigrationRun[];
  rawBatches: MigrationRawBatch[];
  records: MigrationRecord[];
  normalizedRecords: MigrationNormalizedRecord[];
  validationIssues: MigrationStoredValidationIssue[];
  importResults: MigrationImportResult[];
  sourceMappings: MigrationSourceMapping[];
  columnMappings: MigrationColumnMapping[];
  redirects: MigrationRedirect[];
};
