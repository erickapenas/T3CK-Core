import 'reflect-metadata';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { ProvisioningFormService } from './provisioning-form';
import {
  Logger,
  validateRequest,
  ProvisioningSubmitSchema,
  ProvisioningStatusParamSchema,
  createTenantAwareRateLimiter,
  getApiLimiter,
  closeRateLimiter,
  initializeTracing,
  createQueue,
  createWorker,
  enqueueJob,
  getQueueStats,
  closeQueues,
  initializeDatabase,
  runMigrations,
  closeDatabase,
  getDatabase,
  Tenant,
  ValidationError,
} from '@t3ck/shared';
import { setupHealthChecks } from './health';
import { initSentry, setupSentryErrorHandler, captureException } from './sentry';
import { setupMetricsMiddleware, setupMetricsEndpoint } from './metrics';
import { initializeCache } from './cache';
import { initializeConfig } from './config';
import { initializeServiceRegistry } from './service-registry';
import { initializeBackup } from './backup';
import { setupSwagger } from './swagger';
import { initializeFirestore, getFirestore as getTenantFirestore } from './firebase';

// Initialize OpenTelemetry tracing (must be first)
initializeTracing('tenant-service');

// Initialize Sentry
initSentry('tenant-service');

const app = express();

// Enable CORS with dynamic origin echo (compatible with credentials)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      const allowedOrigins = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-CSRF-Token'],
  })
);

app.use(express.json());

if (process.env.REDIS_DISABLED === 'true') {
  throw new Error('Redis is required for tenant-service cache, queue and rate limiting');
}

if (!process.env.RATE_LIMIT_STORE) {
  process.env.RATE_LIMIT_STORE = 'redis';
}

initializeCache({ prefix: 'tenant:' });

// Initialize Config Manager
initializeConfig({ parameterPrefix: '/t3ck-core' });

// Initialize Service Registry (Cloud Map)
const SERVICE_PORT = parseInt(String(process.env.PORT || 3003));
initializeServiceRegistry('t3ck-tenant', SERVICE_PORT, {
  service_type: 'provisioning',
});

// Setup Prometheus metrics middleware
setupMetricsMiddleware(app);

// Setup Prometheus metrics middleware
setupMetricsMiddleware(app);

const provisioningService = new ProvisioningFormService();
const logger = new Logger('tenant-service');
const firestoreDb = initializeFirestore();
const firestoreAvailable = Boolean(firestoreDb);
let dbAvailable = true;

if (process.env.DATABASE_DISABLED === 'true') {
  throw new Error('Database is required for tenant-service persistence');
}

// Initialize Bull Queue for provisioning
let queueAvailable = false;
try {
  createQueue('provisioning');
  createWorker(
    'provisioning',
    async (job) => {
      logger.info('Processing provisioning job', { jobId: job.id, tenantId: job.data.tenantId });
      try {
        if (firestoreAvailable) {
          try {
            const firestore = getTenantFirestore();
            if (firestore) {
              await firestore
                .collection('tenants')
                .doc(job.data.tenantId)
                .set(
                  {
                    status: 'PROVISIONING',
                    provisioningJobId: String(job.id),
                    updatedAt: new Date().toISOString(),
                  },
                  { merge: true }
                );
            }
          } catch (firestoreError) {
            logger.warn('Firestore status update failed (PROVISIONING)', {
              error: (firestoreError as Error).message,
              tenantId: job.data.tenantId,
            });
          }
        }

        // Update tenant status to PROVISIONING in database
        const db = getDatabase();
        const tenantRepository = db.getRepository(Tenant);
        await tenantRepository.update(
          { id: job.data.tenantId },
          { status: 'PROVISIONING', provisioningJobId: job.id }
        );

        // Simulate provisioning work
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Update tenant status to ACTIVE upon completion
        await tenantRepository.update(
          { id: job.data.tenantId },
          { status: 'ACTIVE', provisionedAt: new Date() }
        );

        logger.info('Provisioning job completed', { jobId: job.id, tenantId: job.data.tenantId });

        if (firestoreAvailable) {
          try {
            const firestore = getTenantFirestore();
            if (firestore) {
              await firestore.collection('tenants').doc(job.data.tenantId).set(
                {
                  status: 'ACTIVE',
                  provisionedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            }
          } catch (firestoreError) {
            logger.warn('Firestore status update failed (ACTIVE db)', {
              error: (firestoreError as Error).message,
              tenantId: job.data.tenantId,
            });
          }
        }

        return { success: true, tenantId: job.data.tenantId };
      } catch (error) {
        logger.error('Provisioning job failed', {
          jobId: job.id,
          tenantId: job.data.tenantId,
          error,
        });
        // Update tenant status to SUSPENDED on error
        const db = getDatabase();
        const tenantRepository = db.getRepository(Tenant);
        await tenantRepository.update({ id: job.data.tenantId }, { status: 'SUSPENDED' });

        if (firestoreAvailable) {
          try {
            const firestore = getTenantFirestore();
            if (firestore) {
              await firestore.collection('tenants').doc(job.data.tenantId).set(
                {
                  status: 'SUSPENDED',
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            }
          } catch (firestoreError) {
            logger.warn('Firestore status update failed (SUSPENDED)', {
              error: (firestoreError as Error).message,
              tenantId: job.data.tenantId,
            });
          }
        }

        throw error;
      }
    },
    2 // Process 2 jobs concurrently
  );
  queueAvailable = true;
} catch (error) {
  queueAvailable = false;
  logger.error('Provisioning queue initialization failed', { error });
  throw error;
}

// Initialize database and run migrations
(async () => {
  try {
    const dbConfig = {
      type: (process.env.DATABASE_TYPE || 'mysql') as any,
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '3306'),
      username: process.env.DATABASE_USER || 'root',
      password: process.env.DATABASE_PASSWORD || 'password',
      database: process.env.DATABASE_NAME || 't3ck_tenants',
      synchronize: false, // Use migrations instead
      logging: process.env.DATABASE_LOGGING === 'true',
      migrationsRun: true,
    };

    await initializeDatabase(dbConfig);
    await runMigrations();
    logger.info('Database initialized and migrations ran');
  } catch (error) {
    logger.error('Database initialization failed', { error });
    dbAvailable = false;
    process.exit(1);
  }
})();

// Health checks setup
setupHealthChecks(app);

// Internal registry endpoint for debugging
import { getServiceRegistry } from './service-registry';
app.get('/internal/registry', (_req, res) => {
  const registry = getServiceRegistry();
  const entries = Array.from(registry.getAllInstances().entries()).map(([k, v]) => ({
    service: k,
    instance: v,
  }));
  res.json({ registered: entries });
});

// Metrics endpoint
setupMetricsEndpoint(app, '/metrics');

// Swagger / OpenAPI
setupSwagger(app, { title: 'Tenant Service API', version: process.env.SERVICE_VERSION });

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'tenant-service',
    status: 'running',
    endpoints: {
      health: '/health',
      docs: '/api-docs',
      docsAll: '/api-docs-all',
      provisioningSubmit: '/provisioning/submit',
      provisioningStatus: '/provisioning/{tenantId}/status',
    },
  });
});

// Rate limiting middleware
const passThroughLimiter = (_req: Request, _res: Response, next: () => void) => next();
const apiLimiterEnabled =
  process.env.RATE_LIMIT_DISABLED !== 'true' && process.env.NODE_ENV === 'production';
app.use(apiLimiterEnabled ? getApiLimiter() : passThroughLimiter); // Apply API-wide rate limiter
const provisioningLimiter = createTenantAwareRateLimiter(10); // Max 10 provisioning requests per hour per tenant

// Submeter formulário de provisionamento
/**
 * @openapi
 * /provisioning/submit:
 *   post:
 *     summary: Submit tenant provisioning request
 *     tags: [Provisioning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - domain
 *               - companyName
 *               - adminEmail
 *             properties:
 *               domain:
 *                 type: string
 *                 example: acme.example.com
 *               companyName:
 *                 type: string
 *                 example: Acme Corp
 *               adminEmail:
 *                 type: string
 *                 format: email
 *                 example: admin@acme.com
 *               contactEmail:
 *                 type: string
 *                 format: email
 *               numberOfSeats:
 *                 type: integer
 *                 minimum: 1
 *                 example: 50
 *               billingAddress:
 *                 type: string
 *               billingCountry:
 *                 type: string
 *               billingZipCode:
 *                 type: string
 *               monthlyBudget:
 *                 type: number
 *                 example: 5000
 *     responses:
 *       201:
 *         description: Provisioning request accepted
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
app.post(
  '/provisioning/submit',
  provisioningLimiter,
  validateRequest(ProvisioningSubmitSchema),
  async (req: Request, res: Response) => {
    try {
      const form = {
        ...req.body,
        contactEmail: req.body.contactEmail || req.body.adminEmail,
      };

      // Validar formulário
      provisioningService.validateForm(form);

      // Criar tenant com status PENDING
      const tenantData = provisioningService.createTenant(form);

      if (firestoreAvailable) {
        try {
          const firestore = getTenantFirestore();
          if (firestore) {
            const existingById = await firestore.collection('tenants').doc(tenantData.id).get();
            if (existingById.exists) {
              return res.status(409).json({
                success: false,
                error: `Tenant ${tenantData.id} already exists`,
              });
            }

            const existingByDomain = await firestore
              .collection('tenants')
              .where('domain', '==', form.domain)
              .limit(1)
              .get();

            if (!existingByDomain.empty) {
              return res.status(409).json({
                success: false,
                error: `Domain ${form.domain} already exists`,
              });
            }
          }
        } catch (firestoreError) {
          logger.warn(
            'Firestore duplicate check failed; database uniqueness check remains authoritative',
            {
              error: (firestoreError as Error).message,
              tenantId: tenantData.id,
            }
          );
        }
      }

      // Salvar tenant no banco de dados
      if (!dbAvailable) {
        throw new Error('Database is required for tenant persistence');
      }
      const db = getDatabase();
      const tenantRepository = db.getRepository(Tenant);
      const tenant = tenantRepository.create({
        id: tenantData.id,
        domain: form.domain,
        companyName: form.companyName,
        contactEmail: form.contactEmail,
        numberOfSeats: form.numberOfSeats || 50,
        status: 'PENDING',
        billingAddress: form.billingAddress,
        billingCountry: form.billingCountry,
        billingZipCode: form.billingZipCode,
        monthlyBudget: form.monthlyBudget || 0,
        billingStatus: 'ACTIVE',
      });
      const savedTenant = await tenantRepository.save(tenant);
      if (firestoreAvailable) {
        try {
          const firestore = getTenantFirestore();
          if (firestore) {
            const firestoreTenant = {
              id: savedTenant.id,
              domain: form.domain,
              companyName: form.companyName,
              contactEmail: form.contactEmail,
              contactName: form.contactName,
              adminEmail: form.adminEmail || null,
              numberOfSeats: form.numberOfSeats || 50,
              status: 'PENDING',
              billingAddress: form.billingAddress || null,
              billingCountry: form.billingCountry || null,
              billingZipCode: form.billingZipCode || null,
              monthlyBudget: form.monthlyBudget || 0,
              billingStatus: 'ACTIVE',
              plan: form.plan,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            await firestore
              .collection('tenants')
              .doc(savedTenant.id)
              .set(firestoreTenant, { merge: true });
          }
        } catch (firestoreError) {
          logger.warn('Firestore tenant mirror write failed', {
            error: (firestoreError as Error).message,
            tenantId: savedTenant.id,
          });
        }
      }

      if (!queueAvailable) {
        throw new Error('Redis queue is required for provisioning');
      }

      const jobId = await enqueueJob('provisioning', 'provision-tenant', {
        tenantId: savedTenant.id,
        domain: form.domain,
        companyName: form.companyName,
        contactEmail: form.contactEmail,
      });

      logger.info('Provisioning job enqueued', {
        tenantId: savedTenant.id,
        jobId,
        domain: form.domain,
      });

      return res.status(201).json({
        success: true,
        data: savedTenant,
        jobId,
        message: 'Form submitted successfully. Provisioning will begin shortly.',
      });
    } catch (error) {
      logger.error('Failed to submit provisioning form', { error });

      // Capturar erros de validação
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          error: error.message,
          details: error.details || null,
        });
      }

      // Outros erros da aplicação
      if (error instanceof Error) {
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }

      // Erro desconhecido
      return res.status(500).json({
        success: false,
        error: 'Failed to submit provisioning form',
      });
    }
  }
);

// Obter status do provisionamento
/**
 * @openapi
 * /provisioning/{tenantId}/status:
 *   get:
 *     summary: Get provisioning status by tenant id
 *     tags: [Provisioning]
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Provisioning status
 *       404:
 *         description: Tenant not found
 *       500:
 *         description: Internal server error
 */
app.get(
  '/provisioning/:tenantId/status',
  validateRequest(ProvisioningStatusParamSchema),
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      // Buscar tenant do banco de dados (ou memória)
      let tenant: any = null;
      if (firestoreAvailable) {
        try {
          const firestore = getTenantFirestore();
          if (firestore) {
            const snapshot = await firestore.collection('tenants').doc(tenantId).get();
            tenant = snapshot.exists ? snapshot.data() : null;
          }
        } catch (firestoreError) {
          logger.warn('Firestore status read failed; reading from database', {
            error: (firestoreError as Error).message,
            tenantId,
          });
        }
      }

      if (!tenant) {
        if (!dbAvailable) {
          throw new Error('Database is required for tenant status reads');
        }
        const db = getDatabase();
        const tenantRepository = db.getRepository(Tenant);
        tenant = await tenantRepository.findOne({
          where: { id: tenantId },
        });
      }

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'Tenant not found',
        });
      }

      // Mapear status para mensagem legível
      const statusMessages: Record<string, string> = {
        PENDING: 'Waiting to start provisioning',
        PROVISIONING: 'Provisioning infrastructure and services',
        ACTIVE: 'Provisioning completed successfully',
        SUSPENDED: 'Provisioning failed or suspended',
        DELETED: 'Tenant has been deleted',
      };

      return res.json({
        success: true,
        data: {
          tenantId: tenant.id,
          domain: tenant.domain,
          companyName: tenant.companyName,
          status: tenant.status,
          message: statusMessages[tenant.status] || 'Unknown status',
          provisioningJobId: tenant.provisioningJobId || null,
          provisionedAt: tenant.provisionedAt || null,
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Failed to get provisioning status', { error });
      const tenantId = req.params.tenantId || 'unknown';
      captureException(error, { operation: 'get-provisioning-status', tenantId });
      return res.status(500).json({ success: false, error: 'Failed to get provisioning status' });
    }
  }
);

// Queue statistics endpoint
/**
 * @openapi
 * /queue/stats:
 *   get:
 *     summary: Get provisioning queue stats
 *     tags: [Provisioning]
 *     responses:
 *       200:
 *         description: Queue statistics
 *       500:
 *         description: Internal server error
 */
app.get('/queue/stats', async (_req, res) => {
  try {
    if (!queueAvailable) {
      return res.status(503).json({ error: 'Redis queue is required for provisioning stats' });
    }
    const stats = await getQueueStats('provisioning');
    return res.json(stats);
  } catch (error) {
    logger.error('Failed to get queue stats', { error });
    return res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// List all tenants endpoint
/**
 * @openapi
 * /provisioning/tenants:
 *   get:
 *     summary: List provisioned tenants
 *     tags: [Provisioning]
 *     responses:
 *       200:
 *         description: Tenant list
 *       500:
 *         description: Internal server error
 */
app.get('/provisioning/tenants', async (_req, res) => {
  try {
    let tenants: any[] = [];

    if (firestoreAvailable) {
      try {
        const firestore = getTenantFirestore();
        if (firestore) {
          const snapshot = await firestore
            .collection('tenants')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
          tenants = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        }
      } catch (firestoreError) {
        logger.warn('Firestore tenant list read failed; reading from database', {
          error: (firestoreError as Error).message,
        });
      }
    }

    if (tenants.length === 0) {
      if (!dbAvailable) {
        throw new Error('Database is required for tenant list reads');
      }
      const db = getDatabase();
      const tenantRepository = db.getRepository(Tenant);
      tenants = await tenantRepository.find({
        order: { createdAt: 'DESC' },
        take: 100, // Limit to 100 most recent
      });
    }

    return res.json({
      success: true,
      data: tenants,
      count: tenants.length,
    });
  } catch (error) {
    logger.error('Failed to list tenants', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to list tenants',
      data: [],
      count: 0,
    });
  }
});

// Setup Sentry error handlers (after routes)
setupSentryErrorHandler(app);

// Initialize Backup manager (stubbed providers)
initializeBackup({
  s3Bucket: process.env.BACKUP_S3_BUCKET,
  gcsBucket: process.env.BACKUP_GCS_BUCKET,
});

const server = app.listen(SERVICE_PORT, () => {
  logger.info(`Tenant service running on port ${SERVICE_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    logger.info('Server closed');
    await closeRateLimiter();
    await closeQueues();
    await closeDatabase();
    await require('./sentry').flushSentry(2000);
    process.exit(0);
  });
});
