import { Request, Response, Router } from 'express';
import { ZodError, z } from 'zod';
import { AdminSessionUser } from '../types';
import { MigrationService } from './migration-service';
import {
  MigrationChecklistSchema,
  MigrationColumnMappingsSchema,
  MigrationConnectionSchema,
  MigrationDiscoverySchema,
  MigrationProjectCreateSchema,
  MigrationProjectUpdateSchema,
} from './validation';

export type MigrationRequestContext = {
  tenantId: string;
  user: AdminSessionUser;
};

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value);
}

function requestMeta(req: Request): { ipAddress?: string; userAgent?: string | string[] } {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Dados invalidos',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }
  const message = (error as Error).message || 'Erro inesperado';
  const normalized = message.toLowerCase();
  const status = normalized.includes('permissao')
    ? 403
    : normalized.includes('nao encontrado') || normalized.includes('not found')
      ? 404
      : 400;
  res.status(status).json({ error: message });
}

export const MIGRATION_PERMISSIONS = {
  read: 'visualizar_migracao',
  manage: 'gerenciar_migracao',
  execute: 'executar_migracao',
  approveGoLive: 'aprovar_go_live_migracao',
} as const;

export function hasAnyMigrationPermission(user: AdminSessionUser, permissions: string[]): boolean {
  return user.role === 'admin' || permissions.some((permission) => user.permissions?.includes(permission));
}

export function canReadMigration(user: AdminSessionUser): boolean {
  return hasAnyMigrationPermission(user, [
    MIGRATION_PERMISSIONS.read,
    MIGRATION_PERMISSIONS.manage,
    MIGRATION_PERMISSIONS.execute,
    MIGRATION_PERMISSIONS.approveGoLive,
  ]);
}

export function canManageMigration(user: AdminSessionUser): boolean {
  return hasAnyMigrationPermission(user, [MIGRATION_PERMISSIONS.manage]);
}

export function canExecuteMigration(user: AdminSessionUser): boolean {
  return hasAnyMigrationPermission(user, [MIGRATION_PERMISSIONS.manage, MIGRATION_PERMISSIONS.execute]);
}

export function canApproveMigrationGoLive(user: AdminSessionUser): boolean {
  return hasAnyMigrationPermission(user, [
    MIGRATION_PERMISSIONS.manage,
    MIGRATION_PERMISSIONS.approveGoLive,
  ]);
}

function assertRead(user: AdminSessionUser): void {
  if (!canReadMigration(user)) {
    throw new Error(`Permissao obrigatoria: ${MIGRATION_PERMISSIONS.read}`);
  }
}

function assertWrite(user: AdminSessionUser): void {
  if (!canManageMigration(user)) {
    throw new Error(`Permissao obrigatoria: ${MIGRATION_PERMISSIONS.manage}`);
  }
}

function assertExecute(user: AdminSessionUser): void {
  if (!canExecuteMigration(user)) {
    throw new Error(`Permissao obrigatoria: ${MIGRATION_PERMISSIONS.execute}`);
  }
}

function assertApproveGoLive(user: AdminSessionUser): void {
  if (!canApproveMigrationGoLive(user)) {
    throw new Error(`Permissao obrigatoria: ${MIGRATION_PERMISSIONS.approveGoLive}`);
  }
}

export function createMigrationRouter(
  getContext: (req: Request, res: Response) => MigrationRequestContext,
  service = new MigrationService()
): Router {
  const router = Router();

  router.get('/migration/projects', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.listProjects(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/migration/projects', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWrite(user);
      const body = parse(MigrationProjectCreateSchema, req.body || {});
      res.status(201).json({ data: await service.createProject(tenantId, user, body, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/migration/projects/:projectId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.getProject(tenantId, req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/migration/projects/:projectId', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWrite(user);
      const body = parse(MigrationProjectUpdateSchema, req.body || {});
      res.json({ data: await service.updateProject(tenantId, user, req.params.projectId, body, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/migration/projects/:projectId/connect', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertWrite(user);
      const body = parse(MigrationConnectionSchema, req.body || {});
      res.json({ data: await service.connect(tenantId, user, req.params.projectId, body, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/migration/projects/:projectId/discover', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertExecute(user);
      const body = parse(MigrationDiscoverySchema, req.body || {});
      res.json({ data: await service.discover(tenantId, user, req.params.projectId, requestMeta(req), body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/migration/projects/:projectId/validate', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertExecute(user);
      res.json({ data: await service.validate(tenantId, user, req.params.projectId, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/migration/projects/:projectId/import', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertExecute(user);
      res.json({ data: await service.importToStaging(tenantId, user, req.params.projectId, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/migration/projects/:projectId/incremental-sync', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertExecute(user);
      res.json({ data: await service.incrementalSync(tenantId, user, req.params.projectId, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/migration/projects/:projectId/go-live-checklist', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertApproveGoLive(user);
      const body = parse(MigrationChecklistSchema, req.body || {});
      res.json({ data: await service.updateChecklist(tenantId, user, req.params.projectId, body.checklist, requestMeta(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/migration/projects/:projectId/report', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.report(tenantId, req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/migration/projects/:projectId/pipeline', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.pipelineSnapshot(tenantId, req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/migration/projects/:projectId/runs', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.listRuns(tenantId, req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/migration/projects/:projectId/records', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.listRecords(tenantId, req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/migration/projects/:projectId/mappings', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.listSourceMappings(tenantId, req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/migration/projects/:projectId/column-mappings', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.listColumnMappings(tenantId, req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put('/migration/projects/:projectId/column-mappings', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertExecute(user);
      const body = parse(MigrationColumnMappingsSchema, req.body || {});
      res.json({
        data: await service.saveColumnMappings(tenantId, user, req.params.projectId, body.mappings, requestMeta(req)),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/migration/projects/:projectId/normalized-records', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.listNormalizedRecords(tenantId, req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/migration/projects/:projectId/redirects', async (req, res) => {
    try {
      const { tenantId, user } = getContext(req, res);
      assertRead(user);
      res.json({ data: await service.listRedirects(tenantId, req.params.projectId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
