export interface PreRenderConfig {
  url: string;
  tenantId: string;
  resourceType: 'product' | 'category' | 'page';
  resourceId: string;
  ttl?: number; // Time to live in seconds
  priority?: number; // Higher = more priority
}

export interface PreRenderedPage {
  html: string;
  headers: Record<string, string>;
  statusCode: number;
  generatedAt: number;
  expiresAt: number;
  hits: number;
}

export interface CacheEntry {
  key: string;
  value: PreRenderedPage;
  size: number;
  lastAccessed: number;
}

export interface RenderRequest {
  tenantId: string;
  resourceType: 'product' | 'category' | 'page';
  resourceId: string;
  force?: boolean; // Force regeneration
}

export interface RenderResponse {
  html: string;
  cached: boolean;
  generatedAt: number;
  ttl: number;
}

export interface EdgeStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  preRenderedPages: number;
  averageGenerationTime: number;
  cacheSize: number;
}

export interface ISRConfig {
  enabled: boolean;
  revalidateInterval: number; // seconds
  staleWhileRevalidate: boolean;
}

export interface PreRenderJob {
  id: string;
  config: PreRenderConfig;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  error?: string;
}

export interface SSRRequest {
  tenantId: string;
  resourceType: 'product' | 'category' | 'page';
  resourceId: string;
  context?: Record<string, any>; // User context (userId, preferences, etc)
  headers?: Record<string, string>; // Request headers (cookies, auth, etc)
  query?: Record<string, string>; // Query parameters
}

export interface SSRResponse {
  html: string;
  statusCode: number;
  headers: Record<string, string>;
  renderTime: number;
  cached: boolean;
}

export interface SSRConfig {
  enabled: boolean;
  cacheEnabled: boolean;
  cacheTTL: number; // seconds
  maxCacheSize: number; // MB
  personalizedCaching: boolean; // Cache per user
}

export interface SSRStats {
  totalSSRRequests: number;
  averageRenderTime: number;
  cacheHitRate: string;
  cachedPages: number;
}
