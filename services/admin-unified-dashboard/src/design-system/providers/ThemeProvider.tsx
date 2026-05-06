import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AdminSessionUser, themeApi } from '../../apiClient';
import { applyCssVariables } from '../tokens/cssVariables';
import { mergeTokens, sanitizeClientTokens } from '../tokens/mergeTokens';
import {
  DesignTokens,
  TenantTheme,
  ThemeBundle,
  UserThemePreferences,
} from '../tokens/schema';
import { fallbackTheme, fallbackThemes } from '../tokens/systemThemes';

type ThemeContextValue = {
  bundle: ThemeBundle;
  resolvedTokens: DesignTokens;
  loading: boolean;
  error: string | null;
  previewTokens: DesignTokens;
  setPreviewTokens: (tokens: DesignTokens) => void;
  clearPreview: () => void;
  refreshTheme: () => Promise<void>;
  saveDraft: (updates: Partial<TenantTheme>) => Promise<void>;
  publishTheme: (updates?: Partial<TenantTheme>) => Promise<void>;
  resetTheme: () => Promise<void>;
  updateUserPreferences: (updates: Partial<UserThemePreferences>) => Promise<void>;
};

const defaultUserPreferences: UserThemePreferences = {
  id: 'local',
  tenantId: 'tenant-demo',
  userId: 'local',
  preferredMode: 'system',
  density: 'comfortable',
  fontSize: 'medium',
  reducedMotion: false,
  reducedTransparency: false,
  highContrast: false,
  customTokensJson: {},
  defaultDashboardPeriod: 'last30',
  favoriteShortcuts: ['dashboard', 'orders', 'integrations'],
  visibleTableColumns: {},
  savedFilters: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function makeFallbackBundle(tenantId = 'tenant-demo', userId = 'local'): ThemeBundle {
  return {
    themes: fallbackThemes,
    activeTheme: fallbackTheme,
    tenantTheme: {
      id: 'active',
      tenantId,
      themeId: fallbackTheme.id,
      customTokensJson: {},
      logoUrl: '',
      faviconUrl: '',
      displayName: 'T3CK-Core',
      status: 'published',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    userPreferences: {
      ...defaultUserPreferences,
      tenantId,
      userId,
    },
    dashboardLayout: {
      id: userId,
      tenantId,
      userId,
      layoutJson: { columns: 12 },
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    dashboardWidgets: [],
  };
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const cacheKey = (tenantId?: string, userId?: string) =>
  `t3ck-theme-bundle:${tenantId || 'local'}:${userId || 'local'}`;

export function ThemeProvider({
  tenantId,
  currentUser,
  children,
}: {
  tenantId?: string;
  currentUser?: AdminSessionUser;
  children: ReactNode;
}) {
  const userId = currentUser?.id || 'local';
  const [bundle, setBundle] = useState<ThemeBundle>(() => {
    try {
      const cached = localStorage.getItem(cacheKey(tenantId, userId));
      return cached ? (JSON.parse(cached) as ThemeBundle) : makeFallbackBundle(tenantId, userId);
    } catch {
      return makeFallbackBundle(tenantId, userId);
    }
  });
  const [previewTokens, setPreviewTokensState] = useState<DesignTokens>({});
  const [loading, setLoading] = useState(Boolean(tenantId && currentUser));
  const [error, setError] = useState<string | null>(null);

  const refreshTheme = useCallback(async () => {
    if (!tenantId || !currentUser) {
      setBundle(makeFallbackBundle(tenantId, userId));
      return;
    }

    setLoading(true);
    setError(null);
    const response = await themeApi.getBundle(tenantId);
    if (response.success && response.data) {
      setBundle(response.data as ThemeBundle);
      localStorage.setItem(cacheKey(tenantId, userId), JSON.stringify(response.data));
    } else {
      setError(response.error || 'Nao foi possivel carregar o tema.');
    }
    setLoading(false);
  }, [currentUser, tenantId, userId]);

  useEffect(() => {
    refreshTheme();
  }, [refreshTheme]);

  const resolvedTokens = useMemo(() => {
    const activeTheme = bundle.activeTheme || fallbackTheme;
    const activeSystem = bundle.themes.find((theme) => theme.id === bundle.tenantTheme.themeId);
    const userHighContrast = bundle.userPreferences.highContrast
      ? bundle.themes.find((theme) => theme.slug === 'high-contrast')
      : null;
    return mergeTokens(
      activeTheme.tokensJson,
      activeSystem?.tokensJson,
      userHighContrast?.tokensJson,
      bundle.tenantTheme.customTokensJson,
      bundle.userPreferences.customTokensJson,
      previewTokens
    );
  }, [bundle, previewTokens]);

  useEffect(() => {
    applyCssVariables(resolvedTokens, bundle.userPreferences);
    const title = bundle.tenantTheme.displayName || 'T3CK-Core';
    document.title = `${title} - Admin`;

    if (bundle.tenantTheme.faviconUrl) {
      const current =
        document.querySelector<HTMLLinkElement>('link[rel="icon"]') ||
        document.createElement('link');
      current.rel = 'icon';
      current.href = bundle.tenantTheme.faviconUrl;
      document.head.appendChild(current);
    }
  }, [bundle.tenantTheme.displayName, bundle.tenantTheme.faviconUrl, bundle.userPreferences, resolvedTokens]);

  const setPreviewTokens = useCallback((tokens: DesignTokens) => {
    setPreviewTokensState(sanitizeClientTokens(tokens));
  }, []);

  const clearPreview = useCallback(() => setPreviewTokensState({}), []);

  const saveDraft = useCallback(
    async (updates: Partial<TenantTheme>) => {
      if (!tenantId) return;
      const response = await themeApi.saveDraft(updates, tenantId);
      if (!response.success) throw new Error(response.error || 'Falha ao salvar rascunho.');
      await refreshTheme();
    },
    [refreshTheme, tenantId]
  );

  const publishTheme = useCallback(
    async (updates?: Partial<TenantTheme>) => {
      if (!tenantId) return;
      const response = await themeApi.publish(updates || {}, tenantId);
      if (!response.success) throw new Error(response.error || 'Falha ao publicar tema.');
      clearPreview();
      await refreshTheme();
    },
    [clearPreview, refreshTheme, tenantId]
  );

  const resetTheme = useCallback(async () => {
    if (!tenantId) return;
    const response = await themeApi.reset(tenantId);
    if (!response.success) throw new Error(response.error || 'Falha ao restaurar tema.');
    clearPreview();
    await refreshTheme();
  }, [clearPreview, refreshTheme, tenantId]);

  const updateUserPreferences = useCallback(
    async (updates: Partial<UserThemePreferences>) => {
      if (!tenantId) return;
      const optimistic = {
        ...bundle,
        userPreferences: { ...bundle.userPreferences, ...updates },
      };
      setBundle(optimistic);
      const response = await themeApi.updateUserPreferences(updates, tenantId);
      if (!response.success) throw new Error(response.error || 'Falha ao salvar preferencias.');
      await refreshTheme();
    },
    [bundle, refreshTheme, tenantId]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      bundle,
      resolvedTokens,
      loading,
      error,
      previewTokens,
      setPreviewTokens,
      clearPreview,
      refreshTheme,
      saveDraft,
      publishTheme,
      resetTheme,
      updateUserPreferences,
    }),
    [
      bundle,
      clearPreview,
      error,
      loading,
      previewTokens,
      publishTheme,
      refreshTheme,
      resetTheme,
      resolvedTokens,
      saveDraft,
      setPreviewTokens,
      updateUserPreferences,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
