export interface ServiceRoute {
  prefix: string;
  target: string;
  upstreamBasePath?: string;
  version: string;
  requiresAuth: boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

export interface GatewayConfig {
  port: number;
  env: string;
  jwtSecret: string;
  jwtPublicKey?: string;
  enableMetrics: boolean;
  enableCsrf: boolean;
  corsOrigins: string[];
  services: ServiceRoute[];
}

export interface AuthPayload {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
}

export interface ProxyRequest extends Request {
  user?: AuthPayload;
  tenantId?: string;
  requestId?: string;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  standardHeaders: boolean;
  legacyHeaders: boolean;
}

export interface MetricsData {
  totalRequests: number;
  totalErrors: number;
  averageResponseTime: number;
  requestsByService: Record<string, number>;
  requestsByVersion: Record<string, number>;
  rateLimitHits: number;
  authFailures: number;
}
