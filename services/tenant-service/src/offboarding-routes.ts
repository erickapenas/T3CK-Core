import { Router, Request, Response } from 'express';
import { Logger } from '@t3ck/shared/logger';
import { TenantOffboardingService, OffboardingRequest } from './offboarding';

interface TenantOffboardingRouter {
  router: Router;
}

/**
 * Create tenant offboarding endpoints
 */
export function createOffboardingRouter(
  offboardingService: TenantOffboardingService,
  logger: Logger
): TenantOffboardingRouter {
  const router = Router();

  /**
   * POST /offboarding/initiate
   * Initiate tenant offboarding process
   * Required: tenantId, reason
   */
  router.post('/offboarding/initiate', async (req: Request, res: Response) => {
    try {
      const { tenantId, reason, exportData, deleteImmediately, approvedBy } = req.body;

      if (!tenantId || !reason) {
        return res.status(400).json({
          error: 'Missing required fields: tenantId, reason',
        });
      }

      const offboardingRequest: OffboardingRequest = {
        tenantId,
        reason,
        exportData: exportData || false,
        deleteImmediately: deleteImmediately || false,
        approvedBy: approvedBy || req.user?.id,
      };

      await offboardingService.initiateOffboarding(offboardingRequest);

      res.json({
        success: true,
        message: `Offboarding initiated for tenant: ${tenantId}`,
      });
    } catch (error) {
      logger.error('[OffboardingRouter] Initiate offboarding failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Offboarding initiation failed',
      });
    }
  });

  /**
   * POST /offboarding/export
   * Export tenant data without offboarding
   */
  router.post('/offboarding/export', async (req: Request, res: Response) => {
    try {
      const { tenantId, format } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Missing required field: tenantId',
        });
      }

      const exportResult = await offboardingService.exportTenantData(
        tenantId,
        format || 'json'
      );

      res.json({
        success: true,
        export: exportResult,
      });
    } catch (error) {
      logger.error('[OffboardingRouter] Data export failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Data export failed',
      });
    }
  });

  /**
   * POST /offboarding/revoke-access
   * Revoke all access tokens for a tenant
   */
  router.post('/offboarding/revoke-access', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Missing required field: tenantId',
        });
      }

      await offboardingService.revokeAccessTokens(tenantId);

      res.json({
        success: true,
        message: `Access tokens revoked for tenant: ${tenantId}`,
      });
    } catch (error) {
      logger.error('[OffboardingRouter] Token revocation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Token revocation failed',
      });
    }
  });

  /**
   * POST /offboarding/delete
   * Permanently delete tenant data
   */
  router.post('/offboarding/delete', async (req: Request, res: Response) => {
    try {
      const { tenantId, confirm } = req.body;

      if (!tenantId || !confirm) {
        return res.status(400).json({
          error: 'Missing required fields: tenantId, confirm',
        });
      }

      await offboardingService.deleteTenantData(tenantId);

      res.json({
        success: true,
        message: `Tenant data deleted: ${tenantId}`,
      });
    } catch (error) {
      logger.error('[OffboardingRouter] Data deletion failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Data deletion failed',
      });
    }
  });

  /**
   * GET /offboarding/audit/:tenantId
   * Get offboarding audit trail for a tenant
   */
  router.get('/offboarding/audit/:tenantId', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      const trail = offboardingService.getAuditTrail(tenantId);

      res.json({
        tenantId,
        auditTrail: trail,
      });
    } catch (error) {
      logger.error('[OffboardingRouter] Get audit trail failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to retrieve audit trail',
      });
    }
  });

  return { router };
}

export { TenantOffboardingRouter };
