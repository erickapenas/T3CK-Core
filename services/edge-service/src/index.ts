import express, { Request, Response } from 'express';
import { EdgeRenderer } from './edge-renderer';
import { SSRRenderer } from './ssr-renderer';
import {
  PreRenderConfigSchema,
  BatchPreRenderSchema,
  ISRConfigSchema,
  SSRRequestSchema,
  SSRConfigSchema,
} from './validation';
import { Logger } from '@t3ck/shared';

const logger = new Logger('edge-service');

const app: express.Application = express();
const renderer = new EdgeRenderer();
const ssrRenderer = new SSRRenderer();

app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'edge-service' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'edge-service',
    status: 'running',
    endpoints: {
      health: '/health',
      render: '/render/{tenantId}/{resourceType}/{resourceId}',
      ssr: '/ssr',
      jobs: '/jobs',
    },
  });
});

// Render page (SSG/ISR)
app.get('/render/:tenantId/:resourceType/:resourceId', async (req: Request, res: Response) => {
  try {
    const { tenantId, resourceType, resourceId } = req.params;
    const force = req.query.force === 'true';

    const page = await renderer.render(tenantId, resourceType, resourceId, force);

    // Set all headers
    Object.entries(page.headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    res.set('X-Cache-Hits', page.hits.toString());
    res.status(page.statusCode).send(page.html);
  } catch (error: any) {
    logger.error('Render error', { error: error.message, params: req.params });
    res.status(500).json({ error: error.message });
  }
});

// Pre-render single page
app.post('/prerender', async (req: Request, res: Response) => {
  try {
    const config = PreRenderConfigSchema.parse(req.body);
    const jobId = await renderer.preRender(config);

    res.json({
      message: 'Pre-render job initiated',
      jobId,
      status: 'pending',
    });
  } catch (error: any) {
    logger.error('PreRender error', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// Batch pre-render
app.post('/prerender/batch', async (req: Request, res: Response) => {
  try {
    const { configs } = BatchPreRenderSchema.parse(req.body);
    const jobIds = await renderer.batchPreRender(configs);

    res.json({
      message: 'Batch pre-render initiated',
      count: jobIds.length,
      jobIds,
    });
  } catch (error: any) {
    logger.error('Batch preRender error', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// Get job status
app.get('/jobs/:jobId', (req: Request, res: Response) => {
  const job = renderer.getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return res.json({ job });
});

// List all jobs
app.get('/jobs', (_req: Request, res: Response) => {
  const jobs = renderer.getJobs();
  res.json({
    jobs,
    total: jobs.length,
    pending: jobs.filter((j) => j.status === 'pending').length,
    processing: jobs.filter((j) => j.status === 'processing').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  });
});

// Purge specific resource
app.delete('/cache/:tenantId/:resourceType/:resourceId', (req: Request, res: Response) => {
  const { tenantId, resourceType, resourceId } = req.params;
  const deleted = renderer.purgeResource(tenantId, resourceType, resourceId);

  if (deleted) {
    res.json({ message: 'Resource purged from cache' });
  } else {
    res.status(404).json({ error: 'Resource not found in cache' });
  }
});

// Clear entire cache
app.post('/cache/clear', (_req: Request, res: Response) => {
  renderer.clearCache();
  res.json({ message: 'Cache cleared' });
});

// Get ISR config
app.get('/isr/config', (_req: Request, res: Response) => {
  res.json({ config: renderer.getISRConfig() });
});

// Update ISR config
app.put('/isr/config', (req: Request, res: Response) => {
  try {
    const config = ISRConfigSchema.parse(req.body);
    renderer.updateISRConfig(config);
    res.json({ message: 'ISR config updated', config });
  } catch (error: any) {
    logger.error('ISR config update error', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// Get stats
app.get('/stats', (_req: Request, res: Response) => {
  res.json({
    stats: renderer.getStats(),
    ssrStats: ssrRenderer.getStats(),
  });
});

// ============================================
// SSR (Server-Side Rendering) Endpoints
// ============================================

// SSR render via POST with full request context
app.post('/ssr', async (req: Request, res: Response) => {
  try {
    const ssrRequest = SSRRequestSchema.parse(req.body);
    const result = await ssrRenderer.render(ssrRequest);

    // Set all headers
    Object.entries(result.headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    return res.status(result.statusCode).send(result.html);
  } catch (error: any) {
    logger.error('SSR error', { error: error.message });
    return res.status(400).json({ error: error.message });
  }
});

// SSR render via GET (simplified)
app.get('/ssr/:tenantId/:resourceType/:resourceId', async (req: Request, res: Response) => {
  try {
    const { tenantId, resourceType, resourceId } = req.params;

    const ssrRequest = {
      tenantId,
      resourceType: resourceType as 'product' | 'category' | 'page',
      resourceId,
      query: req.query as Record<string, string>,
      headers: {
        'user-agent': req.get('user-agent') || '',
        'accept-language': req.get('accept-language') || '',
        cookie: req.get('cookie') || '',
      },
      context: {
        // Parse from headers/cookies if needed
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    };

    const result = await ssrRenderer.render(ssrRequest);

    // Set all headers
    Object.entries(result.headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    return res.status(result.statusCode).send(result.html);
  } catch (error: any) {
    logger.error('SSR GET error', { error: error.message, params: req.params });
    return res.status(500).json({ error: error.message });
  }
});

// Get SSR config
app.get('/ssr/config', (_req: Request, res: Response) => {
  return res.json({ config: ssrRenderer.getConfig() });
});

// Update SSR config
app.put('/ssr/config', (req: Request, res: Response) => {
  try {
    const config = SSRConfigSchema.parse(req.body);
    ssrRenderer.updateConfig(config);
    return res.json({ message: 'SSR config updated', config });
  } catch (error: any) {
    logger.error('SSR config update error', { error: error.message });
    return res.status(400).json({ error: error.message });
  }
});

// Clear SSR cache
app.post('/ssr/cache/clear', (_req: Request, res: Response) => {
  ssrRenderer.clearCache();
  return res.json({ message: 'SSR cache cleared' });
});

// Purge SSR cache by pattern
app.post('/ssr/cache/purge', (req: Request, res: Response) => {
  const { pattern } = req.body;
  if (!pattern || typeof pattern !== 'string') {
    return res.status(400).json({ error: 'Pattern required' });
  }

  const count = ssrRenderer.purgeCache(pattern);
  return res.json({ message: 'SSR cache purged', pattern, count });
});

const PORT = process.env.PORT || 3008;

app.listen(PORT, () => {
  logger.info(`Edge Service running on port ${PORT}`);
  logger.info('ISR enabled', { config: renderer.getISRConfig() });
  logger.info('SSR enabled', { config: ssrRenderer.getConfig() });
});

export default app;
