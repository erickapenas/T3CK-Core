import { getFirestore, initializeFirestore } from '../firebase';

const MIGRATION_ID = '20260506000500-create-admin-unified-orders-firestore-schema';
const nowIso = (): string => new Date().toISOString();

export async function migrateAdminUnifiedOrdersFirestoreSchema(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error('Firestore is required to run orders schema migration');
  }

  const migrationRef = firestore.collection('schema_migrations').doc(MIGRATION_ID);
  const migration = await migrationRef.get();
  if (migration.exists) return;

  const now = nowIso();
  const batch = firestore.batch();
  batch.set(
    firestore.collection('admin_schema').doc('admin_unified_orders_operations'),
    {
      id: 'admin_unified_orders_operations',
      service: 'admin-service',
      dashboard: 'admin-unified-dashboard',
      database: 'firebase-firestore',
      tenantScopedCollections: {
        orders: 'tenants/{tenantId}/admin/data/orders/{orderId}',
        order_items: 'tenants/{tenantId}/admin/data/order_items/{orderItemId}',
        order_addresses: 'tenants/{tenantId}/admin/data/order_addresses/{addressId}',
        order_payments: 'tenants/{tenantId}/admin/data/order_payments/{paymentId}',
        order_refunds: 'tenants/{tenantId}/admin/data/order_refunds/{refundId}',
        order_shipments: 'tenants/{tenantId}/admin/data/order_shipments/{shipmentId}',
        order_tracking_events: 'tenants/{tenantId}/admin/data/order_tracking_events/{trackingEventId}',
        order_history: 'tenants/{tenantId}/admin/data/order_history/{historyId}',
        order_notes: 'tenants/{tenantId}/admin/data/order_notes/{noteId}',
        order_status_transitions:
          'tenants/{tenantId}/admin/data/order_status_transitions/{transitionId}',
        order_idempotency_keys:
          'tenants/{tenantId}/admin/data/order_idempotency_keys/{idempotencyKeyId}',
      },
      principles: {
        tenantIsolation: 'All API reads and writes derive tenant_id from authenticated context.',
        serverTotals:
          'Order totals are recalculated in the backend whenever items, discounts, freight or fees change.',
        snapshots:
          'Customer, product and address snapshots are stored on the order for historical accuracy.',
        idempotency:
          'Critical operations store idempotency keys by tenant, order and operation to prevent duplicates.',
        auditability:
          'Order creation, edits, status changes, payments, refunds, stock, invoice, shipping, export and notes generate audit/history events.',
      },
      permissions: [
        'visualizar_pedidos',
        'criar_pedidos',
        'editar_pedidos',
        'cancelar_pedidos',
        'excluir_pedidos',
        'alterar_status_pedido',
        'visualizar_dados_cliente_pedido',
        'visualizar_dados_sensiveis_pedido',
        'visualizar_pagamento_pedido',
        'confirmar_pagamento_manual',
        'reembolsar_pedido',
        'visualizar_estoque_pedido',
        'reservar_estoque_pedido',
        'baixar_estoque_pedido',
        'visualizar_nota_fiscal_pedido',
        'emitir_nota_fiscal_pedido',
        'cancelar_nota_fiscal_pedido',
        'visualizar_envio_pedido',
        'atualizar_rastreio_pedido',
        'exportar_pedidos',
        'executar_acoes_em_massa_pedidos',
        'visualizar_logs_pedido',
        'gerenciar_observacoes_pedido',
      ],
      recommendedIndexes: [
        'orders: tenantId/createdAt, tenantId/orderNumber, tenantId/customerId',
        'orders: tenantId/status/createdAt, tenantId/paymentStatus/createdAt',
        'orders: tenantId/fiscalStatus/createdAt, tenantId/stockStatus/createdAt',
        'orders: tenantId/shippingStatus/createdAt, tenantId/channel/createdAt',
        'orders: tenantId/marketplace/externalOrderId',
        'order_items: tenantId/orderId, tenantId/productId, tenantId/sku',
        'order_payments: tenantId/orderId/status/createdAt',
        'order_shipments: tenantId/orderId/updatedAt',
        'order_history: tenantId/orderId/createdAt',
        'order_notes: tenantId/orderId/createdAt',
        'order_idempotency_keys: tenantId/operation/idempotencyKey',
      ],
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(migrationRef, {
    id: MIGRATION_ID,
    name: 'Create admin-unified orders, operations, history and idempotency Firestore schema metadata',
    service: 'admin-service',
    appliedAt: now,
  });

  await batch.commit();
}

if (require.main === module) {
  migrateAdminUnifiedOrdersFirestoreSchema()
    .then(() => {
      console.log(`${MIGRATION_ID} applied`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
