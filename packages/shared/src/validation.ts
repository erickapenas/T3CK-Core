import { z, ZodSchema } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      schema.parse({ body: req.body, params: req.params, query: req.query });
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      return res.status(400).json({ error: 'Invalid request' });
    }
  };
};

export const AuthLoginSchema = z.object({
  body: z.object({
    provider: z.string(),
    token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  }),
});

export const ProvisioningSubmitSchema = z.object({
  body: z.object({
    tenantId: z.string().min(3),
    domain: z.string().min(3),
    companyName: z.string().min(1),
    contactName: z.string().min(1),
    plan: z.string().min(1),
    contactEmail: z.string().email(),
    numberOfSeats: z.number().int().min(1).optional(),
    region: z.string().min(2).optional(),
    // Campos opcionais adicionais
    adminEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    billingAddress: z.string().optional(),
    billingCountry: z.string().optional(),
    billingZipCode: z.string().optional(),
    monthlyBudget: z.number().optional(),
  }),
});

export const AuthRefreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

export const AuthVerifySchema = z.object({
  body: z.object({
    token: z.string().min(1),
  }),
});

export const EncryptSchema = z.object({
  body: z.object({
    data: z.record(z.any()).optional().or(z.string()),
  }),
});

export const DecryptSchema = z.object({
  body: z.object({
    data: z.record(z.any()).optional().or(z.string()),
  }),
});

export const CreateWebhookSchema = z.object({
  body: z.object({
    url: z.string().url(),
    events: z.array(z.string()).min(1),
    secret: z.string().optional(),
  }),
});

export const UpdateWebhookSchema = z.object({
  body: z.object({
    url: z.string().url().optional(),
    events: z.array(z.string()).min(1).optional(),
    secret: z.string().optional(),
    active: z.boolean().optional(),
  }),
});

export const ProvisioningStatusParamSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1),
  }),
});

export default { validateRequest };
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export function validateTenantId(tenantId: string): boolean {
  // Tenant ID deve ser alfanumérico com hífens, min 3, max 50 caracteres
  const tenantIdRegex = /^[a-z0-9-]{3,50}$/;
  return tenantIdRegex.test(tenantId);
}

export function validateRequired<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

export function validateMinLength(value: string, minLength: number, fieldName: string): void {
  if (value.length < minLength) {
    throw new Error(`${fieldName} must be at least ${minLength} characters`);
  }
}

export function validateMaxLength(value: string, maxLength: number, fieldName: string): void {
  if (value.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters`);
  }
}
