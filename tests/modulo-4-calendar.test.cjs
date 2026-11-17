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

test('MÓDULO 4: Calendario, Turnos y Cuadrante - Verificación completa', async () => {
  const gymId = randomUUID();
  const serviceId1 = randomUUID();
  const dualServiceId = randomUUID();
  const employee1Id = randomUUID();
  const employeeOffId = randomUUID();
  const client1Id = randomUUID();
  const client2Id = randomUUID();
  const today = '2026-11-18'; // Wednesday

  const state = {
    gymId,
    timezone: 'Europe/Madrid',
    packagesEnabled: true,
    schedule: Array.from({ length: 7 }, () => ({ closed: false, open: '08:00', close: '22:00' })),
    centers: [
      { id: gymId, name: 'Trainers Point Bilbao', brand: 'TRAINERS_POINT' },
      { id: 'cobosu-1', name: 'Cobosu Bilbao', brand: 'COBOSU' }
    ],
    rooms: [{ id: 'r1', name: 'Sala 1' }],
    services: [
      { id: serviceId1, name: 'Entrenamiento Personal', duration: 60, price: 50, active: true, color: '#3b82f6', modality: 'INDIVIDUAL', trainingCount: 4 },
      { id: dualServiceId, name: 'Entrenamiento Dual Avanzado', duration: 60, price: 70, active: true, color: '#10b981', modality: 'DUAL', capacity: 2, trainingCount: 4 }
    ],
    employees: [
      {
        id: employee1Id,
        name: 'Marcos Entrenador',
        active: true,
        role: 'TRAINER',
        color: '#3b82f6',
        shifts: [{ date: today, periods: [{ open: '08:00', close: '16:00' }] }]
      },
      {
        id: employeeOffId,
        name: 'Laura Descanso',
        active: true,
        role: 'TRAINER',
        color: '#8b5cf6',
        shifts: [{ date: today, periods: [] }] // Sin turno asignado hoy
      }
    ],
    clients: [
      { id: client1Id, name: 'Ana Gómez', email: 'ana@example.com', phone: '611222333', status: 'ACTIVE' },
      { id: client2Id, name: 'Beatriz Soler', email: 'beatriz@example.com', phone: '622333444', status: 'ACTIVE' }
    ],
    bookings: [
      {
        id: 'booking-dual-missing',
        clientId: client1Id,
        employeeId: employee1Id,
        serviceId: dualServiceId,
        packageId: 'pkg-1',
        packageSessionNumber: 1,
        packageSessionTotal: 4,
        date: today,
        start: '09:00',
        end: '10:00',
        status: 'confirmed',
        version: 1,
        centerId: gymId,
        sessionId: 'dual-session-1'
      },
      {
        id: 'booking-recup',
        clientId: client2Id,
        employeeId: employee1Id,
        serviceId: serviceId1,
        recoveryId: 'rec-1',
        date: today,
        start: '11:00',
        end: '12:00',
        status: 'confirmed',
        version: 1,
        centerId: gymId
      }
    ],
    blocks: []
  };

  const calls = [];
  const errors = [];
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
  w.localStorage.setItem('calendar-selected-gym', gymId);
  w.structuredClone = structuredClone;
  w.TrainersPoint = { poll: () => () => {}, openTrainingPlan: () => {} };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.confirm = () => true;

  w.fetch = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/api/me') return { ok: true, json: async () => ({ user: { id: 'admin1', name: 'Admin', role: 'ADMIN' }, role: 'ADMIN' }) };
    if (path === '/api/state') return { ok: true, json: async () => structuredClone(state) };
    if (path.includes('/clients?all=true')) {
      return {
        ok: true,
        json: async () => ({
          clients: state.clients.map(c => ({
            id: c.id,
            firstName: c.name,
            lastName: '',
            email: c.email,
            phone: c.phone,
            status: 'ACTIVO'
          }))
        })
      };
    }
    if (path === '/api/aws-clients') return { ok: true, json: async () => ({ clients: [] }) };
    if (path.includes('/service-history')) return { ok: true, json: async () => ({ packages: [], bookings: [] }) };
    if (path.startsWith('/api/bookings/') && options.method === 'PUT') {
      const id = decodeURIComponent(path.slice('/api/bookings/'.length));
      const payload = JSON.parse(options.body).booking;
      const idx = state.bookings.findIndex(b => b.id === id);
      if (idx >= 0) state.bookings[idx] = { ...payload, id, version: (state.bookings[idx].version || 1) + 1 };
      return { ok: true, json: async () => ({ booking: state.bookings[idx] }) };
    }
    if (path === '/api/calendar/shifts/copy-week' && options.method === 'POST') {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    w.eval(fs.readFileSync('web/calendar/calendar-core.js', 'utf8'));
    w.eval(fs.readFileSync('web/calendar/app.js', 'utf8'));

    await until(() => d.getElementById('period-label')?.textContent.trim().length > 0);

    // 1. Diferenciación visual:
    // A) Marca Trainers Point activa inicialmente
    assert.equal(d.body.dataset.calendarBrand, 'trainers-point');
    assert.match(d.getElementById('calendar-brand-label').textContent, /TRAINERS POINT/);

    // B) Entrenadores sin turno en gris oscuro
    const offHeading = d.querySelector('.employee-heading.is-off');
    assert.ok(offHeading, 'Debe haber un encabezado con clase .is-off para el entrenador sin turno');
    assert.match(offHeading.textContent, /Sin turno|Laura Descanso/);
    const offCol = d.querySelector('.time-column.is-off');
    assert.ok(offCol, 'Debe haber una columna con clase .is-off para el entrenador sin turno');

    // 2. Servicios y asignación dual:
    // A) Ordenación: servicios duales salen los primeros
    const bookingServiceOptions = Array.from(d.querySelectorAll('#booking-service option'));
    assert.equal(bookingServiceOptions[0].value, dualServiceId, 'El servicio dual debe ser el primero en el selector');
    const serviceFilterOptions = Array.from(d.querySelectorAll('#service-filter option'));
    assert.equal(serviceFilterOptions[1].value, dualServiceId, 'El servicio dual debe ser la primera opción tras "all"');

    // B) Indicador visual de 2ª persona
    const dualCard = d.querySelector(`[data-booking="booking-dual-missing"]`);
    assert.ok(dualCard, 'Tarjeta de sesión dual debe estar en el cuadrante');
    const missingBadge = dualCard.querySelector('.booking-dual-badge.is-missing');
    assert.ok(missingBadge, 'Debe mostrar badge de falta de 2ª persona');
    assert.match(missingBadge.textContent, /👤.*1\/2/);

    // 3. Detalle del entrenamiento en la cita:
    // Muestra tipo de entreno
    const trainingType = dualCard.querySelector('.event-training-type');
    assert.ok(trainingType, 'Debe tener .event-training-type en la tarjeta');
    assert.match(trainingType.textContent, /Entrenamiento Dual/);

    // Muestra número de sesión del bono (1/4)
    const sessionBadge = dualCard.querySelector('.booking-session-badge');
    assert.ok(sessionBadge, 'Debe tener .booking-session-badge');
    assert.match(sessionBadge.textContent, /1\/4/);

    // Cita con recuperación muestra "Sesión de recuperación"
    const recupCard = d.querySelector(`[data-booking="booking-recup"]`);
    assert.ok(recupCard, 'Tarjeta de recuperación debe existir');
    const recupBadge = recupCard.querySelector('.booking-session-badge.is-recovery');
    assert.ok(recupBadge, 'Debe tener .booking-session-badge.is-recovery');
    assert.match(recupBadge.textContent, /Sesión de recuperación/);

    // 4. Buscador de clientes en el calendario:
    const clientSearchInput = d.getElementById('calendar-client-search');
    assert.ok(clientSearchInput, 'Input de búsqueda de clientes existe');
    clientSearchInput.value = 'Ana';
    clientSearchInput.dispatchEvent(new w.Event('input', { bubbles: true }));

    const clientResults = d.getElementById('calendar-client-results');
    assert.equal(clientResults.hidden, false);
    const clientOption = d.querySelector('[data-calendar-client]');
    assert.ok(clientOption);
    clientOption.click();

    // Debe resaltar la cita de Ana Gómez y atenuar las otras
    const dualCardAfterSearch = d.querySelector(`[data-booking="booking-dual-missing"]`);
    const recupCardAfterSearch = d.querySelector(`[data-booking="booking-recup"]`);
    assert.ok(dualCardAfterSearch.classList.contains('client-search-match'), 'La cita de Ana debe tener .client-search-match');
    assert.ok(recupCardAfterSearch.classList.contains('client-search-muted'), 'La cita de otro cliente debe tener .client-search-muted');

    // Debe listar sus citas con día y hora
    assert.match(clientResults.textContent, /Ana Gómez/);
    assert.match(clientResults.textContent, /09:00–10:00/);

    // Botón de limpiar búsqueda funciona
    const clearSearchBtn = d.getElementById('clear-calendar-client-search');
    assert.ok(clearSearchBtn, 'Botón de limpiar búsqueda existe');
    assert.equal(clearSearchBtn.hidden, false);
    clearSearchBtn.click();
    assert.equal(clientSearchInput.value, '');
    assert.equal(d.querySelector(`[data-booking="booking-dual-missing"]`).classList.contains('client-search-match'), false);

    // 5. Reagendar con mini-calendario:
    // Abrir la cita dual
    d.querySelector(`[data-booking="booking-dual-missing"]`).click();
    assert.equal(d.getElementById('booking-dialog').open, true);
    const openRescheduleBtn = d.getElementById('open-reschedule');
    assert.ok(openRescheduleBtn && !openRescheduleBtn.hidden, 'Botón Reagendar visible');
    openRescheduleBtn.click();

    const reschedulePanel = d.getElementById('reschedule-panel');
    assert.equal(reschedulePanel.hidden, false, 'Panel de reagendar visible');
    const miniCalGrid = d.getElementById('mini-cal-grid');
    assert.ok(miniCalGrid, 'Grid del mini-calendario visible');
    assert.ok(miniCalGrid.children.length >= 28, 'Mini-calendario renderiza los días del mes');

    const timeChips = d.getElementById('mini-cal-time-chips');
    assert.ok(timeChips && timeChips.children.length > 0, 'Chips de horas disponibles renderizados');

    // Seleccionar nuevo día (día 25) y nueva hora (16:30)
    const dayBtn = Array.from(miniCalGrid.querySelectorAll('.mini-cal-day:not(.is-outside)'))
      .find(btn => btn.textContent === '25');
    assert.ok(dayBtn, 'Botón de día 25 en mini-calendario');
    dayBtn.click();
    assert.equal(d.getElementById('reschedule-date').value, '2026-11-25');

    const chip1630 = Array.from(timeChips.querySelectorAll('.mini-cal-chip'))
      .find(chip => chip.textContent === '16:30');
    assert.ok(chip1630, 'Chip de hora 16:30 existe');
    chip1630.click();
    assert.equal(d.getElementById('reschedule-start').value, '16:30');

    // Esperar a que la consulta de bonos termine
    await until(() => !d.getElementById('booking-package-message')?.textContent.includes('Consultando') && d.getElementById('reschedule-date').value === '2026-11-25');

    // Aplicar reagendado
    d.getElementById('apply-reschedule').click();
    await until(() => {
      const errEl = d.getElementById('booking-error');
      if (errEl && !errEl.hidden && errEl.textContent.trim()) {
        throw new Error('Error en booking-dialog: ' + errEl.textContent);
      }
      return state.bookings.find(b => b.id === 'booking-dual-missing').date === '2026-11-25';
    });
    await until(() => d.getElementById('booking-dialog').open === false);
    const updated = state.bookings.find(b => b.id === 'booking-dual-missing');
    assert.equal(updated.date, '2026-11-25');
    assert.equal(updated.start, '16:30');
    assert.equal(updated.end, '17:30');

    // 6. Repetir semana anterior:
    const repeatBtn = d.getElementById('repeat-week-btn');
    assert.ok(repeatBtn, 'Botón repetir semana existe');
    assert.match(repeatBtn.textContent, /solo turnos/i);
    assert.match(repeatBtn.title, /sin.*reservas.*clientes/i);

    // 7. Cobosu: sin opción de poner entrenadores (funciona con la App)
    d.getElementById('brand-tab-cobosu').click();
    await until(() => d.body.dataset.calendarBrand === 'cobosu');
    assert.equal(d.getElementById('employee-filter-wrap').hidden, true, 'En Cobosu el filtro de entrenador está oculto');
    assert.equal(d.getElementById('repeat-week-btn').hidden, true, 'En Cobosu el botón repetir semana está oculto');
    assert.equal(d.querySelectorAll('.add-trainer-day-btn').length, 0, 'En Cobosu no hay botón de añadir entrenador');
    assert.equal(d.querySelectorAll('.add-trainer-pill-btn').length, 0, 'En Cobosu no hay botón de añadir entrenador en días vacíos');
    assert.equal(d.querySelector('.employee-heading.is-off'), null, 'En Cobosu no hay entrenadores sin turno');

    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
