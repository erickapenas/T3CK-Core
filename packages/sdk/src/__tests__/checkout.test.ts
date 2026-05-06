import { CheckoutModule } from '../checkout';
import { T3CKClient } from '../client';

describe('CheckoutModule', () => {
  const client = {
    get: jest.fn(),
    post: jest.fn(),
  } as unknown as T3CKClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create validates shipping address', async () => {
    const checkout = new CheckoutModule(client);
    await expect(
      checkout.create({
        paymentMethod: 'card',
        shippingAddress: null as any,
      })
    ).rejects.toThrow('Shipping address is required');
  });

  it('create validates payment method', async () => {
    const checkout = new CheckoutModule(client);
    await expect(
      checkout.create({
        paymentMethod: '',
        shippingAddress: {
          street: 'Main',
          city: 'NYC',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      })
    ).rejects.toThrow('Payment method is required');
  });

  it('create validates address completeness', async () => {
    const checkout = new CheckoutModule(client);
    await expect(
      checkout.create({
        paymentMethod: 'card',
        shippingAddress: {
          street: '',
          city: 'NYC',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
      })
    ).rejects.toThrow('Shipping address is incomplete');
  });

  it('create posts checkout request', async () => {
    const checkout = new CheckoutModule(client);
    (client.post as jest.Mock).mockResolvedValue({});

    await checkout.create({
      paymentMethod: 'card',
      shippingAddress: {
        street: 'Main',
        city: 'NYC',
        state: 'NY',
        zipCode: '10001',
        country: 'US',
      },
    });

    expect(client.post).toHaveBeenCalledWith('/checkout', expect.any(Object));
  });

  it('getStatus throws without orderId', async () => {
    const checkout = new CheckoutModule(client);
    await expect(checkout.getStatus('')).rejects.toThrow('Order ID is required');
  });

  it('getStatus calls API', async () => {
    const checkout = new CheckoutModule(client);
    (client.get as jest.Mock).mockResolvedValue({});

    await checkout.getStatus('order-1');

    expect(client.get).toHaveBeenCalledWith('/checkout/orders/order-1');
  });

  it('cancel throws without orderId', async () => {
    const checkout = new CheckoutModule(client);
    await expect(checkout.cancel('')).rejects.toThrow('Order ID is required');
  });

  it('cancel posts cancellation', async () => {
    const checkout = new CheckoutModule(client);
    (client.post as jest.Mock).mockResolvedValue({});

    await checkout.cancel('order-1', 'customer_request');

    expect(client.post).toHaveBeenCalledWith('/checkout/orders/order-1/cancel', {
      reason: 'customer_request',
    });
  });

  it('getOrders builds query params', async () => {
    const checkout = new CheckoutModule(client);
    (client.get as jest.Mock).mockResolvedValue({});

    await checkout.getOrders({
      status: 'paid' as any,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      page: 2,
      limit: 50,
    });

    expect(client.get).toHaveBeenCalledWith(
      '/checkout/orders?status=paid&startDate=2026-01-01&endDate=2026-01-31&page=2&limit=50'
    );
  });

  it('confirmPayment posts tenant confirmation', async () => {
    const checkout = new CheckoutModule(client);
    (client.post as jest.Mock).mockResolvedValue({});

    await checkout.confirmPayment('pay-1', 'tenant-1');

    expect(client.post).toHaveBeenCalledWith('/payments/pay-1/confirm', { tenantId: 'tenant-1' });
  });
});
