const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { randomUUID } = require('node:crypto');

async function until(check, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw Error('Timeout en verificación');
    await new Promise(r => setTimeout(r, 20));
  }
}

test('Separación estricta de calendarios: Trainers Point vs Cobosu', async () => {
  const tpGymId = 'tp-gym-1';
  const cobosuGymId = 'cobosu-gym-1';
  const serviceId = randomUUID();
  const employee1Id = randomUUID();
  const today = '2026-11-18';

  const state = {
    gymId: tpGymId,
    timezone: 'Europe/Madrid',
    packagesEnabled: true,
    schedule: Array.from({ length: 7 }, () => ({ closed: false, open: '08:00', close: '22:00' })),
    centers: [
      { id: tpGymId, name: 'Trainers Point Bilbao', brand: 'TRAINERS_POINT' },
      { id: cobosuGymId, name: 'Cobosu Bilbao', brand: 'COBOSU' }
    ],
    rooms: [{ id: 'r1', name: 'Sala 1' }],
    services: [
      { id: serviceId, name: 'Entrenamiento Personal', duration: 60, price: 50, active: true, color: '#3b82f6', modality: 'INDIVIDUAL' }
    ],
    employees: [
      {
        id: employee1Id,
        name: 'Carlos Entrenador',
        active: true,
        role: 'TRAINER',
        color: '#3b82f6',
        shifts: [{ date: today, periods: [{ open: '08:00', close: '16:00' }] }]
      }
    ],
    clients: [
      { id: 'c-tp', name: 'Cliente Trainers Point', brand: 'TRAINERS_POINT', status: 'ACTIVE' },
      { id: 'c-cobosu', name: 'Cliente Cobosu', brand: 'COBOSU', status: 'ACTIVE' }
    ],
    bookings: [
      {
        id: 'booking-tp',
        clientId: 'c-tp',
        employeeId: employee1Id,
        serviceId,
        date: today,
        start: '09:00',
        end: '10:00',
        status: 'confirmed',
        version: 1,
        centerId: tpGymId
      },
      {
        id: 'booking-cobosu',
        clientId: 'c-cobosu',
        employeeId: '__cobosu',
        serviceId,
        date: today,
        start: '10:00',
        end: '11:00',
        status: 'confirmed',
        version: 1,
        centerId: cobosuGymId
      }
    ],
    blocks: []
  };

  const console = new VirtualConsole();
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
  w.localStorage.setItem('calendar-selected-gym', tpGymId);
  w.localStorage.setItem('calendar-active-brand-view', 'TRAINERS_POINT');
  w.structuredClone = structuredClone;
  w.TrainersPoint = { poll: () => () => {} };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

  w.fetch = async (path) => {
    if (path === '/api/me') return { ok: true, json: async () => ({ user: { id: 'admin1', role: 'ADMIN' }, role: 'ADMIN' }) };
    if (path === '/api/state') return { ok: true, json: async () => structuredClone(state) };
    if (path.includes('/clients?all=true')) return { ok: true, json: async () => ({ clients: [] }) };
    return { ok: true, json: async () => ({}) };
  };

  try {
    w.eval(fs.readFileSync('web/calendar/calendar-core.js', 'utf8'));
    w.eval(fs.readFileSync('web/calendar/app.js', 'utf8'));

    await until(() => d.getElementById('period-label')?.textContent.trim().length > 0);

    // ==========================================
    // 1. VISTA TRAINERS POINT:
    // ==========================================
    assert.equal(d.body.dataset.calendarBrand, 'trainers-point');
    assert.match(d.getElementById('calendar-heading-title').textContent, /Calendario de Trainers Point/);
    assert.equal(d.getElementById('brand-tab-tp').classList.contains('active'), true);
    assert.equal(d.getElementById('brand-tab-cobosu').classList.contains('active'), false);

    // En el cuadrante de Trainers Point:
    // - Debe estar Carlos Entrenador
    // - NO debe haber ninguna columna de Cobosu
    assert.ok(d.querySelector(`[data-drop-employee="${employee1Id}"]`), 'Carlos debe estar en el cuadrante de TP');
    assert.equal(d.querySelector(`[data-drop-employee="__cobosu"]`), null, 'NO debe haber columna Cobosu en el cuadrante de TP');
    assert.equal(d.querySelector('.employee-heading.is-cobosu'), null, 'NO debe haber encabezado is-cobosu en TP');

    // Filtros y selector de entrenador: NO debe incluir __cobosu
    const tpEmpFilterOptions = Array.from(d.querySelectorAll('#employee-filter option')).map(o => o.value);
    assert.equal(tpEmpFilterOptions.includes('__cobosu'), false, 'El filtro de entrenador de TP no debe incluir Cobosu');

    // Citas: SOLO la cita de Trainers Point debe ser visible
    assert.ok(d.querySelector('[data-booking="booking-tp"]'), 'Cita de Trainers Point visible en TP');
    assert.equal(d.querySelector('[data-booking="booking-cobosu"]'), null, 'Cita de Cobosu NO debe estar en el calendario de TP');

    // ==========================================
    // 2. CAMBIO A VISTA COBOSU:
    // ==========================================
    d.getElementById('brand-tab-cobosu').click();

    await until(() => d.body.dataset.calendarBrand === 'cobosu');
    assert.match(d.getElementById('calendar-heading-title').textContent, /Calendario de Cobosu/);
    assert.equal(d.getElementById('brand-tab-tp').classList.contains('active'), false);
    assert.equal(d.getElementById('brand-tab-cobosu').classList.contains('active'), true);

    // En el cuadrante de Cobosu:
    // - Debe estar la columna de Cobosu
    assert.ok(d.querySelector(`[data-drop-employee="__cobosu"]`), 'Debe haber columna Cobosu en el calendario de Cobosu');
    // - En Cobosu NO hay opción de poner entrenadores
    assert.equal(d.getElementById('employee-filter-wrap').hidden, true, 'En Cobosu el filtro de entrenador está oculto');
    assert.equal(d.querySelectorAll('.add-trainer-day-btn').length, 0, 'En Cobosu no hay botón de añadir entrenador');

    // Citas: SOLO la cita de Cobosu debe ser visible
    assert.ok(d.querySelector('[data-booking="booking-cobosu"]'), 'Cita de Cobosu visible en Cobosu');
    assert.equal(d.querySelector('[data-booking="booking-tp"]'), null, 'Cita de Trainers Point NO debe estar en el calendario de Cobosu');

    // ==========================================
    // 3. RETORNO A TRAINERS POINT:
    // ==========================================
    d.getElementById('brand-tab-tp').click();
    await until(() => d.body.dataset.calendarBrand === 'trainers-point');
    assert.equal(d.querySelector(`[data-drop-employee="__cobosu"]`), null, 'Columna Cobosu vuelve a desaparecer en TP');
    assert.equal(d.getElementById('employee-filter-wrap').hidden, false, 'En TP el filtro de entrenador está visible');
    assert.ok(d.querySelector('[data-booking="booking-tp"]'), 'Cita TP visible de nuevo');
    assert.equal(d.querySelector('[data-booking="booking-cobosu"]'), null, 'Cita Cobosu vuelve a no estar en TP');

  } finally {
    dom.window.close();
  }
});
