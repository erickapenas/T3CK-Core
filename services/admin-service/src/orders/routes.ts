import { Request, Response, Router } from 'express';
import { ZodError, z } from 'zod';
import { AdminSessionUser } from '../types';
import { OrderManagementService } from './order-management-service';
import {
  OrderBulkIdsBodySchema,
  OrderBulkStatusBodySchema,
  OrderCancelBodySchema,
  OrderCreateBodySchema,
  OrderExportBodySchema,
  OrderItemBodySchema,
  OrderListQuerySchema,
  OrderNoteBodySchema,
  OrderPaymentBodySchema,
  OrderRefundBodySchema,
  OrderShippingBodySchema,
  OrderStatusBodySchema,
  OrderUpdateBodySchema,
} from './validation';

export type OrderManagementRequestContext = {
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

function assertOrderUpdatePermissions(user: AdminSessionUser, body: Record<string, unknown>): void {
  assertPermission(user, 'editar_pedidos');
  if ('status' in body) assertPermission(user, 'alterar_status_pedido');
}

export function createOrderManagementRouter(
  getContext: (req: Request, res: Response) => OrderManagementRequestContext,
  service = new OrderManagementService()
): Router {
  const router = Router();

  router.get('/orders', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_pedidos');
      const filters = parse(OrderListQuerySchema, req.query);
      const data = await service.listOrders(
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

  router.post('/orders', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'criar_pedidos');
      const body = parse(OrderCreateBodySchema, req.body || {});
      const data = await service.createOrder(tenantId, body, user, requestMeta(req));
      res.status(201).json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/export', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'exportar_pedidos');
      const body = parse(OrderExportBodySchema, req.body || {});
      const data = await service.exportOrders(
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

  router.post('/orders/bulk/status', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'executar_acoes_em_massa_pedidos');
      assertPermission(user, 'alterar_status_pedido');
      const body = parse(OrderBulkStatusBodySchema, req.body || {});
      res.json({
        data: await service.bulkStatus(tenantId, body.orderIds, body.status, body.reason, user, requestMeta(req)),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/bulk/export', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'executar_acoes_em_massa_pedidos');
      assertPermission(user, 'exportar_pedidos');
      const body = parse(OrderBulkIdsBodySchema, req.body || {});
      const data = await service.exportOrders(
        tenantId,
        { page: 1, limit: body.orderIds.length },
        'csv',
        service.permissionsFor(user),
        user,
        requestMeta(req)
      );
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/bulk/stock-check', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'executar_acoes_em_massa_pedidos');
      assertPermission(user, 'visualizar_estoque_pedido');
      const body = parse(OrderBulkIdsBodySchema, req.body || {});
      res.json({ data: await service.bulkStockCheck(tenantId, body.orderIds) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_pedidos');
      res.json({
        data: await service.getDetails(tenantId, req.params.orderId, service.permissionsFor(user)),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/orders/:orderId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertOrderUpdatePermissions(user, req.body || {});
      const body = parse(OrderUpdateBodySchema, req.body || {});
      res.json({ data: await service.updateOrder(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/orders/:orderId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'excluir_pedidos');
      await service.softDeleteOrder(tenantId, req.params.orderId, user, requestMeta(req));
      res.status(204).send();
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/orders/:orderId/status', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'alterar_status_pedido');
      const body = parse(OrderStatusBodySchema, req.body || {});
      res.json({ data: await service.updateStatus(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/cancel', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'cancelar_pedidos');
      const body = parse(OrderCancelBodySchema, req.body || {});
      res.json({ data: await service.cancelOrder(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/duplicate', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'criar_pedidos');
      res.status(201).json({ data: await service.duplicateOrder(tenantId, req.params.orderId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/items', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_pedidos');
      const details = await service.getDetails(tenantId, req.params.orderId, service.permissionsFor(user));
      res.json({ data: details.order.items });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/items', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_pedidos');
      const body = parse(OrderItemBodySchema, req.body || {});
      res.status(201).json({ data: await service.addItem(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/orders/:orderId/items/:itemId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_pedidos');
      const body = parse(OrderItemBodySchema.partial(), req.body || {});
      res.json({ data: await service.updateItem(tenantId, req.params.orderId, req.params.itemId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/orders/:orderId/items/:itemId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_pedidos');
      res.json({ data: await service.deleteItem(tenantId, req.params.orderId, req.params.itemId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/recalculate', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_pedidos');
      res.json({ data: await service.recalculateTotals(tenantId, req.params.orderId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/totals', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_pedidos');
      const details = await service.getDetails(tenantId, req.params.orderId, service.permissionsFor(user));
      const order = details.order;
      res.json({
        data: {
          subtotal: order.subtotal,
          discountTotal: order.discountTotal,
          shippingTotal: order.shippingTotal,
          taxTotal: order.taxTotal,
          feeTotal: order.feeTotal,
          total: order.total,
          paidTotal: order.paidTotal,
          refundedTotal: order.refundedTotal,
          netTotal: order.netTotal,
        },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/payment', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_pagamento_pedido');
      res.json({ data: await service.listPayments(tenantId, req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/payment/confirm-manual', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'confirmar_pagamento_manual');
      const body = parse(OrderPaymentBodySchema, req.body || {});
      res.json({ data: await service.confirmPaymentManual(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/payment/refund', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'reembolsar_pedido');
      const body = parse(OrderRefundBodySchema, req.body || {});
      res.json({ data: await service.refundOrder(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/payment/check-status', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_pagamento_pedido');
      res.json({ data: await service.checkPaymentStatus(tenantId, req.params.orderId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/stock', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_estoque_pedido');
      res.json({ data: await service.getStock(tenantId, req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/stock/check', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_estoque_pedido');
      res.json({ data: await service.stockCheck(tenantId, req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/stock/reserve', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'reservar_estoque_pedido');
      res.json({ data: await service.reserveStock(tenantId, req.params.orderId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/stock/release', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'reservar_estoque_pedido');
      res.json({ data: await service.releaseStock(tenantId, req.params.orderId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/stock/decrease', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'baixar_estoque_pedido');
      res.json({ data: await service.decreaseStock(tenantId, req.params.orderId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/stock/revert', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'baixar_estoque_pedido');
      res.json({ data: await service.revertStock(tenantId, req.params.orderId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/shipping', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_envio_pedido');
      res.json({ data: await service.getShipping(tenantId, req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/shipping', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'atualizar_rastreio_pedido');
      const body = parse(OrderShippingBodySchema, req.body || {});
      res.status(201).json({ data: await service.saveShipping(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/orders/:orderId/shipping/status', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'atualizar_rastreio_pedido');
      const status = String((req.body || {}).status || '');
      res.json({ data: await service.updateShippingStatus(tenantId, req.params.orderId, status, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/shipping/tracking', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'atualizar_rastreio_pedido');
      const body = parse(OrderShippingBodySchema, req.body || {});
      res.status(201).json({ data: await service.saveShipping(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/shipping/tracking/update', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'atualizar_rastreio_pedido');
      const body = parse(OrderShippingBodySchema, req.body || {});
      res.json({ data: await service.updateTracking(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/history', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_pedidos');
      res.json({ data: await service.listHistory(tenantId, req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/notes', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_pedidos');
      res.json({ data: await service.listNotes(tenantId, req.params.orderId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/orders/:orderId/notes', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_observacoes_pedido');
      const body = parse(OrderNoteBodySchema, req.body || {});
      res.status(201).json({ data: await service.addNote(tenantId, req.params.orderId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/orders/:orderId/notes/:noteId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_observacoes_pedido');
      const body = parse(OrderNoteBodySchema.partial(), req.body || {});
      res.json({ data: await service.updateNote(tenantId, req.params.orderId, req.params.noteId, body, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/orders/:orderId/notes/:noteId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_observacoes_pedido');
      res.json({ data: await service.deleteNote(tenantId, req.params.orderId, req.params.noteId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/orders/:orderId/audit-logs', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_pedido');
      const details = await service.getDetails(tenantId, req.params.orderId, service.permissionsFor(user));
      res.json({ data: details.auditLogs });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
