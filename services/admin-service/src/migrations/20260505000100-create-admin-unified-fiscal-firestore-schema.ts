import { getFirestore, initializeFirestore } from '../firebase';
import { FiscalService } from '../fiscal/fiscal-service';
import { nowIso } from '../fiscal/utils';

const MIGRATION_ID = '20260505000100-create-admin-unified-fiscal-firestore-schema';

export async function migrateAdminUnifiedFiscalFirestoreSchema(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error('Firestore is required to run fiscal schema migration');
  }

  const fiscalService = new FiscalService();
  const migrationRef = firestore.collection('schema_migrations').doc(MIGRATION_ID);
  const migration = await migrationRef.get();
  if (migration.exists) {
    return;
  }

  await firestore.collection('admin_schema').doc('admin_unified_fiscal').set(
    {
      id: 'admin_unified_fiscal',
      service: 'admin-service',
      dashboard: 'admin-unified-dashboard',
      database: 'firebase-firestore',
      tenantScopedPath: 'tenants/{tenantId}/admin/data/{collection}/{documentId}',
      collections: fiscalService.describeFirestoreSchema(),
      sensitiveCollections: [
        'companyFiscalSettings',
        'invoices',
        'fiscalConfigurationAuditLogs',
        'adminUnifiedAuditLogs',
      ],
      idempotentCollections: ['invoices', 'inventoryMovements', 'adminUnifiedAuditLogs'],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    { merge: true }
  );

  await migrationRef.set({
    id: MIGRATION_ID,
    name: 'Create admin-unified fiscal Firestore schema metadata',
    service: 'admin-service',
    appliedAt: nowIso(),
  });
}

if (require.main === module) {
  migrateAdminUnifiedFiscalFirestoreSchema()
    .then(() => {
      console.log(`${MIGRATION_ID} applied`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
