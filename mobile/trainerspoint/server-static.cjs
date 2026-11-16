const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8081;
const DIST_DIR = path.join(__dirname, 'dist');
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:3000';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m3u8': 'application/x-mpegURL',
  '.ts': 'video/mp2t',
};

function serveStatic(req, res) {
  let url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = url.pathname;

  // Default to index.html
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(DIST_DIR, pathname.slice(1));
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback - serve index.html for any non-file path
        fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, html) => {
          if (err2) {
            res.writeHead(500);
            res.end('Server error');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  // Proxy /api requests to backend
  if (req.url.startsWith('/api/')) {
    try {
      const backendUrl = new URL(req.url, BACKEND_URL);
      const proxyReq = http.request({
        hostname: backendUrl.hostname,
        port: backendUrl.port || 80,
        path: backendUrl.pathname + backendUrl.search,
        method: req.method,
        headers: {
          ...req.headers,
          host: backendUrl.hostname,
        },
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'No se puede conectar con el servidor del gimnasio.' }));
      });

      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (body) proxyReq.write(body);
        proxyReq.end();
      });
    } catch (err) {
      console.error('Proxy error:', err.message);
      res.writeHead(502);
      res.end('Proxy error');
    }
    return;
  }

  // Serve static files
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`App móvil web: http://localhost:${PORT}/`);
  console.log(`Proxy API: http://localhost:${PORT}/api -> ${BACKEND_URL}`);
});