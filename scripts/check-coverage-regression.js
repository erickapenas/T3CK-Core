#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const baselinePath = path.join(root, 'scripts', 'coverage-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

function loadSummary(serviceName) {
  const summaryPath = path.join(root, 'services', serviceName, 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    return null;
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  return summary.total;
}

let failed = false;
for (const [serviceName, base] of Object.entries(baseline)) {
  const actual = loadSummary(serviceName);
  if (!actual) {
    console.warn(`⚠️ coverage summary missing for ${serviceName}`);
    continue;
  }

  for (const key of ['lines', 'functions', 'branches', 'statements']) {
    const actualPct = Number(actual[key].pct || 0);
    const basePct = Number(base[key]);
    if (actualPct + 0.001 < basePct) {
      failed = true;
      console.error(`❌ coverage regression ${serviceName} ${key}: ${actualPct}% < baseline ${basePct}%`);
    } else {
      console.log(`✅ no regression ${serviceName} ${key}: ${actualPct}% >= ${basePct}%`);
    }
  }
}

if (failed) process.exit(1);
console.log('✅ coverage regression check passed');