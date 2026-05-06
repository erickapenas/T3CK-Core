export type MarketplaceProvider = 'mercado_livre' | 'tiktok_shop' | 'shopee' | 'other';
export type IntegrationProvider = MarketplaceProvider | 'google_pagespeed';
export type IntegrationKind = 'marketplace' | 'pagespeed';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'expired' | 'pending';

export type IntegrationLogStatus = 'success' | 'error' | 'warning';

export type PublicIntegration = {
  id: string;
  tenantId: string;
  userId: string;
  kind: IntegrationKind;
  provider: IntegrationProvider;
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
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceAccount = {
  id: string;
  tenantId: string;
  userId: string;
  integrationId: string;
  provider: MarketplaceProvider;
  externalAccountId?: string;
  shopName?: string;
  status: IntegrationStatus;
  tokenReference?: string;
  refreshReference?: string;
  tokenExpiresAt?: string;
  scopes: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceConnectResult = {
  integration: PublicIntegration;
  authorizationUrl?: string;
  state?: string;
};

export type IntegrationLog = {
  id: string;
  tenantId: string;
  userId: string;
  integrationId?: string;
  provider?: IntegrationProvider;
  action: string;
  status: IntegrationLogStatus;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type PageSpeedReport = {
  id: string;
  tenantId: string;
  userId: string;
  url: string;
  strategy: 'mobile' | 'desktop';
  metrics: {
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
  };
  rawSummary: Record<string, unknown>;
  createdAt: string;
};

export type ImportOrdersResult = {
  imported: number;
  skippedDuplicates: number;
  orders: Array<Record<string, unknown>>;
};
