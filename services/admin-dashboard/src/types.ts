export type TabKey =
  | 'dashboard'
  | 'products'
  | 'orders'
  | 'customers'
  | 'analytics'
  | 'settings'
  | 'users'
  | 'audit';

export interface DashboardKpis {
  revenue: number;
  orders: number;
  customers: number;
  products: number;
  averageTicket: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  status: 'active' | 'inactive';
  category?: string;
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

export interface AnalyticsData {
  period: {
    from: string;
    to: string;
  };
  sales: {
    totalRevenue: number;
    totalOrders: number;
    averageTicket: number;
  };
  topProducts: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
  customerMetrics: {
    totalCustomers: number;
    repeatRate: number;
  };
}

export interface ApiEnvelope<T> {
  data: T;
  error?: string;
}
