#!/usr/bin/env node
const http = require('http');
const { spawn } = require('child_process');

let mediaProc = null;
let edgeProc = null;

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port, path, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
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
      await request(port, '/health');
      return true;
    } catch (err) {
      if (i < maxAttempts - 1) await sleep(500);
    }
  }
  return false;
}

async function main() {
  console.log('🚀 Starting Performance Services smoke test...\n');

  console.log('Starting Media Service (port 3007)...');
  mediaProc = spawn('node', ['dist/index.js'], {
    cwd: 'services/media-service',
    stdio: 'ignore',
    detached: false,
  });

  console.log('Starting Edge Service (port 3008)...');
  edgeProc = spawn('node', ['dist/index.js'], {
    cwd: 'services/edge-service',
    stdio: 'ignore',
    detached: false,
  });

  console.log('Waiting for services to be ready...\n');

  const mediaReady = await waitForPort(3007);
  const edgeReady = await waitForPort(3008);

  if (!mediaReady) {
    console.error('❌ Media Service did not start');
    process.exit(1);
  }

  if (!edgeReady) {
    console.error('❌ Edge Service did not start');
    process.exit(1);
  }

  console.log('✅ Services ready\n');
  console.log('🧪 Running HTTP checks...\n');

  try {
    // Media Service
    const mediaHealth = await request(3007, '/health');
    console.log(`✅ Media Service health: ${mediaHealth.body.status}`);

    const presets = await request(3007, '/presets');
    console.log(`✅ Media presets: ${presets.body.presets.length} available`);

    const mediaStats = await request(3007, '/stats');
    console.log(`✅ Media stats: ${JSON.stringify(mediaStats.body.stats)}`);

    // Edge Service
    const edgeHealth = await request(3008, '/health');
    console.log(`✅ Edge Service health: ${edgeHealth.body.status}`);

    const isrConfig = await request(3008, '/isr/config');
    console.log(`✅ ISR config: enabled=${isrConfig.body.config.enabled}`);

    const edgeStats = await request(3008, '/stats');
    console.log(`✅ Edge stats: ${JSON.stringify(edgeStats.body.stats)}\n`);

    console.log('🎉 Performance Services smoke test PASSED\n');
    console.log('📊 Summary:');
    console.log('  - Media Service: Ready on port 3007');
    console.log('  - Edge Service: Ready on port 3008');
    console.log('  - All endpoints responding correctly\n');
  } catch (error) {
    console.error(`❌ Smoke test FAILED: ${error.message}\n`);
    process.exit(1);
  } finally {
    console.log('Stopping services...');
    if (mediaProc) mediaProc.kill();
    if (edgeProc) edgeProc.kill();
    process.exit(0);
  }
}

main();
