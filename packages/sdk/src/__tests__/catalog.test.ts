import { CatalogModule } from '../catalog';
import { T3CKClient } from '../client';

describe('CatalogModule', () => {
  const client = {
    get: jest.fn(),
    post: jest.fn(),
  } as unknown as T3CKClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('search builds query parameters', async () => {
    const catalog = new CatalogModule(client);
    (client.get as jest.Mock).mockResolvedValue({});

    await catalog.search({
      query: 'shoes',
      category: 'sport',
      minPrice: 10,
      maxPrice: 200,
      inStock: true,
      page: 2,
      limit: 25,
    });

    expect(client.get).toHaveBeenCalledWith(
      '/catalog/search?q=shoes&category=sport&minPrice=10&maxPrice=200&inStock=true&page=2&limit=25'
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

    expect(client.get).toHaveBeenCalledWith('/catalog/products/prod-1');
  });

  it('getProducts throws without ids', async () => {
    const catalog = new CatalogModule(client);
    await expect(catalog.getProducts([])).rejects.toThrow('Product IDs are required');
  });

  it('getProducts calls API', async () => {
    const catalog = new CatalogModule(client);
    (client.post as jest.Mock).mockResolvedValue({});

    await catalog.getProducts(['p1', 'p2']);

    expect(client.post).toHaveBeenCalledWith('/catalog/products/batch', { ids: ['p1', 'p2'] });
  });

  it('getCategories calls API', async () => {
    const catalog = new CatalogModule(client);
    (client.get as jest.Mock).mockResolvedValue({});

    await catalog.getCategories();

    expect(client.get).toHaveBeenCalledWith('/catalog/categories');
  });
});
