export interface Category {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  additionalPrice: number;
  stock: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  url: string;
  alt?: string;
  position: number;
  createdAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  slug: string;
  sku: string;
  categoryId?: string;
  tags: string[];
  active: boolean;
  basePrice: number;
  stock: number;
  variants: ProductVariant[];
  images: ProductImage[];
  rating: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  delta: number;
  reason?: string;
  createdAt: string;
}

export interface ProductFilters {
  query?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  tag?: string;
  active?: boolean;
  sortBy?: 'name' | 'price-asc' | 'price-desc' | 'newest' | 'rating';
}

export interface CreateProductInput {
  tenantId: string;
  name: string;
  description?: string;
  sku: string;
  categoryId?: string;
  tags?: string[];
  active?: boolean;
  basePrice: number;
  stock?: number;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  sku?: string;
  categoryId?: string;
  tags?: string[];
  active?: boolean;
  basePrice?: number;
}

export interface CreateCategoryInput {
  tenantId: string;
  name: string;
  description?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
}

export interface CreateVariantInput {
  sku: string;
  name: string;
  attributes?: Record<string, string>;
  additionalPrice?: number;
  stock?: number;
}

export interface UpdateVariantInput {
  sku?: string;
  name?: string;
  attributes?: Record<string, string>;
  additionalPrice?: number;
  stock?: number;
}

export interface AddImageInput {
  url: string;
  alt?: string;
  position?: number;
}
