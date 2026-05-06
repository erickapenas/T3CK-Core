#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const DOCS_DIR = path.join(__dirname, '..', 'docs');

console.log('Starting server on port', PORT);

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  try {
    const url = req.url.split('?')[0];

    // API endpoints
    if (url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          features: 8,
          completion: '100%',
        })
      );
      return;
    }

    // Default to DEMO_FULL.html for root
    let filePath =
      url === '/'
        ? path.join(DOCS_DIR, 'DEMO_FULL.html')
        : path.join(DOCS_DIR, url.replace(/^\//, ''));

    // Security
    if (!filePath.startsWith(DOCS_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log('File not found:', filePath);
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Serve file
    const ext = path.extname(filePath);
    const contentType =
      {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.md': 'text/plain',
      }[ext] || 'text/plain';

    res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Error:', err);
    res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, 'localhost', () => {
  console.log(`
✅ Server running at http://localhost:${PORT}/
📊 Demo Dashboard: http://localhost:${PORT}/DEMO_FULL.html
🏢 Admin Panel: http://localhost:${PORT}/ADMIN_PANEL.html
🔌 API: http://localhost:${PORT}/api/status
  `);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
