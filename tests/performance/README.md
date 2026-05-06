# Performance Tests

## Dashboard Real-Flow Test

Script:

```bash
tests/performance/k6-admin-dashboard.js
```

Read-only run:

```bash
pnpm test:performance:dashboard
```

10 VU baseline run:

```bash
pnpm test:performance:dashboard:baseline10
```

10 VU local mock baseline run:

```bash
pnpm test:performance:dashboard:baseline10:mock
```

Generate a Markdown report from the latest k6 JSON summary:

```bash
pnpm test:performance:dashboard:report
```

Check the latest k6 JSON summary against performance budgets:

```bash
pnpm test:performance:dashboard:budget
```

Read + write run:

```bash
pnpm test:performance:dashboard:writes
```

The write scenario creates demo products. Provisioning submission is disabled by default because it creates tenants and queue jobs.

## Useful Environment Variables

- `BASE_URL`: API gateway URL. Default: `http://localhost:3000`.
- `TENANT_ID`: tenant header used by admin endpoints. Default: `tenant-demo`.
- `AUTH_TOKEN`: optional bearer token for protected routes.
- `READ_VUS`: read scenario virtual users. Default: `10`.
- `WRITE_VUS`: write scenario virtual users. Default: `1`.
- `RAMP_UP`: read ramp-up duration. Default: `30s`.
- `STEADY_STATE`: read steady-state duration. Default: `2m`.
- `RAMP_DOWN`: read ramp-down duration. Default: `30s`.
- `INCLUDE_MUTATIONS`: enables write scenario when `true`.
- `INCLUDE_PROVISIONING_SUBMIT`: enables tenant provisioning submissions when `true`.
- `PROVISIONING_STATUS_TENANT_ID`: tenant id used by the provisioning status check.
- `K6_SUMMARY_EXPORT`: k6 JSON summary output path. Default for dashboard baseline: `performance-results/dashboard-baseline10-summary.json`.
- `PERF_BUDGET_HTTP_FAILED_RATE`: max `http_req_failed` rate. Default: `0.02`.
- `PERF_BUDGET_DASHBOARD_FAILED_RATE`: max custom dashboard failure rate. Default: `0.02`.
- `PERF_BUDGET_HTTP_P95_MS`: max HTTP p95. Default: `800`.
- `PERF_BUDGET_HTTP_P99_MS`: max HTTP p99. Default: `1500`.
- `PERF_BUDGET_INITIAL_P95_MS`: max dashboard initial load p95. Default: `1200`.
- `PERF_BUDGET_TAB_P95_MS`: max dashboard tab load p95. Default: `800`.

The dashboard script performs a `GET /health` preflight against `BASE_URL` before starting the load scenario. If the gateway is unavailable, the run fails before generating noisy request failures.

The mock baseline starts a lightweight local gateway fixture on `MOCK_GATEWAY_PORT` (default `3999`) and points k6 at it. Use it to validate the optimized request shape and k6 thresholds locally when the full backend stack is unavailable. It does not replace the production-like baseline against real Firestore and services.

Dashboard baseline runs export a k6 JSON summary by default. The report command converts it into `performance-results/dashboard-baseline10-summary.md`.

PowerShell example:

```powershell
$env:BASE_URL = "http://localhost:3000"
$env:TENANT_ID = "tenant-demo"
pnpm test:performance:dashboard
```

Destructive provisioning example:

```powershell
$env:INCLUDE_MUTATIONS = "true"
$env:INCLUDE_PROVISIONING_SUBMIT = "true"
pnpm test:performance:dashboard
```

## What This Measures

- Optimized dashboard initial load through `GET /api/v1/admin/overview`.
- Paginated list tab navigation with `page=1&limit=20`.
- Optimized post-mutation behavior without full dashboard refresh.
- CSRF token round-trip for state-changing requests.
- p95/p99 latency, failed request rate, and custom dashboard flow timings.
