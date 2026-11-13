const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');

async function until(check) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw Error('Timeout esperando actualización de pendientes/recuperaciones');
    await new Promise(r => setTimeout(r, 20));
  }
}

test('Pendientes unifica reprogramaciones y recuperaciones, escapa nombres y permite agendar recuperación', async () => {
  const calls = [];
  const dom = new JSDOM(fs.readFileSync('web/planning/pendientes.html', 'utf8'), {
    url: 'http://localhost/pendientes.html?tipo=reprogramacion',
    runScripts: 'outside-only'
  });
  const w = dom.window;
  const d = w.document;
  w.structuredClone = structuredClone;
  w.TrainersPoint = { poll: () => () => {} };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };

  const recoveries = [
    { id: 'rec-1', clientId: 'c1', serviceId: 's1', employeeId: 'e1', status: 'PENDING' },
    { id: 'rec-2', clientId: 'c1', serviceId: 's1', employeeId: 'e1', status: 'COMPLETED' }
  ];

  w.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/me')) return { ok: true, json: async () => ({ role: 'RECEPTION' }) };
    if (url.endsWith('/pending-packages')) return { ok: true, json: async () => ({ packages: [] }) };
    if (url.endsWith('/recoveries')) return { ok: true, json: async () => recoveries };
    if (url.startsWith('/api/slots?')) return { ok: true, json: async () => [{ start: '11:00', end: '12:00' }] };
    if (url === '/api/bookings' && options.method === 'POST') {
      const booking = JSON.parse(options.body).booking;
      assert.equal(booking.recoveryId, 'rec-1');
      assert.equal(booking.clientId, 'c1');
      recoveries[0].status = 'SCHEDULED';
      return { ok: true, json: async () => ({ ...booking, id: 'b-new', version: 1 }) };
    }
    return {
      ok: true,
      json: async () => ({
        gymId: 'g1',
        timezone: 'Europe/Madrid',
        clients: [{ id: 'c1', name: 'Cliente <script>error</script>' }],
        services: [{ id: 's1', name: 'Entrenamiento', duration: 60 }],
        employees: [{ id: 'e1', name: 'Entrenador', active: true }],
        rooms: [{ id: 'r1', name: 'Sala 1' }],
        bookings: [{ id: 'b-resch', clientId: 'c1', serviceId: 's1', employeeId: 'e1', date: '2099-12-01', start: '10:00', end: '11:00', status: 'CANCELLED', needsReschedule: true }]
      })
    };
  };

  try {
    w.eval(fs.readFileSync('web/planning/pendientes.js', 'utf8'));
    await until(() => d.querySelectorAll('#rows tr').length === 2);
    assert.equal(d.querySelectorAll('#rows script').length, 0);
    assert.ok(d.querySelector('#rows button[data-edit="b-resch"]'));
    assert.ok(d.querySelector('#rows button[data-recovery="rec-1"]'));
    assert.equal(d.getElementById('recoveries-history-panel').hidden, false);
    assert.match(d.getElementById('recoveries-history-list').textContent, /Recuperada/);

    d.querySelector('#rows button[data-recovery="rec-1"]').click();
    assert.equal(d.getElementById('editor').open, true);
    d.getElementById('date').value = '2099-12-10';
    d.getElementById('start').value = '11:00';
    d.getElementById('form').requestSubmit(d.getElementById('save'));
    await until(() => d.getElementById('notice').textContent.includes('Sesión organizada'));
    assert.equal(recoveries[0].status, 'SCHEDULED');
  } finally {
    w.close();
  }
});

test('Recuperaciones se retira del menú, permisos y catálogo de activos', () => {
  const menu = fs.readFileSync('web/shared/menu.js', 'utf8');
  const perms = fs.readFileSync('web/admin/permisos-pagina.js', 'utf8');
  const catalog = fs.readFileSync('src/http/asset-catalog.ts', 'utf8');
  assert.equal(menu.includes('recuperaciones.html'), false);
  assert.equal(perms.includes('recuperaciones.html'), false);
  assert.equal(catalog.includes('recuperaciones.html'), false);
  assert.equal(fs.existsSync('web/planning/recuperaciones.html'), false);
});
