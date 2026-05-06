export type MarketplaceProvider = 'mercado_livre' | 'tiktok_shop' | 'shopee' | 'other';

export type IntegrationKind = 'marketplace' | 'pagespeed';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'expired' | 'pending';

export type IntegrationAction =
  | 'integration.connected'
  | 'integration.disconnected'
  | 'integration.tested'
  | 'integration.token_refreshed'
  | 'integration.oauth_callback'
  | 'integration.webhook_received'
  | 'marketplace.orders_imported'
  | 'pagespeed.report_created'
  | 'pagespeed.rate_limited'
  | 'integration.error';

export interface IntegrationRecord {
  id: string;
  tenantId: string;
  userId: string;
  kind: IntegrationKind;
  provider: MarketplaceProvider | 'google_pagespeed';
  status: IntegrationStatus;
  displayName: string;
  lastTestedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceAccountRecord {
  id: string;
  integrationId: string;
  tenantId: string;
  userId: string;
  provider: MarketplaceProvider;
  externalAccountId?: string;
  shopName?: string;
  status: IntegrationStatus;
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  tokenExpiresAt?: string;
  scopes: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceOrderRecord {
  id: string;
  tenantId: string;
  userId: string;
  provider: MarketplaceProvider;
  integrationId: string;
  externalOrderId: string;
  idempotencyKey: string;
  status: string;
  amount: number;
  currency: string;
  rawPayload: Record<string, unknown>;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationLogRecord {
  id: string;
  tenantId: string;
  userId: string;
  integrationId?: string;
  provider?: MarketplaceProvider | 'google_pagespeed';
  action: IntegrationAction;
  status: 'success' | 'error' | 'warning';
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PageSpeedMetrics {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  lcpMs?: number;
  cls?: number;
  inpMs?: number;
  fidMs?: number;
  totalBlockingTimeMs?: number;
  speedIndexMs?: number;
  loadTimeMs?: number;
}

export interface PageSpeedReportRecord {
  id: string;
  tenantId: string;
  userId: string;
  url: string;
  strategy: 'mobile' | 'desktop';
  metrics: PageSpeedMetrics;
  rawSummary: Record<string, unknown>;
  createdAt: string;
}

export interface IntegrationStateSnapshot {
  integrations: IntegrationRecord[];
  marketplaceAccounts: MarketplaceAccountRecord[];
  marketplaceOrders: MarketplaceOrderRecord[];
  integrationLogs: IntegrationLogRecord[];
  pageSpeedReports: PageSpeedReportRecord[];
}

export interface PublicIntegration {
  id: string;
  kind: IntegrationKind;
  provider: IntegrationRecord['provider'];
  status: IntegrationStatus;
  displayName: string;
  lastTestedAt?: string;
  lastError?: string;
  account?: {
    id: string;
    externalAccountId?: string;
    shopName?: string;
    status: IntegrationStatus;
    tokenExpiresAt?: string;
    scopes: string[];
  };
  updatedAt: string;
}

export interface ConnectResult {
  integration: PublicIntegration;
  authorizationUrl?: string;
  state?: string;
}

export interface ImportOrdersResult {
  imported: number;
  skippedDuplicates: number;
  orders: MarketplaceOrderRecord[];
}
