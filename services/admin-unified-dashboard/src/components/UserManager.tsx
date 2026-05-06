import { useEffect, useMemo, useState } from 'react';
import '../styles/UserManager.css';
import { AdminSessionUser, entityApi } from '../apiClient';
import { FirestoreTenant, listTenantsFromFirestore } from '../tenant-storage';

type UserRole = 'admin' | 'usuario';

type AdminUserRecord = {
  id: string;
  tenantId: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  permissions?: string[];
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type UserFormState = Partial<AdminUserRecord> & {
  password?: string;
};

type UserManagerProps = {
  tenantId: string;
  currentUser: AdminSessionUser;
  onChange?: () => void;
};

const EMPTY_FORM: UserFormState = {
  id: '',
  tenantId: '',
  username: '',
  password: '',
  name: '',
  email: '',
  role: 'usuario',
  active: true,
  permissions: [],
};

const USER_PERMISSIONS = [
  { id: 'visualizar_configuracoes_fiscais', label: 'Ver fiscal' },
  { id: 'editar_configuracoes_fiscais', label: 'Editar fiscal' },
  { id: 'upload_certificado_fiscal', label: 'Certificado' },
  { id: 'validar_configuracao_fiscal', label: 'Validar fiscal' },
  { id: 'visualizar_logs_fiscais', label: 'Logs fiscais' },
  { id: 'visualizar_pedidos', label: 'Ver pedidos' },
  { id: 'editar_pedidos', label: 'Editar pedidos' },
  { id: 'emitir_nota_fiscal', label: 'Emitir NF' },
  { id: 'cancelar_nota_fiscal', label: 'Cancelar NF' },
  { id: 'visualizar_xml', label: 'XML' },
  { id: 'visualizar_danfe', label: 'DANFE' },
  { id: 'gerenciar_estoque', label: 'Estoque' },
  { id: 'atualizar_rastreio', label: 'Rastreio' },
  { id: 'visualizar_logs', label: 'Logs' },
];

export function UserManager({ tenantId, currentUser, onChange }: UserManagerProps) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [tenants, setTenants] = useState<FirestoreTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>({ ...EMPTY_FORM, tenantId });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [userResult, tenantData] = await Promise.all([
        entityApi.users.list(tenantId),
        listTenantsFromFirestore(),
      ]);

      if (!userResult.success) {
        throw new Error(userResult.error || 'Erro ao carregar users');
      }

      setUsers(Array.isArray(userResult.data) ? userResult.data : []);
      setTenants(tenantData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;

    return users.filter((user) =>
      [user.id, user.username, user.name, user.email, user.role, user.tenantId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [search, users]);

  const selectedTenant = useMemo(() => {
    return (
      tenants.find((tenant) => tenant.id === form.tenantId || tenant.tenantId === form.tenantId) ||
      null
    );
  }, [form.tenantId, tenants]);

  const handleFieldChange = (
    field: keyof UserFormState,
    value: string | boolean | null
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const togglePermission = (permission: string) => {
    setForm((current) => {
      const permissions = new Set(current.permissions || []);
      if (permissions.has(permission)) {
        permissions.delete(permission);
      } else {
        permissions.add(permission);
      }
      return { ...current, permissions: Array.from(permissions) };
    });
  };

  const handleNew = () => {
    setSelectedUserId(null);
    setForm({ ...EMPTY_FORM, tenantId });
    setMessage(null);
    setError(null);
  };

  const handleEdit = (user: AdminUserRecord) => {
    setSelectedUserId(user.id);
    setForm({
      ...EMPTY_FORM,
      ...user,
      password: '',
    });
    setMessage(null);
    setError(null);
  };

  const buildPayload = () => {
    if (!form.username || !form.name || !form.email || !form.tenantId) {
      throw new Error('Username, name, email e tenant sao obrigatorios');
    }

    if (!selectedUserId && !form.password) {
      throw new Error('Senha e obrigatoria para criar usuario');
    }

    if (form.role === 'usuario' && !form.tenantId) {
      throw new Error('Usuarios do tipo Usuario precisam de tenant');
    }

    const payload: Record<string, unknown> = {
      tenantId: form.tenantId,
      username: form.username,
      name: form.name,
      email: form.email,
      role: form.role || 'usuario',
      permissions: form.role === 'admin' ? [] : form.permissions || [],
      active: form.active ?? true,
    };

    if (form.password) {
      payload.password = form.password;
    }

    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload = buildPayload();
      const targetTenant = String(payload.tenantId || tenantId);
      const result = selectedUserId
        ? await entityApi.users.update(selectedUserId, payload, targetTenant)
        : await entityApi.users.create(payload, targetTenant);

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar user');
      }

      const saved = result.data as AdminUserRecord;
      setSelectedUserId(saved.id);
      setForm({ ...EMPTY_FORM, ...saved, password: '' });
      setMessage('Usuario salvo pelo admin-service');
      await loadData();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: AdminUserRecord) => {
    if (user.id === currentUser.id) {
      setError('Voce nao pode excluir o proprio usuario logado');
      return;
    }

    if (!window.confirm('Excluir este usuario do admin-service?')) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const result = await entityApi.users.delete(user.id, user.tenantId || tenantId);
      if (!result.success) {
        throw new Error(result.error || 'Erro ao excluir user');
      }

      if (selectedUserId === user.id) {
        handleNew();
      }
      setMessage('Usuario removido');
      await loadData();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tenant-manager">
      <div className="tenant-manager-topbar">
        <div>
          <h3>Admin Service Users</h3>
          <p>Usuarios de acesso ao dashboard com perfil Admin ou Usuario.</p>
        </div>
        <div className="tenant-manager-actions">
          <input
            className="tenant-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar usuario..."
          />
          <button className="tenant-btn secondary" onClick={handleNew} disabled={saving}>
            Novo
          </button>
          <button className="tenant-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {(error || message) && (
        <div className={`tenant-banner ${error ? 'error' : 'success'}`}>{error || message}</div>
      )}

      <div className="tenant-manager-grid">
        <section className="tenant-form-card">
          <h4>{selectedUserId ? 'Editar usuario' : 'Criar usuario'}</h4>
          <div className="tenant-form-grid">
            <label>
              Username
              <input
                value={form.username || ''}
                onChange={(event) => handleFieldChange('username', event.target.value)}
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={form.password || ''}
                onChange={(event) => handleFieldChange('password', event.target.value)}
                placeholder={selectedUserId ? 'deixe em branco para manter' : 'senha inicial'}
              />
            </label>
            <label>
              Name
              <input
                value={form.name || ''}
                onChange={(event) => handleFieldChange('name', event.target.value)}
              />
            </label>
            <label>
              Email
              <input
                value={form.email || ''}
                onChange={(event) => handleFieldChange('email', event.target.value)}
              />
            </label>
            <label>
              Tipo
              <select
                value={form.role || 'usuario'}
                onChange={(event) => handleFieldChange('role', event.target.value as UserRole)}
              >
                <option value="admin">Admin</option>
                <option value="usuario">Usuario</option>
              </select>
            </label>
            <label>
              Ativo
              <select
                value={String(form.active ?? true)}
                onChange={(event) => handleFieldChange('active', event.target.value === 'true')}
              >
                <option value="true">Sim</option>
                <option value="false">Nao</option>
              </select>
            </label>
            <label className="full-span">
              Tenant ID
              <input
                value={form.tenantId || ''}
                onChange={(event) => handleFieldChange('tenantId', event.target.value || null)}
                placeholder="tenant-uuid"
              />
            </label>
            <div className="full-span user-permissions-box">
              <strong>Permissoes do usuario</strong>
              <div className="user-permissions-grid">
                {USER_PERMISSIONS.map((permission) => (
                  <label key={permission.id}>
                    <input
                      type="checkbox"
                      checked={(form.permissions || []).includes(permission.id)}
                      disabled={form.role === 'admin'}
                      onChange={() => togglePermission(permission.id)}
                    />
                    {permission.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="tenant-empty" style={{ marginTop: 12 }}>
            <strong>Acesso:</strong> Admin acessa todos os tenants. Usuario acessa somente o tenant
            informado.
            <div style={{ marginTop: 8 }}>
              {selectedTenant
                ? `Tenant encontrado: ${selectedTenant.companyName || selectedTenant.id}`
                : form.tenantId
                  ? 'Tenant nao encontrado ainda'
                  : 'Informe um tenant para usuario comum'}
            </div>
          </div>
        </section>

        <section className="tenant-list-card">
          <div className="tenant-list-header">
            <h4>Users ({filteredUsers.length})</h4>
            <button
              className="tenant-btn secondary"
              onClick={loadData}
              disabled={loading || saving}
            >
              Recarregar
            </button>
          </div>

          {loading ? (
            <div className="tenant-empty">Carregando users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="tenant-empty">Nenhum user encontrado</div>
          ) : (
            <div className="tenant-list">
              {filteredUsers.map((user) => (
                <article
                  key={user.id}
                  className={`tenant-row ${selectedUserId === user.id ? 'active' : ''}`}
                >
                  <div className="tenant-row-main" onClick={() => handleEdit(user)}>
                    <div className="tenant-row-title">
                      <strong>{user.name || user.username}</strong>
                      <span className={`tenant-badge status-${user.role}`}>
                        {user.role === 'admin' ? 'Admin' : 'Usuario'}
                      </span>
                    </div>
                    <div className="tenant-row-meta">
                      <span>{user.username || '-'}</span>
                      <span>{user.email || '-'}</span>
                      <span>{user.tenantId || 'no-tenant'}</span>
                      <span>{user.role === 'admin' ? 'full-access' : `${user.permissions?.length || 0} perms`}</span>
                    </div>
                  </div>
                  <div className="tenant-row-actions">
                    <button className="tenant-btn secondary" onClick={() => handleEdit(user)}>
                      Editar
                    </button>
                    <button className="tenant-btn danger" onClick={() => handleDelete(user)}>
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
