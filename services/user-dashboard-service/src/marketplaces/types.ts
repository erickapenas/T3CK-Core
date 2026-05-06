import {
  ImportOrdersResult,
  MarketplaceAccountRecord,
  MarketplaceOrderRecord,
  MarketplaceProvider,
} from '../integrations/types';
import { UserContext } from '../types';

export interface MarketplaceOAuthState {
  tenantId: string;
  userId: string;
  provider: MarketplaceProvider;
  nonce: string;
}

export interface MarketplaceConnectInput {
  scopes?: string[];
  redirectUri?: string;
}

export interface MarketplaceConnectResponse {
  authorizationUrl?: string;
  externalAccountId?: string;
  shopName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
  metadata?: Record<string, unknown>;
}

export interface OAuthCallbackInput {
  code: string;
  state: string;
  redirectUri?: string;
}

export interface MarketplaceWebhookInput {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

export interface MarketplaceClient {
  provider: MarketplaceProvider;
  displayName: string;
  defaultScopes: string[];
  createAuthorizationUrl(context: UserContext, state: string, redirectUri?: string): string;
  exchangeCode(input: OAuthCallbackInput): Promise<MarketplaceConnectResponse>;
  refreshToken(
    account: MarketplaceAccountRecord,
    refreshToken: string
  ): Promise<MarketplaceConnectResponse>;
  testConnection(account: MarketplaceAccountRecord): Promise<{ ok: boolean; message: string }>;
  importOrders(account: MarketplaceAccountRecord): Promise<{
    orders: Array<
      Omit<
        MarketplaceOrderRecord,
        'id' | 'tenantId' | 'userId' | 'integrationId' | 'importedAt' | 'createdAt' | 'updatedAt'
      >
    >;
  }>;
  verifyWebhook(input: MarketplaceWebhookInput): boolean;
  mapWebhookToImport?(input: MarketplaceWebhookInput): Promise<Partial<ImportOrdersResult>>;
}
