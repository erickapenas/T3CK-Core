import { MigrationModuleKey, MigrationT3ckResourceType } from './types';

export type MigrationColumnMappingSuggestion = {
  target: string;
  source?: string;
  required: boolean;
  confidence: 'high' | 'medium' | 'low';
};

export type MigrationNormalizedPreview = {
  module: MigrationModuleKey;
  targetResourceType: MigrationT3ckResourceType;
  fields: Record<string, unknown>;
  columnMappings: MigrationColumnMappingSuggestion[];
  warnings: string[];
};

const catalogMap: Record<string, string[]> = {
  name: ['name', 'title', 'product_name', 'nome', 'produto'],
  sku: ['sku', 'codigo', 'codigo_sku', 'referencia'],
  slug: ['slug', 'handle', 'url_key'],
  price: ['price', 'regular_price', 'preco', 'preco_venda', 'sale_price'],
  promotionalPrice: ['promotional_price', 'promo_price', 'preco_promocional', 'sale_price'],
  costPrice: ['cost', 'cost_price', 'custo', 'preco_custo'],
  category: ['category', 'categories', 'categoria', 'category_name'],
  brand: ['brand', 'marca'],
  stockQuantity: ['stock', 'stock_quantity', 'estoque', 'quantity', 'quantidade'],
  description: ['description', 'descricao', 'body_html'],
  imageUrl: ['image', 'image_url', 'main_image', 'imagem', 'foto'],
};

const customerMap: Record<string, string[]> = {
  name: ['name', 'full_name', 'nome', 'cliente'],
  email: ['email', 'customer_email', 'e_mail'],
  phone: ['phone', 'telefone', 'whatsapp', 'mobile'],
  document: ['cpf', 'cnpj', 'document', 'documento'],
  city: ['city', 'cidade'],
  state: ['state', 'uf', 'estado'],
  createdAt: ['created_at', 'data_cadastro'],
};

const orderMap: Record<string, string[]> = {
  orderNumber: ['order_number', 'numero', 'pedido', 'number'],
  customerEmail: ['customer_email', 'email'],
  status: ['status', 'order_status', 'status_pedido'],
  total: ['total', 'total_price', 'valor_total'],
  createdAt: ['created_at', 'date_created', 'data_pedido'],
  paymentMethod: ['payment_method', 'forma_pagamento'],
};

const seoMap: Record<string, string[]> = {
  url: ['url', 'permalink', 'old_url', 'link'],
  slug: ['slug', 'handle'],
  metaTitle: ['meta_title', 'seo_title', 'title'],
  metaDescription: ['meta_description', 'description'],
  h1: ['h1', 'heading'],
  canonical: ['canonical', 'canonical_url'],
};

const redirectMap: Record<string, string[]> = {
  oldUrl: ['old_url', 'from', 'source_url', 'url_antiga'],
  newUrl: ['new_url', 'to', 'target_url', 'url_nova'],
  statusCode: ['status_code', 'type', 'status'],
};

const contentMap: Record<string, string[]> = {
  title: ['title', 'page_title', 'titulo'],
  slug: ['slug', 'handle'],
  body: ['body', 'html', 'content', 'conteudo'],
  metaTitle: ['meta_title', 'seo_title'],
  metaDescription: ['meta_description'],
};

const layoutMap: Record<string, string[]> = {
  type: ['type', 'section_type', 'tipo'],
  title: ['title', 'titulo', 'name'],
  imageUrl: ['image', 'image_url', 'banner'],
  link: ['link', 'url', 'href'],
};

function firstSource(row: Record<string, unknown>, aliases: string[]): string | undefined {
  return aliases.find((alias) => {
    const value = row[alias];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
}

function numberFrom(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).trim().replace(/[^\d,.-]/g, '');
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const normalized =
    lastComma >= 0 && lastDot >= 0
      ? lastComma > lastDot
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '')
      : lastComma >= 0
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeFields(
  row: Record<string, unknown>,
  map: Record<string, string[]>,
  required: string[],
  numericFields: string[] = []
): Pick<MigrationNormalizedPreview, 'fields' | 'columnMappings' | 'warnings'> {
  const fields: Record<string, unknown> = {};
  const warnings: string[] = [];
  const columnMappings = Object.entries(map).map(([target, aliases]) => {
    const source = firstSource(row, aliases);
    if (source) {
      fields[target] = numericFields.includes(target) ? numberFrom(row[source]) : row[source];
    }
    return {
      target,
      source,
      required: required.includes(target),
      confidence: source ? 'high' : 'low',
    } satisfies MigrationColumnMappingSuggestion;
  });

  required.forEach((field) => {
    if (fields[field] === undefined || fields[field] === '') {
      warnings.push(`Campo obrigatorio ausente: ${field}`);
    }
  });
  return { fields, columnMappings, warnings };
}

function targetType(module: MigrationModuleKey): MigrationT3ckResourceType {
  const map: Record<MigrationModuleKey, MigrationT3ckResourceType> = {
    catalog: 'product',
    customers: 'customer',
    orders: 'order',
    seo: 'unknown',
    layout: 'theme',
    content: 'page',
    redirects: 'redirect',
  };
  return map[module];
}

export function normalizeMigrationRecord(
  module: MigrationModuleKey,
  row: Record<string, unknown>
): MigrationNormalizedPreview {
  const configs: Record<
    MigrationModuleKey,
    { map: Record<string, string[]>; required: string[]; numericFields?: string[] }
  > = {
    catalog: { map: catalogMap, required: ['name', 'sku', 'price'], numericFields: ['price', 'promotionalPrice', 'costPrice', 'stockQuantity'] },
    customers: { map: customerMap, required: ['name', 'email'] },
    orders: { map: orderMap, required: ['orderNumber', 'total'], numericFields: ['total'] },
    seo: { map: seoMap, required: ['url'] },
    layout: { map: layoutMap, required: ['type'] },
    content: { map: contentMap, required: ['title'] },
    redirects: { map: redirectMap, required: ['oldUrl', 'newUrl'] },
  };
  const config = configs[module];
  const normalized = normalizeFields(row, config.map, config.required, config.numericFields || []);
  return {
    module,
    targetResourceType: targetType(module),
    ...normalized,
  };
}
