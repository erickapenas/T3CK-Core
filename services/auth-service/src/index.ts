import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { AuthService } from './auth';
import { EncryptionService } from './encryption';
import {
  Logger,
  validateRequest,
  AuthLoginSchema,
  AuthRefreshSchema,
  AuthVerifySchema,
  EncryptSchema,
  DecryptSchema,
  ApiKeyCreateSchema,
  ApiKeyVerifySchema,
  ApiKeyRevokeSchema,
  AuthRevokeSchema,
  AuthVerifyTenantSchema,
  SessionListSchema,
  SessionRevokeSchema,
  SessionRevokeUserSchema,
  OidcTokenSchema,
  MfaSetupSchema,
  MfaVerifySchema,
  getApiLimiter,
  getAuthLimiter,
  closeRateLimiter,
  initializeTracing,
  validateAuthEnvironment,
} from '@t3ck/shared';
import { initializeFirebase } from './firebase-init';
import { setupHealthChecks } from './health';
import { initSentry, setupSentryErrorHandler, captureException } from './sentry';
import { setupMetricsMiddleware, setupMetricsEndpoint } from './metrics';
import { initializeCache, getCache } from './cache';
import { initializeConfig } from './config';
import { initializeServiceRegistry, getServiceRegistry } from './service-registry';
import { initializeBackup } from './backup';
import { setupSwagger } from './swagger';
import { KeyManager } from './key-manager';
import { TokenStore } from './token-store';
import { ApiKeyService } from './api-keys';
import { SessionService } from './sessions';
import { OidcService } from './oidc';
import { requireInternalApiKey } from './internal-auth';

// Initialize OpenTelemetry tracing (must be first)
initializeTracing('auth-service');

// Initialize Sentry
initSentry('auth-service');

// Inicializar Firebase
initializeFirebase();

if (process.env.REDIS_DISABLED === 'true') {
  throw new Error('Redis is required for auth-service persistence');
}

if (!process.env.RATE_LIMIT_STORE) {
  process.env.RATE_LIMIT_STORE = 'redis';
}

initializeCache({ prefix: 'auth:' });

// Initialize Config Manager
initializeConfig({ parameterPrefix: '/t3ck-core' });

// Initialize Service Registry (Cloud Map)
const SERVICE_PORT = parseInt(String(process.env.PORT || 3001));
initializeServiceRegistry('t3ck-auth', SERVICE_PORT, {
  service_type: 'authentication',
});

// Initialize Backup manager (stubbed providers)
initializeBackup({
  // configure s3Bucket/gcsBucket via environment or config manager
  s3Bucket: process.env.BACKUP_S3_BUCKET,
  gcsBucket: process.env.BACKUP_GCS_BUCKET,
});

const app = express();
app.use(express.json());

// Setup Prometheus metrics middleware
setupMetricsMiddleware(app);

const encryptionService = new EncryptionService();
const logger = new Logger('auth-service');

function ensureLocalJwtKeyMaterial(): void {
  const hasKeySetJson = Boolean(process.env.JWT_KEY_SET_JSON);
  const hasKeySetSecret = Boolean(process.env.JWT_KEY_SET_SECRET_NAME);
  const hasKeyPair = Boolean(process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY);
  const isProduction = process.env.NODE_ENV === 'production';

  if (hasKeySetJson || hasKeySetSecret || hasKeyPair || isProduction) {
    return;
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  process.env.JWT_PRIVATE_KEY = privateKey;
  process.env.JWT_PUBLIC_KEY = publicKey;
  logger.warn(
    'JWT key material not provided; generated ephemeral RSA key pair for local/dev runtime'
  );
}

async function start() {
  try {
    ensureLocalJwtKeyMaterial();
    validateAuthEnvironment();

    const keyManager = await KeyManager.create();
    await keyManager.ensureRotationPolicy();

    const tokenStore = new TokenStore(getCache(), keyManager, {
      refreshTtlSeconds: Number(process.env.JWT_REFRESH_EXPIRATION || 604800),
    });
    const apiKeyService = new ApiKeyService(getCache());
    const sessionService = new SessionService(
      getCache(),
      Number(process.env.SESSION_TTL_SECONDS || 86400)
    );
    const oidcService = new OidcService();

    const authService = new AuthService(keyManager, tokenStore);

    // Health checks setup
    setupHealthChecks(app);

    // Internal registry endpoint for debugging
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
    setupSwagger(app, { title: 'Auth Service API', version: process.env.SERVICE_VERSION });

    app.get('/', (_req: Request, res: Response) => {
      res.json({
        service: 'auth-service',
        status: 'running',
        endpoints: {
          health: '/health',
          docs: '/api-docs',
          auth: '/auth',
        },
      });
    });

    // Rate limiting middleware
    app.use(getApiLimiter()); // Apply API-wide rate limiter

    // Autenticação
    app.post(
      '/auth/login',
      getAuthLimiter(),
      validateRequest(AuthLoginSchema),
      async (req: Request, res: Response) => {
        try {
          const { provider, token, username, password } = req.body;

          if (provider === 'firebase' && token) {
            const payload = await authService.authenticateWithFirebase(token);
            const tokens = await authService.issueTokens(payload);
            const session = await sessionService.createSession(
              payload.tenantId,
              payload.userId,
              req.ip,
              req.headers['user-agent'] as string
            );

            res.json({
              ...tokens,
              sessionId: session.sessionId,
            });
            return;
          }

          if (provider === 'cognito' && username && password) {
            const result = await authService.authenticateWithCognito(username, password);
            res.json(result);
            return;
          }

          res.status(400).json({ error: 'Invalid authentication parameters' });
        } catch (error) {
          logger.error('Login failed', { error });
          res.status(401).json({ error: 'Authentication failed' });
        }
      }
    );

    // Refresh token
    app.post(
      '/auth/refresh',
      validateRequest(AuthRefreshSchema),
      async (req: Request, res: Response) => {
        try {
          const { refreshToken } = req.body;
          const result = await authService.refreshToken(refreshToken);
          res.json(result);
        } catch (error) {
          logger.error('Token refresh failed', { error });
          res.status(401).json({ error: 'Token refresh failed' });
        }
      }
    );

    // Verificar token
    app.post(
      '/auth/verify',
      validateRequest(AuthVerifySchema),
      async (req: Request, res: Response) => {
        try {
          const { token } = req.body;
          const payload = await authService.verifyJWT(token);
          res.json({ valid: true, payload });
        } catch (error) {
          logger.error('Token verification failed', { error });
          res.status(401).json({ error: 'Invalid token' });
        }
      }
    );

    // Verificar token e tenant
    app.post(
      '/auth/verify-tenant',
      validateRequest(AuthVerifyTenantSchema),
      async (req: Request, res: Response) => {
        try {
          const { token, tenantId } = req.body;
          const payload = await authService.verifyJWTWithTenant(token, tenantId);
          res.json({ valid: true, payload });
        } catch (error) {
          logger.error('Tenant token verification failed', { error });
          res.status(401).json({ error: 'Invalid token or tenant mismatch' });
        }
      }
    );

    // Revogar token
    app.post(
      '/auth/revoke',
      validateRequest(AuthRevokeSchema),
      async (req: Request, res: Response) => {
        try {
          const { token } = req.body;
          await authService.revokeToken(token);
          res.json({ message: 'Token revoked' });
        } catch (error) {
          logger.error('Token revoke failed', { error });
          res.status(500).json({ error: 'Token revoke failed' });
        }
      }
    );

    // API Keys
    app.post(
      '/auth/api-keys',
      requireInternalApiKey,
      validateRequest(ApiKeyCreateSchema),
      async (req: Request, res: Response) => {
        const { tenantId, userId, name, scopes, expiresAt } = req.body;
        const result = await apiKeyService.createApiKey({
          tenantId,
          userId,
          name,
          scopes,
          expiresAt,
        });
        res.json(result);
      }
    );

    app.post(
      '/auth/api-keys/verify',
      validateRequest(ApiKeyVerifySchema),
      async (req: Request, res: Response) => {
        const { apiKey } = req.body;
        const metadata = await apiKeyService.verifyApiKey(apiKey);
        if (!metadata) {
          res.status(401).json({ valid: false });
          return;
        }
        res.json({ valid: true, metadata });
      }
    );

    app.delete(
      '/auth/api-keys/:keyId',
      requireInternalApiKey,
      validateRequest(ApiKeyRevokeSchema),
      async (req: Request, res: Response) => {
        await apiKeyService.revokeApiKey(req.params.keyId);
        res.json({ message: 'API key revoked' });
      }
    );

    app.get('/auth/api-keys', requireInternalApiKey, async (req: Request, res: Response) => {
      const { tenantId, userId } = req.query as { tenantId?: string; userId?: string };
      if (tenantId) {
        const keys = await apiKeyService.listKeysByTenant(tenantId);
        res.json({ keys });
        return;
      }
      if (userId) {
        const keys = await apiKeyService.listKeysByUser(userId);
        res.json({ keys });
        return;
      }
      res.status(400).json({ error: 'tenantId or userId is required' });
    });

    // Sessions
    app.get(
      '/auth/sessions/:userId',
      requireInternalApiKey,
      validateRequest(SessionListSchema),
      async (req: Request, res: Response) => {
        const sessions = await sessionService.listSessionsByUser(req.params.userId);
        res.json({ sessions });
      }
    );

    app.delete(
      '/auth/sessions/:sessionId',
      requireInternalApiKey,
      validateRequest(SessionRevokeSchema),
      async (req: Request, res: Response) => {
        await sessionService.revokeSession(req.params.sessionId);
        res.json({ message: 'Session revoked' });
      }
    );

    app.post(
      '/auth/sessions/revoke-user',
      requireInternalApiKey,
      validateRequest(SessionRevokeUserSchema),
      async (req: Request, res: Response) => {
        const { userId } = req.body;
        await sessionService.revokeUserSessions(userId);
        res.json({ message: 'User sessions revoked' });
      }
    );

    // OIDC / OAuth2
    app.get('/auth/oidc/authorize', (req: Request, res: Response) => {
      const { state, scope, redirectUri } = req.query as {
        state?: string;
        scope?: string;
        redirectUri?: string;
      };
      const url = oidcService.getAuthorizeUrl({ state, scope, redirectUri });
      res.redirect(url);
    });

    app.post(
      '/auth/oidc/token',
      validateRequest(OidcTokenSchema),
      async (req: Request, res: Response) => {
        const { code, refreshToken, redirectUri } = req.body;
        const result = await oidcService.exchangeToken({ code, refreshToken, redirectUri });
        res.json(result);
      }
    );

    app.get('/auth/oidc/userinfo', async (req: Request, res: Response) => {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) {
        res.status(401).json({ error: 'Missing access token' });
        return;
      }
      const userInfo = await oidcService.getUserInfo(token);
      res.json(userInfo);
    });

    app.get('/auth/oidc/.well-known', async (_req: Request, res: Response) => {
      const discovery = await oidcService.getDiscovery();
      res.json(discovery);
    });

    // MFA
    app.post(
      '/auth/mfa/setup',
      validateRequest(MfaSetupSchema),
      async (req: Request, res: Response) => {
        const { accessToken } = req.body;
        const result = await authService.setupMfa(accessToken);
        res.json(result);
      }
    );

    app.post(
      '/auth/mfa/verify',
      validateRequest(MfaVerifySchema),
      async (req: Request, res: Response) => {
        const { accessToken, userCode, enableMfa } = req.body;
        const result = await authService.verifyMfa(accessToken, userCode, enableMfa);
        res.json(result);
      }
    );

    // JWT Key Management
    app.get('/auth/keys', requireInternalApiKey, (_req: Request, res: Response) => {
      res.json(keyManager.getKeySetSummary());
    });

    app.post('/auth/keys/rotate', requireInternalApiKey, async (req: Request, res: Response) => {
      const { reason } = req.body || {};
      const result = await keyManager.rotateKeys(reason || 'manual-rotation');
      res.json(result);
    });

    app.get('/auth/keys/public', (_req: Request, res: Response) => {
      res.json({ keys: keyManager.getPublicKeys(), activeKid: keyManager.getActiveKid() });
    });

    // Criptografia de campos sensíveis
    app.post('/encrypt', validateRequest(EncryptSchema), async (req: Request, res: Response) => {
      try {
        const { data } = req.body;
        const encrypted = await encryptionService.encryptSensitiveFields(data);
        res.json({ encrypted });
      } catch (error) {
        logger.error('Encryption failed', { error });
        res.status(500).json({ error: 'Encryption failed' });
      }
    });

    // Descriptografia de campos sensíveis
    app.post('/decrypt', validateRequest(DecryptSchema), async (req: Request, res: Response) => {
      try {
        const { data } = req.body;
        const decrypted = await encryptionService.decryptSensitiveFields(data);
        res.json({ decrypted });
      } catch (error) {
        logger.error('Decryption failed', { error });
        captureException(error, { operation: 'decrypt' });
        res.status(500).json({ error: 'Decryption failed' });
      }
    });

    // Setup Sentry error handlers (after routes)
    setupSentryErrorHandler(app);

    const server = app.listen(SERVICE_PORT, () => {
      logger.info(`Auth service running on port ${SERVICE_PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(async () => {
        logger.info('Server closed');
        await closeRateLimiter();
        await require('./sentry').flushSentry(2000);
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Auth service initialization failed', error);
    process.exit(1);
  }
}

start();
