const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { randomUUID } = require('node:crypto');

async function until(check) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw Error('Timeout esperando actualización del calendario');
    await new Promise(r => setTimeout(r, 20));
  }
}

test('Calendario: sin tarjetas de resumen ni barra de estado, con navegación, filtros y alta de reserva operativos', async () => {
  const gymId = randomUUID();
  const serviceId = randomUUID();
  const employeeId = randomUUID();
  const clientId = randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  const state = {
    gymId,
    timezone: 'Europe/Madrid',
    packagesEnabled: false,
    schedule: Array.from({ length: 7 }, () => ({ closed: false, open: '07:00', close: '22:00' })),
    gyms: [{ id: gymId, name: 'Centro Principal' }],
    rooms: [{ id: 'r1', name: 'Sala 1' }],
    services: [{ id: serviceId, name: 'Entrenamiento Personal', duration: 60, price: 45, active: true, color: '#2b6cb0' }],
    employees: [{
      id: employeeId,
      name: 'Carlos',
      active: true,
      role: 'TRAINER',
      shifts: Array.from({ length: 7 }, (_, day) => ({ day, open: '08:00', close: '20:00' }))
    }],
    clients: [{ id: clientId, name: 'Lucía Pérez', email: 'lucia@example.com', phone: '600000000' }],
    bookings: [],
    blocks: []
  };

  const errors = [];
  const calls = [];
  const console = new VirtualConsole();
  console.on('jsdomError', e => errors.push(e.message));

  const dom = new JSDOM(fs.readFileSync('web/calendar/index.html', 'utf8'), {
    url: 'http://localhost/calendar/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: console
  });
  const w = dom.window;
  const d = w.document;

  w.CALENDAR_SERVER = true;
  w.sessionStorage.setItem('calendar-admin-token', 'test-token');
  w.structuredClone = structuredClone;
  w.TrainersPoint = { poll: () => () => {} };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.confirm = () => true;

  w.fetch = async (path, options = {}) => {
    calls.push({ path, options });
    let result = {};
    if (path === '/api/me') {
      result = { user: { id: 'u1', name: 'Recepción', role: 'RECEPTION' }, role: 'RECEPTION' };
    } else if (path === '/api/state') {
      result = structuredClone(state);
    } else if (path === '/api/aws-clients') {
      result = { clients: [] };
    } else if (path.startsWith('/api/clients/') && path.endsWith('/service-history')) {
      result = { packages: [], bookings: [] };
    } else if (path === '/api/bookings' && options.method === 'POST') {
      const payload = JSON.parse(options.body).booking;
      const saved = { ...payload, id: payload.id || randomUUID(), version: 1 };
      state.bookings.push(saved);
      result = { booking: saved };
    } else if (path.startsWith('/api/slots?')) {
      result = [{ start: '10:00', end: '11:00' }];
    } else if (path.startsWith('/api/recoveries')) {
      result = [];
    } else {
      throw Error('Petición inesperada: ' + path);
    }
    return { ok: true, json: async () => result };
  };

  try {
    w.eval(fs.readFileSync('web/calendar/calendar-core.js', 'utf8'));
    w.eval(fs.readFileSync('web/calendar/app.js', 'utf8'));

    await until(() => d.getElementById('period-label')?.textContent.trim().length > 0 && d.querySelectorAll('#employee-filter option').length > 1);

    // 1. Elementos eliminados
    for (const id of [
      'mode-banner',
      'mode-title',
      'mode-description',
      'stat-total',
      'stat-confirmed',
      'stat-pending',
      'stat-team',
      'booking-notes',
      'booking-hours',
      'booking-available-slot',
      'create-pending-package',
      'package-create-result'
    ]) {
      assert.equal(d.getElementById(id), null, `El elemento #${id} no debe existir`);
    }
    assert.equal(d.querySelector('.stats'), null);
    assert.equal(d.querySelector('.page-note'), null);
    assert.equal(d.querySelector('.calendar-footer').textContent.includes('Selecciona un hueco para reservar'), false);

    // 2. Navegación de fechas y filtros sin errores
    const initialPeriod = d.getElementById('period-label').textContent;
    d.getElementById('next').click();
    assert.notEqual(d.getElementById('period-label').textContent, initialPeriod);
    d.getElementById('previous').click();
    assert.equal(d.getElementById('period-label').textContent, initialPeriod);
    d.getElementById('jump-date').value = today;
    d.getElementById('jump-date').dispatchEvent(new w.Event('change'));

    d.getElementById('employee-filter').value = employeeId;
    d.getElementById('employee-filter').dispatchEvent(new w.Event('change'));
    d.getElementById('service-filter').value = serviceId;
    d.getElementById('service-filter').dispatchEvent(new w.Event('change'));
    d.getElementById('employee-filter').value = 'all';
    d.getElementById('employee-filter').dispatchEvent(new w.Event('change'));
    d.getElementById('service-filter').value = 'all';
    d.getElementById('service-filter').dispatchEvent(new w.Event('change'));

    // 3. Abrir modal de reserva y guardar una cita
    d.getElementById('new-booking').click();
    assert.equal(d.getElementById('booking-dialog').open, true);
    d.getElementById('booking-client').value = clientId;
    d.getElementById('booking-client').dispatchEvent(new w.Event('change'));
    d.getElementById('booking-employee').value = employeeId;
    d.getElementById('booking-service').value = serviceId;
    d.getElementById('booking-date').value = today;
    d.getElementById('booking-start').value = '10:00';
    d.getElementById('booking-end').value = '11:00';

    d.getElementById('booking-form').requestSubmit();
    await until(() => {
      if (d.getElementById('booking-error')?.hidden === false) {
        throw Error('booking-error: ' + d.getElementById('booking-error').textContent);
      }
      if (errors.length) throw Error('jsdomError: ' + errors.join('; '));
      return calls.some(c => c.path.includes('/bookings') && c.options.method === 'POST');
    });
    await until(() => d.getElementById('booking-dialog').open === false);

    assert.equal(state.bookings.length, 1);
    assert.equal(state.bookings[0].clientId, clientId);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
