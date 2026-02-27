import { AnalyticsData, ApiEnvelope, AuditLog, Customer, DashboardData, Order, Product, Settings, TenantConfiguration, User } from './types';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_BASE_URL || 'http://localhost:3006';
const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-demo';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': TENANT_ID,
      ...(options.headers || {}),
    },
  });

  const json = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok) {
    throw new Error(json.error || `Request failed: ${response.status}`);
  }

  return json.data;
}

export const adminApi = {
  dashboard: () => request<DashboardData>('/api/admin/dashboard'),
  products: () => request<Product[]>('/api/admin/products'),
  createProduct: (payload: unknown) => request<Product>('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id: string, payload: unknown) => request<Product>(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id: string) => request<{ deleted: boolean }>(`/api/admin/products/${id}`, { method: 'DELETE' }),

  orders: () => request<Order[]>('/api/admin/orders'),
  createOrder: (payload: unknown) => request<Order>('/api/admin/orders', { method: 'POST', body: JSON.stringify(payload) }),
  updateOrder: (id: string, payload: unknown) => request<Order>(`/api/admin/orders/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  customers: () => request<Customer[]>('/api/admin/customers'),
  createCustomer: (payload: unknown) => request<Customer>('/api/admin/customers', { method: 'POST', body: JSON.stringify(payload) }),
  updateCustomer: (id: string, payload: unknown) => request<Customer>(`/api/admin/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  analytics: () => request<AnalyticsData>('/api/admin/analytics'),
  report: (type: 'sales' | 'inventory' | 'customers') => request<Record<string, unknown>>(`/api/admin/reports/${type}`),

  settings: () => request<Settings>('/api/admin/settings'),
  updateSettings: (payload: unknown) => request<Settings>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  tenantConfiguration: () => request<TenantConfiguration>('/api/admin/tenant-config'),
  updateTenantConfiguration: (payload: unknown) =>
    request<TenantConfiguration>('/api/admin/tenant-config', { method: 'PUT', body: JSON.stringify(payload) }),

  users: () => request<User[]>('/api/admin/users'),
  createUser: (payload: unknown) => request<User>('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id: string, payload: unknown) => request<User>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteUser: (id: string) => request<{ deleted: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' }),

  auditLogs: () => request<AuditLog[]>('/api/admin/audit-logs'),
};
