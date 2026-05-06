export interface UserContext {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
}

export type OrderStatus =
  | 'created'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'AWAITING_PAYMENT' | 'PAID' | 'REFUNDED' | 'FAILED' | 'CHARGEBACK';

export interface UserOrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface UserOrder {
  id: string;
  tenantId: string;
  customerId: string;
  items: UserOrderItem[];
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentId?: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface UserOrderStatusEvent {
  orderId: string;
  tenantId: string;
  from: OrderStatus;
  to: OrderStatus;
  reason?: string;
  at: string;
}

export interface UserProfile {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
}

export interface TenantBranding {
  tenantId: string;
  displayName: string;
  supportEmail: string;
  supportPhone?: string;
  customDomain?: string;
  locale: string;
  maintenanceMode: boolean;
}

export interface UserSummary {
  totalOrders: number;
  openOrders: number;
  paidOrders: number;
  awaitingPaymentOrders: number;
  totalSpent: number;
  recentOrders: UserOrder[];
}

export interface PaymentStatusView {
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
  userMessage?: string;
}

export interface InternalHttpClient {
  get<T>(url: string, context: UserContext): Promise<T>;
  patch<T>(url: string, body: unknown, context: UserContext): Promise<T>;
}
