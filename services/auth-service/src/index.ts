import express, { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth';
import { EncryptionService } from './encryption';
import { RateLimiter } from './rate-limiter';
import { Logger } from '@t3ck/shared';
import { initializeFirebase } from './firebase-init';
import { setupHealthChecks } from './health';

// Inicializar Firebase
initializeFirebase();

const app = express();
app.use(express.json());

const authService = new AuthService();
const encryptionService = new EncryptionService();
const rateLimiter = new RateLimiter();
const logger = new Logger('auth-service');

// Middleware de rate limiting
async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tenantId = req.headers['x-tenant-id'] as string;
  const userId = req.headers['x-user-id'] as string;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const tenantAllowed = tenantId ? await rateLimiter.checkTenantLimit(tenantId) : true;
  const userAllowed = userId ? await rateLimiter.checkUserLimit(userId) : true;
  const ipAllowed = await rateLimiter.checkIPLimit(ip);

  if (!tenantAllowed || !userAllowed || !ipAllowed) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  next();
}

app.use(rateLimitMiddleware);

// Health checks setup
setupHealthChecks(app);

// Autenticação
app.post('/auth/login', async (req: Request, res: Response) => {
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
app.post('/auth/refresh', async (req: Request, res: Response) => {
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
app.post('/auth/verify', async (req: Request, res: Response) => {
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
app.post('/encrypt', async (req: Request, res: Response) => {
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
app.post('/decrypt', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    const decrypted = await encryptionService.decryptSensitiveFields(data);
    res.json({ decrypted });
  } catch (error) {
    logger.error('Decryption failed', { error });
    res.status(500).json({ error: 'Decryption failed' });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  logger.info(`Auth service running on port ${PORT}`);
});
