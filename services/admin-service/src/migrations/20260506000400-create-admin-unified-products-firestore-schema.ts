import { getFirestore, initializeFirestore } from '../firebase';

const MIGRATION_ID = '20260506000400-create-admin-unified-products-firestore-schema';
const nowIso = (): string => new Date().toISOString();

export async function migrateAdminUnifiedProductsFirestoreSchema(): Promise<void> {
  initializeFirestore();
  const firestore = getFirestore();
  if (!firestore) {
    throw new Error('Firestore is required to run products schema migration');
  }

  const migrationRef = firestore.collection('schema_migrations').doc(MIGRATION_ID);
  const migration = await migrationRef.get();
  if (migration.exists) return;

  const now = nowIso();
  const batch = firestore.batch();
  batch.set(
    firestore.collection('admin_schema').doc('admin_unified_products_inventory'),
    {
      id: 'admin_unified_products_inventory',
      service: 'admin-service',
      dashboard: 'admin-unified-dashboard',
      database: 'firebase-firestore',
      tenantScopedCollections: {
        products: 'tenants/{tenantId}/admin/data/products/{productId}',
        product_variants: 'tenants/{tenantId}/admin/data/product_variants/{variantId}',
        product_images: 'tenants/{tenantId}/admin/data/product_images/{imageId}',
        product_categories: 'tenants/{tenantId}/admin/data/product_categories/{categoryId}',
        brands: 'tenants/{tenantId}/admin/data/brands/{brandId}',
        warehouses: 'tenants/{tenantId}/admin/data/warehouses/{warehouseId}',
        inventory_balances: 'tenants/{tenantId}/admin/data/inventory_balances/{balanceId}',
        inventory_movements: 'tenants/{tenantId}/admin/data/inventory_movements/{movementId}',
        stock_reservations: 'tenants/{tenantId}/admin/data/stock_reservations/{reservationId}',
        inventory_alerts: 'tenants/{tenantId}/admin/data/inventory_alerts/{alertId}',
        replenishment_suggestions:
          'tenants/{tenantId}/admin/data/replenishment_suggestions/{suggestionId}',
        product_price_history: 'tenants/{tenantId}/admin/data/product_price_history/{historyId}',
        product_tax_data: 'tenants/{tenantId}/admin/data/product_tax_data/{taxDataId}',
      },
      principles: {
        tenantIsolation: 'All API reads and writes derive tenant_id from authenticated context.',
        skuUniqueness: 'SKU is unique inside each tenant across products and variants.',
        inventoryLedger:
          'Stock changes create inventory_movements and update inventory_balances transactionally.',
        idempotency: 'Critical stock operations accept idempotency_key/idempotencyKey.',
        auditability:
          'Product, price, cost, SKU, import/export and stock mutations create audit events.',
      },
      permissions: [
        'visualizar_produtos',
        'criar_produtos',
        'editar_produtos',
        'excluir_produtos',
        'arquivar_produtos',
        'duplicar_produtos',
        'importar_produtos',
        'exportar_produtos',
        'visualizar_custo_produto',
        'editar_preco_produto',
        'editar_custo_produto',
        'editar_dados_fiscais_produto',
        'visualizar_estoque',
        'ajustar_estoque',
        'criar_movimentacao_estoque',
        'reservar_estoque',
        'liberar_reserva_estoque',
        'bloquear_estoque',
        'transferir_estoque',
        'visualizar_movimentacoes_estoque',
        'visualizar_alertas_estoque',
        'gerenciar_recomendacoes_estoque',
      ],
      recommendedIndexes: [
        'products: tenant_id/sku, tenant_id/status, tenant_id/categoryId, tenant_id/brandId',
        'product_variants: tenant_id/productId, tenant_id/sku',
        'inventory_balances: tenant_id/productId, tenant_id/warehouseId, tenant_id/availableQuantity',
        'inventory_movements: tenant_id/productId/createdAt, tenant_id/idempotencyKey',
        'inventory_alerts: tenant_id/status/severity/createdAt',
        'replenishment_suggestions: tenant_id/status/priority/createdAt',
      ],
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(migrationRef, {
    id: MIGRATION_ID,
    name: 'Create admin-unified products and smart inventory Firestore schema metadata',
    service: 'admin-service',
    appliedAt: now,
  });

  await batch.commit();
}

if (require.main === module) {
  migrateAdminUnifiedProductsFirestoreSchema()
    .then(() => {
      console.log(`${MIGRATION_ID} applied`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
