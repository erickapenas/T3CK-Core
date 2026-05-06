import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { TransactionLogEntry } from './types';

export interface PaymentStateSnapshot<TPayment = unknown, TIdempotency = unknown> {
  payments: TPayment[];
  processedWebhookEvents: string[];
  idempotency: TIdempotency[];
  transactionLog: TransactionLogEntry[];
}

export class PaymentStateStore {
  constructor(private readonly filePath: string) {}

  load<TPayment, TIdempotency>(): PaymentStateSnapshot<TPayment, TIdempotency> | null {
    if (!existsSync(this.filePath)) {
      return null;
    }

    const raw = readFileSync(this.filePath, 'utf8');
    return JSON.parse(raw) as PaymentStateSnapshot<TPayment, TIdempotency>;
  }

  save<TPayment, TIdempotency>(snapshot: PaymentStateSnapshot<TPayment, TIdempotency>): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), { encoding: 'utf8' });
  }
}
