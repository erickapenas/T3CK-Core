import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const tenantId = __ENV.TENANT_ID || 'tenant-demo';
const authToken = __ENV.AUTH_TOKEN || '';
const includeMutations = String(__ENV.INCLUDE_MUTATIONS || 'false').toLowerCase() === 'true';
const includeProvisioningSubmit =
  String(__ENV.INCLUDE_PROVISIONING_SUBMIT || 'false').toLowerCase() === 'true';
const provisioningStatusTenantId = __ENV.PROVISIONING_STATUS_TENANT_ID || tenantId;

const dashboardInitialLoadDuration = new Trend('dashboard_initial_load_duration', true);
const dashboardTabLoadDuration = new Trend('dashboard_tab_load_duration', true);
const dashboardMutationDuration = new Trend('dashboard_mutation_duration', true);
const dashboardRequests = new Counter('dashboard_requests');
const dashboardFailures = new Rate('dashboard_failures');

const scenarios = {
  dashboard_read_flow: {
    executor: 'ramping-vus',
    stages: [
      { duration: __ENV.RAMP_UP || '30s', target: Number(__ENV.READ_VUS || 10) },
      { duration: __ENV.STEADY_STATE || '2m', target: Number(__ENV.READ_VUS || 10) },
      { duration: __ENV.RAMP_DOWN || '30s', target: 0 },
    ],
    exec: 'dashboardReadFlow',
  },
};

if (includeMutations) {
  scenarios.dashboard_write_flow = {
    executor: 'constant-vus',
    vus: Number(__ENV.WRITE_VUS || 1),
    duration: __ENV.WRITE_DURATION || '1m',
    exec: 'dashboardWriteFlow',
  };
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    dashboard_failures: ['rate<0.02'],
    dashboard_initial_load_duration: ['p(95)<1200'],
    dashboard_tab_load_duration: ['p(95)<800'],
  },
};

export function setup() {
  const response = http.get(`${baseUrl}/health`, requestParams());

  if (response.status !== 200) {
    throw new Error(
      `Performance target is unavailable: GET ${baseUrl}/health returned ${response.status}. Start the API gateway or set BASE_URL.`
    );
  }
}

function headers(extra = {}) {
  const baseHeaders = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': tenantId,
    ...extra,
  };

  if (authToken) {
    baseHeaders.Authorization = `Bearer ${authToken}`;
  }

  return baseHeaders;
}

function trackResponse(name, response, expectedStatuses = [200]) {
  dashboardRequests.add(1, { endpoint: name });
  const ok = expectedStatuses.includes(response.status);
  dashboardFailures.add(!ok, { endpoint: name });

  check(response, {
    [`${name} status is expected`]: (res) => expectedStatuses.includes(res.status),
    [`${name} returns a body`]: (res) => res.status === 204 || Boolean(res.body),
  });

  return ok;
}

function requestParams(extraHeaders = {}) {
  return { headers: headers(extraHeaders), timeout: __ENV.REQUEST_TIMEOUT || '30s' };
}

function getCsrfToken() {
  const response = http.get(`${baseUrl}/api/csrf-token`, requestParams());
  trackResponse('csrf_token', response);

  const body = response.json();
  return body && body.csrfToken ? String(body.csrfToken) : '';
}

function timedBatch(metric, requests) {
  const startedAt = Date.now();
  const responses = http.batch(requests);
  metric.add(Date.now() - startedAt);
  return responses;
}

export function dashboardReadFlow() {
  group('dashboard initial load - optimized overview', () => {
    const responses = timedBatch(dashboardInitialLoadDuration, [
      ['GET', `${baseUrl}/api/v1/admin/overview`, null, requestParams()],
    ]);

    trackResponse('overview', responses[0]);
  });

  group('dashboard tab navigation - paginated lists', () => {
    const responses = timedBatch(dashboardTabLoadDuration, [
      ['GET', `${baseUrl}/api/v1/admin/products?page=1&limit=20`, null, requestParams()],
      ['GET', `${baseUrl}/api/v1/admin/orders?page=1&limit=20`, null, requestParams()],
      ['GET', `${baseUrl}/api/v1/admin/customers?page=1&limit=20`, null, requestParams()],
      ['GET', `${baseUrl}/api/v1/admin/audit-logs?page=1&limit=20`, null, requestParams()],
      [
        'GET',
        `${baseUrl}/api/v1/provisioning/${provisioningStatusTenantId}/status`,
        null,
        requestParams(),
      ],
    ]);

    ['tab_products', 'tab_orders', 'tab_customers', 'tab_audit_logs'].forEach((name, index) =>
      trackResponse(name, responses[index])
    );
    trackResponse('provisioning_status', responses[4], [200, 404]);
  });

  sleep(Number(__ENV.THINK_TIME_SECONDS || 1));
}

export function dashboardWriteFlow() {
  const csrfToken = getCsrfToken();
  const writeHeaders = requestParams({ 'X-CSRF-Token': csrfToken });

  group('dashboard mutations - optimized behavior', () => {
    const productSuffix = `${__VU}-${__ITER}-${Date.now()}`;
    const startedAt = Date.now();
    const productResponse = http.post(
      `${baseUrl}/api/v1/admin/products`,
      JSON.stringify({
        tenantId,
        name: `k6 Product ${productSuffix}`,
        sku: `K6-${productSuffix}`,
        price: 199,
        stock: 10,
        status: 'active',
      }),
      writeHeaders
    );
    dashboardMutationDuration.add(Date.now() - startedAt);
    trackResponse('create_product', productResponse, [201]);
  });

  if (includeProvisioningSubmit) {
    group('provisioning submit - destructive opt-in', () => {
      const suffix = `${__VU}-${__ITER}-${Date.now()}`;
      const startedAt = Date.now();
      const response = http.post(
        `${baseUrl}/api/v1/provisioning/submit`,
        JSON.stringify({
          tenantId: `k6-${suffix}`,
          domain: `k6-${suffix}.example.com`,
          companyName: `K6 Company ${suffix}`,
          adminEmail: `admin-${suffix}@example.com`,
          contactEmail: `contact-${suffix}@example.com`,
          contactName: `K6 Contact ${suffix}`,
          plan: 'starter',
          numberOfSeats: 5,
          billingCountry: 'BR',
          monthlyBudget: 100,
        }),
        writeHeaders
      );
      dashboardMutationDuration.add(Date.now() - startedAt);
      trackResponse('provisioning_submit', response, [201, 409]);
    });
  }

  sleep(Number(__ENV.WRITE_THINK_TIME_SECONDS || 2));
}
