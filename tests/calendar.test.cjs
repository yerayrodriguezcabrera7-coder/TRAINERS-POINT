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
test("API pública sincroniza dos servidores; autenticación y persistencia", async () => {
  const g = await gym(),
    token = "test-admin-token-long-enough";
  const apps = [server(store, g, token), server(other, g, token)];
  await Promise.all(
    apps.map((app) => new Promise((r) => app.listen(0, "127.0.0.1", r))),
  );
  const urls = apps.map((app) => "http://127.0.0.1:" + app.address().port);
  try {
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
