import { useEffect, useState } from 'react';
import '../styles/SystemTree.css';
import { AdminSessionUser, DashboardEntity, getEntityCounts } from '../apiClient';

type SystemTreeProps = {
  tenantId: string;
  onSelectEntity: (entity: DashboardEntity) => void;
  selected: DashboardEntity | null;
  currentUser: AdminSessionUser;
};

const entities: Array<{
  id: DashboardEntity;
  label: string;
  icon: string;
  adminOnly?: boolean;
  permission?: string;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'D' },
  { id: 'tenants', label: 'Tenants', icon: 'T', adminOnly: true },
  { id: 'users', label: 'Users', icon: 'U', adminOnly: true },
  { id: 'customers', label: 'Clientes', icon: 'C' },
  { id: 'products', label: 'Produtos', icon: 'P', permission: 'visualizar_produtos' },
  { id: 'orders', label: 'Pedidos', icon: 'P', permission: 'visualizar_pedidos' },
  { id: 'fiscal-settings', label: 'Configuracoes Fiscais', icon: 'NF' },
  { id: 'integrations', label: 'Integração', icon: 'I' },
  { id: 'settings', label: 'Personalização Visual', icon: 'PX' },
  { id: 'tenant-config', label: 'Tenant Config', icon: 'TC', adminOnly: true },
  { id: 'migration', label: 'Migração', icon: 'M', adminOnly: true },
  { id: 'logging', label: 'Logs de Auditoria', icon: 'L', permission: 'visualizar_logs_auditoria' },
];

export function SystemTree({ tenantId, onSelectEntity, selected, currentUser }: SystemTreeProps) {
  const [entityCounts, setEntityCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredEntities = entities
    .filter((entity) => currentUser.role === 'admin' || !entity.adminOnly)
    .filter(
      (entity) =>
        !entity.permission ||
        currentUser.role === 'admin' ||
        Boolean(currentUser.permissions?.includes(entity.permission))
    )
    .filter(
      (entity) =>
        entity.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entity.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="system-tree">
      <div className="tree-search">
        <input
          type="text"
          placeholder="Buscar no admin-service..."
          className="tree-search-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      {loading && (
        <div className="tree-loading">
          <span className="loading-spinner">...</span>
          <span>Carregando...</span>
        </div>
      )}

      <ul className="tree-list">
        {filteredEntities.map((entity) => (
          <li
            key={entity.id}
            className={`tree-item ${selected === entity.id ? 'active' : ''}`}
            onClick={() => onSelectEntity(entity.id)}
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
