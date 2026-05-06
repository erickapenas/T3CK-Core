import { z } from 'zod';

export const MarketplaceProviderSchema = z.object({
  provider: z.enum(['mercado_livre', 'tiktok_shop', 'shopee', 'other']),
});

export const MarketplaceConnectBodySchema = z.object({
  redirectUri: z.string().url().optional(),
  scopes: z.array(z.string().min(1)).optional(),
});

export const MarketplaceOAuthBodySchema = z.object({
  code: z.string().min(1, 'code is required'),
  state: z.string().min(1, 'state is required'),
  redirectUri: z.string().url().optional(),
});

export const PageSpeedRunBodySchema = z.object({
  url: z.string().url('URL invalida'),
  strategy: z.enum(['mobile', 'desktop']).optional().default('mobile'),
});
