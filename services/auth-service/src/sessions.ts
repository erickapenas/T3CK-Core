import crypto from 'crypto';
import { CacheService } from './cache';

export interface SessionMetadata {
  sessionId: string;
  tenantId: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip?: string;
  userAgent?: string;
}

export class SessionService {
  private cache: CacheService;
  private ttlSeconds: number;

  constructor(cache: CacheService, ttlSeconds: number = 60 * 60 * 24) {
    this.cache = cache;
    this.ttlSeconds = ttlSeconds;
  }

  async createSession(tenantId: string, userId: string, ip?: string, userAgent?: string): Promise<SessionMetadata> {
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    const session: SessionMetadata = {
      sessionId,
      tenantId,
      userId,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ip,
      userAgent,
    };

    await this.cache.set(`session:${sessionId}`, session, this.ttlSeconds);
    await this.addToIndex(`session_index:user:${userId}`, sessionId);
    await this.addToIndex(`session_index:tenant:${tenantId}`, sessionId);

    return session;
  }

  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    return await this.cache.get<SessionMetadata>(`session:${sessionId}`);
  }

  async listSessionsByUser(userId: string): Promise<SessionMetadata[]> {
    return this.listByIndex(`session_index:user:${userId}`);
  }

  async listSessionsByTenant(tenantId: string): Promise<SessionMetadata[]> {
    return this.listByIndex(`session_index:tenant:${tenantId}`);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.cache.delete(`session:${sessionId}`);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const sessions = await this.listByIndex(`session_index:user:${userId}`);
    await Promise.all(sessions.map(session => this.cache.delete(`session:${session.sessionId}`)));
  }

  private async addToIndex(indexKey: string, sessionId: string): Promise<void> {
    const existing = await this.cache.get<string[]>(indexKey);
    const updated = existing ? Array.from(new Set([...existing, sessionId])) : [sessionId];
    await this.cache.set(indexKey, updated, this.ttlSeconds);
  }

  private async listByIndex(indexKey: string): Promise<SessionMetadata[]> {
    const sessionIds = await this.cache.get<string[]>(indexKey);
    if (!sessionIds) {
      return [];
    }

    const results: SessionMetadata[] = [];
    for (const sessionId of sessionIds) {
      const session = await this.cache.get<SessionMetadata>(`session:${sessionId}`);
      if (session) {
        results.push(session);
      }
    }

    return results;
  }
}
