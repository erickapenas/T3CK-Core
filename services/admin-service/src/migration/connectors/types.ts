import {
  MigrationAccessMethod,
  MigrationDiscoverySummary,
  MigrationModuleKey,
  MigrationSourcePlatform,
  MigrationSourceResourceType,
} from '../types';

export type MigrationConnectorCredentials = {
  apiKey?: string;
  accessToken?: string;
  consumerKey?: string;
  consumerSecret?: string;
};

export type MigrationConnectorInput = {
  sourcePlatform: MigrationSourcePlatform;
  sourceUrl: string;
  accessMethod: MigrationAccessMethod;
  modules: MigrationModuleKey[];
  credentials?: MigrationConnectorCredentials;
  feedUrl?: string;
  fileName?: string;
  fileContent?: string;
  fileContentBase64?: string;
  contentType?: string;
  timeoutMs?: number;
  perPage?: number;
  fetchImpl?: MigrationConnectorFetch;
};

export type MigrationConnectionTestResult = {
  ok: boolean;
  statusCode?: number;
  message: string;
  capabilities: MigrationModuleKey[];
  metadata?: Record<string, unknown>;
};

export type MigrationConnectorHttpHeaders = {
  get(name: string): string | null;
};

export type MigrationConnectorHttpResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: MigrationConnectorHttpHeaders;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type MigrationConnectorFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
  }
) => Promise<MigrationConnectorHttpResponse>;

export type MigrationConnectorRecord = {
  module: MigrationModuleKey;
  sourceResourceType: MigrationSourceResourceType;
  sourceId: string;
  label?: string;
  data: Record<string, unknown>;
};

export type MigrationConnectorFetchResult = {
  module: MigrationModuleKey;
  records: MigrationConnectorRecord[];
  nextCursor?: string;
  metadata?: Record<string, unknown>;
};

export interface MigrationConnector {
  readonly id: string;
  readonly label: string;
  readonly platforms: MigrationSourcePlatform[];
  readonly accessMethods: MigrationAccessMethod[];
  supports(input: Pick<MigrationConnectorInput, 'sourcePlatform' | 'accessMethod'>): boolean;
  testConnection(input: MigrationConnectorInput): Promise<MigrationConnectionTestResult>;
  discover(input: MigrationConnectorInput): Promise<MigrationDiscoverySummary>;
  fetchModule?(input: MigrationConnectorInput, module: MigrationModuleKey): Promise<MigrationConnectorFetchResult>;
}
