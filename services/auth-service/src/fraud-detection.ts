import { Logger } from '@t3ck/shared';
import { TokenPayload } from './auth';
import Redis from 'ioredis';

export interface SessionInfo {
  userId: string;
  tenantId: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  lastActivity: number;
}

export class FraudDetectionService {
  private redis: Redis;
  private logger: Logger;
  private maxSessionsPerUser: number = 5;

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.logger = new Logger('fraud-detection');
  }

  async validateToken(tokenPayload: TokenPayload): Promise<boolean> {
    // Verificar expiração
    if (tokenPayload.exp && tokenPayload.exp < Date.now() / 1000) {
      this.logger.warn('Token expired', { userId: tokenPayload.userId });
      return false;
    }

    // Verificar tenant ID
    if (!tokenPayload.tenantId || tokenPayload.tenantId.length === 0) {
      this.logger.warn('Invalid tenant ID in token', { userId: tokenPayload.userId });
      return false;
    }

    return true;
  }

  async registerSession(sessionInfo: SessionInfo): Promise<void> {
    const sessionKey = `session:${sessionInfo.userId}:${Date.now()}`;
    const userSessionsKey = `user_sessions:${sessionInfo.userId}`;

    try {
      // Armazenar sessão
      await this.redis.setex(
        sessionKey,
        3600 * 24, // 24 horas
        JSON.stringify(sessionInfo)
      );

      // Adicionar à lista de sessões do usuário
      await this.redis.sadd(userSessionsKey, sessionKey);
      await this.redis.expire(userSessionsKey, 3600 * 24);

      // Limitar número de sessões
      const sessionCount = await this.redis.scard(userSessionsKey);
      if (sessionCount > this.maxSessionsPerUser) {
        // Remover sessão mais antiga
        const sessions = await this.redis.smembers(userSessionsKey);
        if (sessions.length > 0) {
          const oldestSession = sessions[0];
          await this.redis.del(oldestSession);
          await this.redis.srem(userSessionsKey, oldestSession);
        }
      }
    } catch (error) {
      this.logger.error('Failed to register session', { error, sessionInfo });
    }
  }

  async detectAnomalies(
    userId: string,
    ip: string
  ): Promise<{ suspicious: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    try {
      // Verificar múltiplas sessões de IPs diferentes
      const userSessionsKey = `user_sessions:${userId}`;
      const sessions = await this.redis.smembers(userSessionsKey);
      const uniqueIPs = new Set<string>();

      for (const sessionKey of sessions) {
        const sessionData = await this.redis.get(sessionKey);
        if (sessionData) {
          const session: SessionInfo = JSON.parse(sessionData);
          uniqueIPs.add(session.ip);
        }
      }

      if (uniqueIPs.size > 3) {
        reasons.push('Multiple IPs detected for same user');
      }

      // Verificar padrão de acesso suspeito
      const accessKey = `access:${userId}:${ip}`;
      const accessCount = await this.redis.incr(accessKey);
      await this.redis.expire(accessKey, 300); // 5 minutos

      if (accessCount > 100) {
        reasons.push('Unusual access pattern detected');
      }

      return {
        suspicious: reasons.length > 0,
        reasons,
      };
    } catch (error) {
      this.logger.error('Anomaly detection failed', { error, userId });
      return { suspicious: false, reasons: [] };
    }
  }

  async revokeSession(userId: string, sessionId?: string): Promise<void> {
    try {
      if (sessionId) {
        await this.redis.del(`session:${userId}:${sessionId}`);
        await this.redis.srem(`user_sessions:${userId}`, `session:${userId}:${sessionId}`);
      } else {
        // Revogar todas as sessões
        const userSessionsKey = `user_sessions:${userId}`;
        const sessions = await this.redis.smembers(userSessionsKey);
        
        for (const sessionKey of sessions) {
          await this.redis.del(sessionKey);
        }
        
        await this.redis.del(userSessionsKey);
      }
    } catch (error) {
      this.logger.error('Failed to revoke session', { error, userId, sessionId });
    }
  }
}
