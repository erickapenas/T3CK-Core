import * as admin from 'firebase-admin';
import {
  emptyIntegrationState,
  IntegrationStateStore,
} from './integration-state-store';
import { IntegrationStateSnapshot } from './types';

type SnapshotKey = keyof IntegrationStateSnapshot;

const collections: Array<{ key: SnapshotKey; name: string }> = [
  { key: 'integrations', name: 'integrations' },
  { key: 'marketplaceAccounts', name: 'marketplace_accounts' },
  { key: 'marketplaceOrders', name: 'marketplace_orders' },
  { key: 'integrationLogs', name: 'integration_logs' },
  { key: 'pageSpeedReports', name: 'pagespeed_reports' },
];

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)])
    );
  }
  return value;
}

function withFirestoreAliases(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  if (record.tenantId) {
    next.tenant_id = record.tenantId;
  }
  if (record.userId) {
    next.user_id = record.userId;
  }
  if (record.integrationId) {
    next.integration_id = record.integrationId;
  }
  if (record.externalOrderId) {
    next.external_order_id = record.externalOrderId;
  }
  if (record.idempotencyKey) {
    next.idempotency_key = record.idempotencyKey;
  }
  if (record.createdAt) {
    next.created_at = record.createdAt;
  }
  if (record.updatedAt) {
    next.updated_at = record.updatedAt;
  }
  if (record.importedAt) {
    next.imported_at = record.importedAt;
  }
  return removeUndefined(next) as Record<string, unknown>;
}

function fromFirestoreData(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    tenantId: data.tenantId || data.tenant_id,
    userId: data.userId || data.user_id,
    integrationId: data.integrationId || data.integration_id,
    externalOrderId: data.externalOrderId || data.external_order_id,
    idempotencyKey: data.idempotencyKey || data.idempotency_key,
    createdAt: data.createdAt || data.created_at,
    updatedAt: data.updatedAt || data.updated_at,
    importedAt: data.importedAt || data.imported_at,
  };
}

export class FirestoreIntegrationStateStore implements IntegrationStateStore {
  constructor(
    private readonly firestore: admin.firestore.Firestore,
    private readonly collectionPrefix = process.env.INTEGRATION_FIRESTORE_COLLECTION_PREFIX || ''
  ) {}

  async load(): Promise<IntegrationStateSnapshot> {
    const snapshot = emptyIntegrationState();

    await Promise.all(
      collections.map(async ({ key, name }) => {
        const docs = await this.firestore.collection(this.collectionName(name)).get();
        snapshot[key] = docs.docs.map((doc) =>
          fromFirestoreData({ id: doc.id, ...doc.data() })
        ) as never;
      })
    );

    return snapshot;
  }

  async save(snapshot: IntegrationStateSnapshot): Promise<void> {
    for (const { key, name } of collections) {
      await this.saveCollection(name, snapshot[key] as Array<{ id: string }>);
    }
  }

  private async saveCollection(name: string, records: Array<{ id: string }>): Promise<void> {
    const collection = this.firestore.collection(this.collectionName(name));

    for (let index = 0; index < records.length; index += 450) {
      const batch = this.firestore.batch();
      const chunk = records.slice(index, index + 450);

      for (const record of chunk) {
        batch.set(collection.doc(record.id), withFirestoreAliases(record), { merge: false });
      }

      if (chunk.length) {
        await batch.commit();
      }
    }
  }

  private collectionName(name: string): string {
    return this.collectionPrefix ? `${this.collectionPrefix}_${name}` : name;
  }
}
