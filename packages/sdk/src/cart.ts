import { T3CKClient } from './client';
import { Cart, CartItem, Product, ApiResponse } from './types';

export class CartModule {
  constructor(private client: T3CKClient) {}

  async add(product: Product, quantity: number = 1): Promise<ApiResponse<Cart>> {
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    if (!product.id) {
      throw new Error('Product ID is required');
    }

    return this.client.post<ApiResponse<Cart>>('/cart/items', {
      productId: product.id,
      quantity,
    });
  }

  async remove(itemId: string): Promise<ApiResponse<Cart>> {
    if (!itemId) {
      throw new Error('Item ID is required');
    }

    return this.client.delete<ApiResponse<Cart>>(`/cart/items/${itemId}`);
  }

  async update(itemId: string, quantity: number): Promise<ApiResponse<Cart>> {
    if (!itemId) {
      throw new Error('Item ID is required');
    }

    if (quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    return this.client.put<ApiResponse<Cart>>(`/cart/items/${itemId}`, {
      quantity,
    });
  }

  async get(): Promise<ApiResponse<Cart>> {
    return this.client.get<ApiResponse<Cart>>('/cart');
  }

  async clear(): Promise<ApiResponse<Cart>> {
    return this.client.delete<ApiResponse<Cart>>('/cart');
  }
}
