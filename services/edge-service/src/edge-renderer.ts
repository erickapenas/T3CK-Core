import axios from 'axios';
import { PreRenderConfig, PreRenderedPage, ISRConfig, PreRenderJob } from './types';
import { Logger } from '@t3ck/shared';

const logger = new Logger('edge-renderer');

export class EdgeRenderer {
  private cache = new Map<string, PreRenderedPage>();
  private jobs = new Map<string, PreRenderJob>();
  private isrConfig: ISRConfig = {
    enabled: true,
    revalidateInterval: 3600, // 1 hour
    staleWhileRevalidate: true,
  };

  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalGenerationTime: 0,
  };

  async render(tenantId: string, resourceType: string, resourceId: string, force = false): Promise<PreRenderedPage> {
    const cacheKey = this.getCacheKey(tenantId, resourceType, resourceId);
    this.stats.totalRequests++;

    // Check cache
    if (!force) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        cached.hits++;
        logger.debug('Cache hit for page', { cacheKey, hits: cached.hits });

        // ISR: Revalidate in background if stale
        if (this.shouldRevalidate(cached)) {
          this.revalidateInBackground(cacheKey, tenantId, resourceType, resourceId);
        }

        return cached;
      }
    }

    this.stats.cacheMisses++;

    // Generate page
    const startTime = Date.now();
    const page = await this.generatePage(tenantId, resourceType, resourceId);
    const generationTime = Date.now() - startTime;

    this.stats.totalGenerationTime += generationTime;

    // Cache it
    this.addToCache(cacheKey, page);

    logger.info('Page generated', {
      cacheKey,
      generationTime: `${generationTime}ms`,
      size: page.html.length,
    });

    return page;
  }

  async preRender(config: PreRenderConfig): Promise<string> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const job: PreRenderJob = {
      id: jobId,
      config,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.jobs.set(jobId, job);

    // Process async
    this.processPreRenderJob(job).catch((error) => {
      logger.error('PreRender job failed', { jobId, error: error.message });
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = Date.now();
    });

    return jobId;
  }

  async batchPreRender(configs: PreRenderConfig[]): Promise<string[]> {
    const jobIds: string[] = [];

    for (const config of configs) {
      const jobId = await this.preRender(config);
      jobIds.push(jobId);
    }

    logger.info('Batch pre-render initiated', { count: configs.length, jobIds });
    return jobIds;
  }

  private async processPreRenderJob(job: PreRenderJob): Promise<void> {
    job.status = 'processing';

    try {
      const { tenantId, resourceType, resourceId } = job.config;
      await this.render(tenantId, resourceType, resourceId, true);

      job.status = 'completed';
      job.completedAt = Date.now();

      logger.info('PreRender job completed', { 
        jobId: job.id, 
        duration: job.completedAt - job.createdAt 
      });
    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = Date.now();
      throw error;
    }
  }

  private async generatePage(tenantId: string, resourceType: string, resourceId: string): Promise<PreRenderedPage> {
    // Fetch data from backend services
    const data = await this.fetchResourceData(tenantId, resourceType, resourceId);

    // Generate HTML (simple template for now)
    const html = this.renderTemplate(resourceType, data);

    const ttl = 3600; // 1 hour
    const now = Date.now();

    return {
      html,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
        'X-Tenant-ID': tenantId,
        'X-Resource-Type': resourceType,
        'X-Resource-ID': resourceId,
        'X-Generated-At': new Date(now).toISOString(),
      },
      statusCode: 200,
      generatedAt: now,
      expiresAt: now + ttl * 1000,
      hits: 0,
    };
  }

  private async fetchResourceData(tenantId: string, resourceType: string, resourceId: string): Promise<any> {
    // Mock: In production, call actual services
    const serviceUrls: Record<string, string> = {
      product: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3001',
      category: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3001',
      page: process.env.CONTENT_SERVICE_URL || 'http://localhost:3009',
    };

    const baseUrl = serviceUrls[resourceType];
    if (!baseUrl) {
      throw new Error(`Unknown resource type: ${resourceType}`);
    }

    try {
      const response = await axios.get(`${baseUrl}/api/${resourceType}s/${resourceId}`, {
        headers: { 'X-Tenant-ID': tenantId },
        timeout: 5000,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to fetch resource data', { 
        tenantId, 
        resourceType, 
        resourceId, 
        error: error.message 
      });

      // Return mock data for development
      return {
        id: resourceId,
        type: resourceType,
        title: `Mock ${resourceType} ${resourceId}`,
        description: 'Pre-rendered content',
      };
    }
  }

  private renderTemplate(resourceType: string, data: any): string {
    // Simple HTML template (in production, use proper templating engine)
    const title = data.title || data.name || 'T3CK Page';
    const description = data.description || 'Pre-rendered page';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <meta name="description" content="${this.escapeHtml(description)}">
  <meta property="og:title" content="${this.escapeHtml(title)}">
  <meta property="og:description" content="${this.escapeHtml(description)}">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #333; }
    .meta { color: #666; font-size: 14px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${this.escapeHtml(title)}</h1>
    <div class="meta">Type: ${resourceType} | ID: ${data.id}</div>
    <p>${this.escapeHtml(description)}</p>
    <pre>${JSON.stringify(data, null, 2)}</pre>
  </div>
  <script>
    console.log('Pre-rendered page loaded');
    console.log('Resource:', ${JSON.stringify(data)});
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  private getCacheKey(tenantId: string, resourceType: string, resourceId: string): string {
    return `${tenantId}:${resourceType}:${resourceId}`;
  }

  private getFromCache(key: string): PreRenderedPage | null {
    const page = this.cache.get(key);
    if (!page) return null;

    // Check if expired
    if (Date.now() > page.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return page;
  }

  private addToCache(key: string, page: PreRenderedPage): void {
    this.cache.set(key, page);
  }

  private shouldRevalidate(page: PreRenderedPage): boolean {
    if (!this.isrConfig.enabled || !this.isrConfig.staleWhileRevalidate) {
      return false;
    }

    const age = Date.now() - page.generatedAt;
    const revalidateThreshold = this.isrConfig.revalidateInterval * 1000;

    return age > revalidateThreshold;
  }

  private revalidateInBackground(cacheKey: string, tenantId: string, resourceType: string, resourceId: string): void {
    logger.debug('Revalidating page in background', { cacheKey });

    // Non-blocking revalidation
    this.generatePage(tenantId, resourceType, resourceId)
      .then((page) => {
        this.addToCache(cacheKey, page);
        logger.info('Background revalidation completed', { cacheKey });
      })
      .catch((error) => {
        logger.error('Background revalidation failed', { cacheKey, error: error.message });
      });
  }

  getJob(jobId: string): PreRenderJob | undefined {
    return this.jobs.get(jobId);
  }

  getJobs(): PreRenderJob[] {
    return Array.from(this.jobs.values());
  }

  updateISRConfig(config: ISRConfig): void {
    this.isrConfig = config;
    logger.info('ISR config updated', { enabled: config.enabled, revalidateInterval: config.revalidateInterval });
  }

  getISRConfig(): ISRConfig {
    return this.isrConfig;
  }

  getStats() {
    return {
      totalRequests: this.stats.totalRequests,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
        ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2) + '%'
        : '0%',
      averageGenerationTime: this.stats.cacheMisses > 0
        ? Math.round(this.stats.totalGenerationTime / this.stats.cacheMisses)
        : 0,
      preRenderedPages: this.cache.size,
      totalJobs: this.jobs.size,
      completedJobs: Array.from(this.jobs.values()).filter(j => j.status === 'completed').length,
      failedJobs: Array.from(this.jobs.values()).filter(j => j.status === 'failed').length,
    };
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  purgeResource(tenantId: string, resourceType: string, resourceId: string): boolean {
    const cacheKey = this.getCacheKey(tenantId, resourceType, resourceId);
    const deleted = this.cache.delete(cacheKey);
    if (deleted) {
      logger.info('Resource purged from cache', { cacheKey });
    }
    return deleted;
  }
}
