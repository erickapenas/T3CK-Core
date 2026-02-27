import express, { Request, Response } from 'express';
import request from 'supertest';
import { sanitizeInput, detectSqlInjection } from '../middleware/validation';

describe('OWASP Top 10 validation', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(sanitizeInput);
    app.use(detectSqlInjection);
  });

  it('blocks SQL injection payloads (A03 Injection)', async () => {
    app.get('/search', (_req: Request, res: Response) => res.json({ ok: true }));

    const response = await request(app)
      .get('/search')
      .query({ q: "' OR 1=1; DROP TABLE users; --" });

    expect(response.status).toBe(400);
  });

  it('sanitizes XSS payloads (A03 Injection / A07 Identification concerns)', async () => {
    app.post('/comment', (req: Request, res: Response) => res.json({ text: req.body.text }));

    const response = await request(app)
      .post('/comment')
      .send({ text: '<script>alert(1)</script>hello' });

    expect(response.status).toBe(200);
    expect(response.body.text).not.toContain('<script>');
    expect(response.body.text).toContain('hello');
  });
});