import { Logger } from '@t3ck/shared';
import { AbacatePayClient } from './abacatepay-client';
import { IdempotencyStore } from './idempotency-store';
import { ImmutableTransactionLog } from './immutable-transaction-log';
import { buildFriendlyMessage, mapProviderStatus } from './status-mapper';
import {
  ChargebackEvent,
  FinancialSummary,
  PaymentRequest,
  PaymentResult,
  RefundRequest,
  InternalPaymentStatus,
} from './types';

interface PersistedPayment {
  paymentId: string;
  providerPaymentId: string;
  tenantId: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: string;
  method: PaymentRequest['method'];
  status: InternalPaymentStatus;
  providerStatus: string;
  createdAt: string;
  updatedAt: string;
  pixExpiresAt?: string;
}

export class PaymentService {
  private readonly logger = new Logger('payment-service');
  private readonly idempotency = new IdempotencyStore();
  private readonly txLog = new ImmutableTransactionLog();
  private readonly payments = new Map<string, PersistedPayment>();

  constructor(private readonly provider: AbacatePayClient) {}

  async createPayment(request: PaymentRequest, idempotencyKey: string): Promise<PaymentResult> {
    const existing = this.idempotency.get<PaymentResult>(idempotencyKey, request);
    if (existing) {
      return existing;
    }

    const branding = {
      logoUrl: process.env.CHECKOUT_LOGO_URL,
      primaryColor: process.env.CHECKOUT_PRIMARY_COLOR,
      merchantName: process.env.CHECKOUT_MERCHANT_NAME || 'T3CK Store',
    };

    const providerResult = await this.provider.createPayment(request, branding);
    const paymentId = `pay_${Date.now()}`;
    const mappedStatus = mapProviderStatus(providerResult.status);
    const now = new Date().toISOString();

    const result: PaymentResult = {
      paymentId,
      providerPaymentId: providerResult.providerPaymentId,
      status: mappedStatus,
      providerStatus: providerResult.status,
      amount: request.amount,
      currency: request.currency,
      method: request.method,
      pix:
        providerResult.pix && request.method === 'pix'
          ? {
              qrCode: providerResult.pix.qrCode,
              copyPasteCode: providerResult.pix.copyPasteCode,
              expiresAt: providerResult.pix.expiresAt,
              expiresInSeconds: Math.max(
                0,
                Math.floor((new Date(providerResult.pix.expiresAt).getTime() - Date.now()) / 1000)
              ),
            }
          : undefined,
      boleto:
        providerResult.boleto && request.method === 'boleto'
          ? {
              barcode: providerResult.boleto.barcode,
              dueDate: providerResult.boleto.dueDate,
              pdfUrl: providerResult.boleto.pdfUrl,
            }
          : undefined,
      checkout: branding,
      userMessage: buildFriendlyMessage(mappedStatus, request.method),
      createdAt: now,
    };

    this.payments.set(paymentId, {
      paymentId,
      providerPaymentId: providerResult.providerPaymentId,
      tenantId: request.tenantId,
      orderId: request.orderId,
      customerId: request.customerId,
      amount: request.amount,
      currency: request.currency,
      method: request.method,
      status: mappedStatus,
      providerStatus: providerResult.status,
      createdAt: now,
      updatedAt: now,
      pixExpiresAt: providerResult.pix?.expiresAt,
    });

    this.txLog.append({
      tenantId: request.tenantId,
      paymentId,
      type: 'PAYMENT_CREATED',
      payload: {
        orderId: request.orderId,
        method: request.method,
        amount: request.amount,
        providerPaymentId: providerResult.providerPaymentId,
      },
    });

    this.idempotency.set(idempotencyKey, request, result);
    return result;
  }

  getPayment(paymentId: string): PersistedPayment | null {
    return this.payments.get(paymentId) ?? null;
  }

  async refund(request: RefundRequest): Promise<{ status: InternalPaymentStatus; message: string }> {
    const payment = this.payments.get(request.paymentId);
    if (!payment || payment.tenantId !== request.tenantId) {
      throw new Error('Pagamento não encontrado para este tenant.');
    }

    const providerStatus = await this.provider.refund(payment.providerPaymentId, request.amount);
    const mapped = mapProviderStatus(providerStatus);
    payment.status = mapped;
    payment.providerStatus = providerStatus;
    payment.updatedAt = new Date().toISOString();

    this.txLog.append({
      tenantId: request.tenantId,
      paymentId: request.paymentId,
      type: 'PAYMENT_REFUNDED',
      payload: {
        reason: request.reason,
        amount: request.amount ?? payment.amount,
      },
    });

    return {
      status: mapped,
      message: buildFriendlyMessage(mapped, payment.method),
    };
  }

  processWebhookUpdate(input: {
    tenantId: string;
    paymentId: string;
    providerStatus: string;
    rawPayload: Record<string, unknown>;
  }): InternalPaymentStatus {
    const payment = this.payments.get(input.paymentId);
    if (!payment || payment.tenantId !== input.tenantId) {
      throw new Error('Pagamento não encontrado para atualização de webhook.');
    }

    const mapped = mapProviderStatus(input.providerStatus as any);
    payment.status = mapped;
    payment.providerStatus = input.providerStatus;
    payment.updatedAt = new Date().toISOString();

    this.txLog.append({
      tenantId: input.tenantId,
      paymentId: input.paymentId,
      type: 'WEBHOOK_RECEIVED',
      payload: {
        providerStatus: input.providerStatus,
        rawPayload: input.rawPayload,
      },
    });

    return mapped;
  }

  handleChargeback(event: ChargebackEvent): void {
    const payment = this.payments.get(event.paymentId);
    if (!payment || payment.tenantId !== event.tenantId) {
      throw new Error('Pagamento não encontrado para chargeback.');
    }

    payment.status = 'CHARGEBACK';
    payment.providerStatus = 'chargeback';
    payment.updatedAt = new Date().toISOString();

    this.txLog.append({
      tenantId: event.tenantId,
      paymentId: event.paymentId,
      type: 'CHARGEBACK_RECEIVED',
      payload: {
        providerDisputeId: event.providerDisputeId,
        reason: event.reason,
        amount: event.amount,
        receivedAt: event.receivedAt,
      },
    });

    this.logger.warn('Chargeback recebido', {
      tenantId: event.tenantId,
      paymentId: event.paymentId,
      disputeId: event.providerDisputeId,
    });
  }

  createInvoice(paymentId: string): { invoiceId: string; url: string } {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error('Pagamento não encontrado para geração de invoice.');
    }

    const invoiceId = `inv_${paymentId}`;
    return {
      invoiceId,
      url: `${process.env.INVOICE_BASE_URL || 'https://billing.t3ck.local'}/invoices/${invoiceId}`,
    };
  }

  sendReceipt(paymentId: string, email: string): { sent: boolean; message: string } {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error('Pagamento não encontrado para envio de recibo.');
    }

    this.txLog.append({
      tenantId: payment.tenantId,
      paymentId,
      type: 'RECEIPT_SENT',
      payload: { email },
    });

    return { sent: true, message: `Recibo enviado para ${email}` };
  }

  getFinancialSummary(tenantId: string, period: 'daily' | 'monthly'): FinancialSummary {
    const now = new Date();
    const from = new Date(now);
    if (period === 'daily') {
      from.setHours(0, 0, 0, 0);
    } else {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    }

    const data = Array.from(this.payments.values()).filter(
      (item) => item.tenantId === tenantId && new Date(item.createdAt) >= from
    );

    const totalPaid = data.filter((item) => item.status === 'PAID').reduce((sum, item) => sum + item.amount, 0);
    const totalRefunded = data
      .filter((item) => item.status === 'REFUNDED')
      .reduce((sum, item) => sum + item.amount, 0);
    const totalChargeback = data
      .filter((item) => item.status === 'CHARGEBACK')
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      tenantId,
      period,
      totalPaid,
      totalRefunded,
      totalChargeback,
      netRevenue: totalPaid - totalRefunded - totalChargeback,
      transactionCount: data.length,
      from: from.toISOString(),
      to: now.toISOString(),
    };
  }

  getTransactionLogs(tenantId: string) {
    return this.txLog.listByTenant(tenantId);
  }

  verifyAuditTrailIntegrity(): boolean {
    return this.txLog.verifyIntegrity();
  }

  checkPixExpiration(paymentId: string): { expired: boolean; secondsLeft: number } {
    const payment = this.payments.get(paymentId);
    if (!payment || !payment.pixExpiresAt) {
      return { expired: false, secondsLeft: 0 };
    }

    const secondsLeft = Math.floor((new Date(payment.pixExpiresAt).getTime() - Date.now()) / 1000);
    if (secondsLeft <= 0 && payment.status === 'AWAITING_PAYMENT') {
      payment.status = 'FAILED';
      payment.providerStatus = 'failed';
      payment.updatedAt = new Date().toISOString();
    }

    return {
      expired: secondsLeft <= 0,
      secondsLeft: Math.max(0, secondsLeft),
    };
  }
}
