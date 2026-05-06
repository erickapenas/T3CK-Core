import { z } from 'zod';

export const MarketplaceProviderParamSchema = z.object({
  params: z.object({
    provider: z.enum(['mercado_livre', 'tiktok_shop', 'shopee', 'other']),
  }),
});

export const OrderListQuerySchema = z.object({
  query: z.object({
    status: z
      .enum(['created', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const ProfileUpdateSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().max(40).optional(),
    })
    .strict(),
});

export const MarketplaceConnectSchema = z.object({
  params: z.object({
    provider: z.enum(['mercado_livre', 'tiktok_shop', 'shopee', 'other']),
  }),
  body: z
    .object({
      redirectUri: z.string().url().optional(),
      scopes: z.array(z.string().min(1)).optional(),
    })
    .strict()
    .default({}),
});

export const MarketplaceOAuthCallbackSchema = z.object({
  params: z.object({
    provider: z.enum(['mercado_livre', 'tiktok_shop', 'shopee', 'other']),
  }),
  body: z
    .object({
      code: z.string().min(1),
      state: z.string().min(1),
      redirectUri: z.string().url().optional(),
    })
    .strict(),
});

export const PageSpeedRunSchema = z.object({
  body: z
    .object({
      url: z.string().url(),
      strategy: z.enum(['mobile', 'desktop']).optional(),
    })
    .strict(),
});
