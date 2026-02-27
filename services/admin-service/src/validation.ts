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
    items: z.array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1),
        price: z.number().min(0),
      })
    ).min(1),
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
    name: z.string().min(1),
    email: z.string().email(),
    role: z.enum(['owner', 'admin', 'manager', 'viewer']),
    active: z.boolean().optional(),
  }),
});

export const UserUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.enum(['owner', 'admin', 'manager', 'viewer']).optional(),
    active: z.boolean().optional(),
  }),
});
