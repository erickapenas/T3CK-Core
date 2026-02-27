import {
  ApiEnvelope,
  AuditLog,
  Customer,
  DashboardKpis,
  Order,
  Product,
  ProvisioningTenant,
  Settings,
  TenantConfiguration,
  User,
} from './types';

export const API_BASE_URL = import.meta.env.VITE_GATEWAY_BASE_URL || 'http://localhost:3000';
const API_BASE_CANDIDATES = Array.from(new Set([
  API_BASE_URL,
  'http://localhost:3000',
]));
let currentTenantId = import.meta.env.VITE_TENANT_ID || 'tenant-demo';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let csrfTokenCache: string | null = null;
let activeApiBaseUrl = API_BASE_URL;

export function setTenantId(tenantId: string): void {
  if (!tenantId || tenantId === currentTenantId) {
    return;
  }
  currentTenantId = tenantId;
  csrfTokenCache = null;
}

export function getTenantId(): string {
  return currentTenantId;
}

function getApiBasesByPriority(): string[] {
  const remaining = API_BASE_CANDIDATES.filter((base) => base !== activeApiBaseUrl);
  return [activeApiBaseUrl, ...remaining];
}

async function fetchCsrfToken(): Promise<string> {
  let lastError: Error | null = null;

  for (const baseUrl of getApiBasesByPriority()) {
    try {
      const response = await fetch(`${baseUrl}/api/csrf-token`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'X-Tenant-ID': currentTenantId,
        },
      });

      const json = (await response.json().catch(() => ({}))) as { csrfToken?: string; error?: string; message?: string };

      if (!response.ok || !json.csrfToken) {
        lastError = new Error(json.error || json.message || `Failed to get CSRF token: ${response.status}`);
        continue;
      }

      activeApiBaseUrl = baseUrl;
      csrfTokenCache = json.csrfToken;
      return json.csrfToken;
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError || new Error('Failed to get CSRF token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && getApiBasesByPriority().some((base) => base.startsWith('http://'))) {
    throw new Error('Ambiente HTTPS detectado. Abra o painel em http://localhost:5175 para evitar bloqueio de rede local.');
  }

  const method = (options.method || 'GET').toUpperCase();
  let lastError: Error | null = null;
  let csrfRetried = false;
  const bases = getApiBasesByPriority();

  for (let index = 0; index < bases.length; index++) {
    const baseUrl = bases[index];
    try {
      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'application/json');
      headers.set('X-Tenant-ID', currentTenantId);

      if (!SAFE_METHODS.has(method)) {
        const csrfToken = csrfTokenCache || await fetchCsrfToken();
        headers.set('X-CSRF-Token', csrfToken);
      }

      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        method,
        credentials: 'include',
        headers,
      });

      const json = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

      if (!response.ok) {
        const responseMessage = String(json.error || json.message || '');
        const isCsrfFailure = !SAFE_METHODS.has(method)
          && (response.status === 403 || /csrf/i.test(responseMessage));

        if (isCsrfFailure) {
          csrfTokenCache = null;
          if (!csrfRetried) {
            csrfRetried = true;
            index -= 1;
            continue;
          }
        }

        const fallbackMessage = response.status === 429
          ? 'Muitas requisições em sequência (429). Aguarde alguns segundos e tente novamente.'
          : (response.status === 403 && !SAFE_METHODS.has(method))
            ? 'Falha de validação CSRF. Atualize a página e tente novamente.'
          : `Request failed: ${response.status}`;
        lastError = new Error(json.error || json.message || fallbackMessage);

        if (response.status >= 500 && response.status <= 504) {
          continue;
        }

        throw Object.assign(lastError, { name: 'NonRetryableError' });
      }

      activeApiBaseUrl = baseUrl;

      if (typeof json === 'object' && json !== null && 'data' in json) {
        return json.data;
      }

      return json as T;
    } catch (error) {
      lastError = error as Error;
      if ((lastError as Error & { name?: string }).name === 'NonRetryableError') {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Failed to fetch API');
}

export const unifiedApi = {
  dashboard: async () => {
    const data = await request<{ kpis: DashboardKpis }>('/api/v1/admin/dashboard');
    return data.kpis;
  },
  products: () => request<Product[]>('/api/v1/admin/products'),
  createProduct: (payload: unknown) => request<Product>('/api/v1/admin/products', { method: 'POST', body: JSON.stringify(payload) }),

  orders: () => request<Order[]>('/api/v1/admin/orders'),
  createOrder: (payload: unknown) => request<Order>('/api/v1/admin/orders', { method: 'POST', body: JSON.stringify(payload) }),

  customers: () => request<Customer[]>('/api/v1/admin/customers'),
  createCustomer: (payload: unknown) => request<Customer>('/api/v1/admin/customers', { method: 'POST', body: JSON.stringify(payload) }),

  settings: () => request<Settings>('/api/v1/admin/settings'),
  tenantConfiguration: () => request<TenantConfiguration>('/api/v1/admin/tenant-config'),
  updateTenantConfiguration: (payload: unknown) =>
    request<TenantConfiguration>('/api/v1/admin/tenant-config', { method: 'PUT', body: JSON.stringify(payload) }),

  users: () => request<User[]>('/api/v1/admin/users'),
  createUser: (payload: unknown) => request<User>('/api/v1/admin/users', { method: 'POST', body: JSON.stringify(payload) }),

  auditLogs: () => request<AuditLog[]>('/api/v1/admin/audit-logs'),

  provisioningTenants: () => request<ProvisioningTenant[]>('/api/v1/provisioning/tenants'),
  submitProvisioning: (payload: unknown) => request<ProvisioningTenant>('/api/v1/provisioning/submit', { method: 'POST', body: JSON.stringify(payload) }),
  provisioningStatus: (tenantId: string) => request<Record<string, unknown>>(`/api/v1/provisioning/${tenantId}/status`),
};
