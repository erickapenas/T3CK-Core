import express, { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import {
  Logger,
  getApiLimiter,
  closeRateLimiter,
  initializeTracing,
  validateRequest,
} from '@t3ck/shared';
import { ProductService } from './product-service';
import {
  CategoryCreateSchema,
  CategoryUpdateSchema,
  InventoryAdjustSchema,
  InventorySetSchema,
  ProductCreateSchema,
  ProductImageSchema,
  ProductUpdateSchema,
  VariantCreateSchema,
  VariantUpdateSchema,
} from './validation';
import { ProductFilters } from './types';

initializeTracing('product-service');

const app = express();
app.use(express.json());
app.use(getApiLimiter());

const logger = new Logger('product-service');
const productService = new ProductService();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.INTERNAL_SERVICE_TOKEN) {
  throw new Error('INTERNAL_SERVICE_TOKEN e obrigatorio em producao.');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidInternalServiceToken(req: Request): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    return !isProduction;
  }

  const received = String(req.headers['x-internal-service-token'] || '');
  return safeEqual(received, expected);
}

app.use((req: Request, res: Response, next) => {
  if (req.path === '/health' || req.path === '/') {
    return next();
  }
  if (isProduction && !hasValidInternalServiceToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
});

const getTenantId = (req: Request): string => {
  const tenantId = String(
    req.headers['x-tenant-id'] || req.query.tenantId || req.body?.tenantId || ''
  );
  if (!tenantId) {
    throw new Error('tenantId is required (header x-tenant-id, query or body)');
  }
  return tenantId;
};

const parseFilters = (req: Request): ProductFilters => {
  const filters: ProductFilters = {};

  if (req.query.query) filters.query = String(req.query.query);
  if (req.query.categoryId) filters.categoryId = String(req.query.categoryId);
  if (req.query.minPrice) filters.minPrice = Number(req.query.minPrice);
  if (req.query.maxPrice) filters.maxPrice = Number(req.query.maxPrice);
  if (req.query.inStock !== undefined) filters.inStock = String(req.query.inStock) === 'true';
  if (req.query.tag) filters.tag = String(req.query.tag);
  if (req.query.active !== undefined) filters.active = String(req.query.active) === 'true';
  if (req.query.sortBy) filters.sortBy = req.query.sortBy as ProductFilters['sortBy'];

  return filters;
};

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'product-service' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'product-service',
    status: 'running',
    endpoints: {
      health: '/health',
      products: '/api/products',
      categories: '/api/categories',
    },
  });
});

app.post(
  '/api/categories',
  validateRequest(CategoryCreateSchema),
  (req: Request, res: Response) => {
    try {
      const category = productService.createCategory(req.body);
      res.status(201).json({ data: category });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

app.get('/api/categories', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const categories = productService.listCategories(tenantId);
    res.json({ data: categories });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.put(
  '/api/categories/:id',
  validateRequest(CategoryUpdateSchema),
  (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const category = productService.updateCategory(tenantId, req.params.id, req.body);
      res.json({ data: category });
    } catch (error) {
      res
        .status((error as Error).message.includes('not found') ? 404 : 400)
        .json({ error: (error as Error).message });
    }
  }
);

app.delete('/api/categories/:id', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const removed = productService.deleteCategory(tenantId, req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'Category not found' });
    }
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.post('/api/products', validateRequest(ProductCreateSchema), (req: Request, res: Response) => {
  try {
    const product = productService.createProduct(req.body);
    res.status(201).json({ data: product });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get('/api/products', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const products = productService.listProducts(tenantId, parseFilters(req));
    res.json({ data: products });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get('/api/products/:id', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const product = productService.getProduct(tenantId, req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.json({ data: product });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.put(
  '/api/products/:id',
  validateRequest(ProductUpdateSchema),
  (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const product = productService.updateProduct(tenantId, req.params.id, req.body);
      res.json({ data: product });
    } catch (error) {
      res
        .status((error as Error).message.includes('not found') ? 404 : 400)
        .json({ error: (error as Error).message });
    }
  }
);

app.delete('/api/products/:id', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const removed = productService.deleteProduct(tenantId, req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.post(
  '/api/products/:id/variants',
  validateRequest(VariantCreateSchema),
  (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const variant = productService.addVariant(tenantId, req.params.id, req.body);
      res.status(201).json({ data: variant });
    } catch (error) {
      res
        .status((error as Error).message.includes('not found') ? 404 : 400)
        .json({ error: (error as Error).message });
    }
  }
);

app.put(
  '/api/products/:id/variants/:variantId',
  validateRequest(VariantUpdateSchema),
  (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const variant = productService.updateVariant(
        tenantId,
        req.params.id,
        req.params.variantId,
        req.body
      );
      res.json({ data: variant });
    } catch (error) {
      res
        .status((error as Error).message.includes('not found') ? 404 : 400)
        .json({ error: (error as Error).message });
    }
  }
);

app.delete('/api/products/:id/variants/:variantId', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const removed = productService.removeVariant(tenantId, req.params.id, req.params.variantId);
    if (!removed) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    return res.status(204).send();
  } catch (error) {
    return res
      .status((error as Error).message.includes('not found') ? 404 : 400)
      .json({ error: (error as Error).message });
  }
});

app.post(
  '/api/products/:id/images',
  validateRequest(ProductImageSchema),
  (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const image = productService.addImage(tenantId, req.params.id, req.body);
      res.status(201).json({ data: image });
    } catch (error) {
      res
        .status((error as Error).message.includes('not found') ? 404 : 400)
        .json({ error: (error as Error).message });
    }
  }
);

app.delete('/api/products/:id/images/:imageId', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const removed = productService.removeImage(tenantId, req.params.id, req.params.imageId);
    if (!removed) {
      return res.status(404).json({ error: 'Image not found' });
    }
    return res.status(204).send();
  } catch (error) {
    return res
      .status((error as Error).message.includes('not found') ? 404 : 400)
      .json({ error: (error as Error).message });
  }
});

app.get('/api/products/:id/recommendations', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const limit = Number(req.query.limit || 5);
    const recommendations = productService.getRecommendations(tenantId, req.params.id, limit);
    res.json({ data: recommendations });
  } catch (error) {
    res
      .status((error as Error).message.includes('not found') ? 404 : 400)
      .json({ error: (error as Error).message });
  }
});

app.get('/api/inventory/:productId', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const inventory = productService.getInventory(tenantId, req.params.productId);
    res.json({ data: inventory });
  } catch (error) {
    res
      .status((error as Error).message.includes('not found') ? 404 : 400)
      .json({ error: (error as Error).message });
  }
});

app.post(
  '/api/inventory/:productId/adjust',
  validateRequest(InventoryAdjustSchema),
  (req: Request, res: Response) => {
    try {
      const result = productService.adjustStock(
        req.body.tenantId,
        req.params.productId,
        req.body.delta,
        req.body.reason,
        req.body.variantId
      );
      res.json({ data: result });
    } catch (error) {
      const message = (error as Error).message;
      const status = message.includes('not found')
        ? 404
        : message.includes('Insufficient')
          ? 409
          : 400;
      res.status(status).json({ error: message });
    }
  }
);

app.put(
  '/api/inventory/:productId/set',
  validateRequest(InventorySetSchema),
  (req: Request, res: Response) => {
    try {
      const result = productService.setStock(
        req.body.tenantId,
        req.params.productId,
        req.body.quantity,
        req.body.reason,
        req.body.variantId
      );
      res.json({ data: result });
    } catch (error) {
      const message = (error as Error).message;
      const status = message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: message });
    }
  }
);

const PORT = parseInt(String(process.env.PORT || process.env.PRODUCT_SERVICE_PORT || 3004));
const server = app.listen(PORT, () => {
  logger.info(`Product service running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    logger.info('Server closed');
    await closeRateLimiter();
    process.exit(0);
  });
});
