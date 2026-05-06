#!/usr/bin/env node
const fs = require('fs');

const summaryPath = process.argv[2] || 'performance-results/dashboard-baseline10-summary.json';
const budgets = {
  http_req_failed: Number(process.env.PERF_BUDGET_HTTP_FAILED_RATE || 0.02),
  dashboard_failures: Number(process.env.PERF_BUDGET_DASHBOARD_FAILED_RATE || 0.02),
  http_req_duration_p95: Number(process.env.PERF_BUDGET_HTTP_P95_MS || 800),
  http_req_duration_p99: Number(process.env.PERF_BUDGET_HTTP_P99_MS || 1500),
  dashboard_initial_load_duration_p95: Number(process.env.PERF_BUDGET_INITIAL_P95_MS || 1200),
  dashboard_tab_load_duration_p95: Number(process.env.PERF_BUDGET_TAB_P95_MS || 800),
};

if (!fs.existsSync(summaryPath)) {
  console.error(`k6 summary not found: ${summaryPath}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const metricValue = (name, field = 'value') => {
  const metric = summary.metrics?.[name];
  return metric?.values?.[field] ?? metric?.[field];
};
const checks = [
  {
    name: 'http_req_failed',
    actual: metricValue('http_req_failed'),
    budget: budgets.http_req_failed,
    unit: 'rate',
  },
  {
    name: 'dashboard_failures',
    actual: metricValue('dashboard_failures'),
    budget: budgets.dashboard_failures,
    unit: 'rate',
  },
  {
    name: 'http_req_duration p95',
    actual: metricValue('http_req_duration', 'p(95)'),
    budget: budgets.http_req_duration_p95,
    unit: 'ms',
  },
  {
    name: 'http_req_duration p99',
    actual: metricValue('http_req_duration', 'p(99)'),
    budget: budgets.http_req_duration_p99,
    unit: 'ms',
  },
  {
    name: 'dashboard_initial_load_duration p95',
    actual: metricValue('dashboard_initial_load_duration', 'p(95)'),
    budget: budgets.dashboard_initial_load_duration_p95,
    unit: 'ms',
  },
  {
    name: 'dashboard_tab_load_duration p95',
    actual: metricValue('dashboard_tab_load_duration', 'p(95)'),
    budget: budgets.dashboard_tab_load_duration_p95,
    unit: 'ms',
  },
];

const failures = checks.filter(
  (check) => typeof check.actual !== 'number' || check.actual > check.budget
);

for (const check of checks) {
  const actual = typeof check.actual === 'number' ? check.actual.toFixed(4) : 'missing';
  const budget = check.budget.toFixed(4);
  const status = failures.includes(check) ? 'FAIL' : 'PASS';
  console.log(`${status} ${check.name}: ${actual}${check.unit} <= ${budget}${check.unit}`);
}

if (failures.length > 0) {
  console.error(`Performance budget failed: ${failures.length} metric(s) exceeded budget.`);
  process.exit(1);
}

console.log('Performance budget passed.');
