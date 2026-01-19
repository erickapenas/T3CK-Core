import express, { Request, Response } from 'express';
import { WebhookManager } from '../webhook-manager';
import { Logger } from '@t3ck/shared';

const router = express.Router();
const webhookManager = new WebhookManager();
const logger = new Logger('webhook-api');

// Criar webhook
router.post('/webhooks', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const { url, events, secret } = req.body;

    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'URL and events are required' });
    }

    const webhook = await webhookManager.createWebhook({
      tenantId,
      url,
      events,
      secret,
      active: true,
      retryCount: 0,
    });

    res.status(201).json({ data: webhook });
  } catch (error) {
    logger.error('Failed to create webhook', { error });
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

// Listar webhooks do tenant
router.get('/webhooks', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const webhooks = await webhookManager.getWebhooksByTenant(tenantId);
    res.json({ data: webhooks });
  } catch (error) {
    logger.error('Failed to list webhooks', { error });
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

// Obter webhook específico
router.get('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const webhook = await webhookManager.getWebhook(id);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({ data: webhook });
  } catch (error) {
    logger.error('Failed to get webhook', { error });
    res.status(500).json({ error: 'Failed to get webhook' });
  }
});

// Atualizar webhook
router.put('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const webhook = await webhookManager.updateWebhook(id, updates);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({ data: webhook });
  } catch (error) {
    logger.error('Failed to update webhook', { error });
    res.status(500).json({ error: 'Failed to update webhook' });
  }
});

// Deletar webhook
router.delete('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await webhookManager.deleteWebhook(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete webhook', { error });
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

// Obter logs de entregas
router.get('/webhooks/:id/logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await webhookManager.getDeliveryLogs(id, limit);
    res.json({ data: logs });
  } catch (error) {
    logger.error('Failed to get webhook logs', { error });
    res.status(500).json({ error: 'Failed to get webhook logs' });
  }
});

export default router;
