import { Router, Request, Response } from 'express';
import { Logger } from '@t3ck/shared';
import { WebhookTestingService, WebhookTestRequest } from './testing-service';
import { EventVersioningService, EventVersion } from './event-versioning';

interface WebhookTestingRouter {
  router: Router;
}

/**
 * Create webhook testing endpoints
 */
export function createWebhookTestingRouter(
  testingService: WebhookTestingService,
  versioningService: typeof EventVersioningService,
  logger: Logger
): WebhookTestingRouter {
  const router = Router();

  /**
   * POST /webhooks/test
   * Send test webhook request
   */
  router.post('/webhooks/test', async (req: Request, res: Response) => {
    try {
      const { webhookId, eventType, testData, includeHeaders } = req.body;

      if (!webhookId || !eventType) {
        res.status(400).json({
          error: 'Missing required fields: webhookId, eventType',
        });
        return;
      }

      const testRequest: WebhookTestRequest = {
        webhookId,
        eventType,
        testData: testData || testingService.generateSampleData(eventType),
        includeHeaders: includeHeaders || true,
      };

      const result = await testingService.testWebhook(testRequest);

      res.json({
        success: result.success,
        testResult: result,
      });
    } catch (error) {
      logger.error('[WebhookTesting] Test request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Webhook test failed',
      });
    }
  });

  /**
   * GET /webhooks/test/history/:webhookId
   * Get test history for a webhook
   */
  router.get('/webhooks/test/history/:webhookId', async (req: Request, res: Response) => {
    try {
      const { webhookId } = req.params;
      const { limit } = req.query;

      const history = testingService.getTestHistory(webhookId, parseInt(limit as string) || 10);

      res.json({
        webhookId,
        testHistory: history,
      });
    } catch (error) {
      logger.error('[WebhookTesting] Get history failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to retrieve test history',
      });
    }
  });

  /**
   * DELETE /webhooks/test/history/:webhookId
   * Clear test history for a webhook
   */
  router.delete('/webhooks/test/history/:webhookId', async (req: Request, res: Response) => {
    try {
      const { webhookId } = req.params;

      testingService.clearTestHistory(webhookId);

      res.json({
        success: true,
        message: `Test history cleared for webhook: ${webhookId}`,
      });
    } catch (error) {
      logger.error('[WebhookTesting] Clear history failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to clear test history',
      });
    }
  });

  /**
   * GET /webhooks/test/sample/:eventType
   * Get sample test data for event type
   */
  router.get('/webhooks/test/sample/:eventType', async (req: Request, res: Response) => {
    try {
      const { eventType } = req.params;

      const sampleData = testingService.generateSampleData(eventType);

      res.json({
        eventType,
        sampleData,
      });
    } catch (error) {
      logger.error('[WebhookTesting] Generate sample failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to generate sample data',
      });
    }
  });

  /**
   * POST /webhooks/test/validate-url
   * Validate webhook URL format and reachability
   */
  router.post('/webhooks/test/validate-url', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;

      if (!url) {
        res.status(400).json({
          error: 'Missing required field: url',
        });
        return;
      }

      const validation = testingService.validateWebhookUrl(url);

      res.json({
        url,
        valid: validation.valid,
        error: validation.error,
      });
    } catch (error) {
      logger.error('[WebhookTesting] URL validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'URL validation failed',
      });
    }
  });

  /**
   * GET /webhooks/events/versions/:eventType
   * Get available versions for event type
   */
  router.get('/webhooks/events/versions/:eventType', async (req: Request, res: Response) => {
    try {
      const { eventType } = req.params;

      const versions = versioningService.getAvailableVersions(eventType as string);

      res.json({
        eventType,
        availableVersions: versions,
        latestVersion: versions[versions.length - 1] || null,
      });
    } catch (error) {
      logger.error('[WebhookTesting] Get versions failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to retrieve event versions',
      });
    }
  });

  /**
   * GET /webhooks/events/schema/:eventType/:version
   * Get event schema documentation
   */
  router.get('/webhooks/events/schema/:eventType/:version', async (req: Request, res: Response) => {
    try {
      const { eventType, version } = req.params;

      const schema = versioningService.getSchemaDocumentation(eventType, version as EventVersion);

      if (!schema) {
        res.status(404).json({
          error: `Schema not found for ${eventType} version ${version}`,
        });
        return;
      }

      res.json({
        eventType,
        version,
        schema,
      });
    } catch (error) {
      logger.error('[WebhookTesting] Get schema failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to retrieve event schema',
      });
    }
  });

  /**
   * POST /webhooks/events/validate
   * Validate event payload against schema
   */
  router.post('/webhooks/events/validate', async (req: Request, res: Response) => {
    try {
      const { eventType, version, data } = req.body;

      if (!eventType || !version || !data) {
        res.status(400).json({
          error: 'Missing required fields: eventType, version, data',
        });
        return;
      }

      const event = {
        id: 'test-event',
        tenantId: 'test-tenant',
        type: eventType,
        version: version as EventVersion,
        timestamp: new Date(),
        data,
        metadata: {
          sourceService: 'test',
        },
      };

      const validation = versioningService.validateEvent(event);

      res.json({
        valid: validation.valid,
        errors: validation.errors,
      });
    } catch (error) {
      logger.error('[WebhookTesting] Event validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Event validation failed',
      });
    }
  });

  return { router };
}

export { WebhookTestingRouter };
