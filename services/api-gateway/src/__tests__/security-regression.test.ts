import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rate-limit';

describe('Security Regression Tests', () => {
  it('rejects expired JWT token', async () => {
    const app = express();
    app.get('/secure', authenticate, (_req, res) => res.json({ ok: true }));

    const expired = jwt.sign(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        email: 'user@test.com',
        roles: ['user'],
      },
      'dev-secret-key',
      { expiresIn: -1 }
    );

    const response = await request(app).get('/secure').set('Authorization', `Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Token expired');
  });

  it('enforces rate limiting under burst requests', async () => {
    const app = express();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, message: 'Burst blocked' });
    app.use('/limited', limiter);
    app.get('/limited', (_req, res) => res.json({ ok: true }));

    const responses = await Promise.all([
      request(app).get('/limited'),
      request(app).get('/limited'),
      request(app).get('/limited'),
      request(app).get('/limited'),
    ]);

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
  });
});
