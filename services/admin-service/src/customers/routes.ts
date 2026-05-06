import { Request, Response, Router } from 'express';
import { ZodError, z } from 'zod';
import { AdminSessionUser } from '../types';
import { CustomerCrmService } from './customer-crm-service';
import {
  CustomerAddress,
  CustomerConsent,
  CustomerContact,
  CustomerNote,
  CustomerPrivacyRequest,
} from './types';
import {
  CustomerAddressBodySchema,
  CustomerConsentBodySchema,
  CustomerContactBodySchema,
  CustomerCreateBodySchema,
  CustomerExportBodySchema,
  CustomerListQuerySchema,
  CustomerNoteBodySchema,
  CustomerPrivacyRequestBodySchema,
  CustomerRiskBodySchema,
  CustomerTagAssignmentBodySchema,
  CustomerTagBodySchema,
  CustomerUpdateBodySchema,
} from './validation';

export type CustomerCrmRequestContext = {
  tenantId: string;
  user: AdminSessionUser;
};

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
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

export function createCustomerCrmRouter(
  getContext: (req: Request, res: Response) => CustomerCrmRequestContext,
  service = new CustomerCrmService()
): Router {
  const router = Router();

  router.get('/customers', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_clientes');
      const filters = parse(CustomerListQuerySchema, req.query);
      const data = await service.listCustomers(
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

  router.post('/customers', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'criar_clientes');
      const body = parse(CustomerCreateBodySchema, req.body || {});
      const data = await service.createCustomer(tenantId, body, user, requestMeta(req));
      res.status(201).json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_clientes');
      const data = await service.getDetails(
        tenantId,
        req.params.customerId,
        service.permissionsFor(user)
      );
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/customers/:customerId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_clientes');
      const body = parse(CustomerUpdateBodySchema, req.body || {});
      const data = await service.updateCustomer(
        tenantId,
        req.params.customerId,
        body,
        user,
        requestMeta(req)
      );
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/customers/:customerId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'excluir_clientes');
      await service.softDeleteCustomer(tenantId, req.params.customerId, user, requestMeta(req));
      res.status(204).send();
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId/summary', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_clientes');
      res.json({ data: await service.getSummary(tenantId, req.params.customerId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId/orders', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_historico_pedidos_cliente');
      res.json({
        data: await service.listOrders(
          tenantId,
          req.params.customerId,
          paginationFromQuery(req.query as Record<string, unknown>)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId/products', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_historico_pedidos_cliente');
      res.json({ data: await service.listProducts(tenantId, req.params.customerId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId/financial', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_financeiro_cliente');
      res.json({ data: await service.getFinancial(tenantId, req.params.customerId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId/addresses', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_clientes');
      res.json({
        data: await service.listChild<CustomerAddress>(
          tenantId,
          'customer_addresses',
          req.params.customerId
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/:customerId/addresses', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_clientes');
      const body = parse(CustomerAddressBodySchema, req.body || {});
      res.status(201).json({
        data: await service.upsertChild<CustomerAddress>(
          tenantId,
          'customer_addresses',
          req.params.customerId,
          body,
          user,
          'endereco.criado',
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/customers/:customerId/addresses/:addressId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_clientes');
      const body = parse(CustomerAddressBodySchema.partial(), req.body || {});
      res.json({
        data: await service.upsertChild<CustomerAddress>(
          tenantId,
          'customer_addresses',
          req.params.customerId,
          body,
          user,
          'endereco.alterado',
          requestMeta(req),
          req.params.addressId
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/customers/:customerId/addresses/:addressId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_clientes');
      await service.deleteChild(
        tenantId,
        'customer_addresses',
        req.params.customerId,
        req.params.addressId,
        user,
        'endereco.excluido',
        requestMeta(req)
      );
      res.status(204).send();
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId/contacts', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_clientes');
      res.json({
        data: await service.listChild<CustomerContact>(
          tenantId,
          'customer_contacts',
          req.params.customerId
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/:customerId/contacts', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_clientes');
      const body = parse(CustomerContactBodySchema, req.body || {});
      res.status(201).json({
        data: await service.upsertChild<CustomerContact>(
          tenantId,
          'customer_contacts',
          req.params.customerId,
          body,
          user,
          'contato.criado',
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/customers/:customerId/contacts/:contactId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_clientes');
      const body = parse(CustomerContactBodySchema.partial(), req.body || {});
      res.json({
        data: await service.upsertChild<CustomerContact>(
          tenantId,
          'customer_contacts',
          req.params.customerId,
          body,
          user,
          'contato.alterado',
          requestMeta(req),
          req.params.contactId
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/customers/:customerId/contacts/:contactId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_clientes');
      await service.deleteChild(
        tenantId,
        'customer_contacts',
        req.params.customerId,
        req.params.contactId,
        user,
        'contato.excluido',
        requestMeta(req)
      );
      res.status(204).send();
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customer-tags', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_clientes');
      res.json({ data: await service.listTags(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customer-tags', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_tags_cliente');
      const body = parse(CustomerTagBodySchema, req.body || {});
      res.status(201).json({ data: await service.createTag(tenantId, body, user) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/:customerId/tags', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_tags_cliente');
      const body = parse(CustomerTagAssignmentBodySchema, req.body || {});
      res.json({
        data: await service.addTag(tenantId, req.params.customerId, body.tag, user, requestMeta(req)),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/customers/:customerId/tags/:tagId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_tags_cliente');
      res.json({
        data: await service.removeTag(
          tenantId,
          req.params.customerId,
          decodeURIComponent(req.params.tagId),
          user,
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId/notes', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_observacoes_cliente');
      res.json({
        data: await service.listChild<CustomerNote>(tenantId, 'customer_notes', req.params.customerId),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/:customerId/notes', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_observacoes_cliente');
      const body = parse(CustomerNoteBodySchema, req.body || {});
      res.status(201).json({
        data: await service.upsertChild<CustomerNote>(
          tenantId,
          'customer_notes',
          req.params.customerId,
          { ...body, userId: user.id },
          user,
          'observacao.criada',
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/customers/:customerId/notes/:noteId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_observacoes_cliente');
      const body = parse(CustomerNoteBodySchema.partial(), req.body || {});
      res.json({
        data: await service.upsertChild<CustomerNote>(
          tenantId,
          'customer_notes',
          req.params.customerId,
          { ...body, userId: user.id },
          user,
          'observacao.alterada',
          requestMeta(req),
          req.params.noteId
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/customers/:customerId/notes/:noteId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_observacoes_cliente');
      await service.deleteChild(
        tenantId,
        'customer_notes',
        req.params.customerId,
        req.params.noteId,
        user,
        'observacao.excluida',
        requestMeta(req)
      );
      res.status(204).send();
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId/consents', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_consentimentos_cliente');
      res.json({
        data: await service.listChild<CustomerConsent>(
          tenantId,
          'customer_consents',
          req.params.customerId
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/:customerId/consents', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_consentimentos_cliente');
      const body = parse(CustomerConsentBodySchema, req.body || {});
      res.status(201).json({
        data: await service.upsertChild<CustomerConsent>(
          tenantId,
          'customer_consents',
          req.params.customerId,
          {
            ...body,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            consentedAt: body.consentedAt || new Date().toISOString(),
          },
          user,
          'consentimento.concedido',
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/:customerId/consents/revoke', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'gerenciar_consentimentos_cliente');
      res.json({ data: await service.revokeConsent(tenantId, req.params.customerId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/:customerId/privacy/export', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'exportar_clientes');
      const permissions = service.permissionsFor(user);
      res.json({
        data: await service.exportCustomer(
          tenantId,
          req.params.customerId,
          permissions,
          user,
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/:customerId/privacy/anonymize', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'anonimizar_clientes');
      res.json({ data: await service.anonymizeCustomer(tenantId, req.params.customerId, user, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/:customerId/privacy/request', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'editar_clientes');
      const body = parse(CustomerPrivacyRequestBodySchema, req.body || {});
      res.status(201).json({
        data: await service.upsertChild<CustomerPrivacyRequest>(
          tenantId,
          'customer_privacy_requests',
          req.params.customerId,
          {
            type: body.type,
            status: 'aberta',
            requestedAt: new Date().toISOString(),
            handledBy: user.id,
            notes: body.notes,
          },
          user,
          'lgpd.solicitacao.criada',
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/customers/:customerId/block', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'bloquear_cliente');
      res.json({
        data: await service.updateRiskStatus(
          tenantId,
          req.params.customerId,
          'bloqueado',
          String(req.body?.reason || req.body?.blockedReason || ''),
          user,
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/customers/:customerId/unblock', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'bloquear_cliente');
      res.json({
        data: await service.updateRiskStatus(
          tenantId,
          req.params.customerId,
          'liberado_manualmente',
          String(req.body?.reason || ''),
          user,
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/customers/:customerId/risk-status', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'bloquear_cliente');
      const body = parse(CustomerRiskBodySchema, req.body || {});
      res.json({
        data: await service.updateRiskStatus(
          tenantId,
          req.params.customerId,
          body.riskStatus,
          body.reason,
          user,
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/customers/:customerId/audit-logs', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'visualizar_logs_cliente');
      res.json({
        data: await service.listAuditLogs(
          tenantId,
          req.params.customerId,
          paginationFromQuery(req.query as Record<string, unknown>)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/customers/export', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertPermission(user, 'exportar_clientes');
      const body = parse(CustomerExportBodySchema, req.body || {});
      if (body.format !== 'csv') {
        throw new Error('Exportacao XLSX/PDF depende de processamento dedicado no backend. CSV esta habilitado.');
      }
      res.json({
        data: await service.exportCustomers(
          tenantId,
          body.filters,
          service.permissionsFor(user),
          user,
          requestMeta(req)
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
