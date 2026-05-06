import { PaymentService } from '../payment-service';
import { AbacatePayClient } from '../abacatepay-client';
import { PaymentRequest } from '../types';

describe('PaymentService', () => {
  const baseRequest: PaymentRequest = {
    tenantId: 'tenant-1',
    orderId: 'order-1',
    customerId: 'customer-1',
    amount: 150,
    currency: 'BRL',
    method: 'pix',
    description: 'Pedido #1',
  };

  const createProvider = () => {
    return {
      createPayment: jest.fn().mockResolvedValue({
        providerPaymentId: 'prov_123',
        status: 'pending',
        pix: {
          qrCode: 'qr-code',
          copyPasteCode: 'pix-copy-paste',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
      }),
      refund: jest.fn().mockResolvedValue('refunded'),
      getPaymentStatus: jest.fn().mockResolvedValue('paid'),
    } as unknown as AbacatePayClient;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('applies idempotency and avoids duplicate provider charge', async () => {
    const provider = createProvider();
    const service = new PaymentService(provider);

    const first = await service.createPayment(baseRequest, 'idem-key-1');
    const second = await service.createPayment(baseRequest, 'idem-key-1');

    expect(first.paymentId).toBe(second.paymentId);
    expect((provider.createPayment as jest.Mock).mock.calls.length).toBe(1);
  });

  it('rejects idempotency key reuse with different payload', async () => {
    const provider = createProvider();
    const service = new PaymentService(provider);

    await service.createPayment(baseRequest, 'idem-key-2');

    await expect(
      service.createPayment({ ...baseRequest, amount: 200 }, 'idem-key-2')
    ).rejects.toThrow('Idempotency key já usada com payload diferente.');
  });

  it('maps webhook provider status to internal status', async () => {
    const provider = createProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment(baseRequest, 'idem-key-3');
    const mapped = service.processWebhookUpdate({
      tenantId: baseRequest.tenantId,
      paymentId: created.paymentId,
      eventId: 'evt-paid-1',
      providerStatus: 'paid',
      rawPayload: { externalStatus: 'paid' },
    });
    const replay = service.processWebhookUpdate({
      tenantId: baseRequest.tenantId,
      paymentId: created.paymentId,
      eventId: 'evt-paid-1',
      providerStatus: 'paid',
      rawPayload: { externalStatus: 'paid' },
    });

    expect(mapped.status).toBe('PAID');
    expect(mapped.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(service.getPayment(created.paymentId)?.status).toBe('PAID');
  });

  it('handles refund flow and updates status', async () => {
    const provider = createProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment(baseRequest, 'idem-key-4');
    service.processWebhookUpdate({
      tenantId: baseRequest.tenantId,
      paymentId: created.paymentId,
      providerStatus: 'paid',
      rawPayload: { externalStatus: 'paid' },
    });

    const refunded = await service.refund({
      tenantId: baseRequest.tenantId,
      paymentId: created.paymentId,
      reason: 'customer_request',
      amount: 150,
    });

    expect(refunded.status).toBe('REFUNDED');
    expect((provider.refund as jest.Mock).mock.calls.length).toBe(1);
    expect(service.getPayment(created.paymentId)?.status).toBe('REFUNDED');
  });

  it('syncs status from provider without exposing provider credentials', async () => {
    const provider = createProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment(baseRequest, 'idem-key-status');
    const status = await service.syncPaymentStatus(created.paymentId, baseRequest.tenantId);

    expect(status).toBe('PAID');
    expect((provider.getPaymentStatus as jest.Mock).mock.calls).toEqual([['prov_123', 'pix']]);
    expect(service.getPayment(created.paymentId)?.status).toBe('PAID');
  });

  it('creates hosted checkout for card without receiving card data', async () => {
    const provider = createProvider();
    (provider.createPayment as jest.Mock).mockResolvedValueOnce({
      providerPaymentId: 'bill_123',
      status: 'PENDING',
      hostedCheckout: {
        url: 'https://app.abacatepay.com/pay/bill_123',
        returnUrl: 'https://store.test/return',
        completionUrl: 'https://store.test/success',
      },
    });
    const service = new PaymentService(provider);

    const created = await service.createPayment(
      {
        ...baseRequest,
        method: 'card',
        checkoutItems: [{ id: 'prod_123', quantity: 1 }],
        returnUrl: 'https://store.test/return',
        completionUrl: 'https://store.test/success',
      },
      'idem-key-hosted'
    );

    expect(created.hostedCheckout?.url).toContain('/pay/bill_123');
    expect(provider.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'card',
        checkoutItems: [{ id: 'prod_123', quantity: 1 }],
        metadata: expect.objectContaining({ paymentId: created.paymentId }),
      }),
      expect.any(Object)
    );
  });

  it('handles chargeback and reflects it in financial summary', async () => {
    const provider = createProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment(baseRequest, 'idem-key-5');
    service.handleChargeback({
      tenantId: baseRequest.tenantId,
      paymentId: created.paymentId,
      providerDisputeId: 'disp-1',
      reason: 'fraud',
      amount: 150,
      receivedAt: new Date().toISOString(),
    });

    const payment = service.getPayment(created.paymentId);
    const summary = service.getFinancialSummary(baseRequest.tenantId, 'daily');

    expect(payment?.status).toBe('CHARGEBACK');
    expect(summary.totalChargeback).toBe(150);
    expect(summary.netRevenue).toBe(-150);
  });

  it('keeps immutable log integrity after multiple operations', async () => {
    const provider = createProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment(baseRequest, 'idem-key-6');
    service.processWebhookUpdate({
      tenantId: baseRequest.tenantId,
      paymentId: created.paymentId,
      providerStatus: 'paid',
      rawPayload: { status: 'paid' },
    });
    service.sendReceipt(created.paymentId, 'buyer@test.com');

    expect(service.verifyAuditTrailIntegrity()).toBe(true);
    expect(service.getTransactionLogs(baseRequest.tenantId).length).toBeGreaterThanOrEqual(3);
  });
});
