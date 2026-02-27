import { z } from 'zod';

export const TransformOptionsSchema = z.object({
  width: z.number().int().min(1).max(4096).optional(),
  height: z.number().int().min(1).max(4096).optional(),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional(),
  format: z.enum(['webp', 'avif', 'jpeg', 'png']).optional(),
  quality: z.number().int().min(1).max(100).optional(),
  blur: z.number().min(0.3).max(1000).optional(),
  grayscale: z.boolean().optional(),
  sharpen: z.boolean().optional(),
});

export const TransformQuerySchema = z.object({
  url: z.string().url(),
  w: z.string().optional().transform((v) => v ? parseInt(v, 10) : undefined),
  h: z.string().optional().transform((v) => v ? parseInt(v, 10) : undefined),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional(),
  format: z.enum(['webp', 'avif', 'jpeg', 'png']).optional(),
  quality: z.string().optional().transform((v) => v ? parseInt(v, 10) : undefined),
  blur: z.string().optional().transform((v) => v ? parseFloat(v) : undefined),
  grayscale: z.string().optional().transform((v) => v === 'true'),
  sharpen: z.string().optional().transform((v) => v === 'true'),
});

export const PresetSchema = z.object({
  name: z.string().min(1).max(50),
  width: z.number().int().min(1).max(4096).optional(),
  height: z.number().int().min(1).max(4096).optional(),
  format: z.enum(['webp', 'avif', 'jpeg', 'png']),
  quality: z.number().int().min(1).max(100),
});
