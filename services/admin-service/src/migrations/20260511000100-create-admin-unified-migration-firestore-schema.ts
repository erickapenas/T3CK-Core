import { getFirestore, initializeFirestore } from '../firebase';

const MIGRATION_ID = '20260511000100-create-admin-unified-migration-firestore-schema';
const nowIso = (): string => new Date().toISOString();

export async function migrateAdminUnifiedMigrationFirestoreSchema(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error('Firestore is required to run migration assistant schema migration');
  }

  const migrationRef = firestore.collection('schema_migrations').doc(MIGRATION_ID);
  const migration = await migrationRef.get();
  if (migration.exists) return;

  const now = nowIso();
  const batch = firestore.batch();
  batch.set(
    firestore.collection('admin_schema').doc('admin_unified_migration_assistant'),
    {
      id: 'admin_unified_migration_assistant',
      service: 'admin-service',
      dashboard: 'admin-unified-dashboard',
      database: 'firebase-firestore',
      tenantScopedCollections: {
        migration_projects: 'tenants/{tenantId}/admin/data/migration_projects/{projectId}',
        migration_events: 'tenants/{tenantId}/admin/data/migration_events/{eventId}',
        migration_runs: 'tenants/{tenantId}/admin/data/migration_runs/{runId}',
        migration_records: 'tenants/{tenantId}/admin/data/migration_records/{recordId}',
        migration_source_connections:
          'tenants/{tenantId}/admin/data/migration_source_connections/{connectionId}',
        migration_raw_batches: 'tenants/{tenantId}/admin/data/migration_raw_batches/{batchId}',
        migration_normalized_records:
          'tenants/{tenantId}/admin/data/migration_normalized_records/{recordId}',
        migration_validation_issues:
          'tenants/{tenantId}/admin/data/migration_validation_issues/{issueId}',
        migration_import_results: 'tenants/{tenantId}/admin/data/migration_import_results/{resultId}',
        migration_source_mappings:
          'tenants/{tenantId}/admin/data/migration_source_mappings/{mappingId}',
        migration_column_mappings:
          'tenants/{tenantId}/admin/data/migration_column_mappings/{mappingId}',
        migration_redirects: 'tenants/{tenantId}/admin/data/migration_redirects/{redirectId}',
        migration_go_live_checks:
          'tenants/{tenantId}/admin/data/migration_go_live_checks/{checkId}',
      },
      principles: {
        tenantIsolation: 'All migration reads and writes derive tenant_id from authenticated context.',
        assistedBridge:
          'Migration assistant extracts, normalizes, validates and imports commercial data into T3CK homologation.',
        noPlatformClone:
          'The assistant does not migrate old backend, checkout, source code, proprietary theme, raw database or infrastructure.',
        sensitiveDataPolicy:
          'Passwords, card data, payment tokens, sessions, cookies, certificates and secrets are never imported or persisted in clear text.',
        homologationFirst: 'Imports target T3CK homologation before go-live approval.',
        idempotency:
          'Future runs and records must map source platform/resource/id to T3CK resource ids before incremental sync.',
        auditability:
          'Connection, discovery, validation, import, sync, report and go-live approval create audit events.',
        temporaryRetention:
          'Temporary migration data must support expiration and explicit cleanup after validation/go-live.',
      },
      supportedSources: [
        'shopify',
        'woocommerce',
        'nuvemshop',
        'tray',
        'vtex',
        'loja_integrada',
        'magento',
        'csv',
        'xml',
        'merchant_feed',
        'sitemap',
        'public_read',
        'manual',
      ],
      supportedModules: ['catalog', 'customers', 'orders', 'seo', 'layout', 'content', 'redirects'],
      permissions: [
        'visualizar_migracao',
        'gerenciar_migracao',
        'executar_migracao',
        'aprovar_go_live_migracao',
      ],
      recommendedIndexes: [
        'migration_projects: tenantId/status/updatedAt DESC',
        'migration_projects: tenantId/sourcePlatform/updatedAt DESC',
        'migration_projects: tenantId/createdBy/updatedAt DESC',
        'migration_events: tenantId/projectId/createdAt DESC',
        'migration_events: tenantId/action/createdAt DESC',
        'migration_events: tenantId/status/createdAt DESC',
        'migration_runs: tenantId/projectId/createdAt DESC',
        'migration_runs: tenantId/status/createdAt DESC',
        'migration_records: tenantId/projectId/module/status',
        'migration_records: tenantId/projectId/sourcePlatform/sourceId',
        'migration_records: tenantId/projectId/t3ckResourceType/t3ckResourceId',
        'migration_normalized_records: tenantId/projectId/module/status',
        'migration_source_mappings: tenantId/projectId/sourcePlatform/sourceResourceType/sourceId',
        'migration_column_mappings: tenantId/projectId/module/status',
        'migration_validation_issues: tenantId/projectId/severity/status',
        'migration_redirects: tenantId/projectId/status/type',
      ],
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(migrationRef, {
    id: MIGRATION_ID,
    name: 'Create admin-unified migration assistant Firestore schema metadata',
    service: 'admin-service',
    appliedAt: now,
  });

  await batch.commit();
}

if (require.main === module) {
  migrateAdminUnifiedMigrationFirestoreSchema()
    .then(() => {
      console.log(`${MIGRATION_ID} applied`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
