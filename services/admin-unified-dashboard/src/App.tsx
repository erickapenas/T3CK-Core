import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, getTenantId, setTenantId, unifiedApi } from './api';
import {
  AuditLog,
  Customer,
  DashboardKpis,
  Order,
  Product,
  ProvisioningTenant,
  Settings,
  TabKey,
  TenantConfiguration,
  User,
} from './types';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'provisioning', label: 'Provisioning' },
  { key: 'products', label: 'Products' },
  { key: 'orders', label: 'Orders' },
  { key: 'customers', label: 'Customers' },
  { key: 'users', label: 'Users' },
  { key: 'settings', label: 'Settings' },
  { key: 'audit', label: 'Audit' },
  { key: 'docs', label: 'API Docs' },
  { key: 'observability', label: 'Observability' },
];

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [error, setError] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState(getTenantId());

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantConfiguration, setTenantConfiguration] = useState<TenantConfiguration | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [provisionedTenants, setProvisionedTenants] = useState<ProvisioningTenant[]>([]);

  const [savingTenantConfig, setSavingTenantConfig] = useState(false);
  const [provisioningStatus, setProvisioningStatus] = useState('');

  const [provisionForm, setProvisionForm] = useState({
    tenantId: '',
    domain: '',
    companyName: '',
    adminEmail: '',
    contactEmail: '',
    contactName: '',
    plan: 'starter',
    numberOfSeats: '',
    billingAddress: '',
    billingCountry: 'BR',
    billingZipCode: '',
    monthlyBudget: '',
  });

  const refreshAll = async () => {
    try {
      setError('');
      const [nextKpis, nextProducts, nextOrders, nextCustomers, nextUsers, nextSettings, nextTenantConfig, nextAudit, nextProvisioned] =
        await Promise.all([
          unifiedApi.dashboard(),
          unifiedApi.products(),
          unifiedApi.orders(),
          unifiedApi.customers(),
          unifiedApi.users(),
          unifiedApi.settings(),
          unifiedApi.tenantConfiguration(),
          unifiedApi.auditLogs(),
          unifiedApi.provisioningTenants(),
        ]);

      setKpis(nextKpis);
      setProducts(nextProducts);
      setOrders(nextOrders);
      setCustomers(nextCustomers);
      setUsers(nextUsers);
      setSettings(nextSettings);
      setTenantConfiguration(nextTenantConfig);
      setAuditLogs(nextAudit);
      setProvisionedTenants(nextProvisioned);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    setTenantId(selectedTenantId);
    refreshAll();
  }, [selectedTenantId]);

  const availableTenantIds = useMemo(() => {
    const ids = new Set<string>(['tenant-demo', selectedTenantId]);
    provisionedTenants.forEach((tenant) => ids.add(tenant.id));
    return Array.from(ids);
  }, [provisionedTenants, selectedTenantId]);

  const revenueFormatted = useMemo(() => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpis?.revenue || 0);
  }, [kpis]);

  const createDemoProduct = async () => {
    try {
      await unifiedApi.createProduct({
        tenantId: selectedTenantId,
        name: `Produto ${Date.now().toString().slice(-4)}`,
        sku: `SKU-${Date.now().toString().slice(-4)}`,
        price: 199,
        stock: 10,
        status: 'active',
      });
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createDemoOrder = async () => {
    try {
      const customerId = customers[0]?.id;
      if (!customerId) return;
      await unifiedApi.createOrder({
        tenantId: selectedTenantId,
        customerId,
        total: 250,
        status: 'pending',
        items: [{ productId: products[0]?.id || 'demo', quantity: 1, price: 250 }],
      });
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createDemoCustomer = async () => {
    try {
      await unifiedApi.createCustomer({
        tenantId: selectedTenantId,
        name: `Cliente ${Date.now().toString().slice(-4)}`,
        email: `cliente${Date.now().toString().slice(-4)}@example.com`,
      });
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createDemoUser = async () => {
    try {
      await unifiedApi.createUser({
        tenantId: selectedTenantId,
        name: `Usuário ${Date.now().toString().slice(-4)}`,
        email: `user${Date.now().toString().slice(-4)}@t3ck.com`,
        role: 'manager',
        active: true,
      });
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updateTenantConfigurationField = <K extends keyof TenantConfiguration>(
    field: K,
    value: TenantConfiguration[K]
  ) => {
    if (!tenantConfiguration) return;
    setTenantConfiguration({ ...tenantConfiguration, [field]: value });
  };

  const saveTenantConfiguration = async () => {
    if (!tenantConfiguration) return;

    try {
      setSavingTenantConfig(true);
      setError('');
      const saved = await unifiedApi.updateTenantConfiguration({
        displayName: tenantConfiguration.displayName,
        supportEmail: tenantConfiguration.supportEmail,
        supportPhone: tenantConfiguration.supportPhone,
        customDomain: tenantConfiguration.customDomain,
        locale: tenantConfiguration.locale,
        maintenanceMode: tenantConfiguration.maintenanceMode,
      });
      setTenantConfiguration(saved);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingTenantConfig(false);
    }
  };

  const submitProvisioning = async () => {
    try {
      setError('');
      setProvisioningStatus('Submitting provisioning request...');

      const normalizedTenantId = provisionForm.tenantId.trim().toLowerCase();
      const normalizedDomain = provisionForm.domain.trim().toLowerCase();
      const normalizedCompanyName = provisionForm.companyName.trim();
      const normalizedContactName = provisionForm.contactName.trim();
      const normalizedPlan = provisionForm.plan.trim();
      const normalizedAdminEmail = provisionForm.adminEmail.trim().toLowerCase();
      const normalizedContactEmail = (provisionForm.contactEmail.trim() || normalizedAdminEmail).toLowerCase();

      if (normalizedTenantId.length < 3) {
        throw new Error('Tenant ID deve ter pelo menos 3 caracteres.');
      }

      if (!/^[a-z0-9-]+$/.test(normalizedTenantId)) {
        throw new Error('Tenant ID deve conter apenas letras minúsculas, números e hífen.');
      }

      if (!normalizedDomain || !/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(normalizedDomain)) {
        throw new Error('Domain inválido. Exemplo: loja-exemplo.com');
      }

      if (!normalizedCompanyName) {
        throw new Error('Company Name é obrigatório.');
      }

      if (!normalizedContactName) {
        throw new Error('Contact Name é obrigatório.');
      }

      if (!normalizedPlan) {
        throw new Error('Plan é obrigatório.');
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContactEmail)) {
        throw new Error('Contact Email inválido.');
      }

      const parsedSeats = provisionForm.numberOfSeats.trim() ? Number(provisionForm.numberOfSeats.trim()) : undefined;
      const parsedMonthlyBudget = provisionForm.monthlyBudget.trim() ? Number(provisionForm.monthlyBudget.trim()) : undefined;

      if (parsedSeats !== undefined && (!Number.isFinite(parsedSeats) || parsedSeats < 1)) {
        throw new Error('Seats deve ser um número maior que zero.');
      }

      if (parsedMonthlyBudget !== undefined && (!Number.isFinite(parsedMonthlyBudget) || parsedMonthlyBudget < 0)) {
        throw new Error('Monthly Budget deve ser um número maior ou igual a zero.');
      }

      const payload = {
        ...provisionForm,
        tenantId: normalizedTenantId,
        domain: normalizedDomain,
        companyName: normalizedCompanyName,
        contactName: normalizedContactName,
        plan: normalizedPlan,
        adminEmail: normalizedAdminEmail || undefined,
        contactEmail: normalizedContactEmail,
        numberOfSeats: parsedSeats,
        monthlyBudget: parsedMonthlyBudget,
      };

      await unifiedApi.submitProvisioning(payload);
      setProvisioningStatus('Provisioning request submitted successfully.');
      setSelectedTenantId(normalizedTenantId);
      setProvisionForm({
        tenantId: '',
        domain: '',
        companyName: '',
        adminEmail: '',
        contactEmail: '',
        contactName: '',
        plan: 'starter',
        numberOfSeats: '',
        billingAddress: '',
        billingCountry: 'BR',
        billingZipCode: '',
        monthlyBudget: '',
      });
      await refreshAll();
    } catch (err) {
      setProvisioningStatus('');
      setError((err as Error).message);
    }
  };

  const refreshProvisioningStatus = async (tenantId: string) => {
    try {
      const status = await unifiedApi.provisioningStatus(tenantId);
      const text = typeof status.message === 'string' ? status.message : JSON.stringify(status);
      setProvisioningStatus(`Tenant ${tenantId}: ${text}`);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="title">T3CK Unified Admin Panel</div>
          <div className="subtitle">Single administrative panel (gateway-only)</div>
        </div>
        <div className="tenant-switcher">
          <div className="label">Tenant ativo</div>
          <select value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)}>
            {availableTenantIds.map((tenantId) => (
              <option key={tenantId} value={tenantId}>{tenantId}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="error">Erro: {error}</div> : null}

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid three">
          <div className="card"><div className="label">Revenue</div><div className="metric">{revenueFormatted}</div></div>
          <div className="card"><div className="label">Orders</div><div className="metric">{kpis?.orders || 0}</div></div>
          <div className="card"><div className="label">Customers</div><div className="metric">{kpis?.customers || 0}</div></div>
          <div className="card"><div className="label">Products</div><div className="metric">{kpis?.products || 0}</div></div>
          <div className="card"><div className="label">Avg Ticket</div><div className="metric">{kpis?.averageTicket?.toFixed(2) || '0.00'}</div></div>
          <div className="card"><div className="label">Provisioned Tenants</div><div className="metric">{provisionedTenants.length}</div></div>
        </div>
      )}

      {activeTab === 'provisioning' && (
        <div className="grid two">
          <div className="card">
            <h3 className="section-title">New Tenant Provisioning</h3>
            <div className="grid">
              <input placeholder="Tenant ID (ex: loja-exemplo)" value={provisionForm.tenantId} onChange={(event) => setProvisionForm({ ...provisionForm, tenantId: event.target.value })} />
              <input placeholder="Domain" value={provisionForm.domain} onChange={(event) => setProvisionForm({ ...provisionForm, domain: event.target.value })} />
              <input placeholder="Company Name" value={provisionForm.companyName} onChange={(event) => setProvisionForm({ ...provisionForm, companyName: event.target.value })} />
              <input placeholder="Admin Email" type="email" value={provisionForm.adminEmail} onChange={(event) => setProvisionForm({ ...provisionForm, adminEmail: event.target.value })} />
              <input placeholder="Contact Email" type="email" value={provisionForm.contactEmail} onChange={(event) => setProvisionForm({ ...provisionForm, contactEmail: event.target.value })} />
              <input placeholder="Contact Name" value={provisionForm.contactName} onChange={(event) => setProvisionForm({ ...provisionForm, contactName: event.target.value })} />
              <select value={provisionForm.plan} onChange={(event) => setProvisionForm({ ...provisionForm, plan: event.target.value })}>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <input placeholder="Seats (ex: 50)" value={provisionForm.numberOfSeats} onChange={(event) => setProvisionForm({ ...provisionForm, numberOfSeats: event.target.value })} />
              <input placeholder="Billing Address" value={provisionForm.billingAddress} onChange={(event) => setProvisionForm({ ...provisionForm, billingAddress: event.target.value })} />
              <input placeholder="Billing Country" value={provisionForm.billingCountry} onChange={(event) => setProvisionForm({ ...provisionForm, billingCountry: event.target.value })} />
              <input placeholder="ZIP Code" value={provisionForm.billingZipCode} onChange={(event) => setProvisionForm({ ...provisionForm, billingZipCode: event.target.value })} />
              <input placeholder="Monthly Budget (ex: 0)" value={provisionForm.monthlyBudget} onChange={(event) => setProvisionForm({ ...provisionForm, monthlyBudget: event.target.value })} />
              <button className="btn-primary" onClick={submitProvisioning}>Provision Tenant</button>
            </div>
            {provisioningStatus ? <p className="status-note">{provisioningStatus}</p> : null}
          </div>

          <div className="card">
            <h3 className="section-title">Provisioned Tenants</h3>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>ID</th><th>Company</th><th>Domain</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {provisionedTenants.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.companyName}</td>
                      <td>{item.domain}</td>
                      <td><span className="badge">{item.status}</span></td>
                      <td><button className="secondary" onClick={() => refreshProvisioningStatus(item.id)}>Refresh status</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="card">
          <button className="btn-primary" onClick={createDemoProduct}>Adicionar produto demo</button>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead>
              <tbody>{products.map((item) => (<tr key={item.id}><td>{item.name}</td><td>{item.sku}</td><td>{item.price}</td><td>{item.stock}</td><td><span className="badge">{item.status}</span></td></tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="card">
          <button className="btn-primary" onClick={createDemoOrder}>Criar pedido demo</button>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ID</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>{orders.map((item) => (<tr key={item.id}><td>{item.id}</td><td>{item.customerId}</td><td>{item.total}</td><td><span className="badge">{item.status}</span></td></tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="card">
          <button className="btn-primary" onClick={createDemoCustomer}>Adicionar cliente demo</button>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Orders</th><th>Spent</th></tr></thead>
              <tbody>{customers.map((item) => (<tr key={item.id}><td>{item.name}</td><td>{item.email}</td><td>{item.totalOrders}</td><td>{item.totalSpent}</td></tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="card">
          <button className="btn-primary" onClick={createDemoUser}>Adicionar usuário demo</button>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead>
              <tbody>{users.map((item) => (<tr key={item.id}><td>{item.name}</td><td>{item.email}</td><td>{item.role}</td><td><span className="badge">{item.active ? 'Yes' : 'No'}</span></td></tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'settings' && settings && (
        <div className="card">
          <div className="grid two section-gap">
            <div className="mini-card"><div className="label">Currency</div><div>{settings.currency}</div></div>
            <div className="mini-card"><div className="label">Timezone</div><div>{settings.timezone}</div></div>
            <div className="mini-card"><div className="label">Low stock threshold</div><div>{settings.lowStockThreshold}</div></div>
            <div className="mini-card"><div className="label">Notifications</div><div>{settings.notificationsEnabled ? 'On' : 'Off'}</div></div>
          </div>

          <h3 className="section-title">Tenant Configuration</h3>
          {tenantConfiguration ? (
            <div className="grid two">
              <label><div className="label">Display Name</div><input value={tenantConfiguration.displayName} onChange={(event) => updateTenantConfigurationField('displayName', event.target.value)} /></label>
              <label><div className="label">Support Email</div><input type="email" value={tenantConfiguration.supportEmail} onChange={(event) => updateTenantConfigurationField('supportEmail', event.target.value)} /></label>
              <label><div className="label">Support Phone</div><input value={tenantConfiguration.supportPhone || ''} onChange={(event) => updateTenantConfigurationField('supportPhone', event.target.value)} /></label>
              <label><div className="label">Custom Domain</div><input value={tenantConfiguration.customDomain || ''} onChange={(event) => updateTenantConfigurationField('customDomain', event.target.value)} /></label>
              <label><div className="label">Locale</div><input value={tenantConfiguration.locale} onChange={(event) => updateTenantConfigurationField('locale', event.target.value)} /></label>
              <label className="checkbox-row">
                <input type="checkbox" checked={tenantConfiguration.maintenanceMode} onChange={(event) => updateTenantConfigurationField('maintenanceMode', event.target.checked)} />
                Maintenance Mode
              </label>
              <div><button className="btn-primary" onClick={saveTenantConfiguration} disabled={savingTenantConfig}>{savingTenantConfig ? 'Salvando...' : 'Salvar Tenant Configuration'}</button></div>
            </div>
          ) : null}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Action</th><th>Resource</th><th>User</th></tr></thead>
              <tbody>{auditLogs.map((item) => (<tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.action}</td><td>{item.resourceType}</td><td>{item.actorUserId}</td></tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'docs' && (
        <div className="card links">
          <a className="mini-card" href={`${API_BASE_URL}/api-docs-all`} target="_blank" rel="noreferrer">Unified Swagger (Gateway)</a>
          <a className="mini-card" href={`${API_BASE_URL}/api-docs-all.json`} target="_blank" rel="noreferrer">Unified Swagger JSON</a>
          <a className="mini-card" href={`${API_BASE_URL}/api/v1/provisioning`} target="_blank" rel="noreferrer">Provisioning API via Gateway</a>
          <a className="mini-card" href={`${API_BASE_URL}/api/v1/admin`} target="_blank" rel="noreferrer">Admin API via Gateway</a>
        </div>
      )}

      {activeTab === 'observability' && (
        <div className="card links">
          <a className="mini-card" href="https://console.aws.amazon.com/cloudwatch/" target="_blank" rel="noreferrer">CloudWatch Dashboards</a>
          <a className="mini-card" href="https://grafana.com/" target="_blank" rel="noreferrer">Grafana</a>
          <a className="mini-card" href="https://sentry.io/" target="_blank" rel="noreferrer">Sentry</a>
        </div>
      )}
    </div>
  );
}
