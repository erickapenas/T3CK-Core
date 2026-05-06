export type PaymentMethod = 'pix' | 'boleto' | 'card' | 'checkout';

export type AbacateCheckoutMethod = 'PIX' | 'CARD';

export type AbacatePayStatus =
  | 'PENDING'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'PAID'
  | 'UNDER_DISPUTE'
  | 'REFUNDED'
  | 'REDEEMED'
  | 'APPROVED'
  | 'FAILED'
  | 'pending'
  | 'paid'
  | 'refunded'
  | 'failed'
  | 'chargeback';

export type InternalPaymentStatus =
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'REFUNDED'
  | 'FAILED'
  | 'CHARGEBACK';

export interface PaymentRequest {
  tenantId: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  description?: string;
  dueMinutes?: number;
  checkoutItems?: Array<{
    id: string;
    quantity: number;
  }>;
  checkoutMethods?: AbacateCheckoutMethod[];
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

export interface PaymentResult {
  paymentId: string;
  providerPaymentId: string;
  status: InternalPaymentStatus;
  providerStatus: AbacatePayStatus;
  amount: number;
  currency: string;
  method: PaymentMethod;
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
  checkout?: {
    logoUrl?: string;
    primaryColor?: string;
    merchantName: string;
  };
  userMessage: string;
  createdAt: string;
}

export interface RefundRequest {
  tenantId: string;
  paymentId: string;
  reason: string;
  amount?: number;
}

export interface ChargebackEvent {
  tenantId: string;
  paymentId: string;
  providerDisputeId: string;
  reason: string;
  amount: number;
  receivedAt: string;
}

export interface TransactionLogEntry {
  id: string;
  tenantId: string;
  paymentId: string;
  type:
    | 'PAYMENT_CREATED'
    | 'PAYMENT_UPDATED'
    | 'PAYMENT_REFUNDED'
    | 'WEBHOOK_RECEIVED'
    | 'CHARGEBACK_RECEIVED'
    | 'RECEIPT_SENT';
  payload: Record<string, unknown>;
  createdAt: string;
  hash: string;
  prevHash: string;
}

export interface FinancialSummary {
  tenantId: string;
  period: 'daily' | 'monthly';
  totalPaid: number;
  totalRefunded: number;
  totalChargeback: number;
  netRevenue: number;
  transactionCount: number;
  from: string;
  to: string;
}
