export interface AdminProduct {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  reservedStock?: number;
  manageStock?: boolean;
  ncm?: string;
  cfop?: string;
  cest?: string;
  taxOrigin?: string;
  status: 'active' | 'inactive';
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrder {
  id: string;
  tenantId: string;
  customerId: string;
  userId?: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
    sku?: string;
    name?: string;
    ncm?: string;
    cfop?: string;
    cest?: string;
    taxOrigin?: string;
  }>;
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  paymentStatus?: string;
  paymentMethod?: string;
  fulfillmentStatus?: string;
  fiscalStatus?: string;
  shippingStatus?: string;
  marketplace?: string;
  externalOrderId?: string;
  subtotal?: number;
  discount?: number;
  shippingCost?: number;
  freight?: number;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomer {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
  document?: string;
  taxId?: string;
  cpfCnpj?: string;
  address?: Record<string, unknown>;
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

export type DesignTokens = Record<string, unknown>;

export interface AdminTheme {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: 'commerce' | 'glass' | 'operations' | 'enterprise' | 'creator' | 'accessibility' | 'custom';
  tokensJson: DesignTokens;
  isSystemTheme: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantTheme {
  id: string;
  tenantId: string;
  themeId: string;
  customTokensJson: DesignTokens;
  logoUrl?: string;
  faviconUrl?: string;
  displayName?: string;
  status: 'draft' | 'published';
  isActive: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserThemePreferences {
  id: string;
  tenantId: string;
  userId: string;
  preferredMode: 'system' | 'light' | 'dark';
  density: 'compact' | 'comfortable' | 'spacious';
  fontSize: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
  reducedTransparency: boolean;
  highContrast: boolean;
  customTokensJson: DesignTokens;
  defaultDashboardPeriod?: string;
  favoriteShortcuts?: string[];
  visibleTableColumns?: Record<string, string[]>;
  savedFilters?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardLayout {
  id: string;
  tenantId: string;
  userId?: string;
  layoutJson: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardWidget {
  id: string;
  tenantId: string;
  userId?: string;
  widgetKey: string;
  position: number;
  size: 'sm' | 'md' | 'lg' | 'xl';
  visible: boolean;
  configJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeBundle {
  themes: AdminTheme[];
  activeTheme: AdminTheme;
  tenantTheme: TenantTheme;
  userPreferences: UserThemePreferences;
  dashboardLayout: DashboardLayout;
  dashboardWidgets: DashboardWidget[];
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
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'usuario';
  permissions?: string[];
  passwordHash?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AdminSessionUser = Omit<AdminUser, 'passwordHash'>;

export interface AuditLog {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: string;
  resourceType:
    | 'product'
    | 'order'
    | 'customer'
    | 'settings'
    | 'user'
    | 'dashboard'
    | 'analytics'
    | 'tenant'
    | 'theme'
    | 'dashboard_layout'
    | 'fiscal'
    | 'invoice'
    | 'inventory'
    | 'shipment'
    | 'tracking';
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

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}
