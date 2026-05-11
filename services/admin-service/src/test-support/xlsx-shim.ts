type Workbook = {
  SheetNames: string[];
  Sheets: Record<string, Array<Record<string, unknown>>>;
};

export const utils = {
  book_new(): Workbook {
    return { SheetNames: [], Sheets: {} };
  },
  json_to_sheet<T extends Record<string, unknown>>(rows: T[]): T[] {
    return rows;
  },
  book_append_sheet(workbook: Workbook, worksheet: Array<Record<string, unknown>>, name: string): void {
    workbook.SheetNames.push(name);
    workbook.Sheets[name] = worksheet;
  },
  sheet_to_json<T extends Record<string, unknown>>(worksheet: unknown): T[] {
    return Array.isArray(worksheet) ? worksheet as T[] : [];
  },
};

export function write(workbook: Workbook, options?: { type?: string }): string {
  const serialized = JSON.stringify(workbook);
  return options?.type === 'base64'
    ? Buffer.from(serialized, 'utf8').toString('base64')
    : serialized;
}

export function read(content: Buffer | string): Workbook {
  const raw = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  return JSON.parse(raw) as Workbook;
}
