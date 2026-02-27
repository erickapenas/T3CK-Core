export interface AdminProduct {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  status: 'active' | 'inactive';
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrder {
  id: string;
  tenantId: string;
  customerId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomer {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
  totalOrders: number;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSettings {
  tenantId: string;
  currency: string;
  timezone: string;
  notificationsEnabled: boolean;
  lowStockThreshold: number;
  updatedAt: string;
}

export interface AdminTenantConfiguration {
  tenantId: string;
  displayName: string;
  supportEmail: string;
  supportPhone?: string;
  customDomain?: string;
  locale: string;
  maintenanceMode: boolean;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'viewer';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: string;
  resourceType: 'product' | 'order' | 'customer' | 'settings' | 'user' | 'dashboard' | 'analytics' | 'tenant';
  resourceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardData {
  kpis: {
    revenue: number;
    orders: number;
    customers: number;
    products: number;
    averageTicket: number;
  };
  lowStockProducts: AdminProduct[];
  recentOrders: AdminOrder[];
  recentAuditLogs: AuditLog[];
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

export interface ReportData {
  reportType: 'sales' | 'inventory' | 'customers';
  generatedAt: string;
  tenantId: string;
  data: Record<string, unknown>;
}
