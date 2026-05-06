import { randomUUID } from 'crypto';
import { AppError } from '../errors';
import { MarketplaceRegistry, decodeState } from '../marketplaces/marketplace-clients';
import { OAuthCallbackInput } from '../marketplaces/types';
import { UserContext } from '../types';
import { requireIntegrationPermission } from './permissions';
import { PageSpeedRateLimiter } from './pagespeed-rate-limiter';
import { PageSpeedRunInput, PageSpeedService } from './pagespeed-service';
import { emptyIntegrationState, IntegrationStateStore } from './integration-state-store';
import { TokenVault } from './token-vault';
import {
  ConnectResult,
  ImportOrdersResult,
  IntegrationLogRecord,
  IntegrationRecord,
  IntegrationStateSnapshot,
  MarketplaceAccountRecord,
  MarketplaceOrderRecord,
  MarketplaceProvider,
  PageSpeedReportRecord,
  PublicIntegration,
} from './types';

const now = (): string => new Date().toISOString();

function randomId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
}

export class IntegrationService {
  private state: IntegrationStateSnapshot = emptyIntegrationState();
  private loadPromise: Promise<void> | null = null;

  constructor(
    private readonly store: IntegrationStateStore | undefined,
    private readonly vault = TokenVault.createFromEnvironment(),
    private readonly registry = new MarketplaceRegistry(),
    private readonly pageSpeed = new PageSpeedService(),
    private readonly pageSpeedLimiter = new PageSpeedRateLimiter()
  ) {
    if (store) {
      this.loadPromise = store.load().then((snapshot) => {
        this.state = snapshot;
      });
    }
  }

  async listIntegrations(context: UserContext): Promise<PublicIntegration[]> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:read');
    await this.ensurePageSpeedIntegration(context);

    return this.state.integrations
      .filter((item) => item.tenantId === context.tenantId && item.userId === context.userId)
      .map((item) => this.toPublicIntegration(item))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async getMarketplaceStatus(
    context: UserContext,
    provider: MarketplaceProvider
  ): Promise<PublicIntegration> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:read');
    const integration = this.findIntegration(context, provider);
    if (!integration) {
      return this.toPublicIntegration(await this.ensureMarketplaceIntegration(context, provider));
    }
    return this.toPublicIntegration(integration);
  }

  async connectMarketplace(
    context: UserContext,
    provider: MarketplaceProvider,
    input: { redirectUri?: string; scopes?: string[] }
  ): Promise<ConnectResult> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:write');
    const client = this.registry.get(provider);
    const integration = await this.ensureMarketplaceIntegration(context, provider);
    integration.status = 'pending';
    integration.updatedAt = now();

    const state = randomId('oauth');
    const authorizationUrl = client.createAuthorizationUrl(context, state, input.redirectUri);
    this.addLog(context, {
      integrationId: integration.id,
      provider,
      action: 'integration.connected',
      status: 'success',
      message: `${client.displayName} OAuth started`,
      metadata: { scopes: input.scopes || client.defaultScopes },
    });
    await this.persist();

    return {
      integration: this.toPublicIntegration(integration),
      authorizationUrl,
      state,
    };
  }

  async completeOAuth(
    context: UserContext,
    provider: MarketplaceProvider,
    input: OAuthCallbackInput
  ): Promise<ConnectResult> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:write');
    const decodedState = decodeState(input.state);
    if (
      decodedState.tenantId !== context.tenantId ||
      decodedState.userId !== context.userId ||
      decodedState.provider !== provider
    ) {
      throw new AppError(403, 'OAuth state does not match authenticated user');
    }

    const client = this.registry.get(provider);
    const response = await client.exchangeCode(input);
    const integration = await this.ensureMarketplaceIntegration(context, provider);
    integration.status = 'connected';
    integration.lastError = undefined;
    integration.updatedAt = now();

    const account = this.ensureMarketplaceAccount(context, provider, integration.id);
    account.status = 'connected';
    account.externalAccountId = response.externalAccountId || account.externalAccountId;
    account.shopName = response.shopName || account.shopName || client.displayName;
    account.scopes = response.scopes;
    account.tokenExpiresAt = response.expiresAt;
    account.metadata = response.metadata;
    account.encryptedAccessToken = response.accessToken
      ? this.vault.encrypt(response.accessToken)
      : account.encryptedAccessToken;
    account.encryptedRefreshToken = response.refreshToken
      ? this.vault.encrypt(response.refreshToken)
      : account.encryptedRefreshToken;
    account.updatedAt = now();

    this.addLog(context, {
      integrationId: integration.id,
      provider,
      action: 'integration.oauth_callback',
      status: 'success',
      message: `${client.displayName} connected`,
    });
    await this.persist();

    return { integration: this.toPublicIntegration(integration) };
  }

  async disconnectMarketplace(
    context: UserContext,
    provider: MarketplaceProvider
  ): Promise<PublicIntegration> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:write');
    const integration = await this.ensureMarketplaceIntegration(context, provider);
    integration.status = 'disconnected';
    integration.updatedAt = now();
    integration.lastError = undefined;

    const account = this.findMarketplaceAccount(context, provider);
    if (account) {
      account.status = 'disconnected';
      account.encryptedAccessToken = undefined;
      account.encryptedRefreshToken = undefined;
      account.tokenExpiresAt = undefined;
      account.updatedAt = now();
    }

    this.addLog(context, {
      integrationId: integration.id,
      provider,
      action: 'integration.disconnected',
      status: 'success',
      message: `${integration.displayName} disconnected`,
    });
    await this.persist();
    return this.toPublicIntegration(integration);
  }

  async refreshMarketplaceToken(
    context: UserContext,
    provider: MarketplaceProvider
  ): Promise<PublicIntegration> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:write');
    const integration = await this.ensureMarketplaceIntegration(context, provider);
    const account = this.findMarketplaceAccount(context, provider);
    if (!account || !account.encryptedRefreshToken) {
      throw new AppError(409, 'Marketplace refresh token is not available');
    }

    const response = await this.registry
      .get(provider)
      .refreshToken(account, this.vault.decrypt(account.encryptedRefreshToken));

    account.status = 'connected';
    account.externalAccountId = response.externalAccountId || account.externalAccountId;
    account.shopName = response.shopName || account.shopName;
    account.scopes = response.scopes || account.scopes;
    account.tokenExpiresAt = response.expiresAt || account.tokenExpiresAt;
    account.metadata = response.metadata || account.metadata;
    account.encryptedAccessToken = response.accessToken
      ? this.vault.encrypt(response.accessToken)
      : account.encryptedAccessToken;
    account.encryptedRefreshToken = response.refreshToken
      ? this.vault.encrypt(response.refreshToken)
      : account.encryptedRefreshToken;
    account.updatedAt = now();

    integration.status = 'connected';
    integration.lastError = undefined;
    integration.lastTestedAt = now();
    integration.updatedAt = now();

    this.addLog(context, {
      integrationId: integration.id,
      provider,
      action: 'integration.token_refreshed',
      status: 'success',
      message: `${integration.displayName} token refreshed`,
    });
    await this.persist();
    return this.toPublicIntegration(integration);
  }

  async testMarketplace(
    context: UserContext,
    provider: MarketplaceProvider
  ): Promise<PublicIntegration> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:write');
    const integration = await this.ensureMarketplaceIntegration(context, provider);
    const account = this.findMarketplaceAccount(context, provider);
    if (!account) {
      throw new AppError(404, 'Marketplace account not connected');
    }

    const result = await this.registry.get(provider).testConnection(account);
    integration.lastTestedAt = now();
    integration.status = result.ok ? 'connected' : 'error';
    integration.lastError = result.ok ? undefined : result.message;
    integration.updatedAt = now();

    this.addLog(context, {
      integrationId: integration.id,
      provider,
      action: 'integration.tested',
      status: result.ok ? 'success' : 'error',
      message: result.message,
    });
    await this.persist();
    return this.toPublicIntegration(integration);
  }

  async importMarketplaceOrders(
    context: UserContext,
    provider: MarketplaceProvider
  ): Promise<ImportOrdersResult> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:write');
    const integration = await this.ensureMarketplaceIntegration(context, provider);
    const account = this.findMarketplaceAccount(context, provider);
    if (!account || account.status !== 'connected') {
      throw new AppError(409, 'Marketplace account is not connected');
    }

    const response = await this.registry.get(provider).importOrders(account);
    const imported: MarketplaceOrderRecord[] = [];
    let skippedDuplicates = 0;

    for (const order of response.orders) {
      const duplicate = this.state.marketplaceOrders.some(
        (item) =>
          item.tenantId === context.tenantId &&
          item.provider === provider &&
          (item.externalOrderId === order.externalOrderId ||
            item.idempotencyKey === order.idempotencyKey)
      );

      if (duplicate) {
        skippedDuplicates += 1;
        continue;
      }

      const timestamp = now();
      const record: MarketplaceOrderRecord = {
        ...order,
        id: randomId('mkt_order'),
        tenantId: context.tenantId,
        userId: context.userId,
        integrationId: integration.id,
        importedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      imported.push(record);
      this.state.marketplaceOrders.push(record);
    }

    this.addLog(context, {
      integrationId: integration.id,
      provider,
      action: 'marketplace.orders_imported',
      status: 'success',
      message: `${imported.length} orders imported`,
      metadata: { skippedDuplicates },
    });
    await this.persist();

    return {
      imported: imported.length,
      skippedDuplicates,
      orders: imported,
    };
  }

  async receiveWebhook(
    provider: MarketplaceProvider,
    input: { headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }
  ): Promise<{ ok: boolean }> {
    await this.ensureLoaded();
    const client = this.registry.get(provider);
    if (!client.verifyWebhook(input)) {
      throw new AppError(401, 'Invalid marketplace webhook signature');
    }

    const tenantId = String(input.body.tenantId || input.body.tenant_id || '');
    const userId = String(input.body.userId || input.body.user_id || 'webhook');
    if (tenantId) {
      this.addLog(
        { tenantId, userId },
        {
          provider,
          action: 'integration.webhook_received',
          status: 'success',
          message: `${client.displayName} webhook received`,
          metadata: { eventType: input.body.type || input.body.event },
        }
      );
      await this.persist();
    }

    return { ok: true };
  }

  async runPageSpeedReport(
    context: UserContext,
    input: PageSpeedRunInput
  ): Promise<PageSpeedReportRecord> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'pagespeed:run');
    try {
      this.pageSpeedLimiter.consume(context);
    } catch (error) {
      this.addLog(context, {
        provider: 'google_pagespeed',
        action: 'pagespeed.rate_limited',
        status: 'warning',
        message: error instanceof Error ? error.message : 'PageSpeed rate limit exceeded',
      });
      await this.persist();
      throw error;
    }
    const integration = await this.ensurePageSpeedIntegration(context);
    const result = await this.pageSpeed.run(input);
    const report = this.pageSpeed.toReport({
      id: randomId('psi'),
      tenantId: context.tenantId,
      userId: context.userId,
      url: result.url,
      strategy: result.strategy,
      metrics: result.metrics,
      rawSummary: result.rawSummary,
      createdAt: now(),
    });

    this.state.pageSpeedReports.push(report);
    integration.status = 'connected';
    integration.updatedAt = now();
    integration.lastTestedAt = report.createdAt;

    this.addLog(context, {
      integrationId: integration.id,
      provider: 'google_pagespeed',
      action: 'pagespeed.report_created',
      status: 'success',
      message: 'PageSpeed report created',
      metadata: { url: report.url, strategy: report.strategy },
    });
    await this.persist();

    return report;
  }

  async listPageSpeedReports(context: UserContext): Promise<PageSpeedReportRecord[]> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:read');
    return this.state.pageSpeedReports
      .filter((report) => report.tenantId === context.tenantId && report.userId === context.userId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async getPageSpeedReport(
    context: UserContext,
    reportId: string
  ): Promise<PageSpeedReportRecord> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:read');
    const report = this.state.pageSpeedReports.find(
      (item) =>
        item.id === reportId && item.tenantId === context.tenantId && item.userId === context.userId
    );
    if (!report) {
      throw new AppError(404, 'PageSpeed report not found');
    }
    return report;
  }

  async listLogs(context: UserContext): Promise<IntegrationLogRecord[]> {
    await this.ensureLoaded();
    requireIntegrationPermission(context, 'integrations:read');
    return this.state.integrationLogs
      .filter((log) => log.tenantId === context.tenantId && log.userId === context.userId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 100);
  }

  private async ensurePageSpeedIntegration(context: UserContext): Promise<IntegrationRecord> {
    let integration = this.state.integrations.find(
      (item) =>
        item.tenantId === context.tenantId &&
        item.userId === context.userId &&
        item.provider === 'google_pagespeed'
    );

    if (!integration) {
      const timestamp = now();
      integration = {
        id: randomId('int'),
        tenantId: context.tenantId,
        userId: context.userId,
        kind: 'pagespeed',
        provider: 'google_pagespeed',
        status: 'disconnected',
        displayName: 'Google PageSpeed',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.state.integrations.push(integration);
      await this.persist();
    }

    return integration;
  }

  private async ensureMarketplaceIntegration(
    context: UserContext,
    provider: MarketplaceProvider
  ): Promise<IntegrationRecord> {
    let integration = this.findIntegration(context, provider);
    if (!integration) {
      const client = this.registry.get(provider);
      const timestamp = now();
      integration = {
        id: randomId('int'),
        tenantId: context.tenantId,
        userId: context.userId,
        kind: 'marketplace',
        provider,
        status: 'disconnected',
        displayName: client.displayName,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.state.integrations.push(integration);
    }
    return integration;
  }

  private ensureMarketplaceAccount(
    context: UserContext,
    provider: MarketplaceProvider,
    integrationId: string
  ): MarketplaceAccountRecord {
    let account = this.findMarketplaceAccount(context, provider);
    if (!account) {
      const timestamp = now();
      account = {
        id: randomId('mkt_acc'),
        integrationId,
        tenantId: context.tenantId,
        userId: context.userId,
        provider,
        status: 'pending',
        scopes: this.registry.get(provider).defaultScopes,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.state.marketplaceAccounts.push(account);
    }
    return account;
  }

  private findIntegration(
    context: UserContext,
    provider: MarketplaceProvider | 'google_pagespeed'
  ): IntegrationRecord | undefined {
    return this.state.integrations.find(
      (item) =>
        item.tenantId === context.tenantId &&
        item.userId === context.userId &&
        item.provider === provider
    );
  }

  private findMarketplaceAccount(
    context: UserContext,
    provider: MarketplaceProvider
  ): MarketplaceAccountRecord | undefined {
    return this.state.marketplaceAccounts.find(
      (item) =>
        item.tenantId === context.tenantId &&
        item.userId === context.userId &&
        item.provider === provider
    );
  }

  private toPublicIntegration(integration: IntegrationRecord): PublicIntegration {
    const account =
      integration.kind === 'marketplace'
        ? this.state.marketplaceAccounts.find(
            (item) =>
              item.tenantId === integration.tenantId &&
              item.userId === integration.userId &&
              item.integrationId === integration.id
          )
        : undefined;

    return {
      id: integration.id,
      kind: integration.kind,
      provider: integration.provider,
      status: integration.status,
      displayName: integration.displayName,
      lastTestedAt: integration.lastTestedAt,
      lastError: integration.lastError,
      updatedAt: integration.updatedAt,
      account: account
        ? {
            id: account.id,
            externalAccountId: account.externalAccountId,
            shopName: account.shopName,
            status: account.status,
            tokenExpiresAt: account.tokenExpiresAt,
            scopes: account.scopes,
          }
        : undefined,
    };
  }

  private addLog(
    context: Pick<UserContext, 'tenantId' | 'userId'>,
    input: Omit<IntegrationLogRecord, 'id' | 'tenantId' | 'userId' | 'createdAt'>
  ): void {
    this.state.integrationLogs.push({
      id: randomId('log'),
      tenantId: context.tenantId,
      userId: context.userId,
      createdAt: now(),
      ...input,
    });
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
      this.loadPromise = null;
    }
  }

  private async persist(): Promise<void> {
    await this.store?.save(this.state);
  }
}
