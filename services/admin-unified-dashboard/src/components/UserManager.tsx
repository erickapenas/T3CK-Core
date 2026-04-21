import { useEffect, useMemo, useState } from 'react';
import '../styles/UserManager.css';
import {
  FirestoreTenant,
  FirestoreUser,
  deleteUserFromFirestore,
  listTenantsFromFirestore,
  listUsersFromFirestore,
  saveUserToFirestore,
  syncTenantContactFromUser,
} from '../tenant-storage';

type UserFormState = Partial<FirestoreUser>;

type UserManagerProps = {
  onChange?: () => void;
};

const EMPTY_FORM: UserFormState = {
  id: '',
  name: '',
  email: '',
  phone: '',
  status: 'pending',
  tenantId: null,
};

export function UserManager({ onChange }: UserManagerProps) {
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [tenants, setTenants] = useState<FirestoreTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [userData, tenantData] = await Promise.all([
        listUsersFromFirestore(),
        listTenantsFromFirestore(),
      ]);
      setUsers(userData);
      setTenants(tenantData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;

    return users.filter((user) => {
      return [user.id, user.name, user.email, user.phone, user.status, user.tenantId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [search, users]);

  const selectedTenant = useMemo(() => {
    return (
      tenants.find((tenant) => tenant.id === form.tenantId || tenant.tenantId === form.tenantId) ||
      null
    );
  }, [form.tenantId, tenants]);

  const handleFieldChange = (field: keyof UserFormState, value: string | number | null) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleNew = () => {
    setSelectedUserId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
    setError(null);
  };

  const handleEdit = (user: FirestoreUser) => {
    setSelectedUserId(user.id);
    setForm({
      ...EMPTY_FORM,
      ...user,
      tenantId: user.tenantId || null,
    });
    setMessage(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (!form.id || !form.name || !form.email || !form.phone) {
        throw new Error('ID, name, email and phone are required');
      }

      const saved = await saveUserToFirestore({
        ...form,
        id: selectedUserId || form.id,
        tenantId: form.tenantId || null,
      } as FirestoreUser);

      if (saved.tenantId) {
        await syncTenantContactFromUser(saved);
      }

      setSelectedUserId(saved.id);
      setForm({
        ...EMPTY_FORM,
        ...saved,
        tenantId: saved.tenantId || null,
      });
      setMessage(
        saved.tenantId ? 'User salvo e tenant relacionado atualizado' : 'User salvo no Firestore'
      );
      await loadData();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Excluir este user do Firestore?')) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await deleteUserFromFirestore(userId);
      if (selectedUserId === userId) {
        handleNew();
      }
      setMessage('User removido');
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
          <h3>Firestore Users</h3>
          <p>Criação, edição, listagem e relação direta com tenants.</p>
        </div>
        <div className="tenant-manager-actions">
          <input
            className="tenant-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar user..."
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
          <h4>{selectedUserId ? 'Editar user' : 'Criar user'}</h4>
          <div className="tenant-form-grid">
            <label>
              User ID
              <input
                value={form.id || ''}
                onChange={(e) => handleFieldChange('id', e.target.value)}
              />
            </label>
            <label>
              Name
              <input
                value={form.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                value={form.email || ''}
                onChange={(e) => handleFieldChange('email', e.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone || ''}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={form.status || 'pending'}
                onChange={(e) => handleFieldChange('status', e.target.value)}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="pending">pending</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="full-span">
              Tenant ID
              <input
                value={form.tenantId || ''}
                onChange={(e) => handleFieldChange('tenantId', e.target.value || null)}
                placeholder="tenant-uuid"
              />
            </label>
          </div>

          <div className="tenant-empty" style={{ marginTop: 12 }}>
            <strong>Tenant relation:</strong> o tenant é buscado automaticamente pelo `Tenant ID`.
            <div style={{ marginTop: 8 }}>
              {selectedTenant
                ? `Tenant encontrado: ${selectedTenant.companyName || selectedTenant.id}`
                : form.tenantId
                  ? 'Tenant não encontrado ainda'
                  : 'Nenhum tenant vinculado'}
            </div>
            <div style={{ marginTop: 8 }}>
              Ao salvar, `name` e `email` atualizam `contactName` e `contactEmail` da loja.
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
                      <strong>{user.name || user.id}</strong>
                      <span
                        className={`tenant-badge status-${(user.status || 'pending').toLowerCase()}`}
                      >
                        {user.status || 'pending'}
                      </span>
                    </div>
                    <div className="tenant-row-meta">
                      <span>{user.email || '-'}</span>
                      <span>{user.phone || '-'}</span>
                      <span>{user.tenantId || 'no-tenant'}</span>
                    </div>
                  </div>
                  <div className="tenant-row-actions">
                    <button className="tenant-btn secondary" onClick={() => handleEdit(user)}>
                      Editar
                    </button>
                    <button className="tenant-btn danger" onClick={() => handleDelete(user.id)}>
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
