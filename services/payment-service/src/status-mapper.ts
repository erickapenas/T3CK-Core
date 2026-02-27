import { AbacatePayStatus, InternalPaymentStatus, PaymentMethod } from './types';

const STATUS_MAP: Record<AbacatePayStatus, InternalPaymentStatus> = {
  pending: 'AWAITING_PAYMENT',
  paid: 'PAID',
  refunded: 'REFUNDED',
  failed: 'FAILED',
  chargeback: 'CHARGEBACK',
};

export function mapProviderStatus(status: AbacatePayStatus): InternalPaymentStatus {
  return STATUS_MAP[status] ?? 'FAILED';
}

export function buildFriendlyMessage(status: InternalPaymentStatus, method: PaymentMethod): string {
  if (status === 'PAID') {
    return 'Pagamento confirmado com sucesso.';
  }

  if (status === 'AWAITING_PAYMENT' && method === 'pix') {
    return 'Aguardando pagamento Pix. Use o QR Code ou o código Copia e Cola antes de expirar.';
  }

  if (status === 'AWAITING_PAYMENT' && method === 'boleto') {
    return 'Boleto gerado. Efetue o pagamento até o vencimento para concluir o pedido.';
  }

  if (status === 'REFUNDED') {
    return 'Pagamento estornado com sucesso.';
  }

  if (status === 'CHARGEBACK') {
    return 'Pagamento contestado pelo cliente (chargeback). Time financeiro notificado.';
  }

  return 'Não foi possível concluir o pagamento. Verifique os dados e tente novamente.';
}
