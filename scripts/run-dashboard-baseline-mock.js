#!/usr/bin/env node
const { fork, spawnSync } = require('child_process');
const path = require('path');

const port = Number(process.env.MOCK_GATEWAY_PORT || 3999);
const mockPath = path.join(__dirname, '..', 'tests', 'performance', 'mock-dashboard-gateway.js');
const mock = fork(mockPath, [], {
  env: { ...process.env, MOCK_GATEWAY_PORT: String(port) },
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
});

const timeout = setTimeout(() => {
  mock.kill('SIGTERM');
  console.error('Mock gateway did not start in time.');
  process.exit(1);
}, 5000);

mock.on('message', (message) => {
  if (!message || message.type !== 'ready') {
    return;
  }

  clearTimeout(timeout);
  const result = spawnSync('node', ['scripts/run-dashboard-baseline.js'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      BASE_URL: `http://localhost:${port}`,
      READ_VUS: process.env.READ_VUS || '10',
      RAMP_UP: process.env.RAMP_UP || '5s',
      STEADY_STATE: process.env.STEADY_STATE || '20s',
      RAMP_DOWN: process.env.RAMP_DOWN || '5s',
    },
  });

  mock.kill('SIGTERM');
  process.exit(result.status ?? 1);
});

mock.on('exit', (code) => {
  clearTimeout(timeout);
  if (code && code !== 0) {
    process.exit(code);
  }
});
