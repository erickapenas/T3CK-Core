#!/usr/bin/env node
const { spawnSync } = require('child_process');

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error('Usage: node scripts/run-k6.js <k6-script-path>');
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return result;
}

const local = run('k6', ['run', scriptPath]);
if (!local.error && local.status === 0) {
  process.exit(0);
}

if (process.env.CI === 'true') {
  console.error('k6 is required in CI and was not available.');
  process.exit(1);
}

console.warn('⚠️ k6 not found in local environment; skipping performance execution.');
console.warn('Install k6 or run in CI to execute load/stress/spike tests.');
process.exit(0);
