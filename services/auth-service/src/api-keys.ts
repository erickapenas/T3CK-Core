import crypto from 'crypto';
import { CacheService } from './cache';
import { Logger } from '@t3ck/shared';

export interface ApiKeyMetadata {
  keyId: string;
  tenantId: string;
  userId: string;
  name?: string;
  scopes?: string[];
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export class ApiKeyService {
  private cache: CacheService;
  private logger: Logger;
  private ttlSeconds: number;

  constructor(cache: CacheService, ttlSeconds: number = 60 * 60 * 24 * 90) {
    this.cache = cache;
    this.logger = new Logger('api-key-service');
    this.ttlSeconds = ttlSeconds;
  }

  async createApiKey(metadata: Omit<ApiKeyMetadata, 'keyId' | 'createdAt' | 'lastUsedAt' | 'revokedAt'>) {
    const rawKey = `t3ck_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = this.hashKey(rawKey);
    const keyId = keyHash.substring(0, 12);

    const stored: ApiKeyMetadata = {
      ...metadata,
      keyId,
      createdAt: new Date().toISOString(),
    };

    await this.cache.set(`api_key:${keyHash}`, stored, this.ttlSeconds);
    await this.cache.set(`api_key_id:${keyId}`, { keyHash }, this.ttlSeconds);

    await this.addToIndex(`api_key_index:tenant:${metadata.tenantId}`, keyId);
    await this.addToIndex(`api_key_index:user:${metadata.userId}`, keyId);

    this.logger.info('API key created', { keyId, tenantId: metadata.tenantId, userId: metadata.userId });
    return { apiKey: rawKey, metadata: stored };
  }

  async verifyApiKey(apiKey: string): Promise<ApiKeyMetadata | null> {
    const keyHash = this.hashKey(apiKey);
    const metadata = await this.cache.get<ApiKeyMetadata>(`api_key:${keyHash}`);

    if (!metadata || metadata.revokedAt) {
      this.logger.warn('API key verification failed', { reason: 'revoked_or_missing' });
      return null;
    }

    if (metadata.expiresAt && new Date(metadata.expiresAt).getTime() < Date.now()) {
      this.logger.warn('API key verification failed', { reason: 'expired', keyId: metadata.keyId });
      return null;
    }

    metadata.lastUsedAt = new Date().toISOString();
    await this.cache.set(`api_key:${keyHash}`, metadata, this.ttlSeconds);

    return metadata;
  }

  async revokeApiKey(keyId: string): Promise<void> {
    const idEntry = await this.cache.get<{ keyHash: string }>(`api_key_id:${keyId}`);
    if (!idEntry) {
      return;
    }

    const metadata = await this.cache.get<ApiKeyMetadata>(`api_key:${idEntry.keyHash}`);
    if (!metadata) {
      return;
    }

    metadata.revokedAt = new Date().toISOString();
    await this.cache.set(`api_key:${idEntry.keyHash}`, metadata, this.ttlSeconds);
    this.logger.info('API key revoked', { keyId, tenantId: metadata.tenantId, userId: metadata.userId });
  }

  async listKeysByTenant(tenantId: string): Promise<ApiKeyMetadata[]> {
    return this.listByIndex(`api_key_index:tenant:${tenantId}`);
  }

  async listKeysByUser(userId: string): Promise<ApiKeyMetadata[]> {
    return this.listByIndex(`api_key_index:user:${userId}`);
  }

  private hashKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  private async addToIndex(indexKey: string, keyId: string): Promise<void> {
    const existing = await this.cache.get<string[]>(indexKey);
    const updated = existing ? Array.from(new Set([...existing, keyId])) : [keyId];
    await this.cache.set(indexKey, updated, this.ttlSeconds);
  }

  private async listByIndex(indexKey: string): Promise<ApiKeyMetadata[]> {
    const keyIds = await this.cache.get<string[]>(indexKey);
    if (!keyIds) {
      return [];
    }

    const results: ApiKeyMetadata[] = [];

    for (const keyId of keyIds) {
      const idEntry = await this.cache.get<{ keyHash: string }>(`api_key_id:${keyId}`);
      if (!idEntry) {
        continue;
      }
      const metadata = await this.cache.get<ApiKeyMetadata>(`api_key:${idEntry.keyHash}`);
      if (metadata) {
        results.push(metadata);
      }
    }

    return results;
  }
}
