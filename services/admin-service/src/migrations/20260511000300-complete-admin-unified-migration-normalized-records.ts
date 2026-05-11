import { getFirestore, initializeFirestore } from '../firebase';

const MIGRATION_ID = '20260511000300-complete-admin-unified-migration-normalized-records';
const nowIso = (): string => new Date().toISOString();

export async function completeAdminUnifiedMigrationNormalizedRecords(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error('Firestore is required to update migration normalized records metadata');
  }

  const migrationRef = firestore.collection('schema_migrations').doc(MIGRATION_ID);
  const migration = await migrationRef.get();
  if (migration.exists) return;

  const now = nowIso();
  const schemaRef = firestore.collection('admin_schema').doc('admin_unified_migration_assistant');
  const schema = await schemaRef.get();
  const currentCollections =
    schema.data()?.tenantScopedCollections && typeof schema.data()?.tenantScopedCollections === 'object'
      ? (schema.data()?.tenantScopedCollections as Record<string, string>)
      : {};
  const currentPrinciples =
    schema.data()?.principles && typeof schema.data()?.principles === 'object'
      ? (schema.data()?.principles as Record<string, string>)
      : {};
  const currentIndexes = Array.isArray(schema.data()?.recommendedIndexes)
    ? (schema.data()?.recommendedIndexes as string[])
    : [];
  const batch = firestore.batch();

  batch.set(
    schemaRef,
    {
      tenantScopedCollections: {
        ...currentCollections,
        migration_normalized_records:
          'tenants/{tenantId}/admin/data/migration_normalized_records/{recordId}',
      },
      recommendedIndexes: Array.from(
        new Set([...currentIndexes, 'migration_normalized_records: tenantId/projectId/module/status'])
      ),
      principles: {
        ...currentPrinciples,
        normalizedRecords:
          'Validation persists sanitized normalized records with field mappings, warnings and homologation status before import.',
        homologationMappings:
          'Import writes source mappings from source platform/resource/id to staging T3CK ids for idempotent incremental sync.',
      },
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(migrationRef, {
    id: MIGRATION_ID,
    name: 'Complete migration assistant normalized records metadata',
    service: 'admin-service',
    appliedAt: now,
  });

  await batch.commit();
}

if (require.main === module) {
  completeAdminUnifiedMigrationNormalizedRecords()
    .then(() => {
      console.log(`${MIGRATION_ID} applied`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
