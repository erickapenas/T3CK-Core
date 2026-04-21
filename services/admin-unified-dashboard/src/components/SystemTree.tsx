import { useEffect, useState } from 'react';
import '../styles/SystemTree.css';
import { DashboardEntity, getEntityCounts } from '../apiClient';

type SystemTreeProps = {
  tenantId: string;
  onSelectEntity: (entity: DashboardEntity) => void;
  selected: DashboardEntity | null;
};

export function SystemTree({ tenantId, onSelectEntity, selected }: SystemTreeProps) {
  const [entityCounts, setEntityCounts] = useState<Record<string, number>>({
    tenants: 0,
    users: 0,
    products: 0,
    orders: 0,
    logging: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const entities = [
    { id: 'tenants', label: '🏢 Tenants', icon: '📊' },
    { id: 'users', label: '👥 Users', icon: '👤' },
    { id: 'products', label: '📦 Products', icon: '🛍️' },
    { id: 'orders', label: '📋 Orders', icon: '🎫' },
    { id: 'logging', label: '📝 Logs', icon: '📋' },
  ];

  // Fetch entity counts on mount and every 30 seconds
  useEffect(() => {
    const fetchCounts = async () => {
      setLoading(true);
      const counts = await getEntityCounts(tenantId);
      setEntityCounts(counts);
      setLoading(false);
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [tenantId]);

  // Filter entities by search
  const filteredEntities = entities.filter(
    (entity) =>
      entity.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entity.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="system-tree">
      <div className="tree-search">
        <input
          type="text"
          placeholder="Search entities..."
          className="tree-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {loading && (
        <div className="tree-loading">
          <span className="loading-spinner">⟳</span>
          <span>Carregando...</span>
        </div>
      )}

      <ul className="tree-list">
        {filteredEntities.map((entity) => (
          <li
            key={entity.id}
            className={`tree-item ${selected === entity.id ? 'active' : ''}`}
            onClick={() => onSelectEntity(entity.id as DashboardEntity)}
          >
            <span className="tree-icon">{entity.icon}</span>
            <span className="tree-label">{entity.label}</span>
            <span className="tree-badge">{entityCounts[entity.id] || 0}</span>
          </li>
        ))}
      </ul>

      {filteredEntities.length === 0 && !loading && (
        <div className="tree-empty">
          <span>Nenhuma entidade encontrada</span>
        </div>
      )}
    </div>
  );
}
