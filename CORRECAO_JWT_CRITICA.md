# 🔐 CORREÇÃO CRÍTICA - JWT RS256 Implementation

**Prioridade:** CRÍTICA (Bloqueia Deploy)  
**Estimativa:** 2-3 horas  
**Status:** ❌ NÃO IMPLEMENTADO

---

## PROBLEMA ENCONTRADO

O projeto usa algoritmo RS256 (assimétrico) mas configura com secret string simples (simétrico).

### Código Atual (INCORRETO)

```typescript
// services/auth-service/src/auth.ts:30
constructor() {
  this.cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
  this.logger = new Logger('auth-service');
  this.jwtSecret = process.env.JWT_SECRET || '';  // ❌ ERRADO: String simples
}

// services/auth-service/src/auth.ts:82
async generateJWT(payload: TokenPayload): Promise<string> {
  return jwt.sign(payload, this.jwtSecret, {
    algorithm: 'RS256',  // ❌ RS256 requer PRIVATE KEY
    expiresIn: '1h',
    issuer: 't3ck',
    audience: 't3ck-api',
  });
}

// services/auth-service/src/auth.ts:95
async verifyJWT(token: string): Promise<TokenPayload> {
  try {
    const decoded = jwt.verify(token, this.jwtSecret, {  // ❌ ERRADO: Deve usar PUBLIC KEY
      algorithms: ['RS256'],
      issuer: 't3ck',
      audience: 't3ck-api',
    }) as TokenPayload;

    return decoded;
  } catch (error) {
    this.logger.error('JWT verification failed', { error });
    throw new Error('Invalid token');
  }
}
```

---

## POR QUE É PROBLEMA?

| Aspecto          | Situação Atual | Problema                                |
| ---------------- | -------------- | --------------------------------------- |
| **Algoritmo**    | RS256          | Assimétrico, precisa de key pair        |
| **Configuração** | Secret string  | Simétrico, apenas HS256                 |
| **Segurança**    | Mismatch       | Falha silenciosa ou erro em runtime     |
| **Distribuição** | Sem public key | Não pode validar em serviços diferentes |
| **Produção**     | Crítico        | Bloqueia múltiplos serviços             |

---

## SOLUÇÃO PASSO A PASSO

### PASSO 1: Gerar RSA Key Pair

```bash
# Gerar private key (2048 bits mínimo)
openssl genrsa -out private.key 2048

# Extrair public key
openssl rsa -in private.key -pubout -out public.key

# Converter para formato Base64 (para .env)
cat private.key | base64 -w 0 > private.key.b64
cat public.key | base64 -w 0 > public.key.b64

# Ver os valores para copiar
cat private.key.b64
cat public.key.b64
```

### PASSO 2: Atualizar `.env`

```bash
# ❌ REMOVER
JWT_SECRET=sua_secret_string

# ✅ ADICIONAR (substitua pelos valores gerados)
JWT_PRIVATE_KEY=LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlFcEFJQkFBS0NBUUVBMFo4d... (base64 da chave privada)
JWT_PUBLIC_KEY=LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJRR3ll... (base64 da chave pública)
```

Ou usar multiline:

```bash
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z8w...
...
-----END RSA PRIVATE KEY-----"

JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0B...
...
-----END PUBLIC KEY-----"
```

### PASSO 3: Criar Auth Service Corrigido

```typescript
// services/auth-service/src/auth.ts - CORRIGIDO

import jwt from 'jsonwebtoken';
import { Logger } from '@t3ck/shared';
import * as admin from 'firebase-admin';
import crypto from 'crypto';

export interface TokenPayload {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

export class AuthService {
  private logger: Logger;
  private jwtPrivateKey: string;
  private jwtPublicKey: string;
  private jwtExpiration: string;

  constructor() {
    this.logger = new Logger('auth-service');

    // ✅ CORRETO: Validar private key existe
    if (!process.env.JWT_PRIVATE_KEY) {
      throw new Error(
        'JWT_PRIVATE_KEY is required for RS256 algorithm. ' +
          'Generate with: openssl genrsa -out private.key 2048'
      );
    }

    if (!process.env.JWT_PUBLIC_KEY) {
      throw new Error(
        'JWT_PUBLIC_KEY is required for token verification. ' +
          'Generate with: openssl rsa -in private.key -pubout -out public.key'
      );
    }

    // ✅ CORRETO: Validar chaves estão em formato PEM
    if (!process.env.JWT_PRIVATE_KEY.includes('BEGIN RSA PRIVATE KEY')) {
      throw new Error('JWT_PRIVATE_KEY must be in PEM format (-----BEGIN RSA PRIVATE KEY-----)');
    }

    if (!process.env.JWT_PUBLIC_KEY.includes('BEGIN PUBLIC KEY')) {
      throw new Error('JWT_PUBLIC_KEY must be in PEM format (-----BEGIN PUBLIC KEY-----)');
    }

    this.jwtPrivateKey = process.env.JWT_PRIVATE_KEY;
    this.jwtPublicKey = process.env.JWT_PUBLIC_KEY;
    this.jwtExpiration = process.env.JWT_EXPIRATION || '3600'; // 1 hora
  }

  // ✅ CORRETO: Usar private key para sign
  async generateJWT(payload: TokenPayload): Promise<string> {
    try {
      return jwt.sign(payload, this.jwtPrivateKey, {
        algorithm: 'RS256', // ✅ RS256 assimétrico
        expiresIn: this.jwtExpiration,
        issuer: 't3ck',
        audience: 't3ck-api',
      });
    } catch (error) {
      this.logger.error('JWT generation failed', { error });
      throw new Error('Failed to generate token');
    }
  }

  // ✅ CORRETO: Usar public key para verify
  async verifyJWT(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtPublicKey, {
        // ✅ Public key
        algorithms: ['RS256'],
        issuer: 't3ck',
        audience: 't3ck-api',
      }) as TokenPayload;

      return decoded;
    } catch (error) {
      this.logger.error('JWT verification failed', { error });
      throw new Error('Invalid token');
    }
  }

  // ✅ NOVO: Token refresh com rotation
  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      // 1. Verificar refresh token
      const payload = await this.verifyJWT(refreshToken);

      // 2. Gerar novo access token
      const newAccessToken = await this.generateJWT(payload);

      // 3. Gerar novo refresh token (com exp mais longo)
      const newRefreshPayload = { ...payload, type: 'refresh' };
      const newRefreshToken = jwt.sign(newRefreshPayload, this.jwtPrivateKey, {
        algorithm: 'RS256',
        expiresIn: '7d', // 7 dias para refresh
        issuer: 't3ck',
        audience: 't3ck-api',
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        idToken: refreshToken, // Ou gerar novo
        expiresIn: parseInt(this.jwtExpiration, 10),
      };
    } catch (error) {
      this.logger.error('Token refresh failed', { error });
      throw new Error('Invalid refresh token');
    }
  }

  async authenticateWithFirebase(idToken: string): Promise<TokenPayload> {
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      return {
        tenantId: decodedToken.tenant_id || '',
        userId: decodedToken.uid,
        email: decodedToken.email || '',
        roles: decodedToken.roles || [],
      };
    } catch (error) {
      this.logger.error('Firebase authentication failed', { error });
      throw new Error('Invalid Firebase token');
    }
  }

  async authenticateWithCognito(username: string, password: string): Promise<AuthResult> {
    // Implementação existente...
    // (mantém como está)
    throw new Error('Not implemented in this example');
  }
}
```

### PASSO 4: Atualizar Auth Service Tests

```typescript
// services/auth-service/src/__tests__/auth.test.ts

import { AuthService } from '../auth';

describe('AuthService', () => {
  let authService: AuthService;

  beforeAll(() => {
    // Configurar env vars antes de criar serviço
    process.env.JWT_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA2K7eNJVJmFt5I5L...
...
-----END RSA PRIVATE KEY-----`;

    process.env.JWT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...
...
-----END PUBLIC KEY-----`;

    authService = new AuthService();
  });

  describe('generateJWT', () => {
    it('should generate valid RS256 JWT', async () => {
      const payload = {
        tenantId: 'tenant-123',
        userId: 'user-456',
        email: 'user@example.com',
        roles: ['user'],
      };

      const token = await authService.generateJWT(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // Header.Payload.Signature
    });

    it('should include correct headers and claims', async () => {
      const payload = {
        tenantId: 'tenant-123',
        userId: 'user-456',
        email: 'user@example.com',
        roles: ['user'],
      };

      const token = await authService.generateJWT(payload);

      // Decodificar sem verificação para inspecionar
      const decoded = jwt.decode(token, { complete: true });

      expect(decoded?.header.alg).toBe('RS256');
      expect(decoded?.payload.iss).toBe('t3ck');
      expect(decoded?.payload.aud).toBe('t3ck-api');
      expect(decoded?.payload.tenantId).toBe('tenant-123');
    });
  });

  describe('verifyJWT', () => {
    it('should verify valid JWT', async () => {
      const payload = {
        tenantId: 'tenant-123',
        userId: 'user-456',
        email: 'user@example.com',
        roles: ['user'],
      };

      const token = await authService.generateJWT(payload);
      const verified = await authService.verifyJWT(token);

      expect(verified.tenantId).toBe(payload.tenantId);
      expect(verified.userId).toBe(payload.userId);
      expect(verified.email).toBe(payload.email);
    });

    it('should reject invalid JWT', async () => {
      await expect(authService.verifyJWT('invalid.token.here')).rejects.toThrow('Invalid token');
    });

    it('should reject token signed with wrong key', async () => {
      // Gerar token com chave diferente
      const wrongPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...different key...
-----END RSA PRIVATE KEY-----`;

      const wrongToken = jwt.sign(
        { tenantId: 'tenant-123', userId: 'user-456', email: 'user@example.com', roles: [] },
        wrongPrivateKey,
        { algorithm: 'RS256' }
      );

      await expect(authService.verifyJWT(wrongToken)).rejects.toThrow('Invalid token');
    });
  });

  describe('refreshToken', () => {
    it('should generate new token with same payload', async () => {
      const payload = {
        tenantId: 'tenant-123',
        userId: 'user-456',
        email: 'user@example.com',
        roles: ['user'],
      };

      const refreshToken = await authService.generateJWT(payload);
      const result = await authService.refreshToken(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      const verified = await authService.verifyJWT(result.accessToken);
      expect(verified.userId).toBe(payload.userId);
    });
  });
});
```

### PASSO 5: Atualizar Índice do Auth Service

```typescript
// services/auth-service/src/index.ts

import express from 'express';
import { AuthService } from './auth';
import { Logger } from '@t3ck/shared';

const app = express();
app.use(express.json());

let authService: AuthService;

// ✅ NOVO: Inicializar com tratamento de erro
try {
  authService = new AuthService();
  console.log('✅ AuthService initialized with RS256');
} catch (error) {
  console.error('❌ AuthService initialization failed:', error);
  process.exit(1);
}

const logger = new Logger('auth-service');

// ... resto do código ...

app.post('/auth/login', async (req, res) => {
  try {
    const { provider, token, username, password } = req.body;

    if (provider === 'firebase' && token) {
      const payload = await authService.authenticateWithFirebase(token);
      const jwtToken = await authService.generateJWT(payload); // ✅ Usa RS256

      res.json({
        accessToken: jwtToken,
        expiresIn: 3600,
      });
    } else {
      res.status(400).json({ error: 'Invalid authentication parameters' });
    }
  } catch (error) {
    logger.error('Login failed', { error });
    res.status(401).json({ error: 'Authentication failed' });
  }
});

app.post('/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;
    const payload = await authService.verifyJWT(token); // ✅ Usa public key
    res.json({ valid: true, payload });
  } catch (error) {
    logger.error('Token verification failed', { error });
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken); // ✅ Novo: Refresh rotation
    res.json(result);
  } catch (error) {
    logger.error('Token refresh failed', { error });
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

const PORT = process.env.AUTH_SERVICE_PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Auth Service running on port ${PORT}`);
});
```

### PASSO 6: Validar Environment Variables

```typescript
// packages/shared/src/env-validation.ts - NOVO

export function validateAuthEnvironment(): void {
  const required = ['JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY'];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  // Validar formato PEM
  if (!process.env.JWT_PRIVATE_KEY?.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error(
      'JWT_PRIVATE_KEY must be in PEM format starting with -----BEGIN RSA PRIVATE KEY-----'
    );
  }

  if (!process.env.JWT_PUBLIC_KEY?.includes('BEGIN PUBLIC KEY')) {
    throw new Error(
      'JWT_PUBLIC_KEY must be in PEM format starting with -----BEGIN PUBLIC KEY-----'
    );
  }

  // Validar comprimento mínimo (RSA 2048 ~1700 chars)
  if (process.env.JWT_PRIVATE_KEY!.length < 1500) {
    throw new Error('JWT_PRIVATE_KEY appears too short. Ensure it is RSA 2048-bit or larger');
  }

  console.log('✅ Auth environment validated');
}
```

---

## CHECKLIST DE IMPLEMENTAÇÃO

- [x] Gerar RSA key pair com `openssl` _(fallback usado: `crypto.generateKeyPairSync` porque `openssl` não está disponível no terminal local)_
- [x] Atualizar `.env.example` com instruções
- [x] Atualizar `.env` local com chaves
- [x] Modificar `services/auth-service/src/auth.ts`
- [x] Criar testes em `services/auth-service/src/__tests__/auth.test.ts`
- [x] Criar validação em `packages/shared/src/env-validation.ts`
- [x] Atualizar `services/auth-service/src/index.ts`
- [x] Testar localmente: `pnpm --filter @t3ck/auth-service test`
- [x] Testar JWT generation/verification
- [x] Confirmar que outros serviços conseguem verificar tokens
- [x] Documentar no README

---

## COMO TESTAR

```bash
# 1. Gerar chaves
openssl genrsa -out private.key 2048
openssl rsa -in private.key -pubout -out public.key

# 2. Configurar .env
cat > .env << EOF
JWT_PRIVATE_KEY="$(cat private.key)"
JWT_PUBLIC_KEY="$(cat public.key)"
NODE_ENV=development
EOF

# 3. Instalar dependências
pnpm install

# 4. Rodar testes auth service
pnpm --filter @t3ck/auth-service test

# 5. Verificar saída
# Deve ver: ✅ Auth environment validated
# Deve ver: ✅ AuthService initialized with RS256

# 6. Teste manual com curl
curl -X POST http://localhost:3001/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"seu-jwt-token-aqui"}'
```

---

## IMPACTO

- **Serviços Afetados:** auth-service (sender), todos os serviços (receiver)
- **Breaking Change:** NÃO (apenas correção)
- **Rollback Plan:** Simples (voltar env vars)
- **Tempo de Implementação:** 2-3 horas
- **Testes Necessários:** Intergração com todos os serviços

---

**Prioridade:** ⚠️ CRÍTICA  
**Bloqueador:** SIM - Não pode fazer deploy sem isso
