const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer, request } = require('node:http');
const fs = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const zlib = require('node:zlib');
const { serveAsset } = require('../dist/http/assets');
const { serveRuntime } = require('../dist/http/runtime');
const { staticFiles } = require('../dist/http/asset-catalog');
const createPoller = require('../web/shared/polling');

function clock() {
  const document = new EventTarget(), events = new EventTarget(), timers = new Map();
  document.hidden = false;
  let id = 0;
  const environment = { document, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; }, clearTimeout: key => timers.delete(key) };
  return { document, events, timers, poll: createPoller(environment), async fire() { const [key, value] = timers.entries().next().value; timers.delete(key); await value.fn(); } };
}

test('Actualización: espera la petición anterior, pausa oculta y consulta al volver a la pantalla', async () => {
  const c = clock(); let calls = 0, release;
  const stop = c.poll(async () => { if (++calls === 1) await new Promise(resolve => { release = resolve; }); }, 2000);
  const first = c.fire();
  assert.equal(calls, 1); assert.equal(c.timers.size, 0);
  c.document.hidden = true; c.document.dispatchEvent(new Event('visibilitychange'));
  release(); await first; assert.equal(c.timers.size, 0);
  c.document.hidden = false; c.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve(); assert.equal(calls, 2); assert.equal(c.timers.size, 1);
  stop(); assert.equal(c.timers.size, 0);
});

test('Actualización: reintenta con menos frecuencia si falla y recupera el ritmo al conectar', async () => {
  const c = clock(); let calls = 0, errors = 0;
  const stop = c.poll(() => { if (++calls === 1) throw Error('Sin conexión'); }, 2000, () => errors++);
  await c.fire(); assert.equal(errors, 1); assert.equal([...c.timers.values()][0].delay, 4000);
  await c.fire(); assert.equal([...c.timers.values()][0].delay, 2000);
  c.events.dispatchEvent(new Event('pagehide')); assert.equal(c.timers.size, 0);
  c.events.dispatchEvent(new Event('pageshow')); await Promise.resolve(); assert.equal(calls, 3);
  stop();
});

test('Archivos: compresión, validación de caché, HEAD, rutas autorizadas y runtime sin caché', async t => {
  for (const spec of Object.values(staticFiles)) await fs.access(spec.file);
  const app = createServer(async (req, res) => {
    if (req.url === '/runtime.js') return serveRuntime(req, res, 'test-development-token');
    if (!await serveAsset(req, res, req.url)) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const get = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: app.address().port, path, headers, method }, res => {
      const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }); req.on('error', reject); req.end();
  });
  const dir = await fs.mkdtemp(join(tmpdir(), 'asset-cache-'));
  try {
    const plain = await get('/clients.css'), compressed = await get('/clients.css', { 'Accept-Encoding': 'br, gzip' });
    assert.equal(compressed.headers['content-encoding'], 'br');
    assert.deepEqual(zlib.brotliDecompressSync(compressed.body), plain.body);
    assert.ok(compressed.body.length < plain.body.length / 2);
    const gzip = await get('/clients.css', { 'Accept-Encoding': 'br;q=0,gzip' });
    assert.deepEqual(zlib.gunzipSync(gzip.body), plain.body);
    const font = await get('/assets/fonts/arial.ttf', { 'Accept-Encoding': 'br' });
    assert.equal(font.headers['content-encoding'], 'br');
    assert.deepEqual(zlib.brotliDecompressSync(font.body), await fs.readFile(staticFiles['/assets/fonts/arial.ttf'].file));
    const cached = await get('/clients.css', { 'If-None-Match': plain.headers.etag });
    assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
    const head = await get('/clients.css', {}, 'HEAD'); assert.equal(head.body.length, 0); assert.equal(Number(head.headers['content-length']), plain.body.length);
    assert.equal((await get('/../../.env')).status, 404);
    const runtime = await get('/runtime.js', { 'If-None-Match': '*' });
    assert.equal(runtime.status, 200); assert.equal(runtime.headers['cache-control'], 'no-store');
    const file = join(dir, 'sample.js'); staticFiles['/test-changing.js'] = { file, contentType: 'text/javascript' };
    await fs.writeFile(file, 'first'); const old = await get('/test-changing.js');
    await fs.writeFile(file, 'second version'); const updated = await get('/test-changing.js', { 'If-None-Match': old.headers.etag });
    assert.equal(updated.status, 200); assert.equal(updated.body.toString(), 'second version');
    t.diagnostic(`clients.css: ${plain.body.length} bytes → ${compressed.body.length} bytes con Brotli; segunda carga 304 sin cuerpo.`);
  } finally { delete staticFiles['/test-changing.js']; await fs.rm(dir, { recursive: true, force: true }); await new Promise(resolve => app.close(resolve)); }
});
