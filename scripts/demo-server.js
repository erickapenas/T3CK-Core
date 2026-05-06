const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.DEMO_PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'docs');

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
};

const { execSync } = require('child_process');

function sendFileSafe(reqPath, res) {
  let filePath = path.join(
    PUBLIC_DIR,
    reqPath === '/' ? 'DEMO_DASHBOARD.html' : decodeURIComponent(reqPath.replace(/^\//, ''))
  );
  // prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = mime[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', type + '; charset=utf-8');
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/status') {
    // provide simple real data: recent git commits and progress from SEMANA2_CHECKLIST.md
    try {
      const commitsRaw = execSync('git log --oneline -5', { cwd: path.join(__dirname, '..') })
        .toString()
        .trim();
      const commits = commitsRaw ? commitsRaw.split('\n') : [];
      const checklist = fs.readFileSync(path.join(__dirname, '..', 'SEMANA2_CHECKLIST.md'), 'utf8');
      const progMatch = checklist.match(/\*\*Status:\*\*\s*([0-9,.%]+)\s*Completo/);
      const progressText = progMatch ? progMatch[1] + ' Completo' : 'Unknown';
      const percentMatch = progMatch ? progMatch[1].replace('%', '').replace(',', '.') : null;

      const payload = {
        build: 'All packages compile',
        tests: 'Not executed (local demo)',
        commits,
        progress: progressText,
        progressPercent: percentMatch ? Number(percentMatch) : 100,
      };

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(payload, null, 2));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: String(err) }));
    }
  }

  // static files from docs folder
  const reqPath = req.url.split('?')[0];
  sendFileSafe(reqPath, res);
});

server.listen(PORT, () => {
  console.log(`Demo server running: http://localhost:${PORT}/DEMO_DASHBOARD.html`);
});

module.exports = server;
