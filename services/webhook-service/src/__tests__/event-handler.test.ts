import { EventHandler } from '../event-handler';

const deliverWebhook = jest.fn();
const getWebhooksByTenant = jest.fn();

jest.mock('../webhook-manager', () => {
  return {
    WebhookManager: jest.fn().mockImplementation(() => ({
      deliverWebhook,
      getWebhooksByTenant,
    })),
  };
});

jest.mock('@t3ck/shared', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('EventHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delivers event to active subscribed webhooks', async () => {
    getWebhooksByTenant.mockResolvedValue([
      { id: 'w1', active: true, events: ['order.created'] },
      { id: 'w2', active: false, events: ['order.created'] },
      { id: 'w3', active: true, events: ['order.updated'] },
    ]);

    const handler = new EventHandler();

    await handler.handleEvent({
      source: 'orders',
      'detail-type': 'order.created',
      detail: { tenantId: 'tenant-1', orderId: 'ord-1' },
    });

    expect(getWebhooksByTenant).toHaveBeenCalledWith('tenant-1');
    expect(deliverWebhook).toHaveBeenCalledTimes(1);
    expect(deliverWebhook).toHaveBeenCalledWith(
      { id: 'w1', active: true, events: ['order.created'] },
      'order.created',
      { tenantId: 'tenant-1', orderId: 'ord-1' }
    );
  });

  it('skips delivery when tenantId is missing', async () => {
    const handler = new EventHandler();

    await handler.handleEvent({
      source: 'orders',
      'detail-type': 'order.created',
      detail: { orderId: 'ord-1' },
    });

    expect(getWebhooksByTenant).not.toHaveBeenCalled();
    expect(deliverWebhook).not.toHaveBeenCalled();
  });

  it('extracts tenantId from nested order object', async () => {
    getWebhooksByTenant.mockResolvedValue([
      { id: 'w1', active: true, events: ['order.updated'] },
    ]);

    const handler = new EventHandler();

    await handler.handleEvent({
      source: 'orders',
      'detail-type': 'order.updated',
      detail: { order: { tenantId: 'tenant-2' } },
    });

    expect(getWebhooksByTenant).toHaveBeenCalledWith('tenant-2');
    expect(deliverWebhook).toHaveBeenCalledTimes(1);
  });
});
