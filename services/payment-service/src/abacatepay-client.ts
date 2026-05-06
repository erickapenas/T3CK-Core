import axios, { AxiosError, AxiosInstance } from 'axios';
import { AbacateCheckoutMethod, AbacatePayStatus, PaymentMethod, PaymentRequest } from './types';

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
  hostedCheckout?: {
    url: string;
    returnUrl?: string;
    completionUrl?: string;
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

  private shouldRetry(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    return !status || status === 429 || status >= 500;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxAttempts || !this.shouldRetry(error)) {
          const axiosError = error as AxiosError;
          const status = axiosError.response?.status;
          throw new Error(
            status ? `AbacatePay request failed with status ${status}` : 'AbacatePay request failed'
          );
        }

        const jitter = Math.floor(Math.random() * 100);
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt + jitter));
      }
    }

    throw new Error('AbacatePay request failed');
  }

  private unwrapResponse<T>(payload: unknown): T {
    const body = payload as { data?: T; success?: boolean; error?: string | null };
    if (body.success === false) {
      throw new Error(body.error || 'AbacatePay request failed');
    }

    return (body.data ?? payload) as T;
  }

  private isHostedCheckout(method: PaymentMethod): boolean {
    return method === 'card' || method === 'checkout';
  }

  private getHostedCheckoutMethods(request: PaymentRequest): AbacateCheckoutMethod[] {
    if (request.checkoutMethods?.length) {
      return request.checkoutMethods;
    }

    return request.method === 'card' ? ['CARD'] : ['PIX', 'CARD'];
  }

  async createPayment(
    request: PaymentRequest,
    branding: { logoUrl?: string; primaryColor?: string; merchantName: string }
  ): Promise<AbacateChargeResponse> {
    if (this.isHostedCheckout(request.method) && !request.checkoutItems?.length) {
      throw new Error(
        'checkoutItems e obrigatorio para checkout hospedado da AbacatePay. Use IDs de produtos cadastrados na AbacatePay.'
      );
    }

    if (this.mockMode) {
      const expiresAt = new Date(Date.now() + (request.dueMinutes ?? 30) * 60 * 1000).toISOString();
      if (this.isHostedCheckout(request.method)) {
        const billId = `bill_${Date.now()}`;
        return {
          providerPaymentId: billId,
          status: 'PENDING',
          hostedCheckout: {
            url: `https://app.abacatepay.com/pay/${billId}`,
            returnUrl: request.returnUrl,
            completionUrl: request.completionUrl,
          },
        };
      }

      return {
        providerPaymentId: `abaca_${Date.now()}`,
        status: 'PENDING',
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

    if (this.isHostedCheckout(request.method)) {
      const response = await this.withRetry(() =>
        this.http.post('/checkouts/create', {
          items: request.checkoutItems,
          methods: this.getHostedCheckoutMethods(request),
          externalId: request.orderId,
          returnUrl: request.returnUrl,
          completionUrl: request.completionUrl,
          coupons: request.coupons,
          upSellProductId: request.upSellProductId,
          card: request.maxInstallments ? { maxInstallments: request.maxInstallments } : undefined,
          metadata: {
            ...(request.metadata ?? {}),
            tenantId: request.tenantId,
            orderId: request.orderId,
            customerId: request.customerId,
            merchantName: branding.merchantName,
          },
        })
      );

      const data = this.unwrapResponse<Record<string, unknown>>(response.data);

      return {
        providerPaymentId: String(data.id),
        status: String(data.status) as AbacatePayStatus,
        hostedCheckout: {
          url: String(data.url ?? ''),
          returnUrl: data.returnUrl ? String(data.returnUrl) : request.returnUrl,
          completionUrl: data.completionUrl ? String(data.completionUrl) : request.completionUrl,
        },
      };
    }

    const response = await this.withRetry(() =>
      this.http.post('/transparents/create', {
        method: request.method === 'boleto' ? 'BOLETO' : 'PIX',
        data: {
          amount: request.amount,
          description: request.description,
          expiresIn: request.dueMinutes ? request.dueMinutes * 60 : undefined,
          externalId: request.orderId,
          customer: request.customer,
          metadata: {
            ...(request.metadata ?? {}),
            tenantId: request.tenantId,
            orderId: request.orderId,
            customerId: request.customerId,
            merchantName: branding.merchantName,
            logoUrl: branding.logoUrl,
            primaryColor: branding.primaryColor,
          },
        },
      })
    );

    const data = this.unwrapResponse<Record<string, unknown>>(response.data);
    const method = request.method as PaymentMethod;

    return {
      providerPaymentId: String(data.id),
      status: String(data.status) as AbacatePayStatus,
      pix:
        method === 'pix'
          ? {
              qrCode: String(data.brCodeBase64 ?? ''),
              copyPasteCode: String(data.brCode ?? ''),
              expiresAt: String(data.expiresAt ?? new Date().toISOString()),
            }
          : undefined,
      boleto:
        method === 'boleto'
          ? {
              barcode: String(data.barCode ?? ''),
              dueDate: String(data.expiresAt ?? new Date().toISOString()),
              pdfUrl: data.url ? String(data.url) : undefined,
            }
          : undefined,
    };
  }

  async refund(providerPaymentId: string, amount?: number): Promise<AbacatePayStatus> {
    if (this.mockMode) {
      return 'REFUNDED';
    }

    const response = await this.withRetry(() =>
      this.http.post(`/transparents/refund`, {
        id: providerPaymentId,
        amount,
      })
    );
    const data = this.unwrapResponse<Record<string, unknown>>(response.data);
    return String(data.status) as AbacatePayStatus;
  }

  async getPaymentStatus(
    providerPaymentId: string,
    method: PaymentMethod = 'pix'
  ): Promise<AbacatePayStatus> {
    if (this.mockMode) {
      return 'PENDING';
    }

    if (this.isHostedCheckout(method)) {
      const response = await this.withRetry(() =>
        this.http.get('/checkouts/get', { params: { id: providerPaymentId } })
      );
      const data = this.unwrapResponse<Record<string, unknown>>(response.data);
      return String(data.status) as AbacatePayStatus;
    }

    const response = await this.withRetry(() =>
      this.http.get('/transparents/check', { params: { id: providerPaymentId } })
    );
    const data = this.unwrapResponse<Record<string, unknown>>(response.data);
    return String(data.status) as AbacatePayStatus;
  }
}
