(async function attendanceApp() {
  'use strict';

  const $ = id => document.getElementById(id);
  const serverMode = window.CALENDAR_SERVER === true;
  let adminToken = serverMode
    ? sessionStorage.getItem('calendar-user-token') || sessionStorage.getItem('calendar-admin-token') || window.CALENDAR_DEV_TOKEN || ''
    : '';

  let data = { timezone: 'Europe/Madrid', centerLocation: null, employees: [], records: [], serverNow: new Date().toISOString() };
  let me = null;
  let activeTab = 'clocking';
  let activeStatusFilter = 'all'; // 'all', 'working', 'away'
  let search = '';
  let toastTimer = null;

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const dateKey = (value = new Date(), timezone = data.timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  const initials = name => (name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'TP';
  const formatDateTime = value => value ? new Intl.DateTimeFormat('es-ES', { timeZone: data.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  const formatHourMin = value => value ? new Intl.DateTimeFormat('es-ES', { timeZone: data.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

  const formatDuration = (milliseconds, showSeconds = true) => {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}${showSeconds ? `:${String(seconds).padStart(2, '0')}` : ''}`;
  };

  const duration = (record, now = Date.now()) => {
    const start = new Date(record.clockIn).getTime();
    const end = record.clockOut ? new Date(record.clockOut).getTime() : now;
    return Math.max(0, end - start);
  };

  const openRecord = employeeId => data.records.find(record => record.employeeId === employeeId && !record.clockOut);
  const employeeName = id => data.employees.find(e => e.id === id)?.name || 'Empleado';

  // Obtención legal y puntual de la geolocalización (solo en el momento del fichaje)
  async function getCurrentGeolocation() {
    if (!navigator.geolocation) return null;
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => {
          resolve({
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            accuracy: position.coords.accuracy ? Math.round(position.coords.accuracy) : null,
          });
        },
        error => {
          // Si el usuario deniega el permiso o no hay señal GPS en interiores,
          // se resuelve null para no bloquear el derecho legal de registrar la jornada.
          console.warn('Ubicación puntual no disponible:', error.message);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    });
  }

  async function api(path, method = 'GET', body) {
    const response = await fetch(`/api/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (response.status === 401) {
      location.href = 'login.html';
      return;
    }
    if (!response.ok) {
      throw new Error(result.error || 'No se ha podido completar la operación.');
    }
    return result;
  }

  function warn(message) {
    const el = $('attendance-warning');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  function clearWarn() {
    const el = $('attendance-warning');
    if (el) el.hidden = true;
  }

  function toast(message, isError = false) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.classList.add('visible');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => { el.hidden = true; }, 220);
    }, 4500);
  }

  async function loadMe() {
    try {
      me = await api('me');
      if (me && $('topbar-user-avatar')) {
        $('topbar-user-avatar').textContent = initials(me.name || me.username);
      }
    } catch (_) {}
  }

  async function load(from = dateKey(), to = from, quiet = false) {
    try {
      if (!me) await loadMe();
      const next = await api(`attendance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      data = next;
      sessionStorage.setItem('calendar-admin-token', adminToken);
      clearWarn();
      adaptRoleUI();
      fillEmployeeFilter();
      render();
    } catch (error) {
      if (!quiet) warn(error.message);
    }
  }

  function adaptRoleUI() {
    if (!me) return;
    const isAdmin = ['ADMIN','RECEPTION'].includes(me.role);

    if (!isAdmin) {
      // Entrenador o recepcionista: vista personal
      $('page-eyebrow').textContent = 'EQUIPO · MI CONTROL HORARIO';
      const roleLabel = me.role === 'TRAINER' ? 'Entrenador' : 'Recepción';
      $('heading-count').textContent = `· ${roleLabel}`;
      $('page-description').textContent = `Registro personal de jornada y control horario de ${me.name || me.username}.`;
      $('attendance-list-title').textContent = 'Mi jornada laboral';

      if ($('search-box-wrap')) $('search-box-wrap').hidden = true;
      if ($('history-employee-select-wrap')) $('history-employee-select-wrap').hidden = true;

      $('label-working').textContent = 'Mi estado actual';
      $('label-away').textContent = 'Registro de hoy';
      $('label-total').textContent = 'Puesto';
      $('label-hours').textContent = 'Mi tiempo hoy';
      $('foot-total').textContent = 'Perfil de acceso';
    } else {
      // Administrador: vista completa
      $('page-eyebrow').textContent = 'EQUIPO · CONTROL HORARIO';
      $('heading-count').textContent = data.employees.length ? `(${data.employees.length} trabajadores)` : '';
      $('page-description').textContent = 'Puedes fichar entradas y salidas de la plantilla. El historial identifica quién registra cada fichaje.';
      $('attendance-list-title').textContent = 'Control de jornada';

      if ($('search-box-wrap')) $('search-box-wrap').hidden = false;
      if ($('history-employee-select-wrap')) $('history-employee-select-wrap').hidden = false;

      $('label-working').textContent = 'Trabajando ahora';
      $('label-away').textContent = 'Fuera de turno';
      $('label-total').textContent = 'Plantilla visible';
      $('label-hours').textContent = 'Horas hoy';
      $('foot-total').textContent = 'Trabajadores registrados';
    }
  }

  function fillEmployeeFilter() {
    const select = $('history-employee');
    if (!select) return;
    const selected = select.value || 'all';
    select.innerHTML = '<option value="all">Todos los empleados</option>' +
      data.employees.map(employee => `<option value="${escapeHTML(employee.id)}">${escapeHTML(employee.name)}</option>`).join('');
    if ([...select.options].some(opt => opt.value === selected)) {
      select.value = selected;
    }
  }

  function renderSummary(now = Date.now()) {
    const isAdmin = !me || ['ADMIN','RECEPTION'].includes(me.role);
    const today = dateKey(new Date(now));
    const todayRecords = data.records.filter(r => dateKey(new Date(r.clockIn)) === today);
    const totalTodayDuration = todayRecords.reduce((sum, r) => sum + duration(r, now), 0);

    if (isAdmin) {
      const working = data.employees.filter(employee => openRecord(employee.id)).length;
      const away = Math.max(0, data.employees.length - working);
      $('working-count').textContent = working;
      $('away-count').textContent = away;
      $('employee-count').textContent = data.employees.length;
      $('today-total').textContent = formatDuration(totalTodayDuration, false);

      $('foot-working').textContent = working === 1 ? '1 persona fichada' : `${working} personas fichadas`;
      $('foot-away').textContent = away === 1 ? '1 persona fuera' : `${away} personas fuera`;
      $('foot-hours').textContent = 'Tiempo acumulado hoy';
    } else {
      const myEmpId = me.employeeId || (data.employees[0] ? data.employees[0].id : null);
      const myOpen = myEmpId ? openRecord(myEmpId) : null;
      const myTodayRecords = todayRecords.filter(r => !myEmpId || r.employeeId === myEmpId);
      const myTodayDuration = myTodayRecords.reduce((sum, r) => sum + duration(r, now), 0);

      $('working-count').textContent = myOpen ? 'En turno' : 'Fuera';
      $('working-count').style.fontSize = '26px';
      $('foot-working').textContent = myOpen ? `Entrada a las ${formatHourMin(myOpen.clockIn)}` : 'Sin jornada iniciada';

      $('away-count').textContent = myOpen ? formatDuration(duration(myOpen, now), true) : (myTodayRecords.length > 0 ? `${myTodayRecords.length} turnos` : '0 turnos');
      $('foot-away').textContent = myOpen ? 'Tiempo en curso' : 'Turnos registrados hoy';

      $('employee-count').textContent = me.role === 'TRAINER' ? 'Entrenador' : 'Recepción';
      $('employee-count').style.fontSize = '24px';

      $('today-total').textContent = formatDuration(myTodayDuration, false);
      $('foot-hours').textContent = 'Total acumulado hoy';

      // Botón de acción rápida en cabecera
      const quickBtn = $('quick-clock-btn');
      const quickLabel = $('quick-clock-label');
      if (quickBtn && quickLabel && myEmpId) {
        quickBtn.hidden = false;
        if (myOpen) {
          quickBtn.className = 'button button-clock-out';
          quickLabel.textContent = 'Registrar salida';
          quickBtn.onclick = () => clock(myEmpId, 'OUT', quickBtn);
        } else {
          quickBtn.className = 'button button-primary';
          quickLabel.textContent = 'Registrar entrada';
          quickBtn.onclick = () => clock(myEmpId, 'IN', quickBtn);
        }
      }
    }
  }

  function renderGeoCell(geo) {
    if (!geo) {
      return '<span class="geo-badge no-gps">Sin GPS</span>';
    }

    const pinIcon = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

    let badge = '';
    if (geo.inGeofence === true) {
      const dist = geo.distanceMeters != null ? `${geo.distanceMeters}m` : 'Verificado';
      badge = `<span class="geo-badge in-center" title="Ubicación verificada en el centro (${dist})">${pinIcon} En centro (${dist})</span>`;
    } else if (geo.inGeofence === false) {
      const dist = geo.distanceMeters != null ? `${geo.distanceMeters}m` : 'Fuera';
      badge = `<span class="geo-badge off-center" title="Fichaje fuera del centro (${dist})">${pinIcon} Fuera (${dist})</span>`;
    } else {
      const acc = geo.accuracy ? `±${geo.accuracy}m` : '';
      badge = `<span class="geo-badge with-gps" title="Coordenadas GPS registradas">${pinIcon} GPS ${acc}</span>`;
    }

    // Para administradores: enlace a Google Maps
    if (me && me.role === 'ADMIN' && typeof geo.latitude === 'number' && typeof geo.longitude === 'number') {
      badge += ` <a href="https://www.google.com/maps?q=${geo.latitude},${geo.longitude}" target="_blank" rel="noopener noreferrer" class="map-link" title="Ver coordenadas en Google Maps">Mapa</a>`;
    }

    return badge;
  }

  function renderEmployees(now = Date.now()) {
    let list = data.employees;

    if (search) {
      list = list.filter(e => e.name.toLocaleLowerCase('es').includes(search));
    }

    if (activeStatusFilter === 'working') {
      list = list.filter(e => openRecord(e.id));
    } else if (activeStatusFilter === 'away') {
      list = list.filter(e => !openRecord(e.id));
    }

    $('employee-empty').hidden = list.length > 0;
    $('results-count').textContent = `${list.length} de ${data.employees.length}`;

    $('employee-list').innerHTML = list.map(employee => {
      const open = openRecord(employee.id);
      const color = /^#[0-9a-f]{6}$/i.test(employee.color) ? employee.color : '#ff7f0a';
      const soft = `${color}18`;
      const canClock = !me || ['ADMIN','RECEPTION'].includes(me.role) || me.employeeId === employee.id;

      const today = dateKey(new Date(now));
      const empTodayRecords = data.records.filter(r => r.employeeId === employee.id && dateKey(new Date(r.clockIn)) === today);
      const empTodayTotal = empTodayRecords.reduce((sum, r) => sum + duration(r, now), 0);

      // Geo info de la entrada actual si existe
      let geoNote = '';
      if (open && open.geoIn) {
        if (open.geoIn.inGeofence === true) {
          geoNote = `<span style="color:var(--tp-ok);font-size:10px;font-weight:600;">📍 En centro (${open.geoIn.distanceMeters ?? 0}m)</span>`;
        } else if (open.geoIn.inGeofence === false) {
          geoNote = `<span style="color:var(--tp-warning);font-size:10px;font-weight:600;">📍 Fuera (${open.geoIn.distanceMeters ?? 0}m)</span>`;
        }
      }

      return `
        <article class="attendance-card-row${open ? ' is-working' : ''}" data-employee="${escapeHTML(employee.id)}">
          <div class="employee-identity">
            <span class="employee-avatar" style="--emp-color:${color};--emp-soft:${soft}">${escapeHTML(initials(employee.name))}</span>
            <div class="employee-names">
              <strong>${escapeHTML(employee.name)}</strong>
              <small>${open ? '● Jornada en curso' : 'Fuera de turno'}</small>
            </div>
          </div>

          <div class="employee-status-col">
            <div class="status-badge-wrap">
              ${open 
                ? `<span class="client-status status-ACTIVO"><span class="pulse-dot"></span>EN TURNO</span>` 
                : `<span class="client-status status-INACTIVO">FUERA</span>`}
              <small style="color:var(--tp-muted);font-size:11px;display:flex;align-items:center;gap:6px;">
                ${open ? `Entrada: <strong>${formatHourMin(open.clockIn)}</strong>` : 'Sin turno activo'}
                ${geoNote}
              </small>
            </div>

            <div class="timer-wrap">
              <span class="attendance-timer${open ? ' is-live' : ''}" data-timer="${open ? escapeHTML(open.id) : ''}">
                ${open ? formatDuration(duration(open, now)) : '00:00:00'}
              </span>
              <span class="timer-caption">${open ? 'Tiempo transcurrido' : `Total hoy: ${formatDuration(empTodayTotal, false)}`}</span>
            </div>
          </div>

          <div class="employee-actions">
            ${canClock ? `
              <button class="button ${open ? 'button-clock-out' : 'button-primary'}" data-clock="${escapeHTML(employee.id)}" data-action="${open ? 'OUT' : 'IN'}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;" aria-hidden="true">
                  ${open 
                    ? '<rect x="6" y="6" width="12" height="12" rx="1"/>' 
                    : '<polygon points="5 3 19 12 5 21 5 3"/>'}
                </svg>
                ${open ? 'Fichar salida' : 'Fichar entrada'}
              </button>
            ` : '<span class="read-only-tag">Solo lectura</span>'}
          </div>
        </article>
      `;
    }).join('');

    $('employee-list').querySelectorAll('[data-clock]').forEach(button => {
      button.addEventListener('click', () => clock(button.dataset.clock, button.dataset.action, button));
    });
  }

  function actorLabel(actor) {
    if (!actor) return '<small>Autor no registrado (fichaje anterior)</small>';
    const role = {ADMIN:'Administración',RECEPTION:'Recepción',TRAINER:'Trabajador'}[actor.role] || actor.role;
    return `<small class="clock-author">Registrado por ${escapeHTML(actor.name)} · ${escapeHTML(role)}${actor.onBehalf ? ' · En nombre del trabajador' : ''}</small>`;
  }
  function renderHistory(now = Date.now()) {
    const employeeId = $('history-employee')?.value || 'all';
    const records = data.records.filter(r => employeeId === 'all' || r.employeeId === employeeId);

    $('history-empty').hidden = records.length > 0;
    $('results-count').textContent = `${records.length} ${records.length === 1 ? 'fichaje' : 'fichajes'}`;

    $('history-list').innerHTML = records.map(record => {
      const isOpen = !record.clockOut;
      const recDuration = duration(record, now);
      const geoInfo = record.geoIn || record.geoOut;

      return `
        <tr>
          <td>
            <strong style="color:var(--tp-ink);font-weight:700;">${escapeHTML(employeeName(record.employeeId))}</strong>
          </td>
          <td>${escapeHTML(formatDateTime(record.clockIn))}${actorLabel(record.actorIn)}</td>
          <td>${isOpen ? '<span style="color:var(--tp-ok);font-weight:700;">Jornada en curso</span>' : escapeHTML(formatDateTime(record.clockOut)) + actorLabel(record.actorOut)}</td>
          <td class="duration-cell">${escapeHTML(formatDuration(recDuration, !isOpen))}</td>
          <td>${renderGeoCell(geoInfo)}</td>
          <td>
            ${isOpen 
              ? '<span class="history-open-pill"><span class="pulse-dot"></span>En curso</span>' 
              : '<span class="history-closed-pill">Completada</span>'}
          </td>
        </tr>
      `;
    }).join('');
  }

  function render() {
    const now = Date.now();
    renderSummary(now);
    if (activeTab === 'clocking') {
      renderEmployees(now);
    } else {
      renderHistory(now);
    }
    const timeFormatted = new Intl.DateTimeFormat('es-ES', { timeStyle: 'medium' }).format(new Date());
    $('last-update').textContent = `Actualizado ${timeFormatted}`;
    $('table-summary').textContent = activeTab === 'clocking'
      ? `${data.employees.length} profesionales registrados`
      : `${data.records.length} registros en el período`;
  }

  async function clock(employeeId, action, button) {
    if (me && !['ADMIN','RECEPTION'].includes(me.role) && me.employeeId !== employeeId) {
      warn('Solo puedes registrar tus propios fichajes.');
      return;
    }

    if (me && me.employeeId !== employeeId && !confirm(`¿Registrar ${action === 'IN' ? 'entrada' : 'salida'} de ${employeeName(employeeId)}? El fichaje quedará registrado por ${me.name}. Si se recoge ubicación, será la de este dispositivo.`)) return;
    const originalText = button ? button.innerHTML : '';
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span style="opacity:.8;">Obteniendo ubicación...</span>';
    }

    try {
      // Captura puntual de la ubicación del dispositivo que registra el fichaje.
      const geo = await getCurrentGeolocation();

      if (button) {
        button.innerHTML = '<span style="opacity:.8;">Registrando...</span>';
      }

      const res = await api('attendance/clock', 'POST', { employeeId, action, geo });
      const empName = employeeName(employeeId);

      // Feedback según la verificación de ubicación
      const recordedGeo = action === 'IN' ? res.geoIn : res.geoOut;
      let geoFeedback = '';
      if (recordedGeo) {
        if (recordedGeo.inGeofence === true) {
          geoFeedback = ` · Ubicación verificada en centro (${recordedGeo.distanceMeters ?? 0}m)`;
        } else if (recordedGeo.inGeofence === false) {
          geoFeedback = ` · Aviso: a ${recordedGeo.distanceMeters ?? 0}m del centro`;
        }
      }

      const msg = action === 'IN'
        ? `Entrada registrada para ${empName}${geoFeedback}.`
        : `Salida registrada para ${empName}${geoFeedback}. Jornada finalizada.`;

      toast(msg);
      await load($('history-from').value, $('history-to').value, true);
    } catch (error) {
      warn(error.message);
      toast(error.message, true);
      if (button) {
        button.disabled = false;
        button.innerHTML = originalText;
      }
    }
  }

  function selectTab(tab) {
    activeTab = tab;
    const isHistory = tab === 'history';

    $('clocking-panel').hidden = isHistory;
    $('history-panel').hidden = !isHistory;
    $('clocking-toolbar').hidden = isHistory;
    $('history-toolbar').hidden = !isHistory;

    $('clocking-tab').setAttribute('aria-pressed', String(!isHistory));
    $('history-tab').setAttribute('aria-pressed', String(isHistory));

    if (isHistory) {
      void load($('history-from').value, $('history-to').value);
    } else {
      void load();
    }
  }

  function setStatusFilter(filter) {
    activeStatusFilter = filter;
    $('card-working').setAttribute('aria-pressed', String(filter === 'working'));
    $('card-away').setAttribute('aria-pressed', String(filter === 'away'));
    $('card-total').setAttribute('aria-pressed', String(filter === 'all'));
    if (activeTab !== 'clocking') {
      selectTab('clocking');
    } else {
      renderEmployees();
    }
  }

  // Inicialización de fechas
  const today = dateKey();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  $('history-from').value = dateKey(weekAgo);
  $('history-to').value = today;

  // Fecha en panel
  const dateFormatted = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' }).format(new Date());
  $('panel-date-sub').textContent = `${dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1)} · Tiempo real`;

  // Event Listeners
  $('clocking-tab').addEventListener('click', () => selectTab('clocking'));
  $('history-tab').addEventListener('click', () => selectTab('history'));

  $('employee-search').addEventListener('input', e => {
    search = e.target.value.trim().toLocaleLowerCase('es');
    $('clear-search').hidden = !search;
    renderEmployees();
  });

  $('clear-search').addEventListener('click', () => {
    $('employee-search').value = '';
    search = '';
    $('clear-search').hidden = true;
    renderEmployees();
  });

  $('refresh-button').addEventListener('click', () => load());
  $('refresh-history').addEventListener('click', () => load($('history-from').value, $('history-to').value));
  $('export-history').addEventListener('click', async () => {
    const button = $('export-history');
    button.disabled = true;
    try {
      const from = $('history-from').value, to = $('history-to').value;
      if (!from || !to || from > to) throw new Error('Selecciona un período válido para exportar.');
      const query = new URLSearchParams({ from, to });
      const employeeId = $('history-employee').value;
      if (employeeId && employeeId !== 'all') query.set('employeeId', employeeId);
      const response = await fetch('/api/attendance/export?' + query, { headers: { Authorization: `Bearer ${adminToken}` }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error((await response.json()).error || 'No se pudo exportar el informe.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `fichajes-${from}-${to}.csv`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Informe descargado. Puedes abrirlo con Excel.');
    } catch (error) { warn(error.message); } finally { button.disabled = false; }
  });
  $('history-employee')?.addEventListener('change', () => renderHistory());

  // Filtros rápidos al pulsar en las tarjetas de resumen
  $('card-working').addEventListener('click', () => setStatusFilter(activeStatusFilter === 'working' ? 'all' : 'working'));
  $('card-away').addEventListener('click', () => setStatusFilter(activeStatusFilter === 'away' ? 'all' : 'away'));
  $('card-total').addEventListener('click', () => setStatusFilter('all'));

  if (!serverMode) {
    warn('Los fichajes necesitan el servidor local. Ejecuta npm run dev y accede con credenciales.');
    document.querySelectorAll('button,input,select').forEach(el => { el.disabled = true; });
    return;
  }

  if (!adminToken) {
    location.href = 'login.html';
    return;
  }

  await load();

  // Tick live timers every second
  window.TrainersPoint.poll(() => {
    const now = Date.now();
    renderSummary(now);
    if (activeTab === 'clocking') {
      document.querySelectorAll('[data-timer]').forEach(el => {
        const timerId = el.dataset.timer;
        if (!timerId) return;
        const record = data.records.find(r => r.id === timerId);
        if (record && !record.clockOut) {
          el.textContent = formatDuration(duration(record, now));
        }
      });
    }
  }, 1000);

  // Wait for the preceding request and pause refresh while the screen is hidden.
  window.TrainersPoint.poll(() => activeTab === 'history'
    ? load($('history-from').value, $('history-to').value, true)
    : load(undefined, undefined, true), 20000);
})();
