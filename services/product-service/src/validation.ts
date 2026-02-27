import { z } from 'zod';

export const TenantSchema = z.object({
  tenantId: z.string().min(1),
});

export const ProductCreateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    sku: z.string().min(1),
    categoryId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    active: z.boolean().optional(),
    basePrice: z.number().min(0),
    stock: z.number().int().min(0).optional(),
  }),
});

export const ProductUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    sku: z.string().min(1).optional(),
    categoryId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    active: z.boolean().optional(),
    basePrice: z.number().min(0).optional(),
  }),
});

export const CategoryCreateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
  }),
});

export const CategoryUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  }),
});

export const VariantCreateSchema = z.object({
  body: z.object({
    sku: z.string().min(1),
    name: z.string().min(1),
    attributes: z.record(z.string()).optional(),
    additionalPrice: z.number().min(0).optional(),
    stock: z.number().int().min(0).optional(),
  }),
});

export const VariantUpdateSchema = z.object({
  body: z.object({
    sku: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    attributes: z.record(z.string()).optional(),
    additionalPrice: z.number().min(0).optional(),
    stock: z.number().int().min(0).optional(),
  }),
});

export const ProductImageSchema = z.object({
  body: z.object({
    url: z.string().url(),
    alt: z.string().optional(),
    position: z.number().int().min(0).optional(),
  }),
});

export const InventoryAdjustSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    delta: z.number().int(),
    variantId: z.string().optional(),
    reason: z.string().optional(),
  }),
});

export const InventorySetSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    quantity: z.number().int().min(0),
    variantId: z.string().optional(),
    reason: z.string().optional(),
  }),
});
