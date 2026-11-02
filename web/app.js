/* Modo servidor con API; Live Server conserva la demostración local. */
(async function boot() {
'use strict';
const C = window.CalendarCore;
const $ = id => document.getElementById(id);
const KEY = 'trainers-point-calendar-v1';
const STATUS = { confirmed: 'Confirmada', pending: 'Pendiente', completed: 'Finalizada', cancelled: 'Cancelada', no_show: 'No presentado' };
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const todayKey = () => C.dateKey(new Date());
const prettyDate = (key, options) => new Intl.DateTimeFormat('es-ES', options).format(C.parseDate(key));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const state = { date: todayKey(), view: window.innerWidth < 760 ? 'day' : 'week', employee: 'all', service: 'all', room: 'all', editing: null };
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
  const res=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+adminToken},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
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
    state.employee = currentUser.employeeId;
    $('new-booking').hidden = true;
    $('schedule-button').hidden = true;
  } else if (currentUser.role !== 'ADMIN') {
    $('schedule-button').hidden = true;
  }
  try {data=await api('state');data.bookings=data.bookings.map(fromServer);await loadBookingClients();sessionStorage.setItem('calendar-admin-token',adminToken);}
  catch(e){sessionStorage.removeItem('calendar-admin-token');warn(e.message+'. Recarga para volver a conectar.');$('new-booking').disabled=true;$('schedule-button').disabled=true;return;}
} else data=loadData();
let polling=false;
async function refreshServer(force=false) {
  if(polling)return;
  polling=true;
  try {
    const next=await api('state');
    if(force||next.revision!==data.revision) {
      data={...next,bookings:next.bookings.map(fromServer)};
      await loadBookingClients();
      // Do not change form values or the version captured when a dialog was opened.
      if(!document.querySelector('dialog[open]')) setupSelects();
      render();
    }
    $('storage-warning').hidden=true;
  } finally {polling=false;}
}
function saveData() {
  if (!storageWritable) return false;
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { warn('No hay espacio disponible en el navegador para guardar los cambios.'); return false; }
}
function lookup(collection, id) { return data[collection].find(item => item.id === id) || { name: 'Sin asignar' }; }
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
  return data.bookings.filter(b => dates.has(b.date) && (state.employee === 'all' || b.employeeId === state.employee) && (state.service === 'all' || b.serviceId === state.service) && (state.room === 'all' || b.roomId === state.room));
}
function fillSelect(id, list, extra = '') { $(id).innerHTML = extra + list.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join(''); }
function setupSelects() {
  fillSelect('employee-filter', data.employees, '<option value="all">Ver todos</option>');
  fillSelect('service-filter', data.services, '<option value="all">Todos los servicios</option>');
  fillSelect('room-filter', data.rooms, '<option value="all">Todos los espacios</option>');
  fillSelect('booking-employee', data.employees);
  fillSelect('booking-service', data.services);
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
function eventLabel(b) { return `${lookup('clients', b.clientId).name}, ${lookup('services', b.serviceId).name}, ${b.start} a ${b.end}, ${STATUS[b.status]}, ${lookup('employees', b.employeeId).name}, ${lookup('rooms', b.roomId).name}`; }

function renderTimeGrid(dates, bookings, employees) {
  const columns = dates.length * employees.length;
  const minWidth = state.view === 'day' ? 190 : employees.length === 1 ? 145 : 108;
  let html = `<div class="time-grid" style="grid-template-columns:58px repeat(${columns},minmax(${minWidth}px,1fr))"><div class="corner" style="grid-column:1;grid-row:1 / 3;top:0">HORA</div>`;
  dates.forEach((date, i) => {
    const today = date === todayKey();
    html += `<div class="day-heading ${today ? 'today' : ''}" style="grid-column:${2 + i * employees.length} / span ${employees.length};grid-row:1"><span class="day-name">${prettyDate(date, { weekday: 'short' })}</span><strong>${C.parseDate(date).getDate()}</strong><span>${prettyDate(date, { month: 'short' })}</span></div>`;
    employees.forEach((employee, j) => { html += `<div class="employee-heading" style="grid-column:${2 + i * employees.length + j};grid-row:2;--employee-color:${employee.color}"><span class="employee-dot"></span>${escapeHTML(employee.name)}</div>`; });
  });
  html += '<div class="time-axis" style="grid-column:1;grid-row:3">' + Array.from({length:24}, (_, hour) => `<div class="hour-label">${C.timeLabel(hour * 60)}</div>`).join('') + '</div>';
  dates.forEach((date, i) => employees.forEach((employee, j) => {
    html += `<div class="time-column ${date === todayKey() ? 'is-today' : ''}" style="grid-column:${2 + i * employees.length + j};grid-row:3">`;
    for (let slot = 0; slot < 48; slot++) {
      const start = slot * 30;
      const override = employee.shifts?.find(s=>s.date===date);
      const working = override ? override.periods.some(p=>start>=C.minutes(p.open) && start+30<=C.minutes(p.close)) : !employee.schedule || C.isOpen(date,start,start+30,employee.schedule);
      const open = employee.active!==false && working && C.isOpen(date, start, start + 30, data.schedule);
      const label = `${prettyDate(date, { day: 'numeric', month: 'long' })}, ${C.timeLabel(start)}, ${employee.name}`;
      html += `<button class="time-slot ${open ? '' : 'closed'}" ${open ? '' : 'disabled'} data-slot="${date}" data-minute="${start}" data-employee="${employee.id}" aria-label="${open ? 'Nueva reserva: ' : 'Fuera de apertura: '}${escapeHTML(label)}" title="${open ? 'Crear reserva' : 'Fuera de apertura'}"></button>`;
    }
    const dayBookings = bookings.filter(b => b.date === date && b.employeeId === employee.id);
    const placed = C.layoutEvents(dayBookings);
    placed.forEach(({ event: b, lane, count }) => {
      const startMin = C.minutes(b.start);
      const endMin = C.minutes(b.end);
      const top = startMin * 1.4;
      const height = Math.max((endMin - startMin) * 1.4 - 2, 22);
      const width = 100 / count;
      const left = lane * width;
      const currentEmployee = lookup('employees', b.employeeId);
      const color = currentEmployee.color || '#317b9b';
      const soft = `${color}18`;
      const clientName = lookup('clients', b.clientId).name;
      const serviceName = lookup('services', b.serviceId).name;
      const roomName = lookup('rooms', b.roomId).name;
      html += `<button class="event ${b.status}" data-booking="${b.id}" style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px);--event-color:${color};--event-soft:${soft}" aria-label="${escapeHTML(eventLabel(b))}"><div class="event-time">${b.start} – ${b.end}</div><div class="event-title">${escapeHTML(clientName)}</div><div class="event-meta">${escapeHTML(serviceName)} · ${escapeHTML(roomName)}</div></button>`;
    });
    if (date === todayKey()) html += '<div class="now-line" aria-hidden="true"></div>';
    html += '</div>';
  }));
  return `${html}</div>`;
}

function renderMonth(bookings) {
  const first = `${state.date.slice(0, 7)}-01`;
  const start = C.monday(first);
  const dates = Array.from({ length: 42 }, (_, i) => C.addDays(start, i));
  let html = '<div class="month-grid"><div class="month-weekdays">' + DAYS.map(d => `<div>${d.slice(0, 3)}</div>`).join('') + '</div><div class="month-days">';
  dates.forEach(date => {
    const isCurrentMonth = date.slice(0, 7) === state.date.slice(0, 7);
    const isToday = date === todayKey();
    const dayBookings = bookings.filter(b => b.date === date);
    const active = dayBookings.filter(b => b.status !== 'cancelled');
    html += `<div class="month-cell ${isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''}" data-month-cell="${date}"><div class="month-cell-header"><span class="day-number">${C.parseDate(date).getDate()}</span>${active.length ? `<span class="month-badge">${active.length}</span>` : ''}</div><div class="month-events">${dayBookings.slice(0, 3).map(b => {
      const color = lookup('employees', b.employeeId).color || '#317b9b';
      return `<button class="month-event ${b.status}" data-booking="${b.id}" style="--event-color:${color}" title="${escapeHTML(eventLabel(b))}"><span class="month-event-dot"></span><span>${b.start} ${escapeHTML(lookup('clients', b.clientId).name)}</span></button>`;
    }).join('')}${dayBookings.length > 3 ? `<div class="month-more">+${dayBookings.length - 3} más</div>` : ''}</div></div>`;
  });
  return `${html}</div></div>`;
}

function render(updatePeriodTitle = false) {
  const dates = visibleDates();
  const bookings = visibleBookings();
  const employees = state.employee === 'all' ? data.employees.filter(e => e.active !== false) : data.employees.filter(e => e.id === state.employee);
  $('period-label').textContent = titleForPeriod(dates);
  $('jump-date').value = state.date;
  $('calendar').innerHTML = state.view === 'month' ? renderMonth(bookings) : renderTimeGrid(dates, bookings, employees.length ? employees : data.employees);
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
  if (value === 'new') { updateClientFields(); return; }
  const client = availableClients().find(item => item.id === value);
  $('client-search').value = client?.name || '';
  $('client-results').hidden = true;
}
function updateHoursHint() {
  const date = $('booking-date').value;
  if (!C.validDate(date)) { $('booking-hours').textContent = ''; return; }
  const hours = C.hoursFor(date, data.schedule);
  $('booking-hours').textContent = hours.closed ? 'El centro está cerrado este día.' : `Apertura: ${hours.open} – ${hours.close}. Se comprueba la disponibilidad de entrenador y sala al guardar.`;
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
  const bookingClients = serverMode && awsClientsLoaded ? awsClients : data.clients;
  fillSelect('booking-client', bookingClients.filter(c=>(c.status||'ACTIVE')==='ACTIVE'||c.id===b?.clientId), '');
  fillSelect('booking-service', data.services.filter(s=>s.active!==false||s.id===b?.serviceId));
  fillSelect('booking-employee', data.employees.filter(e=>e.active!==false||e.id===b?.employeeId));
  $('booking-client').insertAdjacentHTML('beforeend','<option value="new">＋ Añadir nuevo cliente</option>');
  const hours = C.hoursFor(date, data.schedule);
  const start = minute ?? C.minutes(hours.open);
  const selectedService = data.services.find(s => s.id === state.service && s.active !== false);
  const service = selectedService || data.services.find(s => s.active !== false) || data.services[0];
  const duration = service.duration || 60;
  const values = b || {clientId:availableClients()[0]?.id || 'new',employeeId:employeeId || (state.employee === 'all' ? data.employees.find(e=>e.active!==false).id : state.employee),serviceId:service.id,roomId:state.room === 'all' ? data.rooms[0].id : state.room,date,start:C.timeLabel(start),end:C.timeLabel(Math.min(start+duration,C.minutes(hours.close))),status:'confirmed',notes:''};
  for (const [field,key] of Object.entries({client:'clientId',employee:'employeeId',service:'serviceId',room:'roomId',date:'date',start:'start',end:'end',status:'status',notes:'notes'})) $('booking-'+field).value = values[key] || '';
  syncClientPicker();
  $('booking-end').readOnly=serverMode;
  $('booking-title').textContent = b ? 'Detalle de la reserva' : 'Nueva reserva';

  const isTrainer = currentUser?.role === 'TRAINER';
  const saveBtn = $('booking-form').querySelector('button[type="submit"]');
  if (saveBtn) saveBtn.hidden = isTrainer;
  if ($('cancel-booking')) $('cancel-booking').hidden = isTrainer || !b || b.status === 'cancelled';
  if ($('add-client')) $('add-client').hidden = isTrainer;
  $('booking-dialog').querySelectorAll('input, select, textarea').forEach(el => {
    if (el.id !== 'client-search') el.disabled = isTrainer;
  });

  updateClientFields(); updateHoursHint();
  $('booking-dialog').showModal();
}
function formError(id,message) { $(id).textContent = message; $(id).hidden = false; }
$('booking-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (currentUser?.role === 'TRAINER') return;
  const clientId = $('booking-client').value;
  if (clientId === 'new' && !$('client-name').value.trim()) { formError('booking-error','Escribe el nombre del cliente.'); return; }
  const booking = {id:state.editing || uid(),clientId:clientId === 'new' ? uid() : clientId,employeeId:$('booking-employee').value,serviceId:$('booking-service').value,roomId:$('booking-room').value,date:$('booking-date').value,start:$('booking-start').value,end:$('booking-end').value,status:$('booking-status').value,notes:$('booking-notes').value.trim()};
  if(serverMode) {
    if(state.saving)return;
    state.saving=true;
    try {
      booking.version=state.editingVersion;
      booking.sessionId=state.editingSnapshot?.sessionId||null;
      const duration=lookup('services',booking.serviceId).duration;
      booking.end=C.timeLabel(C.minutes(booking.start)+duration);
      const client=clientId==='new'?{id:booking.clientId,name:$('client-name').value.trim(),email:$('client-email').value.trim(),phone:$('client-phone').value.trim(),notes:''}:undefined;
      await api(state.editing?'bookings/'+encodeURIComponent(state.editing):'bookings',state.editing?'PUT':'POST',{booking:toServer(booking),client});
      state.date=booking.date;$('booking-dialog').close();
      await refreshServer(true);toast('Reserva guardada en el servidor.');
    } catch(e){formError('booking-error',e.message);} finally{state.saving=false;}
    return;
  }
  const error = C.validateBooking(booking,data.bookings,data.schedule);
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
  if (service.duration && $('booking-start').value) {
    const end = Math.min(C.minutes($('booking-start').value) + service.duration, 1439);
    $('booking-end').value = C.timeLabel(end);
  }
});
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
    try{await api('bookings/'+encodeURIComponent(booking.id),'PUT',{booking:toServer({...state.editingSnapshot,status:'cancelled',version:state.editingVersion})});$('cancel-dialog').close();$('booking-dialog').close();await refreshServer(true);toast('Reserva cancelada.');}
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
    try{await api('config','PUT',{config:{...state.configSnapshot,schedule},revision:state.configRevision});$('schedule-dialog').close();await refreshServer(true);toast('Apertura actualizada. Los horarios laborales se configuran por entrenador en la API.');}
    catch(e){formError('schedule-error',e.message);}return;
  }
  data.schedule = schedule;
  const persisted = saveData();
  $('schedule-dialog').close();render();toast(persisted?'Horario actualizado.':'Horario actualizado solo en esta sesión.');
});

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
setInterval(() => {
  const now=new Date();
  document.querySelectorAll('.now-line').forEach(line => {line.style.top=`${(now.getHours()*60+now.getMinutes())*1.4}px`;});
},60000);

if(serverMode)setInterval(()=>refreshServer().catch(()=>warn('Sin conexión. Los cambios se guardan solo cuando el servidor responde. Reintentando…')),2000);
})().catch(e=>console.error('No se pudo iniciar el calendario',e));