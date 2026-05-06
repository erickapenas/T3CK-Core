import { useEffect, useState } from 'react';
import '../styles/EntityCommandCenter.css';
import { DashboardEntity, getEntityService } from '../apiClient';

type EntityCommandCenterProps = {
  entity: DashboardEntity | null;
  tenantId: string;
  refreshKey: number;
  systemStatus: {
    dbConnected: boolean;
    syncStatus: string;
    apiResponseTime: number;
    activeSessions: number;
    lastSync: Date;
  };
};

export function EntityCommandCenter({
  entity,
  tenantId,
  refreshKey,
  systemStatus,
}: EntityCommandCenterProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [entityData, setEntityData] = useState<any>(null);
  const [entityList, setEntityList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState(0);

  // Fetch entity data when entity selection changes
  useEffect(() => {
    if (!entity) {
      setEntityData(null);
      setEntityList([]);
      setFormData({});
      setError(null);
      return;
    }

    const fetchEntityData = async () => {
      setLoading(true);
      setError(null);

      try {
        const service = getEntityService(entity as DashboardEntity) as any;
        const result = await service?.list?.(tenantId);

        if (result?.success && Array.isArray(result.data)) {
          const firstItem = result.data[0];
          setEntityList(result.data);
          setEntityData(firstItem);
          setFormData(firstItem || {});
          setResponseTime(result.responseTime || 0);
        } else if (result?.success && result.data && typeof result.data === 'object') {
          setEntityList([]);
          setEntityData(result.data);
          setFormData(result.data);
          setResponseTime(result.responseTime || 0);
        } else if (result?.error) {
          setError(result.error);
        } else {
          setEntityData(null);
          setEntityList([]);
          setError('Nenhum dado encontrado');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };

    fetchEntityData();
  }, [entity, tenantId, refreshKey]);

  if (!entity) {
    return (
      <div className="command-center-empty">
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <h3>Select an Entity</h3>
          <p>Choose from the System Tree to manage entities</p>
        </div>
      </div>
    );
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Determine entity icon based on type
  const getEntityIcon = () => {
    const icons = {
      dashboard: 'D',
      analytics: 'A',
      tenants: '🏢',
      users: '👥',
      products: '📦',
      orders: '📋',
      integrations: 'I',
      payments: '💳',
      webhooks: '🔗',
      logging: '📝',
      settings: 'S',
      'tenant-config': 'TC',
      cache: '⚡',
    };
    return icons[entity as keyof typeof icons] || '📦';
  };

  const getEntityTitle = () => {
    const titles = {
      tenants: 'Tenant',
      users: 'User',
      dashboard: 'Admin Dashboard',
      analytics: 'Analytics',
      products: 'Product',
      orders: 'Order',
      integrations: 'Integration',
      payments: 'Payment',
      webhooks: 'Webhook',
      logging: 'Log Entry',
      settings: 'Settings',
      'tenant-config': 'Tenant Config',
      cache: 'Cache Item',
    };
    return titles[entity as keyof typeof titles] || 'Entity';
  };

  return (
    <div className="command-center">
      {/* Entity Info */}
      <div className="entity-info">
        <div className="info-header">
          <h3 className="entity-name">
            {getEntityIcon()} {getEntityTitle()}
          </h3>
          <div className="info-meta">
            <span className="badge badge-primary">{entityData ? '✓ Active' : '○ Empty'}</span>
            <span className="badge badge-secondary">{responseTime}ms</span>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <span className="spinner">⟳</span>
          <p>Carregando dados...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="error-state">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {/* Data Input Fields */}
      {!loading && !error && (
        <>
          <div className="data-section">
            <h4 className="section-title">Data Schema</h4>

            <div className="form-grid">
              <div className="form-field">
                <label className="field-label">UUID / ID</label>
                <input
                  type="text"
                  placeholder="550e8400-e29b-41d4-a716-446655440000"
                  className="field-input mono"
                  value={formData.id || formData.uuid || ''}
                  onChange={(e) => handleInputChange('id', e.target.value)}
                  title="Universally Unique Identifier"
                />
              </div>

              <div className="form-field">
                <label className="field-label">Name / Title</label>
                <input
                  type="text"
                  placeholder="Enter name or title"
                  className="field-input"
                  value={formData.name || formData.title || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                />
              </div>

              <div className="form-field full-width">
                <label className="field-label">JSON Payload</label>
                <textarea
                  placeholder={`{
  "id": "uuid",
  "name": "entity_name",
  "status": "active",
  "metadata": {},
  "timestamp": "2026-04-07T00:00:00Z"
}`}
                  className="field-input mono"
                  rows={5}
                  value={formData.json || JSON.stringify(formData, null, 2)}
                  onChange={(e) => handleInputChange('json', e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="field-label">Status</label>
                <select
                  className="field-select"
                  value={formData.status || 'active'}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                >
                  <option value="active">✓ Active</option>
                  <option value="inactive">⊘ Inactive</option>
                  <option value="pending">⟳ Pending</option>
                  <option value="archived">✕ Archived</option>
                </select>
              </div>

              <div className="form-field">
                <label className="field-label">API Response Time</label>
                <div className="response-time-display">
                  {responseTime || systemStatus?.apiResponseTime || 0}
                  <span className="unit">ms</span>
                </div>
              </div>
            </div>
          </div>

          {/* Relational Chips */}
          <div className="relations-section">
            <h4 className="section-title">Relations</h4>
            <div className="chips-container">
              {entityData && entityData.tenantId && (
                <div className="chip chip-primary">
                  <span className="chip-icon">🔗</span>
                  tenant:{entityData.tenantId.slice(0, 6)}
                  <button className="chip-close">×</button>
                </div>
              )}
              {entityData && entityData.userId && (
                <div className="chip chip-secondary">
                  <span className="chip-icon">👤</span>
                  user:{entityData.userId.slice(0, 6)}
                  <button className="chip-close">×</button>
                </div>
              )}
              {entityData && entityData.customerId && (
                <div className="chip chip-tertiary">
                  <span className="chip-icon">🛍️</span>
                  customer:{entityData.customerId.slice(0, 6)}
                  <button className="chip-close">×</button>
                </div>
              )}
              <button className="chip-add">+ Add Relation</button>
            </div>
          </div>

          {/* Metadata Display */}
          <div className="metadata-section">
            <h4 className="section-title">Metadata</h4>
            <div className="metadata-grid">
              <div className="metadata-item">
                <span className="meta-key">created_at:</span>
                <span className="meta-value mono">
                  {formData.createdAt
                    ? new Date(formData.createdAt).toISOString()
                    : '2026-01-15T09:30:45.123Z'}
                </span>
              </div>
              <div className="metadata-item">
                <span className="meta-key">updated_at:</span>
                <span className="meta-value mono">
                  {formData.updatedAt
                    ? new Date(formData.updatedAt).toISOString()
                    : new Date().toISOString()}
                </span>
              </div>
              <div className="metadata-item">
                <span className="meta-key">version:</span>
                <span className="meta-value mono">{formData.version || 'v1.0.0'}</span>
              </div>
              <div className="metadata-item">
                <span className="meta-key">db_sync:</span>
                <span className="meta-value sync-status">✓ In Sync ({responseTime}ms)</span>
              </div>
            </div>
          </div>

          {entity === 'tenants' && entityList.length > 0 && (
            <div className="metadata-section">
              <h4 className="section-title">Tenants Loaded</h4>
              <div className="history-list">
                {entityList.slice(0, 10).map((tenant) => (
                  <div key={tenant.id} className="history-item">
                    <span className="history-action">{tenant.companyName || tenant.id}</span>
                    <span className="history-time mono">{tenant.domain || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
