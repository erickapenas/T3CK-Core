import React, { useState } from 'react';
import '../styles/CRUDCluster.css';
import { entityApi } from '../apiClient';

const DEFAULT_TENANT_ID = 'tenant-demo';

/**
 * Generate default payload based on entity type
 */
function getDefaultPayload(entity: string): Record<string, any> {
  const now = new Date().toISOString();
  const base = {
    tenantId: DEFAULT_TENANT_ID,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  switch (entity) {
    case 'products':
      return {
        ...base,
        name: `New Product ${Date.now()}`,
        sku: `SKU-${Date.now()}`,
        price: 99.99,
        stock: 100,
      };
    case 'orders':
      return {
        ...base,
        customerId: 'customer-001',
        items: [],
        total: 0,
        subtotal: 0,
        shippingCost: 0,
      };
    case 'users':
      return {
        ...base,
        email: `user-${Date.now()}@example.com`,
        name: `User ${Date.now()}`,
        role: 'viewer',
      };
    case 'customers':
      return {
        ...base,
        email: `customer-${Date.now()}@example.com`,
        name: `Customer ${Date.now()}`,
        phone: '+55 11 999999999',
      };
    default:
      return {
        ...base,
        name: `New ${entity} ${Date.now()}`,
      };
  }
}

export function CRUDCluster({ entity }) {
  const [operationResult, setOperationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionHistory, setActionHistory] = useState<any[]>([]);

  const handleCRUDOperation = async (operation: string) => {
    if (!entity) return;

    setLoading(true);

    try {
      const api = entityApi[entity as keyof typeof entityApi] as any;
      let result: any = null;

      switch (operation) {
        case 'create':
          const payload = getDefaultPayload(entity);
          result = await api.create?.(payload);
          break;

        case 'read':
          result = await api.list?.();
          break;

        case 'update':
          result = await api.list?.();
          if (result?.success && result.data[0]) {
            result = await api.update?.(result.data[0].id, {
              updatedAt: new Date().toISOString(),
              status: 'updated',
            });
          }
          break;

        case 'delete':
          result = await api.list?.();
          if (result?.success && result.data[0]) {
            result = await api.delete?.(result.data[0].id);
          }
          break;
      }

      const status = result?.success ? 'success' : 'error';
      const operationRecord = {
        op: operation,
        timestamp: new Date().toISOString(),
        status,
        resultId: `result_${Math.random().toString(36).substr(2, 9)}`,
        message: result?.error || 'Operation completed',
        responseTime: result?.responseTime || 0,
      };

      setOperationResult(operationRecord);
      setActionHistory(prev => [operationRecord, ...prev].slice(0, 10));

      setTimeout(() => setOperationResult(null), 5000);
    } catch (error) {
      const errorResult = {
        op: operation,
        timestamp: new Date().toISOString(),
        status: 'error',
        resultId: `result_${Math.random().toString(36).substr(2, 9)}`,
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: 0,
      };

      setOperationResult(errorResult);
      setActionHistory(prev => [errorResult, ...prev].slice(0, 10));

      setTimeout(() => setOperationResult(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const crudOperations = [
    {
      id: 'create',
      label: 'Create',
      icon: '✚',
      color: 'create',
      description: 'INSERT new entity',
    },
    {
      id: 'read',
      label: 'Read',
      icon: '📖',
      color: 'read',
      description: 'SELECT entity data',
    },
    {
      id: 'update',
      label: 'Update',
      icon: '✎',
      color: 'update',
      description: 'MODIFY entity',
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: '✕',
      color: 'delete',
      description: 'REMOVE entity',
    },
  ];

  return (
    <div className="crud-cluster">
      <div className="crud-buttons">
        {crudOperations.map(op => (
          <button
            key={op.id}
            className={`crud-btn crud-${op.color} ${!entity || loading ? 'disabled' : ''}`}
            onClick={() => handleCRUDOperation(op.id)}
            disabled={!entity || loading}
            title={op.description}
          >
            <span className="crud-icon">{loading && op.id === operationResult?.op ? '⟳' : op.icon}</span>
            <span className="crud-label">{op.label}</span>
          </button>
        ))}
      </div>

      {/* Operation Result */}
      {operationResult && (
        <div className={`operation-result result-${operationResult.status}`}>
          <div className="result-header">
            <span className="result-icon">{operationResult.status === 'success' ? '✓' : '✕'}</span>
            <span className="result-op">{operationResult.op.toUpperCase()}</span>
          </div>
          <div className="result-meta">
            <span className="mono">{operationResult.resultId}</span>
            <span className="response-time">{operationResult.responseTime}ms</span>
          </div>
          <div className="result-timestamp">
            {new Date(operationResult.timestamp).toLocaleTimeString()}
          </div>
          {operationResult.message && (
            <div className="result-message">{operationResult.message}</div>
          )}
        </div>
      )}

      {/* Batch Operations */}
      <div className="batch-section">
        <h4 className="section-title">Batch Operations</h4>
        <div className="batch-buttons">
          <button className="batch-btn" disabled={!entity || loading}>
            <span>📥</span> Import
          </button>
          <button className="batch-btn" disabled={!entity || loading}>
            <span>📤</span> Export
          </button>
          <button className="batch-btn" disabled={!entity || loading}>
            <span>🔄</span> Sync
          </button>
          <button className="batch-btn danger" disabled={!entity || loading}>
            <span>🗑️</span> Purge
          </button>
        </div>
      </div>

      {/* Action History */}
      <div className="history-section">
        <h4 className="section-title">Recent Actions</h4>
        <div className="history-list">
          {actionHistory.length === 0 ? (
            <div className="history-empty">
              <small>Nenhuma ação registrada</small>
            </div>
          ) : (
            actionHistory.map((item, idx) => (
              <div key={idx} className="history-item">
                <span className="history-time mono">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </span>
                <span className="history-action">
                  {item.op.toUpperCase()} {entity}
                </span>
                <span className={`history-status ${item.status}`}>
                  {item.status === 'success' ? '✓' : '✕'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
