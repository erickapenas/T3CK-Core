import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { IntegrationStateSnapshot } from './types';

export const emptyIntegrationState = (): IntegrationStateSnapshot => ({
  integrations: [],
  marketplaceAccounts: [],
  marketplaceOrders: [],
  integrationLogs: [],
  pageSpeedReports: [],
});

export interface IntegrationStateStore {
  load(): Promise<IntegrationStateSnapshot>;
  save(snapshot: IntegrationStateSnapshot): Promise<void>;
}

export class FileIntegrationStateStore implements IntegrationStateStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async load(): Promise<IntegrationStateSnapshot> {
    if (!existsSync(this.filePath)) {
      return emptyIntegrationState();
    }

    const raw = readFileSync(this.filePath, 'utf8');
    if (!raw.trim()) {
      return emptyIntegrationState();
    }

    const parsed = JSON.parse(raw) as Partial<IntegrationStateSnapshot>;
    return {
      integrations: parsed.integrations || [],
      marketplaceAccounts: parsed.marketplaceAccounts || [],
      marketplaceOrders: parsed.marketplaceOrders || [],
      integrationLogs: parsed.integrationLogs || [],
      pageSpeedReports: parsed.pageSpeedReports || [],
    };
  }

  async save(snapshot: IntegrationStateSnapshot): Promise<void> {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2));
  }
}
