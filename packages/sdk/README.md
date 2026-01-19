# @t3ck/sdk

SDK interno T3CK para operações de cart, catalog, checkout e settings.

## Instalação

```bash
pnpm add @t3ck/sdk
```

## Uso

```typescript
import { createT3CK } from '@t3ck/sdk';

const t3ck = createT3CK({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.t3ck.com',
});

// Carrinho
await t3ck.cart.add(product, 2);
await t3ck.cart.get();
await t3ck.cart.remove(itemId);

// Catálogo
const results = await t3ck.catalog.search({ query: 'notebook' });
const product = await t3ck.catalog.getProduct('prod-123');

// Checkout
const order = await t3ck.checkout.create({
  shippingAddress: { /* ... */ },
  paymentMethod: 'credit_card',
});

// Configurações
const settings = await t3ck.settings.get();
await t3ck.settings.update({ currency: 'BRL' });
```

## API Reference

### Cart

- `add(product: Product, quantity?: number): Promise<Cart>`
- `remove(itemId: string): Promise<Cart>`
- `update(itemId: string, quantity: number): Promise<Cart>`
- `get(): Promise<Cart>`
- `clear(): Promise<Cart>`

### Catalog

- `search(query: SearchQuery): Promise<SearchResult>`
- `getProduct(id: string): Promise<Product>`
- `getProducts(ids: string[]): Promise<Product[]>`
- `getCategories(): Promise<string[]>`

### Checkout

- `create(request: CheckoutRequest): Promise<Order>`
- `getStatus(orderId: string): Promise<Order>`
- `cancel(orderId: string, reason?: string): Promise<Order>`
- `getOrders(filters?: OrderFilters): Promise<Order[]>`

### Settings

- `get(): Promise<Settings>`
- `update(updates: Partial<Settings>): Promise<Settings>`
- `getPaymentMethods(): Promise<string[]>`
- `updatePaymentMethods(methods: string[]): Promise<string[]>`
