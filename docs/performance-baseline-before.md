# Performance Baseline - Before Optimization

Date: 2026-04-27

Purpose: capture the current state before refactoring the dashboards, API gateway/BFF, caching, pagination, async workers, and cloud-service optimizations.

## Environment

- OS: Windows
- Node.js: v25.2.1
- pnpm: 8.15.0
- k6: not installed locally

## Existing Load Test Status

Command:

```bash
pnpm test:performance:load
```

Result:

- The project script executed successfully, but skipped the actual k6 run because `k6` is not installed locally.
- Current `tests/performance/k6-load.js` only targets `GET /health` on the API gateway.
- Current threshold configured in the script: `http_req_failed < 1%` and `p95 < 500ms`.

Observed output summary:

```text
k6 not found in local environment; skipping performance execution.
Install k6 or run in CI to execute load/stress/spike tests.
```

## Frontend Build Baseline

### Admin Dashboard

Command:

```bash
pnpm --filter @t3ck/admin-dashboard build
```

Result:

- Status: passed
- Build time: 418ms
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
- Build time: 413ms
- Modules transformed: 32
- `index.html`: 0.42 kB, gzip 0.28 kB
- CSS: 3.43 kB, gzip 1.25 kB
- JS: 160.90 kB, gzip 50.43 kB

## Request Baseline From Current Code

### Admin Dashboard

Source: `services/admin-dashboard/src/App.tsx`

Current initial load behavior:

- Calls `refreshAll()` on mount.
- Performs 9 API calls in parallel:
- `dashboard`
- `products`
- `orders`
- `customers`
- `settings`
- `tenantConfiguration`
- `users`
- `auditLogs`
- `analytics`

Backend path:

- Calls `VITE_ADMIN_API_BASE_URL` or `http://localhost:3006` directly.
- Does not go through the API gateway/BFF.

### Admin Unified Dashboard

Source: `services/admin-unified-dashboard/src/App.tsx`

Current initial load behavior:

- Calls `refreshAll()` when `selectedTenantId` changes, including initial mount.
- Performs 9 API calls in parallel:
- `dashboard`
- `products`
- `orders`
- `customers`
- `users`
- `settings`
- `tenantConfiguration`
- `auditLogs`
- `provisioningTenants`

Backend path:

- Calls `VITE_GATEWAY_BASE_URL` or `http://localhost:3000`.
- Goes through the API gateway.

Mutation behavior:

- `POST`, `PUT`, and `DELETE` requests may first fetch a CSRF token from `/api/csrf-token`.
- After most mutations, the UI calls `refreshAll()` again, repeating the full set of dashboard requests.

## Main Baseline Findings

- Initial frontend bundle size is acceptable and not the primary bottleneck right now.
- Browser-side orchestration is the main current inefficiency.
- Initial dashboard load performs 9 requests instead of a single aggregated BFF request.
- The legacy admin dashboard bypasses the gateway.
- Mutations trigger broad refreshes instead of targeted resource updates.
- Existing k6 performance tests do not yet measure real dashboard/API workload; they only cover `GET /health`.

## Future Comparison Targets

- Reduce initial dashboard requests from 9 to 1 or 2.
- Reduce repeated post-mutation refreshes from 9 requests to targeted updates.
- Keep or reduce JS gzip size from the current 48.34-50.43 kB range.
- Add k6 scenarios for real endpoints, not only `/health`.
- Track p95 latency for aggregated admin endpoints.
- Track payload size per initial dashboard load.
- Track cache hit rate after Redis/BFF caching is introduced.

## Real Dashboard k6 Baseline

Date: 2026-04-27

Command profile:

```powershell
$env:READ_VUS = "1"
$env:RAMP_UP = "1s"
$env:STEADY_STATE = "10s"
$env:RAMP_DOWN = "1s"
pnpm test:performance:dashboard
```

Temporary test setup:

- `admin-service` ran with a temporary in-memory local mode because Firestore credentials are not available locally.
- `tenant-service` was represented by a temporary local mock for provisioning read endpoints.
- Temporary code and mock files were removed after the run.

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

Notes:

- The 10 VU local run was unstable in this temporary Windows/dev setup and produced connection refusals from `localhost:3000`.
- The 1 VU run is the current reliable local baseline for the real dashboard flow.
- A production-like baseline should be repeated with real Firestore/tenant dependencies available and with 10+ VUs.
