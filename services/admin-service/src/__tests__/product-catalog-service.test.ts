import {
  buildProductSlug,
  calculateInventoryMetrics,
  calculateStockStatus,
} from '../products/product-catalog-service';

describe('product catalog helpers', () => {
  it('generates stable product slugs', () => {
    expect(buildProductSlug('Camiseta Premium Preta M')).toBe('camiseta-premium-preta-m');
    expect(buildProductSlug('Tênis 110V / Azul')).toBe('tenis-110v-azul');
  });

  it('classifies stock risk before healthy inventory', () => {
    expect(
      calculateStockStatus({
        availableQuantity: 4,
        reservedQuantity: 0,
        blockedQuantity: 0,
        minimumStock: 10,
        maximumStock: 100,
        averageDailySales: 2,
        daysOfCoverage: 2,
      })
    ).toBe('risco_de_ruptura');
  });

  it('calculates margin and coverage without inventing missing sales data', () => {
    const metrics = calculateInventoryMetrics({
      price: 100,
      costPrice: 40,
      stockQuantity: 50,
      reservedQuantity: 5,
      blockedQuantity: 3,
      minimumStock: 10,
      maximumStock: 100,
      safetyStock: 5,
      quantitySold: 0,
      averageDailySales: null,
      analysisPeriodDays: 30,
    });

    expect(metrics.availableQuantity).toBe(42);
    expect(metrics.marginPercent).toBe(60);
    expect(metrics.daysOfCoverage).toBeNull();
    expect(metrics.missingFields.some((field) => field.metric.includes('Previsao'))).toBe(true);
  });
});
