import request from 'supertest';
import express from 'express';
import { authenticate, enforceTenantIsolation, requireRole } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { createHmac } from 'crypto';

function createAdminSessionToken(user: {
  id: string;
  tenantId: string;
  username: string;
  email: string;
  role: 'admin' | 'usuario';
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      user,
      expiresAt: Date.now() + 60 * 60 * 1000,
    })
  ).toString('base64url');
  const signature = createHmac('sha256', 'dev-admin-session-secret')
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

describe('Authentication Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('authenticate', () => {
    it('should reject requests without Authorization header', async () => {
      app.get('/test', authenticate, (_req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject invalid tokens', async () => {
      app.get('/test', authenticate, (_req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test').set('Authorization', 'Bearer invalid-token');

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

      const response = await request(app).get('/test').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user.userId).toBe('user-456');
    });

    it('should accept admin-service session tokens', async () => {
      const token = createAdminSessionToken({
        id: 'admin-1',
        tenantId: 'tenant-admin',
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
      });

      app.get('/test', authenticate, (req: any, res) => {
        res.json({ user: req.user });
      });

      const response = await request(app).get('/test').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user.userId).toBe('admin-1');
      expect(response.body.user.roles).toContain('admin');
    });
  });

  describe('enforceTenantIsolation', () => {
    it('should allow admin session users to select a tenant', async () => {
      const token = createAdminSessionToken({
        id: 'admin-1',
        tenantId: 'tenant-admin',
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
      });

      app.get('/test', authenticate, enforceTenantIsolation, (req: any, res) => {
        res.json({ tenantId: req.tenantId, headerTenant: req.headers['x-tenant-id'] });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', 'tenant-selected');

      expect(response.status).toBe(200);
      expect(response.body.tenantId).toBe('tenant-selected');
    });

    it('should block usuario session users from selecting another tenant', async () => {
      const token = createAdminSessionToken({
        id: 'user-1',
        tenantId: 'tenant-a',
        username: 'user',
        email: 'user@example.com',
        role: 'usuario',
      });

      app.get('/test', authenticate, enforceTenantIsolation, (_req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', 'tenant-b');

      expect(response.status).toBe(403);
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

      app.get('/test', authenticate, requireRole('admin'), (_req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test').set('Authorization', `Bearer ${token}`);

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

      app.get('/test', authenticate, requireRole('admin'), (_req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
