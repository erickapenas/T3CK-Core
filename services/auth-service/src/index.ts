import express, { Request, Response } from 'express';
import { AuthService } from './auth';
import { EncryptionService } from './encryption';
import { Logger, validateRequest, AuthLoginSchema, AuthRefreshSchema, AuthVerifySchema, EncryptSchema, DecryptSchema, getApiLimiter, getAuthLimiter, closeRateLimiter, initializeTracing } from '@t3ck/shared';
import { initializeFirebase } from './firebase-init';
import { setupHealthChecks } from './health';
import { initSentry, setupSentryErrorHandler, captureException } from './sentry';
import { setupMetricsMiddleware, setupMetricsEndpoint } from './metrics';
import { initializeCache } from './cache';
import { initializeConfig } from './config';
import { initializeServiceRegistry } from './service-registry';
import { initializeBackup } from './backup';
import { setupSwagger } from './swagger';

// Initialize OpenTelemetry tracing (must be first)
initializeTracing('auth-service');

// Initialize Sentry
initSentry('auth-service');

// Inicializar Firebase
initializeFirebase();

// Initialize Redis cache
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

const authService = new AuthService();
const encryptionService = new EncryptionService();
const logger = new Logger('auth-service');

// Health checks setup
setupHealthChecks(app);

// Internal registry endpoint for debugging
import { getServiceRegistry } from './service-registry';
app.get('/internal/registry', (_req, res) => {
  const registry = getServiceRegistry();
  const entries = Array.from(registry.getAllInstances().entries()).map(([k, v]) => ({ service: k, instance: v }));
  res.json({ registered: entries });
});

// Metrics endpoint
setupMetricsEndpoint(app, '/metrics');

// Swagger / OpenAPI
setupSwagger(app, { title: 'Auth Service API', version: process.env.SERVICE_VERSION });

// Rate limiting middleware
app.use(getApiLimiter()); // Apply API-wide rate limiter

// Autenticação
app.post('/auth/login', getAuthLimiter(), validateRequest(AuthLoginSchema), async (req: Request, res: Response) => {
  try {
    const { provider, token, username, password } = req.body;

    if (provider === 'firebase' && token) {
      const payload = await authService.authenticateWithFirebase(token);
      const jwtToken = await authService.generateJWT(payload);
      
      res.json({
        accessToken: jwtToken,
        expiresIn: 3600,
      });
    } else if (provider === 'cognito' && username && password) {
      const result = await authService.authenticateWithCognito(username, password);
      res.json(result);
    } else {
      res.status(400).json({ error: 'Invalid authentication parameters' });
    }
  } catch (error) {
    logger.error('Login failed', { error });
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// Refresh token
app.post('/auth/refresh', validateRequest(AuthRefreshSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);
    res.json(result);
  } catch (error) {
    logger.error('Token refresh failed', { error });
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

// Verificar token
app.post('/auth/verify', validateRequest(AuthVerifySchema), async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const payload = await authService.verifyJWT(token);
    res.json({ valid: true, payload });
  } catch (error) {
    logger.error('Token verification failed', { error });
    res.status(401).json({ error: 'Invalid token' });
  }
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
