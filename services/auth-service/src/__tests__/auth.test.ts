import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';
import { AuthService, TokenPayload } from '../auth';
import { KeyManager } from '../key-manager';
import { TokenStore } from '../token-store';
import type { CacheService } from '../cache';

function createCacheMock(): CacheService {
  const values = new Map<string, { value: unknown; expiresAt: number }>();

  return {
    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      values.set(key, {
        value,
        expiresAt: ttl ? Date.now() + ttl * 1000 : Number.POSITIVE_INFINITY,
      });
    },
    async exists(key: string): Promise<boolean> {
      const entry = values.get(key);
      if (!entry) {
        return false;
      }
      if (entry.expiresAt <= Date.now()) {
        values.delete(key);
        return false;
      }
      return true;
    },
    async delete(key: string): Promise<void> {
      values.delete(key);
    },
  } as unknown as CacheService;
}

describe('AuthService JWT RS256', () => {
  let authService: AuthService;

  beforeAll(async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.JWT_EXPIRATION = '3600';
    process.env.JWT_REFRESH_EXPIRATION = '604800';

    const keyManager = await KeyManager.create();
    const tokenStore = new TokenStore(createCacheMock(), keyManager, {
      refreshTtlSeconds: Number(process.env.JWT_REFRESH_EXPIRATION),
    });
    authService = new AuthService(keyManager, tokenStore);
  });

  const payload: TokenPayload = {
    tenantId: 'tenant-123',
    userId: 'user-456',
    email: 'user@example.com',
    roles: ['admin'],
  };

  it('generates a valid RS256 JWT', async () => {
    const token = await authService.generateJWT(payload);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = jwt.decode(token, { complete: true }) as {
      header: { alg: string };
      payload: { iss: string; aud: string | string[] };
    };

    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.payload.iss).toBe('t3ck');
    expect(decoded.payload.aud).toBe('t3ck-api');
  });

  it('verifies a valid token signed with private key', async () => {
    const token = await authService.generateJWT(payload);
    const verified = await authService.verifyJWT(token);

    expect(verified.tenantId).toBe(payload.tenantId);
    expect(verified.userId).toBe(payload.userId);
    expect(verified.email).toBe(payload.email);
    expect(verified.roles).toEqual(payload.roles);
  });

  it('rejects invalid token', async () => {
    await expect(authService.verifyJWT('invalid.token.value')).rejects.toThrow('Invalid token');
  });

  it('refreshes JWT tokens using RS256 flow', async () => {
    const issued = await authService.issueTokens(payload);

    const refreshed = await authService.refreshToken(issued.refreshToken);

    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.refreshToken).toBeDefined();
    expect(refreshed.expiresIn).toBe(3600);

    const verifiedAccess = await authService.verifyJWT(refreshed.accessToken);
    const verifiedRefresh = await authService.verifyJWT(refreshed.refreshToken);

    expect(verifiedAccess.tokenType).toBe('access');
    expect(verifiedRefresh.tokenType).toBe('refresh');
    expect(verifiedAccess.userId).toBe(payload.userId);
  });
});
