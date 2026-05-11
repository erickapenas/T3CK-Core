declare module 'xlsx' {
  export type WorkBook = {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };

  export const utils: {
    sheet_to_json<T extends Record<string, unknown>>(
      worksheet: unknown,
      options?: { defval?: unknown; raw?: boolean }
    ): T[];
    book_new(): WorkBook;
    json_to_sheet<T extends Record<string, unknown>>(rows: T[]): unknown;
    book_append_sheet(workbook: WorkBook, worksheet: unknown, name: string): void;
  };

  export function read(data: unknown, options?: Record<string, unknown>): WorkBook;
  export function write(workbook: WorkBook, options?: Record<string, unknown>): string;
}
