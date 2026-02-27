#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targetFile = path.join(root, 'scripts', 'coverage-targets.json');
const targets = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

function loadSummary(serviceName) {
  const summaryPath = path.join(root, 'services', serviceName, 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    return null;
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  return summary.total;
}

let failed = false;
for (const [serviceName, target] of Object.entries(targets.services)) {
  const actual = loadSummary(serviceName);
  if (!actual) {
    console.warn(`⚠️ coverage summary missing for ${serviceName}`);
    continue;
  }

  for (const key of ['lines', 'functions', 'branches', 'statements']) {
    const actualPct = Number(actual[key].pct || 0);
    const required = Number(target[key]);
    if (actualPct < required) {
      failed = true;
      console.error(`❌ ${serviceName} ${key}: ${actualPct}% < ${required}%`);
    } else {
      console.log(`✅ ${serviceName} ${key}: ${actualPct}% >= ${required}%`);
    }
  }
}

if (failed) process.exit(1);
console.log('✅ coverage per service target check passed');