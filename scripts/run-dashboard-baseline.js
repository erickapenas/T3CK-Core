#!/usr/bin/env node
process.env.K6_SUMMARY_EXPORT =
  process.env.K6_SUMMARY_EXPORT || 'performance-results/dashboard-baseline10-summary.json';
process.env.READ_VUS = process.env.READ_VUS || '10';
process.env.RAMP_UP = process.env.RAMP_UP || '30s';
process.env.STEADY_STATE = process.env.STEADY_STATE || '2m';
process.env.RAMP_DOWN = process.env.RAMP_DOWN || '30s';

process.argv[2] = 'tests/performance/k6-admin-dashboard.js';
require('./run-k6.js');
