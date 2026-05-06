import { FormEvent, useEffect, useState } from 'react';
import AdminDashboard from './AdminDashboard';
import {
  AdminSession,
  authApi,
  clearAdminSession,
  loadAdminSession,
  saveAdminSession,
} from './apiClient';
import { saveTenantSelection, loadTenantSelection } from './tenant-storage';
import { ThemeProvider } from './design-system/providers/ThemeProvider';

function LoginScreen({ onLogin }: { onLogin: (session: AdminSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await authApi.login(username, password);
      if (!result.success || !result.data?.token || !result.data?.user) {
        throw new Error(result.error || 'Login invalido');
      }

      const session = result.data as AdminSession;
      saveAdminSession(session);
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div>
          <h1>T3CK-Core</h1>
          <p>Atomic Control Grid v2026</p>
        </div>

        <label>
          Login
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="nome de usuario"
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="senha"
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<AdminSession | null>(() => loadAdminSession());
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState('tenant-demo');

  useEffect(() => {
    const loadTenant = async () => {
      if (!session) {
        setIsLoadingTenant(false);
        return;
      }

      if (session.user.role === 'usuario') {
        setSelectedTenant(session.user.tenantId);
        setIsLoadingTenant(false);
        return;
      }

      try {
        const tenant = await loadTenantSelection(session.user.tenantId || 'tenant-demo');
        setSelectedTenant(tenant);
      } catch (error) {
        console.error('Error loading tenant:', error);
        setSelectedTenant(session.user.tenantId || 'tenant-demo');
      } finally {
        setIsLoadingTenant(false);
      }
    };

    setIsLoadingTenant(true);
    loadTenant();
  }, [session]);

  useEffect(() => {
    if (!session || isLoadingTenant || session.user.role !== 'admin') {
      return;
    }

    saveTenantSelection(selectedTenant);
  }, [selectedTenant, isLoadingTenant, session]);

  const handleLogout = () => {
    clearAdminSession();
    setSession(null);
  };

  if (!session) {
    return (
      <ThemeProvider>
        <LoginScreen onLogin={setSession} />
      </ThemeProvider>
    );
  }

  if (isLoadingTenant) {
    return (
      <ThemeProvider tenantId={selectedTenant} currentUser={session.user}>
        <div className="login-shell">
          <div className="login-panel">Carregando preferencias...</div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider tenantId={selectedTenant} currentUser={session.user}>
      <AdminDashboard
        tenantId={selectedTenant}
        currentUser={session.user}
        onTenantChange={setSelectedTenant}
        onLogout={handleLogout}
      />
    </ThemeProvider>
  );
}
