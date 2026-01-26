import axios, { AxiosInstance } from 'axios';

export interface TestConfig {
  baseUrl: string;
  timeout?: number;
  environment?: 'staging' | 'production';
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy';
  latency: number;
  timestamp: string;
}

export class ApiClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private environment: string;

  constructor(config: TestConfig) {
    this.baseUrl = config.baseUrl;
    this.environment = config.environment || 'staging';
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 10000,
    });
  }

  async health(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const response = await this.client.get('/health');
      const latency = Date.now() - start;
      return {
        service: this.environment,
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        latency,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        service: this.environment,
        status: 'unhealthy',
        latency: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async login(email: string, password: string): Promise<string> {
    const response = await this.client.post('/api/v1/auth/login', {
      email,
      password,
    });
    return response.data.token;
  }

  async authenticatedRequest(token: string, endpoint: string, method: string = 'GET') {
    return this.client.request({
      method,
      url: endpoint,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async webhookEventTest(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await this.client.post('/api/v1/webhooks/test', payload);
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async getServiceStatus(serviceName: string): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.get(`/api/v1/services/${serviceName}/status`);
      return response.data;
    } catch {
      return { status: 'unavailable' };
    }
  }
}
