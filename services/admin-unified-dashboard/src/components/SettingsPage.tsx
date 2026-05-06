import { useEffect, useMemo, useState } from 'react';
import { AdminSessionUser, themeApi } from '../apiClient';
import { Button, Badge, Card, Input, Tabs } from '../design-system/components/primitives';
import { useTheme } from '../design-system/providers/ThemeProvider';
import {
  DashboardLayoutBuilder,
  ThemeEditor,
  ThemePreview,
  WidgetManager,
} from '../design-system/theme-editor/ThemeEditor';
import { mergeTokens } from '../design-system/tokens/mergeTokens';
import { DesignTokens, UserThemePreferences } from '../design-system/tokens/schema';
import '../styles/SettingsPage.css';

type SettingsPageProps = {
  tenantId: string;
  currentUser: AdminSessionUser;
};

const tabs = [
  { id: 'theme', label: 'Tema' },
  { id: 'brand', label: 'Marca' },
  { id: 'layout', label: 'Layout' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tables', label: 'Tabelas' },
  { id: 'charts', label: 'Graficos' },
  { id: 'accessibility', label: 'Acessibilidade' },
  { id: 'advanced', label: 'Avancado' },
];

export function SettingsPage({ tenantId, currentUser }: SettingsPageProps) {
  const {
    bundle,
    resolvedTokens,
    loading,
    error,
    setPreviewTokens,
    clearPreview,
    saveDraft,
    publishTheme,
    resetTheme,
    updateUserPreferences,
    refreshTheme,
  } = useTheme();
  const [activeTab, setActiveTab] = useState('theme');
  const [selectedThemeId, setSelectedThemeId] = useState(bundle.tenantTheme.themeId);
  const [draftTokens, setDraftTokens] = useState<DesignTokens>(bundle.tenantTheme.customTokensJson || {});
  const [brand, setBrand] = useState({
    displayName: bundle.tenantTheme.displayName || '',
    logoUrl: bundle.tenantTheme.logoUrl || '',
    faviconUrl: bundle.tenantTheme.faviconUrl || '',
  });
  const [preferences, setPreferences] = useState<UserThemePreferences>(bundle.userPreferences);
  const [layoutJson, setLayoutJson] = useState<Record<string, unknown>>(bundle.dashboardLayout.layoutJson || {});
  const [widgets, setWidgets] = useState(
    bundle.dashboardWidgets.map((widget) => ({
      widgetKey: widget.widgetKey,
      position: widget.position,
      visible: widget.visible,
      size: widget.size,
    }))
  );
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedTheme = useMemo(
    () => bundle.themes.find((theme) => theme.id === selectedThemeId) || bundle.activeTheme,
    [bundle.activeTheme, bundle.themes, selectedThemeId]
  );

  const previewResolvedTokens = useMemo(
    () => mergeTokens(selectedTheme.tokensJson, draftTokens),
    [draftTokens, selectedTheme.tokensJson]
  );

  useEffect(() => {
    setSelectedThemeId(bundle.tenantTheme.themeId);
    setDraftTokens(bundle.tenantTheme.customTokensJson || {});
    setBrand({
      displayName: bundle.tenantTheme.displayName || '',
      logoUrl: bundle.tenantTheme.logoUrl || '',
      faviconUrl: bundle.tenantTheme.faviconUrl || '',
    });
    setPreferences(bundle.userPreferences);
    setLayoutJson(bundle.dashboardLayout.layoutJson || {});
    setWidgets(
      bundle.dashboardWidgets.map((widget) => ({
        widgetKey: widget.widgetKey,
        position: widget.position,
        visible: widget.visible,
        size: widget.size,
      }))
    );
  }, [bundle]);

  useEffect(() => {
    setPreviewTokens(previewResolvedTokens);
    return () => clearPreview();
  }, [clearPreview, previewResolvedTokens, setPreviewTokens]);

  const run = async (action: () => Promise<void>, success: string) => {
    setSaving(true);
    setStatus(null);
    try {
      await action();
      setStatus(success);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Falha ao salvar configuracao visual.');
    } finally {
      setSaving(false);
    }
  };

  const saveTenantDraft = () =>
    run(
      () =>
        saveDraft({
          themeId: selectedThemeId,
          customTokensJson: draftTokens,
          displayName: brand.displayName,
          logoUrl: brand.logoUrl,
          faviconUrl: brand.faviconUrl,
        }),
      'Rascunho salvo.'
    );

  const publishTenantTheme = () =>
    run(
      () =>
        publishTheme({
          themeId: selectedThemeId,
          customTokensJson: draftTokens,
          displayName: brand.displayName,
          logoUrl: brand.logoUrl,
          faviconUrl: brand.faviconUrl,
        }),
      'Tema publicado para o tenant.'
    );

  const resetTenantTheme = () => run(resetTheme, 'Tema restaurado para o padrao.');

  const saveUserPreferences = () =>
    run(() => updateUserPreferences(preferences), 'Preferencias individuais salvas.');

  const saveDashboardLayout = () =>
    run(
      async () => {
        await themeApi.updateDashboardLayout(
          {
            layoutJson: {
              ...layoutJson,
              widgets,
            },
          },
          tenantId
        );
        await refreshTheme();
      },
      'Layout da dashboard salvo.'
    );

  const patchPreferences = (updates: Partial<UserThemePreferences>) => {
    setPreferences((current) => ({ ...current, ...updates }));
  };

  return (
    <div className="settings-page">
      <div className="settings-hero">
        <div>
          <span>Design system multi-tenant</span>
          <h2>Personalização Visual</h2>
          <p>
            Escolha um tema base, ajuste tokens seguros e publique a identidade do tenant sem expor
            CSS ou JavaScript livre.
          </p>
        </div>
        <div className="settings-actions">
          <Badge tone={bundle.tenantTheme.status === 'published' ? 'success' : 'warning'}>
            {bundle.tenantTheme.status}
          </Badge>
          <Button onClick={saveTenantDraft} disabled={saving}>Salvar rascunho</Button>
          <Button tone="primary" onClick={publishTenantTheme} disabled={saving || currentUser.role !== 'admin'}>
            Salvar
          </Button>
          <Button tone="danger" onClick={resetTenantTheme} disabled={saving || currentUser.role !== 'admin'}>
            Restaurar padrao
          </Button>
        </div>
      </div>

      {loading && <div className="settings-state">Carregando tema...</div>}
      {error && <div className="settings-state error">{error}</div>}
      {status && <div className="settings-state">{status}</div>}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="settings-grid">
        <section className="settings-main">
          {activeTab === 'theme' && (
            <ThemeEditor
              draftTokens={draftTokens}
              onTokensChange={setDraftTokens}
              selectedThemeId={selectedThemeId}
              onThemeChange={setSelectedThemeId}
            />
          )}

          {activeTab === 'brand' && (
            <Card title="Marca do tenant" eyebrow="Branding">
              <div className="settings-form-grid">
                <label>
                  Nome exibido
                  <Input
                    value={brand.displayName}
                    onChange={(event) => setBrand((current) => ({ ...current, displayName: event.target.value }))}
                    placeholder="Nome da empresa"
                  />
                </label>
                <label>
                  Logo URL
                  <Input
                    value={brand.logoUrl}
                    onChange={(event) => setBrand((current) => ({ ...current, logoUrl: event.target.value }))}
                    placeholder="https://..."
                  />
                </label>
                <label>
                  Favicon URL
                  <Input
                    value={brand.faviconUrl}
                    onChange={(event) => setBrand((current) => ({ ...current, faviconUrl: event.target.value }))}
                    placeholder="https://..."
                  />
                </label>
              </div>
            </Card>
          )}

          {activeTab === 'layout' && (
            <DashboardLayoutBuilder layout={layoutJson} onChange={setLayoutJson} />
          )}

          {activeTab === 'dashboard' && (
            <Card title="Widgets da dashboard" eyebrow="Tenant e usuario">
              <WidgetManager widgets={widgets} onChange={setWidgets} />
              <div className="settings-actions inline">
                <Button tone="primary" onClick={saveDashboardLayout} disabled={saving}>
                  Salvar layout
                </Button>
              </div>
            </Card>
          )}

          {activeTab === 'tables' && (
            <Card title="Tabelas" eyebrow="Densidade">
              <div className="settings-form-grid">
                <label>
                  Altura de linha
                  <Input
                    value={String(draftTokens.density?.tableRowHeight || '')}
                    onChange={(event) =>
                      setDraftTokens((current) => ({
                        ...current,
                        density: { ...(current.density || {}), tableRowHeight: event.target.value },
                      }))
                    }
                    placeholder="42px"
                  />
                </label>
                <label>
                  Colunas visiveis por tabela
                  <Input value="Configuravel por usuario via user_theme_preferences.visibleTableColumns" readOnly />
                </label>
              </div>
            </Card>
          )}

          {activeTab === 'charts' && (
            <Card title="Graficos" eyebrow="Palette">
              <div className="settings-chart-palette">
                {['chart-color-1', 'chart-color-2', 'chart-color-3', 'chart-color-4'].map((name, index) => (
                  <label key={name}>
                    Cor {index + 1}
                    <Input
                      value={String(draftTokens.charts?.palette?.[index] || '')}
                      onChange={(event) => {
                        const palette = [...(draftTokens.charts?.palette || [])];
                        palette[index] = event.target.value;
                        setDraftTokens((current) => ({ ...current, charts: { ...(current.charts || {}), palette } }));
                      }}
                      placeholder="oklch(...)"
                    />
                  </label>
                ))}
              </div>
            </Card>
          )}

          {activeTab === 'accessibility' && (
            <Card title="Acessibilidade individual" eyebrow="Usuario">
              <div className="settings-toggle-grid">
                <label>
                  Modo
                  <select
                    className="ds-input"
                    value={preferences.preferredMode}
                    onChange={(event) => patchPreferences({ preferredMode: event.target.value as UserThemePreferences['preferredMode'] })}
                  >
                    <option value="system">Sistema</option>
                    <option value="light">Claro</option>
                    <option value="dark">Escuro</option>
                  </select>
                </label>
                <label>
                  Tamanho da fonte
                  <select
                    className="ds-input"
                    value={preferences.fontSize}
                    onChange={(event) => patchPreferences({ fontSize: event.target.value as UserThemePreferences['fontSize'] })}
                  >
                    <option value="small">Pequena</option>
                    <option value="medium">Media</option>
                    <option value="large">Grande</option>
                  </select>
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={preferences.highContrast} onChange={(event) => patchPreferences({ highContrast: event.target.checked })} />
                  Alto contraste
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => patchPreferences({ reducedMotion: event.target.checked })} />
                  Reduzir animacoes
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={preferences.reducedTransparency} onChange={(event) => patchPreferences({ reducedTransparency: event.target.checked })} />
                  Reduzir transparencia
                </label>
              </div>
              <div className="settings-actions inline">
                <Button tone="primary" onClick={saveUserPreferences} disabled={saving}>
                  Salvar preferencias
                </Button>
              </div>
            </Card>
          )}

          {activeTab === 'advanced' && (
            <Card title="Avancado" eyebrow="Seguranca">
              <p className="settings-muted">
                CSS e JavaScript livres nao sao aceitos. O sistema publica apenas tokens validados,
                com limite de tamanho, whitelist estrutural e rollback pelo botao Restaurar padrao.
              </p>
              <pre>{JSON.stringify({ selectedThemeId, draftTokens, preferences }, null, 2)}</pre>
            </Card>
          )}
        </section>

        <aside className="settings-preview-pane">
          <Card title="Preview em tempo real" eyebrow="Safe preview">
            <ThemePreview tokens={mergeTokens(resolvedTokens, previewResolvedTokens)} />
          </Card>
          <Card title="Tokens resolvidos" eyebrow="CSS variables">
            <dl className="settings-token-list">
              <div><dt>Primaria</dt><dd>{String(previewResolvedTokens.colors?.primary || 'padrao')}</dd></div>
              <div><dt>Fundo</dt><dd>{String(previewResolvedTokens.colors?.background || 'padrao')}</dd></div>
              <div><dt>Glass</dt><dd>{previewResolvedTokens.glass?.enabled ? 'ativo' : 'inativo'}</dd></div>
              <div><dt>Densidade</dt><dd>{String(preferences.density)}</dd></div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
