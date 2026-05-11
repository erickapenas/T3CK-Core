import { AdminSessionUser } from '../types';
import { FileMigrationConnector, WooCommerceMigrationConnector } from '../migration/connectors';
import { MigrationConnectorFetch } from '../migration/connectors/types';
import { MigrationService } from '../migration/migration-service';
import {
  canApproveMigrationGoLive,
  canExecuteMigration,
  canManageMigration,
  canReadMigration,
  MIGRATION_PERMISSIONS,
} from '../migration/routes';
import { migrateAdminUnifiedMigrationFirestoreSchema } from '../migrations/20260511000100-create-admin-unified-migration-firestore-schema';
import { updateAdminUnifiedMigrationColumnMappings } from '../migrations/20260511000200-update-admin-unified-migration-column-mappings';
import { completeAdminUnifiedMigrationNormalizedRecords } from '../migrations/20260511000300-complete-admin-unified-migration-normalized-records';

type SetOptions = { merge?: boolean };
type Filter = { field: string; op: FirebaseFirestore.WhereFilterOp; value: unknown };
type Sort = { field: string; direction: FirebaseFirestore.OrderByDirection };

let mockFirestore: InMemoryFirestore;

jest.mock('../firebase', () => ({
  initializeFirestore: jest.fn(),
  getFirestore: () => mockFirestore,
}));

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function assertNoUndefined(value: unknown, path = 'data'): void {
  if (value === undefined) {
    throw new Error(`Cannot persist undefined at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefined(item, `${path}.${index}`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      assertNoUndefined(item, `${path}.${key}`);
    });
  }
}

class InMemoryDocSnapshot {
  constructor(
    readonly id: string,
    private readonly value?: Record<string, unknown>
  ) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): Record<string, unknown> | undefined {
    return clone(this.value);
  }
}

class InMemoryQuerySnapshot {
  constructor(readonly docs: InMemoryDocSnapshot[]) {}
}

class InMemoryDocRef {
  constructor(
    private readonly firestore: InMemoryFirestore,
    private readonly path: string,
    readonly id: string
  ) {}

  async get(): Promise<InMemoryDocSnapshot> {
    const collection = this.firestore.collectionStore(this.path);
    return new InMemoryDocSnapshot(this.id, collection.get(this.id));
  }

  async set(data: Record<string, unknown>, options: SetOptions = {}): Promise<void> {
    assertNoUndefined(data);
    const collection = this.firestore.collectionStore(this.path);
    const current = options.merge ? collection.get(this.id) || {} : {};
    collection.set(this.id, clone({ ...current, ...data }));
  }
}

class InMemoryQuery {
  constructor(
    protected readonly firestore: InMemoryFirestore,
    protected readonly path: string,
    protected readonly filters: Filter[] = [],
    protected readonly sorts: Sort[] = [],
    protected readonly max?: number
  ) {}

  where(field: string, op: FirebaseFirestore.WhereFilterOp, value: unknown): InMemoryQuery {
    return new InMemoryQuery(this.firestore, this.path, [...this.filters, { field, op, value }], this.sorts, this.max);
  }

  orderBy(field: string, direction: FirebaseFirestore.OrderByDirection = 'asc'): InMemoryQuery {
    return new InMemoryQuery(this.firestore, this.path, this.filters, [...this.sorts, { field, direction }], this.max);
  }

  limit(max: number): InMemoryQuery {
    return new InMemoryQuery(this.firestore, this.path, this.filters, this.sorts, max);
  }

  async get(): Promise<InMemoryQuerySnapshot> {
    let rows = Array.from(this.firestore.collectionStore(this.path).entries()).map(
      ([id, data]) => new InMemoryDocSnapshot(id, data)
    );

    this.filters.forEach((filter) => {
      rows = rows.filter((doc) => {
        const data = doc.data() || {};
        if (filter.op !== '==') {
          throw new Error(`Unsupported test filter operator: ${filter.op}`);
        }
        return data[filter.field] === filter.value;
      });
    });

    this.sorts.forEach((sort) => {
      rows = [...rows].sort((left, right) => {
        const leftValue = (left.data() || {})[sort.field];
        const rightValue = (right.data() || {})[sort.field];
        const result = String(leftValue || '').localeCompare(String(rightValue || ''));
        return sort.direction === 'desc' ? -result : result;
      });
    });

    return new InMemoryQuerySnapshot(this.max ? rows.slice(0, this.max) : rows);
  }
}

class InMemoryCollection extends InMemoryQuery {
  doc(id: string): InMemoryDocRef {
    return new InMemoryDocRef(this.firestore, this.path, id);
  }
}

class InMemoryFirestore {
  private readonly collections = new Map<string, Map<string, Record<string, unknown>>>();

  collection(path: string): InMemoryCollection {
    return new InMemoryCollection(this, path);
  }

  batch(): { set: (ref: InMemoryDocRef, data: Record<string, unknown>, options?: SetOptions) => void; commit: () => Promise<void> } {
    const writes: Array<() => Promise<void>> = [];
    return {
      set: (ref, data, options = {}) => {
        writes.push(() => ref.set(data, options));
      },
      commit: async () => {
        for (const write of writes) {
          await write();
        }
      },
    };
  }

  collectionStore(path: string): Map<string, Record<string, unknown>> {
    if (!this.collections.has(path)) {
      this.collections.set(path, new Map());
    }
    return this.collections.get(path) as Map<string, Record<string, unknown>>;
  }
}

const adminUser: AdminSessionUser = {
  id: 'user-admin',
  tenantId: 'tenant-a',
  username: 'admin',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin',
  active: true,
  createdAt: '2026-05-11T00:00:00.000Z',
  updatedAt: '2026-05-11T00:00:00.000Z',
};

function userWithPermissions(permissions: string[]): AdminSessionUser {
  return {
    ...adminUser,
    id: `user-${permissions.join('-') || 'empty'}`,
    role: 'usuario',
    permissions,
  };
}

describe('Migration assistant foundation', () => {
  beforeEach(() => {
    mockFirestore = new InMemoryFirestore();
  });

  it('creates Firestore metadata with formal migration permissions', async () => {
    await migrateAdminUnifiedMigrationFirestoreSchema();
    await updateAdminUnifiedMigrationColumnMappings();
    await completeAdminUnifiedMigrationNormalizedRecords();

    const schema = await mockFirestore.collection('admin_schema').doc('admin_unified_migration_assistant').get();
    const migration = await mockFirestore
      .collection('schema_migrations')
      .doc('20260511000100-create-admin-unified-migration-firestore-schema')
      .get();
    const columnMigration = await mockFirestore
      .collection('schema_migrations')
      .doc('20260511000200-update-admin-unified-migration-column-mappings')
      .get();
    const normalizedMigration = await mockFirestore
      .collection('schema_migrations')
      .doc('20260511000300-complete-admin-unified-migration-normalized-records')
      .get();

    expect(schema.exists).toBe(true);
    expect(migration.exists).toBe(true);
    expect(columnMigration.exists).toBe(true);
    expect(normalizedMigration.exists).toBe(true);
    expect((schema.data()?.permissions as string[])).toEqual([
      MIGRATION_PERMISSIONS.read,
      MIGRATION_PERMISSIONS.manage,
      MIGRATION_PERMISSIONS.execute,
      MIGRATION_PERMISSIONS.approveGoLive,
    ]);
    expect(Object.keys(schema.data()?.tenantScopedCollections as Record<string, string>)).toContain('migration_runs');
    expect(Object.keys(schema.data()?.tenantScopedCollections as Record<string, string>)).toContain('migration_records');
    expect(Object.keys(schema.data()?.tenantScopedCollections as Record<string, string>)).toContain('migration_normalized_records');
    expect(Object.keys(schema.data()?.tenantScopedCollections as Record<string, string>)).toContain('migration_column_mappings');
  });

  it('separates read, manage, execute and go-live approval permissions', () => {
    const viewer = userWithPermissions([MIGRATION_PERMISSIONS.read]);
    const executor = userWithPermissions([MIGRATION_PERMISSIONS.execute]);
    const approver = userWithPermissions([MIGRATION_PERMISSIONS.approveGoLive]);

    expect(canReadMigration(viewer)).toBe(true);
    expect(canManageMigration(viewer)).toBe(false);
    expect(canExecuteMigration(executor)).toBe(true);
    expect(canManageMigration(executor)).toBe(false);
    expect(canApproveMigrationGoLive(approver)).toBe(true);
    expect(canExecuteMigration(approver)).toBe(false);
    expect(canManageMigration(adminUser)).toBe(true);
  });

  it('creates projects and removes undefined values before Firestore persistence', async () => {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new MigrationService(audit as never);

    const project = await service.createProject(
      'tenant-a',
      adminUser,
      {
        name: 'Migracao WooCommerce',
        sourcePlatform: 'woocommerce',
        sourceUrl: 'https://loja.example.com',
        accessMethod: 'api',
        modules: ['catalog', 'customers', 'orders', 'seo'],
      },
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );

    const saved = await mockFirestore
      .collection('tenants/tenant-a/admin/data/migration_projects')
      .doc(project.id)
      .get();
    const report = await service.report('tenant-a', project.id);

    expect(saved.exists).toBe(true);
    expect(saved.data()?.tenantId).toBe('tenant-a');
    expect(saved.data()).not.toHaveProperty('notes');
    expect(report.events).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', module: 'migration' }));
  });

  it('does not persist source secrets when recording a connection', async () => {
    const service = new MigrationService({ record: jest.fn().mockResolvedValue(undefined) } as never);
    const project = await service.createProject('tenant-a', adminUser, {
      name: 'Migracao Shopify',
      sourcePlatform: 'shopify',
      sourceUrl: 'https://shop.example.com',
      accessMethod: 'api',
      modules: ['catalog'],
    });

    await service.connect(
      'tenant-a',
      adminUser,
      project.id,
      {
        authorizationConfirmed: true,
        feedUrl: 'https://shop.example.com/feed.xml',
        apiKey: 'api-secret',
        accessToken: 'token-secret',
        consumerSecret: 'consumer-secret',
      } as never
    );

    const saved = await mockFirestore
      .collection('tenants/tenant-a/admin/data/migration_projects')
      .doc(project.id)
      .get();

    expect(saved.data()?.credentialsConfigured).toBe(true);
    expect(saved.data()?.authorizationConfirmed).toBe(true);
    expect(saved.data()).not.toHaveProperty('apiKey');
    expect(saved.data()).not.toHaveProperty('accessToken');
    expect(saved.data()).not.toHaveProperty('consumerSecret');
    expect(String(saved.data()?.notes)).toContain('Feed: https://shop.example.com/feed.xml');

    const runs = await service.listRuns('tenant-a', project.id);
    expect(runs).toEqual([
      expect.objectContaining({
        operation: 'connect',
        status: 'completed',
        projectId: project.id,
      }),
    ]);
  });

  it('runs discovery, validation and homologation import with audit events', async () => {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new MigrationService(audit as never);
    const project = await service.createProject('tenant-a', adminUser, {
      name: 'Migracao Completa',
      sourcePlatform: 'shopify',
      sourceUrl: 'https://loja.example.com',
      accessMethod: 'api',
      modules: ['catalog', 'customers', 'orders', 'seo', 'content', 'redirects'],
    });

    await service.connect('tenant-a', adminUser, project.id, { authorizationConfirmed: true });
    const discovered = await service.discover('tenant-a', adminUser, project.id);
    const validated = await service.validate('tenant-a', adminUser, project.id);
    const imported = await service.importToStaging('tenant-a', adminUser, project.id);
    const report = await service.report('tenant-a', project.id);
    const pipeline = await service.pipelineSnapshot('tenant-a', project.id);

    expect(discovered.status).toBe('discovered');
    expect(discovered.discovery?.products).toBeGreaterThan(0);
    expect(validated.status).toBe('validated');
    expect(validated.validation?.issues.length).toBeGreaterThan(0);
    expect(imported.status).toBe('imported');
    expect(imported.importSummary?.environment).toBe('homologacao');
    expect(imported.importSummary?.skippedSensitiveFields).toContain('passwords');
    expect(pipeline.runs.map((run) => run.operation)).toEqual(
      expect.arrayContaining(['connect', 'discover', 'validate', 'import'])
    );
    expect(pipeline.rawBatches.length).toBeGreaterThan(0);
    expect(pipeline.records.map((record) => record.status)).toEqual(expect.arrayContaining(['raw', 'warning', 'imported']));
    expect(pipeline.validationIssues.length).toBeGreaterThan(0);
    expect(pipeline.importResults.map((result) => result.targetEnvironment)).toContain('homologacao');
    expect(report.events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'migration.project.created',
        'migration.source.connected',
        'migration.source.discovered',
        'migration.data.validated',
        'migration.data.imported_to_staging',
      ])
    );
  });

  it('discovers CSV/JSON files through the connector without persisting sensitive fields', async () => {
    const connector = new FileMigrationConnector();
    const input = {
      sourcePlatform: 'csv' as const,
      sourceUrl: 'https://legacy.example.com',
      accessMethod: 'file' as const,
      modules: ['catalog' as const],
      fileName: 'products.csv',
      fileContent: 'sku,name,price,email,password\nCAM-1,Camiseta,89.90,owner@example.com,secret',
    };

    const connection = await connector.testConnection(input);
    const discovery = await connector.discover(input);
    const records = await connector.fetchModule(input, 'catalog');

    expect(connection.ok).toBe(true);
    expect(discovery.products).toBe(1);
    expect(records.records).toHaveLength(1);
    expect(records.records[0].data).not.toHaveProperty('password');
    expect(records.records[0].data.email).toBe('ow***@example.com');
  });

  it('discovers XLS/XLSX files through the file connector', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet([
      { sku: 'CAM-1', name: 'Camiseta', price: '89.90', password: 'secret' },
      { sku: 'CAL-1', name: 'Calca', price: '129.90', password: 'secret' },
    ]);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'products');
    const fileContentBase64 = xlsx.write(workbook, { type: 'base64', bookType: 'xlsx' }) as string;
    const connector = new FileMigrationConnector();
    const input = {
      sourcePlatform: 'csv' as const,
      sourceUrl: 'https://legacy.example.com',
      accessMethod: 'file' as const,
      modules: ['catalog' as const],
      fileName: 'products.xlsx',
      fileContentBase64,
    };

    const connection = await connector.testConnection(input);
    const discovery = await connector.discover(input);
    const records = await connector.fetchModule(input, 'catalog');

    expect(connection.ok).toBe(true);
    expect(discovery.products).toBe(2);
    expect(records.records).toHaveLength(2);
    expect(records.records[0].data).not.toHaveProperty('password');
  });

  it('uses the file connector in project discovery and stores only sampled metadata', async () => {
    const service = new MigrationService({ record: jest.fn().mockResolvedValue(undefined) } as never);
    const project = await service.createProject('tenant-a', adminUser, {
      name: 'Migracao CSV',
      sourcePlatform: 'csv',
      sourceUrl: 'https://legacy.example.com',
      accessMethod: 'file',
      modules: ['catalog'],
    });
    const payload = {
      fileName: 'products.csv',
      fileContent: 'sku,name,price,password\nCAM-1,Camiseta,89.90,secret\nCAL-1,Calca,129.90,secret',
    };

    await service.connect('tenant-a', adminUser, project.id, payload);
    const discovered = await service.discover('tenant-a', adminUser, project.id, undefined, payload);
    const pipeline = await service.pipelineSnapshot('tenant-a', project.id);

    expect(discovered.discovery?.products).toBe(2);
    expect(pipeline.rawBatches).toEqual([
      expect.objectContaining({
        module: 'catalog',
        recordCount: 2,
        payloadStored: false,
        sanitized: true,
      }),
    ]);
    expect(pipeline.records).toHaveLength(2);
    expect(pipeline.records[0].metadata).toEqual(
      expect.objectContaining({
        sampledRecord: true,
        sourceFields: expect.arrayContaining(['sku', 'name', 'price']),
        normalizedPreview: expect.objectContaining({
          targetResourceType: 'product',
          fields: expect.objectContaining({ sku: 'CAM-1', name: 'Camiseta', price: 89.9 }),
        }),
      })
    );
    expect(pipeline.columnMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: 'catalog',
          targetField: 'sku',
          sourceField: 'sku',
          status: 'suggested',
        }),
      ])
    );
  });

  it('validates sampled records into normalized records before homologation import', async () => {
    const service = new MigrationService({ record: jest.fn().mockResolvedValue(undefined) } as never);
    const project = await service.createProject('tenant-a', adminUser, {
      name: 'Migracao CSV incompleta',
      sourcePlatform: 'csv',
      sourceUrl: 'https://legacy.example.com',
      accessMethod: 'file',
      modules: ['catalog'],
    });
    const payload = {
      fileName: 'products.csv',
      fileContent: 'sku,name,price\nCAM-1,Camiseta,89.90\n,Camiseta sem SKU,79.90',
    };

    await service.connect('tenant-a', adminUser, project.id, payload);
    await service.discover('tenant-a', adminUser, project.id, undefined, payload);
    const validated = await service.validate('tenant-a', adminUser, project.id);
    const pipeline = await service.pipelineSnapshot('tenant-a', project.id);

    expect(validated.status).toBe('blocked');
    expect(validated.validation?.blockedRecords).toBe(1);
    expect(pipeline.normalizedRecords).toHaveLength(2);
    expect(pipeline.normalizedRecords.map((record) => record.status)).toEqual(expect.arrayContaining(['ready', 'blocked']));
    expect(pipeline.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: 'catalog',
          severity: 'error',
          title: 'Registro bloqueado pela validacao',
        }),
      ])
    );
    await expect(service.importToStaging('tenant-a', adminUser, project.id)).rejects.toThrow('Projeto bloqueado');
  });

  it('imports normalized records to homologation with source mappings for incremental sync', async () => {
    const service = new MigrationService({ record: jest.fn().mockResolvedValue(undefined) } as never);
    const project = await service.createProject('tenant-a', adminUser, {
      name: 'Migracao CSV valida',
      sourcePlatform: 'csv',
      sourceUrl: 'https://legacy.example.com',
      accessMethod: 'file',
      modules: ['catalog'],
    });
    const payload = {
      fileName: 'products.csv',
      fileContent: 'sku,name,price\nCAM-1,Camiseta,89.90\nCAL-1,Calca,129.90',
    };

    await service.connect('tenant-a', adminUser, project.id, payload);
    await service.discover('tenant-a', adminUser, project.id, undefined, payload);
    const validated = await service.validate('tenant-a', adminUser, project.id);
    const imported = await service.importToStaging('tenant-a', adminUser, project.id);
    const pipeline = await service.pipelineSnapshot('tenant-a', project.id);

    expect(validated.status).toBe('validated');
    expect(imported.status).toBe('imported');
    expect(imported.importSummary?.importedProducts).toBe(2);
    expect(pipeline.normalizedRecords.map((record) => record.status)).toEqual(['imported', 'imported']);
    expect(pipeline.sourceMappings).toHaveLength(2);
    expect(pipeline.sourceMappings[0]).toEqual(
      expect.objectContaining({
        sourcePlatform: 'csv',
        sourceResourceType: 'product',
        t3ckResourceType: 'product',
      })
    );
    expect(pipeline.importResults).toEqual([
      expect.objectContaining({
        module: 'catalog',
        importedRecords: 2,
        skippedRecords: 0,
        targetEnvironment: 'homologacao',
      }),
    ]);
  });

  it('allows confirmed column mappings to be saved without exposing source payloads', async () => {
    const service = new MigrationService({ record: jest.fn().mockResolvedValue(undefined) } as never);
    const project = await service.createProject('tenant-a', adminUser, {
      name: 'Migracao CSV',
      sourcePlatform: 'csv',
      sourceUrl: 'https://legacy.example.com',
      accessMethod: 'file',
      modules: ['catalog'],
    });

    const mappings = await service.saveColumnMappings('tenant-a', adminUser, project.id, [
      {
        module: 'catalog',
        targetField: 'name',
        sourceField: 'titulo',
        required: true,
        confidence: 'high',
        status: 'confirmed',
      },
    ]);
    const pipeline = await service.pipelineSnapshot('tenant-a', project.id);

    expect(mappings).toEqual([
      expect.objectContaining({
        module: 'catalog',
        targetField: 'name',
        sourceField: 'titulo',
        status: 'confirmed',
      }),
    ]);
    expect(pipeline.columnMappings).toHaveLength(1);
    expect(pipeline.columnMappings[0]).not.toHaveProperty('fileContent');
  });

  it('discovers WooCommerce counts with official REST API semantics', async () => {
    const connector = new WooCommerceMigrationConnector();
    const fetchImpl: MigrationConnectorFetch = jest.fn(async (url) => {
      const total = url.includes('/products/categories')
        ? 4
        : url.includes('/customers')
          ? 9
          : url.includes('/orders')
            ? 21
            : 12;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: (name: string) => (name.toLowerCase() === 'x-wp-total' ? String(total) : null) },
        json: async () => [{ id: 10, name: 'Tenis Preto', password: 'must-not-persist' }],
        text: async () => '',
      };
    });
    const input = {
      sourcePlatform: 'woocommerce' as const,
      sourceUrl: 'https://woo.example.com',
      accessMethod: 'api' as const,
      modules: ['catalog' as const, 'customers' as const, 'orders' as const, 'seo' as const],
      credentials: { consumerKey: 'ck_test', consumerSecret: 'cs_test' },
      fetchImpl,
    };

    const connection = await connector.testConnection(input);
    const discovery = await connector.discover(input);
    const products = await connector.fetchModule(input, 'catalog');

    expect(connection.ok).toBe(true);
    expect(discovery.products).toBe(12);
    expect(discovery.categories).toBe(4);
    expect(discovery.customers).toBe(9);
    expect(discovery.orders).toBe(21);
    expect(discovery.indexableUrls).toBe(16);
    expect(products.records[0].data).not.toHaveProperty('password');
  });
});
