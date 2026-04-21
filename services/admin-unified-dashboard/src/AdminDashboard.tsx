import { useEffect, useState } from 'react';
import './AdminDashboard.css';
import { SystemTree } from './components/SystemTree';
import { EntityCommandCenter } from './components/EntityCommandCenter';
import { StatusIndicators } from './components/StatusIndicators';
import { CRUDCluster } from './components/CRUDCluster';
import { TenantManager } from './components/TenantManager';
import { UserManager } from './components/UserManager';
import { ProductManager } from './components/ProductManager';
import { DashboardEntity, dashboardApi } from './apiClient';

type AdminDashboardProps = {
  tenantId: string;
};

const backendDependencies = [
  { name: 'API Gateway', detail: 'Routing, headers, auth and proxy fallback' },
  {
    name: 'Admin Service',
    detail: 'Analytics, dashboard metrics, orders, customers',
  },
  { name: 'Auth Service', detail: 'Login, sessions, JWT and access control' },
  { name: 'Webhook Service', detail: 'Webhook CRUD and delivery logs' },
  {
    name: 'Product/Order/Shipping/Payment services',
    detail: 'CRUD and business workflows outside tenants',
  },
];

function BackendDependencyPanel() {
  return (
    <div className="backend-deps">
      <h3>Backend Dependencies</h3>
      <p>Esses pontos ainda dependem de backend fora do Firestore.</p>
      <div className="backend-deps-list">
        {backendDependencies.map((item) => (
          <article key={item.name} className="backend-dep-item">
            <strong>{item.name}</strong>
            <span>{item.detail}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function FirestoreOnlyPanel() {
  return (
    <div className="backend-deps">
      <h3>Firestore Only</h3>
      <p>
        Users e products não dependem de backend. Tudo é salvo no Firestore com isolamento por
        tenant.
      </p>
      <div className="backend-deps-list">
        <article className="backend-dep-item">
          <strong>Users Collection</strong>
          <span>CRUD direto no Firestore com sync para a loja</span>
        </article>
        <article className="backend-dep-item">
          <strong>Products Collection</strong>
          <span>Schema multitenant com props dinâmicas, estoque e preço</span>
        </article>
      </div>
    </div>
  );
}

export default function AdminDashboard({ tenantId }: AdminDashboardProps) {
  const [systemStatus, setSystemStatus] = useState({
    dbConnected: true,
    syncStatus: 'in-sync',
    apiResponseTime: 0,
    activeSessions: 0,
    lastSync: new Date(),
  });

  const [selectedEntity, setSelectedEntity] = useState<DashboardEntity | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedPanes, setExpandedPanes] = useState({
    systemTree: true,
    commandCenter: true,
    statusIndicators: true,
  });

  // Fetch real-time metrics from API
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [healthRes, analyticsRes, logsRes] = await Promise.all([
          dashboardApi.getHealth(tenantId),
          dashboardApi.getAnalytics(tenantId),
          dashboardApi.getAuditLogs(1, tenantId),
        ]);

        // Extract response time - use only successful calls
        const times = [
          healthRes.responseTime,
          analyticsRes.responseTime,
          logsRes.responseTime,
        ].filter((t) => t > 0);
        const avgResponseTime =
          times.length > 0 ? Math.round(times.reduce((a, b) => a + b) / times.length) : 0;

        // Check if critical services are working (at least health must work)
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

    // Initial fetch
    fetchMetrics();

    // Update metrics every 5 seconds
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [tenantId]);

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="branding">
            <h1 className="logo">⚛️ T3CK-Core</h1>
            <span className="tagline">Atomic Control Grid v2026</span>
          </div>

          <StatusIndicators status={systemStatus} />
        </div>
      </header>

      {/* Main Grid Layout (Bento-Box) */}
      <main className="dashboard-main">
        {/* Left Pane: System Tree */}
        <aside className="pane pane-system-tree">
          <div className="pane-header">
            <h2>System Tree</h2>
            <button
              className="pane-toggle"
              onClick={() => setExpandedPanes((p) => ({ ...p, systemTree: !p.systemTree }))}
            >
              {expandedPanes.systemTree ? '−' : '+'}
            </button>
          </div>
          {expandedPanes.systemTree && (
            <SystemTree
              tenantId={tenantId}
              onSelectEntity={setSelectedEntity}
              selected={selectedEntity}
            />
          )}
        </aside>

        {/* Center Pane: Entity Command Center */}
        <section className="pane pane-command-center">
          <div className="pane-header">
            <h2>
              {selectedEntity === 'tenants'
                ? 'Tenant Control'
                : selectedEntity === 'users'
                  ? 'User Control'
                  : 'Entity Command Center'}
            </h2>
            <span className="entity-indicator">
              {selectedEntity === 'tenants'
                ? '🗄️ Firestore Tenants'
                : selectedEntity === 'users'
                  ? '🧑 Firestore Users'
                  : selectedEntity
                    ? `📦 ${selectedEntity}`
                    : '🔍 Select Entity'}
            </span>
          </div>
          {selectedEntity === 'tenants' ? (
            <TenantManager onChange={() => setRefreshKey((current) => current + 1)} />
          ) : selectedEntity === 'users' ? (
            <UserManager onChange={() => setRefreshKey((current) => current + 1)} />
          ) : selectedEntity === 'products' ? (
            <ProductManager
              tenantId={tenantId}
              onChange={() => setRefreshKey((current) => current + 1)}
            />
          ) : (
            <EntityCommandCenter
              entity={selectedEntity}
              tenantId={tenantId}
              refreshKey={refreshKey}
              systemStatus={systemStatus}
            />
          )}
        </section>

        {/* Right Pane: CRUD Operations */}
        <aside className="pane pane-crud">
          <div className="pane-header">
            <h2>
              {selectedEntity === 'tenants'
                ? 'Backend Dependencies'
                : selectedEntity === 'users'
                  ? 'Firestore Notes'
                  : 'CRUD Operations'}
            </h2>
            <button
              className="pane-toggle"
              onClick={() => setExpandedPanes((p) => ({ ...p, commandCenter: !p.commandCenter }))}
            >
              {expandedPanes.commandCenter ? '−' : '+'}
            </button>
          </div>
          {expandedPanes.commandCenter &&
            (selectedEntity === 'tenants' ? (
              <BackendDependencyPanel />
            ) : selectedEntity === 'users' || selectedEntity === 'products' ? (
              <FirestoreOnlyPanel />
            ) : (
              <CRUDCluster
                entity={selectedEntity}
                tenantId={tenantId}
                onMutationComplete={() => setRefreshKey((current) => current + 1)}
              />
            ))}
        </aside>
      </main>

      {/* Footer: Real-time Indicators */}
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
