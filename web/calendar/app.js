/* Modo servidor con API; Live Server conserva la demostración local. */
(async function boot() {
'use strict';
const C = window.CalendarCore;
const $ = id => document.getElementById(id);
const KEY = 'trainers-point-calendar-v1';
const STATUS = { confirmed: 'Confirmada', pending: 'Pendiente', completed: 'Finalizada', cancelled: 'Cancelada', no_show: 'No presentado' };
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const todayKey = () => C.dateKey(new Date());
const dateFormats = new Map();
const prettyDate = (key, options) => { const id=JSON.stringify(options); if(!dateFormats.has(id))dateFormats.set(id,new Intl.DateTimeFormat('es-ES',options)); return dateFormats.get(id).format(C.parseDate(key)); };
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const state = { date: todayKey(), view: window.innerWidth < 760 ? 'day' : 'week', employee: 'all', service: 'all', room: 'all', editing: null };
const currentGymId = () => localStorage.getItem('calendar-selected-gym') || data?.gymId || (data?.centers || [])[0]?.id || 'local';
let storageWritable = true;
let toastTimer;

function seedData() {
  const employees = [{ id: 'e1', name: 'Álex Martín', color: '#8498bc' }, { id: 'e2', name: 'Lucía Serra', color: '#cb9a88' }, { id: 'e3', name: 'Dani López', color: '#9baa8b' }];
  const services = [{ id: 's1', name: 'Entrenamiento personal', duration: 60 }, { id: 's2', name: 'Fuerza y movilidad', duration: 60 }, { id: 's3', name: 'Valoración inicial', duration: 30 }];
  const rooms = [{ id: 'r1', name: 'Sala principal' }, { id: 'r2', name: 'Sala funcional' }, { id: 'r3', name: 'Estudio' }];
  const clients = ['Ana Torres', 'Marcos Vidal', 'Sofía Navarro', 'Pablo Romero', 'Elena Ruiz', 'Hugo Costa', 'Carla Molina', 'Diego Santos', 'Laura Gil', 'Mateo Soler', 'Nora García', 'Leo Ferrer'].map((name, i) => ({ id: `c${i + 1}`, name, email: `cliente${i + 1}@example.com`, phone: '', notes: 'Ficha de demostración. Sustituir por los datos del proyecto al integrar.' }));
  const schedule = DAYS.map((_, i) => ({ closed: i === 6, open: '09:00', close: i === 5 ? '14:00' : '21:00' }));
  const week = C.monday(todayKey());
  const bookings = [];
  let index = 0;
  for (let day = 0; day < 6; day++) {
    for (let worker = 0; worker < 3; worker++) {
      const start = 540 + ((day + worker) % 4) * 60;
      bookings.push({ id: `demo-${index}`, clientId: clients[index % clients.length].id, employeeId: employees[worker].id, serviceId: services[(day + worker) % 3].id, roomId: rooms[worker].id, date: C.addDays(week, day), start: C.timeLabel(start), end: C.timeLabel(start + 60), status: day < 2 ? 'completed' : (day + worker) % 3 === 0 ? 'pending' : 'confirmed', notes: '' });
      index++;
      if (day < 5 && worker < 2) {
        bookings.push({ id: `demo-${index}`, clientId: clients[index % clients.length].id, employeeId: employees[worker].id, serviceId: 's1', roomId: rooms[worker].id, date: C.addDays(week, day), start: worker === 0 ? '16:00' : '17:30', end: worker === 0 ? '17:00' : '18:30', status: day === 2 && worker === 1 ? 'cancelled' : 'confirmed', notes: '' });
        index++;
      }
    }
  }
  return { version: 1, employees, services, rooms, clients, schedule, bookings };
}

function validData(value) {
  if (!value || value.version !== 1) return false;
  const collections = ['employees', 'services', 'rooms', 'clients', 'bookings', 'schedule'];
  if (!collections.every(key => Array.isArray(value[key])) || value.schedule.length !== 7) return false;
  const named = ['employees', 'services', 'rooms', 'clients'];
  if (!named.every(key => value[key].length > 0 && value[key].every(x => x && typeof x.id === 'string' && typeof x.name === 'string'))) return false;
  if (!value.employees.every(x => /^#[0-9a-f]{6}$/i.test(x.color))) return false;
  if (!value.schedule.every(x => x && typeof x.closed === 'boolean' && /^\d{2}:\d{2}$/.test(x.open) && /^\d{2}:\d{2}$/.test(x.close) && C.minutes(x.open) >= 0 && C.minutes(x.close) < 1440 && C.minutes(x.open) < C.minutes(x.close))) return false;
  return value.bookings.every(x => x && typeof x.id === 'string' && C.validDate(x.date) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.start) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.end) && C.minutes(x.start) < C.minutes(x.end) && Object.hasOwn(STATUS, x.status) && [['clients','clientId'],['employees','employeeId'],['services','serviceId'],['rooms','roomId']].every(([list,key]) => value[list].some(item => item.id === x[key])));
}
function warn(message) { $('storage-warning').textContent = message; $('storage-warning').hidden = false; }
function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (!validData(stored)) throw new Error('Formato no válido');
      return stored;
    }
  } catch {
    storageWritable = false;
    warn('No se han podido leer los datos locales. Se muestra una demostración temporal; los datos anteriores no se sobrescribirán.');
  }
  return seedData();
}
const serverMode = window.CALENDAR_SERVER === true;
let adminToken = serverMode ? sessionStorage.getItem('calendar-user-token') || sessionStorage.getItem('calendar-admin-token') || window.CALENDAR_DEV_TOKEN || '' : '';
$('mode-title').textContent = serverMode ? 'Servidor conectado' : 'Demostración local';
$('mode-description').textContent = serverMode
  ? 'Reservas y disponibilidad actualizadas para tu equipo.'
  : 'Los cambios se guardan solo en este navegador.';
const fromServer = b => ({...b,status:b.status.toLowerCase()});
const toServer = b => ({...b,status:b.status.toUpperCase()});
async function api(path,method='GET',body) {
  const headers = {'Content-Type':'application/json','Authorization':'Bearer '+adminToken};
  const gym = currentGymId();
  if (gym && gym !== 'local') headers['x-calendar-gym'] = gym;
  const res=await fetch('/api/'+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
  const result=await res.json();
  if(res.status===401) location.href='login.html';
  if(!res.ok)throw new Error(result.error||'Error de conexión');
  return result;
}
let data;
let currentUser = null;
let awsClients = [];
let awsClientsLoaded = false;
async function loadBookingClients() {
  if (!serverMode) return;
  try {
    const result = await api('clients?all=true');
    awsClientsLoaded = true;
    awsClients = (result.clients || []).map(client => ({
      id: client.id,
      name: `${client.firstName} ${client.lastName}`.trim(),
      email: client.email || '',
      phone: client.phone || '',
      notes: client.notes || '',
      status: client.status === 'BAJA' ? 'BLOCKED' : client.status === 'INACTIVO' ? 'INACTIVE' : 'ACTIVE',
    }));
  } catch (_) {
    awsClientsLoaded = false;
  }
}
if(serverMode) {
  if(!adminToken){location.href='login.html';return;}
  currentUser = await api('me');
  if (currentUser.role === 'TRAINER') {
    document.querySelector('h1').textContent='Mi calendario';
    state.employee = currentUser.employeeId;
    $('new-booking').hidden = true;
    $('schedule-button').hidden = true;
  } else if (currentUser.role !== 'ADMIN') {
    $('schedule-button').hidden = true;
  }
  try {data=await api('state');data.bookings=data.bookings.map(fromServer);await loadBookingClients();sessionStorage.setItem('calendar-admin-token',adminToken);}
  catch(e){sessionStorage.removeItem('calendar-admin-token');warn(e.message+'. Recarga para volver a conectar.');$('new-booking').disabled=true;$('schedule-button').disabled=true;return;}
} else data=loadData();
let polling=false,clientPackages=[],packageRequest=0,packageBusy=false,pendingPackageKey=null,newPendingPackageId=null;
async function refreshServer(force=false) {
  if(polling)return;
  polling=true;
  try {
    const next=await api('state');
    if(force||next.revision!==data.revision||JSON.stringify(next.clientDebts||{})!==JSON.stringify(data.clientDebts||{})||JSON.stringify(next.clientPackageAlerts||{})!==JSON.stringify(data.clientPackageAlerts||{})||JSON.stringify(next.bookings.map(b=>[b.id,b.paymentDue]))!==JSON.stringify(data.bookings.map(b=>[b.id,b.paymentDue]))) {
      data={...next,bookings:next.bookings.map(fromServer)};
      await loadBookingClients();
      // Do not change form values or the version captured when a dialog was opened.
      if(!document.querySelector('dialog[open]')) setupSelects();
      render();
      updateDebtDetail();
      updateRenewalDetail();
    }
    $('storage-warning').hidden=true;
  } finally {polling=false;}
}
function saveData() {
  if (!storageWritable) return false;
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { warn('No hay espacio disponible en el navegador para guardar los cambios.'); return false; }
}
const COBOSU_ID = '__cobosu';
function cobosuColumn() {
  return { id: COBOSU_ID, name: 'Cobosu', color: '#1e3a8a', schedule: data.schedule, isCobosu: true };
}
const lookupIndexes = new Map();
function lookup(collection, id) {
  if (collection === 'employees' && id === COBOSU_ID) return cobosuColumn();
  const items=data[collection]; let index=lookupIndexes.get(collection);
  if(!index||index.items!==items||index.size!==items.length){index={items,size:items.length,byId:new Map(items.map(item=>[item.id,item]))};lookupIndexes.set(collection,index);}
  return index.byId.get(id) || { name: 'Sin asignar' };
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function visibleDates() {
  if (state.view === 'day') return [state.date];
  if (state.view === 'week') return Array.from({ length: 7 }, (_, i) => C.addDays(C.monday(state.date), i));
  const first = `${state.date.slice(0, 7)}-01`;
  const start = C.monday(first);
  return Array.from({ length: 42 }, (_, i) => C.addDays(start, i));
}
function visibleBookings() {
  const dates = new Set(visibleDates());
  const activeGym = currentGymId();
  return data.bookings.filter(b => dates.has(b.date) && (!b.centerId || b.centerId === activeGym || activeGym === 'local') && (state.employee === 'all' || (b.employeeId||'__unassigned') === state.employee) && (state.service === 'all' || b.serviceId === state.service) && (state.room === 'all' || b.roomId === state.room));
}
function fillSelect(id, list, extra = '') { $(id).innerHTML = extra + list.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join(''); }
function setupSelects() {
  fillSelect('employee-filter', data.employees.filter(e => e.active !== false), '<option value="all">Ver todos</option><option value="__cobosu">Cobosu</option>'+(serverMode&&currentUser?.role!=='TRAINER'?'<option value="__unassigned">Sin asignar</option>':''));
  fillSelect('service-filter', data.services.filter(s => s.active !== false), '<option value="all">Todos los servicios</option>');
  fillSelect('room-filter', data.rooms, '<option value="all">Todos los espacios</option>');
  fillSelect('booking-employee', data.employees.filter(e => e.active !== false), '<option value="__cobosu">Cobosu</option>' + (serverMode?'<option value="">Sin asignar</option>':''));
  fillSelect('booking-service', data.services.filter(s => s.active !== false));
  fillSelect('booking-room', data.rooms);
  for(const [id,key] of [['employee-filter','employee'],['service-filter','service'],['room-filter','room']]){ $(id).value=state[key]; if(!$(id).value){state[key]='all';$(id).value='all';} }
  if (currentUser?.role === 'TRAINER') {
    state.employee = currentUser.employeeId;
    const empFilter = $('employee-filter');
    if (empFilter) {
      empFilter.value = currentUser.employeeId;
      empFilter.disabled = true;
    }
  }
}
function titleForPeriod(dates) {
  if (state.view === 'day') return prettyDate(state.date, { day: 'numeric', month: 'long', year: 'numeric' });
  if (state.view === 'month') return prettyDate(state.date, { month: 'long', year: 'numeric' });
  const start = dates[0], end = dates.at(-1);
  return start.slice(0, 7) === end.slice(0, 7) ? `${C.parseDate(start).getDate()} – ${prettyDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}` : `${prettyDate(start, { day: 'numeric', month: 'short', ...(start.slice(0,4) !== end.slice(0,4) ? {year:'numeric'} : {}) })} – ${prettyDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
const debtMoney=v=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v));
function upcomingDebt(b){return ['pending','confirmed'].includes(b.status)&&b.date>=todayKey()?Number(data.clientDebts?.[b.clientId]||0):0;}
function debtBadge(b){const amount=upcomingDebt(b);if(b.paymentDue&&amount<=0&&['pending','confirmed'].includes(b.status))return '<span class="booking-debt-badge">⚠ Sesión pendiente de cobro</span>';return amount>0?`<span class="booking-debt-badge">⚠ Pago pendiente · ${escapeHTML(debtMoney(amount))}</span>`:'';}
function updateDebtDetail(){
 const box=$('booking-debt');if(!box)return;
 const id=$('booking-client').value,amount=Number(data.clientDebts?.[id]||0);
 box.hidden=!(amount>0);box.innerHTML=amount>0?`<strong>Pago pendiente · ${escapeHTML(debtMoney(amount))}</strong><p>Saldo pendiente de productos y bonos del cliente. Este aviso no bloquea la reserva.</p><a href="/productos.html?client=${encodeURIComponent(id)}">Consultar deudas y registrar un pago ↗</a>`:'';
}
function upcomingRenewal(b){return ['pending','confirmed'].includes(b.status)?(data.clientPackageAlerts?.[b.clientId]||null):null;}
function renewalBadge(b){const alert=upcomingRenewal(b);if(!alert||!alert.needsRenewal)return '';return `<span class="booking-renewal-badge" title="${escapeHTML(alert.message)}">🔄 ${escapeHTML(alert.message)}</span>`;}
function updateRenewalDetail(){
 const box=$('booking-renewal-alert');if(!box)return;
 const id=$('booking-client').value,alert=data.clientPackageAlerts?.[id];
 if(!alert||!alert.needsRenewal){box.hidden=true;box.innerHTML='';return;}
 box.hidden=false;
 box.innerHTML=`<strong>⚠️ Aviso de bono · ${escapeHTML(alert.serviceName)}</strong><p>${escapeHTML(alert.message)}. Ofrece la renovación del bono al cliente.</p><a href="/clientes/ficha.html?id=${encodeURIComponent(id)}">Ver bono en la ficha del cliente ↗</a>`;
}
function eventLabel(b) { const renewal=upcomingRenewal(b); return `${lookup('clients', b.clientId).name}, ${lookup('services', b.serviceId).name}, ${b.start} a ${b.end}, ${STATUS[b.status]}, ${lookup('employees', b.employeeId).name}, ${lookup('rooms', b.roomId).name}, ${b.centerName||'Centro actual'}${b.needsReschedule?', Pendiente de reprogramación':''}${upcomingDebt(b)>0?', Pago pendiente '+debtMoney(upcomingDebt(b)):''}${renewal?', '+renewal.message:''}`; }

function employeesForDate(date, dayBookings, allEmployees) {
  if (state.employee !== 'all') {
    if (state.employee === COBOSU_ID) return [cobosuColumn()];
    if (state.employee === '__unassigned') {
      return [{ id: '__unassigned', name: 'Sin asignar', color: '#b86b00', schedule: data.schedule }];
    }
    const emp = allEmployees.find(e => e.id === state.employee);
    return emp ? [emp] : [];
  }

  const scheduled = [cobosuColumn()];

  for (const emp of allEmployees) {
    if (emp.id === '__unassigned' || emp.id === COBOSU_ID) continue;
    const shift = emp.shifts?.find(s => s.date === date);
    if (shift && shift.periods && shift.periods.length > 0) {
      scheduled.push(emp);
    }
  }

  const bookingEmpIds = new Set(dayBookings.map(b => b.employeeId).filter(Boolean));
  for (const emp of allEmployees) {
    if (emp.id !== COBOSU_ID && bookingEmpIds.has(emp.id) && !scheduled.some(s => s.id === emp.id)) {
      scheduled.push(emp);
    }
  }

  if (serverMode && currentUser?.role !== 'TRAINER' && dayBookings.some(b => !b.employeeId)) {
    scheduled.push({ id: '__unassigned', name: 'Sin asignar', color: '#b86b00', schedule: data.schedule });
  }

  return scheduled;
}

function renderTimeGrid(dates, bookings, employees) {
  const selected = lookup('services',state.service), duration = selected.duration || 30;
  const byColumn = new Map();
  for(const booking of bookings){const key=booking.date+'\0'+(booking.employeeId||'__unassigned');if(!byColumn.has(key))byColumn.set(key,[]);byColumn.get(key).push(booking);}

  let currentCol = 2;
  const dateLayouts = dates.map(date => {
    const dayBookings = bookings.filter(b => b.date === date);
    const dayEmps = employeesForDate(date, dayBookings, employees);
    const span = Math.max(1, dayEmps.length);
    const startCol = currentCol;
    currentCol += span;
    return { date, dayBookings, dayEmps, startCol, span };
  });

  const totalGridCols = currentCol - 2;
  const minWidth = state.view === 'day' ? 190 : 130;

  let html = `<div class="time-grid" style="grid-template-columns:58px repeat(${Math.max(totalGridCols, 1)},minmax(${minWidth}px,1fr))"><div class="corner" style="grid-column:1;grid-row:1 / 3;top:0">HORA</div>`;

  dateLayouts.forEach(d => {
    const today = d.date === todayKey();
    html += `<div class="day-heading ${today ? 'today' : ''}" style="grid-column:${d.startCol} / span ${d.span};grid-row:1">
      <span class="day-name">${prettyDate(d.date, { weekday: 'short' })}</span>
      <strong>${C.parseDate(d.date).getDate()}</strong>
      <span>${prettyDate(d.date, { month: 'short' })}</span>
      ${serverMode && currentUser?.role !== 'TRAINER' ? `<button type="button" class="add-trainer-day-btn" data-add-trainer-date="${d.date}" title="Planificar o añadir entrenador para el ${prettyDate(d.date, { day: 'numeric', month: 'long' })}" aria-label="Añadir entrenador">＋</button>` : ''}
    </div>`;
  });

  dateLayouts.forEach(d => {
    if (d.dayEmps.length === 0) {
      html += `<div class="employee-heading empty-day-heading" style="grid-column:${d.startCol};grid-row:2">
        ${serverMode && currentUser?.role !== 'TRAINER' ? `<button type="button" class="add-trainer-pill-btn" data-add-trainer-date="${d.date}">＋ Añadir entrenador</button>` : '<span style="color:var(--muted);font-size:10px;">Sin turnos</span>'}
      </div>`;
    } else {
      d.dayEmps.forEach((employee, j) => {
        const isCobosu = employee.id === COBOSU_ID;
        const periods = isCobosu ? (() => { const h = C.hoursFor(d.date, data.schedule); return h.closed ? [] : [h]; })() : C.employeePeriods(employee, d.date, data.schedule);
        const shiftText = isCobosu ? (periods.length ? `App · ${periods[0].open}–${periods[0].close}` : 'Cerrado') : (periods.length ? periods.map(p => p.open + '–' + p.close).join(' · ') : (employee.id === '__unassigned' ? 'Sin asignar' : 'Libre'));
        const isOff = !periods.length && employee.id !== '__unassigned';
        const isEditable = serverMode && currentUser?.role !== 'TRAINER' && employee.id !== '__unassigned' && !isCobosu;
        html += `<div class="employee-heading ${isCobosu ? 'is-cobosu' : ''}" style="grid-column:${d.startCol + j};grid-row:2;--employee-color:${employee.color}" ${isEditable ? `data-shift-employee="${employee.id}" data-shift-date="${d.date}" title="Clic para ajustar el turno o quitar de este día"` : ''}>
          <div class="employee-heading-name"><span class="employee-dot"></span>${escapeHTML(employee.name)}</div>
          <span class="employee-shift-tag ${isOff ? 'is-off' : ''}">${escapeHTML(shiftText)}</span>
        </div>`;
      });
    }
  });

  html += '<div class="time-axis" style="grid-column:1;grid-row:3">' + Array.from({length:24}, (_, hour) => `<div class="hour-label">${C.timeLabel(hour * 60)}</div>`).join('') + '</div>';

  dateLayouts.forEach(d => {
    if (d.dayEmps.length === 0) {
      html += `<div class="time-column empty-day-column ${d.date === todayKey() ? 'is-today' : ''}" style="grid-column:${d.startCol};grid-row:3">
        <div class="empty-day-placeholder">
          <span>Sin turnos planificados</span>
          ${serverMode && currentUser?.role !== 'TRAINER' ? `<button type="button" class="button secondary small-btn" data-add-trainer-date="${d.date}">＋ Añadir entrenador</button>` : ''}
        </div>
      </div>`;
    } else {
      d.dayEmps.forEach((employee, j) => {
        const isCobosu = employee.id === COBOSU_ID;
        html += `<div class="time-column ${d.date === todayKey() ? 'is-today' : ''} ${isCobosu ? 'is-cobosu-column' : ''}" style="grid-column:${d.startCol + j};grid-row:3">`;
        const absent = !isCobosu && (data.leaveRequests || []).some(leave => leave.employeeId === employee.id && leave.status === 'APPROVED' && d.date >= leave.startDate && d.date <= leave.endDate);
        const serviceWorker = isCobosu || !selected?.employeeIds?.length || selected.employeeIds.includes(employee.id) || employee.id === '__unassigned';
        const dayLabel = prettyDate(d.date, { day: 'numeric', month: 'long' });
        for (let slot = 0; slot < 48; slot++) {
          const start = slot * 30;
          const serviceOpen = !selected?.schedule || C.isOpen(d.date, start, start + duration, selected.schedule);
          const open = !absent && serviceOpen && serviceWorker && C.employeeAvailable(employee, d.date, start, start + duration, data.schedule);
          const label = `${dayLabel}, ${C.timeLabel(start)}, ${employee.name}`;
          html += `<button class="time-slot ${open ? '' : 'closed'}" ${open ? '' : 'disabled'} data-slot="${d.date}" data-minute="${start}" data-employee="${employee.id}" aria-label="${open ? 'Nueva reserva: ' : 'Fuera de turno o sin tiempo para el servicio: '}${escapeHTML(label)}" title="${open ? 'Crear reserva' : 'Fuera del horario disponible del empleado'}"></button>`;
        }
        const dayColBookings = byColumn.get(d.date + '\0' + employee.id) || [];
        const placed = C.layoutEvents(dayColBookings);
        placed.forEach(({ event: b, lane, count }) => {
          const startMin = C.minutes(b.start);
          const endMin = C.minutes(b.end);
          const top = startMin * 1.4;
          const height = Math.max((endMin - startMin) * 1.4 - 2, 22);
          const width = 100 / count;
          const left = lane * width;
          const color = lookup('employees', b.employeeId).color || '#7b858d';
          const soft = `${color}18`;
          const clientName = lookup('clients', b.clientId).name;
          const serviceName = lookup('services', b.serviceId).name;
          const roomName = lookup('rooms', b.roomId).name;
          html += `<button class="event ${b.status} ${!b.employeeId ? 'unassigned' : ''}" data-booking="${b.id}" style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px);--event-color:${color};--event-soft:${soft}" aria-label="${escapeHTML(eventLabel(b))}">${debtBadge(b)}${renewalBadge(b)}<div class="event-time">${b.start} – ${b.end}</div><div class="event-title">${escapeHTML(clientName)}</div><div class="event-meta">${escapeHTML(serviceName)} · ${escapeHTML(roomName)}<br>${escapeHTML(b.centerName || 'Centro actual')} · ${escapeHTML(lookup('employees', b.employeeId).name)}${b.needsReschedule ? ' · REPROGRAMAR' : ''}</div></button>`;
        });
        if (d.date === todayKey()) html += '<div class="now-line" aria-hidden="true"></div>';
        html += '</div>';
      });
    }
  });

  return `${html}</div>`;
}

function renderMonth(bookings) {
  const first = `${state.date.slice(0, 7)}-01`;
  const start = C.monday(first);
  const dates = Array.from({ length: 42 }, (_, i) => C.addDays(start, i));
  const byDay = new Map();
  for(const booking of bookings){if(!byDay.has(booking.date))byDay.set(booking.date,[]);byDay.get(booking.date).push(booking);}
  let html = '<div class="month-grid"><div class="month-weekdays">' + DAYS.map(d => `<div>${d.slice(0, 3)}</div>`).join('') + '</div><div class="month-days">';
  dates.forEach(date => {
    const isCurrentMonth = date.slice(0, 7) === state.date.slice(0, 7);
    const isToday = date === todayKey();
    const dayBookings = byDay.get(date)||[];
    const active = dayBookings.filter(b => b.status !== 'cancelled');
    html += `<div class="month-cell ${isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''}" data-month-cell="${date}"><div class="month-cell-header"><span class="day-number">${C.parseDate(date).getDate()}</span>${active.length ? `<span class="month-badge">${active.length}</span>` : ''}</div><div class="month-events">${dayBookings.slice(0, 3).map(b => {
      const color = lookup('services', b.serviceId).color || '#317b9b';
      return `<button class="month-event ${b.status}" data-booking="${b.id}" style="--event-color:${color}" title="${escapeHTML(eventLabel(b))}"><span class="month-event-dot"></span><span>${b.start} ${escapeHTML(lookup('clients', b.clientId).name)}${debtBadge(b)}${renewalBadge(b)}<small>${escapeHTML(lookup('services',b.serviceId).name)} · ${escapeHTML(b.centerName||'Centro actual')}${!b.employeeId?' · SIN ASIGNAR':''}${b.needsReschedule?' · REPROGRAMAR':''}</small></span></button>`;
    }).join('')}${dayBookings.length > 3 ? `<div class="month-more">+${dayBookings.length - 3} más</div>` : ''}</div></div>`;
  });
  return `${html}</div></div>`;
}

function render(updatePeriodTitle = false) {
  lookupIndexes.clear();
  const dates = visibleDates();
  const bookings = visibleBookings();
  let employees = state.employee === 'all' ? data.employees.filter(e => e.active !== false) : data.employees.filter(e => e.id === state.employee);
  if(serverMode&&currentUser?.role!=='TRAINER'&&['all','__unassigned'].includes(state.employee))employees=[...employees,{id:'__unassigned',name:'Sin asignar',color:'#b86b00',schedule:data.schedule}];
  const queues=data.bookings.filter(b=>!b.employeeId&&['pending','confirmed'].includes(b.status));
  const reschedules=data.bookings.filter(b=>b.needsReschedule);
  $('planning-alerts').innerHTML=serverMode&&currentUser?.role!=='TRAINER'?`<a href="pendientes.html?tipo=asignacion" ${queues.length?'':'hidden'}>${queues.length} reservas pendientes de asignación →</a><a href="pendientes.html?tipo=reprogramacion" ${reschedules.length?'':'hidden'}>${reschedules.length} reservas pendientes de reprogramación →</a>`:'';
  $('period-label').textContent = titleForPeriod(dates);
  $('stat-total').textContent=bookings.length;
  $('stat-confirmed').textContent=bookings.filter(b=>b.status==='confirmed').length;
  $('stat-pending').textContent=bookings.filter(b=>b.status==='pending').length;
  $('stat-team').textContent=employees.filter(e=>e.id!=='__unassigned').length;
  $('result-count').textContent=bookings.length+' reservas';
  $('clear-filters').hidden=['employee','service','room'].every(k=>state[k]==='all'||k==='employee'&&currentUser?.role==='TRAINER');
  $('jump-date').value = state.date;
  $('calendar').innerHTML = state.view === 'month' ? renderMonth(bookings) : renderTimeGrid(dates, bookings, employees.length ? employees : data.employees);
  checkRepeatWeekButton();
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (updatePeriodTitle) $('calendar').scrollLeft = 0;
}

function updateClientFields() {
  const isNew = $('booking-client').value === 'new';
  $('new-client-fields').hidden = !isNew;
  $('client-name').required = isNew;
  ['client-name','client-email','client-phone'].forEach(id => { $(id).disabled = !isNew; });
  $('view-client').hidden = isNew;
  $('add-client').textContent = isNew ? '← Elegir un cliente existente' : '＋ Añadir nuevo cliente';
  if (isNew) { $('client-search').value = ''; $('client-results').hidden = true; }
}
function availableClients() {
  return (serverMode && awsClientsLoaded ? awsClients : data.clients).filter(client => (client.status || 'ACTIVE') === 'ACTIVE');
}
function renderClientResults() {
  const query = $('client-search').value.trim().toLocaleLowerCase('es');
  const clients = availableClients().filter(client => `${client.name} ${client.email || ''} ${client.phone || ''}`.toLocaleLowerCase('es').includes(query));
  $('client-results').innerHTML = clients.length ? clients.map(client => `<button type="button" class="client-result" role="option" data-client-id="${escapeHTML(client.id)}"><strong>${escapeHTML(client.name)}</strong><span>${escapeHTML(client.email || client.phone || 'Sin datos de contacto')}</span></button>`).join('') : '<p class="client-results-empty">No se han encontrado clientes.</p>';
  $('client-results').hidden = false;
}
function syncClientPicker() {
  const value = $('booking-client').value;
  if(value!==state.packagesClientId)loadClientPackages();
  updateDebtDetail();
  updateRenewalDetail();
  if (!value) {
    $('client-search').value = '';
    $('client-results').hidden = true;
    updateClientFields();
    return;
  }
  if (value === 'new') { updateClientFields(); return; }
  const client = availableClients().find(item => item.id === value);
  $('client-search').value = client?.name || '';
  $('client-results').hidden = true;
}
function updateHoursHint() {
  loadAvailableSlots();
  const date = $('booking-date').value;
  if(!$('booking-employee').value){$('booking-hours').textContent='Pendiente de asignación: se guarda sin confirmar. La disponibilidad se comprobará al asignar un trabajador.';return;}
  if (!C.validDate(date)) { $('booking-hours').textContent = ''; return; }
  const hours = C.hoursFor(date, data.schedule);
  if ($('booking-employee').value === COBOSU_ID) {
    $('booking-hours').textContent = hours.closed ? 'El centro está cerrado este día.' : `Columna Cobosu. Apertura: ${hours.open} – ${hours.close}.`;
    return;
  }
  const employee=lookup('employees',$('booking-employee').value);
  const periods=employee?C.employeePeriods(employee,date,data.schedule):[];
  $('booking-hours').textContent = hours.closed ? 'El centro está cerrado este día.' : !periods.length ? 'Este empleado no trabaja este día.' : `Apertura: ${hours.open} – ${hours.close}. Turno: ${periods.map(p=>p.open+'–'+p.close).join(' y ')}. La reserva completa debe caber en una franja.`;
}
function showBooking(id, date = state.date, minute, employeeId) {
  if (currentUser?.role === 'TRAINER' && !id) return;
  if(!id && (!data.services.some(s=>s.active!==false)||!data.employees.some(e=>e.active!==false))){toast('Añade un servicio y un empleado activos desde el menú.');return;}
  $('booking-form').reset();
  $('booking-error').hidden = true;
  state.editing = id || null;
  const b = id ? data.bookings.find(item => item.id === id) : null;
  state.editingVersion=b?.version;
  state.editingSnapshot=b ? {...b} : null;
  $('view-training-plan').hidden = !serverMode || !b;
  $('view-training-plan').onclick = () => window.TrainersPoint.openTrainingPlan(b.clientId, b.date);
  const bookingClients = serverMode && awsClientsLoaded ? awsClients : data.clients;
  fillSelect('booking-client', bookingClients.filter(c=>(c.status||'ACTIVE')==='ACTIVE'||c.id===b?.clientId), '');
  fillSelect('booking-service', data.services.filter(s=>s.active!==false||s.id===b?.serviceId));
  fillSelect('booking-employee', data.employees.filter(e=>e.active!==false||e.id===b?.employeeId), '<option value="__cobosu">Cobosu</option>' + (serverMode?'<option value="">Sin asignar</option>':''));
  $('booking-client').insertAdjacentHTML('beforeend','<option value="new">＋ Añadir nuevo cliente</option>');
  const hours = C.hoursFor(date, data.schedule);
  const start = minute ?? C.minutes(hours.open);
  const selectedService = data.services.find(s => s.id === state.service && s.active !== false);
  const service = selectedService || data.services.find(s => s.active !== false) || data.services[0];
  const duration = service.duration || 60;
  const values = b || {clientId:'',employeeId:employeeId || (state.employee === 'all' ? data.employees.find(e=>e.active!==false).id : state.employee),serviceId:service.id,roomId:state.room === 'all' ? data.rooms[0].id : state.room,date,start:C.timeLabel(start),end:C.timeLabel(Math.min(start+duration,C.minutes(hours.close))),status:'confirmed',notes:''};
  for (const [field,key] of Object.entries({client:'clientId',employee:'employeeId',service:'serviceId',room:'roomId',date:'date',start:'start',end:'end',status:'status',notes:'notes'})) $('booking-'+field).value = values[key] || '';
  if(employeeId==='__unassigned')$('booking-employee').value='';
  $('booking-history').innerHTML=(b?.history||[]).map(h=>`<p>${escapeHTML(h.at)} · ${escapeHTML(({ASSIGNED:'Trabajador asignado',UPDATED:'Reserva modificada',RESCHEDULE_REQUESTED:'Pendiente de reprogramación'})[h.action]||h.action)} · ${escapeHTML(h.previous.date||'')} ${escapeHTML(h.previous.start||'')} · ${escapeHTML(lookup('employees',h.previous.employeeId).name)}</p>`).join('')+(b?.incidents||[]).map(i=>`<p>Incidencia: ${escapeHTML(i.message)}</p>`).join('');
  syncClientPicker();
  loadClientPackages(b?.packageId||null);
  updateDebtDetail();
  updateRenewalDetail();
  $('booking-end').readOnly=serverMode;
  const assignedEmp = values.employeeId ? lookup('employees', values.employeeId) : null;
  if (b) {
    $('booking-title').textContent = 'Detalle de la reserva';
  } else {
    $('booking-title').textContent = (assignedEmp && assignedEmp.id !== '__unassigned') ? `Nueva cita con ${assignedEmp.name}` : 'Nueva reserva';
  }

  const summaryEmp = $('summary-employee-name');
  if (summaryEmp) summaryEmp.textContent = assignedEmp ? assignedEmp.name : 'Sin asignar';
  const summaryDt = $('summary-datetime');
  if (summaryDt) summaryDt.textContent = `${prettyDate(values.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${values.start} a ${values.end}`;
  if ($('buy-package-result')) { $('buy-package-result').hidden = true; $('buy-package-result').textContent = ''; }

  const isTrainer = currentUser?.role === 'TRAINER';
  $('collect-booking').hidden=isTrainer||!b||b.status!=='completed'||!b.paymentDue;
  const saveBtn = $('booking-form').querySelector('button[type="submit"]');
  if (saveBtn) saveBtn.hidden = isTrainer;
  if ($('cancel-booking')) $('cancel-booking').hidden = isTrainer || !b || (b.status === 'cancelled'&&!b.needsReschedule);
  if ($('add-client')) $('add-client').hidden = isTrainer;
  if ($('unassign-booking')) $('unassign-booking').hidden = isTrainer || !b || !b.employeeId;
  $('booking-dialog').querySelectorAll('input, select, textarea').forEach(el => {
    if (el.id !== 'client-search') el.disabled = isTrainer;
  });

  $('reschedule-booking').hidden=isTrainer||!b||!['pending','confirmed'].includes(b.status);
  $('worker-complete').hidden=!isTrainer||b?.status!=='confirmed';
  $('worker-incident').hidden=!isTrainer||!b;
  updateClientFields(); updateHoursHint();
  $('booking-dialog').showModal();
  if (!b) setTimeout(() => $('client-search')?.focus(), 60);
}
let slotsRequest=0;
async function loadAvailableSlots(){
 if(!serverMode)return;
 const query={date:$('booking-date').value,serviceId:$('booking-service').value,employeeId:$('booking-employee').value,roomId:$('booking-room').value,centerId:currentGymId()};
 const select=$('booking-available-slot'),request=++slotsRequest;
 if(!query.employeeId||!C.validDate(query.date)){select.innerHTML='<option value="">Selecciona trabajador, servicio y fecha</option>';return;}
 if(state.editing)query.excludeId=state.editing;
 try{const slots=await api('slots?'+new URLSearchParams(query));if(request!==slotsRequest)return;const list=Array.isArray(slots)?slots:[];select.innerHTML='<option value="">'+(list.length?'Elige un horario libre ('+list.length+' opciones)':'No hay horarios libres con estos filtros')+'</option>'+list.map(s=>`<option value="${escapeHTML(s.start)}">${escapeHTML(s.start)} – ${escapeHTML(s.end)}</option>`).join('');}catch(e){if(request===slotsRequest)select.innerHTML='<option value="">No se pudo consultar la disponibilidad. Se comprobará al guardar.</option>';}
}
$('booking-available-slot').onchange=()=>{if(!$('booking-available-slot').value)return;$('booking-start').value=$('booking-available-slot').value;$('booking-start').dispatchEvent(new Event('change'));};
$('booking-room').addEventListener('change',loadAvailableSlots);
async function loadClientPackages(selected=null){
  if(!serverMode||!data.packagesEnabled){$('booking-package-panel').hidden=true;return;}
  const clientId=$('booking-client').value,request=++packageRequest;state.packagesClientId=clientId;clientPackages=[];newPendingPackageId=null;pendingPackageKey=uid();
  $('package-create-result').textContent='';
  if(!clientId){
    packageBusy=false;
    $('booking-package-message').textContent='Selecciona primero un cliente para consultar sus bonos.';
    $('existing-package-wrap').hidden=true;
    $('buy-package-card').hidden=true;
    return;
  }
  if(clientId==='new'){
    packageBusy=false;
    $('booking-package-message').textContent='Para clientes nuevos puedes asignarle un bono o continuar sin bono:';
    $('existing-package-wrap').hidden=true;
    $('buy-package-card').hidden=false;
    if ($('cancel-buy-package-btn')) $('cancel-buy-package-btn').hidden = true;
    updateBuyPackageServices();
    return;
  }
  packageBusy=true;$('booking-package-message').textContent='Consultando los bonos del cliente…';
  try{
    const result=await api('clients/'+encodeURIComponent(clientId)+'/service-history');
    if(request!==packageRequest)return;
    clientPackages=result.packages||[];
    if (result.renewalAlert) {
      if (!data.clientPackageAlerts) data.clientPackageAlerts = {};
      data.clientPackageAlerts[clientId] = result.renewalAlert;
    } else if (data.clientPackageAlerts) {
      delete data.clientPackageAlerts[clientId];
    }
    updateRenewalDetail();
    renderPackages(selected);
  }
  catch(e){
    if(request===packageRequest){
      $('booking-package-message').textContent='No se pudieron consultar los bonos: '+e.message;
      $('booking-package').innerHTML='<option value="">Reservar sin bono · pago pendiente</option>';
      $('existing-package-wrap').hidden=false;
      $('buy-package-card').hidden=true;
    }
  }
  finally{if(request===packageRequest)packageBusy=false;}
}

function updateBuyPackageServices() {
  const select = $('buy-package-service');
  if (!select) return;
  const currentServiceId = $('booking-service')?.value;
  const activeServices = (data.services || []).filter(s => s.active !== false);
  select.innerHTML = activeServices.map(s => {
    const isSelected = s.id === currentServiceId;
    const priceText = s.price ? `${s.price} €` : '0 €';
    const count = s.trainingCount || 1;
    return `<option value="${escapeHTML(s.id)}" ${isSelected ? 'selected' : ''}>${escapeHTML(s.name)} · ${count} sesión${count > 1 ? 'es' : ''} (${priceText})</option>`;
  }).join('');
}

function renderPackages(selected){
  if(!serverMode)return;
  const select=$('booking-package'),old=selected??select.value;
  const currentServiceId = $('booking-service')?.value;
  const clientId = $('booking-client').value;
  const isRealClient = clientId && clientId !== 'new';
  const msgEl = $('booking-package-message');
  const buyCard = $('buy-package-card');
  const existingWrap = $('existing-package-wrap');
  const toggleBuyBtn = $('toggle-buy-package-btn');
  const cancelBuyBtn = $('cancel-buy-package-btn');

  if (!isRealClient) {
    if (existingWrap) existingWrap.hidden = true;
    if (buyCard) buyCard.hidden = clientId !== 'new';
    if (msgEl) msgEl.textContent = clientId === 'new' ? 'Para clientes nuevos puedes asignarle un bono o continuar sin bono:' : 'Selecciona primero un cliente para consultar sus bonos.';
    return;
  }

  const availablePaid = clientPackages.filter(p=>p.paymentStatus==='PAGADO'&&p.sessionsRemaining>0);
  const list=clientPackages.filter(p=>(p.paymentStatus==='PAGADO'&&p.sessionsRemaining>0)||p.id===old||p.id===state.editingSnapshot?.packageId||p.id===newPendingPackageId);
  select.innerHTML='<option value="">Reservar sin bono · pago pendiente</option>'+list.map(p=>{
    const isMatching = p.service.id === currentServiceId;
    return `<option value="${escapeHTML(p.id)}">${isMatching ? '⭐ ' : ''}${escapeHTML(p.service.name)} · ${p.sessionsRemaining} sesiones disponibles · ${p.paymentStatus==='PAGADO'?'Pagado':'Pago pendiente'}</option>`;
  }).join('');

  if (!old && availablePaid.length > 0) {
    const matching = availablePaid.find(p => p.service.id === currentServiceId) || availablePaid[0];
    select.value = matching.id;
    if (matching.service?.id) {
      $('booking-service').value = matching.service.id;
      const srv = lookup('services', matching.service.id);
      if (srv && srv.duration && $('booking-start').value) {
        $('booking-end').value = C.timeLabel(C.minutes($('booking-start').value) + srv.duration);
        const summaryDt = $('summary-datetime');
        if (summaryDt) summaryDt.textContent = `${prettyDate($('booking-date').value, { weekday: 'short', day: 'numeric', month: 'short' })} · ${$('booking-start').value} a ${$('booking-end').value}`;
      }
    }
  } else {
    select.value=list.some(p=>p.id===old)?old:'';
  }
  select.disabled=currentUser?.role==='TRAINER';

  const chosen=clientPackages.find(p=>p.id===select.value);

  if (chosen) {
    if (existingWrap) existingWrap.hidden = false;
    if (buyCard) buyCard.hidden = true;
    if (toggleBuyBtn) toggleBuyBtn.hidden = false;
    if (chosen.paymentStatus === 'PAGADO') {
      msgEl.innerHTML = `<span style="display:inline-block; padding:4px 8px; border-radius:4px; background:#dcfce7; color:#15803d; font-weight:600; font-size:12px;">✓ Sesión asignada al bono "${escapeHTML(chosen.service.name)}" (${chosen.sessionsRemaining} disponibles).</span>`;
    } else {
      msgEl.innerHTML = `<span style="display:inline-block; padding:4px 8px; border-radius:4px; background:#fef3c7; color:#b45309; font-weight:600; font-size:12px;">⚠️ Este bono está pendiente de cobro. La cita mostrará aviso de cobro.</span>`;
    }
  } else if (availablePaid.length === 0) {
    if (existingWrap) existingWrap.hidden = true;
    if (buyCard) {
      buyCard.hidden = false;
      updateBuyPackageServices();
      if (cancelBuyBtn) cancelBuyBtn.hidden = true;
      const sub = $('buy-package-sub-text');
      if (sub) sub.textContent = 'El cliente no tiene ningún bono disponible. Elige el bono y si se cobra ahora o queda pendiente:';
    }
    msgEl.innerHTML = `<div style="padding:6px 10px; border-radius:6px; background:#fee2e2; border:1px solid #fca5a5; color:#b91c1c; font-size:12px; font-weight:600;">⚠️ Este cliente no tiene bonos disponibles. Puedes adquirir uno ahora mismo:</div>`;
  } else {
    if (existingWrap) existingWrap.hidden = false;
    if (buyCard) buyCard.hidden = true;
    if (toggleBuyBtn) toggleBuyBtn.hidden = false;
    msgEl.innerHTML = `<span style="color:var(--tp-muted); font-size:12px;">Selecciona de qué bono descontar la sesión o continúa sin bono (pago pendiente).</span>`;
  }
}

$('booking-package').onchange=()=>{
  const p=clientPackages.find(p=>p.id===$('booking-package').value);
  if(p){
    $('booking-service').value=p.service.id;
    const service=lookup('services',p.service.id);
    if($('booking-start').value && service.duration){
      $('booking-end').value=C.timeLabel(C.minutes($('booking-start').value)+service.duration);
      const summaryDt = $('summary-datetime');
      if (summaryDt) summaryDt.textContent = `${prettyDate($('booking-date').value, { weekday: 'short', day: 'numeric', month: 'short' })} · ${$('booking-start').value} a ${$('booking-end').value}`;
    }
  }
  renderPackages();updateHoursHint();
};

if ($('toggle-buy-package-btn')) {
  $('toggle-buy-package-btn').onclick = () => {
    $('existing-package-wrap').hidden = true;
    $('buy-package-card').hidden = false;
    if ($('cancel-buy-package-btn')) $('cancel-buy-package-btn').hidden = false;
    updateBuyPackageServices();
    $('booking-package-message').innerHTML = '<span style="color:var(--tp-muted); font-size:12px;">Elige el nuevo bono que va a adquirir este cliente:</span>';
  };
}
if ($('cancel-buy-package-btn')) {
  $('cancel-buy-package-btn').onclick = () => {
    $('existing-package-wrap').hidden = false;
    $('buy-package-card').hidden = true;
    renderPackages();
  };
}

function syncBuyPackageMode() {
  const mode = document.querySelector('input[name="buy-pkg-mode"]:checked')?.value || 'now';
  const methodRow = $('buy-package-method-row');
  const nowBtn = $('buy-package-now-btn');
  const laterBtn = $('buy-package-later-btn');
  if (methodRow) methodRow.hidden = mode !== 'now';
  if (nowBtn) nowBtn.hidden = mode !== 'now';
  if (laterBtn) laterBtn.hidden = mode !== 'later';
}
document.querySelectorAll('input[name="buy-pkg-mode"]').forEach(radio => {
  radio.addEventListener('change', syncBuyPackageMode);
});

if ($('buy-package-service')) {
  $('buy-package-service').onchange = () => {
    const srv = lookup('services', $('buy-package-service').value);
    if (srv && srv.id) {
      $('booking-service').value = srv.id;
      if (srv.duration && $('booking-start').value) {
        $('booking-end').value = C.timeLabel(C.minutes($('booking-start').value) + srv.duration);
        const summaryDt = $('summary-datetime');
        if (summaryDt) summaryDt.textContent = `${prettyDate($('booking-date').value, { weekday: 'short', day: 'numeric', month: 'short' })} · ${$('booking-start').value} a ${$('booking-end').value}`;
      }
    }
  };
}

async function handleBuyPackage(isNow) {
  const clientId = $('booking-client').value;
  if (!clientId || clientId === 'new' || packageBusy) return null;
  const serviceId = $('buy-package-service').value;
  const service = lookup('services', serviceId);
  if (!service) return null;

  const paymentStatus = isNow ? 'PAGADO' : 'PENDIENTE';
  const paymentMethod = isNow ? $('buy-package-method').value : 'OTRO';
  const sessionsBought = service.trainingCount || 1;
  const totalAmount = service.price || 0;

  const nowBtn = $('buy-package-now-btn');
  const laterBtn = $('buy-package-later-btn');
  const resEl = $('buy-package-result');
  if (nowBtn) nowBtn.disabled = true;
  if (laterBtn) laterBtn.disabled = true;
  packageBusy = true;
  if (resEl) {
    resEl.hidden = false;
    resEl.style.color = '#1e293b';
    resEl.textContent = 'Registrando bono…';
  }

  try {
    const result = await api('clients/' + encodeURIComponent(clientId) + '/service-packages', 'POST', {
      requestKey: uid(),
      serviceId,
      sessionsBought,
      totalAmount,
      paymentStatus,
      paymentMethod,
      notes: `Contratado desde el calendario (${isNow ? 'Pagado por ' + paymentMethod : 'Pendiente de cobro'}).`
    });
    const history = await api('clients/' + encodeURIComponent(clientId) + '/service-history');
    if ($('booking-client').value === clientId) {
      clientPackages = history.packages || [];
      const newPkgId = result.servicePackage?.id;
      $('booking-service').value = serviceId;
      if (service.duration && $('booking-start').value) {
        $('booking-end').value = C.timeLabel(C.minutes($('booking-start').value) + service.duration);
        const summaryDt = $('summary-datetime');
        if (summaryDt) summaryDt.textContent = `${prettyDate($('booking-date').value, { weekday: 'short', day: 'numeric', month: 'short' })} · ${$('booking-start').value} a ${$('booking-end').value}`;
      }
      renderPackages(newPkgId);
      if (resEl) {
        resEl.style.color = '#15803d';
        resEl.textContent = `✓ Bono contratado con éxito (${isNow ? 'Pagado por ' + paymentMethod : 'Pendiente de cobro'}). Se ha vinculado a esta cita.`;
      }
      toast('Bono asignado a la cita.');
    }
    return result.servicePackage;
  } catch (err) {
    if (resEl) {
      resEl.style.color = '#b91c1c';
      resEl.textContent = 'Error: ' + err.message;
    }
    throw err;
  } finally {
    if (nowBtn) nowBtn.disabled = false;
    if (laterBtn) laterBtn.disabled = false;
    packageBusy = false;
  }
}

if ($('buy-package-now-btn')) $('buy-package-now-btn').onclick = () => handleBuyPackage(true);
if ($('buy-package-later-btn')) $('buy-package-later-btn').onclick = () => handleBuyPackage(false);
if ($('clear-client-search')) {
  $('clear-client-search').onclick = () => {
    $('client-search').value = '';
    $('booking-client').value = '';
    syncClientPicker();
    renderPackages();
    $('client-search').focus();
  };
}
function formError(id,message) { $(id).textContent = message; $(id).hidden = false; }
$('booking-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (currentUser?.role === 'TRAINER') return;
  const clientId = $('booking-client').value;
  if (!clientId) { formError('booking-error','Selecciona un cliente para la cita.'); return; }
  if(packageBusy){formError('booking-error','Espera a que termine la consulta de bonos del cliente.');return;}
  if (clientId === 'new' && !$('client-name').value.trim()) { formError('booking-error','Escribe el nombre del cliente.'); return; }
  const booking = {id:state.editing || uid(),clientId:clientId === 'new' ? uid() : clientId,employeeId:$('booking-employee').value||null,centerId:currentGymId(),serviceId:$('booking-service').value,roomId:$('booking-room').value,date:$('booking-date').value,start:$('booking-start').value,end:$('booking-end').value,status:$('booking-status').value,notes:$('booking-notes').value.trim()};
  if(serverMode) {
    if(state.saving)return;
    state.saving=true;
    try {
      const buyCard = $('buy-package-card');
      const mode = document.querySelector('input[name="buy-pkg-mode"]:checked')?.value || 'now';
      if (buyCard && !buyCard.hidden && !$('booking-package').value && clientId !== 'new' && (mode === 'now' || mode === 'later')) {
        const pkg = await handleBuyPackage(mode === 'now');
        if (pkg?.id) {
          booking.packageId = pkg.id;
          booking.serviceId = $('buy-package-service').value;
        }
      } else {
        booking.packageId = $('booking-package').value || null;
      }
      if(!booking.employeeId&&booking.status==='confirmed')booking.status='pending';
      booking.needsReschedule=state.editingSnapshot?.needsReschedule&&booking.status==='cancelled'||false;
      booking.version=state.editingVersion;
      booking.sessionId=state.editingSnapshot?.sessionId||null;
      booking.recoveryId=state.editingSnapshot?.recoveryId||null;
      if (!state.editing && !booking.packageId) {
        const credits=(await api('recoveries')).filter(r=>r.clientId===booking.clientId && r.status==='PENDING');
        const compatible=credits.find(r=>r.serviceId===booking.serviceId);
        if(compatible && window.confirm(`Este cliente tiene ${credits.length} sesiones pendientes. ¿Quieres utilizar una compatible sin generar otro cobro?`)) {
          booking.recoveryId=compatible.id;booking.status='confirmed';
        } else if(credits.length && !compatible) toast('Tiene recuperaciones pendientes de otro servicio. Esta reserva será normal.');
      }
      const duration=lookup('services',booking.serviceId).duration || 60;
      booking.end=C.timeLabel(C.minutes(booking.start)+duration);
      const client=clientId==='new'?{id:booking.clientId,name:$('client-name').value.trim(),email:$('client-email').value.trim(),phone:$('client-phone').value.trim(),notes:''}:undefined;
      const saved = await api(state.editing?'bookings/'+encodeURIComponent(state.editing):'bookings',state.editing?'PUT':'POST',{booking:toServer(booking),client});
      state.date=booking.date;$('booking-dialog').close();
      await refreshServer(true);toast('Reserva guardada en el servidor.');
      if (booking.status === 'completed') await offerBookingPayment(saved.id);
    } catch(e){formError('booking-error',e.message);} finally{state.saving=false;}
    return;
  }
  if(booking.status!=='cancelled' && !C.employeeAvailable(lookup('employees',booking.employeeId),booking.date,C.minutes(booking.start),C.minutes(booking.end),data.schedule)){formError('booking-error','La reserva debe quedar dentro del turno del empleado.');return;}
  const error = C.validateBooking(booking,data.bookings,data.schedule,data.centers);
  if (error) { formError('booking-error',error); return; }
  if (clientId === 'new') data.clients.push({id:booking.clientId,name:$('client-name').value.trim(),email:$('client-email').value.trim(),phone:$('client-phone').value.trim(),notes:''});
  const index = data.bookings.findIndex(b => b.id === booking.id);
  if (index >= 0) data.bookings[index] = booking; else data.bookings.push(booking);
  const persisted = saveData();
  state.date = booking.date;
  $('booking-dialog').close();
  render(true);
  toast(persisted ? 'Reserva guardada con éxito.' : 'Reserva guardada solo en esta sesión.');
});

$('add-client').addEventListener('click', () => {
  $('booking-client').value = $('booking-client').value === 'new' ? availableClients()[0]?.id || '' : 'new';
  updateClientFields();
  if ($('booking-client').value !== 'new') syncClientPicker();
});
$('client-search').addEventListener('input', renderClientResults);
$('client-search').addEventListener('focus', renderClientResults);
$('client-results').addEventListener('click', event => {
  const result = event.target.closest('[data-client-id]');
  if (!result) return;
  $('booking-client').value = result.dataset.clientId;
  syncClientPicker();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.client-picker')) $('client-results').hidden = true;
});
$('booking-service').addEventListener('change', () => {
  const service = lookup('services', $('booking-service').value);
  const selectedPackage=clientPackages.find(p=>p.id===$('booking-package').value);
  if(selectedPackage&&selectedPackage.service.id!==service.id)$('booking-package').value='';
  renderPackages();
  if (service.duration && $('booking-start').value) {
    const end = Math.min(C.minutes($('booking-start').value) + service.duration, 1439);
    $('booking-end').value = C.timeLabel(end);
  }
});
$('booking-employee').addEventListener('change',updateHoursHint);
if ($('unassign-booking')) {
  $('unassign-booking').addEventListener('click', async () => {
    if (!state.editingSnapshot) return;
    if (!confirm('¿Mover esta reserva a "Sin asignar"? Se quitará de la columna del entrenador para reubicarla después.')) return;
    if (serverMode) {
      try {
        $('unassign-booking').disabled = true;
        await api('bookings/' + encodeURIComponent(state.editing), 'PUT', {
          booking: toServer({ ...state.editingSnapshot, employeeId: null, status: 'pending', version: state.editingVersion })
        });
        $('booking-dialog').close();
        await refreshServer(true);
        toast('Cita movida a Sin asignar.');
      } catch (err) {
        formError('booking-error', err.message);
      } finally {
        $('unassign-booking').disabled = false;
      }
    } else {
      const b = data.bookings.find(item => item.id === state.editing);
      if (b) {
        b.employeeId = null;
        b.status = 'pending';
        saveData();
        render();
      }
      $('booking-dialog').close();
      toast('Cita movida a Sin asignar.');
    }
  });
}
$('reschedule-booking').onclick=async()=>{
  if(!state.editingSnapshot||!confirm('¿Dejar pendiente de reprogramación? Se libera el hueco y se conserva el historial.'))return;
  try{await api('bookings/'+encodeURIComponent(state.editing),'PUT',{booking:toServer({...state.editingSnapshot,status:'cancelled',needsReschedule:true,version:state.editingVersion})});$('booking-dialog').close();await refreshServer(true);toast('Reserva pendiente de reprogramación.');}catch(e){formError('booking-error',e.message);}
};
async function offerBookingPayment(id) {
  try { await window.TrainersPoint.collectBookingPayment(id, async () => { await refreshServer(true); toast('Cobro registrado. El saldo y Caja se han actualizado.'); }); }
  catch (error) { warn('La asistencia está guardada. No se pudo abrir el cobro: ' + error.message); }
}
$('collect-booking').onclick=()=>{ const id=state.editing; $('booking-dialog').close(); offerBookingPayment(id); };
async function workerAction(action){
  const message=action==='INCIDENT'?prompt('Describe la incidencia o la solicitud de cancelación:'):undefined;
  if(action==='INCIDENT'&&!message)return;
  try{const completed = await api('bookings/'+encodeURIComponent(state.editing)+'/worker-action','POST',{action,message,version:state.editingVersion});$('booking-dialog').close();await refreshServer(true);toast(action==='COMPLETE'?(completed.paymentDue?'Sesión realizada. Pago pendiente: avisa a recepción para registrar el cobro.':'Sesión realizada.'):'Incidencia comunicada a recepción.');}catch(e){formError('booking-error',e.message);}
}
$('worker-complete').onclick=()=>workerAction('COMPLETE');$('worker-incident').onclick=()=>workerAction('INCIDENT');
$('booking-date').addEventListener('change', updateHoursHint);
$('booking-start').addEventListener('change', () => {
  const service = lookup('services', $('booking-service').value);
  if (service.duration && $('booking-start').value) {
    const end = Math.min(C.minutes($('booking-start').value) + service.duration, 1439);
    $('booking-end').value = C.timeLabel(end);
  }
});
$('view-client').addEventListener('click', () => {
  const client = lookup('clients',$('booking-client').value);
  if (!client) return;
  $('client-title').textContent = client.name;
  const history = data.bookings.filter(b => b.clientId === client.id).sort((a,b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`));
  $('client-detail').innerHTML = `<dl class="client-info"><dt>Correo</dt><dd>${escapeHTML(client.email || 'No indicado')}</dd><dt>Teléfono</dt><dd>${escapeHTML(client.phone || 'No indicado')}</dd><dt>Notas</dt><dd>${escapeHTML(client.notes || 'Sin notas')}</dd></dl><h3>Reservas · ${history.length}</h3><ul class="client-history">${history.map(b => `<li>${prettyDate(b.date,{day:'numeric',month:'long',year:'numeric'})} · ${b.start}–${b.end}<small>${escapeHTML(lookup('services',b.serviceId).name)} · ${escapeHTML(lookup('employees',b.employeeId).name)} · ${STATUS[b.status]}</small></li>`).join('') || '<li>Todavía no tiene reservas.</li>'}</ul>`;
  $('client-dialog').showModal();
});
$('cancel-booking').addEventListener('click',() => $('cancel-dialog').showModal());
$('confirm-cancel').addEventListener('click',async () => {
  const booking = data.bookings.find(b => b.id === state.editing);
  if (!booking) return;
  if(serverMode) {
    try{await api('bookings/'+encodeURIComponent(booking.id),'PUT',{booking:toServer({...state.editingSnapshot,status:'cancelled',needsReschedule:false,version:state.editingVersion})});$('cancel-dialog').close();$('booking-dialog').close();await refreshServer(true);toast('Reserva cancelada.');}
    catch(e){$('cancel-dialog').close();formError('booking-error',e.message);}return;
  }
  booking.status = 'cancelled';
  const persisted = saveData();
  $('cancel-dialog').close(); $('booking-dialog').close(); render();
  toast(persisted ? 'Reserva cancelada. El horario vuelve a estar disponible.' : 'Cancelación aplicada solo en esta sesión.');
});
$('schedule-button').addEventListener('click',() => {
  $('schedule-error').hidden = true;
  state.configRevision=data.revision;
  state.configSnapshot=structuredClone(data);
  $('schedule-fields').innerHTML = data.schedule.map((hours,i) => `<div class="schedule-row"><strong>${DAYS[i]}</strong><input type="time" step="1800" data-open="${i}" value="${hours.open}" aria-label="Apertura ${DAYS[i]}" ${hours.closed?'disabled':''} required><input type="time" step="1800" data-close-hour="${i}" value="${hours.close}" aria-label="Cierre ${DAYS[i]}" ${hours.closed?'disabled':''} required><label><input type="checkbox" data-closed="${i}" ${hours.closed?'checked':''}>Cerrado</label></div>`).join('');
  $('schedule-dialog').showModal();
});
$('schedule-fields').addEventListener('change',event => {
  if (!event.target.matches('[data-closed]')) return;
  const i = event.target.dataset.closed;
  document.querySelector(`[data-open="${i}"]`).disabled = event.target.checked;
  document.querySelector(`[data-close-hour="${i}"]`).disabled = event.target.checked;
});
$('schedule-form').addEventListener('submit',async event => {
  event.preventDefault();
  const schedule = DAYS.map((_,i) => ({closed:document.querySelector(`[data-closed="${i}"]`).checked,open:document.querySelector(`[data-open="${i}"]`).value,close:document.querySelector(`[data-close-hour="${i}"]`).value}));
  if (schedule.some(hours => C.minutes(hours.open) >= C.minutes(hours.close))) { formError('schedule-error','La hora de cierre debe ser posterior a la apertura.'); return; }
  const outside = data.bookings.filter(b => b.date >= todayKey() && !['cancelled','completed'].includes(b.status) && !C.isOpen(b.date,C.minutes(b.start),C.minutes(b.end),schedule));
  if (outside.length) { formError('schedule-error',`Este horario dejaría ${outside.length} reserva(s) activa(s) fuera de apertura. Modifica esas reservas antes de cambiar el horario.`); return; }
  if(serverMode){
    try{await api('config','PUT',{config:{...state.configSnapshot,schedule},revision:state.configRevision});$('schedule-dialog').close();await refreshServer(true);toast('Apertura actualizada. Los horarios laborales se configuran en Profesionales o Turnos.');}
    catch(e){formError('schedule-error',e.message);}return;
  }
  data.schedule = schedule;
  const persisted = saveData();
  $('schedule-dialog').close();render();toast(persisted?'Horario actualizado.':'Horario actualizado solo en esta sesión.');
});

function checkRepeatWeekButton() {
  const btn = $('repeat-week-btn');
  if (!btn) return;
  if (!serverMode || currentUser?.role === 'TRAINER' || state.view !== 'week') {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const monday = C.monday(state.date);
  const weekDates = Array.from({ length: 7 }, (_, i) => C.addDays(monday, i));
  const activeGym = currentGymId();
  const hasBookings = data.bookings.some(b => weekDates.includes(b.date) && (!b.centerId || b.centerId === activeGym || activeGym === 'local') && b.status !== 'cancelled');
  const hasCustomShifts = data.employees.some(e => (e.shifts || []).some(s => weekDates.includes(s.date)));
  const isEmpty = !hasBookings && !hasCustomShifts;
  if (isEmpty) {
    btn.classList.add('is-empty-week');
    btn.textContent = '⚡ Repetir misma semana anterior';
    btn.title = 'Esta semana está vacía. Clic para clonar la planificación de turnos de la semana anterior.';
  } else {
    btn.classList.remove('is-empty-week');
    btn.textContent = '🔄 Repetir semana anterior';
    btn.title = 'Clonar la planificación de turnos de la semana anterior a esta semana.';
  }
}

if ($('repeat-week-btn')) {
  $('repeat-week-btn').addEventListener('click', async () => {
    const monday = C.monday(state.date);
    const prevMonday = C.addDays(monday, -7);
    const prevSunday = C.addDays(prevMonday, 6);
    const curSunday = C.addDays(monday, 6);
    const prevRange = `${prettyDate(prevMonday, {day:'numeric', month:'short'})} al ${prettyDate(prevSunday, {day:'numeric', month:'short'})}`;
    const curRange = `${prettyDate(monday, {day:'numeric', month:'short'})} al ${prettyDate(curSunday, {day:'numeric', month:'short'})}`;

    const prevWeekDates = Array.from({ length: 7 }, (_, i) => C.addDays(prevMonday, i));
    const prevHasShifts = data.employees.some(e => (e.shifts || []).some(s => prevWeekDates.includes(s.date) && s.periods && s.periods.length > 0));
    if (!prevHasShifts) {
      toast('La semana anterior no tiene turnos planificados para copiar.');
      return;
    }

    if (!confirm(`¿Copiar la planificación de turnos de la semana anterior (${prevRange}) a esta semana (${curRange})?`)) return;

    try {
      $('repeat-week-btn').disabled = true;
      await api('calendar/shifts/copy-week', 'POST', { fromMonday: prevMonday, toMonday: monday });
      await refreshServer(true);
      toast('Planificación de turnos copiada de la semana anterior.');
    } catch (err) {
      toast('No se pudo copiar la semana: ' + err.message);
    } finally {
      $('repeat-week-btn').disabled = false;
    }
  });
}

function openShiftEditor(employeeId, date) {
  if (currentUser?.role === 'TRAINER') return;
  $('shift-error').hidden = true;
  $('shift-date').value = date;

  const activeEmployees = data.employees.filter(e => e.active !== false && e.id !== '__unassigned');
  const alreadyWorking = activeEmployees.filter(e => {
    const s = e.shifts?.find(shift => shift.date === date);
    return Boolean(s && s.periods && s.periods.length > 0);
  });
  const alreadyWorkingIds = new Set(alreadyWorking.map(e => e.id));
  const availableToSchedule = activeEmployees.filter(e => !alreadyWorkingIds.has(e.id));

  if (!employeeId && availableToSchedule.length === 0) {
    toast('Todos los entrenadores ya están planificados para este día.');
    return;
  }

  fillSelect('shift-employee', employeeId ? activeEmployees : availableToSchedule);

  const selectedEmpId = employeeId || availableToSchedule[0]?.id;
  if (!selectedEmpId) {
    toast('No hay entrenadores disponibles para planificar este día.');
    return;
  }

  $('shift-employee').value = selectedEmpId;
  $('shift-employee').disabled = !!employeeId;

  const emp = lookup('employees', selectedEmpId);
  const formattedDate = prettyDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  $('shift-title').textContent = employeeId ? `Turno de ${emp.name}` : 'Añadir entrenador al día';
  $('shift-subtitle').textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  $('shift-delete-btn').hidden = !employeeId;
  $('shift-delete-btn').textContent = `Quitar de este día`;

  syncShiftFields();
  $('shift-dialog').showModal();
}

function syncShiftFields() {
  const empId = $('shift-employee').value;
  const date = $('shift-date').value;
  const emp = lookup('employees', empId);
  const hours = C.hoursFor(date, data.schedule);
  const customShift = emp?.shifts?.find(s => s.date === date);

  if (customShift) {
    if (customShift.periods && customShift.periods.length > 0) {
      $('shift-off').checked = false;
      $('shift-open').value = customShift.periods[0].open;
      $('shift-close').value = customShift.periods[customShift.periods.length - 1].close;
    } else {
      $('shift-off').checked = true;
      $('shift-open').value = hours.open || '09:00';
      $('shift-close').value = hours.close || '21:00';
    }
  } else {
    $('shift-off').checked = false;
    $('shift-open').value = hours.open || '09:00';
    $('shift-close').value = hours.close || '14:00';
  }

  const isOff = $('shift-off').checked;
  $('shift-open').disabled = isOff;
  $('shift-close').disabled = isOff;
}

if ($('shift-employee')) $('shift-employee').addEventListener('change', syncShiftFields);
if ($('shift-off')) $('shift-off').addEventListener('change', () => {
  const isOff = $('shift-off').checked;
  $('shift-open').disabled = isOff;
  $('shift-close').disabled = isOff;
});

if ($('shift-form')) {
  $('shift-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('shift-error').hidden = true;
    const empId = $('shift-employee').value;
    const date = $('shift-date').value;
    const isOff = $('shift-off').checked;
    const open = $('shift-open').value;
    const close = $('shift-close').value;

    if (!isOff && C.minutes(open) >= C.minutes(close)) {
      formError('shift-error', 'La hora de fin debe ser posterior a la de inicio.');
      return;
    }

    const periods = isOff ? [] : [{ open, close }];

    if (serverMode) {
      try {
        $('shift-submit-btn').disabled = true;
        await api('calendar/shifts', 'POST', { employeeId: empId, date, periods });
        $('shift-dialog').close();
        await refreshServer(true);
        toast(isOff ? 'Guardado como día libre para este entrenador.' : 'Turno de trabajo guardado correctamente.');
      } catch (err) {
        formError('shift-error', err.message);
      } finally {
        $('shift-submit-btn').disabled = false;
      }
    } else {
      const emp = data.employees.find(e => e.id === empId);
      if (emp) {
        emp.shifts = emp.shifts || [];
        const idx = emp.shifts.findIndex(s => s.date === date);
        if (idx >= 0) emp.shifts[idx].periods = periods;
        else emp.shifts.push({ date, periods });
        saveData();
        render();
      }
      $('shift-dialog').close();
      toast('Turno guardado.');
    }
  });
}

if ($('shift-delete-btn')) {
  $('shift-delete-btn').addEventListener('click', async () => {
    const empId = $('shift-employee').value;
    const date = $('shift-date').value;
    const emp = lookup('employees', empId);
    if (!confirm(`¿Quitar a ${emp?.name || 'este entrenador'} de la planificación de este día?`)) return;

    if (serverMode) {
      try {
        $('shift-delete-btn').disabled = true;
        await api('calendar/shifts', 'POST', { employeeId: empId, date, periods: null });
        $('shift-dialog').close();
        await refreshServer(true);
        toast(`${emp?.name || 'Entrenador'} quitado de este día.`);
      } catch (err) {
        formError('shift-error', err.message);
      } finally {
        $('shift-delete-btn').disabled = false;
      }
    } else {
      const empRecord = data.employees.find(e => e.id === empId);
      if (empRecord && empRecord.shifts) {
        const idx = empRecord.shifts.findIndex(s => s.date === date);
        if (idx >= 0) empRecord.shifts.splice(idx, 1);
        saveData();
        render();
      }
      $('shift-dialog').close();
      toast('Entrenador quitado de este día.');
    }
  });
}

document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click',() => $(button.dataset.close).close()));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',() => {state.view = button.dataset.view;render(true);}));
for (const [id,key] of [['employee-filter','employee'],['service-filter','service'],['room-filter','room']]) $(id).addEventListener('change',event => {state[key] = event.target.value;render();});
$('clear-filters').addEventListener('click',() => { for (const key of ['employee','service','room']) {state[key] = 'all';$(key+'-filter').value='all';} render(); });
$('new-booking').addEventListener('click',() => showBooking(null));
$('today').addEventListener('click',() => {state.date=todayKey();render(true);});
$('jump-date').addEventListener('change',event => {if(C.validDate(event.target.value)){state.date=event.target.value;render(true);}});
function navigate(direction) {
  if (state.view === 'month') {const date=C.parseDate(state.date);date.setDate(1);date.setMonth(date.getMonth()+direction);state.date=C.dateKey(date);}
  else state.date=C.addDays(state.date,direction*(state.view === 'week'?7:1));
  render(true);
}
$('previous').addEventListener('click',() => navigate(-1));
$('next').addEventListener('click',() => navigate(1));
$('calendar').addEventListener('click',event => {
  const addTrainerBtn = event.target.closest('[data-add-trainer-date]');
  if (addTrainerBtn) {
    event.stopPropagation();
    openShiftEditor(null, addTrainerBtn.dataset.addTrainerDate);
    return;
  }
  const empHeading = event.target.closest('[data-shift-employee]');
  if (empHeading) {
    event.stopPropagation();
    openShiftEditor(empHeading.dataset.shiftEmployee, empHeading.dataset.shiftDate);
    return;
  }
  const booking=event.target.closest('[data-booking]');
  if (booking){showBooking(booking.dataset.booking);return;}
  const day=event.target.closest('[data-day]');
  if(day){state.date=day.dataset.day;state.view='day';render(true);return;}
  const slot=event.target.closest('[data-slot]');
  if(slot&&!slot.disabled){if(currentUser?.role==='TRAINER')return;showBooking(null,slot.dataset.slot,Number(slot.dataset.minute),slot.dataset.employee);return;}
  const cell=event.target.closest('[data-month-cell]');
  if(cell){if(currentUser?.role==='TRAINER')return;const date=cell.dataset.monthCell;const hours=C.hoursFor(date,data.schedule);if(!hours.closed)showBooking(null,date,C.minutes(hours.open));}
});
// Other tabs must not silently overwrite this tab's in-progress form.
window.addEventListener('storage',event => {
  if(!serverMode && event.key===KEY) warn('Los datos han cambiado en otra pestaña. Recarga esta página antes de seguir editando para evitar sobrescribirlos.');
  if(!serverMode && event.key===KEY) storageWritable=false;
});
setupSelects();
const query=new URLSearchParams(location.search);
if(C.validDate(query.get('fecha')||'')){state.date=query.get('fecha');state.view='day';}
render(true);
const requestedBooking=data.bookings.find(b=>b.id===query.get('reserva'));
if(requestedBooking)showBooking(requestedBooking.id);
else if(query.get('nueva')==='1')showBooking();
window.TrainersPoint.poll(() => {
  const now=new Date();
  document.querySelectorAll('.now-line').forEach(line => {line.style.top=`${(now.getHours()*60+now.getMinutes())*1.4}px`;});
},60000);

if(serverMode)window.TrainersPoint.poll(refreshServer,2000,()=>warn('Sin conexión. Los cambios se guardan solo cuando el servidor responde. Reintentando…'));
})().catch(e=>console.error('No se pudo iniciar el calendario',e));