import { AppError, DownstreamError } from './errors';
import { buildUrl } from './http-client';
import {
  InternalHttpClient,
  PaymentStatusView,
  TenantBranding,
  UserContext,
  UserOrder,
  UserOrderStatusEvent,
  UserProfile,
  UserSummary,
} from './types';

export interface UserDashboardUrls {
  orderServiceUrl: string;
  paymentServiceUrl: string;
  adminServiceUrl: string;
}

export interface UserOrderFilters {
  status?: string;
  limit?: number;
}

export class UserDashboardService {
  constructor(
    private readonly http: InternalHttpClient,
    private readonly urls: UserDashboardUrls = {
      orderServiceUrl: process.env.ORDER_SERVICE_URL || 'http://localhost:3011',
      paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3010',
      adminServiceUrl: process.env.ADMIN_SERVICE_URL || 'http://localhost:3006',
    }
  ) {}

  async getMe(context: UserContext): Promise<{
    user: UserContext;
    profile: UserProfile;
    tenant: TenantBranding | null;
  }> {
    const [profile, tenant] = await Promise.all([
      this.getProfile(context),
      this.getTenantBranding(context).catch(() => null),
    ]);

    return {
      user: context,
      profile,
      tenant,
    };
  }

  async getSummary(context: UserContext): Promise<UserSummary> {
    const orders = await this.listOrders(context, { limit: 20 });
    const paidOrders = orders.filter((order) => order.paymentStatus === 'PAID');
    const awaitingPaymentOrders = orders.filter(
      (order) => order.paymentStatus === 'AWAITING_PAYMENT'
    );

    return {
      totalOrders: orders.length,
      openOrders: orders.filter((order) => !['delivered', 'cancelled'].includes(order.status))
        .length,
      paidOrders: paidOrders.length,
      awaitingPaymentOrders: awaitingPaymentOrders.length,
      totalSpent: paidOrders.reduce((sum, order) => sum + order.total, 0),
      recentOrders: orders.slice(0, 5),
    };
  }

  async listOrders(context: UserContext, filters: UserOrderFilters = {}): Promise<UserOrder[]> {
    const orders = await this.http.get<UserOrder[]>(
      buildUrl(this.urls.orderServiceUrl, '/orders', {
        customerId: context.userId,
        status: filters.status,
      }),
      context
    );

    const scoped = orders
      .filter((order) => order.tenantId === context.tenantId && order.customerId === context.userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return typeof filters.limit === 'number' ? scoped.slice(0, filters.limit) : scoped;
  }

  async getOrder(context: UserContext, orderId: string): Promise<UserOrder> {
    const order = await this.http.get<UserOrder>(
      buildUrl(this.urls.orderServiceUrl, `/orders/${encodeURIComponent(orderId)}`),
      context
    );

    if (order.tenantId !== context.tenantId || order.customerId !== context.userId) {
      throw new AppError(404, 'Order not found');
    }

    return order;
  }

  async getOrderHistory(context: UserContext, orderId: string): Promise<UserOrderStatusEvent[]> {
    await this.getOrder(context, orderId);
    const history = await this.http.get<UserOrderStatusEvent[]>(
      buildUrl(this.urls.orderServiceUrl, `/orders/${encodeURIComponent(orderId)}/history`),
      context
    );

    return history.filter((event) => event.tenantId === context.tenantId);
  }

  async getPaymentStatus(context: UserContext, paymentId: string): Promise<PaymentStatusView> {
    const orders = await this.listOrders(context);
    const order = orders.find((item) => item.paymentId === paymentId);

    if (!order) {
      throw new AppError(404, 'Payment not found');
    }

    const payment = await this.http.get<{
      paymentId: string;
      status: PaymentStatusView['status'];
      userMessage?: string;
    }>(
      buildUrl(this.urls.paymentServiceUrl, `/payments/${encodeURIComponent(paymentId)}/status`),
      context
    );

    return {
      paymentId,
      orderId: order.id,
      status: payment.status,
      userMessage: payment.userMessage,
    };
  }

  async getProfile(context: UserContext): Promise<UserProfile> {
    try {
      return await this.http.get<UserProfile>(
        buildUrl(
          this.urls.adminServiceUrl,
          `/api/admin/customers/${encodeURIComponent(context.userId)}`
        ),
        context
      );
    } catch (error) {
      if (error instanceof DownstreamError && error.status === 404) {
        return {
          id: context.userId,
          tenantId: context.tenantId,
          name: context.email || context.userId,
          email: context.email,
        };
      }
      throw error;
    }
  }

  async updateProfile(
    context: UserContext,
    input: { name?: string; phone?: string }
  ): Promise<UserProfile> {
    const current = await this.getProfile(context);
    if (current.id !== context.userId || current.tenantId !== context.tenantId) {
      throw new AppError(404, 'Profile not found');
    }

    return this.http.patch<UserProfile>(
      buildUrl(
        this.urls.adminServiceUrl,
        `/api/admin/customers/${encodeURIComponent(context.userId)}`
      ),
      input,
      context
    );
  }

  async getTenantBranding(context: UserContext): Promise<TenantBranding> {
    return this.http.get<TenantBranding>(
      buildUrl(this.urls.adminServiceUrl, '/api/admin/tenant-config'),
      context
    );
  }
}
