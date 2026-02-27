import { SSRRenderer } from '../ssr-renderer';
import { SSRRequest } from '../types';

describe('SSR Renderer', () => {
  let renderer: SSRRenderer;

  beforeEach(() => {
    renderer = new SSRRenderer();
  });

  describe('render', () => {
    it('should render HTML with dynamic data', async () => {
      const request: SSRRequest = {
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-123',
        context: {
          userId: 'user-456',
          userName: 'John Doe',
        },
      };

      const result = await renderer.render(request);

      expect(result.html).toBeDefined();
      expect(result.html).toContain('prod-123');
      expect(result.html).toContain('John Doe');
      expect(result.statusCode).toBe(200);
      expect(result.headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(result.headers['X-Render-Mode']).toBe('SSR');
      expect(result.renderTime).toBeGreaterThan(0);
    });

    it('should include user context in rendered HTML', async () => {
      const request: SSRRequest = {
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-123',
        context: {
          userId: 'user-789',
          userName: 'Jane Smith',
          preferences: { theme: 'dark' },
        },
      };

      const result = await renderer.render(request);

      expect(result.html).toContain('Jane Smith');
      expect(result.html).toContain('user-789');
    });

    it('should handle query parameters', async () => {
      const request: SSRRequest = {
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-123',
        query: {
          variant: 'premium',
          theme: 'dark',
        },
      };

      const result = await renderer.render(request);

      expect(result.html).toContain('premium');
      expect(result.html).toContain('dark');
    });

    it('should cache rendered pages when cache is enabled', async () => {
      const request: SSRRequest = {
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-123',
      };

      // First render - cache miss
      const result1 = await renderer.render(request);
      expect(result1.cached).toBe(false);
      expect(result1.headers['X-Cache']).toBe('MISS');

      // Second render - cache hit
      const result2 = await renderer.render(request);
      expect(result2.cached).toBe(true);
      expect(result2.headers['X-Cache']).toBe('HIT');
      expect(result2.renderTime).toBeLessThan(result1.renderTime);
    });

    it('should skip cache when skipCache context is set', async () => {
      const request: SSRRequest = {
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-123',
        context: { skipCache: true },
      };

      const result1 = await renderer.render(request);
      expect(result1.cached).toBe(false);

      const result2 = await renderer.render(request);
      expect(result2.cached).toBe(false);
    });
  });

  describe('config', () => {
    it('should update SSR config', () => {
      renderer.updateConfig({
        cacheEnabled: false,
        cacheTTL: 120,
      });

      const config = renderer.getConfig();
      expect(config.cacheEnabled).toBe(false);
      expect(config.cacheTTL).toBe(120);
    });

    it('should return current config', () => {
      const config = renderer.getConfig();
      expect(config.enabled).toBeDefined();
      expect(config.cacheEnabled).toBeDefined();
      expect(config.cacheTTL).toBeDefined();
    });
  });

  describe('cache management', () => {
    it('should clear all cache', async () => {
      const request: SSRRequest = {
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-123',
      };

      await renderer.render(request);
      const stats1 = renderer.getStats();
      expect(stats1.cachedPages).toBeGreaterThan(0);

      renderer.clearCache();
      const stats2 = renderer.getStats();
      expect(stats2.cachedPages).toBe(0);
    });

    it('should purge cache by pattern', async () => {
      await renderer.render({
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-1',
      });

      await renderer.render({
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-2',
      });

      await renderer.render({
        tenantId: 'tenant-2',
        resourceType: 'product',
        resourceId: 'prod-3',
      });

      const count = renderer.purgeCache('tenant-1');
      expect(count).toBe(2);

      const stats = renderer.getStats();
      expect(stats.cachedPages).toBe(1);
    });
  });

  describe('stats', () => {
    it('should track SSR statistics', async () => {
      const request: SSRRequest = {
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-123',
      };

      await renderer.render(request);
      await renderer.render(request); // cache hit

      const stats = renderer.getStats();
      expect(stats.totalSSRRequests).toBe(2);
      expect(stats.cacheHitRate).toBe('50.00%');
      expect(stats.averageRenderTime).toBeGreaterThan(0);
      expect(stats.cachedPages).toBeGreaterThan(0);
    });
  });

  describe('personalized caching', () => {
    it('should cache per user when personalizedCaching is enabled', async () => {
      const request1: SSRRequest = {
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-123',
        context: { userId: 'user-1' },
      };

      const request2: SSRRequest = {
        tenantId: 'tenant-1',
        resourceType: 'product',
        resourceId: 'prod-123',
        context: { userId: 'user-2' },
      };

      await renderer.render(request1); // Cache for user-1
      const result2 = await renderer.render(request2); // Different user, no cache

      expect(result2.cached).toBe(false); // Different user = different cache key
    });
  });
});
