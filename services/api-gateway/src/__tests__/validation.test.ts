import { validate, detectSqlInjection, sanitizeInput } from '../middleware/validation';
import { z } from 'zod';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

describe('Validation Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('validate', () => {
    it('should validate request body', async () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().min(18),
      });

      app.post('/test', validate({ body: schema }), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).post('/test').send({ name: 'John', age: 25 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject invalid request body', async () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().min(18),
      });

      app.post('/test', validate({ body: schema }), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).post('/test').send({ name: 'Jo', age: 15 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });
  });

  describe('detectSqlInjection', () => {
    beforeEach(() => {
      app.use(detectSqlInjection);
    });

    it('should block SQL injection in query parameters', async () => {
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test').query({ search: "'; DROP TABLE users; --" });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid input detected');
    });

    it('should allow legitimate queries', async () => {
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test').query({ search: 'legitimate search' });

      expect(response.status).toBe(200);
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize dangerous characters', async () => {
      app.use(sanitizeInput);
      app.post('/test', (req, res) => {
        res.json({ input: req.body.text });
      });

      const response = await request(app)
        .post('/test')
        .send({ text: '<script>alert("xss")</script>' });

      expect(response.status).toBe(200);
      expect(response.body.input).not.toContain('<script>');
    });
  });
});
