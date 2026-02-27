import request from 'supertest';
import app from '../index';
import { MediaTransformer } from '../media-transformer';

// Mock the transformer
jest.mock('../media-transformer');

describe('Media Service API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy', service: 'media-service' });
    });
  });

  describe('GET /presets', () => {
    it('should return available presets', async () => {
      const mockPresets = [
        { name: 'thumbnail', width: 150, height: 150, format: 'webp', quality: 80 },
      ];
      
      (MediaTransformer.prototype.getPresets as jest.Mock).mockReturnValue(mockPresets);

      const response = await request(app).get('/presets');
      expect(response.status).toBe(200);
      expect(response.body.presets).toBeDefined();
    });
  });

  describe('GET /stats', () => {
    it('should return transformation stats', async () => {
      const mockStats = {
        totalTransformations: 100,
        cacheHits: 50,
        cacheMisses: 50,
        cacheHitRate: '50%',
      };

      (MediaTransformer.prototype.getStats as jest.Mock).mockReturnValue(mockStats);

      const response = await request(app).get('/stats');
      expect(response.status).toBe(200);
      expect(response.body.stats).toBeDefined();
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
