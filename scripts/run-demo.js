#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const server = http.createServer((req, res) => {
  try {
    const url = req.url.split('?')[0];
    console.log(`${new Date().toISOString()} - ${req.method} ${url}`);

    // Return HTML directly
    if (url === '/' || url === '/DEMO_FULL.html') {
      const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'DEMO_FULL.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // API endpoint
    if (url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error('Error:', err);
    res.writeHead(500);
    res.end('Server error');
  }
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Server online at http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Server stopped');
  process.exit(0);
});
