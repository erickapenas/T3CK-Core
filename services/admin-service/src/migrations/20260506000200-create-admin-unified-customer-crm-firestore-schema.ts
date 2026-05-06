import { getFirestore, initializeFirestore } from '../firebase';

const MIGRATION_ID = '20260506000200-create-admin-unified-customer-crm-firestore-schema';
const nowIso = (): string => new Date().toISOString();

export async function migrateAdminUnifiedCustomerCrmFirestoreSchema(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error('Firestore is required to run customer CRM schema migration');
  }

  const migrationRef = firestore.collection('schema_migrations').doc(MIGRATION_ID);
  const migration = await migrationRef.get();
  if (migration.exists) {
    return;
  }

  const now = nowIso();
  const batch = firestore.batch();
  batch.set(
    firestore.collection('admin_schema').doc('admin_unified_customer_crm'),
    {
      id: 'admin_unified_customer_crm',
      service: 'admin-service',
      dashboard: 'admin-unified-dashboard',
      database: 'firebase-firestore',
      tenantScopedCollections: {
        customers: 'tenants/{tenantId}/admin/data/customers/{customerId}',
        customer_addresses: 'tenants/{tenantId}/admin/data/customer_addresses/{addressId}',
        customer_contacts: 'tenants/{tenantId}/admin/data/customer_contacts/{contactId}',
        customer_tags: 'tenants/{tenantId}/admin/data/customer_tags/{tagId}',
        customer_notes: 'tenants/{tenantId}/admin/data/customer_notes/{noteId}',
        customer_consents: 'tenants/{tenantId}/admin/data/customer_consents/{consentId}',
        customer_privacy_requests:
          'tenants/{tenantId}/admin/data/customer_privacy_requests/{requestId}',
        customer_audit_logs: 'tenants/{tenantId}/admin/data/customer_audit_logs/{logId}',
      },
      requiredIndexes: [
        'customers: status/customerType/state/source + createdAt DESC',
        'customers: emailNormalized/documentNormalized for tenant-local uniqueness',
        'customer_* child collections: customerId + createdAt DESC',
        'orders: customerId + createdAt DESC for customer history',
      ],
      piiControls: {
        sensitiveFields: ['documentNumber', 'cpfCnpj', 'email', 'phone', 'addresses'],
        defaultListMasking: true,
        fullDataPermission: 'visualizar_dados_sensiveis_cliente',
        exportPermission: 'exportar_clientes',
        anonymizePermission: 'anonimizar_clientes',
      },
      permissions: [
        'visualizar_clientes',
        'criar_clientes',
        'editar_clientes',
        'excluir_clientes',
        'visualizar_dados_sensiveis_cliente',
        'visualizar_historico_pedidos_cliente',
        'visualizar_financeiro_cliente',
        'exportar_clientes',
        'anonimizar_clientes',
        'gerenciar_tags_cliente',
        'gerenciar_consentimentos_cliente',
        'visualizar_logs_cliente',
        'bloquear_cliente',
        'gerenciar_observacoes_cliente',
      ],
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(migrationRef, {
    id: MIGRATION_ID,
    name: 'Create admin-unified customer CRM Firestore schema metadata',
    service: 'admin-service',
    appliedAt: now,
  });

  await batch.commit();
}

if (require.main === module) {
  migrateAdminUnifiedCustomerCrmFirestoreSchema()
    .then(() => {
      console.log(`${MIGRATION_ID} applied`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
