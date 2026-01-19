import { T3CKClient } from './client';
import { Order, OrderStatus, ApiResponse } from './types';

export interface CheckoutRequest {
  cartId?: string;
  shippingAddress: Address;
  billingAddress?: Address;
  paymentMethod: string;
  paymentToken?: string;
  metadata?: Record<string, unknown>;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  complement?: string;
}

export class CheckoutModule {
  constructor(private client: T3CKClient) {}

  async create(request: CheckoutRequest): Promise<ApiResponse<Order>> {
    this.validateCheckoutRequest(request);

    return this.client.post<ApiResponse<Order>>('/checkout', request);
  }

  async getStatus(orderId: string): Promise<ApiResponse<Order>> {
    if (!orderId) {
      throw new Error('Order ID is required');
    }

    return this.client.get<ApiResponse<Order>>(`/checkout/orders/${orderId}`);
  }

  async cancel(orderId: string, reason?: string): Promise<ApiResponse<Order>> {
    if (!orderId) {
      throw new Error('Order ID is required');
    }

    return this.client.post<ApiResponse<Order>>(`/checkout/orders/${orderId}/cancel`, {
      reason,
    });
  }

  async getOrders(filters?: {
    status?: OrderStatus;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<Order[]>> {
    const params = new URLSearchParams();

    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const url = `/checkout/orders${params.toString() ? `?${params.toString()}` : ''}`;
    return this.client.get<ApiResponse<Order[]>>(url);
  }

  private validateCheckoutRequest(request: CheckoutRequest): void {
    if (!request.shippingAddress) {
      throw new Error('Shipping address is required');
    }

    if (!request.paymentMethod) {
      throw new Error('Payment method is required');
    }

    const address = request.shippingAddress;
    if (!address.street || !address.city || !address.state || !address.zipCode || !address.country) {
      throw new Error('Shipping address is incomplete');
    }
  }
}
