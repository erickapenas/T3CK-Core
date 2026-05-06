import { useEffect, useState } from 'react';
import './AdminDashboard.css';
import { SystemTree } from './components/SystemTree';
import { EntityCommandCenter } from './components/EntityCommandCenter';
import { StatusIndicators } from './components/StatusIndicators';
import { TenantManager } from './components/TenantManager';
import { UserManager } from './components/UserManager';
import { ProductsPage } from './components/ProductsPage';
import { IntegrationManager } from './components/IntegrationManager';
import { FiscalSettingsPage } from './components/FiscalSettingsPage';
import { OrdersPage } from './components/OrdersPage';
import { EcommerceDashboardPage } from './components/EcommerceDashboardPage';
import { SettingsPage } from './components/SettingsPage';
import { CustomersPage } from './components/CustomersPage';
import { AuditLogsPage } from './components/AuditLogsPage';
import { AdminSessionUser, DashboardEntity, dashboardApi } from './apiClient';
import { useTheme } from './design-system/providers/ThemeProvider';

type AdminDashboardProps = {
  tenantId: string;
  currentUser: AdminSessionUser;
  onTenantChange: (tenantId: string) => void;
  onLogout: () => void;
};

function titleForEntity(entity: DashboardEntity | null): string {
  if (entity === 'dashboard' || entity === 'analytics') return 'E-commerce Dashboard';
  if (entity === 'tenants') return 'Tenant Control';
  if (entity === 'users') return 'User Control';
  if (entity === 'customers') return 'Clientes';
  if (entity === 'products') return 'Produtos';
  if (entity === 'logging') return 'Logs de Auditoria';
  if (entity === 'integrations') return 'Integration Control';
  if (entity === 'fiscal-settings') return 'Fiscal Control';
  if (entity === 'orders') return 'Pedidos';
  if (entity === 'settings') return 'Visual Settings';
  return 'Entity Control';
}

function indicatorForEntity(entity: DashboardEntity | null): string {
  if (entity === 'dashboard' || entity === 'analytics') return 'Analytics';
  if (entity === 'tenants') return 'Firestore Tenants';
  if (entity === 'users') return 'Firestore Users';
  if (entity === 'products') return 'Catalogo e Estoque';
  if (entity === 'orders') return 'Operacao de Pedidos';
  if (entity === 'logging') return 'Audit Trail';
  if (entity) return entity;
  return 'Select Entity';
}

export default function AdminDashboard({
  tenantId,
  currentUser,
  onTenantChange,
  onLogout,
}: AdminDashboardProps) {
  const [systemStatus, setSystemStatus] = useState({
    dbConnected: true,
    syncStatus: 'in-sync',
    apiResponseTime: 0,
    activeSessions: 0,
    lastSync: new Date(),
  });
  const [selectedEntity, setSelectedEntity] = useState<DashboardEntity | null>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedPanes, setExpandedPanes] = useState({ systemTree: true });
  const { bundle } = useTheme();

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [healthRes, analyticsRes, logsRes] = await Promise.all([
          dashboardApi.getHealth(tenantId),
          dashboardApi.getAnalytics(tenantId),
          dashboardApi.getAuditLogs(1, tenantId),
        ]);
        const times = [healthRes.responseTime, analyticsRes.responseTime, logsRes.responseTime].filter(
          (time) => time > 0
        );
        const avgResponseTime = times.length
          ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length)
          : 0;
        const isHealthy = healthRes.success;
        const isSynced = isHealthy && (analyticsRes.success || logsRes.success);

        setSystemStatus((prev) => ({
          ...prev,
          dbConnected: isHealthy,
          apiResponseTime: avgResponseTime,
          syncStatus: isSynced ? 'in-sync' : 'sync-error',
          lastSync: new Date(),
          activeSessions: analyticsRes?.data?.sessions || 0,
        }));
      } catch (error) {
        console.error('Error fetching metrics:', error);
        setSystemStatus((prev) => ({
          ...prev,
          dbConnected: false,
          syncStatus: 'sync-error',
        }));
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, [tenantId]);

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="branding">
            {bundle.tenantTheme.logoUrl ? (
              <img className="tenant-logo" src={bundle.tenantTheme.logoUrl} alt="" />
            ) : null}
            <h1 className="logo">{bundle.tenantTheme.displayName || 'T3CK-Core'}</h1>
            <span className="tagline">Adaptive Control Grid v2027</span>
          </div>

          <div className="session-panel">
            <div>
              <strong>{currentUser.name || currentUser.username}</strong>
              <span>
                {currentUser.role === 'admin' ? 'Admin' : `Usuario - ${currentUser.tenantId}`}
              </span>
            </div>
            {currentUser.role === 'admin' && (
              <input
                value={tenantId}
                onChange={(event) => onTenantChange(event.target.value)}
                aria-label="Tenant ativo"
              />
            )}
            <button onClick={onLogout}>Sair</button>
          </div>

          <StatusIndicators status={systemStatus} />
        </div>
      </header>

      <main className="dashboard-main">
        <aside className="pane pane-system-tree">
          <div className="pane-header">
            <h2>System Tree</h2>
            <button
              className="pane-toggle"
              onClick={() => setExpandedPanes((current) => ({ systemTree: !current.systemTree }))}
            >
              {expandedPanes.systemTree ? '-' : '+'}
            </button>
          </div>
          {expandedPanes.systemTree && (
            <SystemTree
              tenantId={tenantId}
              onSelectEntity={setSelectedEntity}
              selected={selectedEntity}
              currentUser={currentUser}
            />
          )}
        </aside>

        <section className="pane pane-command-center">
          <div className="pane-header">
            <h2>{titleForEntity(selectedEntity)}</h2>
            <span className="entity-indicator">{indicatorForEntity(selectedEntity)}</span>
          </div>

          {selectedEntity === 'dashboard' || selectedEntity === 'analytics' ? (
            <EcommerceDashboardPage tenantId={tenantId} onOpenOrders={() => setSelectedEntity('orders')} />
          ) : selectedEntity === 'tenants' ? (
            <TenantManager onChange={() => setRefreshKey((current) => current + 1)} />
          ) : selectedEntity === 'users' ? (
            <UserManager
              tenantId={tenantId}
              currentUser={currentUser}
              onChange={() => setRefreshKey((current) => current + 1)}
            />
          ) : selectedEntity === 'products' ? (
            <ProductsPage
              tenantId={tenantId}
              currentUser={currentUser}
              onChange={() => setRefreshKey((current) => current + 1)}
            />
          ) : selectedEntity === 'integrations' ? (
            <IntegrationManager
              tenantId={tenantId}
              currentUser={currentUser}
              onChange={() => setRefreshKey((current) => current + 1)}
            />
          ) : selectedEntity === 'fiscal-settings' ? (
            <FiscalSettingsPage
              tenantId={tenantId}
              onChange={() => setRefreshKey((current) => current + 1)}
            />
          ) : selectedEntity === 'orders' ? (
            <OrdersPage
              tenantId={tenantId}
              currentUser={currentUser}
              onOpenFiscalSettings={() => setSelectedEntity('fiscal-settings')}
              onOpenCustomers={() => setSelectedEntity('customers')}
              onOpenProducts={() => setSelectedEntity('products')}
              onChange={() => setRefreshKey((current) => current + 1)}
            />
          ) : selectedEntity === 'customers' ? (
            <CustomersPage
              tenantId={tenantId}
              currentUser={currentUser}
              onOpenOrders={() => setSelectedEntity('orders')}
            />
          ) : selectedEntity === 'logging' ? (
            <AuditLogsPage tenantId={tenantId} currentUser={currentUser} />
          ) : selectedEntity === 'settings' ? (
            <SettingsPage tenantId={tenantId} currentUser={currentUser} />
          ) : (
            <EntityCommandCenter
              entity={selectedEntity}
              tenantId={tenantId}
              refreshKey={refreshKey}
              systemStatus={systemStatus}
            />
          )}
        </section>
      </main>

      <footer className="dashboard-footer">
        <div className="footer-indicator">
          <span
            className={`status-dot ${systemStatus.dbConnected ? 'connected' : 'disconnected'}`}
          ></span>
          <small>DB: {systemStatus.dbConnected ? 'Connected' : 'Disconnected'}</small>
        </div>
        <div className="footer-indicator">
          <span
            className={`status-pulse ${systemStatus.syncStatus === 'in-sync' ? 'syncing' : ''}`}
          ></span>
          <small>Sync: {systemStatus.syncStatus === 'in-sync' ? 'In Sync' : 'Error'}</small>
        </div>
        <div className="footer-indicator">
          <small>API: {systemStatus.apiResponseTime}ms</small>
        </div>
        <div className="footer-indicator">
          <small>Sessions: {systemStatus.activeSessions}</small>
        </div>
        <div className="footer-indicator">
          <small>Last: {systemStatus.lastSync.toLocaleTimeString()}</small>
        </div>
      </footer>
    </div>
  );
}
