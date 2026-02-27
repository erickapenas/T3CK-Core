import { useEffect, useMemo, useState } from 'react';
import { adminApi } from './api';
import { AnalyticsData, AuditLog, Customer, DashboardKpis, Order, Product, Settings, TabKey, TenantConfiguration, User } from './types';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'products', label: 'Products' },
  { key: 'orders', label: 'Orders' },
  { key: 'customers', label: 'Customers' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'settings', label: 'Settings' },
  { key: 'users', label: 'Users' },
  { key: 'audit', label: 'Audit Logs' },
];

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [error, setError] = useState<string>('');

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantConfiguration, setTenantConfiguration] = useState<TenantConfiguration | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [savingTenantConfig, setSavingTenantConfig] = useState(false);

  const refreshAll = async () => {
    try {
      setError('');
      const [dashboard, productData, orderData, customerData, settingsData, tenantConfigData, userData, logsData, analyticsData] =
        await Promise.all([
          adminApi.dashboard(),
          adminApi.products(),
          adminApi.orders(),
          adminApi.customers(),
          adminApi.settings(),
          adminApi.tenantConfiguration(),
          adminApi.users(),
          adminApi.auditLogs(),
          adminApi.analytics(),
        ]);

      setKpis(dashboard.kpis);
      setProducts(productData);
      setOrders(orderData);
      setCustomers(customerData);
      setSettings(settingsData);
      setTenantConfiguration(tenantConfigData);
      setUsers(userData);
      setAuditLogs(logsData);
      setAnalytics(analyticsData);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const revenueFormatted = useMemo(() => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpis?.revenue || 0);
  }, [kpis]);

  const createDemoProduct = async () => {
    try {
      await adminApi.createProduct({
        tenantId: 'tenant-demo',
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
      await adminApi.createOrder({
        tenantId: 'tenant-demo',
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
      await adminApi.createCustomer({
        tenantId: 'tenant-demo',
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
      await adminApi.createUser({
        tenantId: 'tenant-demo',
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

      const saved = await adminApi.updateTenantConfiguration({
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

  return (
    <div className="container">
      <div className="header">
        <div className="title">T3CK Admin Dashboard (React)</div>
        <button onClick={refreshAll}>Atualizar</button>
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

      {activeTab === 'dashboard' && (
        <div className="grid three">
          <div className="card"><div className="label">Revenue</div><div className="metric">{revenueFormatted}</div></div>
          <div className="card"><div className="label">Orders</div><div className="metric">{kpis?.orders || 0}</div></div>
          <div className="card"><div className="label">Customers</div><div className="metric">{kpis?.customers || 0}</div></div>
          <div className="card"><div className="label">Products</div><div className="metric">{kpis?.products || 0}</div></div>
          <div className="card"><div className="label">Avg Ticket</div><div className="metric">{kpis?.averageTicket?.toFixed(2) || '0.00'}</div></div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="card">
          <button onClick={createDemoProduct}>Adicionar produto demo</button>
          <table className="table">
            <thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead>
            <tbody>
              {products.map((item) => (
                <tr key={item.id}><td>{item.name}</td><td>{item.sku}</td><td>{item.price}</td><td>{item.stock}</td><td>{item.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="card">
          <button onClick={createDemoOrder}>Criar pedido demo</button>
          <table className="table">
            <thead><tr><th>ID</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map((item) => (
                <tr key={item.id}><td>{item.id}</td><td>{item.customerId}</td><td>{item.total}</td><td>{item.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="card">
          <button onClick={createDemoCustomer}>Adicionar cliente demo</button>
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Orders</th><th>Spent</th></tr></thead>
            <tbody>
              {customers.map((item) => (
                <tr key={item.id}><td>{item.name}</td><td>{item.email}</td><td>{item.totalOrders}</td><td>{item.totalSpent}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="grid two">
          <div className="card">
            <div className="label">Total Revenue</div>
            <div className="metric">{analytics?.sales?.totalRevenue || 0}</div>
          </div>
          <div className="card">
            <div className="label">Total Orders</div>
            <div className="metric">{analytics?.sales?.totalOrders || 0}</div>
          </div>
          <div className="card">
            <div className="label">Average Ticket</div>
            <div className="metric">{analytics?.sales?.averageTicket?.toFixed?.(2) || '0.00'}</div>
          </div>
          <div className="card">
            <div className="label">Repeat Rate</div>
            <div className="metric">{((analytics?.customerMetrics?.repeatRate || 0) * 100).toFixed(1)}%</div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && settings && (
        <div className="card">
          <div className="grid two" style={{ marginBottom: 16 }}>
            <div><div className="label">Currency</div><div>{settings.currency}</div></div>
            <div><div className="label">Timezone</div><div>{settings.timezone}</div></div>
            <div><div className="label">Low stock threshold</div><div>{settings.lowStockThreshold}</div></div>
            <div><div className="label">Notifications</div><div>{settings.notificationsEnabled ? 'On' : 'Off'}</div></div>
          </div>

          <h3 style={{ marginTop: 0 }}>Tenant Configuration</h3>
          {tenantConfiguration ? (
            <div className="grid two">
              <label>
                <div className="label">Display Name</div>
                <input
                  value={tenantConfiguration.displayName}
                  onChange={(event) => updateTenantConfigurationField('displayName', event.target.value)}
                />
              </label>

              <label>
                <div className="label">Support Email</div>
                <input
                  type="email"
                  value={tenantConfiguration.supportEmail}
                  onChange={(event) => updateTenantConfigurationField('supportEmail', event.target.value)}
                />
              </label>

              <label>
                <div className="label">Support Phone</div>
                <input
                  value={tenantConfiguration.supportPhone || ''}
                  onChange={(event) => updateTenantConfigurationField('supportPhone', event.target.value)}
                />
              </label>

              <label>
                <div className="label">Custom Domain</div>
                <input
                  value={tenantConfiguration.customDomain || ''}
                  onChange={(event) => updateTenantConfigurationField('customDomain', event.target.value)}
                />
              </label>

              <label>
                <div className="label">Locale</div>
                <input
                  value={tenantConfiguration.locale}
                  onChange={(event) => updateTenantConfigurationField('locale', event.target.value)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
                <input
                  type="checkbox"
                  checked={tenantConfiguration.maintenanceMode}
                  onChange={(event) => updateTenantConfigurationField('maintenanceMode', event.target.checked)}
                />
                Maintenance Mode
              </label>

              <div>
                <button onClick={saveTenantConfiguration} disabled={savingTenantConfig}>
                  {savingTenantConfig ? 'Salvando...' : 'Salvar Tenant Configuration'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="card">
          <button onClick={createDemoUser}>Adicionar usuário demo</button>
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}><td>{item.name}</td><td>{item.email}</td><td>{item.role}</td><td>{item.active ? 'Yes' : 'No'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="card">
          <table className="table">
            <thead><tr><th>When</th><th>Action</th><th>Resource</th><th>User</th></tr></thead>
            <tbody>
              {auditLogs.map((item) => (
                <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.action}</td><td>{item.resourceType}</td><td>{item.actorUserId}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
