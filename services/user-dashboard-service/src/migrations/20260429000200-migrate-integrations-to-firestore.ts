import { resolve } from 'path';
import { getFirestore, initializeFirestore } from '../firebase';
import { FirestoreIntegrationStateStore } from '../integrations/firestore-integration-state-store';
import { FileIntegrationStateStore } from '../integrations/integration-state-store';

const migrationId = '20260429000200-user-dashboard-integrations-firestore';

export async function migrateIntegrationsToFirestore(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error(
      'Firestore unavailable. Set FIREBASE_SERVICE_ACCOUNT_KEY_PATH or FIREBASE_SERVICE_ACCOUNT before running this migration.'
    );
  }

  const sourceFile =
    process.env.INTEGRATION_STATE_FILE ||
    resolve(process.cwd(), 'data', 'user-dashboard-integrations-state.json');
  const source = new FileIntegrationStateStore(sourceFile);
  const target = new FirestoreIntegrationStateStore(firestore);
  const snapshot = await source.load();

  await target.save(snapshot);
  await firestore.collection('schema_migrations').doc(migrationId).set(
    {
      id: migrationId,
      service: 'user-dashboard-service',
      module: 'integrations',
      storage: 'firestore',
      sourceFile,
      counts: {
        integrations: snapshot.integrations.length,
        marketplaceAccounts: snapshot.marketplaceAccounts.length,
        marketplaceOrders: snapshot.marketplaceOrders.length,
        integrationLogs: snapshot.integrationLogs.length,
        pageSpeedReports: snapshot.pageSpeedReports.length,
      },
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

if (require.main === module) {
  migrateIntegrationsToFirestore()
    .then(() => {
      console.log(`Migration ${migrationId} completed`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`Migration ${migrationId} failed`, error);
      process.exit(1);
    });
}
