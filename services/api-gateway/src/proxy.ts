import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import { Request, Response } from 'express';
import { ServiceRoute } from './types';
import { Logger } from '@t3ck/shared';

const logger = new Logger('ProxyMiddleware');

/**
 * Create proxy for a service
 */
export const createServiceProxy = (service: ServiceRoute): RequestHandler => {
  return createProxyMiddleware({
    target: service.target,
    changeOrigin: true,
    pathRewrite: (path) => {
      const basePath = (service.upstreamBasePath || '').replace(/\/$/, '');
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const withoutPrefix = normalizedPath.startsWith(service.prefix)
        ? normalizedPath.slice(service.prefix.length) || '/'
        : normalizedPath;
      const rewritten = `${basePath}${withoutPrefix}` || '/';
      logger.debug('Path rewrite', {
        original: path,
        withoutPrefix,
        rewritten,
        service: service.prefix,
        upstreamBasePath: service.upstreamBasePath,
      });
      return rewritten || '/';
    },
    
    // Forward headers
    onProxyReq: (proxyReq, req: Request) => {
      // Forward all custom headers
      if (req.headers['x-request-id']) {
        proxyReq.setHeader('X-Request-ID', req.headers['x-request-id']);
      }
      if (req.headers['x-tenant-id']) {
        proxyReq.setHeader('X-Tenant-ID', req.headers['x-tenant-id']);
      }
      if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
      }

      const requestWithBody = req as Request & { body?: unknown };
      const method = req.method.toUpperCase();
      const hasBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
      if (hasBodyMethod && requestWithBody.body && typeof requestWithBody.body === 'object') {
        const bodyData = JSON.stringify(requestWithBody.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }

      logger.debug('Proxying request', {
        method: req.method,
        originalUrl: req.url,
        target: service.target,
        tenantId: req.headers['x-tenant-id'] as string,
      });
    },

    // Handle response
    onProxyRes: (proxyRes, req: Request) => {
      logger.debug('Proxy response', {
        statusCode: proxyRes.statusCode,
        url: req.url,
        service: service.prefix,
      });
    },

    // Error handling
    onError: (err, req: Request, res: Response) => {
      logger.error('Proxy error', {
        error: err.message,
        service: service.prefix,
        url: req.url,
        target: service.target,
      });

      if (!res.headersSent) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Service unavailable',
          service: service.prefix,
        });
      }
    },

    // Timeout configuration
    proxyTimeout: 30000, // 30 seconds
    timeout: 30000,

    // WebSocket support
    ws: true,

    // Follow redirects
    followRedirects: true,

    // Log level
    logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
  });
};

/**
 * Health Check Proxy
 * Routes health check requests to backend services
 */
export const createHealthCheckProxy = (serviceName: string, target: string): RequestHandler => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { '^/health': '/health' },
    onError: (err, _req, res) => {
      logger.error(`Health check failed for ${serviceName}`, {
        error: err.message,
        target,
      });

      if (!res.headersSent) {
        res.status(503).json({
          error: 'Service Unavailable',
          service: serviceName,
          healthy: false,
        });
      }
    },
  });
};
