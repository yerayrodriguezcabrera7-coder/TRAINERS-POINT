const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { Store } = require("../dist/calendar/store");
const { server } = require("../dist/calendar/http");

let pg, pool, store;

const hours = Array.from({ length: 7 }, () => ({
  open: "09:00",
  close: "18:00",
  closed: false,
}));

function testConfig() {
  return {
    timezone: "Europe/Madrid",
    schedule: structuredClone(hours),
    employees: [
      { id: "e1", name: "Admin Uno", color: "#111111", schedule: structuredClone(hours) },
      { id: "e2", name: "Entrenador Dos", color: "#222222", schedule: structuredClone(hours) },
      { id: "e3", name: "Entrenador Tres", color: "#333333", schedule: structuredClone(hours) },
      { id: "e4", name: "Recepción Cuatro", color: "#444444", schedule: structuredClone(hours) },
    ],
    services: [
      { id: "s1", name: "Entrenamiento personal", duration: 60, capacity: 1, active: true },
      { id: "s2", name: "Fisioterapia", duration: 45, capacity: 1, active: true },
    ],
    rooms: [
      { id: "r1", name: "Sala 1" },
      { id: "r2", name: "Sala 2" },
    ],
    clients: [
      { id: "c0", name: "Cliente Cero", email: "c0@example.com", phone: "600000000", notes: "", status: "ACTIVE" },
      { id: "c1", name: "Cliente Uno (asignado e2)", email: "c1@example.com", phone: "600000001", notes: "", status: "ACTIVE", assignedWorkerId: "e2" },
      { id: "c2", name: "Cliente Dos (asignado e3)", email: "c2@example.com", phone: "600000002", notes: "", status: "ACTIVE", assignedWorkerId: "e3" },
    ],
  };
}

before(async () => {
  const { default: Embedded } = await import("embedded-postgres");
  const net = require("node:net");
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  pg = new Embedded({
    databaseDir: join(await mkdtemp(join(tmpdir(), "roles-test-")), "db"),
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
  store = new Store(pool);
  await store.migrate();
});

after(async () => {
  await pool?.end();
  await pg?.stop();
});

test("Roles y permisos: RBAC en servidor, aislamiento entre entrenadores, fichajes y cliente", async () => {
  const cfg = testConfig();
  const gymId = randomUUID();
  await store.seed(gymId, cfg);

  // Crear citas para e2 y e3
  await store.save(gymId, {
    clientId: "c0",
    employeeId: "e2",
    serviceId: "s1",
    roomId: "r1",
    date: "2030-10-22",
    start: "10:00",
    status: "CONFIRMED",
    notes: "Cita con e2",
  });
  await store.save(gymId, {
    clientId: "c2",
    employeeId: "e3",
    serviceId: "s1",
    roomId: "r2",
    date: "2030-10-22",
    start: "11:00",
    status: "CONFIRMED",
    notes: "Cita con e3",
  });

  const bootstrapToken = "bootstrap-roles-token-long-enough";
  const app = server(store, gymId, bootstrapToken, { exposeAdminToken: true });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.address().port;

  async function req(path, token = bootstrapToken, method = "GET", body) {
    return fetch(base + "/api/" + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  try {
    // 1. Crear cuentas para los 4 roles
    // ADMIN (primera cuenta por bootstrap)
    const adminRes = await req("manage/users", bootstrapToken, "POST", {
      record: { employeeId: "e1", username: "admin", role: "ADMIN", enabled: true },
    });
    assert.equal(adminRes.status, 201);
    const { token: adminToken, mustChangePassword } = await adminRes.json();
    assert.equal(mustChangePassword, true);
    assert.equal((await req("state", adminToken)).status, 403);
    async function changePassword(token, newPassword) {
      return req("password/change", token, "POST", {
        currentPassword: "Trainerspoint",
        newPassword,
        confirmPassword: newPassword,
      });
    }
    assert.equal((await changePassword(adminToken, "Admin-personal-password-123")).status, 200);

    // TRAINER 1 (e2)
    const t1Res = await req("manage/users", adminToken, "POST", {
      record: { employeeId: "e2", username: "trainer1", role: "TRAINER", enabled: true },
    });
    assert.equal(t1Res.status, 201);

    // TRAINER 2 (e3)
    const t2Res = await req("manage/users", adminToken, "POST", {
      record: { employeeId: "e3", username: "trainer2", role: "TRAINER", enabled: true },
    });
    assert.equal(t2Res.status, 201);

    // RECEPTION (e4)
    const recRes = await req("manage/users", adminToken, "POST", {
      record: { employeeId: "e4", username: "reception", role: "RECEPTION", enabled: true },
    });
    assert.equal(recRes.status, 201);

    // CLIENT (c0)
    const cliRes = await req("manage/users", adminToken, "POST", {
      record: { clientId: "c0", username: "client", role: "CLIENT", enabled: true },
    });
    assert.equal(cliRes.status, 201);

    // Logins
    async function login(username, newPassword) {
      const res = await req("login", "", "POST", { username, password: "Trainerspoint" });
      assert.equal(res.status, 200, await res.clone().text());
      const session = await res.json();
      assert.equal(session.mustChangePassword, true);
      assert.equal((await req("state", session.token)).status, 403);
      assert.equal((await changePassword(session.token, newPassword)).status, 200);
      return session.token;
    }

    const t1 = await login("trainer1", "Trainer-one-personal-password-123");
    const t2 = await login("trainer2", "Trainer-two-personal-password-123");
    const rec = await login("reception", "Reception-personal-password-123");
    const cli = await login("client", "Client-personal-password-123");

    // ==========================================
    // REQUISITO: El cliente no accede a nada de gestión
    // ==========================================
    assert.equal((await req("manage", cli)).status, 403, "Cliente no accede a manage");
    assert.equal((await req("state", cli)).status, 403, "Cliente no accede a state");
    assert.equal((await req("attendance", cli)).status, 403, "Cliente no accede a attendance");
    assert.equal((await req("attendance/clock", cli, "POST", { employeeId: "e1", action: "IN" })).status, 403);
    assert.equal((await req("config", cli, "PUT", { config: cfg, revision: 0 })).status, 403);
    assert.equal((await req("manage/users", cli, "POST", {})).status, 403);
    assert.equal((await req("clients", cli)).status, 403, "Cliente no accede a clients");
    // Pero sí a me y logout
    assert.equal((await req("me", cli)).status, 200);
    const meCli = await (await req("me", cli)).json();
    assert.equal(meCli.role, "CLIENT");
    assert.equal(meCli.clientId, "c0");

    const portal = await req("client-calendar", cli);
    assert.equal(portal.status,200);
    assert.ok((await portal.json()).bookings.every(b=>b.clientId==='c0'));
    const ownBooking = await req("client-calendar",cli,"POST",{clientId:"c1",employeeId:"e1",serviceId:"s1",roomId:"r1",date:"2031-10-22",start:"15:00",status:"COMPLETED",chargeAmount:0});
    assert.equal(ownBooking.status,201);
    const own = await ownBooking.json();assert.equal(own.clientId,"c0");assert.equal(own.status,"CONFIRMED");

    // ==========================================
    // REQUISITO: Un entrenador no accede a datos de otro entrenador
    // ==========================================
    // State para Trainer 1 (e2): solo sus citas y solo su ficha de empleado
    const t1State = await (await req("state", t1)).json();
    assert.equal(t1State.employees.length, 1);
    assert.equal(t1State.employees[0].id, "e2");
    assert.ok(t1State.bookings.every((b) => b.employeeId === "e2"), "Trainer 1 solo ve sus propias reservas");
    assert.ok(!t1State.bookings.some((b) => b.employeeId === "e3"), "Trainer 1 no ve reservas de Trainer 2");

    // Manage para Trainer 1: solo sus turnos/ficha
    const t1Manage = await (await req("manage", t1)).json();
    assert.equal(t1Manage.employees.length, 1);
    assert.equal(t1Manage.employees[0].id, "e2");
    assert.deepEqual(t1Manage.users, []);

    // Slots de otro entrenador: Trainer 1 no puede espiar los huecos de Trainer 2
    const slotsOther = await (await req("slots?employeeId=e3&date=2030-10-22", t1)).json();
    assert.deepEqual(slotsOther, [], "Trainer 1 recibe lista vacía al pedir slots de otro");

    // Clientes para Trainer 1: ve c0 (tiene cita con e2) y c1 (asignado a e2), pero NO c2 (asignado a e3)
    const t1Clients = await (await req("clients", t1)).json();
    const t1ClientIds = t1Clients.clients.map((c) => c.id);
    assert.ok(t1ClientIds.includes("c0"), "Ve cliente con el que tiene cita");
    assert.ok(t1ClientIds.includes("c1"), "Ve cliente asignado en ficha");
    assert.ok(!t1ClientIds.includes("c2"), "NO ve cliente de otro entrenador");

    // Trainer no puede modificar citas ni configuración
    assert.equal((await req("bookings", t1, "POST", { booking: {} })).status, 403);
    assert.equal((await req("config", t1, "PUT", { config: cfg, revision: 0 })).status, 403);
    assert.equal((await req("manage/services", t1, "POST", {})).status, 403);
    assert.equal((await req("manage/users", t1, "POST", {})).status, 403);

    // ==========================================
    // REQUISITO: Fichajes del entrenador (solo por sí mismo)
    // ==========================================
    // Intenta fichar por e3 -> 403
    assert.equal((await req("attendance/clock", t1, "POST", { employeeId: "e3", action: "IN" })).status, 403);
    // Intenta fichar por e1 -> 403
    assert.equal((await req("attendance/clock", t1, "POST", { employeeId: "e1", action: "IN" })).status, 403);
    // Ficha por sí mismo -> 201
    assert.equal((await req("attendance/clock", t1, "POST", { employeeId: "e2", action: "IN" })).status, 201);
    // En attendance solo ve su propio registro
    const t1Att = await (await req("attendance", t1)).json();
    assert.equal(t1Att.employees.length, 1);
    assert.equal(t1Att.employees[0].id, "e2");
    assert.ok(t1Att.records.every((r) => r.employeeId === "e2"));

    // ==========================================
    // REQUISITO: Recepción ve calendarios, clientes, turnos y estado de fichaje de todos
    // ==========================================
    const recState = await (await req("state", rec)).json();
    assert.equal(recState.employees.length, 4, "Recepción ve a todos los empleados");
    assert.equal(recState.bookings.length, 3, "Recepción ve las citas de todos");

    const recManage = await (await req("manage", rec)).json();
    assert.equal(recManage.employees.length, 4, "Recepción ve los turnos de todos");

    const recClients = await (await req("clients", rec)).json();
    assert.equal(recClients.clients.length, 3, "Recepción ve todos los clientes");

    // Recepción puede crear y editar reservas para cualquier entrenador
    const newBookingRes = await req("bookings", rec, "POST", {
      booking: {
        clientId: "c1",
        employeeId: "e3",
        serviceId: "s1",
        roomId: "r1",
        date: "2030-10-23",
        start: "10:00",
        end: "11:00",
        status: "CONFIRMED",
        notes: "Creada por recepción",
      },
    });
    assert.equal(newBookingRes.status, 201, "Recepción crea reserva para e3");

    // Recepción ve el estado de fichaje de todos
    const recAtt = await (await req("attendance", rec)).json();
    assert.equal(recAtt.employees.length, 4, "Recepción consulta estado de fichaje de toda la plantilla");
    // e2 está fichado, el resto fuera
    const e2Record = recAtt.records.find((r) => r.employeeId === "e2");
    assert.ok(e2Record && !e2Record.clockOut, "Recepción ve que e2 está dentro");

    // ==========================================
    // REQUISITO: Recepción ficha por sí misma, pero 403 si intenta por otro
    // ==========================================
    // Intenta fichar por e2 -> 403
    assert.equal((await req("attendance/clock", rec, "POST", { employeeId: "e2", action: "OUT" })).status, 403);
    // Intenta fichar por e1 -> 403
    assert.equal((await req("attendance/clock", rec, "POST", { employeeId: "e1", action: "IN" })).status, 403);
    // Ficha por sí misma (e4) -> 201
    assert.equal((await req("attendance/clock", rec, "POST", { employeeId: "e4", action: "IN" })).status, 201);
    assert.equal((await req("attendance/clock", rec, "POST", { employeeId: "e4", action: "OUT" })).status, 201);

    // ==========================================
    // REQUISITO: Administrador accede a todo y ve nombres en lista de usuarios
    // ==========================================
    assert.equal((await req("state", adminToken)).status, 200);
    const adminManageRes = await req("manage", adminToken);
    assert.equal(adminManageRes.status, 200);
    const adminManage = await adminManageRes.json();
    assert.ok(adminManage.users.length >= 4);
    const adminUser = adminManage.users.find(u => u.role === "ADMIN");
    assert.equal(adminUser.name, "Admin Uno");
    const trainerUser = adminManage.users.find(u => u.role === "TRAINER" && u.employeeId === "e2");
    assert.equal(trainerUser.name, "Entrenador Dos");
    const clientUser = adminManage.users.find(u => u.role === "CLIENT");
    assert.equal(clientUser.name, "Cliente Cero");

    assert.equal((await req("clients", adminToken)).status, 200);
    assert.equal((await req("attendance", adminToken)).status, 200);
    // Administrador puede fichar por sí mismo o por otros (Decisión 7.B)
    assert.equal((await req("attendance/clock", adminToken, "POST", { employeeId: "e1", action: "IN" })).status, 201);
    assert.equal((await req("attendance/clock", adminToken, "POST", { employeeId: "e2", action: "OUT" })).status, 201);

    // ==========================================
    // REQUISITO: Interfaz Usuarios (estética idéntica a clientes y nombres de empleado)
    // ==========================================
    const { JSDOM } = require("jsdom");
    const { readFile } = require("node:fs/promises");
    const usersHtml = await readFile("public/users.html", "utf-8");
    const usersJs = await readFile("public/users.js", "utf-8");

    const dom = new JSDOM(usersHtml, {
      url: "http://127.0.0.1:3000/usuarios",
      runScripts: "dangerously",
      beforeParse(w) {
        w.sessionStorage.setItem("calendar-user-token", adminToken);
        w.fetch = (p, o) => fetch(new URL(p, base), o);
        w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
        w.HTMLDialogElement.prototype.close = function () { this.open = false; };
      },
    });

    dom.window.eval(usersJs);

    const until = async (fn) => {
      const end = Date.now() + 5000;
      while (Date.now() < end) {
        if (fn()) return;
        await new Promise((r) => setTimeout(r, 40));
      }
      throw Error("UI timeout en public/users.html: " + dom.window.document.getElementById("user-rows")?.textContent);
    };

    const doc = dom.window.document;
    await until(() => doc.querySelectorAll(".client-card-modern").length >= 4);

    const cardNames = [...doc.querySelectorAll(".client-card-name")].map((el) => el.textContent.trim());
    assert.ok(cardNames.includes("Admin Uno"), "Muestra el nombre del empleado Admin Uno");
    assert.ok(cardNames.includes("Entrenador Dos"), "Muestra el nombre del empleado Entrenador Dos");
    assert.ok(cardNames.includes("Cliente Cero"), "Muestra el nombre del cliente Cliente Cero");

    // Filtro rápido por chips
    const trainerChip = doc.querySelector('.filter-chip[data-filter="TRAINER"]');
    trainerChip.click();
    assert.equal(doc.querySelectorAll(".client-card-modern").length, 2, "Filtro entrenadores muestra los 2 entrenadores");

    // Los usuarios existentes se pueden editar, pero ya no hay acción de alta.
    assert.equal(doc.getElementById("open-create"), null, "No muestra una opción para añadir usuarios");
    doc.querySelector(".client-card-modern").click();
    assert.equal(doc.getElementById("user-dialog").open, true);
    assert.ok(doc.getElementById("user-name") !== null, "El campo de nombre de la persona existe");
    assert.ok(doc.getElementById("employee-suggestions").innerHTML.includes("Admin Uno"), "Las sugerencias contienen los nombres de los empleados");
    assert.notEqual(doc.getElementById("dialog-title").textContent, "Nuevo usuario", "El diálogo solo edita usuarios existentes");

    dom.window.close();

    // Crear usuario directamente con 'name' (crea el empleado automáticamente)
    const newStaffRes = await req("manage/users", adminToken, "POST", {
      record: { name: "Nuevo Fichaje", username: "nuevo", role: "RECEPTION", enabled: true },
    });
    assert.equal(newStaffRes.status, 201);
    const newStaffManage = await (await req("manage", adminToken)).json();
    const newStaff = newStaffManage.users.find((u) => u.username === "nuevo");
    assert.equal(newStaff.name, "Nuevo Fichaje");
    assert.equal(newStaff.role, "RECEPTION");
    const newEmp = newStaffManage.employees.find((e) => e.name === "Nuevo Fichaje");
    assert.ok(newEmp, "El empleado se creó en el centro con su nombre");

  } finally {
    await new Promise((r) => app.close(r));
  }
});
