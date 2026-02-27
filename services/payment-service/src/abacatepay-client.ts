import axios, { AxiosInstance } from 'axios';
import { AbacatePayStatus, PaymentMethod, PaymentRequest } from './types';

export interface AbacateChargeResponse {
  providerPaymentId: string;
  status: AbacatePayStatus;
  pix?: {
    qrCode: string;
    copyPasteCode: string;
    expiresAt: string;
  };
  boleto?: {
    barcode: string;
    dueDate: string;
    pdfUrl?: string;
  };
}

export class AbacatePayClient {
  private readonly http: AxiosInstance;
  private readonly mockMode: boolean;

  constructor(baseUrl: string, apiKey: string) {
    this.mockMode = String(process.env.PAYMENT_MOCK_MODE || 'true') === 'true';
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createPayment(
    request: PaymentRequest,
    branding: { logoUrl?: string; primaryColor?: string; merchantName: string }
  ): Promise<AbacateChargeResponse> {
    if (this.mockMode) {
      const expiresAt = new Date(Date.now() + (request.dueMinutes ?? 30) * 60 * 1000).toISOString();
      return {
        providerPaymentId: `abaca_${Date.now()}`,
        status: 'pending',
        pix:
          request.method === 'pix'
            ? {
                qrCode: `00020126330014BR.GOV.BCB.PIX0111+55119999999995204000053039865802BR5925${branding.merchantName.slice(0, 25)}6009SAO PAULO62070503***6304ABCD`,
                copyPasteCode: `00020101021226840014BR.GOV.BCB.PIX2562pix.abacatepay.com/pay/${Date.now()}5204000053039865802BR5925${branding.merchantName.slice(0, 25)}6009SAO PAULO62070503***6304ABCD`,
                expiresAt,
              }
            : undefined,
        boleto:
          request.method === 'boleto'
            ? {
                barcode: `34191.79001 01043.510047 91020.150008 2 93740026000`,
                dueDate: expiresAt,
                pdfUrl: `https://sandbox.abacatepay.com/boleto/${Date.now()}.pdf`,
              }
            : undefined,
      };
    }

    const response = await this.http.post('/v1/charges', {
      amount: request.amount,
      currency: request.currency,
      method: request.method,
      description: request.description,
      metadata: request.metadata,
      dueMinutes: request.dueMinutes,
      checkout: {
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        merchantName: branding.merchantName,
      },
    });

    const data = response.data as Record<string, unknown>;
    const method = request.method as PaymentMethod;

    return {
      providerPaymentId: String(data.id),
      status: String(data.status) as AbacatePayStatus,
      pix:
        method === 'pix'
          ? {
              qrCode: String(data.qrCode ?? ''),
              copyPasteCode: String(data.copyPasteCode ?? ''),
              expiresAt: String(data.expiresAt ?? new Date().toISOString()),
            }
          : undefined,
      boleto:
        method === 'boleto'
          ? {
              barcode: String(data.barcode ?? ''),
              dueDate: String(data.dueDate ?? new Date().toISOString()),
              pdfUrl: data.pdfUrl ? String(data.pdfUrl) : undefined,
            }
          : undefined,
    };
  }

  async refund(providerPaymentId: string, amount?: number): Promise<AbacatePayStatus> {
    if (this.mockMode) {
      return 'refunded';
    }

    const response = await this.http.post(`/v1/charges/${providerPaymentId}/refund`, {
      amount,
    });
    return String((response.data as Record<string, unknown>).status) as AbacatePayStatus;
  }
}
