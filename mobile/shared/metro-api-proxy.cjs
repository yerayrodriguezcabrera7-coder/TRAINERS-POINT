// Development-only, same-origin API proxy. Native apps call the backend directly.
const http = require('node:http');
const https = require('node:https');

module.exports = function apiProxy(next, target = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3000') {
  const backend = new URL(target);
  if (!['http:', 'https:'].includes(backend.protocol) || backend.username || backend.password) {
    throw new Error('EXPO_PUBLIC_API_URL debe ser HTTP/HTTPS y no contener credenciales.');
  }
  return (req, res) => {
    if (!req.url?.startsWith('/api/')) return next(req, res);
    // Only local development clients and their own browser origin may use this proxy.
    const host = req.headers.host || '';
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
    if (!localHost || req.headers.origin && req.headers.origin !== `http://${host}`) {
      res.writeHead(403, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'El acceso a la API móvil requiere el servidor local.' }));
    }
    const headers = { ...req.headers, host: backend.host, origin: backend.origin };
    delete headers.connection;
    const transport = backend.protocol === 'https:' ? https : http;
    const upstream = transport.request(new URL(req.url, backend), { method: req.method, headers }, response => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    upstream.setTimeout(15000, () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => {
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'No se puede conectar con el servidor del gimnasio. Comprueba que está iniciado.' }));
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  };
};
