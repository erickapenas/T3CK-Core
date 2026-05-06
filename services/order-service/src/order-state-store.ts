import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { Order, OrderStatusEvent } from './types';

export interface OrderStateSnapshot {
  orders: Order[];
  history: OrderStatusEvent[];
}

export class OrderStateStore {
  constructor(private readonly filePath: string) {}

  load(): OrderStateSnapshot | null {
    if (!existsSync(this.filePath)) {
      return null;
    }

    const raw = readFileSync(this.filePath, 'utf8');
    return JSON.parse(raw) as OrderStateSnapshot;
  }

  save(snapshot: OrderStateSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), { encoding: 'utf8' });
  }
}
