export interface Product {
  id: string;
  name: string;
  price?: number;
  basePrice?: number;
  description?: string;
  imageUrl?: string;
  images?: ProductImage[];
  sku?: string;
  stock?: number;
  categoryId?: string;
  tags?: string[];
  active?: boolean;
  variants?: ProductVariant[];
  rating?: number;
  createdAt?: string;
  updatedAt?: string;
}

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

export interface InventoryMovement {
  id: string;
  tenantId: string;
  productId: string;
  variantId?: string;
  delta: number;
  reason?: string;
  createdAt: string;
}

export interface InventorySnapshot {
  productId: string;
  stock: number;
  variants: Array<{ id: string; stock: number }>;
  movements: InventoryMovement[];
}

export interface InventoryUpdateResult {
  productStock: number;
  variantStock?: number;
  movement: InventoryMovement;
}

export interface ProductCreateInput {
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

export interface ProductUpdateInput {
  name?: string;
  description?: string;
  sku?: string;
  categoryId?: string;
  tags?: string[];
  active?: boolean;
  basePrice?: number;
}

export interface ProductVariantCreateInput {
  sku: string;
  name: string;
  attributes?: Record<string, string>;
  additionalPrice?: number;
  stock?: number;
}

export interface ProductVariantUpdateInput {
  sku?: string;
  name?: string;
  attributes?: Record<string, string>;
  additionalPrice?: number;
  stock?: number;
}

export interface ProductImageCreateInput {
  url: string;
  alt?: string;
  position?: number;
}

export interface InventoryAdjustInput {
  tenantId: string;
  delta: number;
  variantId?: string;
  reason?: string;
}

export interface InventorySetInput {
  tenantId: string;
  quantity: number;
  variantId?: string;
  reason?: string;
}

export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  price: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  total: number;
  currency: string;
}

export interface Order {
  id: string;
  cartId: string;
  items: CartItem[];
  total: number;
  currency: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export interface Settings {
  tenantId: string;
  currency: string;
  taxRate?: number;
  shippingEnabled: boolean;
  paymentMethods: string[];
  customFields?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ClientConfig {
  apiKey: string;
  baseUrl: string;
  tenantId?: string;
  timeout?: number;
  retries?: number;
}
