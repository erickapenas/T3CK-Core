import { createHash } from 'crypto';

interface StoredResponse {
  payloadHash: string;
  response: unknown;
  createdAt: number;
}

export interface IdempotencySnapshotEntry extends StoredResponse {
  key: string;
}

export class IdempotencyStore {
  private readonly storage = new Map<string, StoredResponse>();

  constructor(private readonly ttlMs: number = 1000 * 60 * 60 * 24) {}

  private normalizePayload(payload: unknown): string {
    return JSON.stringify(this.sortValue(payload));
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item));
    }

    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = this.sortValue((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }

    return value;
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

  load(entries: IdempotencySnapshotEntry[]): void {
    this.storage.clear();
    for (const entry of entries) {
      this.storage.set(entry.key, {
        payloadHash: entry.payloadHash,
        response: entry.response,
        createdAt: entry.createdAt,
      });
    }
  }

  dump(): IdempotencySnapshotEntry[] {
    return Array.from(this.storage.entries()).map(([key, value]) => ({
      key,
      ...value,
    }));
  }
}
