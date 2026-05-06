export type ThemeMode = 'system' | 'light' | 'dark';
export type InterfaceDensity = 'compact' | 'comfortable' | 'spacious';
export type FontScale = 'small' | 'medium' | 'large';

export type DesignTokens = {
  colors?: {
    mode?: 'light' | 'dark';
    primary?: string;
    secondary?: string;
    background?: string;
    surface?: string;
    card?: string;
    sidebar?: string;
    topbar?: string;
    text?: string;
    muted?: string;
    border?: string;
    success?: string;
    warning?: string;
    danger?: string;
    [key: string]: unknown;
  };
  typography?: {
    fontFamilyBase?: string;
    fontFamilyMono?: string;
    fontSizeBase?: string;
    fontWeightHeading?: number | string;
    [key: string]: unknown;
  };
  spacing?: Record<string, string | number>;
  radius?: {
    sm?: string;
    md?: string;
    lg?: string;
    xl?: string;
    [key: string]: unknown;
  };
  shadows?: {
    sm?: string;
    md?: string;
    lg?: string;
    [key: string]: unknown;
  };
  borders?: Record<string, string | number>;
  glass?: {
    enabled?: boolean;
    blur?: string;
    opacity?: number;
    borderOpacity?: number;
    [key: string]: unknown;
  };
  motion?: {
    durationFast?: string;
    durationNormal?: string;
    easing?: string;
    [key: string]: unknown;
  };
  density?: {
    cardPadding?: string;
    tableRowHeight?: string;
    interface?: InterfaceDensity;
    [key: string]: unknown;
  };
  charts?: {
    palette?: string[];
    grid?: string;
    [key: string]: unknown;
  };
  layout?: {
    shell?: string;
    gridGap?: string;
    sidebarWidth?: string;
    [key: string]: unknown;
  };
  components?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SystemTheme = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  tokensJson: DesignTokens;
  isSystemTheme: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TenantTheme = {
  id: string;
  tenantId: string;
  themeId: string;
  customTokensJson: DesignTokens;
  logoUrl?: string;
  faviconUrl?: string;
  displayName?: string;
  status: 'draft' | 'published';
  isActive: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type UserThemePreferences = {
  id: string;
  tenantId: string;
  userId: string;
  preferredMode: ThemeMode;
  density: InterfaceDensity;
  fontSize: FontScale;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  highContrast: boolean;
  customTokensJson: DesignTokens;
  defaultDashboardPeriod?: string;
  favoriteShortcuts?: string[];
  visibleTableColumns?: Record<string, string[]>;
  savedFilters?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type DashboardLayout = {
  id: string;
  tenantId: string;
  userId?: string;
  layoutJson: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DashboardWidget = {
  id: string;
  tenantId: string;
  userId?: string;
  widgetKey: string;
  position: number;
  size: 'sm' | 'md' | 'lg' | 'xl';
  visible: boolean;
  configJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ThemeBundle = {
  themes: SystemTheme[];
  activeTheme: SystemTheme;
  tenantTheme: TenantTheme;
  userPreferences: UserThemePreferences;
  dashboardLayout: DashboardLayout;
  dashboardWidgets: DashboardWidget[];
};
