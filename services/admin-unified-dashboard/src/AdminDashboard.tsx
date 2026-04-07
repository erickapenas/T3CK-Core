import React, { useState, useEffect } from 'react';
import './AdminDashboard.css';
import { SystemTree } from './components/SystemTree';
import { EntityCommandCenter } from './components/EntityCommandCenter';
import { StatusIndicators } from './components/StatusIndicators';
import { CRUDCluster } from './components/CRUDCluster';
import { dashboardApi } from './apiClient';

export default function AdminDashboard() {
  const [systemStatus, setSystemStatus] = useState({
    dbConnected: true,
    syncStatus: 'in-sync',
    apiResponseTime: 0,
    activeSessions: 0,
    lastSync: new Date(),
  });

  const [selectedEntity, setSelectedEntity] = useState(null);
  const [expandedPanes, setExpandedPanes] = useState({
    systemTree: true,
    commandCenter: true,
    statusIndicators: true,
  });

  const [loading, setLoading] = useState(true);

  // Fetch real-time metrics from API
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [healthRes, analyticsRes, logsRes] = await Promise.all([
          dashboardApi.getHealth(),
          dashboardApi.getAnalytics(),
          dashboardApi.getAuditLogs(1),
        ]);

        // Extract response time - use only successful calls
        const times = [
          healthRes.responseTime,
          analyticsRes.responseTime,
          logsRes.responseTime,
        ].filter(t => t > 0);
        const avgResponseTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b) / times.length) : 0;

        // Check if critical services are working (at least health must work)
        const isHealthy = healthRes.success;
        const isSynced = isHealthy && (analyticsRes.success || logsRes.success);

        setSystemStatus(prev => ({
          ...prev,
          dbConnected: isHealthy,
          apiResponseTime: avgResponseTime,
          syncStatus: isSynced ? 'in-sync' : 'sync-error',
          lastSync: new Date(),
          activeSessions: analyticsRes?.data?.sessions || 0,
        }));

        setLoading(false);
      } catch (error) {
        console.error('Error fetching metrics:', error);
        setSystemStatus(prev => ({
          ...prev,
          dbConnected: false,
          syncStatus: 'sync-error',
        }));
        setLoading(false);
      }
    };

    // Initial fetch
    fetchMetrics();

    // Update metrics every 5 seconds
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

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
              onClick={() => setExpandedPanes(p => ({...p, systemTree: !p.systemTree}))}
            >
              {expandedPanes.systemTree ? '−' : '+'}
            </button>
          </div>
          {expandedPanes.systemTree && (
            <SystemTree onSelectEntity={setSelectedEntity} selected={selectedEntity} />
          )}
        </aside>

        {/* Center Pane: Entity Command Center */}
        <section className="pane pane-command-center">
          <div className="pane-header">
            <h2>Entity Command Center</h2>
            <span className="entity-indicator">
              {selectedEntity ? `📦 ${selectedEntity}` : '🔍 Select Entity'}
            </span>
          </div>
          <EntityCommandCenter entity={selectedEntity} systemStatus={systemStatus} />
        </section>

        {/* Right Pane: CRUD Operations */}
        <aside className="pane pane-crud">
          <div className="pane-header">
            <h2>CRUD Operations</h2>
            <button
              className="pane-toggle"
              onClick={() => setExpandedPanes(p => ({...p, commandCenter: !p.commandCenter}))}
            >
              {expandedPanes.commandCenter ? '−' : '+'}
            </button>
          </div>
          {expandedPanes.commandCenter && (
            <CRUDCluster entity={selectedEntity} />
          )}
        </aside>
      </main>

      {/* Footer: Real-time Indicators */}
      <footer className="dashboard-footer">
        <div className="footer-indicator">
          <span className={`status-dot ${systemStatus.dbConnected ? 'connected' : 'disconnected'}`}></span>
          <small>DB: {systemStatus.dbConnected ? 'Connected' : 'Disconnected'}</small>
        </div>
        <div className="footer-indicator">
          <span className={`status-pulse ${systemStatus.syncStatus === 'in-sync' ? 'syncing' : ''}`}></span>
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
