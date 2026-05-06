export type OrderStatus =
  | 'created'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'AWAITING_PAYMENT' | 'PAID' | 'REFUNDED' | 'FAILED' | 'CHARGEBACK';

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  tenantId: string;
  customerId: string;
  items: OrderItem[];
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

export interface OrderStatusEvent {
  orderId: string;
  tenantId: string;
  from: OrderStatus;
  to: OrderStatus;
  reason?: string;
  at: string;
}

export interface OrderAnalytics {
  tenantId: string;
  period: 'daily' | 'monthly';
  from: string;
  to: string;
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  byStatus: Record<OrderStatus, number>;
}

export interface CreateOrderInput {
  tenantId: string;
  customerId: string;
  items: OrderItem[];
  shippingCost?: number;
  notes?: string;
}

export interface PaymentStatusUpdateInput {
  tenantId: string;
  paymentId: string;
  paymentStatus: PaymentStatus;
}

export interface ListOrderFilters {
  status?: OrderStatus;
  customerId?: string;
}
