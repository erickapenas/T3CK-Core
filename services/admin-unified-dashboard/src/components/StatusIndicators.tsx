import '../styles/StatusIndicators.css';

type StatusIndicatorsProps = {
  status: {
    dbConnected: boolean;
    syncStatus: string;
    apiResponseTime: number;
    activeSessions: number;
    lastSync: Date;
  };
};

export function StatusIndicators({ status }: StatusIndicatorsProps) {
  return (
    <div className="status-indicators">
      {/* Database Connection */}
      <div className={`indicator ${status.dbConnected ? 'connected' : 'disconnected'}`}>
        <div className="indicator-dot"></div>
        <span className="indicator-label">Database</span>
        <span className="indicator-value">{status.dbConnected ? 'Connected' : 'Offline'}</span>
      </div>

      {/* Sync Status */}
      <div className={`indicator ${status.syncStatus === 'in-sync' ? 'synced' : 'syncing'}`}>
        <div
          className={`indicator-dot ${status.syncStatus === 'in-sync' ? 'pulse' : 'spinning'}`}
        ></div>
        <span className="indicator-label">Sync</span>
        <span className="indicator-value">{status.syncStatus}</span>
      </div>

      {/* API Response Time */}
      <div className="indicator response-time">
        <span className="indicator-label">API</span>
        <span className="indicator-value mono">{status.apiResponseTime}ms</span>
      </div>

      {/* Active Sessions */}
      <div className="indicator sessions">
        <span className="indicator-label">Sessions</span>
        <span className="indicator-value">{status.activeSessions} active</span>
      </div>

      {/* Last Sync */}
      <div className="indicator last-sync">
        <span className="indicator-label">Last Sync</span>
        <span className="indicator-value mono">{status.lastSync.toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
