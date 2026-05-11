import { getFirestore, initializeFirestore } from '../firebase';

const MIGRATION_ID = '20260511000200-update-admin-unified-migration-column-mappings';
const nowIso = (): string => new Date().toISOString();

export async function updateAdminUnifiedMigrationColumnMappings(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error('Firestore is required to update migration column mapping metadata');
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
        migration_column_mappings:
          'tenants/{tenantId}/admin/data/migration_column_mappings/{mappingId}',
      },
      recommendedIndexes: Array.from(
        new Set([...currentIndexes, 'migration_column_mappings: tenantId/projectId/module/status'])
      ),
      principles: {
        ...currentPrinciples,
        columnMapping:
          'Column mappings are tenant-scoped, sanitized, user-confirmable and used to normalize source data into T3CK DTOs.',
      },
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(migrationRef, {
    id: MIGRATION_ID,
    name: 'Add migration assistant column mapping metadata',
    service: 'admin-service',
    appliedAt: now,
  });

  await batch.commit();
}

if (require.main === module) {
  updateAdminUnifiedMigrationColumnMappings()
    .then(() => {
      console.log(`${MIGRATION_ID} applied`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
