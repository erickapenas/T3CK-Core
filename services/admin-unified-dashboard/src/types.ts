export type TabKey =
  | 'overview'
  | 'provisioning'
  | 'products'
  | 'orders'
  | 'customers'
  | 'users'
  | 'settings'
  | 'audit'
  | 'docs'
  | 'observability';

export interface DashboardKpis {
  revenue: number;
  orders: number;
  customers: number;
  products: number;
  averageTicket: number;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  status: 'active' | 'inactive';
}

export interface Order {
  id: string;
  tenantId: string;
  customerId: string;
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  totalOrders: number;
  totalSpent: number;
}

export interface Settings {
  tenantId: string;
  currency: string;
  timezone: string;
  notificationsEnabled: boolean;
  lowStockThreshold: number;
}

export interface TenantConfiguration {
  tenantId: string;
  displayName: string;
  supportEmail: string;
  supportPhone?: string;
  customDomain?: string;
  locale: string;
  maintenanceMode: boolean;
}

export interface User {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'viewer';
  active: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  actorUserId: string;
  resourceType: string;
  resourceId?: string;
  createdAt: string;
}

export interface ProvisioningTenant {
  id: string;
  domain: string;
  companyName: string;
  contactEmail: string;
  status: string;
  provisioningJobId?: string;
  provisionedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEnvelope<T> {
  data: T;
  error?: string;
  message?: string;
  success?: boolean;
}
