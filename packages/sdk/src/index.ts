import { T3CKClient } from './client';
import { CartModule } from './cart';
import { CatalogModule } from './catalog';
import { CheckoutModule } from './checkout';
import { SettingsModule } from './settings';
import { ClientConfig } from './types';

export class T3CK {
  public cart: CartModule;
  public catalog: CatalogModule;
  public checkout: CheckoutModule;
  public settings: SettingsModule;

  private client: T3CKClient;

  constructor(config: ClientConfig) {
    this.client = new T3CKClient(config);
    this.cart = new CartModule(this.client);
    this.catalog = new CatalogModule(this.client);
    this.checkout = new CheckoutModule(this.client);
    this.settings = new SettingsModule(this.client);
  }
}

// Export default instance factory
export function createT3CK(config: ClientConfig): T3CK {
  return new T3CK(config);
}

// Export types
export * from './types';
export * from './cart';
export * from './catalog';
export * from './checkout';
export * from './settings';

// Default export
export default T3CK;
