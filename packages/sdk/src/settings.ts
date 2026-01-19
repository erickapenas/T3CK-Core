import { T3CKClient } from './client';
import { Settings, ApiResponse } from './types';

export class SettingsModule {
  constructor(private client: T3CKClient) {}

  async get(): Promise<ApiResponse<Settings>> {
    return this.client.get<ApiResponse<Settings>>('/settings');
  }

  async update(updates: Partial<Settings>): Promise<ApiResponse<Settings>> {
    this.validateSettings(updates);

    return this.client.put<ApiResponse<Settings>>('/settings', updates);
  }

  async getPaymentMethods(): Promise<ApiResponse<string[]>> {
    return this.client.get<ApiResponse<string[]>>('/settings/payment-methods');
  }

  async updatePaymentMethods(methods: string[]): Promise<ApiResponse<string[]>> {
    if (!Array.isArray(methods)) {
      throw new Error('Payment methods must be an array');
    }

    return this.client.put<ApiResponse<string[]>>('/settings/payment-methods', { methods });
  }

  private validateSettings(settings: Partial<Settings>): void {
    if (settings.currency && typeof settings.currency !== 'string') {
      throw new Error('Currency must be a string');
    }

    if (settings.taxRate !== undefined && (settings.taxRate < 0 || settings.taxRate > 1)) {
      throw new Error('Tax rate must be between 0 and 1');
    }

    if (
      settings.paymentMethods &&
      (!Array.isArray(settings.paymentMethods) ||
        !settings.paymentMethods.every((m) => typeof m === 'string'))
    ) {
      throw new Error('Payment methods must be an array of strings');
    }
  }
}
