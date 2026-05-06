import { getFirestore, initializeFirestore } from '../firebase';
import { SYSTEM_THEMES } from '../theme-defaults';

const MIGRATION_ID = '20260506000100-create-admin-unified-theme-firestore-schema';
const nowIso = (): string => new Date().toISOString();

export async function migrateAdminUnifiedThemeFirestoreSchema(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error('Firestore is required to run theme schema migration');
  }

  const migrationRef = firestore.collection('schema_migrations').doc(MIGRATION_ID);
  const migration = await migrationRef.get();
  if (migration.exists) {
    return;
  }

  const batch = firestore.batch();
  for (const theme of SYSTEM_THEMES) {
    batch.set(firestore.collection('themes').doc(theme.id), theme, { merge: true });
  }

  batch.set(
    firestore.collection('admin_schema').doc('admin_unified_theme_system'),
    {
      id: 'admin_unified_theme_system',
      service: 'admin-service',
      dashboard: 'admin-unified-dashboard',
      database: 'firebase-firestore',
      globalCollections: {
        themes: 'System theme presets with safe design tokens.',
      },
      tenantScopedCollections: {
        tenant_themes: 'tenants/{tenantId}/admin/data/tenant_themes/{active|draft}',
        user_theme_preferences: 'tenants/{tenantId}/admin/data/user_theme_preferences/{userId}',
        dashboard_layouts: 'tenants/{tenantId}/admin/data/dashboard_layouts/{layoutId}',
        dashboard_widgets: 'tenants/{tenantId}/admin/data/dashboard_widgets/{widgetId}',
      },
      security: {
        allowsFreeJavascript: false,
        allowsFreeCss: false,
        maxTokenPayloadBytes: 15000,
        tokenStorage: 'Firestore JSON documents scoped by tenant.',
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    { merge: true }
  );

  batch.set(migrationRef, {
    id: MIGRATION_ID,
    name: 'Create admin-unified theme Firestore schema metadata and system themes',
    service: 'admin-service',
    appliedAt: nowIso(),
  });

  await batch.commit();
}

if (require.main === module) {
  migrateAdminUnifiedThemeFirestoreSchema()
    .then(() => {
      console.log(`${MIGRATION_ID} applied`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
