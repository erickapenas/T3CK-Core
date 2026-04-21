import axios from 'axios';
import type { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';

import { ClientConfig, ApiError } from './types';

export class T3CKClient {
  private client: AxiosInstance;
  private retries: number;

  constructor(config: ClientConfig) {
    this.retries = config.retries ?? 3;

    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        ...(config.tenantId ? { 'X-Tenant-ID': config.tenantId } : {}),
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor para logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[T3CK SDK] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[T3CK SDK] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor para error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const apiError = this.handleError(error);

        // Retry logic com exponential backoff
        if (this.shouldRetry(error) && this.retries > 0) {
          this.retries--;
          const delay = this.calculateBackoff(3 - this.retries);
          await this.sleep(delay);
          return this.client.request(error.config as AxiosRequestConfig);
        }

        return Promise.reject(apiError);
      }
    );
  }

  private shouldRetry(error: AxiosError): boolean {
    if (!error.response) {
      return true; // Network error
    }

    const status = error.response.status;
    return status >= 500 || status === 429; // Server errors or rate limit
  }

  private calculateBackoff(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private handleError(error: AxiosError): ApiError {
    if (error.response) {
      const data = error.response.data as { message?: string; code?: string };
      return {
        code: data.code ?? `HTTP_${error.response.status}`,
        message: data.message ?? error.message,
        details: {
          status: error.response.status,
          statusText: error.response.statusText,
        },
      };
    }

    return {
      code: 'NETWORK_ERROR',
      message: error.message ?? 'Network error occurred',
    };
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}
