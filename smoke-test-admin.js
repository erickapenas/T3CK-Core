#!/usr/bin/env node
const http = require('http');
const { spawn } = require('child_process');

process.env.NODE_ENV = 'development';
process.env.RATE_LIMIT_STORE = 'memory';

let backendProc = null;
let frontendProc = null;

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
      headers,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPort(port, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await request(port, '/');
      return true;
    } catch (err) {
      if (i < maxAttempts - 1) {
        await sleep(500);
      }
    }
  }
  return false;
}

async function main() {
  console.log('🚀 Starting Admin Service smoke test...\n');

  console.log('Starting backend (port 3006)...');
  backendProc = spawn('node', ['dist/index.js'], {
    cwd: 'services/admin-service',
    stdio: 'ignore',
    detached: false,
  });

  console.log('Starting frontend (port 5174)...');
  frontendProc = spawn('npm', ['run', 'dev'], {
    cwd: 'services/admin-dashboard',
    stdio: 'ignore',
    shell: true,
    detached: false,
  });

  console.log('Waiting for services to be ready...');
  const backendReady = await waitForPort(3006);
  const frontendReady = await waitForPort(5174);

  if (!backendReady) {
    console.error('❌ Backend did not start on port 3006');
    process.exit(1);
  }

  if (!frontendReady) {
    console.error('❌ Frontend did not start on port 5174');
    process.exit(1);
  }

  console.log('✅ Services ready\n');

  console.log('🧪 Running HTTP checks...\n');

  try {
    const health = await request(3006, '/health');
    console.log(`✅ Health check: ${health.body.status}`);

    const dashboard = await request(3006, '/api/admin/dashboard', { 'X-Tenant-ID': 'tenant-demo' });
    console.log(`✅ Dashboard API: ${dashboard.body.data.kpis.orders} orders`);

    const frontend = await request(5174, '/');
    console.log(`✅ Frontend: HTTP ${frontend.status}\n`);

    console.log('🎉 Smoke test PASSED\n');
  } catch (error) {
    console.error(`❌ Smoke test FAILED: ${error.message}\n`);
    process.exit(1);
  } finally {
    console.log('Stopping services...');
    if (backendProc) backendProc.kill();
    if (frontendProc) frontendProc.kill();
    process.exit(0);
  }
}

main();
