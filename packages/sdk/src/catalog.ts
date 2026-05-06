import { T3CKClient } from './client';
import {
  Product,
  ApiResponse,
  Category,
  InventorySnapshot,
  ProductVariant,
  ProductImage,
  ProductCreateInput,
  ProductUpdateInput,
  ProductVariantCreateInput,
  ProductVariantUpdateInput,
  ProductImageCreateInput,
  InventoryAdjustInput,
  InventorySetInput,
  InventoryUpdateResult,
} from './types';

export interface SearchQuery {
  query?: string;
  category?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  tag?: string;
  active?: boolean;
  sortBy?: 'name' | 'price-asc' | 'price-desc' | 'newest' | 'rating';
  page?: number;
  limit?: number;
}

export interface SearchResult {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class CatalogModule {
  constructor(private client: T3CKClient) {}

  async search(query: SearchQuery = {}): Promise<ApiResponse<SearchResult>> {
    const params = new URLSearchParams();

    if (query.query) params.append('query', query.query);
    if (query.categoryId) params.append('categoryId', query.categoryId);
    if (query.category && !query.categoryId) params.append('categoryId', query.category);
    if (query.minPrice !== undefined) params.append('minPrice', query.minPrice.toString());
    if (query.maxPrice !== undefined) params.append('maxPrice', query.maxPrice.toString());
    if (query.inStock !== undefined) params.append('inStock', query.inStock.toString());
    if (query.tag) params.append('tag', query.tag);
    if (query.active !== undefined) params.append('active', query.active.toString());
    if (query.sortBy) params.append('sortBy', query.sortBy);
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());

    const url = `/api/products${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await this.client.get<ApiResponse<Product[]>>(url);

    const products = response.data || [];
    const page = query.page || 1;
    const limit = query.limit || products.length || 1;
    const total = products.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      success: response.success,
      message: response.message,
      data: {
        products,
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async getProduct(id: string): Promise<ApiResponse<Product>> {
    if (!id) {
      throw new Error('Product ID is required');
    }

    return this.client.get<ApiResponse<Product>>(`/api/products/${id}`);
  }

  async getProducts(ids: string[]): Promise<ApiResponse<Product[]>> {
    if (!ids || ids.length === 0) {
      throw new Error('Product IDs are required');
    }

    const results = await Promise.all(ids.map((id) => this.getProduct(id)));
    return {
      success: true,
      data: results.map((item) => item.data),
    };
  }

  async createProduct(input: ProductCreateInput): Promise<ApiResponse<Product>> {
    return this.client.post<ApiResponse<Product>>('/api/products', input);
  }

  async updateProduct(id: string, input: ProductUpdateInput): Promise<ApiResponse<Product>> {
    if (!id) {
      throw new Error('Product ID is required');
    }
    return this.client.put<ApiResponse<Product>>(`/api/products/${id}`, input);
  }

  async deleteProduct(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    if (!id) {
      throw new Error('Product ID is required');
    }
    await this.client.delete<void>(`/api/products/${id}`);
    return { success: true, data: { deleted: true } };
  }

  async getCategories(): Promise<ApiResponse<Category[]>> {
    return this.client.get<ApiResponse<Category[]>>('/api/categories');
  }

  async addVariant(
    productId: string,
    input: ProductVariantCreateInput
  ): Promise<ApiResponse<ProductVariant>> {
    if (!productId) {
      throw new Error('Product ID is required');
    }
    return this.client.post<ApiResponse<ProductVariant>>(
      `/api/products/${productId}/variants`,
      input
    );
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: ProductVariantUpdateInput
  ): Promise<ApiResponse<ProductVariant>> {
    if (!productId || !variantId) {
      throw new Error('Product ID and Variant ID are required');
    }
    return this.client.put<ApiResponse<ProductVariant>>(
      `/api/products/${productId}/variants/${variantId}`,
      input
    );
  }

  async removeVariant(
    productId: string,
    variantId: string
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    if (!productId || !variantId) {
      throw new Error('Product ID and Variant ID are required');
    }
    await this.client.delete<void>(`/api/products/${productId}/variants/${variantId}`);
    return { success: true, data: { deleted: true } };
  }

  async addImage(
    productId: string,
    input: ProductImageCreateInput
  ): Promise<ApiResponse<ProductImage>> {
    if (!productId) {
      throw new Error('Product ID is required');
    }
    return this.client.post<ApiResponse<ProductImage>>(`/api/products/${productId}/images`, input);
  }

  async removeImage(
    productId: string,
    imageId: string
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    if (!productId || !imageId) {
      throw new Error('Product ID and Image ID are required');
    }
    await this.client.delete<void>(`/api/products/${productId}/images/${imageId}`);
    return { success: true, data: { deleted: true } };
  }

  async getRecommendations(productId: string, limit: number = 5): Promise<ApiResponse<Product[]>> {
    if (!productId) {
      throw new Error('Product ID is required');
    }
    return this.client.get<ApiResponse<Product[]>>(
      `/api/products/${productId}/recommendations?limit=${limit}`
    );
  }

  async getInventory(productId: string): Promise<ApiResponse<InventorySnapshot>> {
    if (!productId) {
      throw new Error('Product ID is required');
    }
    return this.client.get<ApiResponse<InventorySnapshot>>(`/api/inventory/${productId}`);
  }

  async adjustInventory(
    productId: string,
    input: InventoryAdjustInput
  ): Promise<ApiResponse<InventoryUpdateResult>> {
    if (!productId) {
      throw new Error('Product ID is required');
    }
    return this.client.post<ApiResponse<InventoryUpdateResult>>(
      `/api/inventory/${productId}/adjust`,
      input
    );
  }

  async setInventory(
    productId: string,
    input: InventorySetInput
  ): Promise<ApiResponse<InventoryUpdateResult>> {
    if (!productId) {
      throw new Error('Product ID is required');
    }
    return this.client.put<ApiResponse<InventoryUpdateResult>>(
      `/api/inventory/${productId}/set`,
      input
    );
  }
}
