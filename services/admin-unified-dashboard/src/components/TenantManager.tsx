import { useEffect, useMemo, useState } from 'react';
import '../styles/TenantManager.css';
import {
  FirestoreTenant,
  deleteTenantFromFirestore,
  listTenantsFromFirestore,
  saveTenantToFirestore,
} from '../tenant-storage';

type TenantFormState = Partial<FirestoreTenant>;

type TenantManagerProps = {
  onChange?: () => void;
};

const EMPTY_FORM: TenantFormState = {
  tenantId: '',
  companyName: '',
  domain: '',
  contactName: '',
  contactEmail: '',
  adminEmail: '',
  plan: 'starter',
  status: 'PENDING',
  numberOfSeats: 10,
  region: 'us-east-1',
  billingAddress: '',
  billingCountry: '',
  billingZipCode: '',
  monthlyBudget: 0,
};

export function TenantManager({ onChange }: TenantManagerProps) {
  const [tenants, setTenants] = useState<FirestoreTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [form, setForm] = useState<TenantFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadTenants = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listTenantsFromFirestore();
      setTenants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const filteredTenants = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tenants;

    return tenants.filter((tenant) => {
      return [tenant.id, tenant.tenantId, tenant.companyName, tenant.domain, tenant.contactEmail]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [search, tenants]);

  const handleFieldChange = (field: keyof TenantFormState, value: string | number) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleNew = () => {
    setSelectedTenantId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
    setError(null);
  };

  const handleEdit = (tenant: FirestoreTenant) => {
    setSelectedTenantId(tenant.id);
    setForm({
      ...EMPTY_FORM,
      ...tenant,
      tenantId: tenant.tenantId || tenant.id,
      adminEmail: tenant.adminEmail || '',
      billingAddress: tenant.billingAddress || '',
      billingCountry: tenant.billingCountry || '',
      billingZipCode: tenant.billingZipCode || '',
    });
    setMessage(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (!form.tenantId || !form.companyName || !form.domain || !form.contactName) {
        throw new Error('Tenant ID, company name, domain and contact name are required');
      }

      const saved = await saveTenantToFirestore({
        ...form,
        id: selectedTenantId || form.tenantId,
        tenantId: form.tenantId,
      } as FirestoreTenant);

      setSelectedTenantId(saved.id);
      setForm({
        ...EMPTY_FORM,
        ...saved,
        adminEmail: saved.adminEmail || '',
        billingAddress: saved.billingAddress || '',
        billingCountry: saved.billingCountry || '',
        billingZipCode: saved.billingZipCode || '',
      });
      setMessage('Tenant salvo no Firestore');
      await loadTenants();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar tenant');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tenantId: string) => {
    if (!window.confirm('Excluir este tenant do Firestore?')) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await deleteTenantFromFirestore(tenantId);
      if (selectedTenantId === tenantId) {
        handleNew();
      }
      setMessage('Tenant removido');
      await loadTenants();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir tenant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tenant-manager">
      <div className="tenant-manager-topbar">
        <div>
          <h3>Firestore Tenants</h3>
          <p>Criação, edição e leitura direta no Firebase.</p>
        </div>
        <div className="tenant-manager-actions">
          <input
            className="tenant-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tenant..."
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
          <h4>{selectedTenantId ? 'Editar tenant' : 'Criar tenant'}</h4>
          <div className="tenant-form-grid">
            <label>
              Tenant ID
              <input
                value={form.tenantId || ''}
                onChange={(e) => handleFieldChange('tenantId', e.target.value)}
              />
            </label>
            <label>
              Company name
              <input
                value={form.companyName || ''}
                onChange={(e) => handleFieldChange('companyName', e.target.value)}
              />
            </label>
            <label>
              Domain
              <input
                value={form.domain || ''}
                onChange={(e) => handleFieldChange('domain', e.target.value)}
              />
            </label>
            <label>
              Contact name
              <input
                value={form.contactName || ''}
                onChange={(e) => handleFieldChange('contactName', e.target.value)}
              />
            </label>
            <label>
              Contact email
              <input
                value={form.contactEmail || ''}
                onChange={(e) => handleFieldChange('contactEmail', e.target.value)}
              />
            </label>
            <label>
              Admin email
              <input
                value={form.adminEmail || ''}
                onChange={(e) => handleFieldChange('adminEmail', e.target.value)}
              />
            </label>
            <label>
              Plan
              <select
                value={form.plan || 'starter'}
                onChange={(e) => handleFieldChange('plan', e.target.value)}
              >
                <option value="starter">starter</option>
                <option value="growth">growth</option>
                <option value="enterprise">enterprise</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={form.status || 'PENDING'}
                onChange={(e) => handleFieldChange('status', e.target.value)}
              >
                <option value="PENDING">PENDING</option>
                <option value="PROVISIONING">PROVISIONING</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </label>
            <label>
              Seats
              <input
                type="number"
                value={form.numberOfSeats ?? 10}
                onChange={(e) => handleFieldChange('numberOfSeats', Number(e.target.value))}
              />
            </label>
            <label>
              Region
              <input
                value={form.region || ''}
                onChange={(e) => handleFieldChange('region', e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="tenant-list-card">
          <div className="tenant-list-header">
            <h4>Tenants ({filteredTenants.length})</h4>
            <button
              className="tenant-btn secondary"
              onClick={loadTenants}
              disabled={loading || saving}
            >
              Recarregar
            </button>
          </div>

          {loading ? (
            <div className="tenant-empty">Carregando tenants...</div>
          ) : filteredTenants.length === 0 ? (
            <div className="tenant-empty">Nenhum tenant encontrado</div>
          ) : (
            <div className="tenant-list">
              {filteredTenants.map((tenant) => (
                <article
                  key={tenant.id}
                  className={`tenant-row ${selectedTenantId === tenant.id ? 'active' : ''}`}
                >
                  <div className="tenant-row-main" onClick={() => handleEdit(tenant)}>
                    <div className="tenant-row-title">
                      <strong>{tenant.companyName || tenant.id}</strong>
                      <span
                        className={`tenant-badge status-${(tenant.status || 'PENDING').toLowerCase()}`}
                      >
                        {tenant.status || 'PENDING'}
                      </span>
                    </div>
                    <div className="tenant-row-meta">
                      <span>{tenant.domain || '-'}</span>
                      <span>{tenant.contactEmail || tenant.adminEmail || '-'}</span>
                      <span>{tenant.plan || '-'}</span>
                    </div>
                  </div>
                  <div className="tenant-row-actions">
                    <button className="tenant-btn secondary" onClick={() => handleEdit(tenant)}>
                      Editar
                    </button>
                    <button className="tenant-btn danger" onClick={() => handleDelete(tenant.id)}>
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
