import { DesignTokens, UserThemePreferences } from './schema';

type VariableMap = Record<string, string>;

const stringValue = (value: unknown, fallback: string): string =>
  value === undefined || value === null || value === '' ? fallback : String(value);

const numberValue = (value: unknown, fallback: number): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : String(fallback);

export function tokensToCssVariables(
  tokens: DesignTokens,
  preferences?: Partial<UserThemePreferences>
): VariableMap {
  const colors = tokens.colors || {};
  const typography = tokens.typography || {};
  const radius = tokens.radius || {};
  const shadows = tokens.shadows || {};
  const glass = tokens.glass || {};
  const motion = tokens.motion || {};
  const density = tokens.density || {};
  const charts = tokens.charts || {};
  const layout = tokens.layout || {};
  const fontScale =
    preferences?.fontSize === 'large' ? '15px' : preferences?.fontSize === 'small' ? '13px' : undefined;

  return {
    '--color-primary': stringValue(colors.primary, 'oklch(55% 0.14 220)'),
    '--color-secondary': stringValue(colors.secondary, 'oklch(62% 0.13 165)'),
    '--color-background': stringValue(colors.background, 'oklch(97% 0.012 245)'),
    '--color-surface': stringValue(colors.surface, 'oklch(100% 0 0)'),
    '--color-card': stringValue(colors.card, 'oklch(100% 0 0)'),
    '--color-sidebar': stringValue(colors.sidebar, 'oklch(18% 0.04 250)'),
    '--color-topbar': stringValue(colors.topbar, 'oklch(100% 0 0 / 0.92)'),
    '--color-text': stringValue(colors.text, 'oklch(22% 0.03 250)'),
    '--color-muted': stringValue(colors.muted, 'oklch(52% 0.03 250)'),
    '--color-border': stringValue(colors.border, 'oklch(88% 0.018 250)'),
    '--color-success': stringValue(colors.success, 'oklch(58% 0.14 150)'),
    '--color-warning': stringValue(colors.warning, 'oklch(74% 0.15 75)'),
    '--color-danger': stringValue(colors.danger, 'oklch(58% 0.18 28)'),

    '--font-family-base': stringValue(
      typography.fontFamilyBase,
      'Inter, ui-sans-serif, system-ui, sans-serif'
    ),
    '--font-family-mono': stringValue(typography.fontFamilyMono, 'JetBrains Mono, ui-monospace, monospace'),
    '--font-size-base': fontScale || stringValue(typography.fontSizeBase, '14px'),
    '--font-weight-heading': stringValue(typography.fontWeightHeading, '760'),

    '--radius-sm': stringValue(radius.sm, '6px'),
    '--radius-md': stringValue(radius.md, '8px'),
    '--radius-lg': stringValue(radius.lg, '10px'),
    '--radius-xl': stringValue(radius.xl, '14px'),

    '--shadow-sm': stringValue(shadows.sm, '0 4px 12px rgb(15 23 42 / 0.07)'),
    '--shadow-md': stringValue(shadows.md, '0 14px 36px rgb(15 23 42 / 0.10)'),
    '--shadow-lg': stringValue(shadows.lg, '0 28px 72px rgb(15 23 42 / 0.16)'),

    '--glass-enabled': glass.enabled && !preferences?.reducedTransparency ? '1' : '0',
    '--glass-blur': preferences?.reducedTransparency ? '0px' : stringValue(glass.blur, '0px'),
    '--glass-opacity': preferences?.reducedTransparency ? '1' : numberValue(glass.opacity, 1),
    '--glass-border-opacity': numberValue(glass.borderOpacity, 0.16),

    '--motion-duration-fast': preferences?.reducedMotion ? '0ms' : stringValue(motion.durationFast, '120ms'),
    '--motion-duration-normal': preferences?.reducedMotion
      ? '0ms'
      : stringValue(motion.durationNormal, '220ms'),
    '--motion-easing': stringValue(motion.easing, 'cubic-bezier(.2,.8,.2,1)'),

    '--density-card-padding':
      preferences?.density === 'compact'
        ? '10px'
        : preferences?.density === 'spacious'
          ? '18px'
          : stringValue(density.cardPadding, '14px'),
    '--density-table-row-height':
      preferences?.density === 'compact'
        ? '34px'
        : preferences?.density === 'spacious'
          ? '48px'
          : stringValue(density.tableRowHeight, '42px'),
    '--layout-grid-gap': stringValue(layout.gridGap, '14px'),
    '--layout-sidebar-width': stringValue(layout.sidebarWidth, '280px'),
    '--chart-color-1': stringValue(charts.palette?.[0], stringValue(colors.primary, 'oklch(55% 0.14 220)')),
    '--chart-color-2': stringValue(charts.palette?.[1], stringValue(colors.secondary, 'oklch(62% 0.13 165)')),
    '--chart-color-3': stringValue(charts.palette?.[2], stringValue(colors.warning, 'oklch(74% 0.15 75)')),
    '--chart-color-4': stringValue(charts.palette?.[3], stringValue(colors.danger, 'oklch(58% 0.18 28)')),
  };
}

export function applyCssVariables(
  tokens: DesignTokens,
  preferences?: Partial<UserThemePreferences>,
  root: HTMLElement = document.documentElement
): void {
  const variables = tokensToCssVariables(tokens, preferences);
  Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.themeMode = String(tokens.colors?.mode || preferences?.preferredMode || 'system');
  root.dataset.density = preferences?.density || String(tokens.density?.interface || 'comfortable');
  root.dataset.highContrast = preferences?.highContrast ? 'true' : 'false';
  root.dataset.reducedMotion = preferences?.reducedMotion ? 'true' : 'false';
  root.dataset.reducedTransparency = preferences?.reducedTransparency ? 'true' : 'false';
}
