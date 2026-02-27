import { createHash } from 'crypto';

interface StoredResponse {
  payloadHash: string;
  response: unknown;
  createdAt: number;
}

export class IdempotencyStore {
  private readonly storage = new Map<string, StoredResponse>();

  constructor(private readonly ttlMs: number = 1000 * 60 * 60 * 24) {}

  private normalizePayload(payload: unknown): string {
    return JSON.stringify(payload, Object.keys(payload as Record<string, unknown>).sort());
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(this.normalizePayload(payload)).digest('hex');
  }

  get<T>(key: string, payload: unknown): T | null {
    const item = this.storage.get(key);
    if (!item) {
      return null;
    }

    if (Date.now() - item.createdAt > this.ttlMs) {
      this.storage.delete(key);
      return null;
    }

    const payloadHash = this.hashPayload(payload);
    if (payloadHash !== item.payloadHash) {
      throw new Error('Idempotency key já usada com payload diferente.');
    }

    return item.response as T;
  }

  set(key: string, payload: unknown, response: unknown): void {
    this.storage.set(key, {
      payloadHash: this.hashPayload(payload),
      response,
      createdAt: Date.now(),
    });
  }
}
