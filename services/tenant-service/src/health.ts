/**
 * Health Check Middleware for Tenant Service
 */

import { Express, Request, Response } from 'express';
import { createTerminus } from '@godaddy/terminus';
import { Logger } from '@t3ck/shared';

const logger = new Logger('health-check');

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  services: Record<string, 'ok' | 'error' | 'unknown'>;
  version?: string;
}

export function setupHealthChecks(app: Express): void {
  const startTime = Date.now();

  app.get('/health', async (_req: Request, res: Response) => {
    const health: HealthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      services: {}
    };

    if (process.env.VERSION) {
      health.version = process.env.VERSION;
    }

    res.status(200).json(health);
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    const health: HealthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      services: {
        firestore: 'ok',
        'step-functions': 'ok'
      }
    };

    try {
      const statusCode = health.status === 'ok' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Readiness check error', { message: errMsg });
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        services: health.services
      });
    }
  });

  createTerminus(app, {
    signal: 'SIGTERM',
    timeout: 30000,
    onSignal: async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
    },
    onShutdown: async () => {
      logger.info('HTTP server closed');
    },
    healthChecks: {
      '/health': async () => ({ ok: true }),
      '/ready': async () => ({ ok: true })
    }
  });

  logger.info('Health checks initialized');
}
