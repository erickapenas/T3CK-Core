/**
 * Webhook Testing Service
 * Provides testing capabilities for developers to validate webhook configurations
 */

export interface WebhookTestRequest {
  webhookId: string;
  eventType: string;
  testData: Record<string, unknown>;
  includeHeaders?: boolean;
}

export interface WebhookTestResult {
  testId: string;
  webhookId: string;
  statusCode: number;
  responseTime: number;
  response: string;
  success: boolean;
  error?: string;
  timestamp: Date;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
}

export interface WebhookTestPayload {
  id: string;
  event: string;
  version: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Service for testing webhooks
 */
export class WebhookTestingService {
  private testResults: Map<string, WebhookTestResult[]> = new Map();

  /**
   * Send test webhook request
   */
  async testWebhook(request: WebhookTestRequest): Promise<WebhookTestResult> {
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Build test payload
      const payload: WebhookTestPayload = {
        id: testId,
        event: request.eventType,
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: request.testData,
      };

      // Build request headers
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-ID': request.webhookId,
        'X-Test-Signature': 'test-mode',
      };

      if (request.includeHeaders) {
        requestHeaders['X-Event-ID'] = testId;
        requestHeaders['X-Timestamp'] = new Date().toISOString();
      }

      // Send test request
      const response = await this.sendTestRequest(request.webhookId, payload, requestHeaders);

      const responseTime = Date.now() - startTime;

      const result: WebhookTestResult = {
        testId,
        webhookId: request.webhookId,
        statusCode: response.statusCode,
        responseTime,
        response: response.body,
        success: response.statusCode >= 200 && response.statusCode < 300,
        requestHeaders,
        responseHeaders: response.headers,
        timestamp: new Date(),
      };

      // Store result
      if (!this.testResults.has(request.webhookId)) {
        this.testResults.set(request.webhookId, []);
      }
      this.testResults.get(request.webhookId)!.push(result);

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      const result: WebhookTestResult = {
        testId,
        webhookId: request.webhookId,
        statusCode: 0,
        responseTime,
        response: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        requestHeaders: {},
        responseHeaders: {},
        timestamp: new Date(),
      };

      if (!this.testResults.has(request.webhookId)) {
        this.testResults.set(request.webhookId, []);
      }
      this.testResults.get(request.webhookId)!.push(result);

      throw error;
    }
  }

  /**
   * Get test history for webhook
   */
  getTestHistory(webhookId: string, limit: number = 10): WebhookTestResult[] {
    const results = this.testResults.get(webhookId) || [];
    return results.slice(-limit).reverse();
  }

  /**
   * Clear test history
   */
  clearTestHistory(webhookId: string): void {
    this.testResults.delete(webhookId);
  }

  /**
   * Generate sample test data for event type
   */
  generateSampleData(eventType: string): Record<string, unknown> {
    switch (eventType) {
      case 'order.created':
        return {
          orderId: 'ORD-' + Math.random().toString(36).substr(2, 9),
          customerId: 'CUST-' + Math.random().toString(36).substr(2, 9),
          amount: 99.99,
          currency: 'USD',
          items: [
            {
              productId: 'PROD-123',
              quantity: 2,
              price: 49.99,
            },
          ],
          createdAt: new Date().toISOString(),
        };

      case 'payment.processed':
        return {
          paymentId: 'PAY-' + Math.random().toString(36).substr(2, 9),
          orderId: 'ORD-' + Math.random().toString(36).substr(2, 9),
          amount: 99.99,
          status: 'success',
          method: 'card',
          processedAt: new Date().toISOString(),
        };

      case 'user.created':
        return {
          userId: 'USER-' + Math.random().toString(36).substr(2, 9),
          email: `test-${Date.now()}@example.com`,
          name: 'Test User',
          createdAt: new Date().toISOString(),
        };

      default:
        return {
          eventType,
          timestamp: new Date().toISOString(),
          data: 'Sample test data',
        };
    }
  }

  /**
   * Validate webhook URL format
   */
  validateWebhookUrl(url: string): { valid: boolean; error?: string } {
    try {
      const parsedUrl = new URL(url);
      if (!['http', 'https'].includes(parsedUrl.protocol.replace(':', ''))) {
        return { valid: false, error: 'Only HTTP and HTTPS protocols are supported' };
      }
      if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
        return { valid: false, error: 'Localhost URLs are not allowed in production' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Send actual test request (would call external URL)
   */
  private async sendTestRequest(
    webhookId: string,
    payload: WebhookTestPayload,
    headers: Record<string, string>
  ): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
    // This would use fetch or axios to send the request
    // Placeholder implementation
    console.log(
      `[WebhookTesting] Sending test request for webhook ${webhookId}:`,
      payload,
      headers
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
}
