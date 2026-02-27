import { CacheService } from './cache';

export class TokenBlacklist {
  private cache: CacheService;

  constructor(cache: CacheService) {
    this.cache = cache;
  }

  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    await this.cache.set(`revoked:${jti}`, { revokedAt: new Date().toISOString() }, ttlSeconds);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return await this.cache.exists(`revoked:${jti}`);
  }
}
