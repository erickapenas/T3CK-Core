import { CatalogModule } from '../catalog';
import { T3CKClient } from '../client';

describe('CatalogModule', () => {
  const client = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  } as unknown as T3CKClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('search builds query parameters', async () => {
    const catalog = new CatalogModule(client);
    (client.get as jest.Mock).mockResolvedValue({ success: true, data: [] });

    await catalog.search({
      query: 'shoes',
      categoryId: 'sport',
      minPrice: 10,
      maxPrice: 200,
      inStock: true,
      tag: 'running',
      active: true,
      sortBy: 'price-asc',
      page: 2,
      limit: 25,
    });

    expect(client.get).toHaveBeenCalledWith(
      '/api/products?query=shoes&categoryId=sport&minPrice=10&maxPrice=200&inStock=true&tag=running&active=true&sortBy=price-asc&page=2&limit=25'
    );
  });

  it('getProduct throws without id', async () => {
    const catalog = new CatalogModule(client);
    await expect(catalog.getProduct('')).rejects.toThrow('Product ID is required');
  });

  it('getProduct calls API', async () => {
    const catalog = new CatalogModule(client);
    (client.get as jest.Mock).mockResolvedValue({});

    await catalog.getProduct('prod-1');

    expect(client.get).toHaveBeenCalledWith('/api/products/prod-1');
  });

  it('getProducts throws without ids', async () => {
    const catalog = new CatalogModule(client);
    await expect(catalog.getProducts([])).rejects.toThrow('Product IDs are required');
  });

  it('getProducts loads products using individual requests', async () => {
    const catalog = new CatalogModule(client);
    (client.get as jest.Mock)
      .mockResolvedValueOnce({ success: true, data: { id: 'p1', name: 'P1' } })
      .mockResolvedValueOnce({ success: true, data: { id: 'p2', name: 'P2' } });

    const result = await catalog.getProducts(['p1', 'p2']);

    expect(client.get).toHaveBeenNthCalledWith(1, '/api/products/p1');
    expect(client.get).toHaveBeenNthCalledWith(2, '/api/products/p2');
    expect(result.data).toHaveLength(2);
  });

  it('getCategories calls API', async () => {
    const catalog = new CatalogModule(client);
    (client.get as jest.Mock).mockResolvedValue({});

    await catalog.getCategories();

    expect(client.get).toHaveBeenCalledWith('/api/categories');
  });

  it('connects variant/image/recommendation/inventory endpoints', async () => {
    const catalog = new CatalogModule(client);
    (client.post as jest.Mock).mockResolvedValue({});
    (client.put as jest.Mock).mockResolvedValue({});
    (client.get as jest.Mock).mockResolvedValue({});
    (client.delete as jest.Mock).mockResolvedValue({});

    await catalog.addVariant('prod-1', { sku: 'v1', name: 'V1' });
    await catalog.updateVariant('prod-1', 'var-1', { stock: 10 });
    await catalog.removeVariant('prod-1', 'var-1');

    await catalog.addImage('prod-1', { url: 'https://img.com/1.png' });
    await catalog.removeImage('prod-1', 'img-1');

    await catalog.getRecommendations('prod-1', 3);
    await catalog.getInventory('prod-1');
    await catalog.adjustInventory('prod-1', { tenantId: 't1', delta: -2 });
    await catalog.setInventory('prod-1', { tenantId: 't1', quantity: 20 });

    expect(client.post).toHaveBeenCalledWith('/api/products/prod-1/variants', {
      sku: 'v1',
      name: 'V1',
    });
    expect(client.put).toHaveBeenCalledWith('/api/products/prod-1/variants/var-1', { stock: 10 });
    expect(client.delete).toHaveBeenCalledWith('/api/products/prod-1/variants/var-1');

    expect(client.post).toHaveBeenCalledWith('/api/products/prod-1/images', {
      url: 'https://img.com/1.png',
    });
    expect(client.delete).toHaveBeenCalledWith('/api/products/prod-1/images/img-1');

    expect(client.get).toHaveBeenCalledWith('/api/products/prod-1/recommendations?limit=3');
    expect(client.get).toHaveBeenCalledWith('/api/inventory/prod-1');
    expect(client.post).toHaveBeenCalledWith('/api/inventory/prod-1/adjust', {
      tenantId: 't1',
      delta: -2,
    });
    expect(client.put).toHaveBeenCalledWith('/api/inventory/prod-1/set', {
      tenantId: 't1',
      quantity: 20,
    });
  });
});
