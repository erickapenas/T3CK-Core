import { ProductService } from '../product-service';

describe('ProductService', () => {
  const tenantId = 'tenant-1';
  let service: ProductService;

  beforeEach(() => {
    service = new ProductService();
  });

  it('supports product CRUD', () => {
    const created = service.createProduct({
      tenantId,
      name: 'Notebook Pro',
      sku: 'NB-PRO-001',
      basePrice: 4500,
      stock: 10,
      tags: ['notebook', 'pro'],
    });

    expect(created.id).toBeDefined();

    const fetched = service.getProduct(tenantId, created.id);
    expect(fetched?.name).toBe('Notebook Pro');

    const updated = service.updateProduct(tenantId, created.id, { name: 'Notebook Pro 2' });
    expect(updated.name).toBe('Notebook Pro 2');

    const removed = service.deleteProduct(tenantId, created.id);
    expect(removed).toBe(true);
    expect(service.getProduct(tenantId, created.id)).toBeUndefined();
  });

  it('supports category management and filtering', () => {
    const cat = service.createCategory({ tenantId, name: 'Eletrônicos' });

    service.createProduct({
      tenantId,
      name: 'Headphone',
      sku: 'HP-01',
      basePrice: 500,
      categoryId: cat.id,
      tags: ['audio'],
    });

    service.createProduct({
      tenantId,
      name: 'Mouse Gamer',
      sku: 'M-01',
      basePrice: 300,
      tags: ['periferico'],
    });

    const filtered = service.listProducts(tenantId, { categoryId: cat.id });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Headphone');

    const categories = service.listCategories(tenantId);
    expect(categories).toHaveLength(1);
  });

  it('supports variants and images', () => {
    const product = service.createProduct({
      tenantId,
      name: 'Camiseta',
      sku: 'TS-01',
      basePrice: 100,
    });

    const variant = service.addVariant(tenantId, product.id, {
      sku: 'TS-01-P',
      name: 'Tamanho P',
      stock: 5,
      attributes: { size: 'P' },
    });

    expect(variant.id).toBeDefined();

    const updatedVariant = service.updateVariant(tenantId, product.id, variant.id, { stock: 8 });
    expect(updatedVariant.stock).toBe(8);

    const image = service.addImage(tenantId, product.id, {
      url: 'https://cdn.t3ck.com/img/camiseta.png',
      alt: 'Camiseta',
    });

    expect(image.id).toBeDefined();

    const current = service.getProduct(tenantId, product.id);
    expect(current?.variants).toHaveLength(1);
    expect(current?.images).toHaveLength(1);
  });

  it('supports inventory tracking and stock management', () => {
    const product = service.createProduct({
      tenantId,
      name: 'Teclado',
      sku: 'KB-01',
      basePrice: 250,
      stock: 10,
    });

    const adjusted = service.adjustStock(tenantId, product.id, -3, 'sale');
    expect(adjusted.productStock).toBe(7);

    const set = service.setStock(tenantId, product.id, 20, 'replenishment');
    expect(set.productStock).toBe(20);

    const inventory = service.getInventory(tenantId, product.id);
    expect(inventory.stock).toBe(20);
    expect(inventory.movements).toHaveLength(2);
  });

  it('returns recommendations based on category/tags/price', () => {
    const category = service.createCategory({ tenantId, name: 'Monitores' });

    const base = service.createProduct({
      tenantId,
      name: 'Monitor 24',
      sku: 'MON-24',
      basePrice: 900,
      categoryId: category.id,
      tags: ['monitor', 'office'],
    });

    service.createProduct({
      tenantId,
      name: 'Monitor 27',
      sku: 'MON-27',
      basePrice: 1200,
      categoryId: category.id,
      tags: ['monitor', 'gaming'],
    });

    service.createProduct({
      tenantId,
      name: 'Suporte de Notebook',
      sku: 'SUP-01',
      basePrice: 180,
      tags: ['office'],
    });

    const recommendations = service.getRecommendations(tenantId, base.id, 2);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].id).not.toBe(base.id);
  });
});
