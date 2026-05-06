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

export interface CheckoutPaymentRequest {
  tenantId: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: string;
  method: 'pix' | 'boleto' | 'card' | 'checkout';
  description?: string;
  dueMinutes?: number;
  checkoutItems?: Array<{
    id: string;
    quantity: number;
  }>;
  checkoutMethods?: Array<'PIX' | 'CARD'>;
  returnUrl?: string;
  completionUrl?: string;
  coupons?: string[];
  maxInstallments?: number;
  upSellProductId?: string;
  customer?: {
    name: string;
    email?: string;
    taxId: string;
    cellphone?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface CheckoutPaymentResult {
  paymentId: string;
  providerPaymentId: string;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'REFUNDED' | 'FAILED' | 'CHARGEBACK';
  amount: number;
  currency: string;
  method: 'pix' | 'boleto' | 'card' | 'checkout';
  pix?: {
    qrCode: string;
    copyPasteCode: string;
    expiresAt: string;
    expiresInSeconds: number;
  };
  boleto?: {
    barcode: string;
    dueDate: string;
    pdfUrl?: string;
  };
  hostedCheckout?: {
    url: string;
    returnUrl?: string;
    completionUrl?: string;
  };
  userMessage: string;
  createdAt: string;
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

  async createPayment(
    request: CheckoutPaymentRequest,
    idempotencyKey: string
  ): Promise<CheckoutPaymentResult> {
    if (!idempotencyKey) {
      throw new Error('Idempotency key is required');
    }

    return this.client.post<CheckoutPaymentResult>('/payments', request, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  async getPaymentStatus(
    paymentId: string,
    tenantId: string
  ): Promise<{ paymentId: string; status: CheckoutPaymentResult['status'] }> {
    if (!paymentId) {
      throw new Error('Payment ID is required');
    }
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    return this.client.get<{ paymentId: string; status: CheckoutPaymentResult['status'] }>(
      `/payments/${paymentId}/status?tenantId=${encodeURIComponent(tenantId)}`
    );
  }

  async confirmPayment(
    paymentId: string,
    tenantId: string
  ): Promise<{
    paymentId: string;
    providerPaymentId: string;
    orderId: string;
    status: CheckoutPaymentResult['status'];
  }> {
    if (!paymentId) {
      throw new Error('Payment ID is required');
    }
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    return this.client.post<{
      paymentId: string;
      providerPaymentId: string;
      orderId: string;
      status: CheckoutPaymentResult['status'];
    }>(`/payments/${paymentId}/confirm`, { tenantId });
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
    if (
      !address.street ||
      !address.city ||
      !address.state ||
      !address.zipCode ||
      !address.country
    ) {
      throw new Error('Shipping address is incomplete');
    }
  }
}
