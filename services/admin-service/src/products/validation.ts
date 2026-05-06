import { z } from 'zod';

const emptyToUndefined = (value: unknown): unknown => {
  if (value === '' || value === null) return undefined;
  return value;
};

const optionalNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().finite().optional()
);

const optionalBoolean = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());

const ProductStatusSchema = z.enum([
  'ativo',
  'inativo',
  'rascunho',
  'arquivado',
  'bloqueado',
  'esgotado',
]);

const ProductTypeSchema = z.enum([
  'produto_simples',
  'produto_com_variacao',
  'kit',
  'bundle',
  'servico',
  'digital',
]);

const UnitOfMeasureSchema = z.enum([
  'unidade',
  'caixa',
  'pacote',
  'metro',
  'litro',
  'quilo',
  'grama',
  'par',
  'conjunto',
]);

export const ProductListQuerySchema = z.object({
  page: optionalNumber,
  limit: optionalNumber,
  search: z.string().max(160).optional(),
  status: ProductStatusSchema.optional(),
  stockStatus: z.string().max(40).optional(),
  categoryId: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  brandId: z.string().max(120).optional(),
  brand: z.string().max(120).optional(),
  lowStock: optionalBoolean,
  noStock: optionalBoolean,
  healthyStock: optionalBoolean,
  reservedStock: optionalBoolean,
  excessStock: optionalBoolean,
  stalled: optionalBoolean,
  stockoutRisk: optionalBoolean,
  archived: optionalBoolean,
  minPrice: optionalNumber,
  maxPrice: optionalNumber,
  minCost: optionalNumber,
  maxCost: optionalNumber,
  minMargin: optionalNumber,
  maxMargin: optionalNumber,
  createdFrom: z.string().max(32).optional(),
  createdTo: z.string().max(32).optional(),
  lastSaleFrom: z.string().max(32).optional(),
  lastSaleTo: z.string().max(32).optional(),
  hasImage: z.enum(['with', 'without']).optional(),
  hasSku: z.enum(['with', 'without']).optional(),
  hasBarcode: z.enum(['with', 'without']).optional(),
  hasCost: z.enum(['with', 'without']).optional(),
  analysisPeriodDays: optionalNumber,
});

const ProductBodyBaseSchema = z
  .object({
    name: z.string().min(2).max(180),
    slug: z.string().max(180).optional(),
    shortDescription: z.string().max(400).optional(),
    description: z.string().max(8000).optional(),
    sku: z.string().min(1).max(120),
    barcode: z.string().max(80).optional(),
    productType: ProductTypeSchema.default('produto_simples'),
    categoryId: z.string().max(120).optional(),
    category: z.string().max(120).optional(),
    subcategory: z.string().max(120).optional(),
    brandId: z.string().max(120).optional(),
    brand: z.string().max(120).optional(),
    status: ProductStatusSchema.default('ativo'),
    unitOfMeasure: UnitOfMeasureSchema.default('unidade'),
    price: z.coerce.number().min(0),
    promotionalPrice: optionalNumber,
    costPrice: optionalNumber,
    weight: optionalNumber,
    height: optionalNumber,
    width: optionalNumber,
    length: optionalNumber,
    trackInventory: z.boolean().default(true),
    initialStock: optionalNumber,
    minimumStock: z.coerce.number().min(0).default(0),
    maximumStock: optionalNumber,
    safetyStock: z.coerce.number().min(0).default(0),
    leadTimeDays: z.coerce.number().min(0).default(7),
    locationCode: z.string().max(80).optional(),
    mainImageUrl: z.string().max(500).optional(),
    tags: z.array(z.string().min(1).max(60)).max(40).optional(),
    metadata: z.record(z.unknown()).optional(),
    ncm: z.string().max(16).optional(),
    cfop: z.string().max(8).optional(),
    cest: z.string().max(16).optional(),
    taxOrigin: z.string().max(4).optional(),
    taxableUnit: z.string().max(20).optional(),
    fiscalCode: z.string().max(80).optional(),
    seoTitle: z.string().max(180).optional(),
    metaDescription: z.string().max(300).optional(),
    urlSlug: z.string().max(180).optional(),
  })
  .passthrough();

export const ProductBodySchema = ProductBodyBaseSchema
  .refine(
    (data) => data.maximumStock === undefined || data.maximumStock >= data.minimumStock,
    {
      message: 'Estoque maximo deve ser maior ou igual ao estoque minimo',
      path: ['maximumStock'],
    }
  );

export const ProductUpdateBodySchema = ProductBodyBaseSchema.partial().refine(
  (data) =>
    data.maximumStock === undefined ||
    data.minimumStock === undefined ||
    data.maximumStock >= data.minimumStock,
  {
    message: 'Estoque maximo deve ser maior ou igual ao estoque minimo',
    path: ['maximumStock'],
  }
);

export const ProductStatusBodySchema = z.object({
  status: ProductStatusSchema,
  reason: z.string().max(300).optional(),
});

export const ProductVariantBodySchema = z
  .object({
    name: z.string().min(1).max(160),
    sku: z.string().min(1).max(120),
    barcode: z.string().max(80).optional(),
    attributes: z.record(z.string()).default({}),
    price: optionalNumber,
    promotionalPrice: optionalNumber,
    costPrice: optionalNumber,
    weight: optionalNumber,
    height: optionalNumber,
    width: optionalNumber,
    length: optionalNumber,
    status: ProductStatusSchema.default('ativo'),
    imageUrl: z.string().max(500).optional(),
    minimumStock: z.coerce.number().min(0).default(0),
    maximumStock: optionalNumber,
    safetyStock: z.coerce.number().min(0).default(0),
  })
  .passthrough();

export const ProductImageBodySchema = z.object({
  variantId: z.string().max(120).optional(),
  url: z.string().min(1).max(500),
  altText: z.string().max(180).optional(),
  isMain: z.boolean().default(false),
  position: z.coerce.number().int().min(0).default(0),
});

export const StockMovementBodySchema = z
  .object({
    variantId: z.string().max(120).optional(),
    warehouseId: z.string().max(120).default('default'),
    quantity: z.coerce.number().finite(),
    reason: z.string().min(3).max(300),
    origin: z
      .enum(['manual', 'pedido', 'importacao', 'ajuste', 'devolucao', 'contagem', 'sistema', 'api'])
      .default('manual'),
    orderId: z.string().max(120).optional(),
    referenceId: z.string().max(120).optional(),
    idempotencyKey: z.string().max(180).optional(),
    notes: z.string().max(1000).optional(),
    minimumStock: optionalNumber,
    maximumStock: optionalNumber,
    safetyStock: optionalNumber,
    locationCode: z.string().max(80).optional(),
  })
  .passthrough();

export const CategoryBodySchema = z.object({
  parentId: z.string().max(120).optional(),
  name: z.string().min(1).max(120),
  slug: z.string().max(140).optional(),
  description: z.string().max(600).optional(),
  status: z.enum(['ativa', 'inativa']).default('ativa'),
});

export const BrandBodySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(140).optional(),
  description: z.string().max(600).optional(),
  logoUrl: z.string().max(500).optional(),
  status: z.enum(['ativa', 'inativa']).default('ativa'),
});

export const ProductImportBodySchema = z.object({
  mode: z.enum(['create_only', 'upsert']).default('upsert'),
  items: z.array(ProductBodySchema).min(1).max(500),
});

export const ProductExportBodySchema = z.object({
  filters: ProductListQuerySchema.partial().default({}),
  format: z.enum(['csv', 'json']).default('csv'),
});

export const SuggestionActionBodySchema = z.object({
  reason: z.string().max(300).optional(),
});
