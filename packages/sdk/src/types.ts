export interface Product {
  id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  sku?: string;
  stock?: number;
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
  timeout?: number;
  retries?: number;
}
