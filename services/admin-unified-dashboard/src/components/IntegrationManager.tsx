import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AdminSessionUser,
  ImportOrdersResult,
  IntegrationLog,
  integrationsApi,
  MarketplaceConnectResult,
  MarketplaceProvider,
  PageSpeedReport,
  PublicIntegration,
} from '../apiClient';
import '../styles/IntegrationManager.css';

type IntegrationManagerProps = {
  tenantId: string;
  currentUser: AdminSessionUser;
  onChange?: () => void;
};

const marketplaceCards: Array<{ provider: MarketplaceProvider; label: string; hint: string }> = [
  {
    provider: 'mercado_livre',
    label: 'Mercado Livre',
    hint: 'OAuth, pedidos e webhooks de loja',
  },
  {
    provider: 'tiktok_shop',
    label: 'TikTok Shop',
    hint: 'OAuth seller, pedidos e eventos',
  },
  {
    provider: 'shopee',
    label: 'Shopee',
    hint: 'Partner auth, pedidos e assinatura HMAC',
  },
  {
    provider: 'other',
    label: 'Outros',
    hint: 'Conector base para novos marketplaces',
  },
];

const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function formatDate(value?: string): string {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function metricValue(value?: number, suffix = ''): string {
  if (value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return `${numberFormatter.format(value)}${suffix}`;
}

function integrationRedirectUri(): string {
  return `${window.location.origin}/admin-unified-dashboard/integrations`;
}

function isSuccess<T>(result: { success?: boolean; data?: T; error?: string }): result is {
  success: true;
  data: T;
} {
  return Boolean(result.success);
}

export function IntegrationManager({ tenantId, currentUser, onChange }: IntegrationManagerProps) {
  const [integrations, setIntegrations] = useState<PublicIntegration[]>([]);
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [pageSpeedHistory, setPageSpeedHistory] = useState<PageSpeedReport[]>([]);
  const [activeReport, setActiveReport] = useState<PageSpeedReport | null>(null);
  const [pageSpeedUrl, setPageSpeedUrl] = useState('');
  const [pageSpeedStrategy, setPageSpeedStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [oauthProvider, setOauthProvider] = useState<MarketplaceProvider>('mercado_livre');
  const [oauthCode, setOauthCode] = useState('');
  const [oauthState, setOauthState] = useState('');
  const [connectResult, setConnectResult] = useState<MarketplaceConnectResult | null>(null);
  const [lastImport, setLastImport] = useState<ImportOrdersResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const byProvider = useMemo(() => {
    return new Map(integrations.map((integration) => [integration.provider, integration]));
  }, [integrations]);

  async function refresh(): Promise<void> {
    try {
      setLoading(true);
      setError('');
      const [integrationResult, reportResult, logResult] = await Promise.all([
        integrationsApi.list(tenantId),
        integrationsApi.pageSpeedHistory(tenantId),
        integrationsApi.logs(tenantId),
      ]);

      if (!isSuccess<PublicIntegration[]>(integrationResult)) {
        throw new Error(integrationResult.error || 'Falha ao listar integrações');
      }
      if (!isSuccess<PageSpeedReport[]>(reportResult)) {
        throw new Error(reportResult.error || 'Falha ao listar relatórios PageSpeed');
      }
      if (!isSuccess<IntegrationLog[]>(logResult)) {
        throw new Error(logResult.error || 'Falha ao listar logs de integração');
      }

      setIntegrations(integrationResult.data);
      setPageSpeedHistory(reportResult.data);
      setLogs(logResult.data);
      setActiveReport((current) =>
        current
          ? reportResult.data.find((report) => report.id === current.id) || reportResult.data[0] || null
          : reportResult.data[0] || null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar integrações');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [tenantId]);

  async function runAction(label: string, action: () => Promise<void>): Promise<void> {
    try {
      setActionLoading(label);
      setError('');
      setSuccess('');
      await action();
      await refresh();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na ação');
    } finally {
      setActionLoading('');
    }
  }

  function unwrap<T>(result: { success?: boolean; data?: T; error?: string }, fallback: string): T {
    if (!isSuccess<T>(result)) {
      throw new Error(result.error || fallback);
    }
    return result.data;
  }

  function connect(provider: MarketplaceProvider): void {
    const authWindow = window.open('about:blank', '_blank');
    runAction(`connect:${provider}`, async () => {
      try {
        const result = unwrap<MarketplaceConnectResult>(
          await integrationsApi.connectMarketplace(
            provider,
            { redirectUri: integrationRedirectUri() },
            tenantId
          ),
          'Falha ao iniciar OAuth'
        );
        setConnectResult(result);
        setOauthProvider(provider);
        if (result.state) {
          setOauthState(result.state);
        }
        if (result.authorizationUrl) {
          if (authWindow) {
            authWindow.opener = null;
            authWindow.location.assign(result.authorizationUrl);
          } else {
            window.location.assign(result.authorizationUrl);
          }
        }
        setSuccess('Conexão iniciada');
      } catch (err) {
        authWindow?.close();
        throw err;
      }
    });
  }

  function disconnect(provider: MarketplaceProvider): void {
    runAction(`disconnect:${provider}`, async () => {
      unwrap<PublicIntegration>(
        await integrationsApi.disconnectMarketplace(provider, tenantId),
        'Falha ao desconectar'
      );
      setSuccess('Integração desconectada');
    });
  }

  function test(provider: MarketplaceProvider): void {
    runAction(`test:${provider}`, async () => {
      unwrap<PublicIntegration>(
        await integrationsApi.testMarketplace(provider, tenantId),
        'Falha ao testar conexão'
      );
      setSuccess('Conexão testada');
    });
  }

  function refreshToken(provider: MarketplaceProvider): void {
    runAction(`refresh:${provider}`, async () => {
      unwrap<PublicIntegration>(
        await integrationsApi.refreshMarketplaceToken(provider, tenantId),
        'Falha ao atualizar token'
      );
      setSuccess('Token atualizado');
    });
  }

  function importOrders(provider: MarketplaceProvider): void {
    runAction(`import:${provider}`, async () => {
      const result = unwrap<ImportOrdersResult>(
        await integrationsApi.importMarketplaceOrders(provider, tenantId),
        'Falha ao importar pedidos'
      );
      setLastImport(result);
      setSuccess(`${result.imported} pedido(s) importado(s)`);
    });
  }

  function submitOAuth(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    runAction('oauth', async () => {
      const result = unwrap<MarketplaceConnectResult>(
        await integrationsApi.completeOAuth(
          oauthProvider,
          {
            code: oauthCode,
            state: oauthState,
            redirectUri: integrationRedirectUri(),
          },
          tenantId
        ),
        'Falha ao confirmar OAuth'
      );
      setConnectResult(result);
      setOauthCode('');
      setOauthState('');
      setSuccess('OAuth confirmado');
    });
  }

  function submitPageSpeed(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    runAction('pagespeed', async () => {
      const report = unwrap<PageSpeedReport>(
        await integrationsApi.runPageSpeed(
          { url: pageSpeedUrl, strategy: pageSpeedStrategy },
          tenantId
        ),
        'Falha ao rodar PageSpeed'
      );
      setActiveReport(report);
      setSuccess('Relatório PageSpeed gerado');
    });
  }

  return (
    <div className="integration-manager">
      <section className="integration-summary">
        <div>
          <span className="integration-kicker">Tenant</span>
          <strong>{tenantId}</strong>
        </div>
        <div>
          <span className="integration-kicker">Usuário</span>
          <strong>{currentUser.username}</strong>
        </div>
        <div>
          <span className="integration-kicker">Permissão</span>
          <strong>{currentUser.role === 'admin' ? 'Admin completo' : 'Tenant próprio'}</strong>
        </div>
      </section>

      {error ? <div className="integration-alert">{error}</div> : null}
      {success ? <div className="integration-success">{success}</div> : null}
      {loading ? <div className="integration-muted">Atualizando integrações...</div> : null}

      <section className="marketplace-grid">
        {marketplaceCards.map((card) => {
          const integration = byProvider.get(card.provider);
          const loadingKey = actionLoading.split(':')[0];
          const isBusy = actionLoading.endsWith(card.provider);

          return (
            <article className="integration-card" key={card.provider}>
              <div className="integration-card-head">
                <div>
                  <h3>{card.label}</h3>
                  <p>{card.hint}</p>
                </div>
                <span className={`integration-badge ${integration?.status || 'disconnected'}`}>
                  {integration?.status || 'disconnected'}
                </span>
              </div>

              <dl className="integration-detail-list">
                <div>
                  <dt>Conta</dt>
                  <dd>{integration?.account?.shopName || integration?.account?.externalAccountId || '-'}</dd>
                </div>
                <div>
                  <dt>Expiração</dt>
                  <dd>{formatDate(integration?.account?.tokenExpiresAt)}</dd>
                </div>
                <div>
                  <dt>Último teste</dt>
                  <dd>{formatDate(integration?.lastTestedAt)}</dd>
                </div>
              </dl>

              {integration?.lastError ? (
                <div className="integration-inline-error">{integration.lastError}</div>
              ) : null}

              <div className="integration-actions">
                <button type="button" onClick={() => connect(card.provider)} disabled={isBusy}>
                  {loadingKey === 'connect' && isBusy ? 'Conectando' : 'Conectar'}
                </button>
                <button type="button" onClick={() => test(card.provider)} disabled={isBusy}>
                  Testar
                </button>
                <button type="button" onClick={() => refreshToken(card.provider)} disabled={isBusy}>
                  Atualizar token
                </button>
                <button type="button" onClick={() => importOrders(card.provider)} disabled={isBusy}>
                  Importar
                </button>
                <button type="button" className="danger" onClick={() => disconnect(card.provider)} disabled={isBusy}>
                  Desconectar
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="integration-panel oauth-panel">
        <div className="integration-panel-head">
          <h3>OAuth</h3>
          {connectResult?.authorizationUrl ? (
            <a href={connectResult.authorizationUrl} target="_blank" rel="noreferrer">
              Abrir autorização
            </a>
          ) : null}
        </div>
        <form className="oauth-grid" onSubmit={submitOAuth}>
          <label>
            Marketplace
            <select
              value={oauthProvider}
              onChange={(event) => setOauthProvider(event.target.value as MarketplaceProvider)}
            >
              {marketplaceCards.map((card) => (
                <option key={card.provider} value={card.provider}>
                  {card.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Code
            <input value={oauthCode} onChange={(event) => setOauthCode(event.target.value)} />
          </label>
          <label>
            State
            <input value={oauthState} onChange={(event) => setOauthState(event.target.value)} />
          </label>
          <button type="submit" disabled={actionLoading === 'oauth'}>
            {actionLoading === 'oauth' ? 'Confirmando' : 'Confirmar'}
          </button>
        </form>
      </section>

      <section className="integration-panel">
        <div className="integration-panel-head">
          <h3>Google PageSpeed</h3>
          <span>{pageSpeedHistory.length} relatório(s)</span>
        </div>
        <form className="pagespeed-form" onSubmit={submitPageSpeed}>
          <label>
            URL
            <input
              value={pageSpeedUrl}
              onChange={(event) => setPageSpeedUrl(event.target.value)}
              placeholder="https://example.com"
            />
          </label>
          <label>
            Estratégia
            <select
              value={pageSpeedStrategy}
              onChange={(event) => setPageSpeedStrategy(event.target.value as 'mobile' | 'desktop')}
            >
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
          </label>
          <button type="submit" disabled={actionLoading === 'pagespeed'}>
            {actionLoading === 'pagespeed' ? 'Rodando' : 'Rodar teste'}
          </button>
        </form>

        {activeReport ? (
          <div className="pagespeed-report">
            <div className="score-grid">
              <Score label="Performance" value={activeReport.metrics.performance} />
              <Score label="Accessibility" value={activeReport.metrics.accessibility} />
              <Score label="Best Practices" value={activeReport.metrics.bestPractices} />
              <Score label="SEO" value={activeReport.metrics.seo} />
            </div>
            <div className="vitals-grid">
              <Metric label="LCP" value={metricValue(activeReport.metrics.lcpMs, ' ms')} />
              <Metric label="CLS" value={metricValue(activeReport.metrics.cls)} />
              <Metric label="INP" value={metricValue(activeReport.metrics.inpMs, ' ms')} />
              <Metric label="FID" value={metricValue(activeReport.metrics.fidMs, ' ms')} />
              <Metric label="TBT" value={metricValue(activeReport.metrics.totalBlockingTimeMs, ' ms')} />
              <Metric label="Speed Index" value={metricValue(activeReport.metrics.speedIndexMs, ' ms')} />
              <Metric label="Load" value={metricValue(activeReport.metrics.loadTimeMs, ' ms')} />
            </div>
          </div>
        ) : null}
      </section>

      <section className="integration-bottom-grid">
        <div className="integration-panel">
          <div className="integration-panel-head">
            <h3>Histórico PageSpeed</h3>
          </div>
          <div className="integration-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Score</th>
                  <th>Estratégia</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {pageSpeedHistory.map((report) => (
                  <tr key={report.id} onClick={() => setActiveReport(report)}>
                    <td>{report.url}</td>
                    <td>{report.metrics.performance}</td>
                    <td>{report.strategy}</td>
                    <td>{formatDate(report.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pageSpeedHistory.length ? (
              <p className="integration-muted">Nenhum relatório encontrado.</p>
            ) : null}
          </div>
        </div>

        <div className="integration-panel">
          <div className="integration-panel-head">
            <h3>Logs</h3>
            {lastImport ? (
              <span>
                {lastImport.imported} importado(s), {lastImport.skippedDuplicates} duplicado(s)
              </span>
            ) : null}
          </div>
          <div className="integration-log-list">
            {logs.map((log) => (
              <div className="integration-log-row" key={log.id}>
                <span className={`integration-dot ${log.status}`} />
                <div>
                  <strong>{log.action}</strong>
                  <p>{log.message}</p>
                </div>
                <time>{formatDate(log.createdAt)}</time>
              </div>
            ))}
            {!logs.length ? <p className="integration-muted">Nenhum log encontrado.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="vital-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
