import { AppError } from '../errors';
import { InternalHttpClient, UserContext, UserOrder } from '../types';
import { UserDashboardService } from '../user-dashboard-service';

const context: UserContext = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  email: 'user-a@example.com',
  roles: ['user'],
};

const orders: UserOrder[] = [
  {
    id: 'order-a',
    tenantId: 'tenant-a',
    customerId: 'user-a',
    items: [],
    status: 'processing',
    paymentStatus: 'PAID',
    paymentId: 'pay-a',
    subtotal: 100,
    shippingCost: 10,
    total: 110,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'order-b',
    tenantId: 'tenant-a',
    customerId: 'other-user',
    items: [],
    status: 'processing',
    subtotal: 50,
    shippingCost: 0,
    total: 50,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

class FakeHttpClient implements InternalHttpClient {
  async get<T>(url: string): Promise<T> {
    if (url.includes('/orders/order-b')) {
      return orders[1] as T;
    }
    if (url.includes('/orders/order-a')) {
      return orders[0] as T;
    }
    if (url.includes('/orders')) {
      return orders as T;
    }
    if (url.includes('/payments/pay-a/status')) {
      return { paymentId: 'pay-a', status: 'PAID' } as T;
    }
    if (url.includes('/customers/user-a')) {
      return {
        id: 'user-a',
        tenantId: 'tenant-a',
        name: 'User A',
        email: 'user-a@example.com',
      } as T;
    }
    if (url.includes('/tenant-config')) {
      return {
        tenantId: 'tenant-a',
        displayName: 'Tenant A',
        supportEmail: 'support@example.com',
        locale: 'pt-BR',
        maintenanceMode: false,
      } as T;
    }
    throw new Error(`Unexpected URL: ${url}`);
  }

  async patch<T>(_url: string, body: unknown): Promise<T> {
    return {
      id: 'user-a',
      tenantId: 'tenant-a',
      email: 'user-a@example.com',
      ...(body as Record<string, unknown>),
    } as T;
  }
}

describe('UserDashboardService', () => {
  const service = new UserDashboardService(new FakeHttpClient(), {
    orderServiceUrl: 'http://orders.local',
    paymentServiceUrl: 'http://payments.local',
    adminServiceUrl: 'http://admin.local',
  });

  it('filters orders by tenant and authenticated user', async () => {
    const result = await service.listOrders(context);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('order-a');
  });

  it('hides orders from another customer in the same tenant', async () => {
    await expect(service.getOrder(context, 'order-b')).rejects.toBeInstanceOf(AppError);
  });

  it('only returns payment status for a payment owned by the current user', async () => {
    await expect(service.getPaymentStatus(context, 'pay-a')).resolves.toMatchObject({
      paymentId: 'pay-a',
      orderId: 'order-a',
      status: 'PAID',
    });
    await expect(service.getPaymentStatus(context, 'pay-other')).rejects.toBeInstanceOf(AppError);
  });
});
