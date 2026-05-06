import axios, { AxiosRequestConfig } from 'axios';
import { Request, Response, Router } from 'express';
import { config } from './config';
import { authenticate, enforceTenantIsolation, requireRole } from './middleware/auth';
import { createRateLimiter } from './middleware/rate-limit';
import { createServiceProxy } from './proxy';
import { Logger } from '@t3ck/shared';
import { AuthPayload, ServiceRoute } from './types';

const logger = new Logger('Router');
const OVERVIEW_LIST_LIMIT = 20;

type ApiEnvelope<T> = {
  data?: T;
  success?: boolean;
  error?: string;
  message?: string;
};

const findService = (prefix: string): ServiceRoute => {
  const service = config.services.find((item) => item.prefix === prefix);
  if (!service) {
    throw new Error(`Service route not configured: ${prefix}`);
  }
  return service;
};

const buildUpstreamUrl = (service: ServiceRoute, path: string): string => {
  const basePath = (service.upstreamBasePath || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${service.target}${basePath}${normalizedPath}`;
};

const withOverviewPagination = (path: string): string => {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}page=1&limit=${OVERVIEW_LIST_LIMIT}`;
};

const forwardHeaders = (req: Request): AxiosRequestConfig => {
  const headers: Record<string, string> = {};
  const tenantId = req.headers['x-tenant-id'];
  const authenticatedRequest = req as Request & { user?: AuthPayload };

  if (typeof tenantId === 'string') {
    headers['X-Tenant-ID'] = tenantId;
  }

  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }

  if (typeof req.headers['x-request-id'] === 'string') {
    headers['X-Request-ID'] = req.headers['x-request-id'];
  }

  if (authenticatedRequest.user) {
    headers['X-User-ID'] = authenticatedRequest.user.userId;
    headers['X-User-Email'] = authenticatedRequest.user.email;
    headers['X-User-Roles'] = authenticatedRequest.user.roles.join(',');
  }

  if (process.env.INTERNAL_SERVICE_TOKEN) {
    headers['X-Internal-Service-Token'] = process.env.INTERNAL_SERVICE_TOKEN;
  }

  return { headers, timeout: 30000 };
};

const fetchData = async <T>(
  service: ServiceRoute,
  path: string,
  requestConfig: AxiosRequestConfig
): Promise<T> => {
  const response = await axios.get<ApiEnvelope<T> | T>(
    buildUpstreamUrl(service, path),
    requestConfig
  );
  const body = response.data;

  if (body && typeof body === 'object' && 'data' in body) {
    return (body as ApiEnvelope<T>).data as T;
  }

  return body as T;
};

const getAdminOverview = async (req: Request, res: Response): Promise<void> => {
  const adminService = findService('/api/v1/admin');
  const provisioningService = findService('/api/v1/provisioning');
  const requestConfig = forwardHeaders(req);

  try {
    const [
      dashboard,
      products,
      orders,
      customers,
      users,
      settings,
      tenantConfiguration,
      auditLogs,
      provisioningTenants,
    ] = await Promise.all([
      fetchData(adminService, '/dashboard', requestConfig),
      fetchData(adminService, withOverviewPagination('/products'), requestConfig),
      fetchData(adminService, withOverviewPagination('/orders'), requestConfig),
      fetchData(adminService, withOverviewPagination('/customers'), requestConfig),
      fetchData(adminService, withOverviewPagination('/users'), requestConfig),
      fetchData(adminService, '/settings', requestConfig),
      fetchData(adminService, '/tenant-config', requestConfig),
      fetchData(adminService, withOverviewPagination('/audit-logs'), requestConfig),
      fetchData(provisioningService, '/tenants', requestConfig),
    ]);

    res.json({
      data: {
        dashboard,
        products,
        orders,
        customers,
        users,
        settings,
        tenantConfiguration,
        auditLogs,
        provisioningTenants,
      },
    });
  } catch (error) {
    const message = (error as Error).message;
    logger.error('Failed to build admin overview', { error: message });
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Failed to build admin overview',
      details: message,
    });
  }
};

/**
 * Create router with versioning support
 */
export const createVersionedRouter = () => {
  const router = Router();

  // Health check endpoint (no auth required)
  router.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: 'v1',
      uptime: process.uptime(),
    });
  });

  // Metrics endpoint (no auth required in dev, require auth in prod)
  router.get('/metrics', (_req, res) => {
    // TODO: Return Prometheus metrics
    res.json({
      message: 'Metrics endpoint',
      // Will be implemented in metrics.ts
    });
  });

  // BFF endpoint for the admin dashboard shell.
  router.get(
    '/api/v1/admin/overview',
    authenticate,
    enforceTenantIsolation,
    requireRole('owner', 'admin', 'manager'),
    getAdminOverview
  );

  // Route each service
  config.services.forEach((service) => {
    logger.info(`Configuring route: ${service.prefix} -> ${service.target}`);

    const serviceRouter = Router();

    // Apply service-specific rate limiting
    if (service.rateLimit) {
      serviceRouter.use(createRateLimiter(service.rateLimit));
    }

    // Apply authentication if required
    if (service.requiresAuth) {
      serviceRouter.use(authenticate);
      serviceRouter.use(enforceTenantIsolation);
      if (service.requiredRoles?.length) {
        serviceRouter.use(requireRole(...service.requiredRoles));
      }
    }

    // Create proxy
    serviceRouter.use(createServiceProxy(service));

    // Mount service router
    router.use(service.prefix, serviceRouter);
  });

  // API version information
  router.get('/api/version', (_req, res) => {
    res.json({
      version: 'v1',
      services: config.services.map((s) => ({
        prefix: s.prefix,
        version: s.version,
        requiresAuth: s.requiresAuth,
      })),
    });
  });

  // 404 handler
  router.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.url} not found`,
      availableRoutes: config.services.map((s) => s.prefix),
    });
  });

  return router;
};

/**
 * Create backward compatible routes
 * Maps old API versions to new ones
 */
export const createBackwardCompatibleRoutes = () => {
  const router = Router();

  // Example: /api/auth -> /api/v1/auth
  // Add backward compatibility mappings as needed

  return router;
};
