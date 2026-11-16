// ═══════════════════════════════════════════════
// Pending Banner - Integrated Pendientes y Recuperaciones
// ═══════════════════════════════════════════════
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function dayKey(v) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(v)); }
  function timeKey(v) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(v)); }
  function dateLabel(v) { return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium' }).format(new Date(v)); }
  function qty(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  let pendingData = { packages: [], bookings: [], recoveries: [], clients: [], employees: [], rooms: [], services: [], timezone: 'Europe/Madrid', gymId: '' };
  let pendingType = 'asignacion', pendingLoading = false, pendingSaving = false, pendingEditorData = null;

  // Access the calendar's api function and data
  function calendarApi(path, method, body) {
    // The calendar's api function is in the parent scope
    if (typeof api === 'function') return api(path, method, body);
    throw new Error('API no disponible');
  }
  function clientName(id) { return pendingData.clients.find(c => c.id === id)?.name || 'Sin nombre'; }
  function clientLink(id, label) { return '<a href="/clientes/' + encodeURIComponent(id) + '/ficha">' + esc(label) + '</a>'; }
  function workerName(id) { return pendingData.employees.find(e => e.id === id)?.name || 'Sin asignar'; }
  function serviceName(id) { return pendingData.services.find(s => s.id === id)?.name || 'Servicio'; }
  function assignmentBookings() { return pendingData.bookings.filter(b => !b.employeeId && ['pending', 'confirmed'].includes(b.status)); }
  function rescheduleBookings() { return pendingData.bookings.filter(b => b.needsReschedule); }
  function pendingRecoveries() { return pendingData.recoveries.filter(r => r.status === 'PENDING' || (r.status === 'RESCHEDULE_PENDING' && !pendingData.bookings.some(b => b.recoveryId === r.id && b.needsReschedule))); }

  async function loadPendingData() {
    if (pendingLoading) return pendingLoading;
    pendingLoading = (async () => {
      try {
        const [state] = await Promise.all([calendarApi('state'), calendarApi('pending-packages'), calendarApi('recoveries').catch(() => [])]);
        pendingData = {
          ...state,
          packages: state.pendingPackages || state.packages || [],
          recoveries: state.recoveries || state.recoveriesList || [],
          bookings: state.bookings || [],
          clients: state.clients || [],
          employees: state.employees || [],
          rooms: state.rooms || [],
          services: state.services || [],
        };
      } catch (_) {
        pendingData = { packages: [], bookings: [], recoveries: [], clients: [], employees: [], rooms: [], services: [], timezone: 'Europe/Madrid', gymId: '' };
      }
    })();
    try { await pendingLoading; } finally { pendingLoading = null; }
  }

  function renderBanner() {
    const banner = $('planning-banner');
    const count = $('planning-banner-count');
    if (!banner || !count) return;
    if (!window.CalendarServer && !window.CALENDAR_SERVER) { banner.hidden = true; return; }
    const isTrainer = currentUser?.role === 'TRAINER';
    banner.hidden = !!isTrainer;
    const q = assignmentBookings(), r = rescheduleBookings(), total = q.length + r.length;
    count.textContent = total === 0 ? 'Sin pendientes' : total === 1 ? '1 pendiente' : total + ' pendientes';
  }

  function renderGroupedItems() {
    const tab = pendingType === 'asignacion';
    const items = [];
    const clients = new Map();
    const mkGroup = (id, label) => {
      if (!clients.has(id)) clients.set(id, { id, name: label, packages: [], bookings: [], recoveries: [], deadline: '9999-12-31', pressure: 0 });
      return clients.get(id);
    };
    if (tab) {
      pendingData.packages.forEach(pkg => {
        const g = mkGroup(pkg.clientId, pkg.clientName || 'Cliente');
        g.packages.push(pkg);
        if (dayKey(pkg.expiresAt) < g.deadline) g.deadline = dayKey(pkg.expiresAt);
        g.pressure += pkg.sessionsToSchedule / Math.max(1, pkg.daysRemaining);
      });
    }
    assignmentBookings().forEach(b => {
      const g = mkGroup(b.clientId, clientName(b.clientId));
      g.bookings.push(b);
      if (b.date < g.deadline) g.deadline = b.date;
    });
    if (!tab) rescheduleBookings().forEach(b => {
      const g = mkGroup(b.clientId, clientName(b.clientId));
      g.bookings.push(b);
      if (b.date < g.deadline) g.deadline = b.date;
    });
    if (tab) pendingRecoveries().forEach(rec => {
      const g = mkGroup(rec.clientId, clientName(rec.clientId));
      g.recoveries.push(rec);
    });
    const query = $('planning-search')?.value.trim().toLocaleLowerCase('es') || '';
    return [...clients.values()].filter(item =>
      (item.name + ' ' + item.packages.map(p => p.serviceName).join(' ') + ' ' +
        item.bookings.map(b => serviceName(b.serviceId)).join(' ') + ' ' +
        item.recoveries.map(r => serviceName(r.serviceId)).join(' '))
      .toLocaleLowerCase('es').includes(query))
      .sort((a, b) => a.deadline.localeCompare(b.deadline) || b.pressure - a.pressure || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
  }

  function renderRows() {
    const items = renderGroupedItems();
    const tab = pendingType === 'asignacion';
    const free = items.reduce((s, item) => s + item.packages.reduce((n, p) => n + p.sessionsToSchedule, 0), 0);
    const bkCount = items.reduce((s, item) => s + item.bookings.length, 0);
    const recCount = items.reduce((s, item) => s + item.recoveries.length, 0);
    const summary = $('planning-list-summary');
    if (summary) summary.textContent = tab
      ? items.length + ' clientes · ' + free + ' sesiones sin agendar · ' + bkCount + ' citas sin trabajador'
      : items.length + ' clientes · ' + bkCount + ' citas por reprogramar · ' + recCount + ' por recuperar';

    // Urgent cards
    const urgentPanel = $('planning-urgent-panel');
    const urgentList = $('planning-urgent-list');
    if (urgentPanel && urgentList) {
      if (!tab || !items.length) { urgentPanel.hidden = true; urgentList.innerHTML = ''; }
      else {
        urgentPanel.hidden = false;
        urgentList.innerHTML = items.slice(0, 4).map((item, i) => {
          const pkg = item.packages[0], booking = item.bookings[0];
          const prio = booking && (!pkg || booking.date <= dayKey(pkg.expiresAt));
          const reason = !prio && pkg ? 'Bono: ' + (pkg.daysRemaining <= 1 ? 'caduca hoy o mañana' : 'caduca en ' + pkg.daysRemaining + ' días') : 'Cita sin trabajador asignado';
          const total = item.packages.reduce((n, p) => n + p.sessionsToSchedule, 0);
          return '<article class="planning-urgent-card">' +
            '<span class="planning-rank">Prioridad ' + (i + 1) + '</span>' +
            '<h3>' + esc(item.name) + '</h3>' +
            '<p class="planning-reason">' + esc(reason) + '</p>' +
            '<p>' + [
              ...(total ? [qty(total, 'sesión de bono sin agendar', 'sesiones de bono sin agendar')] : []),
              ...(item.bookings.length ? [qty(item.bookings.length, 'cita sin trabajador', 'citas sin trabajador')] : [])
            ].join(' · ') + '</p>' +
            (!prio && pkg ? '<small>Caducidad: ' + dateLabel(pkg.expiresAt) + '</small>' : '<small>Cita: ' + esc(booking.date) + ' · ' + esc(booking.start) + '</small>') +
            '<button type="button" ' + (prio ? 'data-edit="' + esc(booking.id) + '"' : 'data-package="' + esc(pkg.packageId) + '"') + '>' +
            (prio ? 'Organizar cita' : 'Agendar sesión') + '</button></article>';
        }).join('');
      }
    }

    // Recoveries history
    const recPanel = $('planning-recoveries-history');
    const recList = $('planning-recoveries-list');
    if (recPanel && recList) {
      if (!tab || !pendingData.recoveries.length) { recPanel.hidden = true; recList.innerHTML = ''; }
      else {
        recPanel.hidden = false;
        const states = { RESCHEDULE_PENDING: 'Pendiente de reprogramación', PENDING: 'Pendiente de recuperar', SCHEDULED: 'Recuperación programada', COMPLETED: 'Recuperada', FORFEITED: 'Resuelta sin recuperación' };
        recList.innerHTML = '<table><thead><tr><th>Cliente</th><th>Servicio</th><th>Estado</th></tr></thead><tbody>' +
          pendingData.recoveries.map(r => '<tr><td><strong>' + clientLink(r.clientId, clientName(r.clientId)) + '</strong></td><td>' + serviceName(r.serviceId) + '</td><td>' + (states[r.status] || r.status) + '</td></tr>').join('') +
          '</tbody></table>';
      }
    }

    // Main table
    const rows = $('planning-rows');
    if (rows) {
      rows.innerHTML = items.flatMap(item => [
        ...item.bookings.map(b => '<tr>' +
          '<td><strong>' + clientLink(item.id, item.name) + '</strong></td>' +
          '<td>' + serviceName(b.serviceId) + '<small>' + (tab ? 'Cita sin trabajador' : 'Pendiente de reprogramar') + '</small></td>' +
          '<td>' + esc(b.date) + ' · ' + esc(b.start) + '–' + esc(b.end) + '</td>' +
          '<td>' + workerName(b.employeeId) + '</td>' +
          '<td class="planning-actions">' +
          '<button type="button" data-edit="' + esc(b.id) + '">' + (tab ? 'Asignar trabajador' : 'Reprogramar') + '</button>' +
          '<a href="/index.html?fecha=' + encodeURIComponent(b.date) + '&reserva=' + encodeURIComponent(b.id) + '">Ver historial</a>' +
          '</td></tr>'),
        ...item.recoveries.map(r => '<tr>' +
          '<td><strong>' + clientLink(item.id, item.name) + '</strong></td>' +
          '<td>' + serviceName(r.serviceId) + '<small>' + (r.status === 'RESCHEDULE_PENDING' ? 'Recuperación pendiente de reprogramar' : 'Sesión pendiente de recuperar') + '</small></td>' +
          '<td>Sin fecha<small>Crédito de recuperación</small></td>' +
          '<td>' + workerName(r.employeeId) + '</td>' +
          '<td class="planning-actions">' +
          '<button type="button" data-recovery="' + esc(r.id) + '">Agendar recuperación</button>' +
          '<a href="/clientes/' + encodeURIComponent(item.id) + '/ficha">Ver ficha</a>' +
          '</td></tr>'),
        ...item.packages.map(p => '<tr>' +
          '<td><strong>' + clientLink(item.id, item.name) + '</strong></td>' +
          '<td>' + serviceName(p.serviceId) + '<small>' + qty(p.sessionsToSchedule, 'sesión sin agendar', 'sesiones sin agendar') + ' · ' + qty(p.sessionsScheduled, 'ya reservada', 'ya reservadas') + '</small>' + (p.paymentPending ? '<small>Bono con pago pendiente</small>' : '') + '</td>' +
          '<td>Caduca el ' + dateLabel(p.expiresAt) + '<small>' + p.daysRemaining + ' días</small></td>' +
          '<td>Por elegir</td>' +
          '<td class="planning-actions">' +
          '<button type="button" data-package="' + esc(p.packageId) + '">Agendar sesión</button>' +
          '<a href="/clientes/' + encodeURIComponent(item.id) + '/ficha">Ver bono</a>' +
          '</td></tr>')
      ]).join('') || '<tr><td colspan="5">No hay pendientes para esta búsqueda.</td></tr>';
    }
  }

  function renderAll() {
    renderBanner();
    renderRows();
  }

  // ─── Banner toggle ───
  function initBannerToggle() {
    const header = $('planning-banner-header');
    const content = $('planning-banner-content');
    if (header && content) {
      header.addEventListener('click', () => {
        const expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', String(!expanded));
        content.hidden = expanded;
      });
    }
  }

  // ─── Tabs ───
  function initTabs() {
    document.querySelectorAll('.planning-banner-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab === pendingType) return;
        pendingType = tab.dataset.tab;
        document.querySelectorAll('.planning-banner-tab').forEach(t => {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', String(t === tab));
        });
        renderRows();
      });
    });
  }

  // ─── Search ───
  function initSearch() {
    const search = $('planning-search');
    if (!search) return;
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(renderRows, 250);
    });
  }

  // ─── Refresh ───
  function initRefresh() {
    const btn = $('planning-refresh');
    if (!btn) return;
    btn.addEventListener('click', () => { loadPendingData().then(renderAll); });
  }

  // ─── Editor ───
  function openEditor(event) {
    if (pendingSaving) return;
    const target = event.target.closest('[data-edit],[data-package],[data-recovery]');
    if (!target) return;
    const pkg = target.dataset.package ? pendingData.packages.find(p => p.packageId === target.dataset.package) : null;
    const rec = target.dataset.recovery ? pendingData.recoveries.find(r => r.id === target.dataset.recovery) : null;
    const booking = target.dataset.edit ? pendingData.bookings.find(b => b.id === target.dataset.edit) : null;
    if (!pkg && !rec && !booking) return;
    pendingEditorData = pkg ? { clientId: pkg.clientId, serviceId: pkg.serviceId, packageId: pkg.packageId, centerId: pendingData.gymId }
      : rec ? { clientId: rec.clientId, serviceId: rec.serviceId, recoveryId: rec.id, employeeId: rec.employeeId || '', centerId: pendingData.gymId }
      : structuredClone(booking);

    const service = pendingData.services.find(s => s.id === pendingEditorData.serviceId);
    if (!service) { const err = $('editor-error'); if (err) { err.textContent = 'El servicio ya no está disponible.'; err.hidden = false; } return; }

    const empSelect = $('planning-employee');
    if (empSelect) {
      empSelect.innerHTML = pendingData.employees.filter(e => e.active !== false && (!service.employeeIds?.length || service.employeeIds.includes(e.id)))
        .map(e => '<option value="' + e.id + '">' + e.name + '</option>').join('');
      empSelect.value = pendingEditorData.employeeId || empSelect.options[0]?.value || '';
    }

    const roomSelect = $('planning-room');
    if (roomSelect) {
      roomSelect.innerHTML = pendingData.rooms.map(r => '<option value="' + r.id + '">' + r.name + '</option>').join('');
      roomSelect.value = pendingEditorData.roomId || pendingData.rooms[0]?.id || '';
    }

    const dateInput = $('planning-date');
    if (dateInput) {
      dateInput.min = dayKey(Date.now());
      dateInput.max = pkg ? dayKey(pkg.expiresAt) : '';
      dateInput.value = pendingEditorData.date || dayKey(Date.now());
    }

    const startTime = $('planning-start');
    if (startTime) startTime.value = pendingEditorData.start || '';

    $('editor-error').hidden = true;
    $('editor-slots').innerHTML = '';

    $('planning-editor-title').textContent = pkg ? 'Agendar una sesión del bono' : rec ? 'Agendar sesión de recuperación' : 'Organizar reserva';
    const saveBtn = $('planning-form').querySelector('button.primary');
    if (saveBtn) saveBtn.textContent = pkg ? 'Confirmar sesión del bono' : rec ? 'Confirmar recuperación' : 'Confirmar nueva organización';

    const orig = $('editor-original');
    if (orig) {
      const txt = pkg ? (pkg.clientName + ' · ' + pkg.serviceName + ' · ' + qty(pkg.sessionsToSchedule, 'sesión disponible', 'sesiones disponibles') + '. Se consumirá este bono sin crear otra compra.')
        : rec ? (clientName(rec.clientId) + ' · ' + serviceName(rec.serviceId) + ' · Sesión pendiente de recuperar. Se consumirá este crédito sin generar cobro.')
        : (clientName(pendingEditorData.clientId) + ' · ' + serviceName(pendingEditorData.serviceId) + ' · Anterior: ' + pendingEditorData.date + ' ' + pendingEditorData.start);
      orig.textContent = txt;
    }

    $('planning-editor').showModal();
  }

  function checkSlots() {
    if (pendingSaving) return;
    $('editor-error').hidden = true;
    $('editor-error').textContent = '';
    $('editor-slots').innerHTML = '';
    const dateVal = $('planning-date')?.value, empVal = $('planning-employee')?.value, roomVal = $('planning-room')?.value;
    if (!dateVal || !empVal || !roomVal) { $('editor-error').textContent = 'Selecciona trabajador, fecha y sala.'; $('editor-error').hidden = false; return; }
    const q = new URLSearchParams({ date: dateVal, employeeId: empVal, serviceId: pendingEditorData.serviceId, roomId: roomVal, centerId: pendingEditorData.centerId || pendingData.gymId, ...(pendingEditorData.id ? { excludeId: pendingEditorData.id } : {}) });
    calendarApi('slots?' + q).then(result => {
      const pkg = pendingData.packages.find(p => p.packageId === pendingEditorData?.packageId);
      const expiry = pkg ? dayKey(pkg.expiresAt) + 'T' + timeKey(pkg.expiresAt) : null;
      const valid = (result || []).filter(slot => (!dateVal || dayKey(Date.now()) <= dateVal || slot.start > timeKey(Date.now())) && (!expiry || dateVal + 'T' + slot.end <= expiry));
      if (!valid.length) { $('editor-slots').innerHTML = '<p>No hay huecos disponibles. Prueba otro día o trabajador.</p>'; }
      else { $('editor-slots').innerHTML = valid.map(s => '<button type="button" class="slot-btn" data-slot="' + esc(s.start) + '">' + esc(s.start) + '</button>').join(''); }
    }).catch(e => { $('editor-error').textContent = e.message; $('editor-error').hidden = false; });
  }

  function onSlotClick(event) {
    if (pendingSaving) return;
    const slot = event.target.closest('[data-slot]');
    if (slot) { $('planning-start').value = slot.dataset.slot; $('planning-start').focus(); }
  }

  async function submitForm(event) {
    event.preventDefault();
    if (pendingSaving) return;
    $('editor-error').hidden = true;
    $('editor-error').textContent = '';
    if (!$('planning-form').reportValidity()) return;
    pendingSaving = true;
    const formBtn = $('planning-form').querySelector('button.primary');
    if (formBtn) formBtn.disabled = true;
    try {
      const service = pendingData.services.find(s => s.id === pendingEditorData.serviceId);
      if (!service) throw new Error('Servicio no válido.');
      const [h, m] = $('planning-start').value.split(':').map(Number);
      const end = h * 60 + m + service.duration;
      if (end >= 24 * 60) throw new Error('La sesión debe terminar en el mismo día. Elige una hora anterior.');
      const booking = { ...pendingEditorData, employeeId: $('planning-employee').value, date: $('planning-date').value, start: $('planning-start').value, roomId: $('planning-room').value, end: String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0'), status: 'CONFIRMED', needsReschedule: false };
      if (!pendingEditorData.id && booking.date === dayKey(Date.now()) && booking.start <= timeKey(Date.now())) throw new Error('Elige una hora futura para agendar.');
      await calendarApi('bookings' + (pendingEditorData.id ? '/' + encodeURIComponent(pendingEditorData.id) : ''), pendingEditorData.id ? 'PUT' : 'POST', { booking });
      $('planning-editor').close();
      await loadPendingData();
      renderAll();
    } catch (e) { $('editor-error').textContent = e.message; $('editor-error').hidden = false; }
    finally { pendingSaving = false; if (formBtn) formBtn.disabled = false; }
  }

  function initEditor() {
    const table = document.querySelector('#planning-rows') || document.querySelector('#planning-rows')?.parentElement;
    const urgent = $('planning-urgent-list');
    const slots = $('editor-slots');

    // Table click delegation
    const rowsEl = $('planning-rows');
    if (rowsEl) rowsEl.addEventListener('click', openEditor);
    if (urgent) urgent.addEventListener('click', openEditor);
    if (slots) slots.addEventListener('click', onSlotClick);

    // Check slots button
    const checkBtn = $('planning-check-slots');
    if (checkBtn) checkBtn.addEventListener('click', checkSlots);

    // Form submit
    const form = $('planning-form');
    if (form) form.addEventListener('submit', submitForm);

    // Close buttons
    const closeBtn = $('close-planning-editor');
    if (closeBtn) closeBtn.addEventListener('click', () => $('planning-editor').close());
    const cancelBtn = $('cancel-planning-editor');
    if (cancelBtn) cancelBtn.addEventListener('click', () => $('planning-editor').close());

    // Input changes clear slots
    ['planning-date', 'planning-employee', 'planning-room'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('change', () => { $('editor-slots').innerHTML = ''; $('editor-error').hidden = true; });
    });

    // Dialog cancel event
    const dialog = $('planning-editor');
    if (dialog) dialog.addEventListener('cancel', e => { if (pendingSaving) e.preventDefault(); });
  }

  // ─── Auto-refresh polling ───
  function initPolling() {
    if (typeof window.TrainersPoint === 'undefined' || !window.TrainersPoint.poll) return;
    window.TrainersPoint.poll(
      () => { if (!$('planning-editor')?.open) { loadPendingData().then(renderAll); } },
      20000
    );
  }

  // ─── Initialize ───
  function init() {
    initBannerToggle();
    initTabs();
    initSearch();
    initRefresh();
    initEditor();

    // Initial load
    loadPendingData().then(renderAll);

    // Auto-open banner if URL has #pendientes hash
    if (location.hash === '#pendientes' || location.hash === '#pend') {
      const header = $('planning-banner-header');
      const content = $('planning-banner-content');
      if (header && content) {
        header.setAttribute('aria-expanded', 'true');
        content.hidden = false;
        // Scroll banner into view after a brief delay
        setTimeout(() => {
          $('planning-banner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    }

    initPolling();
  }

  // Wait for DOM and calendar data to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to let calendar app.js initialize api function
    setTimeout(init, 500);
  }
})();