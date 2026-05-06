import { createHash } from 'crypto';
import { TransactionLogEntry } from './types';

export class ImmutableTransactionLog {
  private readonly entries: TransactionLogEntry[] = [];

  append(
    entry: Omit<TransactionLogEntry, 'hash' | 'prevHash' | 'createdAt' | 'id'>
  ): TransactionLogEntry {
    const prevHash =
      this.entries.length > 0 ? this.entries[this.entries.length - 1].hash : 'GENESIS';
    const createdAt = new Date().toISOString();
    const id = `txlog_${Date.now()}_${this.entries.length + 1}`;

    const hash = createHash('sha256')
      .update(JSON.stringify({ ...entry, prevHash, createdAt, id }))
      .digest('hex');

    const fullEntry: TransactionLogEntry = {
      ...entry,
      id,
      createdAt,
      prevHash,
      hash,
    };

    this.entries.push(fullEntry);
    return fullEntry;
  }

  listByTenant(tenantId: string): TransactionLogEntry[] {
    return this.entries.filter((item) => item.tenantId === tenantId);
  }

  verifyIntegrity(): boolean {
    if (this.entries.length === 0) {
      return true;
    }

    for (let i = 0; i < this.entries.length; i += 1) {
      const current = this.entries[i];
      const expectedPrev = i === 0 ? 'GENESIS' : this.entries[i - 1].hash;
      if (current.prevHash !== expectedPrev) {
        return false;
      }

      const recalculated = createHash('sha256')
        .update(
          JSON.stringify({
            tenantId: current.tenantId,
            paymentId: current.paymentId,
            type: current.type,
            payload: current.payload,
            prevHash: current.prevHash,
            createdAt: current.createdAt,
            id: current.id,
          })
        )
        .digest('hex');

      if (recalculated !== current.hash) {
        return false;
      }
    }

    return true;
  }

  load(entries: TransactionLogEntry[]): void {
    this.entries.splice(0, this.entries.length, ...entries);
    if (!this.verifyIntegrity()) {
      throw new Error('Transaction log integrity check failed while loading state.');
    }
  }

  dump(): TransactionLogEntry[] {
    return [...this.entries];
  }
}
