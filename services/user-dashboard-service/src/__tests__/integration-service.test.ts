import { IntegrationService } from '../integrations/integration-service';
import { TokenVault } from '../integrations/token-vault';
import { MarketplaceRegistry } from '../marketplaces/marketplace-clients';
import { UserContext } from '../types';

const context: UserContext = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  email: 'user-a@example.com',
  roles: ['user'],
};

const otherContext: UserContext = {
  tenantId: 'tenant-b',
  userId: 'user-b',
  email: 'user-b@example.com',
  roles: ['user'],
};

describe('IntegrationService', () => {
  beforeEach(() => {
    process.env.MARKETPLACE_MOCK_MODE = 'true';
    process.env.PAGESPEED_MOCK_MODE = 'true';
    process.env.OAUTH_STATE_SECRET = 'test-state-secret';
  });

  function createService(): IntegrationService {
    return new IntegrationService(
      undefined,
      new TokenVault('test-token-secret'),
      new MarketplaceRegistry()
    );
  }

  it('creates tenant-scoped marketplace integrations without exposing tokens', async () => {
    const service = createService();
    const started = await service.connectMarketplace(context, 'mercado_livre', {
      redirectUri: 'https://app.example/dashboard-users/integracao',
    });
    const state = new URL(started.authorizationUrl || '').searchParams.get('state') || '';

    const completed = await service.completeOAuth(context, 'mercado_livre', {
      code: 'oauth-code',
      state,
      redirectUri: 'https://app.example/dashboard-users/integracao',
    });

    expect(completed.integration.status).toBe('connected');
    expect(JSON.stringify(completed)).not.toContain('oauth-code');
    expect(
      (await service.listIntegrations(otherContext)).find((item) => item.provider === 'mercado_livre')
    ).toBeUndefined();
  });

  it('uses idempotency to skip duplicated marketplace orders', async () => {
    const service = createService();
    const started = await service.connectMarketplace(context, 'shopee', {});
    const state = new URL(started.authorizationUrl || '').searchParams.get('state') || '';

    await service.completeOAuth(context, 'shopee', { code: 'code', state });
    const firstImport = await service.importMarketplaceOrders(context, 'shopee');
    const secondImport = await service.importMarketplaceOrders(context, 'shopee');

    expect(firstImport.imported).toBe(1);
    expect(secondImport.imported).toBe(0);
    expect(secondImport.skippedDuplicates).toBe(1);
  });

  it('refreshes marketplace tokens without leaking secrets', async () => {
    const service = createService();
    const started = await service.connectMarketplace(context, 'tiktok_shop', {});
    const state = new URL(started.authorizationUrl || '').searchParams.get('state') || '';

    await service.completeOAuth(context, 'tiktok_shop', { code: 'code', state });
    const refreshed = await service.refreshMarketplaceToken(context, 'tiktok_shop');

    expect(refreshed.status).toBe('connected');
    expect(refreshed.account?.tokenExpiresAt).toBeDefined();
    expect(JSON.stringify(refreshed)).not.toContain('refresh_refreshed');
  });

  it('stores PageSpeed reports by tenant and user', async () => {
    const service = createService();
    const report = await service.runPageSpeedReport(context, {
      url: 'https://example.com',
      strategy: 'mobile',
    });

    expect(report.metrics.performance).toBeGreaterThan(0);
    expect(await service.listPageSpeedReports(context)).toHaveLength(1);
    expect(await service.listPageSpeedReports(otherContext)).toHaveLength(0);
  });
});
