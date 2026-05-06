import crypto from 'crypto';
import { CacheService } from './cache';
import { KeyManager } from './key-manager';
import { Logger } from '@t3ck/shared';
import { TokenPayload } from './auth';

export interface TokenStoreOptions {
  refreshTtlSeconds: number;
}

export class TokenStore {
  private cache: CacheService;
  private keyManager: KeyManager;
  private refreshTtlSeconds: number;
  private logger: Logger;

  constructor(cache: CacheService, keyManager: KeyManager, options: TokenStoreOptions) {
    this.cache = cache;
    this.keyManager = keyManager;
    this.refreshTtlSeconds = options.refreshTtlSeconds;
    this.logger = new Logger('token-store');
  }

  generateJti(): string {
    return crypto.randomUUID();
  }

  async issueAccessToken(payload: TokenPayload, ttlSeconds: number): Promise<string> {
    const sanitizedPayload: TokenPayload = {
      tenantId: payload.tenantId,
      userId: payload.userId,
      email: payload.email,
      roles: payload.roles,
    };
    const jti = this.generateJti();
    const tokenPayload: TokenPayload = {
      ...sanitizedPayload,
      tokenType: 'access',
      jti,
    };

    return this.keyManager.sign(tokenPayload, {
      expiresIn: ttlSeconds,
      issuer: 't3ck',
      audience: 't3ck-api',
    });
  }

  async issueRefreshToken(payload: TokenPayload): Promise<string> {
    const sanitizedPayload: TokenPayload = {
      tenantId: payload.tenantId,
      userId: payload.userId,
      email: payload.email,
      roles: payload.roles,
    };
    const jti = this.generateJti();
    const tokenPayload: TokenPayload = {
      ...sanitizedPayload,
      tokenType: 'refresh',
      jti,
    };

    const token = this.keyManager.sign(tokenPayload, {
      expiresIn: this.refreshTtlSeconds,
      issuer: 't3ck',
      audience: 't3ck-api',
    });

    await this.cache.set(
      `refresh:${jti}`,
      { tenantId: payload.tenantId, userId: payload.userId },
      this.refreshTtlSeconds
    );

    return token;
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    const payload = this.keyManager.verify<TokenPayload>(token, {
      issuer: 't3ck',
      audience: 't3ck-api',
    });

    if (payload.jti && (await this.isRevoked(payload.jti))) {
      throw new Error('Token revoked');
    }

    return payload;
  }

  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    const payload = await this.verifyToken(token);

    if (payload.tokenType !== 'refresh') {
      throw new Error('Invalid token type');
    }

    if (!payload.jti) {
      throw new Error('Refresh token missing jti');
    }

    const exists = await this.cache.exists(`refresh:${payload.jti}`);
    if (!exists) {
      throw new Error('Refresh token revoked or expired');
    }

    return payload;
  }

  async rotateRefreshToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (payload.jti) {
      await this.revokeTokenByJti(payload.jti, payload.exp);
    }

    const accessToken = await this.issueAccessToken(
      payload,
      Number(process.env.JWT_EXPIRATION || 3600)
    );
    const newRefreshToken = await this.issueRefreshToken(payload);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const payload = this.keyManager.verify<TokenPayload>(token, {
        issuer: 't3ck',
        audience: 't3ck-api',
      });

      if (payload.jti) {
        await this.revokeTokenByJti(payload.jti, payload.exp);
      }
    } catch (error) {
      this.logger.warn('Token revoke failed', { error: (error as Error).message });
    }
  }

  async revokeTokenByJti(jti: string, exp?: number): Promise<void> {
    const ttl = exp ? Math.max(exp - Math.floor(Date.now() / 1000), 0) : this.refreshTtlSeconds;

    await this.cache.set(`revoked:${jti}`, { revokedAt: new Date().toISOString() }, ttl);
    await this.cache.delete(`refresh:${jti}`);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return await this.cache.exists(`revoked:${jti}`);
  }
}
