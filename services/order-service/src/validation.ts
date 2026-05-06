import { z } from 'zod';

export const OrderItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1).optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0).optional(),
});

export const OrderCreateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    customerId: z.string().min(1),
    items: z.array(OrderItemSchema).min(1),
    shippingCost: z.number().min(0).optional(),
    notes: z.string().optional(),
  }),
});

export const OrderStatusUpdateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    status: z.enum(['created', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
    reason: z.string().optional(),
  }),
});

export const OrderPaymentStatusUpdateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    paymentId: z.string().min(1),
    paymentStatus: z.enum(['AWAITING_PAYMENT', 'PAID', 'REFUNDED', 'FAILED', 'CHARGEBACK']),
  }),
});

export const OrderCancelSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    reason: z.string().min(1),
  }),
});
