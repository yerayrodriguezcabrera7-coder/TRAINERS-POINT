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
const state = { date: todayKey(), view: window.innerWidth < 760 ? 'day' : 'week', employee: 'all', service: 'all', editing: null };
const isSunday = date => C.parseDate(date).getDay() === 0;
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
  const collections = ['employees', 'services', 'clients', 'bookings', 'schedule'];
  if (!collections.every(key => Array.isArray(value[key])) || value.schedule.length !== 7) return false;
  const named = ['employees', 'services', 'clients'];
  if (!named.every(key => value[key].length > 0 && value[key].every(x => x && typeof x.id === 'string' && typeof x.name === 'string'))) return false;
  if (!value.employees.every(x => /^#[0-9a-f]{6}$/i.test(x.color))) return false;
  if (!value.schedule.every(x => x && typeof x.closed === 'boolean' && /^\d{2}:\d{2}$/.test(x.open) && /^\d{2}:\d{2}$/.test(x.close) && C.minutes(x.open) >= 0 && C.minutes(x.close) < 1440 && C.minutes(x.open) < C.minutes(x.close))) return false;
  return value.bookings.every(x => x && typeof x.id === 'string' && C.validDate(x.date) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.start) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.end) && C.minutes(x.start) < C.minutes(x.end) && Object.hasOwn(STATUS, x.status) && value.clients.some(item => item.id === x.clientId) && value.services.some(item => item.id === x.serviceId) && (!x.employeeId || x.employeeId === COBOSU_ID || value.employees.some(item => item.id === x.employeeId)));
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
      brand: client.brand || 'TRAINERS_POINT',
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
let polling=false,clientPackages=[],packageRequest=0,packageBusy=false,dualClientPackages=[],dualPackageRequest=0,dualPackageBusy=false,pendingPackageKey=null,newPendingPackageId=null,dragState=null,suppressClickUntil=0;
function canDragBooking(b) {
  return Boolean(b && currentUser?.role !== 'TRAINER' && ['pending', 'confirmed'].includes(b.status));
}
async function refreshServer(force=false) {
  if(polling || (dragState && !force))return;
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
  return { id: COBOSU_ID, name: 'Cobosu', color: '#dc2626', schedule: data.schedule, isCobosu: true };
}
const lookupIndexes = new Map();
function lookup(collection, id) {
  if (collection === 'employees' && id === COBOSU_ID) return cobosuColumn();
  const items=data[collection]; let index=lookupIndexes.get(collection);
  if(!index||index.items!==items||index.size!==items.length){index={items,size:items.length,byId:new Map(items.map(item=>[item.id,item]))};lookupIndexes.set(collection,index);}
  return index.byId.get(id) || { name: 'Sin asignar' };
}
function toast(message, isError=false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('is-error', Boolean(isError));
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; el.classList.remove('is-error'); }, 4500);
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
  return data.bookings.filter(b => dates.has(b.date) && (!b.centerId || b.centerId === activeGym || activeGym === 'local') && (state.employee === 'all' || (b.employeeId||'__unassigned') === state.employee) && (state.service === 'all' || b.serviceId === state.service));
}
function fillSelect(id, list, extra = '') { $(id).innerHTML = extra + list.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join(''); }
function setupSelects() {
  fillSelect('employee-filter', data.employees.filter(e => e.active !== false), '<option value="all">Ver todos</option><option value="__cobosu">Cobosu</option>'+(currentUser?.role!=='TRAINER'?'<option value="__unassigned">Sin asignar</option>':''));
  fillSelect('service-filter', data.services.filter(s => s.active !== false), '<option value="all">Todos los servicios</option>');
  fillSelect('booking-employee', data.employees.filter(e => e.active !== false), '<option value="__cobosu">Cobosu</option><option value="">Sin asignar</option>');
  fillSelect('booking-service', data.services.filter(s => s.active !== false));
  if ($('no-package-service')) fillSelect('no-package-service', data.services.filter(s => s.active !== false));
  for(const [id,key] of [['employee-filter','employee'],['service-filter','service']]){ $(id).value=state[key]; if(!$(id).value){state[key]='all';$(id).value='all';} }
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
 box.hidden=!(amount>0);box.innerHTML=amount>0?`<strong>Pago pendiente · ${escapeHTML(debtMoney(amount))}</strong><p>Saldo pendiente de productos y bonos del cliente. Este aviso no bloquea la reserva.</p><a href="/caja.html?client=${encodeURIComponent(id)}#sales-panel">Consultar deudas y registrar un pago ↗</a>`:'';
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
function dualMissingPartner(b) {
  if (!b || b.status === 'cancelled' || !isDualService(b.serviceId)) return false;
  if (!b.sessionId) return true;
  return !data.bookings.some(other => other.id !== b.id && other.status !== 'cancelled' && other.sessionId === b.sessionId);
}
function dualBadge(b) {
  if (!dualMissingPartner(b)) return '';
  return '<span class="booking-dual-missing-badge" title="Sesión dual pendiente de 2ª persona. Haz clic para asignarla.">👥 Falta por asignar 2ª persona</span>';
}
function eventLabel(b) { const renewal=upcomingRenewal(b); return `${lookup('clients', b.clientId).name}, ${lookup('services', b.serviceId).name}, ${b.start} a ${b.end}, ${STATUS[b.status]}, ${lookup('employees', b.employeeId).name}, ${b.centerName||'Centro actual'}${b.needsReschedule?', Pendiente de reprogramación':''}${dualMissingPartner(b)?', Falta por asignar 2ª persona':''}${upcomingDebt(b)>0?', Pago pendiente '+debtMoney(upcomingDebt(b)):''}${renewal?', '+renewal.message:''}`; }

function sundayParkingColumn() {
  return { id: '__unassigned', name: 'Sin sitio asignado', color: '#b86b00', schedule: data.schedule, isSundayParking: true };
}

function employeesForDate(date, dayBookings, allEmployees) {
  const sunday = isSunday(date);
  if (state.employee !== 'all') {
    if (state.employee === COBOSU_ID) return [cobosuColumn()];
    if (state.employee === '__unassigned') {
      return [sunday ? sundayParkingColumn() : { id: '__unassigned', name: 'Sin asignar', color: '#b86b00', schedule: data.schedule }];
    }
    const emp = allEmployees.find(e => e.id === state.employee);
    return emp ? [emp] : [];
  }

  if (sunday) {
    const cols = currentUser?.role !== 'TRAINER' ? [sundayParkingColumn()] : [];
    if (dayBookings.some(b => b.employeeId === COBOSU_ID)) {
      cols.push(cobosuColumn());
    }
    const bookingEmpIds = new Set(dayBookings.map(b => b.employeeId).filter(Boolean));
    for (const emp of allEmployees) {
      if (emp.id !== COBOSU_ID && emp.id !== '__unassigned' && bookingEmpIds.has(emp.id)) {
        cols.push(emp);
      }
    }
    return cols;
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

  if (currentUser?.role !== 'TRAINER' && dayBookings.some(b => !b.employeeId)) {
    scheduled.push({ id: '__unassigned', name: 'Sin asignar', color: '#b86b00', schedule: data.schedule });
  }

  return scheduled;
}

function gridHourBounds(dates, bookings) {
  let minMin = Infinity;
  let maxMin = -Infinity;
  const openHours = dates.map(date => C.hoursFor(date, data.schedule)).filter(h => !h.closed);
  const sourceHours = openHours.length ? openHours : (data.schedule || []).filter(h => h && !h.closed);
  for (const h of sourceHours) {
    minMin = Math.min(minMin, C.minutes(h.open));
    maxMin = Math.max(maxMin, C.minutes(h.close));
  }
  const visibleDates = new Set(dates);
  for (const b of bookings) {
    if (!visibleDates.has(b.date) || (isSunday(b.date) && !b.employeeId)) continue;
    minMin = Math.min(minMin, C.minutes(b.start));
    maxMin = Math.max(maxMin, C.minutes(b.end));
  }
  if (!Number.isFinite(minMin) || !Number.isFinite(maxMin) || minMin >= maxMin) {
    return { startHour: 8, endHour: 21 };
  }
  const startHour = Math.max(0, Math.floor(minMin / 60));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.ceil(maxMin / 60)));
  return { startHour, endHour };
}

function renderTimeGrid(dates, bookings, employees) {
  const selected = lookup('services',state.service), duration = selected.duration || 30;
  const { startHour, endHour } = gridHourBounds(dates, bookings);
  const totalHours = endHour - startHour;
  const offsetMin = startHour * 60;
  const gridHeight = totalHours * 84;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNowLine = nowMin >= offsetMin && nowMin <= endHour * 60;
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

  dateLayouts.forEach((d, dayIdx) => {
    const today = d.date === todayKey();
    const sunday = isSunday(d.date);
    const isAlt = dayIdx % 2 === 1;
    const hasNextDay = dayIdx < dateLayouts.length - 1;
    html += `<div class="day-heading ${today ? 'today' : ''} ${sunday ? 'is-sunday-parking' : ''} ${isAlt ? 'is-day-alt' : ''} ${hasNextDay ? 'is-day-end' : ''}" data-drop-day="${d.date}" style="grid-column:${d.startCol} / span ${d.span};grid-row:1">
      <span class="day-name">${prettyDate(d.date, { weekday: 'short' })}</span>
      <strong>${C.parseDate(d.date).getDate()}</strong>
      <span>${prettyDate(d.date, { month: 'short' })}</span>
      ${!sunday && serverMode && currentUser?.role !== 'TRAINER' ? `<button type="button" class="add-trainer-day-btn" data-add-trainer-date="${d.date}" title="Planificar o añadir entrenador para el ${prettyDate(d.date, { day: 'numeric', month: 'long' })}" aria-label="Añadir entrenador">＋</button>` : ''}
    </div>`;
  });

  dateLayouts.forEach((d, dayIdx) => {
    const isAlt = dayIdx % 2 === 1;
    const hasNextDay = dayIdx < dateLayouts.length - 1;
    if (d.dayEmps.length === 0) {
      html += `<div class="employee-heading empty-day-heading ${isAlt ? 'is-day-alt' : ''} ${hasNextDay ? 'is-day-end' : ''}" style="grid-column:${d.startCol};grid-row:2">
        ${serverMode && currentUser?.role !== 'TRAINER' ? `<button type="button" class="add-trainer-pill-btn" data-add-trainer-date="${d.date}">＋ Añadir entrenador</button>` : '<span style="color:var(--muted);font-size:10px;">Sin turnos</span>'}
      </div>`;
    } else {
      d.dayEmps.forEach((employee, j) => {
        const isCobosu = employee.id === COBOSU_ID;
        const isParking = Boolean(employee.isSundayParking);
        const isDayEnd = hasNextDay && j === d.dayEmps.length - 1;
        const periods = isParking ? [{ open: '00:00', close: '23:59' }] : isCobosu ? (() => { const h = C.hoursFor(d.date, data.schedule); return h.closed ? [] : [h]; })() : C.employeePeriods(employee, d.date, data.schedule);
        const shiftText = isParking ? 'Arrastrar a L–S' : isCobosu ? (periods.length ? `App · ${periods[0].open}–${periods[0].close}` : 'Cerrado') : (periods.length ? periods.map(p => p.open + '–' + p.close).join(' · ') : (employee.id === '__unassigned' ? 'Sin asignar' : 'Libre'));
        const isOff = !isParking && !periods.length && employee.id !== '__unassigned';
        const isEditable = serverMode && currentUser?.role !== 'TRAINER' && employee.id !== '__unassigned' && !isCobosu;
        html += `<div class="employee-heading ${isCobosu ? 'is-cobosu' : ''} ${isParking ? 'is-sunday-parking' : ''} ${isAlt ? 'is-day-alt' : ''} ${isDayEnd ? 'is-day-end' : ''}" style="grid-column:${d.startCol + j};grid-row:2;--employee-color:${employee.color}" ${isEditable ? `data-shift-employee="${employee.id}" data-shift-date="${d.date}" title="Clic para ajustar el turno o quitar de este día"` : ''}>
          <div class="employee-heading-name"><span class="employee-dot"></span>${escapeHTML(employee.name)}</div>
          <span class="employee-shift-tag ${isOff ? 'is-off' : ''}">${escapeHTML(shiftText)}</span>
        </div>`;
      });
    }
  });

  html += '<div class="time-axis" style="grid-column:1;grid-row:3">' + Array.from({length: totalHours}, (_, hour) => `<div class="hour-label">${C.timeLabel((startHour + hour) * 60)}</div>`).join('') + '</div>';

  dateLayouts.forEach((d, dayIdx) => {
    const isAlt = dayIdx % 2 === 1;
    const hasNextDay = dayIdx < dateLayouts.length - 1;
    if (d.dayEmps.length === 0) {
      html += `<div class="time-column empty-day-column ${d.date === todayKey() ? 'is-today' : ''} ${isAlt ? 'is-day-alt' : ''} ${hasNextDay ? 'is-day-end' : ''}" style="grid-column:${d.startCol};grid-row:3;height:${gridHeight}px">
        <div class="empty-day-placeholder">
          <span>Sin turnos planificados</span>
          ${serverMode && currentUser?.role !== 'TRAINER' ? `<button type="button" class="button secondary small-btn" data-add-trainer-date="${d.date}">＋ Añadir entrenador</button>` : ''}
        </div>
      </div>`;
    } else {
      d.dayEmps.forEach((employee, j) => {
        const isCobosu = employee.id === COBOSU_ID;
        const isParking = Boolean(employee.isSundayParking);
        const isDayEnd = hasNextDay && j === d.dayEmps.length - 1;
        html += `<div class="time-column ${d.date === todayKey() ? 'is-today' : ''} ${isCobosu ? 'is-cobosu-column' : ''} ${isParking ? 'is-sunday-parking' : ''} ${isAlt ? 'is-day-alt' : ''} ${isDayEnd ? 'is-day-end' : ''}" data-drop-date="${d.date}" data-drop-employee="${employee.id}" data-start-hour="${startHour}" data-end-hour="${endHour}" style="grid-column:${d.startCol + j};grid-row:3;height:${gridHeight}px">`;
        const absent = !isCobosu && !isParking && (data.leaveRequests || []).some(leave => leave.employeeId === employee.id && leave.status === 'APPROVED' && d.date >= leave.startDate && d.date <= leave.endDate);
        const serviceWorker = isCobosu || isParking || !selected?.employeeIds?.length || selected.employeeIds.includes(employee.id) || employee.id === '__unassigned';
        const dayLabel = prettyDate(d.date, { day: 'numeric', month: 'long' });
        for (let slot = startHour * 2; slot < endHour * 2; slot++) {
          const start = slot * 30;
          const serviceOpen = isParking || !selected?.schedule || C.isOpen(d.date, start, start + duration, selected.schedule);
          const open = isParking || (!absent && serviceOpen && serviceWorker && C.employeeAvailable(employee, d.date, start, start + duration, data.schedule));
          const label = `${dayLabel}, ${C.timeLabel(start)}, ${employee.name}`;
          html += `<button class="time-slot ${open ? '' : 'closed'}" ${open ? '' : 'disabled'} data-slot="${d.date}" data-minute="${start}" data-employee="${employee.id}" aria-label="${open ? 'Nueva reserva: ' : 'Fuera de turno o sin tiempo para el servicio: '}${escapeHTML(label)}" title="${isParking ? 'Crear reserva sin asignar en domingo' : open ? 'Crear reserva' : 'Fuera del horario disponible del empleado'}"></button>`;
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
          const color = lookup('services', b.serviceId).color || '#317b9b';
          const soft = `${color}18`;
          const clientName = lookup('clients', b.clientId).name;
          const serviceName = lookup('services', b.serviceId).name;
          const roomName = lookup('rooms', b.roomId).name;
          html += `<button class="event ${b.status} ${!b.employeeId ? 'unassigned' : ''}" data-booking="${b.id}" style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px);--event-color:${color};--event-soft:${soft}" aria-label="${escapeHTML(eventLabel(b))}">${debtBadge(b)}${renewalBadge(b)}<div class="event-time">${b.start} – ${b.end}</div><div class="event-title">${escapeHTML(clientName)}</div><div class="event-meta">${escapeHTML(serviceName)} · ${escapeHTML(roomName)}<br>${escapeHTML(b.centerName || 'Centro actual')} · ${escapeHTML(lookup('employees', b.employeeId).name)}${b.needsReschedule ? ' · REPROGRAMAR' : ''}</div></button>`;
        });
        if (d.date === todayKey()) html += '<div class="now-line" aria-hidden="true"></div>';
        if (isParking) {
          html += '<div class="sunday-parking-list">';
          if (!dayColBookings.length) {
            html += '<div class="sunday-parking-empty">Arrastra aquí clientes sin sitio asignado y llévalos luego a su día</div>';
          } else {
            dayColBookings.forEach(b => {
              const clientName = lookup('clients', b.clientId).name;
              const serviceObj = lookup('services', b.serviceId);
              const dur = Math.max(15, C.minutes(b.end) - C.minutes(b.start));
              const isDraggable = canDragBooking(b);
              html += `<button class="event sunday-parking-card ${b.status} unassigned" data-booking="${b.id}" ${isDraggable ? 'draggable="true"' : ''} style="--event-color:#b86b00;--event-soft:#b86b0018" aria-label="${escapeHTML(eventLabel(b))}">${dualBadge(b)}${debtBadge(b)}${renewalBadge(b)}<div class="event-time">Sin sitio asignado · ${dur} min</div><div class="event-title">${escapeHTML(clientName)}</div><div class="event-meta">${escapeHTML(serviceObj.name)}<br>Arrastra al día y entrenador${b.needsReschedule ? ' · REPROGRAMAR' : ''}</div></button>`;
            });
          }
          html += '</div>';
        } else {
          const placed = C.layoutEvents(dayColBookings);
          placed.forEach(({ event: b, lane, count }) => {
            const startMin = C.minutes(b.start);
            const endMin = C.minutes(b.end);
            const top = (startMin - offsetMin) * 1.4;
            const height = Math.max((endMin - startMin) * 1.4 - 2, 22);
            const width = 100 / count;
            const left = lane * width;
            const color = lookup('employees', b.employeeId).color || '#7b858d';
            const soft = `${color}18`;
            const clientName = lookup('clients', b.clientId).name;
            const serviceName = lookup('services', b.serviceId).name;
            const isDraggable = canDragBooking(b);
            html += `<button class="event ${b.status} ${!b.employeeId ? 'unassigned' : ''}" data-booking="${b.id}" ${isDraggable ? 'draggable="true"' : ''} style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px);--event-color:${color};--event-soft:${soft}" aria-label="${escapeHTML(eventLabel(b))}">${dualBadge(b)}${debtBadge(b)}${renewalBadge(b)}<div class="event-time">${b.start} – ${b.end}</div><div class="event-title">${escapeHTML(clientName)}</div><div class="event-meta">${escapeHTML(serviceName)}<br>${escapeHTML(b.centerName || 'Centro actual')} · ${escapeHTML(lookup('employees', b.employeeId).name)}${b.needsReschedule ? ' · REPROGRAMAR' : ''}</div></button>`;
          });
        }
        if (d.date === todayKey() && showNowLine) html += `<div class="now-line" data-start-hour="${startHour}" data-end-hour="${endHour}" style="top:${(nowMin - offsetMin) * 1.4}px" aria-hidden="true"></div>`;
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
      const color = b.employeeId === COBOSU_ID ? '#dc2626' : (lookup('services', b.serviceId).color || '#317b9b');
      const isDraggable = canDragBooking(b);
      return `<button class="month-event ${b.status} ${b.employeeId === COBOSU_ID ? 'is-cobosu' : ''}" data-booking="${b.id}" ${isDraggable ? 'draggable="true"' : ''} style="--event-color:${color}" title="${escapeHTML(eventLabel(b))}"><span class="month-event-dot"></span><span>${b.start} ${escapeHTML(lookup('clients', b.clientId).name)}${dualBadge(b)}${debtBadge(b)}${renewalBadge(b)}<small>${escapeHTML(lookup('services',b.serviceId).name)} · ${escapeHTML(b.centerName||'Centro actual')}${!b.employeeId?' · SIN ASIGNAR':''}${b.needsReschedule?' · REPROGRAMAR':''}</small></span></button>`;
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
  $('result-count').textContent=bookings.length+' reservas';
  $('clear-filters').hidden=['employee','service'].every(k=>state[k]==='all'||k==='employee'&&currentUser?.role==='TRAINER');
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
function isDualService(serviceId = $('booking-service')?.value) {
  const srv = lookup('services', serviceId);
  return srv?.modality === 'DUAL' || Number(srv?.capacity || 1) >= 2;
}
function renderClientResultsList(searchEl, resultsEl, attrName, excludeClientId = '') {
  const query = searchEl.value.trim().toLocaleLowerCase('es');
  const clients = availableClients().filter(client =>
    (!excludeClientId || client.id !== excludeClientId) &&
    `${client.name} ${client.email || ''} ${client.phone || ''}`.toLocaleLowerCase('es').includes(query)
  );
  resultsEl.innerHTML = clients.length
    ? clients.map(client => `<button type="button" class="client-result" role="option" ${attrName}="${escapeHTML(client.id)}"><strong>${escapeHTML(client.name)}</strong><span>${escapeHTML(client.email || client.phone || 'Sin datos de contacto')}</span></button>`).join('')
    : '<p class="client-results-empty">No se han encontrado clientes.</p>';
  resultsEl.hidden = false;
}
function renderClientResults() {
  renderClientResultsList($('client-search'), $('client-results'), 'data-client-id');
}
function renderDualClientResults() {
  const primaryId = $('booking-client').value;
  renderClientResultsList($('dual-client-search'), $('dual-client-results'), 'data-dual-client-id', primaryId && primaryId !== 'new' ? primaryId : '');
}
function syncDualBuyMode() {
  const mode = document.querySelector('input[name="dual-pkg-mode"]:checked')?.value || 'none';
  if ($('dual-buy-method-row')) $('dual-buy-method-row').hidden = mode !== 'now';
}
function syncDualPanel() {
  const panel = $('dual-client-panel');
  if (!panel) return;
  const dual = isDualService();
  panel.hidden = !dual;
  const srv = lookup('services', $('booking-service')?.value);
  if ($('dual-buy-service-label') && srv?.name) {
    const priceText = srv.price ? ` · ${srv.price} €` : '';
    $('dual-buy-service-label').textContent = `${srv.name}${priceText}`;
  }
  const statusEl = $('dual-partner-status');
  const dualId = $('dual-booking-client')?.value;
  if (statusEl) {
    statusEl.classList.toggle('is-missing', Boolean(dual && !dualId));
    if (!dual) {
      statusEl.textContent = '';
    } else if (dualId) {
      const c2 = availableClients().find(c => c.id === dualId) || lookup('clients', dualId);
      statusEl.textContent = `✓ 2/2 personas asignadas: ${c2?.name || 'Cliente seleccionado'} compartirá esta sesión dual.`;
    } else {
      statusEl.textContent = '⚠️ Falta por asignar a otra persona (1/2 plazas ocupadas). Elige a la 2ª persona o guárdala pendiente de completar.';
    }
  }
}
function syncSelectedService(serviceId, { updateBuySelect = true, refreshPackages = true } = {}) {
  if (!serviceId) return;
  const srv = lookup('services', serviceId);
  if ($('booking-service')) $('booking-service').value = serviceId;
  if ($('no-package-service')) $('no-package-service').value = serviceId;
  if (updateBuySelect && $('buy-package-service') && Array.from($('buy-package-service').options).some(o => o.value === serviceId)) {
    $('buy-package-service').value = serviceId;
  }
  if (srv?.duration && $('booking-start')?.value) {
    const end = Math.min(C.minutes($('booking-start').value) + srv.duration, 1439);
    $('booking-end').value = C.timeLabel(end);
    const summaryDt = $('summary-datetime');
    if (summaryDt) summaryDt.textContent = `${prettyDate($('booking-date').value, { weekday: 'short', day: 'numeric', month: 'short' })} · ${$('booking-start').value} a ${$('booking-end').value}`;
  }
  syncDualPanel();
  if (refreshPackages && $('dual-booking-client')?.value) renderDualPackages();
}
function syncClientPicker() {
  const value = $('booking-client').value;
  if (value && value !== 'new' && $('dual-booking-client')?.value === value) {
    $('dual-booking-client').value = '';
    syncDualClientPicker();
  }
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
function syncDualClientPicker(selectedPkgId = null) {
  const select = $('dual-booking-client');
  if (!select) return;
  const value = select.value;
  const primaryId = $('booking-client').value;
  if (value && primaryId && primaryId !== 'new' && value === primaryId) {
    select.value = '';
    $('dual-client-search').value = '';
    $('dual-client-results').hidden = true;
    syncDualPanel();
    loadDualClientPackages(null);
    return;
  }
  const client = value ? (availableClients().find(item => item.id === value) || lookup('clients', value)) : null;
  $('dual-client-search').value = client?.id ? client.name : '';
  $('dual-client-results').hidden = true;
  syncDualPanel();
  loadDualClientPackages(selectedPkgId);
}

function showBooking(id, date = state.date, minute, employeeId) {
  if (currentUser?.role === 'TRAINER' && !id) return;
  if(!id && (!data.services.some(s=>s.active!==false)||!data.employees.some(e=>e.active!==false))){toast('Añade un servicio y un empleado activos desde el menú.');return;}
  $('booking-form').reset();
  $('booking-error').hidden = true;
  state.editing = id || null;
  const b = id ? data.bookings.find(item => item.id === id) : null;
  const partner = b?.sessionId ? data.bookings.find(item => item.id !== b.id && item.sessionId === b.sessionId && item.status !== 'cancelled') : null;
  state.editingVersion=b?.version;
  state.editingSnapshot=b ? {...b} : null;
  state.editingPartnerSnapshot=partner ? {...partner} : null;
  $('view-training-plan').hidden = !serverMode || !b;
  $('view-training-plan').onclick = () => window.TrainersPoint.openTrainingPlan(b.clientId, b.date);
  const bookingClients = serverMode && awsClientsLoaded ? awsClients : data.clients;
  fillSelect('booking-client', bookingClients.filter(c=>(c.status||'ACTIVE')==='ACTIVE'||c.id===b?.clientId), '');
  if ($('dual-booking-client')) {
    fillSelect('dual-booking-client', bookingClients.filter(c=>(c.status||'ACTIVE')==='ACTIVE'||c.id===partner?.clientId), '');
  }
  const activeServicesForModal = data.services.filter(s=>s.active!==false||s.id===b?.serviceId);
  fillSelect('booking-service', activeServicesForModal);
  if ($('no-package-service')) fillSelect('no-package-service', activeServicesForModal);
  fillSelect('booking-employee', data.employees.filter(e=>e.active!==false||e.id===b?.employeeId), '<option value="__cobosu">Cobosu</option>' + (serverMode?'<option value="">Sin asignar</option>':''));
  $('booking-client').insertAdjacentHTML('beforeend','<option value="new">＋ Añadir nuevo cliente</option>');
  const hours = C.hoursFor(date, data.schedule);
  const sunday = isSunday(date);
  const start = minute ?? (sunday ? 540 : C.minutes(hours.open));
  const selectedService = data.services.find(s => s.id === state.service && s.active !== false);
  const service = selectedService || data.services.find(s => s.active !== false) || data.services[0];
  const duration = service.duration || 60;
  const defaultEmp = (sunday || employeeId === '__unassigned') ? '' : (employeeId || (state.employee === 'all' ? data.employees.find(e=>e.active!==false).id : state.employee));
  const values = b || {clientId:'',employeeId:defaultEmp,serviceId:service.id,date,start:C.timeLabel(start),end:C.timeLabel(sunday ? Math.min(start+duration, 1410) : Math.min(start+duration,C.minutes(hours.close))),status:defaultEmp ? 'confirmed' : 'pending',notes:''};
  for (const [field,key] of Object.entries({client:'clientId',employee:'employeeId',service:'serviceId',date:'date',start:'start',end:'end',status:'status'})) $('booking-'+field).value = values[key] || '';
  if ($('no-package-service')) $('no-package-service').value = values.serviceId || '';
  if ($('dual-booking-client')) $('dual-booking-client').value = partner?.clientId || '';
  const defaultDualMode = document.querySelector('input[name="dual-pkg-mode"][value="none"]');
  if (defaultDualMode) defaultDualMode.checked = true;
  syncDualBuyMode();
  if(employeeId==='__unassigned')$('booking-employee').value='';
  const formatHistoryAt = iso => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  };
  const historyLabels = { ASSIGNED: 'Trabajador asignado', UPDATED: 'Reserva modificada', MOVED: 'Reserva movida', RESCHEDULE_REQUESTED: 'Pendiente de reprogramación' };
  const formatWhen = (d, t) => `${d && C.validDate(d) ? prettyDate(d, { day: 'numeric', month: 'short' }) : (d || '')} ${t || ''}`.trim();
  const historyItems = (b?.history || []).slice().reverse().map(h => {
    const prev = h.previous || {};
    const prevWhen = formatWhen(prev.date, prev.start);
    const prevEmp = lookup('employees', prev.employeeId).name;
    const next = h.next;
    const moveDetail = next
      ? `De ${prevWhen} (${prevEmp}) → ${formatWhen(next.date, next.start)} (${lookup('employees', next.employeeId).name})`
      : `${prevWhen} · ${prevEmp}`;
    return `<p><strong>${escapeHTML(formatHistoryAt(h.at))}</strong> · ${escapeHTML(historyLabels[h.action] || h.action)} · ${escapeHTML(moveDetail)}</p>`;
  });
  const incidentItems = (b?.incidents || []).map(i => `<p>Incidencia: ${escapeHTML(i.message)}</p>`);
  $('booking-history').innerHTML = (historyItems.length ? `<div style="font-weight:700;margin-bottom:4px;">Historial de cambios</div>${historyItems.join('')}` : '') + incidentItems.join('');
  syncClientPicker();
  syncDualClientPicker(partner?.packageId||null);
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
  if ($('clear-dual-client-search')) $('clear-dual-client-search').hidden = isTrainer;
  if ($('unassign-booking')) $('unassign-booking').hidden = isTrainer || !b || !b.employeeId;
  $('booking-dialog').querySelectorAll('input, select, textarea').forEach(el => {
    if (el.id !== 'client-search') el.disabled = isTrainer;
  });

  $('reschedule-booking').hidden=isTrainer||!b||!['pending','confirmed'].includes(b.status);
  if ($('defer-booking')) $('defer-booking').hidden = !serverMode || !b || b.status !== 'confirmed' || Boolean(b.recoveryId) || !['ADMIN', 'TRAINER'].includes(currentUser?.role);
  $('worker-complete').hidden=!isTrainer||b?.status!=='confirmed';
  $('worker-incident').hidden=!isTrainer||!b;
  updateClientFields(); syncDualPanel();
  $('booking-dialog').showModal();
  if (!b) setTimeout(() => $('client-search')?.focus(), 60);
}
function syncNoPackageServiceWrap() {
  const wrap = $('no-package-service-wrap');
  if (!wrap) return;
  if (!serverMode || !data.packagesEnabled) {
    wrap.hidden = false;
    return;
  }
  const clientId = $('booking-client')?.value;
  const buyCard = $('buy-package-card');
  const pkgSelect = $('booking-package');
  const showingBuy = buyCard && !buyCard.hidden;
  wrap.hidden = showingBuy || Boolean(clientId && clientId !== 'new' && pkgSelect?.value);
  if ($('no-package-service') && $('booking-service')) {
    $('no-package-service').value = $('booking-service').value;
  }
}

async function loadDualClientPackages(selected = undefined) {
  const pkgPanel = $('dual-package-panel');
  if (!pkgPanel) return;
  if (!serverMode || !data.packagesEnabled) {
    pkgPanel.hidden = true;
    dualPackageBusy = false;
    return;
  }
  const dualClientId = $('dual-booking-client')?.value;
  const request = ++dualPackageRequest;
  dualClientPackages = [];
  if (!dualClientId) {
    dualPackageBusy = false;
    pkgPanel.hidden = true;
    return;
  }
  pkgPanel.hidden = false;
  dualPackageBusy = true;
  $('dual-package-message').textContent = 'Consultando bonos de la 2ª persona…';
  try {
    const result = await api('clients/' + encodeURIComponent(dualClientId) + '/service-history');
    if (request !== dualPackageRequest) return;
    dualClientPackages = result.packages || [];
    renderDualPackages(selected);
  } catch (e) {
    if (request === dualPackageRequest) {
      $('dual-package-message').textContent = 'No se pudieron consultar los bonos: ' + e.message;
      $('dual-booking-package').innerHTML = '<option value="">Sin bono · pago pendiente</option>';
      $('dual-existing-package-wrap').hidden = false;
      $('dual-buy-package-wrap').hidden = false;
    }
  } finally {
    if (request === dualPackageRequest) dualPackageBusy = false;
  }
}

function renderDualPackages(selected = undefined) {
  const pkgPanel = $('dual-package-panel');
  if (!pkgPanel) return;
  if (!serverMode || !data.packagesEnabled) { pkgPanel.hidden = true; return; }
  const dualClientId = $('dual-booking-client')?.value;
  if (!dualClientId) { pkgPanel.hidden = true; return; }
  pkgPanel.hidden = false;

  const select = $('dual-booking-package');
  const currentServiceId = $('booking-service')?.value;
  const old = selected !== undefined ? selected : select.value;
  const availablePaid = dualClientPackages.filter(p => p.paymentStatus === 'PAGADO' && p.sessionsRemaining > 0);
  const partnerPkgId = state.editingPartnerSnapshot?.clientId === dualClientId ? state.editingPartnerSnapshot?.packageId : null;
  const list = dualClientPackages.filter(p => (p.paymentStatus === 'PAGADO' && p.sessionsRemaining > 0) || p.id === old || p.id === partnerPkgId);

  select.innerHTML = '<option value="">Sin bono · pago pendiente</option>' + list.map(p => {
    const isMatching = p.service.id === currentServiceId;
    return `<option value="${escapeHTML(p.id)}">${isMatching ? '⭐ ' : ''}${escapeHTML(p.service.name)} · ${p.sessionsRemaining} sesiones disponibles · ${p.paymentStatus === 'PAGADO' ? 'Pagado' : 'Pago pendiente'}</option>`;
  }).join('');

  if (selected === undefined && !old && availablePaid.length > 0) {
    const matching = availablePaid.find(p => p.service.id === currentServiceId);
    if (matching) select.value = matching.id;
  } else {
    select.value = list.some(p => p.id === old) ? old : '';
  }
  select.disabled = currentUser?.role === 'TRAINER';

  $('dual-existing-package-wrap').hidden = list.length === 0;
  const chosen = dualClientPackages.find(p => p.id === select.value);
  $('dual-buy-package-wrap').hidden = Boolean(chosen);

  const msgEl = $('dual-package-message');
  if (chosen) {
    msgEl.innerHTML = chosen.paymentStatus === 'PAGADO'
      ? `<span style="display:inline-block; padding:4px 8px; border-radius:4px; background:#dcfce7; color:#15803d; font-weight:600; font-size:12px;">✓ Se descontará del bono "${escapeHTML(chosen.service.name)}" (${chosen.sessionsRemaining} disp.).</span>`
      : `<span style="display:inline-block; padding:4px 8px; border-radius:4px; background:#fef3c7; color:#b45309; font-weight:600; font-size:12px;">⚠️ Bono de 2ª persona pendiente de cobro.</span>`;
  } else if (list.length > 0) {
    msgEl.innerHTML = `<span style="color:var(--tp-muted); font-size:12px;">Elige un bono de la 2ª persona o adquiere uno para ella:</span>`;
  } else {
    msgEl.innerHTML = `<span style="color:#475569; font-size:12px;">Esta 2ª persona no tiene bonos disponibles. Puedes dejarla sin bono o comprarle uno:</span>`;
  }
}

async function loadClientPackages(selected=null){
  const panel = $('booking-package-panel');
  if(!serverMode||!data.packagesEnabled){
    if (panel) panel.hidden = false;
    if ($('booking-package-message')) $('booking-package-message').hidden = true;
    if ($('existing-package-wrap')) $('existing-package-wrap').hidden = true;
    if ($('buy-package-card')) $('buy-package-card').hidden = true;
    syncNoPackageServiceWrap();
    return;
  }
  if (panel) panel.hidden = false;
  if ($('booking-package-message')) $('booking-package-message').hidden = false;
  const clientId=$('booking-client').value,request=++packageRequest;state.packagesClientId=clientId;clientPackages=[];newPendingPackageId=null;pendingPackageKey=uid();
  state.packagesBrand=null;
  if(!clientId){
    packageBusy=false;
    $('booking-package-message').textContent='Selecciona primero un cliente para consultar sus bonos o elige el tipo de sesión:';
    $('existing-package-wrap').hidden=true;
    $('buy-package-card').hidden=true;
    syncNoPackageServiceWrap();
    return;
  }
  if(clientId==='new'){
    packageBusy=false;
    $('booking-package-message').textContent='Para clientes nuevos puedes asignarle un bono o continuar sin bono:';
    $('existing-package-wrap').hidden=true;
    $('buy-package-card').hidden=false;
    if ($('cancel-buy-package-btn')) $('cancel-buy-package-btn').hidden = true;
    updateBuyPackageServices();
    syncNoPackageServiceWrap();
    return;
  }
  packageBusy=true;$('booking-package-message').textContent='Consultando los bonos del cliente…';
  try{
    const result=await api('clients/'+encodeURIComponent(clientId)+'/service-history');
    if(request!==packageRequest)return;
    clientPackages=result.packages||[];
    state.packagesBrand=result.client?.brand;
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
  if(!serverMode||!data.packagesEnabled){syncNoPackageServiceWrap();return;}
  const select=$('booking-package'),old=selected??select.value;
  const currentServiceId = $('booking-service')?.value;
  const clientId = $('booking-client').value;
  const isRealClient = clientId && clientId !== 'new';
  const msgEl = $('booking-package-message');
  const buyCard = $('buy-package-card');
  const existingWrap = $('existing-package-wrap');
  const toggleBuyBtn = $('toggle-buy-package-btn');
  const cancelBuyBtn = $('cancel-buy-package-btn');
  const manualAllowed=currentUser?.role!=='TRAINER' && state.packagesBrand!=='COBOSU' && awsClients.find(c=>c.id===clientId)?.brand!=='COBOSU';

  if (!isRealClient) {
    if (existingWrap) existingWrap.hidden = true;
    if (buyCard) buyCard.hidden = clientId !== 'new';
    if (msgEl) msgEl.textContent = clientId === 'new' ? 'Para clientes nuevos puedes asignarle un bono o continuar sin bono:' : 'Selecciona primero un cliente para consultar sus bonos o elige el tipo de sesión:';
    syncNoPackageServiceWrap();
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
      syncSelectedService(matching.service.id, { updateBuySelect: true, refreshPackages: true });
    }
  } else {
    select.value=list.some(p=>p.id===old)?old:'';
  }
  select.disabled=currentUser?.role==='TRAINER';

  const chosen=clientPackages.find(p=>p.id===select.value);

  if (chosen) {
    if (existingWrap) existingWrap.hidden = false;
    if (buyCard) buyCard.hidden = true;
    if (toggleBuyBtn) toggleBuyBtn.hidden = !manualAllowed;
    if (chosen.paymentStatus === 'PAGADO') {
      msgEl.innerHTML = `<span style="display:inline-block; padding:4px 8px; border-radius:4px; background:#dcfce7; color:#15803d; font-weight:600; font-size:12px;">✓ Sesión asignada al bono "${escapeHTML(chosen.service.name)}" (${chosen.sessionsRemaining} disponibles).</span>`;
    } else {
      msgEl.innerHTML = `<span style="display:inline-block; padding:4px 8px; border-radius:4px; background:#fef3c7; color:#b45309; font-weight:600; font-size:12px;">⚠️ Este bono está pendiente de cobro. La cita mostrará aviso de cobro.</span>`;
    }
  } else if (availablePaid.length === 0) {
    if (existingWrap) existingWrap.hidden = true;
    if (buyCard) {
      buyCard.hidden = !manualAllowed;
      updateBuyPackageServices();
      if (cancelBuyBtn) cancelBuyBtn.hidden = true;
      const sub = $('buy-package-sub-text');
      if (sub) sub.textContent = 'El cliente no tiene ningún bono disponible. Elige el bono y si se cobra ahora o queda pendiente:';
    }
    msgEl.textContent=manualAllowed ? 'Este cliente no tiene bonos disponibles. Puedes registrar uno ahora o reservar sin bono, con pago pendiente.' : 'No hay bonos disponibles. Los clientes Cobosu no admiten bonos manuales; puedes organizar su cita sin crear otro bono.';
  } else {
    if (existingWrap) existingWrap.hidden = false;
    if (buyCard) buyCard.hidden = true;
    if (toggleBuyBtn) toggleBuyBtn.hidden = !manualAllowed;
    msgEl.innerHTML = `<span style="color:var(--tp-muted); font-size:12px;">Selecciona de qué bono descontar la sesión o continúa sin bono (pago pendiente).</span>`;
  }
  syncNoPackageServiceWrap();
}

$('booking-package').onchange=()=>{
  const p=clientPackages.find(p=>p.id===$('booking-package').value);
  if(p?.service?.id) syncSelectedService(p.service.id);
  renderPackages();
};

if ($('toggle-buy-package-btn')) {
  $('toggle-buy-package-btn').onclick = () => {
    pendingPackageKey=uid();
    $('existing-package-wrap').hidden = true;
    $('buy-package-card').hidden = false;
    if ($('cancel-buy-package-btn')) $('cancel-buy-package-btn').hidden = false;
    updateBuyPackageServices();
    syncNoPackageServiceWrap();
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
    syncSelectedService($('buy-package-service').value, { updateBuySelect: false });
  };
}
if ($('no-package-service')) {
  $('no-package-service').onchange = () => {
    syncSelectedService($('no-package-service').value);
  };
}

async function createClientServicePackage(clientId, serviceId, isNow, rawPaymentMethod = 'TARJETA') {
  const service = lookup('services', serviceId);
  if (!clientId || !service) return null;
  const paymentStatus = isNow ? 'PAGADO' : 'PENDIENTE';
  const paymentMethod = isNow ? rawPaymentMethod : 'OTRO';
  return api('clients/' + encodeURIComponent(clientId) + '/service-packages', 'POST', {
    requestKey: uid(),
    serviceId,
    sessionsBought: service.trainingCount || 1,
    totalAmount: service.price || 0,
    paymentStatus,
    paymentMethod,
    notes: `Contratado desde el calendario (${isNow ? 'Pagado por ' + paymentMethod : 'Pendiente de cobro'}).`
  });
}

async function handleBuyPackage(isNow) {
  const clientId = $('booking-client').value;
  if (!clientId || clientId === 'new' || packageBusy) return null;
  if(currentUser?.role==='TRAINER' || state.packagesBrand==='COBOSU' || awsClients.find(c=>c.id===clientId)?.brand==='COBOSU')return null;
  const serviceId = $('buy-package-service').value;
  const service = lookup('services', serviceId);
  if (!service) return null;

  const paymentMethod = isNow ? $('buy-package-method').value : 'OTRO';
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
    const result = await createClientServicePackage(clientId, serviceId, isNow, paymentMethod);
    const history = await api('clients/' + encodeURIComponent(clientId) + '/service-history');
    if ($('booking-client').value === clientId) {
      clientPackages = history.packages || [];
      const newPkgId = result?.servicePackage?.id;
      newPendingPackageId=newPkgId;
      $('booking-service').value = serviceId;
      if (service.duration && $('booking-start').value) {
        $('booking-end').value = C.timeLabel(C.minutes($('booking-start').value) + service.duration);
        const summaryDt = $('summary-datetime');
        if (summaryDt) summaryDt.textContent = `${prettyDate($('booking-date').value, { weekday: 'short', day: 'numeric', month: 'short' })} · ${$('booking-start').value} a ${$('booking-end').value}`;
      }
      syncSelectedService(serviceId);
      renderPackages(newPkgId);
      if (resEl) {
        resEl.style.color = '#15803d';
        resEl.textContent = `✓ Bono contratado con éxito (${isNow ? 'Pagado por ' + paymentMethod : 'Pendiente de cobro'}). Se ha vinculado a esta cita.`;
      }
      toast('Bono asignado a la cita.');
    }
    return result?.servicePackage;
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
if ($('clear-dual-client-search')) {
  $('clear-dual-client-search').onclick = () => {
    $('dual-client-search').value = '';
    $('dual-booking-client').value = '';
    syncDualClientPicker(null);
    $('dual-client-search').focus();
  };
}
$('dual-client-search')?.addEventListener('input', renderDualClientResults);
$('dual-client-search')?.addEventListener('focus', renderDualClientResults);
$('dual-client-results')?.addEventListener('click', event => {
  const result = event.target.closest('[data-dual-client-id]');
  if (!result) return;
  $('dual-booking-client').value = result.dataset.dualClientId;
  syncDualClientPicker(undefined);
});
$('dual-booking-package')?.addEventListener('change', () => renderDualPackages());
document.querySelectorAll('input[name="dual-pkg-mode"]').forEach(radio => {
  radio.addEventListener('change', syncDualBuyMode);
});
function formError(id,message) { $(id).textContent = message; $(id).hidden = false; }
$('booking-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (currentUser?.role === 'TRAINER') return;
  const clientId = $('booking-client').value;
  if (!clientId) { formError('booking-error','Selecciona un cliente para la cita.'); return; }
  if(packageBusy){formError('booking-error','Espera a que termine la consulta de bonos del cliente.');return;}
  if(dualPackageBusy){formError('booking-error','Espera a que termine la consulta de bonos de la 2ª persona.');return;}
  if (clientId === 'new' && !$('client-name').value.trim()) { formError('booking-error','Escribe el nombre del cliente.'); return; }
  const booking = {id:state.editing || uid(),clientId:clientId === 'new' ? uid() : clientId,employeeId:$('booking-employee').value||null,centerId:currentGymId(),serviceId:$('booking-service').value,roomId:state.editingSnapshot?.roomId || data.rooms?.[0]?.id || 'r1',date:$('booking-date').value,start:$('booking-start').value,end:$('booking-end').value,status:$('booking-status').value,notes:state.editingSnapshot?.notes || ''};
  const initialDualSelected = isDualService(booking.serviceId);
  const requestedDualClientId = initialDualSelected ? ($('dual-booking-client')?.value || '') : '';
  const partner = state.editingPartnerSnapshot;
  if (requestedDualClientId && clientId !== 'new' && requestedDualClientId === clientId) {
    formError('booking-error', 'La primera y la segunda persona no pueden ser el mismo cliente.');
    return;
  }
  if (!initialDualSelected && partner) {
    if (!confirm('Esta cita tenía una 2ª persona asignada. Al cambiar a un servicio individual se cancelará la reserva de la 2ª persona. ¿Continuar?')) return;
  }
  if(serverMode) {
    if(state.saving)return;
    state.saving=true;
    try {
      // Purchases and receipts require the explicit buy buttons; saving a booking alone never buys a bono.
      booking.packageId = $('booking-package').value || null;
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
      const dualSelected = isDualService(booking.serviceId);
      const dualClientId = dualSelected ? ($('dual-booking-client')?.value || '') : '';
      if (dualClientId && clientId !== 'new' && dualClientId === clientId) {
        throw new Error('La primera y la segunda persona no pueden ser el mismo cliente.');
      }
      if (!dualSelected && partner) {
        if (!confirm('Esta cita tenía una 2ª persona asignada. Al cambiar a un servicio individual se cancelará la reserva de la 2ª persona. ¿Continuar?')) {
          return;
        }
      }
      const keepPartner = Boolean(partner && dualClientId && dualClientId === partner.clientId);
      const sharedSessionId = dualSelected
        ? (state.editingSnapshot?.sessionId || partner?.sessionId || (dualClientId ? uid() : null))
        : null;

      let dualPkgId = dualClientId ? ($('dual-booking-package')?.value || null) : null;
      const dualMode = document.querySelector('input[name="dual-pkg-mode"]:checked')?.value || 'none';
      if (dualClientId && !dualPkgId && (dualMode === 'now' || dualMode === 'later')) {
        const dualPkgRes = await createClientServicePackage(
          dualClientId,
          booking.serviceId,
          dualMode === 'now',
          $('dual-buy-method')?.value || 'TARJETA'
        );
        if (dualPkgRes?.servicePackage?.id) dualPkgId = dualPkgRes.servicePackage.id;
      }

      if(!booking.employeeId&&booking.status==='confirmed')booking.status='pending';
      booking.needsReschedule=state.editingSnapshot?.needsReschedule&&booking.status==='cancelled'||false;
      booking.version=state.editingVersion;
      booking.sessionId=sharedSessionId;
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

      if (partner && !keepPartner) {
        await api('bookings/' + encodeURIComponent(partner.id), 'PUT', {
          booking: toServer({ ...partner, status: 'cancelled' })
        });
      }

      const saved = await api(state.editing?'bookings/'+encodeURIComponent(state.editing):'bookings',state.editing?'PUT':'POST',{booking:toServer(booking),client,syncSession:keepPartner});

      if (dualClientId && !keepPartner) {
        await api('bookings', 'POST', {
          booking: toServer({
            ...booking,
            id: uid(),
            clientId: dualClientId,
            packageId: dualPkgId || null,
            recoveryId: null,
            sessionId: sharedSessionId,
            version: undefined
          })
        });
      } else if (keepPartner && (dualPkgId || null) !== (partner.packageId || null)) {
        const latest = await api('state');
        const freshPartner = (latest.bookings || []).map(fromServer).find(x => x.id === partner.id);
        if (freshPartner) {
          await api('bookings/' + encodeURIComponent(partner.id), 'PUT', {
            booking: toServer({ ...freshPartner, packageId: dualPkgId || null })
          });
        }
      }

      state.date=booking.date;$('booking-dialog').close();
      await refreshServer(true);toast(dualClientId ? 'Sesión dual guardada para 2 personas.' : 'Reserva guardada en el servidor.');
      if (booking.status === 'completed') await offerBookingPayment(saved.id);
    } catch(e){formError('booking-error',e.message);} finally{state.saving=false;}
    return;
  }
  const keepPartnerLocal = Boolean(partner && requestedDualClientId && requestedDualClientId === partner.clientId);
  const localSessionId = initialDualSelected
    ? (state.editingSnapshot?.sessionId || partner?.sessionId || (requestedDualClientId ? uid() : null))
    : null;
  booking.sessionId = localSessionId;
  if(booking.status!=='cancelled' && !C.employeeAvailable(lookup('employees',booking.employeeId),booking.date,C.minutes(booking.start),C.minutes(booking.end),data.schedule)){formError('booking-error','La reserva debe quedar dentro del turno del empleado.');return;}
  let nextBookings = data.bookings.map(b => ({ ...b }));
  if (partner && !keepPartnerLocal) {
    nextBookings = nextBookings.map(b => b.id === partner.id ? { ...b, status: 'cancelled' } : b);
  } else if (keepPartnerLocal) {
    nextBookings = nextBookings.map(b => b.id === partner.id ? { ...b, date: booking.date, start: booking.start, end: booking.end, employeeId: booking.employeeId, centerId: booking.centerId, serviceId: booking.serviceId, sessionId: localSessionId } : b);
  }
  const error = C.validateBooking(booking, nextBookings, data.schedule, data.centers, data.services);
  if (error) { formError('booking-error',error); return; }
  const dualLocalBooking = (requestedDualClientId && !keepPartnerLocal) ? { ...booking, id: uid(), clientId: requestedDualClientId, packageId: null, recoveryId: null, sessionId: localSessionId } : null;
  if (dualLocalBooking) {
    const idx1 = nextBookings.findIndex(b => b.id === booking.id);
    if (idx1 >= 0) nextBookings[idx1] = booking; else nextBookings.push(booking);
    const dualErr = C.validateBooking(dualLocalBooking, nextBookings, data.schedule, data.centers, data.services);
    if (dualErr) { formError('booking-error', dualErr); return; }
  }
  if (clientId === 'new') data.clients.push({id:booking.clientId,name:$('client-name').value.trim(),email:$('client-email').value.trim(),phone:$('client-phone').value.trim(),notes:''});
  const index = nextBookings.findIndex(b => b.id === booking.id);
  if (index >= 0) nextBookings[index] = booking; else nextBookings.push(booking);
  if (dualLocalBooking) nextBookings.push(dualLocalBooking);
  data.bookings = nextBookings;
  const persisted = saveData();
  state.date = booking.date;
  $('booking-dialog').close();
  render(true);
  toast(persisted ? (requestedDualClientId ? 'Sesión dual guardada para 2 personas.' : 'Reserva guardada con éxito.') : 'Reserva guardada solo en esta sesión.');
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
  if (!event.target.closest('.client-picker-field')) {
    $('client-results').hidden = true;
    if ($('dual-client-results')) $('dual-client-results').hidden = true;
  } else {
    if (!event.target.closest('.client-picker:not(.dual-client-picker)') && !event.target.closest('#client-results')) {
      $('client-results').hidden = true;
    }
    if (!event.target.closest('.dual-client-picker') && !event.target.closest('#dual-client-results') && $('dual-client-results')) {
      $('dual-client-results').hidden = true;
    }
  }
});
$('booking-service').addEventListener('change', () => {
  const service = lookup('services', $('booking-service').value);
  const selectedPackage=clientPackages.find(p=>p.id===$('booking-package').value);
  if(selectedPackage&&selectedPackage.service.id!==service.id)$('booking-package').value='';
  syncSelectedService(service.id);
  renderPackages();
});
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
if ($('defer-booking')) {
  $('defer-booking').onclick = async () => {
    if (!state.editingSnapshot || !confirm('¿Dejar esta sesión pendiente de recuperar? Se liberará el hueco y se generará un crédito de recuperación.')) return;
    try {
      await api('bookings/' + encodeURIComponent(state.editing) + '/defer', 'POST', {});
      $('booking-dialog').close();
      await refreshServer(true);
      toast('Sesión dejada pendiente de recuperación.');
    } catch (err) {
      if (currentUser?.role === 'ADMIN' && err.message.includes('dos horas') && confirm('El aviso llega con menos de dos horas. ¿Autorizar una excepción?')) {
        try {
          await api('bookings/' + encodeURIComponent(state.editing) + '/defer', 'POST', { exception: true });
          $('booking-dialog').close();
          await refreshServer(true);
          toast('Sesión dejada pendiente de recuperación.');
        } catch (x) {
          formError('booking-error', x.message);
        }
      } else {
        formError('booking-error', err.message);
      }
    }
  };
}
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
for (const [id,key] of [['employee-filter','employee'],['service-filter','service']]) $(id).addEventListener('change',event => {state[key] = event.target.value;render();});
$('clear-filters').addEventListener('click',() => { for (const key of ['employee','service']) {state[key] = 'all';$(key+'-filter').value='all';} render(); });
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
  if (Date.now() < suppressClickUntil) return;
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
  if(cell){if(currentUser?.role==='TRAINER')return;const date=cell.dataset.monthCell;if(isSunday(date)){showBooking(null,date,540,'__unassigned');return;}const hours=C.hoursFor(date,data.schedule);if(!hours.closed)showBooking(null,date,C.minutes(hours.open));}
});

function clearDropUI() {
  document.querySelectorAll('#calendar .is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
  document.querySelectorAll('#calendar .drop-preview').forEach(el => el.remove());
}

function validateMovedBooking(moved) {
  if (isSunday(moved.date) && !moved.employeeId) {
    return '';
  }
  if (moved.status !== 'cancelled' && moved.employeeId) {
    const isCobosu = moved.employeeId === COBOSU_ID;
    if (!isCobosu && (data.leaveRequests || []).some(leave => leave.employeeId === moved.employeeId && leave.status === 'APPROVED' && moved.date >= leave.startDate && moved.date <= leave.endDate)) {
      return 'El empleado tiene una ausencia aprobada en esa fecha.';
    }
    if (!C.employeeAvailable(lookup('employees', moved.employeeId), moved.date, C.minutes(moved.start), C.minutes(moved.end), data.schedule)) {
      return 'La reserva debe quedar dentro del turno del empleado.';
    }
  }
  const service = lookup('services', moved.serviceId);
  if (service?.schedule && !C.isOpen(moved.date, C.minutes(moved.start), C.minutes(moved.end), service.schedule)) {
    return 'Fuera del horario del servicio.';
  }
  return C.validateBooking(moved, data.bookings, data.schedule, data.centers, data.services);
}

function buildMovedCandidate(orig, nextDate, nextStart, nextEnd, nextEmployeeId) {
  const nextStatus = !nextEmployeeId
    ? (orig.status === 'confirmed' ? 'pending' : orig.status)
    : (!orig.employeeId && orig.status === 'pending' ? 'confirmed' : orig.status);
  return {
    ...orig,
    centerId: orig.centerId || currentGymId(),
    date: nextDate,
    start: nextStart,
    end: nextEnd,
    employeeId: nextEmployeeId,
    status: nextStatus,
    needsReschedule: false,
  };
}

function computeColumnDrop(col, clientY, orig) {
  const dropDate = col.dataset.dropDate;
  const rawEmp = col.dataset.dropEmployee;
  const startHour = Number(col.dataset.startHour || 0);
  const endHour = Number(col.dataset.endHour || 24);
  const employeeId = !rawEmp || rawEmp === '__unassigned' ? null : rawEmp;
  const duration = Math.max(15, C.minutes(orig.end) - C.minutes(orig.start));
  const rect = col.getBoundingClientRect();
  const grabOffset = Math.min(dragState?.grabOffsetPx || 0, Math.max(0, duration * 1.4 - 14));
  const relPx = Math.max(0, clientY - rect.top - grabOffset);
  const minStart = startHour * 60;
  const maxStart = Math.max(minStart, endHour * 60 - duration);
  const snapped = minStart + Math.round((relPx / 1.4) / 30) * 30;
  const startMin = Math.max(minStart, Math.min(maxStart, snapped));
  return {
    date: dropDate,
    start: C.timeLabel(startMin),
    end: C.timeLabel(startMin + duration),
    employeeId,
    startMin,
    duration,
    offsetMin: minStart,
  };
}

async function commitMovedBooking(orig, moved) {
  const err = validateMovedBooking(moved);
  if (err) {
    toast(err, true);
    return;
  }
  const whenLabel = (isSunday(moved.date) && !moved.employeeId)
    ? `Sin sitio asignado (${prettyDate(moved.date, { weekday: 'short', day: 'numeric', month: 'short' })})`
    : `${prettyDate(moved.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${moved.start}–${moved.end}`;
  if (serverMode) {
    if (state.saving) return;
    state.saving = true;
    try {
      await api('bookings/' + encodeURIComponent(orig.id), 'PUT', { booking: toServer(moved), syncSession: Boolean(orig.sessionId) });
      await refreshServer(true);
      toast(`Reserva movida a ${whenLabel}.`);
    } catch (e) {
      toast(e.message || 'No se pudo mover la reserva.', true);
      await refreshServer(true).catch(() => {});
    } finally {
      state.saving = false;
    }
    return;
  }
  const { history: _prevHist, incidents: _prevInc, ...previous } = orig;
  const movedWithHistory = {
    ...moved,
    history: [
      ...(orig.history || []),
      {
        at: new Date().toISOString(),
        actorId: currentUser?.id || 'local',
        action: 'MOVED',
        previous,
        next: { date: moved.date, start: moved.start, end: moved.end, employeeId: moved.employeeId },
      },
    ],
  };
  const index = data.bookings.findIndex(b => b.id === orig.id);
  if (index >= 0) data.bookings[index] = movedWithHistory;
  if (orig.sessionId) {
    data.bookings = data.bookings.map(b => (
      b.id !== orig.id && b.sessionId === orig.sessionId && b.status !== 'cancelled'
        ? {
            ...b,
            date: moved.date,
            start: moved.start,
            end: moved.end,
            employeeId: moved.employeeId,
            status: !moved.employeeId ? (b.status === 'confirmed' ? 'pending' : b.status) : (!b.employeeId && b.status === 'pending' ? 'confirmed' : b.status),
            needsReschedule: false,
            history: [
              ...(b.history || []),
              {
                at: new Date().toISOString(),
                actorId: currentUser?.id || 'local',
                action: 'MOVED',
                previous: { date: b.date, start: b.start, end: b.end, employeeId: b.employeeId },
                next: { date: moved.date, start: moved.start, end: moved.end, employeeId: moved.employeeId },
              },
            ],
          }
        : b
    ));
  }
  const persisted = saveData();
  render(true);
  toast(persisted ? `Reserva movida a ${whenLabel}.` : `Reserva movida en esta sesión a ${whenLabel}.`);
}

$('calendar').addEventListener('dragstart', event => {
  const card = event.target.closest('[data-booking][draggable="true"]');
  if (!card) return;
  const orig = data.bookings.find(b => b.id === card.dataset.booking);
  if (!orig || !canDragBooking(orig)) {
    event.preventDefault();
    return;
  }
  const rect = card.getBoundingClientRect();
  dragState = { id: orig.id, grabOffsetPx: card.classList.contains('event') ? Math.max(0, event.clientY - rect.top) : 0 };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', orig.id);
  }
  requestAnimationFrame(() => card.classList.add('is-dragging'));
});

$('calendar').addEventListener('dragover', event => {
  if (!dragState) return;
  const orig = data.bookings.find(b => b.id === dragState.id);
  if (!orig) return;

  const col = event.target.closest('.time-column[data-drop-date]');
  if (col) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (col.classList.contains('is-sunday-parking')) {
      document.querySelectorAll('#calendar .drop-preview').forEach(el => el.remove());
      document.querySelectorAll('#calendar .is-drop-target').forEach(el => { if (el !== col) el.classList.remove('is-drop-target'); });
      col.classList.add('is-drop-target');
      return;
    }
    const target = computeColumnDrop(col, event.clientY, orig);
    const moved = buildMovedCandidate(orig, target.date, target.start, target.end, target.employeeId);
    const err = validateMovedBooking(moved);
    document.querySelectorAll('#calendar .is-drop-target').forEach(el => { if (el !== col) el.classList.remove('is-drop-target'); });
    document.querySelectorAll('#calendar .drop-preview').forEach(el => { if (el.parentElement !== col) el.remove(); });
    col.classList.add('is-drop-target');
    let preview = col.querySelector(':scope > .drop-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'drop-preview';
      col.appendChild(preview);
    }
    preview.classList.toggle('is-invalid', Boolean(err));
    preview.style.top = `${(target.startMin - target.offsetMin) * 1.4}px`;
    preview.style.height = `${Math.max(target.duration * 1.4 - 2, 22)}px`;
    preview.textContent = err ? `${target.start} · ${err}` : `${target.start} – ${target.end}`;
    return;
  }

  const dayBox = event.target.closest('.day-heading[data-drop-day], .month-cell[data-month-cell]');
  if (dayBox) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('#calendar .drop-preview').forEach(el => el.remove());
    document.querySelectorAll('#calendar .is-drop-target').forEach(el => { if (el !== dayBox) el.classList.remove('is-drop-target'); });
    dayBox.classList.add('is-drop-target');
  }
});

$('calendar').addEventListener('dragleave', event => {
  if (!dragState) return;
  if (!$('calendar').contains(event.relatedTarget)) {
    clearDropUI();
  }
});

$('calendar').addEventListener('drop', event => {
  if (!dragState) return;
  const orig = data.bookings.find(b => b.id === dragState.id);
  const col = event.target.closest('.time-column[data-drop-date]');
  const dayBox = !col && event.target.closest('.day-heading[data-drop-day], .month-cell[data-month-cell]');
  if (!orig || (!col && !dayBox)) {
    clearDropUI();
    return;
  }
  event.preventDefault();
  suppressClickUntil = Date.now() + 250;
  let moved;
  if (col && col.classList.contains('is-sunday-parking')) {
    moved = buildMovedCandidate(orig, col.dataset.dropDate, orig.start, orig.end, null);
  } else if (col) {
    const target = computeColumnDrop(col, event.clientY, orig);
    moved = buildMovedCandidate(orig, target.date, target.start, target.end, target.employeeId);
  } else {
    const dropDate = dayBox.dataset.dropDay || dayBox.dataset.monthCell;
    const dropEmp = isSunday(dropDate) ? null : (orig.employeeId || null);
    moved = buildMovedCandidate(orig, dropDate, orig.start, orig.end, dropEmp);
  }
  dragState = null;
  document.querySelectorAll('#calendar .is-dragging').forEach(el => el.classList.remove('is-dragging'));
  clearDropUI();
  if (moved.date === orig.date && moved.start === orig.start && moved.end === orig.end && moved.employeeId === (orig.employeeId || null)) {
    return;
  }
  void commitMovedBooking(orig, moved);
});

$('calendar').addEventListener('dragend', () => {
  dragState = null;
  suppressClickUntil = Date.now() + 250;
  document.querySelectorAll('#calendar .is-dragging').forEach(el => el.classList.remove('is-dragging'));
  clearDropUI();
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
  const nowMin=now.getHours()*60+now.getMinutes();
  document.querySelectorAll('.now-line').forEach(line => {
    const startHour=Number(line.dataset.startHour||0);
    const endHour=Number(line.dataset.endHour||24);
    const inRange=nowMin>=startHour*60 && nowMin<=endHour*60;
    line.hidden=!inRange;
    if(inRange) line.style.top=`${(nowMin-startHour*60)*1.4}px`;
  });
},60000);

if(serverMode)window.TrainersPoint.poll(refreshServer,2000,()=>warn('Sin conexión. Los cambios se guardan solo cuando el servidor responde. Reintentando…'));
})().catch(e=>console.error('No se pudo iniciar el calendario',e));
