import { z } from 'zod';

export const ProductCreateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    name: z.string().min(1),
    sku: z.string().min(1),
    price: z.number().min(0),
    stock: z.number().int().min(0),
    status: z.enum(['active', 'inactive']).optional(),
    category: z.string().optional(),
  }),
});

export const ProductUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    price: z.number().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    category: z.string().optional(),
  }),
});

export const OrderCreateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    customerId: z.string().min(1),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1),
          price: z.number().min(0),
        })
      )
      .min(1),
    total: z.number().min(0),
    status: z.enum(['pending', 'processing', 'completed', 'cancelled']).optional(),
  }),
});

export const OrderUpdateSchema = z.object({
  body: z.object({
    status: z.enum(['pending', 'processing', 'completed', 'cancelled']).optional(),
  }),
});

export const CustomerCreateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
});

export const CustomerUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
});

export const SettingsUpdateSchema = z.object({
  body: z.object({
    currency: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
    notificationsEnabled: z.boolean().optional(),
    lowStockThreshold: z.number().int().min(0).optional(),
  }),
});

const TokenPrimitiveSchema = z.union([z.string().max(240), z.number(), z.boolean(), z.null()]);
type TokenValue = z.infer<typeof TokenPrimitiveSchema> | TokenRecord | TokenValue[];
type TokenRecord = { [key: string]: TokenValue };

const TokenValueSchema: z.ZodType<TokenValue> = z.lazy(() =>
  z.union([
    TokenPrimitiveSchema,
    z.array(TokenValueSchema).max(24),
    z.record(z.string().min(1).max(48), TokenValueSchema),
  ])
);

export const ThemeDraftUpdateSchema = z.object({
  body: z.object({
    themeId: z.string().min(1).optional(),
    customTokensJson: z.record(TokenValueSchema).optional(),
    logoUrl: z.string().url().max(500).or(z.literal('')).optional(),
    faviconUrl: z.string().url().max(500).or(z.literal('')).optional(),
    displayName: z.string().max(80).optional(),
  }),
});

export const ThemePublishSchema = z.object({
  body: z
    .object({
      themeId: z.string().min(1).optional(),
      customTokensJson: z.record(TokenValueSchema).optional(),
      logoUrl: z.string().url().max(500).or(z.literal('')).optional(),
      faviconUrl: z.string().url().max(500).or(z.literal('')).optional(),
      displayName: z.string().max(80).optional(),
    })
    .optional()
    .default({}),
});

export const UserThemePreferencesUpdateSchema = z.object({
  body: z.object({
    preferredMode: z.enum(['system', 'light', 'dark']).optional(),
    density: z.enum(['compact', 'comfortable', 'spacious']).optional(),
    fontSize: z.enum(['small', 'medium', 'large']).optional(),
    reducedMotion: z.boolean().optional(),
    reducedTransparency: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    customTokensJson: z.record(TokenValueSchema).optional(),
    defaultDashboardPeriod: z.string().max(40).optional(),
    favoriteShortcuts: z.array(z.string().max(80)).max(24).optional(),
    visibleTableColumns: z.record(z.array(z.string().max(80)).max(80)).optional(),
    savedFilters: z.record(TokenValueSchema).optional(),
  }),
});

export const DashboardLayoutUpdateSchema = z.object({
  body: z.object({
    layoutJson: z.record(TokenValueSchema),
    isDefault: z.boolean().optional(),
    userId: z.string().min(1).optional(),
  }),
});

export const TenantConfigurationUpdateSchema = z.object({
  body: z.object({
    displayName: z.string().min(1).optional(),
    supportEmail: z.string().email().optional(),
    supportPhone: z.string().optional(),
    customDomain: z.string().optional(),
    locale: z.string().min(2).optional(),
    maintenanceMode: z.boolean().optional(),
  }),
});

export const UserCreateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    username: z.string().min(3),
    password: z.string().min(1).optional(),
    name: z.string().min(1),
    email: z.string().email(),
    role: z.enum(['admin', 'usuario']),
    permissions: z.array(z.string().min(1)).optional(),
    active: z.boolean().optional(),
  }),
});

export const UserUpdateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1).optional(),
    username: z.string().min(3).optional(),
    password: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.enum(['admin', 'usuario']).optional(),
    permissions: z.array(z.string().min(1)).optional(),
    active: z.boolean().optional(),
  }),
});

export const LoginSchema = z.object({
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
});
