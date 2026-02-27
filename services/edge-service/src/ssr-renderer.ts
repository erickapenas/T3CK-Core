import { SSRRequest, SSRResponse, SSRConfig, SSRStats, PreRenderedPage } from './types';
import { Logger } from '@t3ck/shared';
import axios from 'axios';

const logger = new Logger('ssr-renderer');

export class SSRRenderer {
  private cache = new Map<string, PreRenderedPage>();
  private config: SSRConfig = {
    enabled: true,
    cacheEnabled: true,
    cacheTTL: 60, // 1 minute default
    maxCacheSize: 50, // MB
    personalizedCaching: true,
  };

  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalRenderTime: 0,
  };

  async render(request: SSRRequest): Promise<SSRResponse> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    const cacheKey = this.getCacheKey(request);

    // Check cache if enabled
    if (this.config.cacheEnabled && !request.context?.skipCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        logger.debug('SSR cache hit', { cacheKey });

        return {
          html: cached.html,
          statusCode: cached.statusCode,
          headers: {
            ...cached.headers,
            'X-Cache': 'HIT',
            'X-Cache-Age': `${Math.floor((Date.now() - cached.generatedAt) / 1000)}s`,
          },
          renderTime: Date.now() - startTime,
          cached: true,
        };
      }
    }

    this.stats.cacheMisses++;

    // Server-side render
    try {
      const html = await this.renderSSR(request);
      const renderTime = Date.now() - startTime;

      this.stats.totalRenderTime += renderTime;

      const response: SSRResponse = {
        html,
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Render-Mode': 'SSR',
          'X-Render-Time': `${renderTime}ms`,
          'X-Cache': 'MISS',
          'Cache-Control': this.config.cacheEnabled 
            ? `private, max-age=${this.config.cacheTTL}` 
            : 'no-cache, no-store, must-revalidate',
        },
        renderTime,
        cached: false,
      };

      // Cache if enabled
      if (this.config.cacheEnabled) {
        this.addToCache(cacheKey, {
          html,
          headers: response.headers,
          statusCode: 200,
          generatedAt: Date.now(),
          expiresAt: Date.now() + this.config.cacheTTL * 1000,
          hits: 0,
        });
      }

      logger.info('SSR completed', {
        tenantId: request.tenantId,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        renderTime: `${renderTime}ms`,
        cached: false,
      });

      return response;
    } catch (error: any) {
      logger.error('SSR failed', {
        error: error.message,
        request,
      });

      // Return error page
      return {
        html: this.renderErrorPage(error.message),
        statusCode: 500,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Render-Mode': 'SSR-ERROR',
        },
        renderTime: Date.now() - startTime,
        cached: false,
      };
    }
  }

  private async renderSSR(request: SSRRequest): Promise<string> {
    // Fetch fresh data from backend services
    const data = await this.fetchResourceData(request);

    // Render HTML with dynamic data
    const html = this.renderTemplate(request, data);

    return html;
  }

  private async fetchResourceData(request: SSRRequest): Promise<any> {
    const { tenantId, resourceType, resourceId, headers } = request;

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
        headers: {
          'X-Tenant-ID': tenantId,
          ...headers,
        },
        timeout: 3000, // Faster timeout for SSR
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to fetch resource data for SSR', {
        tenantId,
        resourceType,
        resourceId,
        error: error.message,
      });

      // Return mock data for development
      return {
        id: resourceId,
        type: resourceType,
        title: `${resourceType} ${resourceId}`,
        description: 'Dynamic SSR content',
        timestamp: Date.now(),
      };
    }
  }

  private renderTemplate(request: SSRRequest, data: any): string {
    const { tenantId, resourceType, resourceId, context, query } = request;
    const title = data.title || data.name || 'SSR Page';
    const description = data.description || 'Server-side rendered page';

    // User context (if available)
    const userName = context?.userName || 'Guest';
    const userId = context?.userId || 'anonymous';
    const isAuthenticated = !!context?.userId;

    // Query params
    const variant = query?.variant || 'default';
    const theme = query?.theme || 'light';

    return `<!DOCTYPE html>
<html lang="en" data-theme="${this.escapeHtml(theme)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)} | T3CK SSR</title>
  <meta name="description" content="${this.escapeHtml(description)}">
  <meta name="rendered-at" content="${new Date().toISOString()}">
  <meta name="render-mode" content="SSR">
  
  <!-- SEO Meta Tags -->
  <meta property="og:title" content="${this.escapeHtml(title)}">
  <meta property="og:description" content="${this.escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${this.escapeHtml(title)}">
  <meta name="twitter:description" content="${this.escapeHtml(description)}">
  
  <style>
    :root {
      --primary: #2563eb;
      --bg: #ffffff;
      --text: #1f2937;
    }
    [data-theme="dark"] {
      --bg: #1f2937;
      --text: #f9fafb;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 20px;
      transition: background 0.3s, color 0.3s;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: var(--primary);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .user-info {
      background: rgba(255,255,255,0.1);
      padding: 10px;
      border-radius: 4px;
      margin-top: 10px;
      font-size: 14px;
    }
    .content {
      background: rgba(0,0,0,0.05);
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .meta {
      color: #666;
      font-size: 14px;
      margin: 10px 0;
    }
    .data-preview {
      background: rgba(0,0,0,0.1);
      padding: 15px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      overflow: auto;
    }
    .badge {
      display: inline-block;
      background: var(--primary);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin: 0 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🚀 ${this.escapeHtml(title)}</h1>
      <div class="user-info">
        <strong>${isAuthenticated ? '🔐' : '👤'} User:</strong> ${this.escapeHtml(userName)} 
        ${isAuthenticated ? '<span class="badge">Authenticated</span>' : '<span class="badge">Guest</span>'}
        <br>
        <strong>🆔 User ID:</strong> ${this.escapeHtml(userId)}
      </div>
    </header>
    
    <div class="content">
      <h2>${this.escapeHtml(description)}</h2>
      <div class="meta">
        <span class="badge">Tenant: ${this.escapeHtml(tenantId)}</span>
        <span class="badge">Type: ${resourceType}</span>
        <span class="badge">ID: ${resourceId}</span>
        <span class="badge">Variant: ${this.escapeHtml(variant)}</span>
        <span class="badge">Rendered: ${new Date().toLocaleTimeString()}</span>
      </div>
      
      <h3>📦 Dynamic Data (Server-Side Rendered)</h3>
      <div class="data-preview">
        ${this.escapeHtml(JSON.stringify(data, null, 2))}
      </div>
      
      <h3>👤 User Context (Personalized)</h3>
      <div class="data-preview">
        ${this.escapeHtml(JSON.stringify(context || { note: 'No user context provided' }, null, 2))}
      </div>
      
      <h3>🔗 Query Parameters</h3>
      <div class="data-preview">
        ${this.escapeHtml(JSON.stringify(query || {}, null, 2))}
      </div>
    </div>
    
    <footer style="text-align: center; color: #666; padding: 20px;">
      <p>⚡ Powered by T3CK Edge SSR | Generated at ${new Date().toISOString()}</p>
      <p style="font-size: 12px; margin-top: 10px;">
        This page was rendered on the server in real-time with fresh data
      </p>
    </footer>
  </div>
  
  <script>
    console.log('SSR Page Loaded');
    console.log('Resource:', ${JSON.stringify(data)});
    console.log('User Context:', ${JSON.stringify(context || {})});
    console.log('Rendered at:', '${new Date().toISOString()}');
    
    // Hydration point - client-side JavaScript can take over here
    document.body.classList.add('ssr-hydrated');
  </script>
</body>
</html>`;
  }

  private renderErrorPage(error: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - SSR</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f3f4f6;
    }
    .error {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      max-width: 600px;
      text-align: center;
    }
    h1 { color: #ef4444; margin-bottom: 20px; }
    p { color: #6b7280; line-height: 1.6; }
    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="error">
    <h1>⚠️ SSR Error</h1>
    <p>The server encountered an error while rendering this page.</p>
    <p><code>${this.escapeHtml(error)}</code></p>
    <p style="margin-top: 20px; font-size: 14px;">
      Please try again later or contact support if the problem persists.
    </p>
  </div>
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

  private getCacheKey(request: SSRRequest): string {
    const { tenantId, resourceType, resourceId, context, query } = request;

    // If personalized caching is enabled, include userId in cache key
    if (this.config.personalizedCaching && context?.userId) {
      return `ssr:${tenantId}:${resourceType}:${resourceId}:${context.userId}:${JSON.stringify(query || {})}`;
    }

    // Otherwise, cache globally per resource
    return `ssr:${tenantId}:${resourceType}:${resourceId}:${JSON.stringify(query || {})}`;
  }

  private getFromCache(key: string): PreRenderedPage | null {
    const page = this.cache.get(key);
    if (!page) return null;

    // Check if expired
    if (Date.now() > page.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    page.hits++;
    return page;
  }

  private addToCache(key: string, page: PreRenderedPage): void {
    // Simple size management
    const currentSize = this.getCacheSize();
    const maxSize = this.config.maxCacheSize * 1024 * 1024;

    if (currentSize + page.html.length > maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, page);
  }

  private getCacheSize(): number {
    let total = 0;
    for (const page of this.cache.values()) {
      total += page.html.length;
    }
    return total;
  }

  private evictLRU(): void {
    let oldest: { key: string; timestamp: number } | null = null;

    for (const [key, page] of this.cache.entries()) {
      if (!oldest || page.generatedAt < oldest.timestamp) {
        oldest = { key, timestamp: page.generatedAt };
      }
    }

    if (oldest) {
      this.cache.delete(oldest.key);
      logger.debug('SSR cache entry evicted', { key: oldest.key });
    }
  }

  updateConfig(config: Partial<SSRConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('SSR config updated', {
      enabled: this.config.enabled,
      cacheEnabled: this.config.cacheEnabled,
      cacheTTL: this.config.cacheTTL,
    });
  }

  getConfig(): SSRConfig {
    return { ...this.config };
  }

  getStats(): SSRStats {
    return {
      totalSSRRequests: this.stats.totalRequests,
      averageRenderTime: this.stats.totalRequests > 0
        ? Math.round(this.stats.totalRenderTime / this.stats.totalRequests)
        : 0,
      cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
        ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2) + '%'
        : '0%',
      cachedPages: this.cache.size,
    };
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('SSR cache cleared');
  }

  purgeCache(pattern: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    logger.info('SSR cache purged', { pattern, count });
    return count;
  }
}
