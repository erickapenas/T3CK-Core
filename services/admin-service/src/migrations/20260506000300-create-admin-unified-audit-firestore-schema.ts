import { getFirestore, initializeFirestore } from '../firebase';

const MIGRATION_ID = '20260506000300-create-admin-unified-audit-firestore-schema';
const nowIso = (): string => new Date().toISOString();

export async function migrateAdminUnifiedAuditFirestoreSchema(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error('Firestore is required to run audit schema migration');
  }

  const migrationRef = firestore.collection('schema_migrations').doc(MIGRATION_ID);
  const migration = await migrationRef.get();
  if (migration.exists) return;

  const now = nowIso();
  const batch = firestore.batch();
  batch.set(
    firestore.collection('admin_schema').doc('admin_unified_audit_logs'),
    {
      id: 'admin_unified_audit_logs',
      service: 'admin-service',
      dashboard: 'admin-unified-dashboard',
      database: 'firebase-firestore',
      tenantScopedCollections: {
        audit_logs: 'tenants/{tenantId}/admin/data/audit_logs/{logId}',
        audit_log_exports: 'tenants/{tenantId}/admin/data/audit_log_exports/{exportId}',
        audit_log_retention_policies:
          'tenants/{tenantId}/admin/data/audit_log_retention_policies/{policyId}',
        audit_log_alert_rules: 'tenants/{tenantId}/admin/data/audit_log_alert_rules/{ruleId}',
        audit_log_alerts: 'tenants/{tenantId}/admin/data/audit_log_alerts/{alertId}',
        audit_log_integrity_checks:
          'tenants/{tenantId}/admin/data/audit_log_integrity_checks/{checkId}',
      },
      principles: {
        appendOnly: true,
        logicalImmutability: true,
        tenantIsolation: 'All API queries derive tenant_id from authenticated context.',
        sensitiveDataPolicy: 'Sanitize before_data, after_data and metadata before persistence.',
        tamperEvidence: 'hash + previous_hash chain stored on normalized audit_logs.',
      },
      defaultRetentionDays: {
        common: 180,
        security: 365,
        sensitiveExportsFiscal: 1825,
      },
      permissions: [
        'visualizar_logs_auditoria',
        'visualizar_logs_seguranca',
        'visualizar_logs_exportacao',
        'visualizar_logs_sensiveis',
        'visualizar_detalhes_log',
        'exportar_logs_auditoria',
        'gerenciar_regras_alerta_auditoria',
        'gerenciar_retencao_auditoria',
        'executar_verificacao_integridade_logs',
        'visualizar_logs_outros_usuarios',
        'visualizar_logs_super_admin',
      ],
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(migrationRef, {
    id: MIGRATION_ID,
    name: 'Create admin-unified audit log Firestore schema metadata',
    service: 'admin-service',
    appliedAt: now,
  });

  await batch.commit();
}

if (require.main === module) {
  migrateAdminUnifiedAuditFirestoreSchema()
    .then(() => {
      console.log(`${MIGRATION_ID} applied`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
