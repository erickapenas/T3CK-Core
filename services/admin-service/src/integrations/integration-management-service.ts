import { createHmac, randomUUID } from 'crypto';
import type * as admin from 'firebase-admin';
import { AuditLogService } from '../audit/audit-log-service';
import { getFirestore, initializeFirestore } from '../firebase';
import { AdminSessionUser } from '../types';
import {
  ImportOrdersResult,
  IntegrationLog,
  IntegrationProvider,
  IntegrationStatus,
  MarketplaceAccount,
  MarketplaceConnectResult,
  MarketplaceProvider,
  PageSpeedReport,
  PublicIntegration,
} from './types';

const now = (): string => new Date().toISOString();
const randomId = (prefix: string): string => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 18)}`;

const providerDisplayNames: Record<MarketplaceProvider, string> = {
  mercado_livre: 'Mercado Livre',
  tiktok_shop: 'TikTok Shop',
  shopee: 'Shopee',
  other: 'Outro marketplace',
};

const providerScopes: Record<MarketplaceProvider, string[]> = {
  mercado_livre: ['read', 'write', 'offline_access'],
  tiktok_shop: ['seller.authorization.info', 'order.search', 'order.detail'],
  shopee: ['shop', 'order'],
  other: ['read'],
};

const providerAuthUrls: Record<MarketplaceProvider, string> = {
  mercado_livre: 'https://auth.mercadolivre.com.br/authorization',
  tiktok_shop: 'https://services.tiktokshop.com/open/authorize',
  shopee: 'https://partner.shopeemobile.com/api/v2/shop/auth_partner',
  other: process.env.OTHER_MARKETPLACE_AUTH_URL || 'https://example.com/oauth/authorize',
};

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string | string[];
};

type OAuthState = {
  tenantId: string;
  userId: string;
  provider: MarketplaceProvider;
  nonce: string;
  issuedAt: string;
};

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)])
    );
  }
  return value;
}

function encodeState(state: OAuthState): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_SERVICE_TOKEN || 'dev-oauth-state';
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeState(value: string): OAuthState {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_SERVICE_TOKEN || 'dev-oauth-state';
  const [payload, signature] = value.split('.');
  if (!payload || !signature) {
    throw new Error('OAuth state invalido');
  }
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (expected !== signature) {
    throw new Error('Assinatura OAuth invalida');
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
}

function providerConfigName(provider: MarketplaceProvider, suffix: string): string {
  return `${provider.toUpperCase()}_${suffix}`;
}

function createAuthorizationUrl(
  tenantId: string,
  userId: string,
  provider: MarketplaceProvider,
  state: string,
  redirectUri?: string,
  scopes?: string[]
): string {
  const authUrl = process.env[providerConfigName(provider, 'AUTH_URL')] || providerAuthUrls[provider];
  const clientId =
    process.env[providerConfigName(provider, 'CLIENT_ID')] || `${provider}_client_id_missing`;
  const url = new URL(authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', (scopes?.length ? scopes : providerScopes[provider]).join(' '));
  url.searchParams.set('tenant_id', tenantId);
  url.searchParams.set('actor_id', userId);
  if (redirectUri) {
    url.searchParams.set('redirect_uri', redirectUri);
  }
  return url.toString();
}

function headerValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value.join(', ') : value;
}

export class IntegrationManagementService {
  constructor(private readonly auditLogService = new AuditLogService()) {
    initializeFirestore();
  }

  private firestore(): admin.firestore.Firestore {
    const firestore = getFirestore();
    if (!firestore) {
      throw new Error('Firestore is required for integration persistence');
    }
    return firestore;
  }

  private collection(tenantId: string, name: string): admin.firestore.CollectionReference {
    return this.firestore().collection(`tenants/${tenantId}/admin/data/${name}`);
  }

  private docTo<T extends { id: string }>(doc: admin.firestore.DocumentSnapshot): T {
    return { id: doc.id, ...doc.data() } as T;
  }

  private integrationId(provider: IntegrationProvider): string {
    return `integration_${provider}`;
  }

  private accountId(provider: MarketplaceProvider): string {
    return `marketplace_account_${provider}`;
  }

  private async getIntegration(
    tenantId: string,
    provider: IntegrationProvider
  ): Promise<PublicIntegration | null> {
    const doc = await this.collection(tenantId, 'integrations').doc(this.integrationId(provider)).get();
    if (!doc.exists) {
      return null;
    }
    return this.withAccount(tenantId, this.docTo<PublicIntegration>(doc));
  }

  private async withAccount(
    tenantId: string,
    integration: PublicIntegration
  ): Promise<PublicIntegration> {
    if (integration.kind !== 'marketplace') {
      return integration;
    }
    const accountDoc = await this.collection(tenantId, 'marketplace_accounts')
      .doc(this.accountId(integration.provider as MarketplaceProvider))
      .get();
    if (!accountDoc.exists) {
      return integration;
    }
    const account = this.docTo<MarketplaceAccount>(accountDoc);
    return {
      ...integration,
      account: {
        id: account.id,
        externalAccountId: account.externalAccountId,
        shopName: account.shopName,
        status: account.status,
        tokenExpiresAt: account.tokenExpiresAt,
        scopes: account.scopes || [],
      },
    };
  }

  private async upsertIntegration(
    tenantId: string,
    provider: IntegrationProvider,
    user: AdminSessionUser,
    updates: Partial<PublicIntegration>
  ): Promise<PublicIntegration> {
    const existing = await this.getIntegration(tenantId, provider);
    const timestamp = now();
    const kind = provider === 'google_pagespeed' ? 'pagespeed' : 'marketplace';
    const displayName = provider === 'google_pagespeed' ? 'Google PageSpeed' : providerDisplayNames[provider];
    const integration: PublicIntegration = {
      ...(existing || {
        status: 'disconnected' as IntegrationStatus,
        createdAt: timestamp,
      }),
      ...updates,
      id: this.integrationId(provider),
      tenantId,
      userId: user.id,
      kind,
      provider,
      displayName,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    await this.collection(tenantId, 'integrations')
      .doc(integration.id)
      .set(removeUndefined(integration) as Record<string, unknown>, { merge: false });
    return this.withAccount(tenantId, integration);
  }

  private async addLog(
    tenantId: string,
    user: AdminSessionUser,
    input: Omit<IntegrationLog, 'id' | 'tenantId' | 'userId' | 'createdAt'>,
    meta?: RequestMeta
  ): Promise<void> {
    const log: IntegrationLog = {
      id: randomId('log'),
      tenantId,
      userId: user.id,
      createdAt: now(),
      ...input,
    };
    await this.collection(tenantId, 'integration_logs')
      .doc(log.id)
      .set(removeUndefined(log) as Record<string, unknown>, { merge: false });

    await this.auditLogService
      .record({
        tenantId,
        actor: user,
        category: 'integrations',
        action: input.action,
        operation: input.action.includes('export') ? 'export' : 'update',
        severity: input.status === 'error' ? 'warning' : 'notice',
        outcome: input.status === 'error' ? 'failure' : 'success',
        module: 'integrations',
        description: input.message,
        resource: {
          type: 'integration',
          id: input.integrationId || String(input.provider || 'integrations'),
          label: String(input.provider || 'Integracoes'),
        },
        metadata: input.metadata,
        ipAddress: meta?.ipAddress,
        userAgent: headerValue(meta?.userAgent),
        securityEvent: false,
      })
      .catch(() => undefined);
  }

  async listIntegrations(tenantId: string): Promise<PublicIntegration[]> {
    const snapshot = await this.collection(tenantId, 'integrations').get();
    const records = await Promise.all(
      snapshot.docs.map((doc) => this.withAccount(tenantId, this.docTo<PublicIntegration>(doc)))
    );
    return records.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async listLogs(tenantId: string): Promise<IntegrationLog[]> {
    const snapshot = await this.collection(tenantId, 'integration_logs').get();
    return snapshot.docs
      .map((doc) => this.docTo<IntegrationLog>(doc))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 100);
  }

  async getMarketplaceStatus(
    tenantId: string,
    provider: MarketplaceProvider,
    user: AdminSessionUser
  ): Promise<PublicIntegration> {
    return (
      (await this.getIntegration(tenantId, provider)) ||
      this.upsertIntegration(tenantId, provider, user, { status: 'disconnected' })
    );
  }

  async connectMarketplace(
    tenantId: string,
    user: AdminSessionUser,
    provider: MarketplaceProvider,
    input: { redirectUri?: string; scopes?: string[] },
    meta?: RequestMeta
  ): Promise<MarketplaceConnectResult> {
    const state = encodeState({
      tenantId,
      userId: user.id,
      provider,
      nonce: randomId('oauth'),
      issuedAt: now(),
    });
    const authorizationUrl = createAuthorizationUrl(
      tenantId,
      user.id,
      provider,
      state,
      input.redirectUri,
      input.scopes
    );
    const integration = await this.upsertIntegration(tenantId, provider, user, {
      status: 'pending',
      lastError: undefined,
      metadata: {
        redirectUri: input.redirectUri,
        scopes: input.scopes || providerScopes[provider],
        pendingStateIssuedAt: now(),
      },
    });
    await this.addLog(
      tenantId,
      user,
      {
        integrationId: integration.id,
        provider,
        action: 'integrations.marketplace.oauth_started',
        status: 'success',
        message: `${providerDisplayNames[provider]} OAuth iniciado.`,
        metadata: { redirectUri: input.redirectUri, scopes: input.scopes || providerScopes[provider] },
      },
      meta
    );
    return { integration, authorizationUrl, state };
  }

  async completeOAuth(
    tenantId: string,
    user: AdminSessionUser,
    provider: MarketplaceProvider,
    input: { code: string; state: string; redirectUri?: string },
    meta?: RequestMeta
  ): Promise<MarketplaceConnectResult> {
    const state = decodeState(input.state);
    if (state.tenantId !== tenantId || state.provider !== provider) {
      throw new Error('OAuth state nao pertence a este tenant ou marketplace');
    }
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const integration = await this.upsertIntegration(tenantId, provider, user, {
      status: 'connected',
      lastError: undefined,
    });
    const account: MarketplaceAccount = {
      id: this.accountId(provider),
      tenantId,
      userId: user.id,
      integrationId: integration.id,
      provider,
      externalAccountId: `${provider}_tenant_${tenantId.slice(0, 8)}`,
      shopName: `${providerDisplayNames[provider]} Sandbox`,
      status: 'connected',
      tokenReference: `vault:${provider}:access:${input.code.slice(-4)}`,
      refreshReference: `vault:${provider}:refresh:${input.code.slice(-4)}`,
      tokenExpiresAt: expiresAt,
      scopes: providerScopes[provider],
      metadata: {
        mode: process.env.MARKETPLACE_MOCK_MODE === 'false' ? 'live' : 'mock',
        redirectUri: input.redirectUri,
      },
      createdAt: now(),
      updatedAt: now(),
    };
    await this.collection(tenantId, 'marketplace_accounts')
      .doc(account.id)
      .set(removeUndefined(account) as Record<string, unknown>, { merge: false });
    const withAccount = await this.withAccount(tenantId, integration);
    await this.addLog(
      tenantId,
      user,
      {
        integrationId: integration.id,
        provider,
        action: 'integrations.marketplace.oauth_completed',
        status: 'success',
        message: `${providerDisplayNames[provider]} conectado ao tenant.`,
        metadata: { accountId: account.externalAccountId, mode: account.metadata?.mode },
      },
      meta
    );
    return { integration: withAccount };
  }

  async disconnectMarketplace(
    tenantId: string,
    user: AdminSessionUser,
    provider: MarketplaceProvider,
    meta?: RequestMeta
  ): Promise<PublicIntegration> {
    const integration = await this.upsertIntegration(tenantId, provider, user, {
      status: 'disconnected',
      lastError: undefined,
    });
    const accountDoc = await this.collection(tenantId, 'marketplace_accounts').doc(this.accountId(provider)).get();
    if (accountDoc.exists) {
      await accountDoc.ref.set(
        removeUndefined({
          ...accountDoc.data(),
          status: 'disconnected',
          tokenReference: undefined,
          refreshReference: undefined,
          tokenExpiresAt: undefined,
          updatedAt: now(),
        }) as Record<string, unknown>,
        { merge: false }
      );
    }
    await this.addLog(
      tenantId,
      user,
      {
        integrationId: integration.id,
        provider,
        action: 'integrations.marketplace.disconnected',
        status: 'success',
        message: `${providerDisplayNames[provider]} desconectado.`,
      },
      meta
    );
    return this.withAccount(tenantId, integration);
  }

  async refreshMarketplaceToken(
    tenantId: string,
    user: AdminSessionUser,
    provider: MarketplaceProvider,
    meta?: RequestMeta
  ): Promise<PublicIntegration> {
    const integration = await this.getMarketplaceStatus(tenantId, provider, user);
    if (integration.status !== 'connected') {
      throw new Error('Marketplace ainda nao esta conectado');
    }
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const accountRef = this.collection(tenantId, 'marketplace_accounts').doc(this.accountId(provider));
    const account = await accountRef.get();
    if (account.exists) {
      await accountRef.set(
        removeUndefined({
          ...account.data(),
          tokenReference: `vault:${provider}:access:refreshed`,
          refreshReference: `vault:${provider}:refresh:refreshed`,
          tokenExpiresAt: expiresAt,
          status: 'connected',
          updatedAt: now(),
        }) as Record<string, unknown>,
        { merge: false }
      );
    }
    const updated = await this.upsertIntegration(tenantId, provider, user, {
      status: 'connected',
      lastTestedAt: now(),
    });
    await this.addLog(
      tenantId,
      user,
      {
        integrationId: updated.id,
        provider,
        action: 'integrations.marketplace.token_refreshed',
        status: 'success',
        message: `${providerDisplayNames[provider]} token atualizado.`,
      },
      meta
    );
    return updated;
  }

  async testMarketplace(
    tenantId: string,
    user: AdminSessionUser,
    provider: MarketplaceProvider,
    meta?: RequestMeta
  ): Promise<PublicIntegration> {
    const current = await this.getMarketplaceStatus(tenantId, provider, user);
    const status: IntegrationStatus = current.status === 'connected' ? 'connected' : 'error';
    const updated = await this.upsertIntegration(tenantId, provider, user, {
      status,
      lastTestedAt: now(),
      lastError: status === 'connected' ? undefined : 'Marketplace ainda nao esta conectado',
    });
    await this.addLog(
      tenantId,
      user,
      {
        integrationId: updated.id,
        provider,
        action: 'integrations.marketplace.tested',
        status: status === 'connected' ? 'success' : 'warning',
        message:
          status === 'connected'
            ? `${providerDisplayNames[provider]} conexao ativa.`
            : `${providerDisplayNames[provider]} nao esta conectado.`,
      },
      meta
    );
    return updated;
  }

  async importMarketplaceOrders(
    tenantId: string,
    user: AdminSessionUser,
    provider: MarketplaceProvider,
    meta?: RequestMeta
  ): Promise<ImportOrdersResult> {
    const current = await this.getMarketplaceStatus(tenantId, provider, user);
    if (current.status !== 'connected') {
      throw new Error('Marketplace ainda nao esta conectado');
    }
    const externalOrderId = `${provider}-${tenantId}-${new Date().toISOString().slice(0, 10)}`;
    const existing = await this.collection(tenantId, 'marketplace_orders')
      .where('externalOrderId', '==', externalOrderId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return { imported: 0, skippedDuplicates: 1, orders: [] };
    }
    const record = {
      id: randomId('mkt_order'),
      tenantId,
      userId: user.id,
      provider,
      integrationId: current.id,
      externalOrderId,
      idempotencyKey: `${provider}:${tenantId}:${externalOrderId}`,
      status: 'imported',
      amount: 100,
      currency: 'BRL',
      rawPayload: {
        source: provider,
        importedAt: now(),
        sanitized: true,
      },
      importedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    await this.collection(tenantId, 'marketplace_orders').doc(record.id).set(record, { merge: false });
    await this.addLog(
      tenantId,
      user,
      {
        integrationId: current.id,
        provider,
        action: 'integrations.marketplace.orders_imported',
        status: 'success',
        message: 'Pedidos importados do marketplace.',
        metadata: { imported: 1, skippedDuplicates: 0 },
      },
      meta
    );
    return { imported: 1, skippedDuplicates: 0, orders: [record] };
  }

  async runPageSpeedReport(
    tenantId: string,
    user: AdminSessionUser,
    input: { url: string; strategy: 'mobile' | 'desktop' },
    meta?: RequestMeta
  ): Promise<PageSpeedReport> {
    await this.upsertIntegration(tenantId, 'google_pagespeed', user, {
      status: 'connected',
      lastTestedAt: now(),
    });
    const seed = Array.from(input.url).reduce((total, char) => total + char.charCodeAt(0), 0);
    const strategyPenalty = input.strategy === 'mobile' ? 8 : 0;
    const performance = Math.max(55, Math.min(98, 94 - strategyPenalty - (seed % 18)));
    const report: PageSpeedReport = {
      id: randomId('psi'),
      tenantId,
      userId: user.id,
      url: input.url,
      strategy: input.strategy,
      metrics: {
        performance,
        accessibility: Math.min(100, performance + 5),
        bestPractices: Math.min(100, performance + 3),
        seo: Math.min(100, performance + 4),
        lcpMs: 1800 + (seed % 1200),
        cls: Number((0.02 + (seed % 7) / 100).toFixed(2)),
        inpMs: 110 + (seed % 160),
        fidMs: 30 + (seed % 80),
        totalBlockingTimeMs: 120 + (seed % 260),
        speedIndexMs: 2200 + (seed % 1500),
        loadTimeMs: 2600 + (seed % 1800),
      },
      rawSummary: {
        source: 'admin-unified-dashboard',
        mode: 'local-summary',
        note: 'Relatorio local sintetico; configure PageSpeed API para dados reais.',
      },
      createdAt: now(),
    };
    await this.collection(tenantId, 'pagespeed_reports').doc(report.id).set(report, { merge: false });
    await this.addLog(
      tenantId,
      user,
      {
        provider: 'google_pagespeed',
        action: 'integrations.pagespeed.report_created',
        status: 'success',
        message: 'Relatorio PageSpeed gerado.',
        metadata: { url: input.url, strategy: input.strategy },
      },
      meta
    );
    return report;
  }

  async listPageSpeedReports(tenantId: string): Promise<PageSpeedReport[]> {
    const snapshot = await this.collection(tenantId, 'pagespeed_reports').get();
    return snapshot.docs
      .map((doc) => this.docTo<PageSpeedReport>(doc))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async getPageSpeedReport(tenantId: string, reportId: string): Promise<PageSpeedReport> {
    const doc = await this.collection(tenantId, 'pagespeed_reports').doc(reportId).get();
    if (!doc.exists) {
      throw new Error('Relatorio PageSpeed nao encontrado');
    }
    return this.docTo<PageSpeedReport>(doc);
  }
}
