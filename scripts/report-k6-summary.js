#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'performance-results/dashboard-baseline10-summary.json';
const outputPath = process.argv[3] || inputPath.replace(/\.json$/, '.md');

if (!fs.existsSync(inputPath)) {
  console.error(`k6 summary not found: ${inputPath}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const metric = (name, field) => {
  const item = summary.metrics?.[name];
  return item?.values?.[field] ?? item?.[field];
};
const value = (name) => metric(name, 'value');
const rate = (name) => value(name);
const fmt = (input) => (typeof input === 'number' ? input.toFixed(2) : 'n/a');
const pct = (input) => (typeof input === 'number' ? `${(input * 100).toFixed(2)}%` : 'n/a');

const lines = [
  '# Dashboard Performance Summary',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Core Metrics',
  '',
  `- HTTP requests: ${metric('http_reqs', 'count') ?? 'n/a'}`,
  `- Failed requests: ${pct(rate('http_req_failed'))}`,
  `- Dashboard failures: ${pct(rate('dashboard_failures'))}`,
  `- Iterations: ${metric('iterations', 'count') ?? 'n/a'}`,
  `- Max VUs: ${metric('vus_max', 'max') ?? 'n/a'}`,
  '',
  '## Latency',
  '',
  `- http_req_duration p95: ${fmt(metric('http_req_duration', 'p(95)'))}ms`,
  `- http_req_duration p99: ${fmt(metric('http_req_duration', 'p(99)'))}ms`,
  `- dashboard_initial_load_duration p95: ${fmt(metric('dashboard_initial_load_duration', 'p(95)'))}ms`,
  `- dashboard_tab_load_duration p95: ${fmt(metric('dashboard_tab_load_duration', 'p(95)'))}ms`,
  '',
  '## Source',
  '',
  `- k6 summary: \`${inputPath}\``,
];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${outputPath}`);
