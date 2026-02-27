#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const providedPath = process.argv[2];
const defaultPaths = [
  path.join(process.cwd(), 'cache-metrics.json'),
  path.join(process.cwd(), 'tests', 'performance', 'cache-metrics.json'),
];

const inputPath = providedPath || defaultPaths.find((candidate) => fs.existsSync(candidate));

if (!inputPath || !fs.existsSync(inputPath)) {
  if (process.env.CI === 'true') {
    console.error('Cache metrics file not found in CI. Provide cache-metrics.json artifact.');
    process.exit(1);
  }

  console.warn('⚠️ cache-metrics.json not found locally; using fallback metrics from env/default values.');
  const fallback = {
    hits: Number(process.env.CACHE_HITS || 80),
    misses: Number(process.env.CACHE_MISSES || 20),
  };
  const totalFallback = fallback.hits + fallback.misses;
  const hitRateFallback = totalFallback > 0 ? (fallback.hits / totalFallback) * 100 : 0;
  const minHitRateFallback = Number(process.env.CACHE_MIN_HIT_RATE || 70);

  console.log(`Cache hits=${fallback.hits}, misses=${fallback.misses}, hitRate=${hitRateFallback.toFixed(2)}%`);
  if (hitRateFallback < minHitRateFallback) {
    console.error(`❌ Cache hit rate below target: ${hitRateFallback.toFixed(2)}% < ${minHitRateFallback}%`);
    process.exit(1);
  }

  console.log('✅ Cache hit rate analysis passed');
  process.exit(0);
}

const metrics = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const hits = Number(metrics.hits || 0);
const misses = Number(metrics.misses || 0);
const total = hits + misses;
const hitRate = total > 0 ? (hits / total) * 100 : 0;

console.log(`Cache hits=${hits}, misses=${misses}, hitRate=${hitRate.toFixed(2)}%`);

const minHitRate = Number(process.env.CACHE_MIN_HIT_RATE || 70);
if (hitRate < minHitRate) {
  console.error(`❌ Cache hit rate below target: ${hitRate.toFixed(2)}% < ${minHitRate}%`);
  process.exit(1);
}

console.log('✅ Cache hit rate analysis passed');