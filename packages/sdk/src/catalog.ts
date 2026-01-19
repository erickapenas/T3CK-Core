import { T3CKClient } from './client';
import { Product, ApiResponse } from './types';

export interface SearchQuery {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
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

    if (query.query) params.append('q', query.query);
    if (query.category) params.append('category', query.category);
    if (query.minPrice !== undefined) params.append('minPrice', query.minPrice.toString());
    if (query.maxPrice !== undefined) params.append('maxPrice', query.maxPrice.toString());
    if (query.inStock !== undefined) params.append('inStock', query.inStock.toString());
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());

    const url = `/catalog/search?${params.toString()}`;
    return this.client.get<ApiResponse<SearchResult>>(url);
  }

  async getProduct(id: string): Promise<ApiResponse<Product>> {
    if (!id) {
      throw new Error('Product ID is required');
    }

    return this.client.get<ApiResponse<Product>>(`/catalog/products/${id}`);
  }

  async getProducts(ids: string[]): Promise<ApiResponse<Product[]>> {
    if (!ids || ids.length === 0) {
      throw new Error('Product IDs are required');
    }

    return this.client.post<ApiResponse<Product[]>>('/catalog/products/batch', { ids });
  }

  async getCategories(): Promise<ApiResponse<string[]>> {
    return this.client.get<ApiResponse<string[]>>('/catalog/categories');
  }
}
