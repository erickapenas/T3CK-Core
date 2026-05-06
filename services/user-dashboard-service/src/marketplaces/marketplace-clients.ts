import { createHmac } from 'crypto';
import { AppError } from '../errors';
import { MarketplaceAccountRecord, MarketplaceProvider } from '../integrations/types';
import { UserContext } from '../types';
import {
  MarketplaceClient,
  MarketplaceConnectResponse,
  MarketplaceOAuthState,
  MarketplaceWebhookInput,
  OAuthCallbackInput,
} from './types';

const providerDisplayNames: Record<MarketplaceProvider, string> = {
  mercado_livre: 'Mercado Livre',
  tiktok_shop: 'TikTok Shop',
  shopee: 'Shopee',
  other: 'Outro marketplace',
};

const defaultScopes: Record<MarketplaceProvider, string[]> = {
  mercado_livre: ['read', 'write', 'offline_access'],
  tiktok_shop: ['seller.authorization.info', 'order.search', 'order.detail'],
  shopee: ['shop', 'order'],
  other: ['read'],
};

function configName(provider: MarketplaceProvider, suffix: string): string {
  return `${provider.toUpperCase()}_${suffix}`;
}

function getProviderConfig(provider: MarketplaceProvider): {
  clientId?: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl?: string;
  webhookSecret?: string;
} {
  const authUrls: Record<MarketplaceProvider, string> = {
    mercado_livre: 'https://auth.mercadolivre.com.br/authorization',
    tiktok_shop: 'https://services.tiktokshop.com/open/authorize',
    shopee: 'https://partner.shopeemobile.com/api/v2/shop/auth_partner',
    other: process.env.OTHER_MARKETPLACE_AUTH_URL || 'https://example.com/oauth/authorize',
  };

  return {
    clientId: process.env[configName(provider, 'CLIENT_ID')],
    clientSecret: process.env[configName(provider, 'CLIENT_SECRET')],
    authUrl: process.env[configName(provider, 'AUTH_URL')] || authUrls[provider],
    tokenUrl: process.env[configName(provider, 'TOKEN_URL')],
    webhookSecret: process.env[configName(provider, 'WEBHOOK_SECRET')],
  };
}

function encodeState(state: MarketplaceOAuthState): string {
  const secret =
    process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_SERVICE_TOKEN || 'dev-oauth-state';
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function decodeState(value: string): MarketplaceOAuthState {
  const secret =
    process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_SERVICE_TOKEN || 'dev-oauth-state';
  const [payload, signature] = value.split('.');
  if (!payload || !signature) {
    throw new AppError(400, 'Invalid OAuth state');
  }

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (expected !== signature) {
    throw new AppError(400, 'Invalid OAuth state signature');
  }

  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MarketplaceOAuthState;
}

class GenericMarketplaceClient implements MarketplaceClient {
  readonly displayName: string;
  readonly defaultScopes: string[];

  constructor(readonly provider: MarketplaceProvider) {
    this.displayName = providerDisplayNames[provider];
    this.defaultScopes = defaultScopes[provider];
  }

  createAuthorizationUrl(context: UserContext, stateNonce: string, redirectUri?: string): string {
    const config = getProviderConfig(this.provider);
    const state = encodeState({
      tenantId: context.tenantId,
      userId: context.userId,
      provider: this.provider,
      nonce: stateNonce,
    });
    const url = new URL(config.authUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.clientId || `${this.provider}_client_id_missing`);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', this.defaultScopes.join(' '));
    if (redirectUri) {
      url.searchParams.set('redirect_uri', redirectUri);
    }
    return url.toString();
  }

  async exchangeCode(input: OAuthCallbackInput): Promise<MarketplaceConnectResponse> {
    const config = getProviderConfig(this.provider);
    const mockMode = process.env.MARKETPLACE_MOCK_MODE !== 'false' || !config.tokenUrl;

    if (mockMode) {
      return {
        externalAccountId: `${this.provider}_sandbox_account`,
        shopName: `${this.displayName} Sandbox`,
        accessToken: `${this.provider}_access_${input.code}`,
        refreshToken: `${this.provider}_refresh_${input.code}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        scopes: this.defaultScopes,
        metadata: { mode: 'mock' },
      };
    }

    if (!config.clientId || !config.clientSecret || !config.tokenUrl) {
      throw new AppError(500, `${this.displayName} OAuth environment is incomplete`);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      account_id?: string;
      shop_name?: string;
      scope?: string;
      error?: string;
    };

    if (!response.ok || !body.access_token) {
      throw new AppError(
        response.status || 502,
        body.error || `${this.displayName} token exchange failed`
      );
    }

    return {
      externalAccountId: body.account_id,
      shopName: body.shop_name,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: body.expires_in
        ? new Date(Date.now() + body.expires_in * 1000).toISOString()
        : undefined,
      scopes: body.scope ? body.scope.split(/[,\s]+/).filter(Boolean) : this.defaultScopes,
      metadata: { mode: 'live' },
    };
  }

  async refreshToken(
    account: MarketplaceAccountRecord,
    refreshToken: string
  ): Promise<MarketplaceConnectResponse> {
    const config = getProviderConfig(this.provider);
    const mockMode = process.env.MARKETPLACE_MOCK_MODE !== 'false' || !config.tokenUrl;

    if (mockMode) {
      return {
        externalAccountId: account.externalAccountId,
        shopName: account.shopName,
        accessToken: `${this.provider}_access_refreshed_${Date.now()}`,
        refreshToken: `${this.provider}_refresh_refreshed_${Date.now()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        scopes: account.scopes || this.defaultScopes,
        metadata: { mode: 'mock', refreshed: true },
      };
    }

    if (!config.clientId || !config.clientSecret || !config.tokenUrl) {
      throw new AppError(500, `${this.displayName} OAuth environment is incomplete`);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      account_id?: string;
      shop_name?: string;
      scope?: string;
      error?: string;
    };

    if (!response.ok || !body.access_token) {
      throw new AppError(
        response.status || 502,
        body.error || `${this.displayName} token refresh failed`
      );
    }

    return {
      externalAccountId: body.account_id || account.externalAccountId,
      shopName: body.shop_name || account.shopName,
      accessToken: body.access_token,
      refreshToken: body.refresh_token || refreshToken,
      expiresAt: body.expires_in
        ? new Date(Date.now() + body.expires_in * 1000).toISOString()
        : undefined,
      scopes: body.scope ? body.scope.split(/[,\s]+/).filter(Boolean) : account.scopes,
      metadata: { mode: 'live', refreshed: true },
    };
  }

  async testConnection(
    account: MarketplaceAccountRecord
  ): Promise<{ ok: boolean; message: string }> {
    if (account.status !== 'connected') {
      return { ok: false, message: 'Integration is not connected' };
    }
    if (!account.encryptedAccessToken) {
      return { ok: false, message: 'Missing marketplace token' };
    }
    return { ok: true, message: `${this.displayName} connection is active` };
  }

  async importOrders(account: MarketplaceAccountRecord) {
    const timestamp = Date.now();
    const importBucket = new Date(timestamp).toISOString().slice(0, 10);
    const externalOrderId = `${this.provider}-${account.externalAccountId || account.id}-${importBucket}`;
    return {
      orders: [
        {
          provider: this.provider,
          externalOrderId,
          idempotencyKey: `${this.provider}:${account.tenantId}:${account.externalAccountId || account.id}:${externalOrderId}`,
          status: 'imported',
          amount: 100,
          currency: 'BRL',
          rawPayload: {
            source: this.provider,
            accountId: account.externalAccountId || account.id,
            importedAt: new Date(timestamp).toISOString(),
          },
        },
      ],
    };
  }

  verifyWebhook(input: MarketplaceWebhookInput): boolean {
    const config = getProviderConfig(this.provider);
    if (!config.webhookSecret) {
      return process.env.NODE_ENV !== 'production';
    }

    const received = String(
      input.headers['x-marketplace-signature'] ||
        input.headers['x-hub-signature-256'] ||
        input.headers['x-shopee-signature'] ||
        ''
    ).replace(/^sha256=/, '');
    const payload = JSON.stringify(input.body);
    const expected = createHmac('sha256', config.webhookSecret).update(payload).digest('hex');
    return received === expected;
  }
}

export class MarketplaceRegistry {
  private readonly clients = new Map<MarketplaceProvider, MarketplaceClient>();

  constructor() {
    for (const provider of [
      'mercado_livre',
      'tiktok_shop',
      'shopee',
      'other',
    ] as MarketplaceProvider[]) {
      this.clients.set(provider, new GenericMarketplaceClient(provider));
    }
  }

  get(provider: MarketplaceProvider): MarketplaceClient {
    const client = this.clients.get(provider);
    if (!client) {
      throw new AppError(400, 'Unsupported marketplace provider');
    }
    return client;
  }

  list(): MarketplaceClient[] {
    return Array.from(this.clients.values());
  }
}
