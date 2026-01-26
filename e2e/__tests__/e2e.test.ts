import { describe, it, expect, beforeAll } from '@jest/globals';
import { SmokeTestSuite } from '../src/smoke-test';
import { config } from '../src/config';

describe('E2E Smoke Tests', () => {
  let suite: SmokeTestSuite;

  beforeAll(() => {
    suite = new SmokeTestSuite({
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      environment: config.environment as 'staging' | 'production',
    });
  });

  describe('Health Endpoints', () => {
    it('should pass health check tests', async () => {
      await suite.runAll();
      const results = suite.getResults();
      const healthResults = results.find((r) => r.category === 'Health Endpoints');

      expect(healthResults).toBeDefined();
      if (healthResults) {
        expect(healthResults.failed).toBeLessThan(healthResults.tests.length);
      }
    });
  });

  describe('Authentication Flow', () => {
    it('should pass authentication tests', async () => {
      const results = suite.getResults();
      const authResults = results.find((r) => r.category === 'Authentication Flow');

      expect(authResults).toBeDefined();
      if (authResults) {
        expect(authResults.passed).toBeGreaterThan(0);
      }
    });
  });

  describe('Webhook Connectivity', () => {
    it('should pass webhook connectivity tests', async () => {
      const results = suite.getResults();
      const webhookResults = results.find((r) => r.category === 'Webhook Connectivity');

      expect(webhookResults).toBeDefined();
      expect(webhookResults?.passed).toBeGreaterThan(0);
    });
  });

  describe('Service Stability', () => {
    it('should maintain service stability across multiple checks', async () => {
      const results = suite.getResults();
      const stabilityResults = results.find((r) => r.category === 'Service Stability');

      expect(stabilityResults).toBeDefined();
      expect(stabilityResults?.passed).toBeGreaterThan(0);
    });
  });

  describe('Overall Summary', () => {
    it('should have all tests pass', () => {
      const summary = suite.getSummary();

      expect(summary.total).toBeGreaterThan(0);
      expect(summary.failed).toBe(0);
      expect(summary.passed).toBe(summary.total);
    });
  });
});
