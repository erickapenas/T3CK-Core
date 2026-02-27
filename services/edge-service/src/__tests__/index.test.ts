import request from 'supertest';
import app from '../index';
import { EdgeRenderer } from '../edge-renderer';

jest.mock('../edge-renderer');

describe('Edge Service API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy', service: 'edge-service' });
    });
  });

  describe('POST /prerender', () => {
    it('should initiate pre-render job', async () => {
      const mockJobId = 'job-123';
      (EdgeRenderer.prototype.preRender as jest.Mock).mockResolvedValue(mockJobId);

      const response = await request(app)
        .post('/prerender')
        .send({
          url: 'https://example.com',
          tenantId: 'tenant-1',
          resourceType: 'product',
          resourceId: 'prod-1',
        });

      expect(response.status).toBe(200);
      expect(response.body.jobId).toBe(mockJobId);
      expect(response.body.status).toBe('pending');
    });
  });

  describe('GET /stats', () => {
    it('should return edge stats', async () => {
      const mockStats = {
        totalRequests: 100,
        cacheHits: 80,
        cacheMisses: 20,
        cacheHitRate: '80%',
      };

      (EdgeRenderer.prototype.getStats as jest.Mock).mockReturnValue(mockStats);

      const response = await request(app).get('/stats');
      expect(response.status).toBe(200);
      expect(response.body.stats).toBeDefined();
    });
  });

  describe('GET /isr/config', () => {
    it('should return ISR configuration', async () => {
      const mockConfig = {
        enabled: true,
        revalidateInterval: 3600,
        staleWhileRevalidate: true,
      };

      (EdgeRenderer.prototype.getISRConfig as jest.Mock).mockReturnValue(mockConfig);

      const response = await request(app).get('/isr/config');
      expect(response.status).toBe(200);
      expect(response.body.config).toBeDefined();
    });
  });

  describe('POST /cache/clear', () => {
    it('should clear the cache', async () => {
      const response = await request(app).post('/cache/clear');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Cache cleared');
    });
  });
});
