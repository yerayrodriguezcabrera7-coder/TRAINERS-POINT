// ═══════════════════════════════════════════════
// Pending Banner - Integrated Pendientes y Recuperaciones
// ═══════════════════════════════════════════════
(function () {
  'use strict';
  const $ = id => (typeof document !== 'undefined' && document?.getElementById ? document.getElementById(id) : null);
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function dayKey(v) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(v)); }
  function timeKey(v) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(v)); }
  function dateLabel(v) { return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium' }).format(new Date(v)); }
  function qty(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  let pendingData = { packages: [], bookings: [], recoveries: [], clients: [], employees: [], rooms: [], services: [], timezone: 'Europe/Madrid', gymId: '' };
  let pendingType = 'todos', pendingLoading = false, pendingSaving = false, pendingEditorData = null;

  // Access the calendar's api function (exposed by app.js as window.calendarApi)
  function calendarApi(path, method, body) {
    if (typeof window.calendarApi === 'function') return window.calendarApi(path, method, body);
    throw new Error('API no disponible');
  }
  function clientName(id) { return pendingData.clients.find(c => c.id === id)?.name || 'Sin nombre'; }
  function clientLink(id, label) { return '<a href="/clientes/' + encodeURIComponent(id) + '/ficha">' + esc(label) + '</a>'; }
  function workerName(id) { return pendingData.employees.find(e => e.id === id)?.name || 'Sin asignar'; }
  function serviceName(id) { return pendingData.services.find(s => s.id === id)?.name || 'Servicio'; }
  function assignmentBookings() { return pendingData.bookings.filter(b => !b.employeeId && ['pending', 'confirmed'].includes(String(b.status || '').toLowerCase())); }
  function rescheduleBookings() { return pendingData.bookings.filter(b => b.needsReschedule); }
  function pendingRecoveries() { return pendingData.recoveries.filter(r => r.status === 'PENDING' || (r.status === 'RESCHEDULE_PENDING' && !pendingData.bookings.some(b => b.recoveryId === r.id && b.needsReschedule))); }

  function getAllPendingSummary() {
    const list = [];
    assignmentBookings().forEach(b => {
      list.push({ id: b.id, clientId: b.clientId, name: clientName(b.clientId), type: 'Cita sin trabajador', kind: 'booking', tab: 'asignacion' });
    });
    pendingData.packages.forEach(pkg => {
      list.push({ id: pkg.packageId, clientId: pkg.clientId, name: pkg.clientName || clientName(pkg.clientId), type: 'Bono (' + pkg.sessionsToSchedule + ' ses.)', kind: 'package', tab: 'asignacion' });
    });
    rescheduleBookings().forEach(b => {
      list.push({ id: b.id, clientId: b.clientId, name: clientName(b.clientId), type: 'Reprogramar', kind: 'reschedule', tab: 'reprogramacion' });
    });
    pendingRecoveries().forEach(r => {
      list.push({ id: r.id, clientId: r.clientId, name: clientName(r.clientId), type: 'Recuperación', kind: 'recovery', tab: 'reprogramacion' });
    });
    return list;
  }

  async function loadPendingData() {
    if (pendingLoading) return pendingLoading;
    pendingLoading = (async () => {
      try {
        const [state, pkgResult, recResult] = await Promise.all([
          calendarApi('state'),
          calendarApi('pending-packages'),
          calendarApi('recoveries').catch(() => [])
        ]);
        pendingData = {
          ...state,
          packages: pkgResult?.packages || state.packages || [],
          recoveries: Array.isArray(recResult) ? recResult : (recResult?.recoveries || []),
          bookings: (state.bookings || []).map(b => ({ ...b, status: String(b.status || '').toLowerCase() })),
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
    const isTrainer = (typeof window.calendarCurrentUser === 'function' ? window.calendarCurrentUser() : null)?.role === 'TRAINER';
    banner.hidden = !!isTrainer;
    const summaryList = getAllPendingSummary();
    const q = assignmentBookings();
    const r = rescheduleBookings();
    const recs = pendingRecoveries();
    const pkgClients = new Set(pendingData.packages.map(p => p.clientId));
    const assignClients = new Set([...q.map(b => b.clientId), ...pkgClients]);
    const total = summaryList.length;

    // Mostrar directamente el nombre de las personas pendientes en el banner
    const uniqueClients = [...new Set(summaryList.map(x => x.name))];
    const bannerHeader = $('planning-banner-header');
    const badge = $('pending-dropdown-badge');
    if (badge) badge.textContent = String(total);

    if (total === 0) {
      count.textContent = 'Pendientes (0)';
      bannerHeader?.classList.remove('has-pending');
    } else if (total === 1) {
      count.textContent = '1 pendiente: ' + summaryList[0].name;
      bannerHeader?.classList.add('has-pending');
    } else if (uniqueClients.length <= 2) {
      count.textContent = total + ' pendientes (' + uniqueClients.join(', ') + ')';
      bannerHeader?.classList.add('has-pending');
    } else {
      count.textContent = total + ' pendientes (' + uniqueClients[0] + ', ' + uniqueClients[1] + '…)';
      bannerHeader?.classList.add('has-pending');
    }

    // Actualizar texto de las pestañas con sus contadores reales
    const todosTab = document.querySelector('.planning-banner-tab[data-tab="todos"]');
    const assignTab = document.querySelector('.planning-banner-tab[data-tab="asignacion"]');
    const reschedTab = document.querySelector('.planning-banner-tab[data-tab="reprogramacion"]');
    if (todosTab) todosTab.textContent = `Todos (${total})`;
    if (assignTab) assignTab.textContent = `Por organizar (${assignClients.size})`;
    if (reschedTab) reschedTab.textContent = `Reprogramar / Recuperar (${r.length + recs.length})`;
  }

  function renderGroupedItems() {
    const isTodos = pendingType === 'todos';
    const isAsignacion = pendingType === 'asignacion' || isTodos;
    const isReprogramacion = pendingType === 'reprogramacion' || isTodos;
    const items = [];
    const clients = new Map();
    const mkGroup = (id, label) => {
      if (!clients.has(id)) clients.set(id, { id, name: label, packages: [], bookings: [], recoveries: [], deadline: '9999-12-31', pressure: 0 });
      return clients.get(id);
    };
    if (isAsignacion) {
      pendingData.packages.forEach(pkg => {
        const g = mkGroup(pkg.clientId, pkg.clientName || 'Cliente');
        g.packages.push(pkg);
        if (dayKey(pkg.expiresAt) < g.deadline) g.deadline = dayKey(pkg.expiresAt);
        g.pressure += pkg.sessionsToSchedule / Math.max(1, pkg.daysRemaining);
      });
      assignmentBookings().forEach(b => {
        const g = mkGroup(b.clientId, clientName(b.clientId));
        g.bookings.push(b);
        if (b.date < g.deadline) g.deadline = b.date;
      });
    }
    if (isReprogramacion) {
      rescheduleBookings().forEach(b => {
        const g = mkGroup(b.clientId, clientName(b.clientId));
        g.bookings.push(b);
        if (b.date < g.deadline) g.deadline = b.date;
      });
      pendingRecoveries().forEach(rec => {
        const g = mkGroup(rec.clientId, clientName(rec.clientId));
        g.recoveries.push(rec);
      });
    }
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
    const free = items.reduce((s, item) => s + item.packages.reduce((n, p) => n + p.sessionsToSchedule, 0), 0);
    const bkCount = items.reduce((s, item) => s + item.bookings.length, 0);
    const recCount = items.reduce((s, item) => s + item.recoveries.length, 0);
    const summary = $('planning-list-summary');
    if (summary) {
      if (pendingType === 'todos') {
        summary.textContent = items.length + ' clientes · ' + free + ' sesiones sin agendar · ' + bkCount + ' citas · ' + recCount + ' por recuperar';
      } else if (pendingType === 'asignacion') {
        summary.textContent = items.length + ' clientes · ' + free + ' sesiones sin agendar · ' + bkCount + ' citas sin trabajador';
      } else {
        summary.textContent = items.length + ' clientes · ' + bkCount + ' citas por reprogramar · ' + recCount + ' por recuperar';
      }
    }

    // Urgent cards
    const urgentPanel = $('planning-urgent-panel');
    const urgentList = $('planning-urgent-list');
    if (urgentPanel && urgentList) {
      if (!items.length) { urgentPanel.hidden = true; urgentList.innerHTML = ''; }
      else {
        urgentPanel.hidden = false;
        urgentList.innerHTML = items.slice(0, 4).map((item, i) => {
          const pkg = item.packages[0], booking = item.bookings[0], rec = item.recoveries[0];
          const prio = booking && (!pkg || booking.date <= dayKey(pkg.expiresAt));
          const reason = !prio && pkg ? 'Bono: ' + (pkg.daysRemaining <= 1 ? 'caduca hoy o mañana' : 'caduca en ' + pkg.daysRemaining + ' días') : (booking?.needsReschedule ? 'Cita pendiente de reprogramar' : booking ? 'Cita sin trabajador asignado' : 'Sesión por recuperar');
          const total = item.packages.reduce((n, p) => n + p.sessionsToSchedule, 0);
          const isCritical = (!prio && pkg && pkg.daysRemaining <= 2) || (prio && booking && booking.date <= dayKey(Date.now() + 86400000));
          const client = pendingData.clients ? pendingData.clients.find(c => c.id === item.id) : null;
          const prefWorker = client?.assignedWorkerId ? workerName(client.assignedWorkerId) : null;
          const prefSlotLabel = client?.contactSlot === 'MANANA' ? 'Mañanas' : client?.contactSlot === 'TARDE' ? 'Tardes' : client?.contactSlot === 'MEDIODIA' ? 'Mediodía' : null;
          const prefSummary = [prefWorker ? '⭐ ' + prefWorker : '', prefSlotLabel ? '⏰ ' + prefSlotLabel : ''].filter(Boolean).join(' · ');
          const dateOrExpiry = !prio && pkg ? '<small>Caducidad: ' + dateLabel(pkg.expiresAt) + '</small>' : booking ? '<small>Cita: ' + esc(booking.date) + ' · ' + esc(booking.start) + '</small>' : '<small>Recuperación sin fecha límite</small>';
          const actionBtn = prio ? '<button type="button" data-edit="' + esc(booking.id) + '">' + (booking.needsReschedule ? 'Reprogramar cita' : 'Organizar cita') + '</button>' : pkg ? '<button type="button" data-package="' + esc(pkg.packageId) + '">Agendar sesión</button>' : rec ? '<button type="button" data-recovery="' + esc(rec.id) + '">Agendar recuperación</button>' : '';
          return '<article class="planning-urgent-card ' + (isCritical ? 'is-critical' : '') + '">' +
            '<span class="planning-rank">Prioridad ' + (i + 1) + '</span>' +
            '<h3>' + esc(item.name) + '</h3>' +
            '<p class="planning-reason">' + esc(reason) + '</p>' +
            '<p>' + [
              ...(total ? [qty(total, 'sesión de bono sin agendar', 'sesiones de bono sin agendar')] : []),
              ...(item.bookings.length ? [qty(item.bookings.length, 'cita', 'citas')] : []),
              ...(item.recoveries.length ? [qty(item.recoveries.length, 'recuperación', 'recuperaciones')] : [])
            ].join(' · ') + '</p>' +
            dateOrExpiry +
            (prefSummary ? '<small class="pref-hint">' + esc(prefSummary) + '</small>' : '') +
            actionBtn + '</article>';
        }).join('');
      }
    }

    // Recoveries history
    const recPanel = $('planning-recoveries-history');
    const recList = $('planning-recoveries-list');
    if (recPanel && recList) {
      if (pendingType === 'asignacion' || !pendingData.recoveries.length) { recPanel.hidden = true; recList.innerHTML = ''; }
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
      rows.innerHTML = items.flatMap(item => {
        const client = pendingData.clients ? pendingData.clients.find(c => c.id === item.id) : null;
        const prefWorker = client?.assignedWorkerId ? workerName(client.assignedWorkerId) : null;
        return [
          ...item.bookings.map(b => '<tr>' +
            '<td><strong>' + clientLink(item.id, item.name) + '</strong></td>' +
            '<td>' + serviceName(b.serviceId) + '<small>' + (b.needsReschedule ? 'Pendiente de reprogramar' : 'Cita sin trabajador') + '</small></td>' +
            '<td>' + esc(b.date) + ' · ' + esc(b.start) + '–' + esc(b.end) + '</td>' +
            '<td>' + workerName(b.employeeId) + (!b.employeeId && prefWorker ? '<small class="pref-hint">⭐ Habitual: ' + esc(prefWorker) + '</small>' : '') + '</td>' +
            '<td class="planning-actions">' +
            '<button type="button" data-edit="' + esc(b.id) + '">' + (b.needsReschedule ? 'Reprogramar' : 'Asignar trabajador') + '</button>' +
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
            '<td>Por elegir' + (prefWorker ? '<small class="pref-hint">⭐ Habitual: ' + esc(prefWorker) + '</small>' : '') + '</td>' +
            '<td class="planning-actions">' +
            '<button type="button" data-package="' + esc(p.packageId) + '">Agendar sesión</button>' +
            '<a href="/clientes/' + encodeURIComponent(item.id) + '/ficha">Ver bono</a>' +
            '</td></tr>')
        ];
      }).join('') || (() => {
        const allPending = getAllPendingSummary();
        return allPending.length > 0 && pendingType !== 'todos'
          ? '<tr><td colspan="5">No hay pendientes en esta pestaña. Tienes <strong>' + allPending.length + ' pendiente(s) en total</strong> (<button type="button" class="link-button" data-switch-tab="todos">ver todos</button>).</td></tr>'
          : '<tr><td colspan="5">No hay pendientes para esta búsqueda.</td></tr>';
      })();
    }
  }

  function renderAll() {
    if (typeof document === 'undefined' || !document || !document.getElementById) return;
    renderBanner();
    renderRows();
  }

  function closeDropdown() {
    const header = $('planning-banner-header');
    const content = $('planning-banner-content');
    if (header && content && !content.hidden) {
      header.setAttribute('aria-expanded', 'false');
      content.hidden = true;
    }
  }

  function openDropdown() {
    const header = $('planning-banner-header');
    const content = $('planning-banner-content');
    if (header && content) {
      header.setAttribute('aria-expanded', 'true');
      content.hidden = false;
    }
  }

  // ─── Banner toggle ───
  function initBannerToggle() {
    const header = $('planning-banner-header');
    const content = $('planning-banner-content');
    const closeBtn = $('close-planning-banner');
    if (header && content) {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = header.getAttribute('aria-expanded') === 'true';
        if (expanded) {
          closeDropdown();
        } else {
          openDropdown();
        }
      });

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeDropdown();
        });
      }

      // Cerrar al hacer clic fuera
      document.addEventListener('click', (e) => {
        const banner = $('planning-banner');
        if (banner && !banner.contains(e.target)) {
          closeDropdown();
        }
      });

      // Cerrar con Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && content && !content.hidden) {
          closeDropdown();
        }
      });
    }
  }

  function switchTab(newTab) {
    if (newTab === pendingType) return;
    pendingType = newTab;
    document.querySelectorAll('.planning-banner-tab').forEach(t => {
      const isSel = t.dataset.tab === newTab;
      t.classList.toggle('active', isSel);
      t.setAttribute('aria-selected', String(isSel));
    });
    renderRows();
  }

  // ─── Tabs ───
  function initTabs() {
    document.querySelectorAll('.planning-banner-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchTab(tab.dataset.tab);
      });
    });
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-switch-tab]');
      if (btn) { e.preventDefault(); switchTab(btn.dataset.switchTab); }
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

  const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const DAY_NAMES_CLEAN = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const DAYS_MAP = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes', S: 'Sábado', D: 'Domingo' };

  function getClientPrefDays(client) {
    if (!client) return [];
    let avail = client.availability;
    if (typeof avail === 'string') {
      try { avail = JSON.parse(avail); } catch (_) {}
    }
    if (Array.isArray(avail?.days)) return avail.days;
    if (Array.isArray(avail)) return avail;
    if (typeof avail === 'object' && avail && Array.isArray(avail.preferredDays)) return avail.preferredDays;
    return [];
  }

  function getClientPrefSlots(client) {
    if (!client) return [];
    let avail = client.availability;
    if (typeof avail === 'string') {
      try { avail = JSON.parse(avail); } catch (_) {}
    }
    const slots = [];
    if (client.contactSlot) slots.push(client.contactSlot);
    if (Array.isArray(avail?.slots)) {
      avail.slots.forEach(s => { if (!slots.includes(s)) slots.push(s); });
    }
    return slots;
  }

  function isPreferredDayOfWeek(date, prefDaysList) {
    if (!prefDaysList || !prefDaysList.length) return false;
    const dow = (date.getDay() + 6) % 7;
    const letter = DAY_SHORT[dow];
    const cleanName = DAY_NAMES_CLEAN[dow];
    return prefDaysList.some(d => {
      const s = String(d || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return s === letter.toLowerCase() || s === cleanName || cleanName.startsWith(s);
    });
  }

  function renderMiniCalendar(container, config) {
    if (!container) return { setSelectedDate: () => {} };
    let viewDate = config.selectedDate ? new Date(config.selectedDate + 'T12:00:00') : new Date();
    if (isNaN(viewDate.getTime())) viewDate = new Date();
    let viewYear = viewDate.getFullYear();
    let viewMonth = viewDate.getMonth();

    function updateView() {
      const firstDayOfMonth = new Date(viewYear, viewMonth, 1, 12);
      const firstDayDow = (firstDayOfMonth.getDay() + 6) % 7;
      const numDays = new Date(viewYear, viewMonth + 1, 0, 12).getDate();
      const prefNames = (config.prefDays || []).map(d => DAYS_MAP[d] || d).join(', ');

      let daysHtml = '';
      for (let i = 0; i < firstDayDow; i++) {
        daysHtml += '<div class="mini-cal-empty" aria-hidden="true"></div>';
      }

      for (let day = 1; day <= numDays; day++) {
        const dObj = new Date(viewYear, viewMonth, day, 12);
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const d = String(dObj.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const isPref = isPreferredDayOfWeek(dObj, config.prefDays);
        const isSelected = dateStr === config.selectedDate;
        const isPast = config.minDate && dateStr < config.minDate;
        const isExpired = config.maxDate && dateStr > config.maxDate;
        const isDisabled = isPast || isExpired;

        const classes = [
          'mini-cal-day',
          isPref ? 'is-preferred-day' : '',
          isSelected ? 'is-selected' : '',
          isPast ? 'is-past' : '',
          isExpired ? 'is-expired' : ''
        ].filter(Boolean).join(' ');

        const title = isPref ? 'Día de preferencia del cliente ⭐' : isSelected ? 'Fecha seleccionada' : 'Seleccionar fecha';

        daysHtml += `<button type="button" class="${classes}" data-mini-date="${dateStr}" ${isDisabled ? 'disabled' : ''} title="${title}">` +
          `<span class="mini-cal-day-num">${day}</span>` +
          (isPref ? '<span class="mini-cal-pref-star" aria-hidden="true">⭐</span>' : '') +
          `</button>`;
      }

      container.innerHTML = `
        <div class="mini-cal-header">
          <button type="button" class="mini-cal-nav mini-cal-prev" aria-label="Mes anterior">‹</button>
          <strong class="mini-cal-title">${MONTH_NAMES[viewMonth]} ${viewYear}</strong>
          <button type="button" class="mini-cal-nav mini-cal-next" aria-label="Mes siguiente">›</button>
        </div>
        <div class="mini-cal-grid">
          ${DAY_SHORT.map(wd => `<div class="mini-cal-weekday">${wd}</div>`).join('')}
          ${daysHtml}
        </div>
        <div class="mini-cal-legend">
          <span class="mini-cal-legend-item"><span class="mini-cal-swatch is-preferred-swatch"></span> Día de preferencia</span>
          <span class="mini-cal-legend-item"><span class="mini-cal-swatch is-selected-swatch"></span> Seleccionado</span>
          ${prefNames ? `<span class="mini-cal-pref-text">Preferencias: <strong>${prefNames}</strong></span>` : '<span class="mini-cal-pref-text is-empty">Sin días de preferencia en ficha</span>'}
        </div>
      `;

      const prevBtn = container.querySelector('.mini-cal-prev');
      if (prevBtn) {
        prevBtn.onclick = (e) => {
          e.preventDefault();
          viewMonth--;
          if (viewMonth < 0) { viewMonth = 11; viewYear--; }
          updateView();
        };
      }
      const nextBtn = container.querySelector('.mini-cal-next');
      if (nextBtn) {
        nextBtn.onclick = (e) => {
          e.preventDefault();
          viewMonth++;
          if (viewMonth > 11) { viewMonth = 0; viewYear++; }
          updateView();
        };
      }

      container.querySelectorAll('.mini-cal-day:not(:disabled)').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          const targetDate = btn.dataset.miniDate;
          config.selectedDate = targetDate;
          if (typeof config.onSelect === 'function') {
            config.onSelect(targetDate);
          }
          updateView();
        };
      });
    }

    updateView();

    return {
      setSelectedDate(newDate) {
        config.selectedDate = newDate;
        const d = new Date(newDate + 'T12:00:00');
        if (!isNaN(d.getTime())) {
          viewYear = d.getFullYear();
          viewMonth = d.getMonth();
        }
        updateView();
      }
    };
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

    const client = pendingData.clients ? pendingData.clients.find(c => c.id === pendingEditorData.clientId) : null;
    const activeEmployees = pendingData.employees.filter(e => e.active !== false && (!service.employeeIds?.length || service.employeeIds.includes(e.id)));
    const preferredEmployee = client?.assignedWorkerId && activeEmployees.some(e => e.id === client.assignedWorkerId) ? client.assignedWorkerId : null;

    const empSelect = $('planning-employee');
    if (empSelect) {
      empSelect.innerHTML = activeEmployees.map(e => '<option value="' + e.id + '">' + esc(e.name) + '</option>').join('');
      empSelect.value = pendingEditorData.employeeId || preferredEmployee || empSelect.options[0]?.value || '';
    }

    const roomSelect = $('planning-room');
    if (roomSelect) {
      roomSelect.innerHTML = pendingData.rooms.map(r => '<option value="' + r.id + '">' + esc(r.name) + '</option>').join('');
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

    // Preferencias del cliente
    const prefBox = $('planning-client-preferences');
    const prefDaysList = getClientPrefDays(client);
    const prefSlotsList = getClientPrefSlots(client);
    if (prefBox) {
      const assignedEmp = client?.assignedWorkerId ? pendingData.employees.find(e => e.id === client.assignedWorkerId) : null;
      const slotsMap = { MANANA: 'Mañanas (09:00–14:00)', MEDIODIA: 'Mediodía (14:00–16:00)', TARDE: 'Tardes (16:00–21:00)' };
      const prefDaysText = prefDaysList.map(d => DAYS_MAP[d] || d).join(', ');
      const prefSlotsText = prefSlotsList.map(s => slotsMap[s] || s).join(' · ');
      const items = [];
      if (assignedEmp) items.push('<span class="pref-pill pref-pill-worker">⭐ Entrenador habitual: <strong>' + esc(assignedEmp.name) + '</strong></span>');
      if (prefDaysText) items.push('<span class="pref-pill pref-pill-days">📅 Días: <strong>' + esc(prefDaysText) + '</strong></span>');
      if (prefSlotsText) items.push('<span class="pref-pill pref-pill-time">⏰ Horario: <strong>' + esc(prefSlotsText) + '</strong></span>');
      if (client?.objective) items.push('<span class="pref-pill pref-pill-obj">🎯 Objetivo: <em>' + esc(client.objective) + '</em></span>');
      if (client?.injuryNotes) items.push('<span class="pref-pill pref-pill-injury">⚠️ Consideración: <em>' + esc(client.injuryNotes) + '</em></span>');
      if (items.length) {
        prefBox.hidden = false;
        prefBox.innerHTML = '<div class="pref-card-title">💡 Preferencias del cliente</div><div class="pref-pills-row">' + items.join('') + '</div>';
      } else {
        prefBox.hidden = true;
        prefBox.innerHTML = '';
      }
    }

    // Mini-calendario interactivo con días de preferencia en verde
    const miniCalWrap = $('planning-mini-calendar-wrap');
    if (miniCalWrap) {
      const miniCal = renderMiniCalendar(miniCalWrap, {
        selectedDate: dateInput ? dateInput.value : dayKey(Date.now()),
        prefDays: prefDaysList,
        minDate: dayKey(Date.now()),
        maxDate: pkg ? dayKey(pkg.expiresAt) : '',
        onSelect: (selectedDateStr) => {
          if (dateInput) {
            dateInput.value = selectedDateStr;
            checkSlots();
          }
        }
      });
      if (dateInput) {
        dateInput.onchange = () => {
          miniCal.setSelectedDate(dateInput.value);
        };
      }
    }

    closeDropdown();
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
      else {
        const client = pendingData.clients ? pendingData.clients.find(c => c.id === pendingEditorData?.clientId) : null;
        const targetSlots = getClientPrefSlots(client);
        const isSlotPreferred = slotStart => {
          if (!targetSlots.length) return false;
          const [h] = slotStart.split(':').map(Number);
          if (targetSlots.includes('MANANA') && h >= 6 && h < 14) return true;
          if (targetSlots.includes('MEDIODIA') && h >= 14 && h < 16) return true;
          if (targetSlots.includes('TARDE') && h >= 16 && h < 23) return true;
          return false;
        };
        $('editor-slots').innerHTML = valid.map(s => {
          const pref = isSlotPreferred(s.start);
          return '<button type="button" class="slot-btn' + (pref ? ' is-preferred-slot' : '') + '" data-slot="' + esc(s.start) + '">' + (pref ? '⭐ ' : '') + esc(s.start) + (pref ? ' (Preferencia)' : '') + '</button>';
        }).join('');
      }
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

    // Auto-open dropdown if URL has #pendientes hash, or on hashchange
    function checkHash() {
      if (location.hash === '#pendientes' || location.hash === '#pend') {
        openDropdown();
        setTimeout(() => {
          $('planning-banner')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);
      }
    }
    checkHash();
    window.addEventListener('hashchange', checkHash);

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