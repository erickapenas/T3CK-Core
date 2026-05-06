const http = require('http');

const PORT = Number(process.env.MOCK_GATEWAY_PORT || 3999);
const TENANT_ID = 'tenant-demo';
const now = () => new Date().toISOString();

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

const page = (items) => ({
  items,
  pagination: {
    page: 1,
    limit: 20,
    total: items.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
});

const products = Array.from({ length: 20 }, (_, index) => ({
  id: `prd_${index + 1}`,
  tenantId: TENANT_ID,
  name: `Product ${index + 1}`,
  sku: `SKU-${index + 1}`,
  price: 100 + index,
  stock: 50 - index,
  status: 'active',
}));

const customers = Array.from({ length: 20 }, (_, index) => ({
  id: `cus_${index + 1}`,
  tenantId: TENANT_ID,
  name: `Customer ${index + 1}`,
  email: `customer${index + 1}@example.com`,
  totalOrders: index + 1,
  totalSpent: (index + 1) * 100,
}));

const orders = Array.from({ length: 20 }, (_, index) => ({
  id: `ord_${index + 1}`,
  tenantId: TENANT_ID,
  customerId: customers[index]?.id || 'cus_1',
  total: 200 + index,
  status: index % 3 === 0 ? 'completed' : 'pending',
}));

const auditLogs = Array.from({ length: 20 }, (_, index) => ({
  id: `audit_${index + 1}`,
  action: 'dashboard.viewed',
  actorUserId: 'system',
  resourceType: 'dashboard',
  createdAt: now(),
}));

const overview = {
  dashboard: {
    kpis: {
      revenue: 123456,
      orders: 1200,
      customers: 340,
      products: 85,
      averageTicket: 102.88,
    },
  },
  products: page(products),
  orders: page(orders),
  customers: page(customers),
  users: page([]),
  settings: {
    tenantId: TENANT_ID,
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    notificationsEnabled: true,
    lowStockThreshold: 5,
  },
  tenantConfiguration: {
    tenantId: TENANT_ID,
    displayName: 'Tenant Demo',
    supportEmail: 'support@example.com',
    locale: 'pt-BR',
    maintenanceMode: false,
  },
  auditLogs: page(auditLogs),
  provisioningTenants: [],
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { status: 'healthy', service: 'mock-dashboard-gateway' });
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/admin/overview') {
    return json(res, 200, { data: overview });
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/admin/products') {
    return json(res, 200, { data: page(products) });
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/admin/orders') {
    return json(res, 200, { data: page(orders) });
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/admin/customers') {
    return json(res, 200, { data: page(customers) });
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/admin/audit-logs') {
    return json(res, 200, { data: page(auditLogs) });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/v1/provisioning/')) {
    return json(res, 200, {
      data: { tenantId: TENANT_ID, status: 'ready', message: 'Mock ready' },
    });
  }

  return json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  process.send?.({ type: 'ready', port: PORT });
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
