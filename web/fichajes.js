(async function attendanceApp() {
  'use strict';
  const $ = id => document.getElementById(id);
  const serverMode = window.CALENDAR_SERVER === true;
  let adminToken = serverMode ? sessionStorage.getItem('calendar-user-token') || window.CALENDAR_DEV_TOKEN || sessionStorage.getItem('calendar-admin-token') || '' : '';
  let data = { timezone: 'Europe/Madrid', employees: [], records: [], serverNow: new Date().toISOString() };
  let activePanel = 'clocking';
  let search = '';
  let toastTimer;

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const dateKey = (value = new Date(), timezone = data.timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('');
  const formatDateTime = value => value ? new Intl.DateTimeFormat('es-ES', { timeZone: data.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  const formatDuration = (milliseconds, seconds = true) => {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const rest = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}${seconds ? `:${String(rest).padStart(2, '0')}` : ''}`;
  };
  const duration = (record, now = Date.now()) => Math.max(0, (record.clockOut ? new Date(record.clockOut).getTime() : now) - new Date(record.clockIn).getTime());
  const openRecord = employeeId => data.records.find(record => record.employeeId === employeeId && !record.clockOut);
  const employeeName = id => data.employees.find(employee => employee.id === id)?.name || 'Empleado no disponible';

  async function api(path, method = 'GET', body) {
    const response = await fetch(`/api/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if(response.status===401) location.href='login.html';
    if (!response.ok) throw new Error(result.error || 'No se ha podido completar la operación.');
    return result;
  }

  function warn(message) {
    $('attendance-warning').textContent = message;
    $('attendance-warning').hidden = false;
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
  }

  async function load(from = dateKey(), to = from, quiet = false) {
    try {
      const next = await api(`attendance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      data = next;
      sessionStorage.setItem('calendar-admin-token', adminToken);
      $('attendance-warning').hidden = true;
      fillEmployeeFilter();
      render();
    } catch (error) {
      if (!quiet) warn(error.message);
    }
  }

  function fillEmployeeFilter() {
    const select = $('history-employee');
    const selected = select.value || 'all';
    select.innerHTML = '<option value="all">Todos los empleados</option>' + data.employees.map(employee => `<option value="${escapeHTML(employee.id)}">${escapeHTML(employee.name)}</option>`).join('');
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  }

  function renderSummary(now = Date.now()) {
    const working = data.employees.filter(employee => openRecord(employee.id)).length;
    const today = dateKey(new Date(now));
    const todayRecords = data.records.filter(record => dateKey(new Date(record.clockIn)) === today);
    const total = todayRecords.reduce((sum, record) => sum + duration(record, now), 0);
    $('working-count').textContent = working;
    $('away-count').textContent = Math.max(0, data.employees.length - working);
    $('employee-count').textContent = data.employees.length;
    $('today-total').textContent = formatDuration(total, false);
  }

  function renderEmployees(now = Date.now()) {
    const filtered = data.employees.filter(employee => employee.name.toLocaleLowerCase('es').includes(search));
    $('employee-empty').hidden = filtered.length > 0;
    $('employee-list').innerHTML = filtered.map(employee => {
      const open = openRecord(employee.id);
      const color = /^#[0-9a-f]{6}$/i.test(employee.color) ? employee.color : '#758b94';
      const soft = `${color}18`;
      return `<article class="employee-row${open ? ' is-working' : ''}" role="row" data-employee="${escapeHTML(employee.id)}">
        <div class="employee-person" role="cell"><span class="avatar" style="--employee-color:${color};--employee-soft:${soft}">${escapeHTML(initials(employee.name))}</span><div><strong>${escapeHTML(employee.name)}</strong><small>Empleado del centro</small></div></div>
        <div class="status" role="cell"><strong><span class="status-dot"></span>${open ? 'Trabajando' : 'Fuera'}</strong><small>${open ? `Entrada · ${formatDateTime(open.clockIn).split(', ').pop()}` : 'Sin jornada abierta'}</small></div>
        <div class="shift-time" role="cell" data-timer="${open ? escapeHTML(open.id) : ''}">${open ? formatDuration(duration(open, now)) : '00:00:00'}<small>${open ? 'Jornada en curso' : 'Tiempo de la jornada'}</small></div>
        <button class="clock-button ${open ? 'out' : 'in'}" data-clock="${escapeHTML(employee.id)}" data-action="${open ? 'OUT' : 'IN'}">${open ? '■ Salir' : '▶ Entrar'}</button>
      </article>`;
    }).join('');
    $('employee-list').querySelectorAll('[data-clock]').forEach(button => button.addEventListener('click', () => clock(button.dataset.clock, button.dataset.action, button)));
  }

  function renderHistory(now = Date.now()) {
    const employeeId = $('history-employee').value;
    const records = data.records.filter(record => employeeId === 'all' || record.employeeId === employeeId);
    $('history-empty').hidden = records.length > 0;
    $('history-list').innerHTML = records.map(record => `<tr>
      <td>${escapeHTML(employeeName(record.employeeId))}</td>
      <td>${escapeHTML(formatDateTime(record.clockIn))}</td>
      <td>${escapeHTML(record.clockOut ? formatDateTime(record.clockOut) : 'Jornada abierta')}</td>
      <td>${escapeHTML(formatDuration(duration(record, now), false))}</td>
      <td class="${record.clockOut ? 'history-closed' : 'history-open'}">${record.clockOut ? 'Finalizada' : 'En curso'}</td>
    </tr>`).join('');
  }

  function render() {
    const now = Date.now();
    renderSummary(now);
    renderEmployees(now);
    renderHistory(now);
    $('last-update').textContent = `Actualizado ${new Intl.DateTimeFormat('es-ES', { timeStyle: 'medium' }).format(new Date())}`;
  }

  async function clock(employeeId, action, button) {
    button.disabled = true;
    try {
      await api('attendance/clock', 'POST', { employeeId, action });
      toast(action === 'IN' ? `Entrada registrada para ${employeeName(employeeId)}.` : `Salida registrada para ${employeeName(employeeId)}.`);
      await load();
    } catch (error) {
      warn(error.message);
      button.disabled = false;
    }
  }

  function selectPanel(panel) {
    activePanel = panel;
    const history = panel === 'history';
    $('clocking-panel').hidden = history;
    $('history-panel').hidden = !history;
    $('clocking-tab').classList.toggle('active', !history);
    $('history-tab').classList.toggle('active', history);
    $('clocking-tab').setAttribute('aria-selected', String(!history));
    $('history-tab').setAttribute('aria-selected', String(history));
    if (history) void load($('history-from').value, $('history-to').value);
    else void load();
  }

  $('current-date').textContent = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' }).format(new Date());
  const today = dateKey();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  $('history-from').value = dateKey(weekAgo);
  $('history-to').value = today;
  $('employee-search').addEventListener('input', event => { search = event.target.value.trim().toLocaleLowerCase('es'); renderEmployees(); });
  $('clocking-tab').addEventListener('click', () => selectPanel('clocking'));
  $('history-tab').addEventListener('click', () => selectPanel('history'));
  $('refresh-history').addEventListener('click', () => load($('history-from').value, $('history-to').value));
  $('history-employee').addEventListener('change', () => renderHistory());

  if (!serverMode) {
    warn('Los fichajes necesitan el servidor local. Ejecuta npm run dev:calendar y abre http://127.0.0.1:3000/fichajes.html.');
    document.querySelectorAll('button,input,select').forEach(element => { element.disabled = true; });
    return;
  }
  if (!adminToken) {location.href='login.html';return;}
  await load();
  setInterval(() => {
    const now = Date.now();
    renderSummary(now);
    if (activePanel === 'clocking') renderEmployees(now);
    else renderHistory(now);
  }, 1000);
  setInterval(() => {
    if (activePanel === 'clocking') void load(dateKey(), dateKey(), true);
  }, 10000);
})();
