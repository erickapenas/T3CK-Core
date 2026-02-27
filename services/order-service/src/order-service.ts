import {
  CreateOrderInput,
  ListOrderFilters,
  Order,
  OrderAnalytics,
  OrderStatus,
  OrderStatusEvent,
} from './types';

const randomId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const now = (): string => new Date().toISOString();

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export class OrderService {
  private readonly orders = new Map<string, Order>();
  private readonly history: OrderStatusEvent[] = [];

  createOrder(input: CreateOrderInput): Order {
    const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const shippingCost = input.shippingCost ?? 0;
    const timestamp = now();

    const order: Order = {
      id: randomId('ord'),
      tenantId: input.tenantId,
      customerId: input.customerId,
      items: input.items,
      status: 'created',
      subtotal,
      shippingCost,
      total: subtotal + shippingCost,
      notes: input.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.orders.set(order.id, order);
    this.history.push({
      orderId: order.id,
      tenantId: order.tenantId,
      from: 'created',
      to: 'created',
      at: timestamp,
    });

    return order;
  }

  listOrders(tenantId: string, filters?: ListOrderFilters): Order[] {
    let data = Array.from(this.orders.values()).filter((order) => order.tenantId === tenantId);

    if (filters?.status) {
      data = data.filter((order) => order.status === filters.status);
    }

    if (filters?.customerId) {
      data = data.filter((order) => order.customerId === filters.customerId);
    }

    return data.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  getOrder(tenantId: string, orderId: string): Order | undefined {
    const value = this.orders.get(orderId);
    if (!value || value.tenantId !== tenantId) {
      return undefined;
    }
    return value;
  }

  updateStatus(tenantId: string, orderId: string, status: OrderStatus, reason?: string): Order {
    const current = this.requireOrder(tenantId, orderId);

    if (current.status === status) {
      return current;
    }

    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(status)) {
      throw new Error(`Transição inválida: ${current.status} -> ${status}`);
    }

    const previous = current.status;
    const updated: Order = {
      ...current,
      status,
      updatedAt: now(),
      cancelledAt: status === 'cancelled' ? now() : current.cancelledAt,
      cancellationReason: status === 'cancelled' ? reason : current.cancellationReason,
    };

    this.orders.set(orderId, updated);
    this.history.push({
      orderId,
      tenantId,
      from: previous,
      to: status,
      reason,
      at: updated.updatedAt,
    });

    return updated;
  }

  cancelOrder(tenantId: string, orderId: string, reason: string): Order {
    return this.updateStatus(tenantId, orderId, 'cancelled', reason);
  }

  getOrderHistory(tenantId: string, orderId: string): OrderStatusEvent[] {
    this.requireOrder(tenantId, orderId);
    return this.history
      .filter((event) => event.tenantId === tenantId && event.orderId === orderId)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  getAnalytics(tenantId: string, period: 'daily' | 'monthly'): OrderAnalytics {
    const until = new Date();
    const from = new Date(until);
    if (period === 'daily') {
      from.setHours(0, 0, 0, 0);
    } else {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    }

    const orders = this.listOrders(tenantId).filter((order) => new Date(order.createdAt) >= from);
    const totalRevenue = orders
      .filter((order) => order.status !== 'cancelled')
      .reduce((sum, order) => sum + order.total, 0);

    const byStatus: Record<OrderStatus, number> = {
      created: 0,
      confirmed: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };

    for (const order of orders) {
      byStatus[order.status] += 1;
    }

    return {
      tenantId,
      period,
      from: from.toISOString(),
      to: until.toISOString(),
      totalOrders: orders.length,
      totalRevenue,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      byStatus,
    };
  }

  private requireOrder(tenantId: string, orderId: string): Order {
    const order = this.orders.get(orderId);
    if (!order || order.tenantId !== tenantId) {
      throw new Error('Pedido não encontrado');
    }
    return order;
  }
}