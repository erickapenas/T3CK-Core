# Performance Current State

Date: 2026-04-27

## Scope

This document captures the measured current state before applying the optimization roadmap.

## Tooling

- Node.js: v25.2.1
- pnpm: 8.15.0
- k6: v1.7.1
- Platform: Windows local development environment

## Frontend Build Metrics

### Admin Dashboard

Command:

```bash
pnpm --filter @t3ck/admin-dashboard build
```

Result:

- Status: passed
- Build time: 449ms
- Modules transformed: 32
- `index.html`: 0.42 kB, gzip 0.29 kB
- CSS: 1.21 kB, gzip 0.56 kB
- JS: 153.65 kB, gzip 48.34 kB

### Admin Unified Dashboard

Command:

```bash
pnpm --filter @t3ck/admin-unified-dashboard build
```

Result:

- Status: passed
- Build time: 460ms
- Modules transformed: 32
- `index.html`: 0.42 kB, gzip 0.28 kB
- CSS: 3.43 kB, gzip 1.25 kB
- JS: 160.90 kB, gzip 50.43 kB

## Request Flow Metrics

### Admin Dashboard

Source:

- `services/admin-dashboard/src/App.tsx`
- `services/admin-dashboard/src/api.ts`

Current behavior:

- Initial load calls `refreshAll()` once on mount.
- Initial load performs 2 parallel API calls: one aggregated overview request plus analytics.
- The dashboard now calls `http://localhost:3000` by default through the API gateway.
- Unsafe mutations use the gateway CSRF token endpoint before `POST`, `PUT`, and `DELETE`.
- Mutations update only the affected local state after successful writes.

Initial load calls:

- `/api/v1/admin/overview`
- `/api/v1/admin/analytics`

Gateway routes after standardization:

- `/api/v1/admin/dashboard`
- `/api/v1/admin/products`
- `/api/v1/admin/orders`
- `/api/v1/admin/customers`
- `/api/v1/admin/settings`
- `/api/v1/admin/tenant-config`
- `/api/v1/admin/users`
- `/api/v1/admin/audit-logs`
- `/api/v1/admin/analytics`

Mutation amplification:

- Create product: 1 write + local product/KPI state update
- Create order: 1 write + local order/KPI state update
- Create customer: 1 write + local customer/KPI state update
- Create user: 1 write + local user state update
- Save tenant config: 1 write + local tenant configuration update

### Admin Unified Dashboard

Source:

- `services/admin-unified-dashboard/src/App.tsx`
- `services/admin-unified-dashboard/src/api.ts`

Current behavior:

- Initial load calls `refreshAll()` when `selectedTenantId` changes, including initial mount.
- Initial load performs 1 aggregated overview API call.
- Calls go through `http://localhost:3000` by default.
- Mutations fetch CSRF token when needed and update only the affected local state.

Initial load calls:

- `/api/v1/admin/overview`

Mutation amplification:

- First unsafe request: 1 CSRF request + 1 write + local state update
- Later unsafe requests with cached CSRF token: 1 write + local state update
- Provisioning submit: 1 CSRF request if not cached + 1 submit + local provisioning list update
- Provisioning status refresh: 1 status read + local status message update

## k6 Baseline

Script:

```bash
tests/performance/k6-admin-dashboard.js
```

Stable local profile:

```powershell
$env:READ_VUS = "1"
$env:RAMP_UP = "1s"
$env:STEADY_STATE = "10s"
$env:RAMP_DOWN = "1s"
pnpm test:performance:dashboard
```

Result:

- Status: passed
- VUs: 1
- Iterations: 12
- Total HTTP requests: 168
- Failed requests: 0
- `http_req_duration`: avg 8.63ms, p90 11.01ms, p95 12.91ms, max 26.02ms
- `dashboard_initial_load_duration`: avg 18.66ms, p90 19.8ms, p95 28.09ms, max 38ms
- `dashboard_tab_load_duration`: avg 9.16ms, p90 10.9ms, p95 11.89ms, max 13ms
- Data received: 247 kB
- Data sent: 25 kB

Local limitation:

- The 10 VU local run was unstable and produced connection refusals from `localhost:3000`.
- Firestore credentials are not available locally, so the successful k6 run used temporary in-memory admin behavior and a temporary provisioning mock. Both were removed after the run.
- A production-like baseline still needs real Firestore, tenant-service, Redis/queue dependencies, and 10+ VUs.

## Current Bottlenecks

- Browser orchestrates too many API calls on initial load.
- Browser updates affected local state after most mutations instead of reloading dashboard data.
- Lists are loaded as full collections instead of paginated server-side results.
- Dashboard, analytics, and reports now use aggregate/limited queries for list-heavy data; top-product analytics uses daily product stats instead of scanning order items.
- Dashboard KPIs and aggregates are requested alongside unrelated list data.
- Provisioning status refresh reloads unrelated dashboard data.
- Existing local dependency setup is not reliable enough for higher-concurrency performance testing.

## Roadmap Progress

- Step 1, measure current state: completed.
- Step 2, standardize frontend entry through API Gateway: completed for both admin dashboards.
- Step 3, create BFF for the front: completed with `GET /api/v1/admin/overview`.
- Step 4, reduce initial dashboard requests: completed for both admin dashboards.
- Step 5, add server-side pagination for list data: completed for admin products, orders, customers, users, and audit logs.
- Step 6, remove full refresh after mutations: completed for both admin dashboards.
- Step 7, reduce aggregate full collection scans: completed for dashboard counts/revenue, recent lists, low-stock products, analytics customer counts, and inventory/customer reports.
- Step 8, materialize top-product stats: completed with product daily stats maintained on order writes.
- Step 9, add stats backfill for historical orders: completed with an idempotent product daily stats backfill endpoint.
- Step 10, keep dashboard bundle near baseline: completed by pruning unused dashboard client API methods and shortening rare client error messages.
- Step 11, establish reproducible 10 VU performance baseline command: completed with `pnpm test:performance:dashboard:baseline10` and a gateway health preflight. Actual 10 VU measurement is blocked until the local gateway/backend stack is running.
- Step 12, add local mock 10 VU baseline: completed with `pnpm test:performance:dashboard:baseline10:mock` for deterministic request-shape regression testing without the real backend stack.
- Step 13, persist k6 performance reports: completed with k6 JSON summary export and Markdown report generation.
- Step 14, add performance budget gate: completed with `pnpm test:performance:dashboard:budget` over the exported k6 summary.

## BFF Endpoint Added

Endpoint:

```http
GET /api/v1/admin/overview
```

Location:

- `services/api-gateway/src/router.ts`

Purpose:

- Aggregate the current dashboard shell data behind the API Gateway.
- Provide a single frontend entry point that replaced the previous 9 parallel initial-load calls.

Aggregated upstream calls:

- Admin service: `/dashboard`
- Admin service: `/products?page=1&limit=20`
- Admin service: `/orders?page=1&limit=20`
- Admin service: `/customers?page=1&limit=20`
- Admin service: `/users?page=1&limit=20`
- Admin service: `/settings`
- Admin service: `/tenant-config`
- Admin service: `/audit-logs?page=1&limit=20`
- Tenant/provisioning service: `/tenants`

Forwarded headers:

- `X-Tenant-ID`
- `Authorization`
- `X-Request-ID`

Validation:

- `pnpm --filter @t3ck/api-gateway build`: passed.
- `pnpm --filter @t3ck/admin-dashboard build`: passed, JS 154.27 kB, gzip 48.60 kB.
- `pnpm --filter @t3ck/admin-unified-dashboard build`: passed, JS 160.87 kB, gzip 50.40 kB.
- `pnpm exec prettier --check ...`: passed for changed dashboard files.

## Server-Side Pagination Added

Endpoints:

- `GET /api/v1/admin/products?page=1&limit=20`
- `GET /api/v1/admin/orders?page=1&limit=20`
- `GET /api/v1/admin/customers?page=1&limit=20`
- `GET /api/v1/admin/users?page=1&limit=20`
- `GET /api/v1/admin/audit-logs?page=1&limit=20`

Response shape:

```json
{
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```

Validation:

- `pnpm --filter @t3ck/admin-service build`: passed.
- `pnpm --filter @t3ck/api-gateway build`: passed.
- `pnpm --filter @t3ck/admin-dashboard build`: passed, JS 154.30 kB, gzip 48.60 kB.
- `pnpm --filter @t3ck/admin-unified-dashboard build`: passed, JS 160.90 kB, gzip 50.40 kB.

## Targeted Post-Mutation Updates Added

Changed behavior:

- Product creation prepends the created product to the current page and increments the product KPI locally.
- Order creation prepends the created order to the current page and increments the order KPI locally.
- Customer creation prepends the created customer to the current page and increments the customer KPI locally.
- User creation prepends the created user to the current page locally.
- Tenant configuration save replaces the local tenant configuration with the write response.
- Provisioning submit updates the local provisioning list and no longer explicitly calls `refreshAll()`.
- Provisioning status refresh updates only the visible status message.

Expected request reduction:

- Admin dashboard write flow: from 1 write + 2 refresh reads to 1 write.
- Unified dashboard write flow: from 1 write + 1 refresh read to 1 write.
- First unsafe write still includes 1 CSRF token request when the CSRF cache is empty.

Validation:

- `pnpm --filter @t3ck/admin-dashboard build`: passed, JS 154.52 kB, gzip 48.69 kB.
- `pnpm --filter @t3ck/admin-unified-dashboard build`: passed, JS 161.23 kB, gzip 50.53 kB.
- `pnpm exec prettier --check ...`: passed for step 6 files.

## Aggregate Query Optimization Added

Changed behavior:

- Dashboard product, order, and customer KPI counts use Firestore count aggregation instead of loading full collections.
- Dashboard revenue uses Firestore sum aggregation over completed orders instead of loading completed order documents.
- Dashboard recent orders and audit logs use paginated first-page reads instead of loading all records and slicing in memory.
- Dashboard low-stock products use a bounded stock query instead of loading all products in memory.
- Analytics uses Firestore count/sum aggregations for order totals and revenue in the requested date window.
- Analytics uses `productDailyStats` for top products instead of scanning order items in the requested date window.
- Analytics resolves names only for top product IDs instead of loading every product.
- Inventory reports use product count aggregation and a bounded low-stock query.
- Customer reports use customer count aggregation and a top-customer query ordered by `totalSpent`.

## Product Stats Materialization Added

Storage:

- Collection: `tenants/{tenantId}/admin/data/productDailyStats`
- Document ID: `{YYYY-MM-DD}_{productId}`
- Fields: `tenantId`, `productId`, `date`, `quantity`, `revenue`, `updatedAt`

Write path:

- `createOrder()` increments daily product quantity and revenue using Firestore atomic increments.
- `updateOrder()` reverses old item stats and applies new item stats when `items` changes.

Read path:

- `getAnalytics()` reads daily product stat documents for the requested date range, aggregates by product, and returns the top 5 by revenue.
- Sales total order count uses Firestore `count()` over the date window.
- Sales revenue uses Firestore `sum('total')` over completed orders in the date window.

Validation:

- `pnpm --filter @t3ck/admin-service build`: passed.
- `pnpm exec prettier --check "services/admin-service/src/admin-service.ts" "docs/performance-current-state.md"`: passed.

## Product Stats Backfill Added

Endpoint:

```http
POST /api/v1/admin/maintenance/product-stats/backfill
```

Body:

```json
{
  "tenantId": "tenant-demo",
  "from": "2026-01-01T00:00:00.000Z",
  "to": "2026-04-28T23:59:59.999Z"
}
```

Behavior:

- Reads historical orders for the tenant, optionally constrained by `from` and `to`.
- Recomputes product daily quantity/revenue totals in memory.
- Writes absolute totals to `productDailyStats`, making repeated runs idempotent for covered product/date pairs.
- Uses Firestore batch writes in chunks below the 500-write limit.

Safety:

- In production, set `ADMIN_MAINTENANCE_TOKEN` and send it via `X-Maintenance-Token` or `Authorization: Bearer <token>`.
- In non-production, the endpoint can run without a maintenance token.

Response:

```json
{
  "data": {
    "processedOrders": 0,
    "writtenStats": 0
  }
}
```

Residual work:

- Additional counters can be materialized for customer/order cohorts if analytics grows beyond the current dashboard scope.

## Dashboard Bundle Optimization Added

Changed behavior:

- Removed unused direct list/read/report methods from dashboard API clients after the BFF migration.
- Kept only methods still used by the UI: overview, analytics, creates, tenant config update, provisioning submit/status.
- Shortened rare unified-dashboard network error messages to keep optimized JS under the previous gzip target.

Validation:

- `pnpm --filter @t3ck/admin-dashboard build`: passed, JS 153.55 kB, gzip 48.52 kB.
- `pnpm --filter @t3ck/admin-unified-dashboard build`: passed, JS 160.69 kB, gzip 50.37 kB.

## 10 VU Baseline Command Added

Command:

```bash
pnpm test:performance:dashboard:baseline10
```

Defaults:

- `READ_VUS=10`
- `RAMP_UP=30s`
- `STEADY_STATE=2m`
- `RAMP_DOWN=30s`
- `BASE_URL=http://localhost:3000`

Preflight:

- The k6 script now calls `GET /health` before starting the scenario.
- If the gateway is unavailable, the run fails during setup instead of producing thousands of noisy endpoint failures.

Attempted local result:

- Command: `pnpm test:performance:dashboard:baseline10`
- Status: blocked by unavailable local gateway.
- Error: `GET http://localhost:3000/health returned 0. Start the API gateway or set BASE_URL.`
- No valid 10 VU latency baseline was recorded from this local run.

## Mock 10 VU Baseline Added

Command:

```bash
pnpm test:performance:dashboard:baseline10:mock
```

Purpose:

- Start a lightweight local mock gateway on `MOCK_GATEWAY_PORT` (`3999` by default).
- Validate the optimized dashboard request shape and k6 thresholds without Firestore, tenant-service, queues, or the API gateway.
- Provide a deterministic local regression signal while the full backend stack is unavailable.

Latest local result:

- Status: passed.
- VUs max: 10.
- Iterations: 255.
- HTTP requests: 1531.
- Failed requests: 0.
- `http_req_duration`: avg 638.06µs, p90 1.09ms, p95 1.5ms, max 5ms.
- `dashboard_initial_load_duration`: avg 674.5µs, p90 1ms, p95 1ms, max 5ms.
- `dashboard_tab_load_duration`: avg 1.21ms, p90 2ms, p95 2.29ms, max 9ms.

Limitation:

- This is a mock-gateway baseline and does not measure real Firestore, service proxying, tenant-service, Redis/queue, auth, or network latency.

## Performance Report Generation Added

Artifacts:

- JSON summary: `performance-results/dashboard-baseline10-summary.json`
- Markdown report: `performance-results/dashboard-baseline10-summary.md`

Commands:

```bash
pnpm test:performance:dashboard:baseline10:mock
pnpm test:performance:dashboard:report
```

Latest generated mock report:

- Status: passed.
- VUs max: 10.
- Iterations: 255.
- HTTP requests: 1531.
- Failed requests: 0%.
- `http_req_duration` p95: 1.5ms.
- `dashboard_initial_load_duration` p95: 2ms.
- `dashboard_tab_load_duration` p95: 2ms.

## Performance Budget Gate Added

Command:

```bash
pnpm test:performance:dashboard:budget
```

Default budgets:

- `http_req_failed <= 0.02`
- `dashboard_failures <= 0.02`
- `http_req_duration p95 <= 800ms`
- `http_req_duration p99 <= 1500ms`
- `dashboard_initial_load_duration p95 <= 1200ms`
- `dashboard_tab_load_duration p95 <= 800ms`

Configurable environment variables:

- `PERF_BUDGET_HTTP_FAILED_RATE`
- `PERF_BUDGET_DASHBOARD_FAILED_RATE`
- `PERF_BUDGET_HTTP_P95_MS`
- `PERF_BUDGET_HTTP_P99_MS`
- `PERF_BUDGET_INITIAL_P95_MS`
- `PERF_BUDGET_TAB_P95_MS`

Latest local mock budget result:

- Status: passed.
- `http_req_failed`: 0%.
- `dashboard_failures`: 0%.
- `http_req_duration p95`: 1.1915ms.
- `http_req_duration p99`: 1.9829ms.
- `dashboard_initial_load_duration p95`: 1ms.
- `dashboard_tab_load_duration p95`: 2ms.

## Immediate Optimization Targets

- Materialize additional customer/order cohort counters if analytics expands beyond the current dashboard scope.
- Run `pnpm test:performance:dashboard:baseline10` in an environment with API gateway, admin-service, tenant-service, Firestore, Redis/queue dependencies, and tenant seed data available.
