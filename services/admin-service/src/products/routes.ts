import { Request, Response, Router } from 'express';
import { ZodError, z } from 'zod';
import { AdminSessionUser } from '../types';
import { ProductCatalogService } from './product-catalog-service';
import {
  BrandBodySchema,
  CategoryBodySchema,
  ProductBodySchema,
  ProductExportBodySchema,
  ProductImageBodySchema,
  ProductImportBodySchema,
  ProductListQuerySchema,
  ProductStatusBodySchema,
  ProductUpdateBodySchema,
  ProductVariantBodySchema,
  StockMovementBodySchema,
  SuggestionActionBodySchema,
} from './validation';

export type ProductRequestContext = {
  tenantId: string;
  user: AdminSessionUser;
};

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string | string[];
};

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value);
}

function requestMeta(req: Request): RequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Dados invalidos',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }
  const message = (error as Error).message || 'Erro inesperado';
  const normalized = message.toLowerCase();
  const status = normalized.includes('permissao') || normalized.includes('permission')
    ? 403
    : normalized.includes('nao encontrado') || normalized.includes('not found')
      ? 404
      : normalized.includes('duplicado')
        ? 409
        : 400;
  res.status(status).json({ error: message });
}

function hasPermission(user: AdminSessionUser, permission: string): boolean {
  return user.role === 'admin' || Boolean(user.permissions?.includes(permission));
}

function assertPermission(user: AdminSessionUser, permission: string): void {
  if (!hasPermission(user, permission)) {
    throw new Error(`Permissao obrigatoria: ${permission}`);
  }
}

function paginationFromQuery(query: Record<string, unknown>): { page: number; limit: number } {
  return {
    page: Number(query.page || 1),
    limit: Number(query.limit || 20),
  };
}

function assertProductUpdatePermissions(user: AdminSessionUser, body: Record<string, unknown>): void {
  assertPermission(user, 'editar_produtos');
  if ('price' in body || 'promotionalPrice' in body) assertPermission(user, 'editar_preco_produto');
  if ('costPrice' in body) assertPermission(user, 'editar_custo_produto');
  if (['ncm', 'cfop', 'cest', 'taxOrigin', 'taxableUnit', 'fiscalCode'].some((key) => key in body)) {
    assertPermission(user, 'editar_dados_fiscais_produto');
  }
}

export function createProductCatalogRouter(
  getContext: (req: Request, res: Response) => ProductRequestContext,
  service = new ProductCatalogService()
): Router {
  const router = Router();

  router.get('/products', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_produtos');
      const filters = parse(ProductListQuerySchema, req.query);
      const data = await service.listProducts(
        tenantId,
        paginationFromQuery(filters),
        filters,
        service.permissionsFor(user)
      );
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/products', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'criar_produtos');
      const body = parse(ProductBodySchema, req.body || {});
      const data = await service.createProduct(tenantId, body, user, requestMeta(req));
      res.status(201).json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/products/import', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'importar_produtos');
      const body = parse(ProductImportBodySchema, req.body || {});
      const data = await service.importProducts(tenantId, body.items, body.mode, user, requestMeta(req));
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/products/export', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'exportar_produtos');
      const body = parse(ProductExportBodySchema, req.body || {});
      const data = await service.exportProducts(
        tenantId,
        body.filters,
        body.format,
        service.permissionsFor(user),
        user,
        requestMeta(req)
      );
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/products/import/template', async (_req, res) => {
    try {
      res.json({ data: service.productImportTemplate() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/product-categories', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_produtos');
      res.json({ data: await service.listCategories(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/product-categories', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      const body = parse(CategoryBodySchema, req.body || {});
      res.status(201).json({ data: await service.saveCategory(tenantId, body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/product-categories/:categoryId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      const body = parse(CategoryBodySchema.partial(), req.body || {});
      res.json({ data: await service.saveCategory(tenantId, body, req.params.categoryId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/product-categories/:categoryId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      res.json({ data: await service.deleteCategory(tenantId, req.params.categoryId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/brands', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_produtos');
      res.json({ data: await service.listBrands(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/brands', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      const body = parse(BrandBodySchema, req.body || {});
      res.status(201).json({ data: await service.saveBrand(tenantId, body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/brands/:brandId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      const body = parse(BrandBodySchema.partial(), req.body || {});
      res.json({ data: await service.saveBrand(tenantId, body, req.params.brandId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/brands/:brandId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      res.json({ data: await service.deleteBrand(tenantId, req.params.brandId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/inventory/intelligence', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_alertas_estoque');
      const filters = parse(ProductListQuerySchema.partial(), req.query);
      res.json({ data: await service.getInventoryIntelligence(tenantId, filters) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/inventory/alerts', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_alertas_estoque');
      const filters = parse(ProductListQuerySchema.partial(), req.query);
      const data = await service.getInventoryIntelligence(tenantId, filters);
      res.json({ data: data.alerts });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/inventory/alerts/:alertId/read', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_alertas_estoque');
      res.json({ data: await service.updateAlertStatus(tenantId, req.params.alertId, 'visto') });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/inventory/alerts/:alertId/resolve', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_recomendacoes_estoque');
      res.json({ data: await service.updateAlertStatus(tenantId, req.params.alertId, 'resolvido') });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/inventory/replenishment-suggestions', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_alertas_estoque');
      const filters = parse(ProductListQuerySchema.partial(), req.query);
      const data = await service.getInventoryIntelligence(tenantId, filters);
      res.json({ data: data.suggestions });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/inventory/replenishment-suggestions/:suggestionId/accept', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_recomendacoes_estoque');
      parse(SuggestionActionBodySchema, req.body || {});
      res.json({ data: await service.updateSuggestionStatus(tenantId, req.params.suggestionId, 'aceita', user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/inventory/replenishment-suggestions/:suggestionId/ignore', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_recomendacoes_estoque');
      parse(SuggestionActionBodySchema, req.body || {});
      res.json({ data: await service.updateSuggestionStatus(tenantId, req.params.suggestionId, 'ignorada', user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/stock-movements', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_movimentacoes_estoque');
      res.json({
        data: await service.listStockMovements(tenantId, {
          page: Number(req.query.page || 1),
          limit: Number(req.query.limit || 20),
        }),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/products/:productId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_produtos');
      res.json({ data: await service.getDetails(tenantId, req.params.productId, service.permissionsFor(user)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/products/:productId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertProductUpdatePermissions(user, req.body || {});
      const body = parse(ProductUpdateBodySchema, req.body || {});
      res.json({ data: await service.updateProduct(tenantId, req.params.productId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/products/:productId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'excluir_produtos');
      res.json({ data: await service.archiveProduct(tenantId, req.params.productId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/products/:productId/status', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'arquivar_produtos');
      const body = parse(ProductStatusBodySchema, req.body || {});
      res.json({ data: await service.updateStatus(tenantId, req.params.productId, body.status, body.reason, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/products/:productId/duplicate', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'duplicar_produtos');
      res.status(201).json({ data: await service.duplicateProduct(tenantId, req.params.productId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/products/:productId/variants', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_produtos');
      res.json({ data: await service.listVariants(tenantId, req.params.productId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/products/:productId/variants', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      const body = parse(ProductVariantBodySchema, req.body || {});
      res.status(201).json({ data: await service.createVariant(tenantId, req.params.productId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/products/:productId/variants/:variantId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      const body = parse(ProductVariantBodySchema.partial(), req.body || {});
      res.json({ data: await service.updateVariant(tenantId, req.params.productId, req.params.variantId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/products/:productId/variants/:variantId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      res.json({ data: await service.deleteVariant(tenantId, req.params.productId, req.params.variantId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/products/:productId/images', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_produtos');
      res.json({ data: await service.listImages(tenantId, req.params.productId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/products/:productId/images', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      const body = parse(ProductImageBodySchema, req.body || {});
      res.status(201).json({ data: await service.addImage(tenantId, req.params.productId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/products/:productId/images/:imageId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      res.json({ data: await service.deleteImage(tenantId, req.params.productId, req.params.imageId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/products/:productId/images/:imageId/main', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_produtos');
      res.json({ data: await service.setMainImage(tenantId, req.params.productId, req.params.imageId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/products/:productId/stock', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_estoque');
      res.json({ data: await service.getStock(tenantId, req.params.productId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  const stockOperation = (
    operation: 'adjust' | 'increase' | 'decrease' | 'reserve' | 'release' | 'block' | 'unblock',
    permission: string
  ) => async (req: Request, res: Response) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, permission);
      const body = parse(StockMovementBodySchema, req.body || {});
      res.json({ data: await service.changeStock(tenantId, req.params.productId, operation, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  };

  router.post('/products/:productId/stock/adjust', stockOperation('adjust', 'ajustar_estoque'));
  router.post('/products/:productId/stock/increase', stockOperation('increase', 'criar_movimentacao_estoque'));
  router.post('/products/:productId/stock/decrease', stockOperation('decrease', 'criar_movimentacao_estoque'));
  router.post('/products/:productId/stock/reserve', stockOperation('reserve', 'reservar_estoque'));
  router.post('/products/:productId/stock/release', stockOperation('release', 'liberar_reserva_estoque'));
  router.post('/products/:productId/stock/block', stockOperation('block', 'bloquear_estoque'));
  router.post('/products/:productId/stock/unblock', stockOperation('unblock', 'bloquear_estoque'));

  router.get('/products/:productId/stock-movements', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_movimentacoes_estoque');
      res.json({
        data: await service.listStockMovements(tenantId, {
          productId: req.params.productId,
          page: Number(req.query.page || 1),
          limit: Number(req.query.limit || 20),
        }),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/products/:productId/audit-logs', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_auditoria');
      const details = await service.getDetails(tenantId, req.params.productId, service.permissionsFor(user));
      res.json({ data: details.auditLogs });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
