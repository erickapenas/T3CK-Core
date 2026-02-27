import { z } from 'zod';

export const PreRenderConfigSchema = z.object({
  url: z.string().url(),
  tenantId: z.string().min(1),
  resourceType: z.enum(['product', 'category', 'page']),
  resourceId: z.string().min(1),
  ttl: z.number().int().min(60).max(86400).optional().default(3600), // 1h default
  priority: z.number().int().min(1).max(10).optional().default(5),
});

export const RenderRequestSchema = z.object({
  tenantId: z.string().min(1),
  resourceType: z.enum(['product', 'category', 'page']),
  resourceId: z.string().min(1),
  force: z.boolean().optional().default(false),
});

export const ISRConfigSchema = z.object({
  enabled: z.boolean(),
  revalidateInterval: z.number().int().min(60).max(86400),
  staleWhileRevalidate: z.boolean(),
});

export const BatchPreRenderSchema = z.object({
  configs: z.array(PreRenderConfigSchema).min(1).max(100),
});

export const SSRRequestSchema = z.object({
  tenantId: z.string().min(1),
  resourceType: z.enum(['product', 'category', 'page']),
  resourceId: z.string().min(1),
  context: z.record(z.any()).optional(),
  headers: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
});

export const SSRConfigSchema = z.object({
  enabled: z.boolean(),
  cacheEnabled: z.boolean(),
  cacheTTL: z.number().int().min(0).max(3600),
  maxCacheSize: z.number().int().min(1).max(500),
  personalizedCaching: z.boolean(),
});
