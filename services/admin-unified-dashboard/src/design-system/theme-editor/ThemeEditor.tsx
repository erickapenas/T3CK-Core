import { useMemo } from 'react';
import { Button, Card, Dropdown, Input } from '../components/primitives';
import { useTheme } from '../providers/ThemeProvider';
import { DesignTokens, InterfaceDensity, SystemTheme } from '../tokens/schema';
import './ThemeEditor.css';

export function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="theme-field">
      <span>{label}</span>
      <div className="theme-color-input">
        <i style={{ background: value || 'transparent' }} />
        <Input value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="oklch(...)" />
      </div>
    </label>
  );
}

export function FontSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="theme-field">
      <span>Fonte principal</span>
      <Dropdown value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="Inter, ui-sans-serif, system-ui, sans-serif">Inter / System</option>
        <option value="Arial, ui-sans-serif, system-ui, sans-serif">Arial Enterprise</option>
        <option value="Verdana, ui-sans-serif, system-ui, sans-serif">Verdana Accessible</option>
        <option value="Georgia, ui-serif, serif">Georgia Editorial</option>
      </Dropdown>
    </label>
  );
}

export function DensitySelector({
  value,
  onChange,
}: {
  value: InterfaceDensity;
  onChange: (value: InterfaceDensity) => void;
}) {
  return (
    <label className="theme-field">
      <span>Densidade</span>
      <Dropdown value={value} onChange={(event) => onChange(event.target.value as InterfaceDensity)}>
        <option value="compact">Compacta</option>
        <option value="comfortable">Confortavel</option>
        <option value="spacious">Espacosa</option>
      </Dropdown>
    </label>
  );
}

export function LayoutSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="theme-field">
      <span>Layout padrao</span>
      <Dropdown value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="balanced">Balanced dashboard</option>
        <option value="dense">Dense operations</option>
        <option value="immersive">Immersive glass</option>
        <option value="enterprise">Enterprise calm</option>
        <option value="expressive">Expressive commerce</option>
      </Dropdown>
    </label>
  );
}

export function GlassIntensityControl({
  enabled,
  blur,
  opacity,
  onChange,
}: {
  enabled: boolean;
  blur: number;
  opacity: number;
  onChange: (glass: { enabled: boolean; blur: number; opacity: number }) => void;
}) {
  return (
    <div className="theme-glass-grid">
      <label className="theme-checkbox">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange({ enabled: event.target.checked, blur, opacity })}
        />
        Ativar glass
      </label>
      <label className="theme-field">
        <span>Blur</span>
        <input
          type="range"
          min="0"
          max="24"
          value={blur}
          onChange={(event) => onChange({ enabled, blur: Number(event.target.value), opacity })}
        />
      </label>
      <label className="theme-field">
        <span>Opacidade</span>
        <input
          type="range"
          min="45"
          max="100"
          value={Math.round(opacity * 100)}
          onChange={(event) => onChange({ enabled, blur, opacity: Number(event.target.value) / 100 })}
        />
      </label>
    </div>
  );
}

export function WidgetManager({
  widgets,
  onChange,
}: {
  widgets: Array<{ widgetKey: string; position: number; visible: boolean; size: 'sm' | 'md' | 'lg' | 'xl' }>;
  onChange: (
    widgets: Array<{ widgetKey: string; position: number; visible: boolean; size: 'sm' | 'md' | 'lg' | 'xl' }>
  ) => void;
}) {
  const sorted = [...widgets].sort((left, right) => left.position - right.position);
  return (
    <div className="widget-manager">
      {sorted.map((widget, index) => (
        <div key={widget.widgetKey}>
          <label className="theme-checkbox">
            <input
              type="checkbox"
              checked={widget.visible}
              onChange={(event) => {
                const next = sorted.map((item) =>
                  item.widgetKey === widget.widgetKey ? { ...item, visible: event.target.checked } : item
                );
                onChange(next);
              }}
            />
            {widget.widgetKey}
          </label>
          <span>#{index + 1}</span>
          <Dropdown
            value={widget.size}
            onChange={(event) => {
              const next = sorted.map((item) =>
                item.widgetKey === widget.widgetKey ? { ...item, size: event.target.value as 'sm' | 'md' | 'lg' | 'xl' } : item
              );
              onChange(next);
            }}
          >
            <option value="sm">sm</option>
            <option value="md">md</option>
            <option value="lg">lg</option>
            <option value="xl">xl</option>
          </Dropdown>
        </div>
      ))}
    </div>
  );
}

export function DashboardLayoutBuilder({
  layout,
  onChange,
}: {
  layout: Record<string, unknown>;
  onChange: (layout: Record<string, unknown>) => void;
}) {
  const columns = Number(layout.columns || 12);
  return (
    <Card title="Layout da dashboard" eyebrow="Builder">
      <label className="theme-field">
        <span>Colunas</span>
        <input
          type="range"
          min="6"
          max="12"
          value={columns}
          onChange={(event) => onChange({ ...layout, columns: Number(event.target.value) })}
        />
      </label>
      <div className="layout-preview-grid" style={{ gridTemplateColumns: `repeat(${Math.min(columns, 12)}, 1fr)` }}>
        {Array.from({ length: Math.min(columns, 12) }).map((_, index) => (
          <i key={index} />
        ))}
      </div>
    </Card>
  );
}

export function ThemePreview({ tokens }: { tokens: DesignTokens }) {
  const palette = tokens.charts?.palette || [];
  return (
    <div className="theme-preview">
      <aside>
        <strong>Sidebar</strong>
        <span>Dashboard</span>
        <span>Pedidos</span>
        <span>Integracao</span>
      </aside>
      <main>
        <div className="theme-preview-topbar">
          <strong>Preview</strong>
          <Button tone="primary">Acao</Button>
        </div>
        <div className="theme-preview-grid">
          <Card title="Faturamento" eyebrow="KPI">
            <strong className="preview-value">R$ 82.450</strong>
            <span>+14,2% periodo anterior</span>
          </Card>
          <Card title="Pedidos" eyebrow="Operacao">
            <div className="preview-bars">
              {(palette.length ? palette : ['var(--chart-color-1)', 'var(--chart-color-2)', 'var(--chart-color-3)']).map(
                (color, index) => (
                  <i key={`${color}-${index}`} style={{ background: color, width: `${48 + index * 16}%` }} />
                )
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

export function ThemeEditor({
  draftTokens,
  onTokensChange,
  selectedThemeId,
  onThemeChange,
}: {
  draftTokens: DesignTokens;
  onTokensChange: (tokens: DesignTokens) => void;
  selectedThemeId: string;
  onThemeChange: (themeId: string) => void;
}) {
  const { bundle } = useTheme();
  const selectedTheme: SystemTheme | undefined = useMemo(
    () => bundle.themes.find((theme) => theme.id === selectedThemeId),
    [bundle.themes, selectedThemeId]
  );
  const colors = draftTokens.colors || {};
  const typography = draftTokens.typography || {};
  const glass = draftTokens.glass || {};
  const density = draftTokens.density || {};
  const layout = draftTokens.layout || {};

  const patch = (next: DesignTokens) => onTokensChange({ ...draftTokens, ...next });

  return (
    <div className="theme-editor">
      <Card title="Tema base" eyebrow="Sistema">
        <label className="theme-field">
          <span>Preset</span>
          <Dropdown value={selectedThemeId} onChange={(event) => onThemeChange(event.target.value)}>
            {bundle.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </Dropdown>
        </label>
        {selectedTheme && <p className="theme-muted">{selectedTheme.description}</p>}
      </Card>

      <Card title="Cores" eyebrow="OKLCH">
        <div className="theme-form-grid">
          <ColorPicker label="Primaria" value={String(colors.primary || '')} onChange={(value) => patch({ colors: { ...colors, primary: value } })} />
          <ColorPicker label="Secundaria" value={String(colors.secondary || '')} onChange={(value) => patch({ colors: { ...colors, secondary: value } })} />
          <ColorPicker label="Fundo" value={String(colors.background || '')} onChange={(value) => patch({ colors: { ...colors, background: value } })} />
          <ColorPicker label="Cards" value={String(colors.card || '')} onChange={(value) => patch({ colors: { ...colors, card: value } })} />
          <ColorPicker label="Sidebar" value={String(colors.sidebar || '')} onChange={(value) => patch({ colors: { ...colors, sidebar: value } })} />
          <ColorPicker label="Topbar" value={String(colors.topbar || '')} onChange={(value) => patch({ colors: { ...colors, topbar: value } })} />
        </div>
      </Card>

      <Card title="Tipografia e layout" eyebrow="Interface">
        <div className="theme-form-grid">
          <FontSelector value={String(typography.fontFamilyBase || '')} onChange={(value) => patch({ typography: { ...typography, fontFamilyBase: value } })} />
          <DensitySelector value={(density.interface as InterfaceDensity) || 'comfortable'} onChange={(value) => patch({ density: { ...density, interface: value } })} />
          <LayoutSelector value={String(layout.shell || 'balanced')} onChange={(value) => patch({ layout: { ...layout, shell: value } })} />
          <label className="theme-field">
            <span>Raio de borda</span>
            <Input value={String(draftTokens.radius?.lg || '')} onChange={(event) => patch({ radius: { ...(draftTokens.radius || {}), lg: event.target.value } })} />
          </label>
        </div>
      </Card>

      <Card title="Liquid Glass" eyebrow="Opcional">
        <GlassIntensityControl
          enabled={Boolean(glass.enabled)}
          blur={Number(String(glass.blur || '0').replace('px', ''))}
          opacity={Number(glass.opacity || 1)}
          onChange={(next) =>
            patch({ glass: { ...glass, enabled: next.enabled, blur: `${next.blur}px`, opacity: next.opacity } })
          }
        />
      </Card>
    </div>
  );
}
