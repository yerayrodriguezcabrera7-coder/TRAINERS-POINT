const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const {randomUUID}=require('node:crypto');
async function until(check){const deadline=Date.now()+5000;while(!check()){if(Date.now()>deadline)throw Error('No se actualizó la pantalla de pendientes');await new Promise(r=>setTimeout(r,20));}}

test('Pendientes: cuatro prioridades por cliente, lista completa, búsqueda y agendar con el bono existente',async()=>{
 const gymId=randomUUID(),serviceId=randomUUID(),now=Date.now();
 const clients=Array.from({length:6},(_,i)=>({id:randomUUID(),name:i===0?'Ana <prueba>':'Cliente '+i}));
 const packages=clients.map((client,i)=>({packageId:randomUUID(),clientId:client.id,clientName:client.name,serviceId,serviceName:'Entrenamiento',sessionsToSchedule:i===1?5:2,sessionsScheduled:0,expiresAt:new Date(now+([2,2,4,6,8,10][i])*86400000).toISOString(),daysRemaining:[2,2,4,6,8,10][i]}));
 const state={gymId,timezone:'Europe/Madrid',clients,services:[{id:serviceId,name:'Entrenamiento',duration:60}],employees:[{id:'e1',name:'Entrenador',active:true}],rooms:[{id:'r1',name:'Sala'}],bookings:[]};
 const errors=[],calls=[],console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync('web/planning/pendientes.html','utf8'),{url:'http://localhost/pendientes.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,d=w.document;
 w.structuredClone=structuredClone;w.TrainersPoint={poll:()=>()=>{}};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.fetch=async(path,options={})=>{calls.push({path,options});let result={};
  if(path==='/api/me')result={role:'RECEPTION'};
  else if(path==='/api/state')result=structuredClone(state);
  else if(path==='/api/pending-packages')result={packages:structuredClone(packages.filter(p=>p.sessionsToSchedule>0))};
  else if(path.startsWith('/api/slots?'))result=[{start:'10:00',end:'11:00'}];
  else if(path==='/api/bookings' && options.method==='POST'){
   const booking=JSON.parse(options.body).booking;const pkg=packages.find(p=>p.packageId===booking.packageId);assert.ok(pkg);pkg.sessionsToSchedule--;pkg.sessionsScheduled++;
   result={...booking,id:randomUUID(),version:1};state.bookings.push(result);
  }else throw Error('Petición inesperada '+path);
  return {ok:true,json:async()=>result};
 };
 try{
  w.eval(fs.readFileSync('web/planning/pendientes.js','utf8'));await until(()=>d.querySelectorAll('#rows tr').length===6);
  assert.equal(d.querySelectorAll('.pending-urgent-card').length,4);assert.match(d.querySelector('.pending-urgent-card h3').textContent,/Cliente 1/); // Same expiry, more sessions first.
  assert.equal(d.querySelectorAll('#urgent-list h3').length,4);assert.equal(d.getElementById('center'),null);assert.equal(d.getElementById('booking-center'),null);assert.equal(d.querySelectorAll('th').length,5);
  assert.equal(d.querySelector('#rows').textContent.includes('Ana <prueba>'),true);assert.equal(d.querySelector('#rows prueba'),null);
  d.getElementById('search').value='Ana';d.getElementById('search').dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('#rows tr').length,1);assert.equal(d.querySelectorAll('.pending-urgent-card').length,1);
  d.querySelector('#rows [data-package]').click();assert.equal(d.getElementById('editor').open,true);assert.match(d.getElementById('original').textContent,/sin crear otra compra/);
  const tomorrow=new Date(now+86400000).toISOString().slice(0,10);d.getElementById('date').value=tomorrow;
  d.getElementById('check').click();await until(()=>d.querySelector('[data-slot]'));d.querySelector('[data-slot]').click();assert.equal(d.getElementById('start').value,'10:00');
  d.getElementById('form').requestSubmit(d.getElementById('save'));await until(()=>d.getElementById('notice').textContent.includes('Sesión organizada'));
  const posts=calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);const sent=JSON.parse(posts[0].options.body).booking;
  assert.equal(sent.packageId,packages[0].packageId);assert.equal(sent.clientId,clients[0].id);assert.equal(sent.centerId,gymId);assert.equal(sent.employeeId,'e1');assert.equal(sent.end,'11:00');
  assert.equal(packages[0].sessionsToSchedule,1);assert.match(d.getElementById('rows').textContent,/1 sesión sin agendar/);assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

test('Pendientes: tiene en cuenta preferencias del cliente (entrenador habitual, horario preferente, consideraciones)', async () => {
 const gymId = randomUUID(), serviceId = randomUUID(), now = Date.now();
 const client = {
   id: randomUUID(),
   name: 'Marcos Gómez',
   assignedWorkerId: 'emp-yeray',
   contactSlot: 'MANANA',
   availability: { days: ['L', 'X', 'V'], slots: ['MANANA'] },
   objective: 'Pérdida de grasa y tonificación',
   injuryNotes: 'Condromalacia rotuliana'
 };
 const pkg = {
   packageId: randomUUID(),
   clientId: client.id,
   clientName: client.name,
   serviceId,
   serviceName: 'Entrenamiento Personal',
   sessionsToSchedule: 3,
   sessionsScheduled: 1,
   expiresAt: new Date(now + 10 * 86400000).toISOString(),
   daysRemaining: 10
 };
 const state = {
   gymId,
   timezone: 'Europe/Madrid',
   clients: [client],
   services: [{ id: serviceId, name: 'Entrenamiento Personal', duration: 60 }],
   employees: [
     { id: 'emp-other', name: 'Otro Entrenador', active: true },
     { id: 'emp-yeray', name: 'Yeray', active: true }
   ],
   rooms: [{ id: 'r1', name: 'Sala 1' }],
   bookings: []
 };
 const errors = [], console = new VirtualConsole(); console.on('jsdomError', e => errors.push(e.message));
 const dom = new JSDOM(fs.readFileSync('web/planning/pendientes.html', 'utf8'), {
   url: 'http://localhost/pendientes.html',
   runScripts: 'outside-only',
   pretendToBeVisual: true,
   virtualConsole: console
 });
 const w = dom.window, d = w.document;
 w.structuredClone = structuredClone;
 w.TrainersPoint = { poll: () => () => {} };
 w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
 w.HTMLDialogElement.prototype.close = function () { this.open = false; };
 w.fetch = async (path) => {
   if (path === '/api/me') return { ok: true, json: async () => ({ role: 'RECEPTION' }) };
   if (path === '/api/state') return { ok: true, json: async () => structuredClone(state) };
   if (path === '/api/pending-packages') return { ok: true, json: async () => ({ packages: [structuredClone(pkg)] }) };
   if (path.startsWith('/api/slots?')) return { ok: true, json: async () => [{ start: '10:00', end: '11:00' }, { start: '18:00', end: '19:00' }] };
   return { ok: true, json: async () => ({}) };
 };
 try {
   w.eval(fs.readFileSync('web/planning/pendientes.js', 'utf8'));
   await until(() => d.querySelector('#rows').textContent.includes('Marcos Gómez'));

   // Verificar que la fila y la tarjeta urgente muestran el entrenador habitual
   assert.match(d.querySelector('#rows').textContent, /⭐ Habitual: Yeray/);
   assert.match(d.querySelector('.pending-urgent-card').textContent, /⭐ Yeray · ⏰ Mañanas/);

   // Abrir modal de asignación
   d.querySelector('[data-package]').click();
   assert.equal(d.getElementById('editor').open, true);

   // Entrenador habitual pre-seleccionado automáticamente en el desplegable
   assert.equal(d.getElementById('employee').value, 'emp-yeray');

   // Banner de preferencias presente y visible con todos los detalles
   const prefBadge = d.getElementById('client-preferences-badge');
   assert.equal(prefBadge.hidden, false);
   assert.match(prefBadge.textContent, /Yeray/);
   assert.match(prefBadge.textContent, /Lunes, Miércoles, Viernes/);
   assert.match(prefBadge.textContent, /Mañanas/);
   assert.match(prefBadge.textContent, /Pérdida de grasa/);
   assert.match(prefBadge.textContent, /Condromalacia rotuliana/);

   // Mini-calendario presente y con días de preferencia (L, X, V) en verde
   const miniCal = d.getElementById('mini-calendar-wrap');
   assert.ok(miniCal, 'Debe existir el contenedor del mini-calendario');
   const prefDaysElements = miniCal.querySelectorAll('.mini-cal-day.is-preferred-day');
   assert.ok(prefDaysElements.length > 0, 'Debe haber días resaltados como preferencia en el mini-calendario');
   assert.match(prefDaysElements[0].textContent, /⭐/);

   // Al hacer clic en un día preferente habilitado del mini-calendario se actualiza la fecha
   const enabledPref = miniCal.querySelector('.mini-cal-day.is-preferred-day:not(:disabled)');
   assert.ok(enabledPref, 'Debe haber al menos un día preferente disponible para reservar');
   enabledPref.click();
   assert.equal(d.getElementById('date').value, enabledPref.dataset.miniDate);

   // Consultar huecos y verificar que la franja de mañana se marca como preferente con estrella
   const tomorrow = new Date(now + 86400000).toISOString().slice(0, 10);
   d.getElementById('date').value = tomorrow;
   d.getElementById('check').click();
   await until(() => d.querySelectorAll('[data-slot]').length === 2);
   const slotMorning = d.querySelector('[data-slot="10:00"]');
   const slotEvening = d.querySelector('[data-slot="18:00"]');
   assert.ok(slotMorning.classList.contains('is-preferred-slot'));
   assert.match(slotMorning.textContent, /⭐ 10:00/);
   assert.ok(!slotEvening.classList.contains('is-preferred-slot'));

   assert.deepEqual(errors, []);
 } finally {
   dom.window.close();
 }
});

test('Ficha: no aparece información ni formulario residual de centro en el resumen del cliente',()=>{
 const dom=new JSDOM(fs.readFileSync('web/clients/client-profile.html','utf8'));
 try{assert.equal(dom.window.document.getElementById('profile-gym'),null);assert.equal(dom.window.document.getElementById('profile-location'),null);assert.equal(dom.window.document.getElementById('profile-gym-form'),null);assert.equal(dom.window.document.getElementById('profile-gym-select'),null);}finally{dom.window.close();}
});

test('Calendario de lunes a domingo completo y mini-calendario con días de preferencia en verde en el diálogo de agendar', async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomerror', err => errors.push(err.message));
  const gymId = 'tp-test-gym';
  const serviceId = randomUUID();
  const empId = randomUUID();
  const clientId = randomUUID();
  const pkgId = randomUUID();

  const state = {
    gymId,
    timezone: 'Europe/Madrid',
    packagesEnabled: true,
    schedule: [
      { open: '08:00', close: '21:00', closed: false },
      { open: '08:00', close: '21:00', closed: false },
      { open: '08:00', close: '21:00', closed: false },
      { open: '08:00', close: '21:00', closed: false },
      { open: '08:00', close: '21:00', closed: false },
      { open: '08:00', close: '14:00', closed: false },
      { open: '08:00', close: '21:00', closed: true } // Domingo cerrado
    ],
    centers: [{ id: gymId, name: 'Trainers Point Bilbao', brand: 'TRAINERS_POINT' }],
    rooms: [{ id: 'r1', name: 'Sala 1' }],
    services: [{ id: serviceId, name: 'Entrenamiento Personal', duration: 60, price: 50, active: true, color: '#10b981', modality: 'INDIVIDUAL' }],
    employees: [{
      id: empId,
      name: 'Yeray Entrenador',
      active: true,
      color: '#10b981',
      shifts: [
        { date: '2026-11-16', periods: [{ open: '09:00', close: '14:00' }] }
      ]
    }],
    clients: [{
      id: clientId,
      name: 'Alejandro Ortiz',
      brand: 'TRAINERS_POINT',
      status: 'ACTIVE',
      assignedWorkerId: empId,
      availability: { days: ['L', 'X', 'V'], slots: ['MANANA'] },
      contactSlot: 'MANANA'
    }],
    bookings: [],
    revision: 1
  };

  const pendingPackages = {
    packages: [{
      packageId: pkgId,
      clientId,
      clientName: 'Alejandro Ortiz',
      serviceId,
      serviceName: 'Entrenamiento Personal',
      sessionsToSchedule: 4,
      sessionsScheduled: 0,
      sessionsBought: 4,
      expiresAt: '2026-11-30T23:59:59.000Z',
      daysRemaining: 11,
      paymentPending: false
    }]
  };

  const dom = new JSDOM(fs.readFileSync('web/calendar/index.html', 'utf8'), {
    runScripts: 'outside-only',
    url: 'http://localhost/calendar/index.html',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const w = dom.window;
  const d = w.document;

  w.CALENDAR_SERVER = true;
  w.sessionStorage.setItem('calendar-admin-token', 'mock-token');
  w.localStorage.setItem('calendar-active-brand-view', 'TRAINERS_POINT');
  w.localStorage.setItem('calendar-selected-gym', gymId);
  w.structuredClone = structuredClone;
  w.TrainersPoint = { poll: () => () => {} };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.confirm = () => true;

  w.fetch = async (path, options = {}) => {
    let result = {};
    if (path === '/api/me') {
      result = { user: { id: 'admin', name: 'Administrador', role: 'ADMIN' }, role: 'ADMIN' };
    } else if (path === '/api/state') {
      result = structuredClone(state);
    } else if (path === '/api/pending-packages') {
      result = structuredClone(pendingPackages);
    } else if (path.startsWith('/api/recoveries')) {
      result = [];
    } else if (path === '/api/aws-clients') {
      result = { clients: [] };
    } else if (path.startsWith('/api/slots?')) {
      result = [{ start: '10:00', end: '11:00' }];
    } else {
      result = {};
    }
    return { ok: true, json: async () => result };
  };

  try {
    w.eval(fs.readFileSync('web/calendar/calendar-core.js', 'utf8'));
    w.eval(fs.readFileSync('web/calendar/app.js', 'utf8'));
    w.eval(fs.readFileSync('web/calendar/pending-banner.js', 'utf8'));

    // Esperar a que el calendario y el banner carguen
    await until(() => d.querySelectorAll('.day-heading').length === 7);
    await until(() => d.getElementById('planning-banner-count')?.textContent.includes('Alejandro Ortiz'));

    // 1. Verificar que se muestran los 7 días (Lunes a Domingo) y botones de añadir entrenador (+)
    const dayHeadings = d.querySelectorAll('.day-heading');
    assert.equal(dayHeadings.length, 7, 'Deben mostrarse los 7 días de lunes a domingo');

    const addTrainerBtns = d.querySelectorAll('.add-trainer-day-btn');
    assert.ok(addTrainerBtns.length >= 7, 'Cada día debe disponer del botón "+" para añadir entrenadores según necesidad');

    const timeColumns = d.querySelectorAll('.time-column');
    assert.ok(timeColumns.length >= 7, 'Debe haber al menos 7 columnas de tiempo en la cuadrícula');

    // El día con turno (Lunes 16) tiene la columna del entrenador planificado
    assert.ok(d.querySelector('[data-shift-employee]'), 'Debe mostrarse el entrenador planificado en su día');

    // Los días sin turno muestran el estado limpio con botón para añadir entrenador
    const emptyPlaceholders = d.querySelectorAll('.empty-day-placeholder');
    assert.ok(emptyPlaceholders.length > 0, 'Los días sin turnos no deben mostrar todos los entrenadores forzados, sino el botón de añadir');

    // Comprobar que en vista semanal se adapta al 100% sin scroll horizontal
    const timeGrid = d.querySelector('.time-grid');
    assert.ok(timeGrid?.classList.contains('is-week-view'), 'El grid debe tener la clase is-week-view');
    assert.match(timeGrid.style.gridTemplateColumns, /minmax\(0,\s*1fr\)/, 'Las columnas deben usar minmax(0, 1fr) para caber sin deslizamiento');
    const calScroll = d.getElementById('calendar');
    assert.ok(calScroll.classList.contains('is-week-view'), 'El contenedor de scroll debe tener la clase is-week-view');

    // 2. Abrir el desplegable de pendientes y pulsar "Agendar sesión"
    d.getElementById('planning-banner-header').click();
    await until(() => !d.getElementById('planning-banner-content').hidden);

    const agendarBtn = d.querySelector('[data-package="' + pkgId + '"]');
    assert.ok(agendarBtn, 'Debe existir el botón para agendar la sesión del bono');
    agendarBtn.click();

    // 3. Verificar que se abre el modal del editor y que el mini-calendario se renderiza
    await until(() => d.getElementById('planning-editor').open);
    const miniCal = d.getElementById('planning-mini-calendar-wrap');
    assert.ok(miniCal, 'Debe existir el contenedor del mini-calendario');

    // Comprobar días de preferencia en verde (.is-preferred-day)
    const prefDays = miniCal.querySelectorAll('.mini-cal-day.is-preferred-day');
    assert.ok(prefDays.length >= 10, 'Deben marcarse en verde los días preferidos (L, X, V) del mes');
    assert.match(miniCal.textContent, /⭐/);
    assert.match(miniCal.textContent, /Lunes, Miércoles, Viernes/);

    // 4. Seleccionar un día de preferencia en el mini-calendario
    const dayToClick = Array.from(prefDays).find(btn => !btn.disabled);
    assert.ok(dayToClick, 'Debe haber al menos un día preferente habilitado para seleccionar');
    const targetDate = dayToClick.dataset.miniDate;
    dayToClick.click();

    // Comprobar que el input de fecha se actualiza y el día queda seleccionado
    assert.equal(d.getElementById('planning-date').value, targetDate);
    const selectedDay = miniCal.querySelector('.mini-cal-day.is-selected');
    assert.equal(selectedDay?.dataset.miniDate, targetDate);

    // Esperar a que se consulten los slots para evitar promesas huérfanas
    await until(() => d.querySelectorAll('#editor-slots [data-slot]').length > 0);

    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
