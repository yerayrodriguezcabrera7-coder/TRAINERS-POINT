const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { Store } = require("../dist/calendar/store");
const { server } = require("../dist/calendar/http");
const { normalize } = require("../dist/calendar/model");
let pg, pool, pool2, store, other;
const hours = Array.from({ length: 7 }, () => ({
  open: "09:00",
  close: "18:00",
  closed: false,
}));
function config() {
  return {
    timezone: "Europe/Madrid",
    schedule: structuredClone(hours),
    employees: ["e1", "e2"].map((id) => ({
      id,
      name: id,
      color: "#123456",
      schedule: structuredClone(hours),
    })),
    services: [
      { id: "s1", name: "Individual", duration: 60, capacity: 1 },
      { id: "s2", name: "Valoración", duration: 45, capacity: 1 },
      { id: "group", name: "Grupo", duration: 60, capacity: 3 },
    ],
    rooms: ["r1", "r2"].map((id) => ({ id, name: id })),
    clients: Array.from({ length: 20 }, (_, i) => ({
      id: "c" + i,
      name: "Cliente " + i,
      email: "c" + i + "@example.com",
      phone: "",
      notes: "",
    })),
  };
}
const booking = (extra = {}) => ({
  clientId: "c0",
  employeeId: "e1",
  serviceId: "s1",
  roomId: "r1",
  date: "2030-10-22",
  start: "10:00",
  status: "CONFIRMED",
  notes: "",
  ...extra,
});
async function gym(c = config()) {
  const id = randomUUID();
  await store.seed(id, c);
  return id;
}
before(async () => {
  const { default: Embedded } = await import("embedded-postgres");
  const net = require("node:net");
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  pg = new Embedded({
    databaseDir: join(await mkdtemp(join(tmpdir(), "calendar-test-")), "db"),
    user: "postgres",
    password: randomUUID(),
    port,
    persistent: false,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  const cfg = pg.getPgClient().connectionParameters;
  pool = new Pool({
    host: "127.0.0.1",
    port,
    user: cfg.user,
    password: cfg.password,
    database: "postgres",
    max: 15,
  });
  pool2 = new Pool({
    host: "127.0.0.1",
    port,
    user: cfg.user,
    password: cfg.password,
    database: "postgres",
    max: 15,
  });
  store = new Store(pool);
  other = new Store(pool2);
  await store.migrate();
});
after(async () => {
  await pool?.end();
  await pool2?.end();
  await pg?.stop();
});
test("12 peticiones concurrentes: solo una reserva individual", async () => {
  const g = await gym();
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? store : other).save(g, booking({ clientId: "c" + i })),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await store.state(g)).bookings.length, 1);
  for (const r of results.filter((r) => r.status === "rejected"))
    assert.equal(r.reason.status, 409);
});
test("Aforo grupal concurrente de tres, nunca cuatro", async () => {
  const g = await gym();
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? store : other).save(
        g,
        booking({
          clientId: "c" + i,
          serviceId: "group",
          sessionId: "class-1",
        }),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  await assert.rejects(
    store.save(
      g,
      booking({ clientId: "c15", serviceId: "group", sessionId: "different" }),
    ),
    /ocupados/,
  );
  await assert.rejects(
    store.save(
      g,
      booking({
        clientId: "c16",
        serviceId: "group",
        sessionId: "class-1",
        start: "10:15",
      }),
    ),
    /sesión grupal/,
  );
});
test("Individual no se convierte en grupo indicando sessionId", async () => {
  const g = await gym();
  await store.save(g, booking({ sessionId: "x" }));
  await assert.rejects(
    store.save(g, booking({ clientId: "c1", sessionId: "x" })),
  );
});
test("Slots 45 minutos respetan turno, apertura y reservas", async () => {
  const c = config();
  c.employees[0].schedule.forEach((h) => {
    h.open = "10:00";
    h.close = "12:00";
  });
  const g = await gym(c);
  await store.save(g, booking());
  const slots = await store.slots(g, {
    date: "2030-10-22",
    employeeId: "e1",
    serviceId: "s2",
    roomId: "r1",
  });
  assert.deepEqual(slots, [
    { start: "11:00", end: "11:45" },
    { start: "11:15", end: "12:00" },
  ]);
  await assert.rejects(store.save(g, booking({ start: "09:00" })), /horario/);
  await assert.rejects(store.save(g, booking({ start: "11:30" })), /horario/);
});
test("Cancelación libera hueco y reactivación vuelve a validar", async () => {
  const g = await gym();
  const a = await store.save(g, booking());
  const cancelled = await store.save(g, { ...a, status: "CANCELLED" }, a.id);
  const b = await store.save(g, booking({ clientId: "c1" }));
  assert.ok(b.id);
  await assert.rejects(
    store.save(g, { ...cancelled, status: "CONFIRMED" }, a.id),
    /ocupados/,
  );
});
test("Dos ediciones con la misma versión: una recibe conflicto", async () => {
  const g = await gym();
  const a = await store.save(g, booking());
  const results = await Promise.allSettled([
    store.save(g, { ...a, notes: "Uno" }, a.id),
    other.save(g, { ...a, notes: "Dos" }, a.id),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
});
test("Edición rechazada conserva la cita anterior", async () => {
  const g = await gym();
  const a = await store.save(g, booking());
  await store.save(g, booking({ clientId: "c1", start: "11:00" }));
  await assert.rejects(
    store.save(g, { ...a, start: "11:00", end: "12:00" }, a.id),
  );
  assert.equal(
    (await store.state(g)).bookings.find((b) => b.id === a.id).start,
    "10:00",
  );
});
test("Recursos distintos, citas consecutivas y gimnasios aislados", async () => {
  const g = await gym();
  await store.save(g, booking());
  await store.save(g, booking({ clientId: "c1", start: "11:00" }));
  await store.save(
    g,
    booking({ clientId: "c2", employeeId: "e2", roomId: "r2" }),
  );
  await store.save(await gym(), booking());
  await assert.rejects(
    store.save(g, booking({ clientId: "c3", employeeId: "e2" })),
    /ocupados/,
  );
  await assert.rejects(
    store.save(g, booking({ clientId: "c0", employeeId: "e2", roomId: "r2" })),
    /cliente/,
  );
});
test("Estados y duración no pueden falsearse", async () => {
  const g = await gym();
  await assert.rejects(store.save(g, booking({ end: "10:15" })), /duración/);
  await assert.rejects(
    store.save(g, booking({ status: "COMPLETED" })),
    /nueva cita/,
  );
  const a = await store.save(g, booking());
  await assert.rejects(
    store.save(g, { ...a, status: "NO_SHOW" }, a.id),
    /terminado/,
  );
  const past = await store.save(g, booking({ date: "2020-10-22" }));
  const closed = await store.save(g, { ...past, status: "NO_SHOW" }, past.id);
  await assert.rejects(
    store.save(g, { ...closed, status: "CONFIRMED" }, past.id),
    /estado/,
  );
});
test("No se cambia configuración si invalida reservas ni con revisión vieja", async () => {
  const g = await gym();
  await store.save(g, booking());
  const state = await store.state(g);
  const c = config();
  c.employees[0].schedule.forEach((h) => (h.closed = true));
  await assert.rejects(store.configure(g, c, state.revision), /horario/);
  await assert.rejects(store.configure(g, config(), 0), /cambiado/);
  assert.equal((await store.state(g)).revision, state.revision);
});
test("Cliente nuevo se revierte si falla reserva", async () => {
  const g = await gym();
  await store.save(g, booking());
  await assert.rejects(
    store.save(g, booking({ clientId: "new" }), undefined, {
      id: "new",
      name: "Nuevo",
      email: "",
      phone: "",
      notes: "",
    }),
  );
  assert.equal((await store.state(g)).clients.length, 20);
});
test("Cambio horario: rechaza horas inexistentes y ambiguas de Madrid", () => {
  assert.throws(
    () => normalize(booking({ date: "2030-03-31", start: "02:30" }), config()),
    /ambigua/,
  );
  assert.throws(
    () => normalize(booking({ date: "2030-10-27", start: "02:30" }), config()),
    /ambigua/,
  );
});
test("Fichajes parametrizados: usa toda la plantilla y evita dobles entradas", async () => {
  const c = config();
  c.employees = Array.from({ length: 7 }, (_, index) => ({
    id: `worker-${index + 1}`,
    name: `Empleado ${index + 1}`,
    color: "#456789",
    schedule: structuredClone(hours),
  }));
  const g = await gym(c);
  const initial = await store.attendance(g);
  assert.equal(initial.employees.length, 7);
  assert.equal(initial.records.length, 0);
  const attempts = await Promise.allSettled([
    store.clock(g, { employeeId: "worker-1", action: "IN" }),
    other.clock(g, { employeeId: "worker-1", action: "IN" }),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.find((result) => result.status === "rejected").reason.status, 409);
  assert.equal((await store.attendance(g)).records.filter((record) => !record.clockOut).length, 1);
  const closed = await store.clock(g, { employeeId: "worker-1", action: "OUT" });
  assert.ok(closed.clockOut);
  await assert.rejects(
    store.clock(g, { employeeId: "worker-1", action: "OUT" }),
    /jornada abierta/,
  );
  await assert.rejects(
    store.clock(g, { employeeId: "unknown", action: "IN" }),
    /desconocido/,
  );
});
test("API pública sincroniza dos servidores; autenticación y persistencia", async () => {
  const g = await gym(),
    token = "test-admin-token-long-enough";
  const apps = [server(store, g, token), server(other, g, token)];
  await Promise.all(
    apps.map((app) => new Promise((r) => app.listen(0, "127.0.0.1", r))),
  );
  const urls = apps.map((app) => "http://127.0.0.1:" + app.address().port);
  try {
    const attendancePage = await fetch(urls[0] + "/fichajes.html");
    assert.equal(attendancePage.status, 200);
    assert.match(await attendancePage.text(), /id="employee-list"/);
    assert.equal((await fetch(urls[0] + "/fichajes.js")).status, 200);
    assert.equal((await fetch(urls[0] + "/api/state")).status, 401);
    const before = await (
      await fetch(urls[1] + "/api/state", {
        headers: { Authorization: "Bearer " + token },
      })
    ).json();
    const res = await fetch(urls[0] + "/api/public/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booking: booking(),
        client: { name: "Web", email: "web@example.com" },
      }),
    });
    assert.equal(res.status, 201, await res.clone().text());
    const created = await res.json();
    assert.equal(created.status, "PENDING");
    const after = await (
      await fetch(urls[1] + "/api/state", {
        headers: { Authorization: "Bearer " + token },
      })
    ).json();
    assert.equal(after.revision, before.revision + 1);
    assert.equal(after.bookings[0].id, created.id);
    const catalog = await (await fetch(urls[0] + "/api/public/catalog")).json();
    assert.equal(catalog.clients, undefined);
    assert.equal(catalog.bookings, undefined);
    const productionRuntime = await (await fetch(urls[0] + "/runtime.js")).text();
    assert.match(productionRuntime, /true/);
    assert.doesNotMatch(productionRuntime, new RegExp(token));
    assert.equal(
      (
        await fetch(urls[0] + "/api/bookings", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: "null",
        })
      ).status,
      400,
    );
  } finally {
    await Promise.all(apps.map((app) => new Promise((r) => app.close(r))));
  }
});

test('Panel: guarda en servidor y recibe reservas públicas por polling sin recarga', async () => {
  const {JSDOM}=require('jsdom');
  const g=await gym(),token='ui-test-admin-token-long-enough';
  const app=server(store,g,token,{exposeAdminToken:true});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+app.address().port;
  let dom;
  async function until(fn){const limit=Date.now()+7000;while(Date.now()<limit){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('La interfaz no se actualizó');}
  try{
    dom=await JSDOM.fromURL(url,{resources:'usable',runScripts:'dangerously',beforeParse(w){
      w.prompt=()=>{throw Error('El modo local no debe pedir una clave');};w.fetch=(p,o)=>fetch(new URL(p,url),o);w.AbortSignal=AbortSignal;w.structuredClone=structuredClone;
      w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
      w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
    }});
    const w=dom.window,d=w.document;
    await until(()=>d.getElementById('employee-filter').options.length===3);
    assert.equal(d.getElementById('mode-title').textContent,'Servidor conectado');
    const jump=d.getElementById('jump-date');jump.value='2030-10-22';jump.dispatchEvent(new w.Event('change'));
    d.getElementById('new-booking').click();
    d.getElementById('booking-start').value='10:00';d.getElementById('booking-start').dispatchEvent(new w.Event('change'));
    assert.equal(d.getElementById('booking-end').value,'11:00');
    d.getElementById('booking-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
    await until(()=>d.querySelectorAll('[data-booking]').length===1);
    const res=await fetch(url+'/api/public/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({booking:booking({start:'12:00'}),client:{name:'Cliente web',email:'web@example.com'}})});
    assert.equal(res.status,201);
    await until(()=>d.querySelectorAll('[data-booking]').length===2);
    assert.match(d.getElementById('calendar').textContent,/Cliente web/);
    assert.equal(w.localStorage.getItem('trainers-point-calendar-v1'),null);
  }finally{dom?.window.close();await new Promise(r=>app.close(r));}
});

test('Gestión: fichas persistentes, estado del cliente y conflictos entre ediciones', async () => {
  const g=await gym();
  const initial=await store.state(g);
  const client=await store.manage(g,'clients',{name:'Nuevo cliente',email:'nuevo@example.com',phone:'600123123',notes:'Preferencia de mañana',status:'ACTIVE'},initial.revision);
  assert.equal((await other.state(g)).clients.find(c=>c.id===client.id).notes,'Preferencia de mañana');
  await assert.rejects(store.manage(g,'clients',{...client,name:'Edición vieja'},initial.revision,client.id),/cambiado/);
  let state=await store.state(g);
  await store.manage(g,'clients',{...client,status:'BLOCKED'},state.revision,client.id);
  await assert.rejects(store.save(g,booking({clientId:client.id})),/bloqueado/);
  const a=await store.save(g,booking());state=await store.state(g);
  await assert.rejects(store.manage(g,'clients',{...state.clients[0],status:'INACTIVE'},state.revision,'c0'),/inactivo/);
  assert.equal((await store.state(g)).bookings[0].id,a.id);
  const historyGym=await gym();await store.save(historyGym,booking({date:'2020-10-22'}));
  const h=await store.state(historyGym);
  await store.manage(historyGym,'services',{...h.services[0],duration:45,price:30},h.revision,'s1');
  assert.equal((await store.state(historyGym)).bookings[0].end,'11:00');
});

test('Turnos partidos y días libres afectan a disponibilidad y preservan reservas',async()=>{
  const g=await gym(),s=await store.state(g);
  await store.manage(g,'employees',{...s.employees[0],jobTitle:'Entrenador personal',shifts:[{date:'2030-10-22',periods:[{open:'09:00',close:'12:00'},{open:'15:00',close:'18:00'}]}]},s.revision,'e1');
  const slots=await store.slots(g,{date:'2030-10-22',employeeId:'e1',serviceId:'s1',roomId:'r1'});
  assert.ok(slots.some(s=>s.start==='15:00'));assert.ok(!slots.some(s=>s.start==='12:00'));
  await assert.rejects(store.save(g,booking({start:'11:30'})),/horario/);
  await store.save(g,booking());
  const next=await store.state(g);
  await assert.rejects(store.manage(g,'employees',{...next.employees[0],shifts:[{date:'2030-10-22',periods:[]}]},next.revision,'e1'),/horario/);
  await assert.rejects(store.manage(g,'employees',{...next.employees[0],shifts:[{date:'2030-10-22',periods:[{open:'09:00',close:'12:00'},{open:'11:00',close:'13:00'}]}]},next.revision,'e1'),/solapan/);
});

test('Usuarios: login, permisos de servidor, fichajes propios y revocación de sesiones',async()=>{
  const c=config();c.employees.push({...structuredClone(c.employees[0]),id:'e3',name:'Recepción'});
  const g=await gym(c),bootstrap='management-bootstrap-token-long-enough';
  const app=server(store,g,bootstrap,{exposeAdminToken:true});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.address().port;
  async function request(path,token=bootstrap,method='GET',body){return fetch(base+'/api/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
  try{
    const adminBody={record:{employeeId:'e1',username:'admin',role:'ADMIN',enabled:true}};
    const first=await request('manage/users',bootstrap,'POST',adminBody);assert.equal(first.status,201,await first.clone().text());
    const {token:admin,id:adminId,mustChangePassword}=await first.json();assert.ok(admin);assert.equal(mustChangePassword,true);
    const stored=await pool.query('SELECT password_hash,must_change_password FROM calendar.users WHERE id=$1',[adminId]);
    assert.match(stored.rows[0].password_hash,/^scrypt\$131072\$8\$1\$/);
    assert.ok(!stored.rows[0].password_hash.includes('Trainerspoint'));
    assert.equal(stored.rows[0].must_change_password,true);
    assert.equal((await request('state')).status,401,'Bootstrap key stops working after first account');
    assert.doesNotMatch(await (await fetch(base+'/runtime.js')).text(),new RegExp(bootstrap));
    assert.equal((await request('state',admin)).status,403,'New accounts cannot use protected routes before changing password');
    const change=async(token,currentPassword,newPassword)=>request('password/change',token,'POST',{currentPassword,newPassword,confirmPassword:newPassword});
    assert.equal((await change(admin,'wrong','Admin-personal-password-123')).status,400);
    assert.equal((await change(admin,'Trainerspoint','Admin-personal-password-123')).status,200);
    const adminMe=await request('me',admin);assert.equal((await adminMe.json()).mustChangePassword,false);
    const trainee=await request('manage/users',admin,'POST',{record:{employeeId:'e2',username:'trainer',role:'TRAINER',enabled:true}});
    assert.equal(trainee.status,201);const trainerId=(await trainee.json()).id;
    assert.equal((await request('manage/users',admin,'POST',{record:{employeeId:'e3',username:'desk',role:'RECEPTION',enabled:true}})).status,201);
    async function login(username,password='Trainerspoint'){const r=await request('login','', 'POST',{username,password});assert.equal(r.status,200,await r.clone().text());return r.json();}
    const trainerLogin=await login('trainer');assert.equal(trainerLogin.mustChangePassword,true);
    assert.equal((await request('state',trainerLogin.token)).status,403);
    assert.equal((await change(trainerLogin.token,'Trainerspoint','Trainer-personal-password-123')).status,200);
    const trainer=trainerLogin.token;
    const receptionistLogin=await login('desk');assert.equal(receptionistLogin.mustChangePassword,true);
    assert.equal((await change(receptionistLogin.token,'Trainerspoint','Reception-personal-password-123')).status,200);
    const receptionist=receptionistLogin.token;
    assert.equal((await request('login','', 'POST',{username:'trainer',password:'Trainerspoint'})).status,401);
    const trainerState=await (await request('state',trainer)).json();assert.equal(trainerState.employees.length,1);assert.equal(trainerState.employees[0].id,'e2');assert.equal((await request('bookings',trainer,'POST',{booking:{}})).status,403);
    const view=await (await request('manage',trainer)).json();assert.equal(view.employees.length,1);assert.equal(view.employees[0].id,'e2');assert.deepEqual(view.clients,[]);assert.deepEqual(view.users,[]);
    assert.equal((await request('config',trainer,'PUT',{config:c,revision:0})).status,403);
    assert.equal((await request('manage/users',trainer,'POST',adminBody)).status,403);
    assert.equal((await request('attendance/clock',trainer,'POST',{employeeId:'e1',action:'IN'})).status,403);
    assert.equal((await request('attendance/clock',trainer,'POST',{employeeId:'e2',action:'IN'})).status,201);
    await store.clock(g,{employeeId:'e1',action:'IN'});
    const attendance=await (await request('attendance',trainer)).json();assert.equal(attendance.employees.length,1);assert.ok(attendance.records.every(r=>r.employeeId==='e2'));
    assert.equal((await request('manage/services',receptionist,'POST',{record:c.services[0]})).status,403);
    const rev=(await (await request('manage',receptionist)).json()).revision;
    assert.equal((await request('manage/clients',receptionist,'POST',{record:{name:'Desde recepción',email:'',phone:'',notes:''},revision:rev})).status,201);
    assert.equal((await request('manage/users/'+adminId,admin,'PUT',{record:{...adminBody.record,enabled:false}})).status,409);
    const members=await (await request('manage',admin)).json();assert.ok(members.users.every(u=>!u.password_hash&&!u.password));
    assert.ok(members.users.every(u=>typeof u.mustChangePassword==='boolean'));
    assert.equal((await request('manage/users/'+trainerId,admin,'PUT',{record:{employeeId:'e2',username:'trainer',role:'TRAINER',enabled:false}})).status,200);
    assert.equal((await request('me',trainer)).status,401);
    await request('logout',receptionist,'POST');assert.equal((await request('me',receptionist)).status,401);
  }finally{await new Promise(r=>app.close(r));}
});

test('Pantallas de gestión: crear cliente y servicio, turnos y ficha con historial',async()=>{
  const {JSDOM}=require('jsdom');const g=await gym(),token='management-ui-test-long-enough';
  const app=server(store,g,token,{exposeAdminToken:true});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.address().port;let dom;
  const until=async fn=>{const end=Date.now()+7000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('UI timeout');};
  async function open(section){dom?.window.close();dom=await JSDOM.fromURL(base+'/gestion.html?section='+section,{resources:'usable',runScripts:'dangerously',beforeParse(w){w.fetch=(p,o)=>fetch(new URL(p,base),o);w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};}});await until(()=>dom.window.document.querySelector('[data-edit]'));return dom.window.document;}
  try{
    let d=await open('clients');d.getElementById('add').click();d.querySelector('[name=name]').value='Cliente interfaz';d.querySelector('[name=email]').value='ui@example.com';d.getElementById('record-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    await until(()=>d.getElementById('rows').textContent.includes('Cliente interfaz'));
    const state=await store.state(g);assert.ok(state.clients.some(c=>c.name==='Cliente interfaz'));
    d=await open('services');d.getElementById('add').click();d.querySelector('[name=name]').value='Pilates';d.querySelector('[name=capacity]').value='8';d.querySelector('[name=price]').value='25';d.getElementById('record-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    await until(()=>d.getElementById('rows').textContent.includes('Pilates'));
    assert.equal((await store.state(g)).services.find(s=>s.name==='Pilates').capacity,8);
    d=await open('shifts');d.querySelector('[data-edit=e1]').click();d.getElementById('shift-date').value='2030-10-23';d.getElementById('day-off').click();d.getElementById('record-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    await until(()=>!d.getElementById('editor').open);
    assert.deepEqual((await store.state(g)).employees[0].shifts,[{date:'2030-10-23',periods:[]}]);
  }finally{dom?.window.close();await new Promise(r=>app.close(r));}
});

test('Inicio: muestra actividad real, filtra pendientes y abre la reserva correcta',async()=>{
  const {JSDOM}=require('jsdom');
  const today=require('luxon').DateTime.now().setZone('Europe/Madrid').toISODate();
  const g=await gym(),token='overview-ui-test-admin-long-enough';
  const pending=await store.save(g,booking({date:today,status:'PENDING'}));
  await store.save(g,booking({date:today,start:'12:00',clientId:'c1'}));
  const cancelled=await store.save(g,booking({date:today,start:'14:00',clientId:'c2'}));
  await store.save(g,{...cancelled,status:'CANCELLED'},cancelled.id);
  await store.clock(g,{employeeId:'e1',action:'IN'});
  const app=server(store,g,token,{exposeAdminToken:true});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.address().port;let dom;
  const until=async fn=>{const end=Date.now()+7000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('Overview UI timeout');};
  const options={resources:'usable',runScripts:'dangerously',beforeParse(w){w.fetch=(p,o)=>fetch(new URL(p,base),o);w.AbortSignal=AbortSignal;w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};}};
  try{
    dom=await JSDOM.fromURL(base+'/inicio.html',options);let d=dom.window.document;
    await until(()=>d.getElementById('today-count').textContent==='2');
    assert.equal(d.getElementById('pending-count').textContent,'1');assert.equal(d.getElementById('client-count').textContent,'20');assert.equal(d.getElementById('clock-count').textContent,'1');
    assert.equal(d.querySelectorAll('.agenda-item').length,2);
    d.querySelector('[data-agenda=pending]').click();assert.equal(d.querySelectorAll('.agenda-item').length,1);
    const target=d.querySelector('.agenda-item').href;assert.ok(target.includes(pending.id));
    dom.window.close();dom=await JSDOM.fromURL(target,options);d=dom.window.document;
    await until(()=>d.getElementById('booking-dialog').open);
    assert.equal(d.getElementById('booking-client').value,'c0');assert.equal(d.getElementById('booking-status').value,'pending');assert.equal(d.getElementById('booking-date').value,today);
  }finally{dom?.window.close();await new Promise(r=>app.close(r));}
});
