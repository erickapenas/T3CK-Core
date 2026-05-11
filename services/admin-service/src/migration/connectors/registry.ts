import { FileMigrationConnector } from './file-connector';
import { MigrationConnector, MigrationConnectorInput } from './types';
import { WooCommerceMigrationConnector } from './woocommerce-connector';

export class MigrationConnectorRegistry {
  constructor(private readonly connectors: MigrationConnector[]) {}

  list(): MigrationConnector[] {
    return [...this.connectors];
  }

  find(input: Pick<MigrationConnectorInput, 'sourcePlatform' | 'accessMethod'>): MigrationConnector | undefined {
    return this.connectors.find((connector) => connector.supports(input));
  }
}

export const defaultMigrationConnectorRegistry = new MigrationConnectorRegistry([
  new FileMigrationConnector(),
  new WooCommerceMigrationConnector(),
]);
