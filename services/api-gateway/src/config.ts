import { GatewayConfig } from './types';

export const config: GatewayConfig = {
  port: parseInt(String(process.env.API_GATEWAY_PORT || process.env.PORT || '3000'), 10),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key',
  jwtPublicKey: process.env.JWT_PUBLIC_KEY,
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  enableCsrf: process.env.ENABLE_CSRF !== 'false', // enabled by default
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5174',
    'http://localhost:5175',
  ],

  services: [
    {
      prefix: '/api/v1/auth',
      target: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
      upstreamBasePath: '/auth',
      version: 'v1',
      requiresAuth: false,
    },
    {
      prefix: '/api/v1/webhooks',
      target: process.env.WEBHOOK_SERVICE_URL || 'http://localhost:3002',
      upstreamBasePath: '/api/webhooks',
      version: 'v1',
      requiresAuth: true,
    },
    {
      prefix: '/api/v1/provisioning',
      target: process.env.TENANT_SERVICE_URL || 'http://localhost:3003',
      upstreamBasePath: '/provisioning',
      version: 'v1',
      requiresAuth: false,
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
      },
    },
    {
      prefix: '/api/v1/products',
      target: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3004',
      upstreamBasePath: '/api/products',
      version: 'v1',
      requiresAuth: true,
    },
    {
      prefix: '/api/v1/orders',
      target: process.env.ORDER_SERVICE_URL || 'http://localhost:3011',
      upstreamBasePath: '/orders',
      version: 'v1',
      requiresAuth: true,
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 120,
      },
    },
    {
      prefix: '/api/v1/shipping',
      target: process.env.SHIPPING_SERVICE_URL || 'http://localhost:3012',
      upstreamBasePath: '/shipping',
      version: 'v1',
      requiresAuth: true,
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 120,
      },
    },
    {
      prefix: '/api/v1/payments',
      target: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3010',
      upstreamBasePath: '/payments',
      version: 'v1',
      requiresAuth: true,
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 60,
      },
    },
    {
      prefix: '/api/v1/admin',
      target: process.env.ADMIN_SERVICE_URL || 'http://localhost:3006',
      upstreamBasePath: '/api/admin',
      version: 'v1',
      requiresAuth: false,
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 1000,
      },
    },
    {
      prefix: '/api/v1/media',
      target: process.env.MEDIA_SERVICE_URL || 'http://localhost:3007',
      version: 'v1',
      requiresAuth: false, // Public for CDN
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        max: 100,
      },
    },
    {
      prefix: '/api/v1/edge',
      target: process.env.EDGE_SERVICE_URL || 'http://localhost:3008',
      version: 'v1',
      requiresAuth: false, // Public for SSG/ISR/SSR
      rateLimit: {
        windowMs: 60 * 1000,
        max: 200,
      },
    },
  ],
};
