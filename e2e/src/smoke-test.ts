import { ApiClient, TestConfig } from './api-client';

export interface SmokeTestResult {
  category: string;
  passed: number;
  failed: number;
  duration: number;
  tests: Array<{
    name: string;
    status: 'pass' | 'fail';
    message?: string;
    duration: number;
  }>;
}

export class SmokeTestSuite {
  private client: ApiClient;
  private config: TestConfig;
  private results: SmokeTestResult[] = [];

  constructor(config: TestConfig) {
    this.config = config;
    this.client = new ApiClient(config);
  }

  async runAll(): Promise<SmokeTestResult[]> {
    console.log(`🧪 Starting smoke tests for ${this.config.environment} (${this.config.baseUrl})`);

    await this.testHealthEndpoints();
    await this.testAuthenticationFlow();
    await this.testWebhookConnectivity();
    await this.testServiceStability();

    return this.results;
  }

  private async testHealthEndpoints(): Promise<void> {
    const startTime = Date.now();
    const result: SmokeTestResult = {
      category: 'Health Endpoints',
      passed: 0,
      failed: 0,
      duration: 0,
      tests: [],
    };

    // Test main health endpoint
    try {
      const health = await this.client.health();
      if (health.status === 'healthy') {
        result.tests.push({
          name: 'GET /health responds with 200',
          status: 'pass',
          duration: health.latency,
        });
        result.passed++;
      } else {
        result.tests.push({
          name: 'GET /health responds with 200',
          status: 'fail',
          message: `Service unhealthy with latency ${health.latency}ms`,
          duration: health.latency,
        });
        result.failed++;
      }
    } catch (error) {
      result.tests.push({
        name: 'GET /health responds with 200',
        status: 'fail',
        message: `Health check error: ${String(error)}`,
        duration: 0,
      });
      result.failed++;
    }

    // Test individual services
    const services = ['auth-service', 'tenant-service', 'webhook-service'];
    for (const service of services) {
      try {
        const serviceStart = Date.now();
        const status = await this.client.getServiceStatus(service);
        const duration = Date.now() - serviceStart;

        if (status.status === 'available' || status.status === 'healthy') {
          result.tests.push({
            name: `Service ${service} is available`,
            status: 'pass',
            duration,
          });
          result.passed++;
        } else {
          result.tests.push({
            name: `Service ${service} is available`,
            status: 'fail',
            message: `Status: ${status.status}`,
            duration,
          });
          result.failed++;
        }
      } catch (error) {
        result.tests.push({
          name: `Service ${service} is available`,
          status: 'fail',
          message: `Error: ${String(error)}`,
          duration: 0,
        });
        result.failed++;
      }
    }

    result.duration = Date.now() - startTime;
    this.results.push(result);
  }

  private async testAuthenticationFlow(): Promise<void> {
    const startTime = Date.now();
    const result: SmokeTestResult = {
      category: 'Authentication Flow',
      passed: 0,
      failed: 0,
      duration: 0,
      tests: [],
    };

    // Test valid credentials
    try {
      const testStart = Date.now();
      const token = await this.client.login('test@example.com', 'password123');
      const duration = Date.now() - testStart;

      if (token && token.length > 0) {
        result.tests.push({
          name: 'Login with valid credentials returns token',
          status: 'pass',
          duration,
        });
        result.passed++;

        // Test authenticated request
        try {
          const authStart = Date.now();
          await this.client.authenticatedRequest(token, '/api/v1/profile');
          const authDuration = Date.now() - authStart;
          result.tests.push({
            name: 'Authenticated request with token succeeds',
            status: 'pass',
            duration: authDuration,
          });
          result.passed++;
        } catch (error) {
          result.tests.push({
            name: 'Authenticated request with token succeeds',
            status: 'fail',
            message: `Auth request failed: ${String(error)}`,
            duration: 0,
          });
          result.failed++;
        }
      } else {
        result.tests.push({
          name: 'Login with valid credentials returns token',
          status: 'fail',
          message: 'No token returned',
          duration,
        });
        result.failed++;
      }
    } catch (error) {
      result.tests.push({
        name: 'Login with valid credentials returns token',
        status: 'fail',
        message: `Login failed: ${String(error)}`,
        duration: 0,
      });
      result.failed++;
    }

    // Test invalid credentials
    try {
      const testStart = Date.now();
      await this.client.login('invalid@example.com', 'wrongpass');
      const duration = Date.now() - testStart;
      result.tests.push({
        name: 'Login with invalid credentials returns error',
        status: 'fail',
        message: 'Should have rejected invalid credentials',
        duration,
      });
      result.failed++;
    } catch {
      result.tests.push({
        name: 'Login with invalid credentials returns error',
        status: 'pass',
        duration: 0,
      });
      result.passed++;
    }

    result.duration = Date.now() - startTime;
    this.results.push(result);
  }

  private async testWebhookConnectivity(): Promise<void> {
    const startTime = Date.now();
    const result: SmokeTestResult = {
      category: 'Webhook Connectivity',
      passed: 0,
      failed: 0,
      duration: 0,
      tests: [],
    };

    const webhookTests = [
      { name: 'Webhook', event: 'test.ping', payload: { timestamp: Date.now() } },
      { name: 'Webhook', event: 'provisioning.started', payload: { tenantId: 'test-123' } },
      { name: 'Webhook', event: 'deployment.completed', payload: { deploymentId: 'deploy-456' } },
    ];

    for (const test of webhookTests) {
      try {
        const testStart = Date.now();
        const success = await this.client.webhookEventTest({
          event: test.event,
          ...test.payload,
        });
        const duration = Date.now() - testStart;

        if (success) {
          result.tests.push({
            name: `${test.name} event ${test.event} processed successfully`,
            status: 'pass',
            duration,
          });
          result.passed++;
        } else {
          result.tests.push({
            name: `${test.name} event ${test.event} processed successfully`,
            status: 'fail',
            message: 'Webhook processing returned false',
            duration,
          });
          result.failed++;
        }
      } catch (error) {
        result.tests.push({
          name: `${test.name} event ${test.event} processed successfully`,
          status: 'fail',
          message: `Webhook error: ${String(error)}`,
          duration: 0,
        });
        result.failed++;
      }
    }

    result.duration = Date.now() - startTime;
    this.results.push(result);
  }

  private async testServiceStability(): Promise<void> {
    const startTime = Date.now();
    const result: SmokeTestResult = {
      category: 'Service Stability',
      passed: 0,
      failed: 0,
      duration: 0,
      tests: [],
    };

    // Test multiple health checks to ensure consistency
    const healthChecks = [];
    for (let i = 0; i < 3; i++) {
      try {
        const checkStart = Date.now();
        const health = await this.client.health();
        const duration = Date.now() - checkStart;
        healthChecks.push({ status: health.status, latency: duration });
      } catch {
        healthChecks.push({ status: 'unhealthy', latency: 0 });
      }
      // Wait 10 seconds between checks
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    const allHealthy = healthChecks.every((check) => check.status === 'healthy');
    if (allHealthy) {
      result.tests.push({
        name: 'Service remains healthy across 3 checks (30s total)',
        status: 'pass',
        message: `Latencies: ${healthChecks.map((c) => c.latency).join(', ')}ms`,
        duration: 30000,
      });
      result.passed++;
    } else {
      result.tests.push({
        name: 'Service remains healthy across 3 checks (30s total)',
        status: 'fail',
        message: `Unhealthy checks detected: ${healthChecks.filter((c) => c.status === 'unhealthy').length}/3`,
        duration: 30000,
      });
      result.failed++;
    }

    result.duration = Date.now() - startTime;
    this.results.push(result);
  }

  getResults(): SmokeTestResult[] {
    return this.results;
  }

  getSummary(): { total: number; passed: number; failed: number } {
    let total = 0;
    let passed = 0;
    let failed = 0;

    for (const result of this.results) {
      total += result.tests.length;
      passed += result.passed;
      failed += result.failed;
    }

    return { total, passed, failed };
  }

  printReport(): void {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                   🧪 SMOKE TEST REPORT                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    for (const result of this.results) {
      const emoji = result.failed === 0 ? '✅' : '❌';
      console.log(`${emoji} ${result.category}`);
      console.log(
        `   Passed: ${result.passed}/${result.tests.length} | Duration: ${result.duration}ms`
      );

      for (const test of result.tests) {
        const testEmoji = test.status === 'pass' ? '  ✓' : '  ✗';
        console.log(`${testEmoji} ${test.name} (${test.duration}ms)`);
        if (test.message) {
          console.log(`    └─ ${test.message}`);
        }
      }
      console.log();
    }

    const summary = this.getSummary();
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log(
      `║ Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`.padEnd(
        63
      ) + '║'
    );
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  }
}
