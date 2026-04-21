import { CartModule } from '../cart';
import { T3CKClient } from '../client';
import type { Product } from '../types';

const product: Product = { id: 'prod-1', name: 'Test Product' };

describe('CartModule', () => {
  const client = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  } as unknown as T3CKClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('add throws for invalid quantity', async () => {
    const cart = new CartModule(client);
    await expect(cart.add(product, 0)).rejects.toThrow('Quantity must be greater than 0');
  });

  it('add throws when product id missing', async () => {
    const cart = new CartModule(client);
    await expect(cart.add({ id: '', name: 'Invalid' }, 1)).rejects.toThrow(
      'Product ID is required'
    );
  });

  it('add posts item', async () => {
    const cart = new CartModule(client);
    (client.post as jest.Mock).mockResolvedValue({});

    await cart.add(product, 2);

    expect(client.post).toHaveBeenCalledWith('/cart/items', {
      productId: 'prod-1',
      quantity: 2,
    });
  });

  it('remove throws without itemId', async () => {
    const cart = new CartModule(client);
    await expect(cart.remove('')).rejects.toThrow('Item ID is required');
  });

  it('remove deletes item', async () => {
    const cart = new CartModule(client);
    (client.delete as jest.Mock).mockResolvedValue({});

    await cart.remove('item-1');

    expect(client.delete).toHaveBeenCalledWith('/cart/items/item-1');
  });

  it('update throws without itemId', async () => {
    const cart = new CartModule(client);
    await expect(cart.update('', 1)).rejects.toThrow('Item ID is required');
  });

  it('update throws for invalid quantity', async () => {
    const cart = new CartModule(client);
    await expect(cart.update('item-1', 0)).rejects.toThrow('Quantity must be greater than 0');
  });

  it('update puts item quantity', async () => {
    const cart = new CartModule(client);
    (client.put as jest.Mock).mockResolvedValue({});

    await cart.update('item-1', 3);

    expect(client.put).toHaveBeenCalledWith('/cart/items/item-1', { quantity: 3 });
  });

  it('get calls API', async () => {
    const cart = new CartModule(client);
    (client.get as jest.Mock).mockResolvedValue({});

    await cart.get();

    expect(client.get).toHaveBeenCalledWith('/cart');
  });

  it('clear calls API', async () => {
    const cart = new CartModule(client);
    (client.delete as jest.Mock).mockResolvedValue({});

    await cart.clear();

    expect(client.delete).toHaveBeenCalledWith('/cart');
  });
});
