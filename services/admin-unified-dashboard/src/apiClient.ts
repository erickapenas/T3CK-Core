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

const API_BASE = import.meta.env.VITE_GATEWAY_BASE_URL || 'http://localhost:3000';
const DEFAULT_TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-demo';

let csrfToken: string | null = null;

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
  const url = new URL(path, API_BASE).toString();
  const method = options.method?.toUpperCase() || 'GET';
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
    ...options.headers,
  };

  // Add CSRF token for mutations
  if (isMutation) {
    const token = await getCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }

  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include cookies for CSRF token
    });

    const endTime = performance.now();
    const responseTime = Math.round(endTime - startTime);

    if (!response.ok) {
      // For 403 errors, clear CSRF token and retry
      if (response.status === 403 && isMutation) {
        csrfToken = null;
        // Try once more
        return apiRequest(path, options, tenantId);
      }

      // Try to parse error response
      let errorMessage = `API Error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // Could not parse error response as JSON
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    return {
      data,
      responseTime,
      success: true,
    };
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
      return apiRequest('/api/v1/admin/products', {
        method: 'POST',
        body: JSON.stringify(data),
      }, tenantId);
    },
    update: async (productId: string, data: any, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }, tenantId);
    },
    delete: async (productId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/products/${productId}`, {
        method: 'DELETE',
      }, tenantId);
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
      return apiRequest('/api/v1/admin/orders', {
        method: 'POST',
        body: JSON.stringify(data),
      }, tenantId);
    },
    update: async (orderId: string, data: any, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }, tenantId);
    },
    delete: async (orderId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/orders/${orderId}`, {
        method: 'DELETE',
      }, tenantId);
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
      return apiRequest('/api/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }, tenantId);
    },
    update: async (userId: string, data: any, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }, tenantId);
    },
    delete: async (userId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/users/${userId}`, {
        method: 'DELETE',
      }, tenantId);
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
      return apiRequest('/api/v1/admin/customers', {
        method: 'POST',
        body: JSON.stringify(data),
      }, tenantId);
    },
    update: async (customerId: string, data: any, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/customers/${customerId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }, tenantId);
    },
    delete: async (customerId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/admin/customers/${customerId}`, {
        method: 'DELETE',
      }, tenantId);
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
      return apiRequest('/api/v1/webhooks', {
        method: 'POST',
        body: JSON.stringify(data),
      }, tenantId);
    },
    update: async (webhookId: string, data: any, tenantId?: string) => {
      return apiRequest(`/api/v1/webhooks/${webhookId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }, tenantId);
    },
    delete: async (webhookId: string, tenantId?: string) => {
      return apiRequest(`/api/v1/webhooks/${webhookId}`, {
        method: 'DELETE',
      }, tenantId);
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
      return apiRequest('/api/v1/admin/dashboard', {});
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
    return apiRequest('/api/v1/admin/tenant-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }, tenantId);
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
    return apiRequest('/api/v1/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }, tenantId);
  },
};

/**
 * Entity count helper - fetches count for each entity type
 * Only fetches endpoints that don't require special authentication
 */
export async function getEntityCounts(tenantId?: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    tenants: 1,
    users: 0,
    products: 0,
    orders: 0,
    payments: 0,
    webhooks: 0,
    logging: 0,
    cache: 0,
  };

  try {
    // Only fetch endpoints that work without special auth
    // Skip webhooks and payments as they return 401
    const [usersRes, productsRes, ordersRes, logsRes] = await Promise.all([
      entityApi.users.list(tenantId),
      entityApi.products.list(tenantId),
      entityApi.orders.list(tenantId),
      entityApi.logs.list(10, tenantId),
    ]);

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
