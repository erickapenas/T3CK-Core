#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error('Usage: node scripts/run-k6.js <k6-script-path>');
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return result;
}

const args = ['run', '--summary-trend-stats', 'avg,min,med,max,p(90),p(95),p(99)'];
if (process.env.K6_SUMMARY_EXPORT) {
  fs.mkdirSync(path.dirname(process.env.K6_SUMMARY_EXPORT), { recursive: true });
  args.push('--summary-export', process.env.K6_SUMMARY_EXPORT);
}
args.push(scriptPath);

const local = run('k6', args);
if (!local.error && local.status === 0) {
  process.exit(0);
}

if (!local.error) {
  process.exit(local.status ?? 1);
}

if (process.env.CI === 'true') {
  console.error('k6 is required in CI and was not available.');
  process.exit(1);
}

console.warn('⚠️ k6 not found in local environment; skipping performance execution.');
console.warn('Install k6 or run in CI to execute load/stress/spike tests.');
process.exit(0);
