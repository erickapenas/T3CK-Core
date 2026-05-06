#!/usr/bin/env node
const { performance } = require('perf_hooks');

function simulateQueryWorkload(iterations = 20000) {
  const rows = [];
  for (let i = 0; i < iterations; i += 1) {
    rows.push({
      id: i,
      tenantId: `tenant-${i % 10}`,
      amount: i % 500,
      status: i % 3 === 0 ? 'paid' : 'pending',
    });
  }

  const t0 = performance.now();
  const filtered = rows.filter((r) => r.tenantId === 'tenant-1' && r.status === 'paid');
  const grouped = filtered.reduce((acc, row) => {
    acc[row.tenantId] = (acc[row.tenantId] || 0) + row.amount;
    return acc;
  }, {});
  const t1 = performance.now();

  return { ms: t1 - t0, rows: filtered.length, grouped };
}

const result = simulateQueryWorkload();
console.log(`Query workload completed in ${result.ms.toFixed(2)}ms (rows=${result.rows})`);

const thresholdMs = Number(process.env.DB_QUERY_BENCH_THRESHOLD_MS || 80);
if (result.ms > thresholdMs) {
  console.error(`❌ Query optimization check failed: ${result.ms.toFixed(2)}ms > ${thresholdMs}ms`);
  process.exit(1);
}

console.log('✅ Query optimization check passed');
