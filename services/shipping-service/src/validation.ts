import { z } from 'zod';

export const ShippingCalculationSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    orderId: z.string().min(1),
    destinationZip: z.string().min(5),
    weightKg: z.number().positive(),
    dimensionsCm: z.object({
      length: z.number().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
  }),
});

export const ShipmentCreateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    orderId: z.string().min(1),
    carrier: z.enum(['correios', 'loggi', 'melhor_envio']),
    serviceLevel: z.enum(['economy', 'standard', 'express']),
  }),
});

export const StatusUpdateSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    status: z.enum([
      'created',
      'label_generated',
      'picked_up',
      'in_transit',
      'out_for_delivery',
      'delivered',
    ]),
    location: z.string().optional(),
    message: z.string().optional(),
  }),
});

export const NotificationSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1),
    shipmentId: z.string().min(1),
    channel: z.enum(['email', 'sms', 'webhook']),
    recipient: z.string().min(1),
    message: z.string().min(1),
  }),
});
