/**
 * API Client Service for T3CK Core Admin Dashboard
 * Handles all API communication with the backend services
 *
 * API Gateway: http://localhost:3000
 * Service Endpoints:
 *   - Admin Service: /api/v1/admin (port 3006)
 *   - Product Service: /api/v1/products (port 3004)
 *   - Order Service: /api/v1/orders (port 3011)
 *   - Webhook Service: /api/v1/webhooks (port 3002)
 */

import {
  listTenantsFromFirestore,
  saveTenantToFirestore,
  listUsersFromFirestore,
  listProductsFromFirestore,
} from './tenant-storage';

const API_BASE = import.meta.env.VITE_GATEWAY_BASE_URL || 'http://localhost:3000';
const DEFAULT_TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-demo';

type RequestTarget = {
  baseUrl: string;
  path: string;
};

function normalizeResponseBody(body: any): any {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    return body.data;
  }

  return body;
}

function buildFallbackTargets(path: string): RequestTarget[] {
  const targets: RequestTarget[] = [];
  const addTarget = (baseUrl: string | undefined, rewrittenPath: string) => {
    if (baseUrl) {
      targets.push({ baseUrl, path: rewrittenPath });
    }
  };

  if (path.startsWith('/api/v1/admin/')) {
    addTarget(
      import.meta.env.VITE_ADMIN_SERVICE_URL || 'http://localhost:3006',
      path.replace(/^\/api\/v1\/admin/, '/api/admin')
    );
  } else if (path.startsWith('/api/v1/provisioning/')) {
    addTarget(
      import.meta.env.VITE_TENANT_SERVICE_URL || 'http://localhost:3003',
      path.replace(/^\/api\/v1\/provisioning/, '/provisioning')
    );
  } else if (path.startsWith('/api/v1/webhooks')) {
    addTarget(
      import.meta.env.VITE_WEBHOOK_SERVICE_URL || 'http://localhost:3002',
      path.replace(/^\/api\/v1\/webhooks/, '/api/webhooks')
    );
  } else if (path.startsWith('/api/v1/products')) {
    addTarget(
      import.meta.env.VITE_PRODUCT_SERVICE_URL || 'http://localhost:3004',
      path.replace(/^\/api\/v1\/products/, '/api/products')
    );
  } else if (path.startsWith('/api/v1/orders')) {
    addTarget(
      import.meta.env.VITE_ORDER_SERVICE_URL || 'http://localhost:3011',
      path.replace(/^\/api\/v1\/orders/, '/orders')
    );
  } else if (path.startsWith('/api/v1/shipping')) {
    addTarget(
      import.meta.env.VITE_SHIPPING_SERVICE_URL || 'http://localhost:3012',
      path.replace(/^\/api\/v1\/shipping/, '/shipping')
    );
  } else if (path.startsWith('/api/v1/payments')) {
    addTarget(
      import.meta.env.VITE_PAYMENT_SERVICE_URL || 'http://localhost:3010',
      path.replace(/^\/api\/v1\/payments/, '/payments')
    );
  }

  return targets;
}

function shouldPreferDirectService(path: string): boolean {
  return path.startsWith('/api/v1/admin/') || path.startsWith('/api/v1/provisioning/');
}

export type DashboardEntity =
  | 'tenants'
  | 'users'
  | 'products'
  | 'orders'
  | 'logging'
  | 'customers'
  | 'webhooks'
  | 'payments'
  | 'cache';

export function getEntityService(entity: DashboardEntity) {
  if (entity === 'logging') {
    return entityApi.logs;
  }

  return entityApi[entity as keyof typeof entityApi];
}

let csrfToken: string | null = null;
let gatewayUnavailable = false;

/**
 * Fetch CSRF token from gateway
 */
async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;

  try {
    const response = await fetch(`${API_BASE}/api/csrf-token`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies
    });

    if (response.ok) {
      const data = await response.json();
      csrfToken = data.token || data.csrfToken;
      return csrfToken || '';
    }
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
  }

  return '';
}

/**
 * Helper function to make API requests with common headers
 */
async function apiRequest(
  path: string,
  options: RequestInit = {},
  tenantId: string = DEFAULT_TENANT_ID
): Promise<any> {
  const method = options.method?.toUpperCase() || 'GET';
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const directTargets = buildFallbackTargets(path);
  const gatewayTarget = gatewayUnavailable ? [] : [{ baseUrl: API_BASE, path }];
  const requestTargets: RequestTarget[] = shouldPreferDirectService(path)
    ? [...directTargets, ...gatewayTarget]
    : [...gatewayTarget, ...directTargets];

  const uniqueTargets = requestTargets.filter(
    (target, index, all) =>
      all.findIndex(
        (candidate) => candidate.baseUrl === target.baseUrl && candidate.path === target.path
      ) === index
  );

  const startTime = performance.now();

  const parseErrorMessage = async (response: Response): Promise<string> => {
    try {
      const errorData = await response.json();
      if (errorData?.message) {
        return errorData.message;
      }
      if (errorData?.error) {
        return typeof errorData.error === 'string'
          ? errorData.error
          : JSON.stringify(errorData.error);
      }
    } catch {
      // Ignore JSON parse errors.
    }

    return `API Error: ${response.status} ${response.statusText}`;
  };

  try {
    let lastError: string | null = null;

    for (let index = 0; index < uniqueTargets.length; index += 1) {
      const target = uniqueTargets[index];
      const headers = new Headers(options.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('x-tenant-id', tenantId);

      if (isMutation && target.baseUrl === API_BASE) {
        const token = await getCsrfToken();
        if (token) {
          headers.set('X-CSRF-Token', token);
        }
      }

      try {
        const response = await fetch(new URL(target.path, target.baseUrl).toString(), {
          ...options,
          headers,
          credentials: 'include',
        });

        if (!response.ok) {
          const errorMessage = await parseErrorMessage(response);

          if (target.baseUrl === API_BASE && response.status === 403 && isMutation) {
            csrfToken = null;
            const retryToken = await getCsrfToken();
            if (retryToken) {
              headers.set('X-CSRF-Token', retryToken);
              const retryResponse = await fetch(new URL(target.path, target.baseUrl).toString(), {
                ...options,
                headers,
                credentials: 'include',
              });

              if (retryResponse.ok) {
                const retryBody = await retryResponse.json();
                const endTime = performance.now();
                return {
                  data: normalizeResponseBody(retryBody),
                  raw: retryBody,
                  responseTime: Math.round(endTime - startTime),
                  success: true,
                };
              }

              lastError = await parseErrorMessage(retryResponse);
            } else {
              lastError = errorMessage;
            }

            continue;
          }

          if (
            target.baseUrl === API_BASE &&
            (response.status === 502 ||
              response.status === 503 ||
              response.status === 504 ||
              response.status === 404)
          ) {
            gatewayUnavailable = true;
            lastError = errorMessage;
            continue;
          }

          throw new Error(errorMessage);
        }

        const body = await response.json();
        const endTime = performance.now();

        return {
          data: normalizeResponseBody(body),
          raw: body,
          responseTime: Math.round(endTime - startTime),
          success: true,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';

        if (target.baseUrl === API_BASE) {
          gatewayUnavailable = true;
        }

        if (index < uniqueTargets.length - 1) {
          continue;
        }

        throw error;
      }
    }

    throw new Error(lastError || 'Service unavailable');
  } catch (error) {
    const endTime = performance.now();
    const responseTime = Math.round(endTime - startTime);

    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
      success: false,
    };
  }
}

/**
 * Admin Dashboard API Client
 * Provides methods for dashboard data retrieval and CRUD operations
 */
export const dashboardApi = {
  /**
   * Get dashboard overview and metrics
   */
  getDashboard: async (tenantId?: string) => {
    return apiRequest('/api/v1/admin/dashboard', {}, tenantId);
  },

  /**
   * Get analytics and reporting data
   */
  getAnalytics: async (tenantId?: string) => {
    return apiRequest('/api/v1/admin/analytics', {}, tenantId);
  },

  /**
   * Get audit logs
   */
  getAuditLogs: async (limit = 50, tenantId?: string) => {
    return apiRequest(`/api/v1/admin/audit-logs?limit=${limit}`, {}, tenantId);
  },

  /**
   * Get API health and status
   * Uses analytics as fallback due to CORS issues with /health endpoint
   */
  getHealth: async (tenantId?: string) => {
    // Try to get health via analytics endpoint (works reliably)
    try {
      const result = await apiRequest('/api/v1/admin/analytics', {}, tenantId);
      if (result.success) {
        return {
          success: true,
          data: { status: 'healthy' },
          responseTime: result.responseTime,
        };
      }
    } catch (error) {
      console.error('Health check error:', error);
    }

    return {
      success: false,
      error: 'Health check unavailable',
      responseTime: 0,
    };
  },

  /**
   * Get system metrics and statistics
   */
  getMetrics: async () => {
    return apiRequest('/metrics', {});
  },
};

/**
 * Entity Management APIs
 */
export const entityApi = {
  /**
   * Products Entity
   */
  products: {
    list: async (tenantId?: string) => {
      return apiRequest('/api/v1/admin/products', {}, tenantId);
    },
    get: async (productId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/products/${productId}`, {}, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return apiRequest(
        '/api/v1/admin/products',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    update: async (productId: string, data: any, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/products/${productId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    delete: async (productId: string, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/products/${productId}`,
        {
          method: 'DELETE',
        },
        tenantId
      );
    },
  },

  /**
   * Orders Entity
   */
  orders: {
    list: async (tenantId?: string) => {
      return apiRequest('/api/v1/admin/orders', {}, tenantId);
    },
    get: async (orderId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/orders/${orderId}`, {}, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return apiRequest(
        '/api/v1/admin/orders',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    update: async (orderId: string, data: any, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/orders/${orderId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    delete: async (orderId: string, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/orders/${orderId}`,
        {
          method: 'DELETE',
        },
        tenantId
      );
    },
  },

  /**
   * Users Entity (Admin Users)
   */
  users: {
    list: async (tenantId?: string) => {
      return apiRequest('/api/v1/admin/users', {}, tenantId);
    },
    get: async (userId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/users/${userId}`, {}, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return apiRequest(
        '/api/v1/admin/users',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    update: async (userId: string, data: any, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/users/${userId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    delete: async (userId: string, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/users/${userId}`,
        {
          method: 'DELETE',
        },
        tenantId
      );
    },
  },

  /**
   * Customers Entity
   */
  customers: {
    list: async (tenantId?: string) => {
      return apiRequest('/api/v1/admin/customers', {}, tenantId);
    },
    get: async (customerId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/customers/${customerId}`, {}, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return apiRequest(
        '/api/v1/admin/customers',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    update: async (customerId: string, data: any, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/customers/${customerId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    delete: async (customerId: string, tenantId?: string) => {
      return apiRequest(
        `/api/v1/admin/customers/${customerId}`,
        {
          method: 'DELETE',
        },
        tenantId
      );
    },
  },

  /**
   * Webhooks Entity
   */
  webhooks: {
    list: async (tenantId?: string) => {
      return apiRequest('/api/v1/webhooks', {}, tenantId);
    },
    get: async (webhookId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/webhooks/${webhookId}`, {}, tenantId);
    },
    create: async (data: any, tenantId?: string) => {
      return apiRequest(
        '/api/v1/webhooks',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    update: async (webhookId: string, data: any, tenantId?: string) => {
      return apiRequest(
        `/api/v1/webhooks/${webhookId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
        tenantId
      );
    },
    delete: async (webhookId: string, tenantId?: string) => {
      return apiRequest(
        `/api/v1/webhooks/${webhookId}`,
        {
          method: 'DELETE',
        },
        tenantId
      );
    },
    getLogs: async (webhookId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/webhooks/${webhookId}/logs`, {}, tenantId);
    },
  },

  /**
   * Payments Entity
   */
  payments: {
    list: async (tenantId?: string) => {
      return apiRequest('/api/v1/payments', {}, tenantId);
    },
    get: async (paymentId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/payments/${paymentId}`, {}, tenantId);
    },
  },

  /**
   * Logs/Audit Logs Entity
   */
  logs: {
    list: async (limit = 100, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/audit-logs?limit=${limit}`, {}, tenantId);
    },
  },

  /**
   * Cache Entity (Stats only)
   */
  cache: {
    getStats: async (tenantId?: string) => {
      return apiRequest('/metrics', {}, tenantId);
    },
  },

  /**
   * Tenants Entity (multi-tenant data)
   */
  tenants: {
    list: async () => {
      const startTime = performance.now();

      try {
        const data = await listTenantsFromFirestore();
        return {
          data,
          raw: data,
          responseTime: Math.round(performance.now() - startTime),
          success: true,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Math.round(performance.now() - startTime),
          success: false,
        };
      }
    },
    create: async (data: any, tenantId?: string) => {
      const startTime = performance.now();

      try {
        const saved = await saveTenantToFirestore({
          ...data,
          id: data.id || data.tenantId || tenantId,
          tenantId: data.tenantId || tenantId,
        });

        return {
          data: saved,
          raw: { message: 'Tenant created in Firestore', tenant: saved },
          responseTime: Math.round(performance.now() - startTime),
          success: true,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Math.round(performance.now() - startTime),
          success: false,
        };
      }
    },
  },
};

/**
 * Settings and Configuration APIs
 */
export const settingsApi = {
  /**
   * Get tenant settings
   */
  getTenantConfig: async (tenantId?: string) => {
    return apiRequest('/api/v1/admin/tenant-config', {}, tenantId);
  },

  /**
   * Update tenant settings
   */
  updateTenantConfig: async (config: any, tenantId?: string) => {
    return apiRequest(
      '/api/v1/admin/tenant-config',
      {
        method: 'PUT',
        body: JSON.stringify(config),
      },
      tenantId
    );
  },

  /**
   * Get system settings
   */
  getSettings: async (tenantId?: string) => {
    return apiRequest('/api/v1/admin/settings', {}, tenantId);
  },

  /**
   * Update system settings
   */
  updateSettings: async (settings: any, tenantId?: string) => {
    return apiRequest(
      '/api/v1/admin/settings',
      {
        method: 'PUT',
        body: JSON.stringify(settings),
      },
      tenantId
    );
  },
};

/**
 * Entity count helper - fetches count for each entity type
 * Only fetches endpoints that don't require special authentication
 */
export async function getEntityCounts(tenantId?: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    tenants: 0,
    users: 0,
    products: 0,
    orders: 0,
    payments: 0,
    webhooks: 0,
    logging: 0,
    cache: 0,
  };

  try {
    // Only fetch endpoints that work without special auth.
    // Skip webhooks and payments as they return 401.
    const [tenantsRes, usersRes, productsRes, ordersRes, logsRes] = await Promise.all([
      entityApi.tenants.list(),
      listUsersFromFirestore()
        .then((data) => ({ success: true, data, responseTime: 0 }))
        .catch((error) => ({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          data: [],
        })),
      listProductsFromFirestore(tenantId || DEFAULT_TENANT_ID)
        .then((data) => ({ success: true, data, responseTime: 0 }))
        .catch((error) => ({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          data: [],
        })),
      entityApi.orders.list(tenantId),
      entityApi.logs.list(10, tenantId),
    ]);

    if (tenantsRes.success && Array.isArray(tenantsRes.data)) {
      counts.tenants = tenantsRes.data.length;
    }

    if (usersRes.success && Array.isArray(usersRes.data)) {
      counts.users = usersRes.data.length;
    }
    if (productsRes.success && Array.isArray(productsRes.data)) {
      counts.products = productsRes.data.length;
    }
    if (ordersRes.success && Array.isArray(ordersRes.data)) {
      counts.orders = ordersRes.data.length;
    }
    if (logsRes.success && Array.isArray(logsRes.data)) {
      counts.logging = logsRes.data.length;
    }
  } catch (error) {
    console.error('Error fetching entity counts:', error);
  }

  return counts;
}
