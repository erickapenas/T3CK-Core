import * as XLSX from 'xlsx';
import {
  MigrationAccessMethod,
  MigrationDiscoverySummary,
  MigrationModuleKey,
  MigrationSourcePlatform,
  MigrationSourceResourceType,
} from '../types';
import {
  MigrationConnectionTestResult,
  MigrationConnector,
  MigrationConnectorFetchResult,
  MigrationConnectorInput,
  MigrationConnectorRecord,
} from './types';
import { sanitizeRecord } from './sanitizer';

const supportedPlatforms: MigrationSourcePlatform[] = ['csv', 'other'];
const supportedAccessMethods: MigrationAccessMethod[] = ['file'];

const moduleAliases: Record<MigrationModuleKey, string[]> = {
  catalog: ['catalog', 'products', 'produtos', 'items', 'skus', 'variants', 'variations'],
  customers: ['customers', 'clientes', 'clients', 'users'],
  orders: ['orders', 'pedidos', 'sales'],
  seo: ['seo', 'urls', 'sitemap'],
  layout: ['layout', 'theme', 'banners', 'menus'],
  content: ['content', 'pages', 'paginas', 'posts'],
  redirects: ['redirects', 'redirecionamentos', '301'],
};

function normalizeKey(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function contentFromInput(input: MigrationConnectorInput): string | undefined {
  if (input.fileContent !== undefined) return input.fileContent;
  if (!input.fileContentBase64) return undefined;
  return Buffer.from(input.fileContentBase64, 'base64').toString('utf8');
}

function fileName(input: MigrationConnectorInput): string {
  return (input.fileName || input.feedUrl || input.sourceUrl || '').toLowerCase();
}

function isXlsx(input: MigrationConnectorInput): boolean {
  const name = fileName(input);
  return name.endsWith('.xlsx') || name.endsWith('.xls');
}

function isJson(input: MigrationConnectorInput): boolean {
  return fileName(input).endsWith('.json') || input.contentType === 'application/json';
}

function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes && char === delimiter) count += 1;
  }
  return count;
}

function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim()) || '';
  const candidates = [',', ';', '\t'];
  return candidates
    .map((delimiter) => ({ delimiter, count: countDelimiter(firstLine, delimiter) }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

function parseDelimited(content: string): string[][] {
  const delimiter = detectDelimiter(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(field.trim());
      field = '';
      continue;
    }
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field.trim());
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }

  row.push(field.trim());
  if (row.some((item) => item.length > 0)) rows.push(row);
  return rows;
}

function parseCsv(content: string): Record<string, unknown>[] {
  const rows = parseDelimited(content);
  const headers = (rows.shift() || []).map(normalizeKey);
  return rows.map((row) =>
    Object.fromEntries(
      headers
        .map((header, index) => [header, row[index] ?? ''] as const)
        .filter(([header]) => header.length > 0)
    )
  );
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => [normalizeKey(key), value] as const)
      .filter(([key]) => key.length > 0)
  );
}

function parseWorkbook(input: MigrationConnectorInput): Map<MigrationModuleKey, Record<string, unknown>[]> {
  const content = input.fileContentBase64
    ? Buffer.from(input.fileContentBase64, 'base64')
    : input.fileContent
      ? Buffer.from(input.fileContent, 'binary')
      : undefined;
  if (!content?.length) return new Map();

  const workbook = XLSX.read(content, { type: 'buffer', cellDates: false });
  const grouped = new Map<MigrationModuleKey, Record<string, unknown>[]>();
  workbook.SheetNames.forEach((sheetName: string) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;
    const rows = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(worksheet, { defval: '', raw: false })
      .map((row: Record<string, unknown>) => normalizeRow(row))
      .filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));
    if (!rows.length) return;
    const module = moduleFromObjectKey(sheetName) || inferModule(rows[0], input);
    if (!input.modules.includes(module)) return;
    grouped.set(module, [...(grouped.get(module) || []), ...rows]);
  });
  return grouped;
}

function aliasesForModule(module: MigrationModuleKey): string[] {
  return moduleAliases[module] || [];
}

function moduleFromObjectKey(key: string): MigrationModuleKey | undefined {
  const normalized = normalizeKey(key);
  return (Object.keys(moduleAliases) as MigrationModuleKey[]).find((module) =>
    aliasesForModule(module).some((alias) => normalized.includes(alias))
  );
}

function inferModule(row: Record<string, unknown>, input: MigrationConnectorInput): MigrationModuleKey {
  if (input.modules.length === 1) return input.modules[0];
  const keys = new Set(Object.keys(row).map(normalizeKey));
  const name = fileName(input);

  if (keys.has('order_number') || keys.has('pedido') || keys.has('payment_status') || name.includes('order')) return 'orders';
  if (keys.has('email') || keys.has('customer_email') || keys.has('cpf') || keys.has('cnpj') || name.includes('customer')) {
    return 'customers';
  }
  if (keys.has('old_url') || keys.has('new_url') || keys.has('redirect') || name.includes('redirect')) return 'redirects';
  if (keys.has('meta_title') || keys.has('canonical') || keys.has('h1') || name.includes('seo')) return 'seo';
  if (keys.has('html') || keys.has('body') || keys.has('page_title') || name.includes('page')) return 'content';
  if (keys.has('sku') || keys.has('price') || keys.has('regular_price') || keys.has('product_id') || name.includes('product')) {
    return 'catalog';
  }
  return input.modules.find((module) => module !== 'layout') || 'catalog';
}

function resourceTypeForModule(module: MigrationModuleKey): MigrationSourceResourceType {
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

function sourceIdFor(row: Record<string, unknown>, module: MigrationModuleKey, index: number): string {
  const candidates: Record<MigrationModuleKey, string[]> = {
    catalog: ['id', 'product_id', 'sku', 'codigo', 'handle', 'slug'],
    customers: ['id', 'customer_id', 'email', 'cpf', 'cnpj'],
    orders: ['id', 'order_id', 'order_number', 'numero'],
    seo: ['id', 'url', 'old_url', 'slug', 'canonical'],
    layout: ['id', 'type', 'name', 'title'],
    content: ['id', 'slug', 'url', 'title', 'page_title'],
    redirects: ['id', 'old_url', 'from', 'source_url'],
  };
  const key = candidates[module].find((candidate) => row[candidate]);
  return key ? String(row[key]) : `${module}_${index + 1}`;
}

function labelFor(row: Record<string, unknown>, module: MigrationModuleKey): string | undefined {
  const candidates: Record<MigrationModuleKey, string[]> = {
    catalog: ['name', 'title', 'product_name', 'sku'],
    customers: ['name', 'full_name', 'email'],
    orders: ['order_number', 'numero', 'id'],
    seo: ['url', 'old_url', 'slug'],
    layout: ['name', 'title', 'type'],
    content: ['title', 'page_title', 'slug'],
    redirects: ['old_url', 'from'],
  };
  const key = candidates[module].find((candidate) => row[candidate]);
  return key ? String(row[key]) : undefined;
}

function groupRows(input: MigrationConnectorInput): Map<MigrationModuleKey, Record<string, unknown>[]> {
  if (isXlsx(input)) {
    return parseWorkbook(input);
  }
  const content = contentFromInput(input);
  if (!content || !content.trim()) return new Map();

  const grouped = new Map<MigrationModuleKey, Record<string, unknown>[]>();
  const addRows = (module: MigrationModuleKey, rows: Record<string, unknown>[]) => {
    if (!input.modules.includes(module)) return;
    grouped.set(module, [...(grouped.get(module) || []), ...rows]);
  };

  if (isJson(input)) {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      const rows = parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
      addRows(rows[0] ? inferModule(rows[0], input) : input.modules[0], rows);
      return grouped;
    }
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
        if (!Array.isArray(value)) return;
        const module = moduleFromObjectKey(key);
        if (!module) return;
        addRows(
          module,
          value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        );
      });
      return grouped;
    }
    return grouped;
  }

  const rows = parseCsv(content);
  addRows(rows[0] ? inferModule(rows[0], input) : input.modules[0], rows);
  return grouped;
}

function countImages(rows: Record<string, unknown>[]): number {
  const imageKeys = ['image', 'image_url', 'images', 'main_image', 'foto', 'imagem'];
  return rows.reduce((total, row) => {
    const count = imageKeys.reduce((acc, key) => {
      const raw = row[key];
      if (!raw) return acc;
      return acc + String(raw).split(/[|,;]/).filter((item) => item.trim()).length;
    }, 0);
    return total + count;
  }, 0);
}

function countCategories(rows: Record<string, unknown>[]): number {
  const values = new Set<string>();
  rows.forEach((row) => {
    ['category', 'categories', 'categoria', 'category_name'].forEach((key) => {
      const raw = row[key];
      if (!raw) return;
      String(raw)
        .split(/[|,>;]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => values.add(item.toLowerCase()));
    });
  });
  return values.size;
}

function complexity(totalRecords: number): 'baixa' | 'media' | 'alta' {
  if (totalRecords > 10000) return 'alta';
  if (totalRecords > 1000) return 'media';
  return 'baixa';
}

export class FileMigrationConnector implements MigrationConnector {
  readonly id = 'file_csv_json_xlsx';
  readonly label = 'Arquivo CSV/JSON/XLS/XLSX';
  readonly platforms = supportedPlatforms;
  readonly accessMethods = supportedAccessMethods;

  supports(input: Pick<MigrationConnectorInput, 'sourcePlatform' | 'accessMethod'>): boolean {
    return input.accessMethod === 'file' || input.sourcePlatform === 'csv';
  }

  async testConnection(input: MigrationConnectorInput): Promise<MigrationConnectionTestResult> {
    const content = contentFromInput(input);
    if (!content && !input.fileContentBase64) {
      return {
        ok: true,
        message: 'Arquivo registrado. Envie o conteudo CSV/JSON/XLS/XLSX na descoberta para leitura real dos dados.',
        capabilities: input.modules,
        metadata: { contentProvided: false, fileName: input.fileName },
      };
    }
    const grouped = groupRows(input);
    return {
      ok: true,
      message: 'Arquivo lido e pre-validado sem persistir payload bruto.',
      capabilities: Array.from(grouped.keys()),
      metadata: {
        contentProvided: true,
        fileName: input.fileName,
        totalRows: Array.from(grouped.values()).reduce((total, rows) => total + rows.length, 0),
      },
    };
  }

  async discover(input: MigrationConnectorInput): Promise<MigrationDiscoverySummary> {
    const grouped = groupRows(input);
    const catalogRows = grouped.get('catalog') || [];
    const customersRows = grouped.get('customers') || [];
    const ordersRows = grouped.get('orders') || [];
    const seoRows = grouped.get('seo') || [];
    const contentRows = grouped.get('content') || [];
    const redirectRows = grouped.get('redirects') || [];
    const totalRecords = Array.from(grouped.values()).reduce((total, rows) => total + rows.length, 0);

    return {
      platformDetected: input.sourcePlatform,
      products: catalogRows.length,
      categories: countCategories(catalogRows),
      images: countImages(catalogRows),
      customers: customersRows.length,
      orders: ordersRows.length,
      indexableUrls: seoRows.length + redirectRows.length,
      pages: contentRows.length,
      redirects: redirectRows.length,
      complexity: complexity(totalRecords),
      availableSources: ['file', 'manual'],
    };
  }

  async fetchModule(input: MigrationConnectorInput, module: MigrationModuleKey): Promise<MigrationConnectorFetchResult> {
    const grouped = groupRows(input);
    const rows = grouped.get(module) || [];
    const records: MigrationConnectorRecord[] = rows.slice(0, 500).map((row, index) => ({
      module,
      sourceResourceType: resourceTypeForModule(module),
      sourceId: sourceIdFor(row, module, index),
      label: labelFor(row, module),
      data: sanitizeRecord(row),
    }));

    return {
      module,
      records,
      metadata: {
        source: 'file',
        fileName: input.fileName,
        sampledRecords: records.length,
        totalRows: rows.length,
      },
    };
  }
}
