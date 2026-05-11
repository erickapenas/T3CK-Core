import {
  MigrationAccessMethod,
  MigrationDiscoverySummary,
  MigrationModuleKey,
  MigrationSourcePlatform,
  MigrationSourceResourceType,
} from '../types';
import { sanitizeRecord } from './sanitizer';
import {
  MigrationConnectionTestResult,
  MigrationConnector,
  MigrationConnectorFetch,
  MigrationConnectorFetchResult,
  MigrationConnectorInput,
  MigrationConnectorRecord,
} from './types';

const supportedPlatforms: MigrationSourcePlatform[] = ['woocommerce'];
const supportedAccessMethods: MigrationAccessMethod[] = ['api'];

function defaultFetch(): MigrationConnectorFetch {
  return (url, init) => globalThis.fetch(url, init);
}

function baseUrl(input: MigrationConnectorInput): string {
  return input.sourceUrl.replace(/\/+$/, '');
}

function endpoint(input: MigrationConnectorInput, resource: string, params: Record<string, string | number> = {}): string {
  const url = new URL(`${baseUrl(input)}/wp-json/wc/v3/${resource.replace(/^\/+/, '')}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

function authHeaders(input: MigrationConnectorInput): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'T3CK-Migration-Assistant/1.0',
  };
  if (input.credentials?.accessToken) {
    headers.Authorization = `Bearer ${input.credentials.accessToken}`;
    return headers;
  }
  if (input.credentials?.consumerKey && input.credentials.consumerSecret) {
    const token = Buffer.from(`${input.credentials.consumerKey}:${input.credentials.consumerSecret}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
  }
  return headers;
}

async function requestJson(
  input: MigrationConnectorInput,
  resource: string,
  params: Record<string, string | number> = {}
): Promise<{ data: unknown; total: number; status: number }> {
  const response = await (input.fetchImpl || defaultFetch())(endpoint(input, resource, params), {
    method: 'GET',
    headers: authHeaders(input),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`WooCommerce respondeu ${response.status}: ${message || response.statusText}`);
  }
  const total = Number(response.headers.get('x-wp-total') || response.headers.get('X-WP-Total') || 0);
  return { data: await response.json(), total: Number.isFinite(total) ? total : 0, status: response.status };
}

function complexity(totalRecords: number): 'baixa' | 'media' | 'alta' {
  if (totalRecords > 50000) return 'alta';
  if (totalRecords > 5000) return 'media';
  return 'baixa';
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function sourceResourceTypeForModule(module: MigrationModuleKey): MigrationSourceResourceType {
  const map: Record<MigrationModuleKey, MigrationSourceResourceType> = {
    catalog: 'product',
    customers: 'customer',
    orders: 'order',
    seo: 'seo',
    layout: 'layout',
    content: 'page',
    redirects: 'redirect',
  };
  return map[module];
}

function endpointForModule(module: MigrationModuleKey): string | undefined {
  const map: Partial<Record<MigrationModuleKey, string>> = {
    catalog: 'products',
    customers: 'customers',
    orders: 'orders',
    seo: 'products',
  };
  return map[module];
}

function labelFor(row: Record<string, unknown>, module: MigrationModuleKey): string | undefined {
  if (module === 'catalog') return String(row.name || row.slug || row.sku || row.id || '');
  if (module === 'customers') return String(row.first_name || row.email || row.id || '');
  if (module === 'orders') return String(row.number || row.id || '');
  if (module === 'seo') return String(row.permalink || row.slug || row.id || '');
  return undefined;
}

export class WooCommerceMigrationConnector implements MigrationConnector {
  readonly id = 'woocommerce_rest';
  readonly label = 'WooCommerce REST API';
  readonly platforms = supportedPlatforms;
  readonly accessMethods = supportedAccessMethods;

  supports(input: Pick<MigrationConnectorInput, 'sourcePlatform' | 'accessMethod'>): boolean {
    return input.sourcePlatform === 'woocommerce' && input.accessMethod === 'api';
  }

  async testConnection(input: MigrationConnectorInput): Promise<MigrationConnectionTestResult> {
    if (!input.credentials?.accessToken && (!input.credentials?.consumerKey || !input.credentials.consumerSecret)) {
      return {
        ok: false,
        message: 'Informe access token ou consumer key/secret do WooCommerce.',
        capabilities: [],
      };
    }
    try {
      const response = await requestJson(input, 'products', { per_page: 1, page: 1 });
      return {
        ok: true,
        statusCode: response.status,
        message: 'WooCommerce conectado com sucesso.',
        capabilities: ['catalog', 'customers', 'orders', 'seo'].filter((module) =>
          input.modules.includes(module as MigrationModuleKey)
        ) as MigrationModuleKey[],
        metadata: {
          connectorId: this.id,
          productsPreviewCount: response.total,
        },
      };
    } catch (error) {
      return {
        ok: false,
        message: (error as Error).message || 'Falha ao conectar com WooCommerce.',
        capabilities: [],
      };
    }
  }

  async discover(input: MigrationConnectorInput): Promise<MigrationDiscoverySummary> {
    const [products, categories, customers, orders] = await Promise.all([
      requestJson(input, 'products', { per_page: 1, page: 1 }),
      requestJson(input, 'products/categories', { per_page: 1, page: 1 }),
      input.modules.includes('customers') ? requestJson(input, 'customers', { per_page: 1, page: 1 }) : Promise.resolve({ total: 0 }),
      input.modules.includes('orders') ? requestJson(input, 'orders', { per_page: 1, page: 1 }) : Promise.resolve({ total: 0 }),
    ]);
    const productCount = input.modules.includes('catalog') ? products.total : 0;
    const categoryCount = input.modules.includes('catalog') ? categories.total : 0;
    const customerCount = 'total' in customers ? customers.total : 0;
    const orderCount = 'total' in orders ? orders.total : 0;
    const indexableUrls = input.modules.includes('seo') ? productCount + categoryCount : 0;
    const totalRecords = productCount + categoryCount + customerCount + orderCount + indexableUrls;

    return {
      platformDetected: 'woocommerce',
      products: productCount,
      categories: categoryCount,
      images: productCount,
      customers: customerCount,
      orders: orderCount,
      indexableUrls,
      pages: 0,
      redirects: input.modules.includes('redirects') ? indexableUrls : 0,
      complexity: complexity(totalRecords),
      availableSources: ['api', 'sitemap', 'manual'],
    };
  }

  async fetchModule(input: MigrationConnectorInput, module: MigrationModuleKey): Promise<MigrationConnectorFetchResult> {
    const resource = endpointForModule(module);
    if (!resource) {
      return {
        module,
        records: [],
        metadata: { source: 'woocommerce_api', unsupportedModule: true },
      };
    }
    const perPage = Math.min(Math.max(input.perPage || 25, 1), 100);
    const response = await requestJson(input, resource, { per_page: perPage, page: 1 });
    const records: MigrationConnectorRecord[] = asArray(response.data).map((row, index) => ({
      module,
      sourceResourceType: sourceResourceTypeForModule(module),
      sourceId: String(row.id || row.sku || `${module}_${index + 1}`),
      label: labelFor(row, module),
      data: sanitizeRecord(row),
    }));
    return {
      module,
      records,
      metadata: {
        source: 'woocommerce_api',
        sampledRecords: records.length,
        totalRecords: response.total,
        perPage,
      },
    };
  }
}
