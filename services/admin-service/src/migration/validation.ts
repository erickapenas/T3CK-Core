import { z } from 'zod';

const moduleSchema = z.enum(['catalog', 'customers', 'orders', 'seo', 'layout', 'content', 'redirects']);

export const MigrationProjectCreateSchema = z.object({
  name: z.string().min(2),
  sourcePlatform: z.enum([
    'shopify',
    'woocommerce',
    'nuvemshop',
    'tray',
    'vtex',
    'loja_integrada',
    'magento',
    'csv',
    'xml',
    'merchant_feed',
    'sitemap',
    'other',
  ]),
  sourceUrl: z.string().url(),
  accessMethod: z.enum(['api', 'file', 'feed', 'sitemap', 'public_read', 'manual']),
  modules: z.array(moduleSchema).min(1).optional(),
  notes: z.string().max(2000).optional(),
});

export const MigrationProjectUpdateSchema = MigrationProjectCreateSchema.partial().extend({
  status: z
    .enum([
      'draft',
      'connected',
      'discovered',
      'validated',
      'importing',
      'imported',
      'syncing',
      'ready_for_go_live',
      'live',
      'blocked',
    ])
    .optional(),
});

export const MigrationConnectionSchema = z.object({
  apiKey: z.string().max(500).optional(),
  accessToken: z.string().max(1000).optional(),
  consumerKey: z.string().max(500).optional(),
  consumerSecret: z.string().max(1000).optional(),
  feedUrl: z.string().url().optional(),
  fileName: z.string().max(240).optional(),
  fileContent: z.string().max(10_000_000).optional(),
  fileContentBase64: z.string().max(15_000_000).optional(),
  contentType: z.string().max(120).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
  authorizationConfirmed: z.boolean().default(true),
});

export const MigrationDiscoverySchema = MigrationConnectionSchema.partial();

export const MigrationColumnMappingsSchema = z.object({
  mappings: z.array(
    z.object({
      module: moduleSchema,
      targetField: z.string().min(1).max(120),
      sourceField: z.string().max(240).optional(),
      required: z.boolean().optional(),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
      status: z.enum(['suggested', 'confirmed', 'ignored']).optional(),
    })
  ),
});

export const MigrationChecklistSchema = z.object({
  checklist: z.array(
    z.object({
      key: z.string().min(1),
      done: z.boolean(),
    })
  ),
});
