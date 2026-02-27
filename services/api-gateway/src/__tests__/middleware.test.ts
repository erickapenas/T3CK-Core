import request from 'supertest';
import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import jwt from 'jsonwebtoken';

describe('Authentication Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('authenticate', () => {
    it('should reject requests without Authorization header', async () => {
      app.get('/test', authenticate, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject invalid tokens', async () => {
      app.get('/test', authenticate, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid token');
    });

    it('should accept valid JWT tokens', async () => {
      const payload = {
        tenantId: 'tenant-123',
        userId: 'user-456',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = jwt.sign(payload, 'dev-secret-key', { expiresIn: '1h' });

      app.get('/test', authenticate, (req: any, res) => {
        res.json({ user: req.user });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user.userId).toBe('user-456');
    });
  });

  describe('requireRole', () => {
    it('should reject users without required role', async () => {
      const payload = {
        tenantId: 'tenant-123',
        userId: 'user-456',
        email: 'test@example.com',
        roles: ['user'],
      };

      const token = jwt.sign(payload, 'dev-secret-key', { expiresIn: '1h' });

      app.get('/test', authenticate, requireRole('admin'), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    it('should accept users with required role', async () => {
      const payload = {
        tenantId: 'tenant-123',
        userId: 'user-456',
        email: 'test@example.com',
        roles: ['admin'],
      };

      const token = jwt.sign(payload, 'dev-secret-key', { expiresIn: '1h' });

      app.get('/test', authenticate, requireRole('admin'), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
