const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, readdir, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { DateTime } = require('luxon');
const { Store } = require('../dist/calendar/store');
const { Access } = require('../dist/calendar/access');
const { server } = require('../dist/calendar/http');
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(compiled.outputText, filename);
};
const { ApiClient } = require('../mobile/shared/api.ts');

let pg, pool, db, http, gym, own, other, employee, service, api, base, token;
const hours = Array.from({ length: 7 }, () => ({ open: '08:00', close: '22:00', closed: false }));
before(async () => {
  const { default: Embedded } = await import('embedded-postgres');
  const socket = require('node:net').createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const password = randomUUID();
  pg = new Embedded({ databaseDir: join(await mkdtemp(join(tmpdir(), 'client-mobile-')), 'db'), user: 'postgres', password, port, persistent: false, postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} });
  await pg.initialise(); await pg.start();
  pool = new Pool({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres' });
  for (const dir of (await readdir('prisma/migrations')).sort()) {
    if (/^\d+_/.test(dir)) await pool.query(await readFile(join('prisma/migrations', dir, 'migration.sql'), 'utf8'));
  }
  db = new PrismaClient({ datasources: { db: { url: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres` } } });
  gym = await db.gym.create({ data: { name: `Móvil ${randomUUID()}`, brand: 'TRAINERS_POINT' } });
  [own, other] = await Promise.all(['Propia', 'Ajena'].map(lastName => db.client.create({ data: { firstName: 'Ficha', lastName, email: `${randomUUID()}@example.invalid`, phone: '600000000', gymId: gym.id, status: 'ACTIVO' } })));
  service = await db.service.create({ data: { name: 'Sesión de entrenamiento', price: 30, durationMin: 60, validityWeeks: 4 } });
  employee = { id: randomUUID(), name: 'Entrenadora', color: '#123456', active: true, schedule: hours };
  const store = new Store(pool, db);
  await store.migrate();
  await store.seed(gym.id, { timezone: 'Europe/Madrid', schedule: hours, employees: [employee], rooms: [{ id: 'r1', name: 'Sala principal' }], services: [{ id: service.id, name: service.name, duration: 60, capacity: 1 }], clients: [] });
  const access = new Access(pool, db);
  await access.save(gym.id, { employeeId: employee.id, username: 'admin.movil', role: 'ADMIN', enabled: true, password: 'AdminMobilePassword123!', mustChangePassword: false });
  await access.save(gym.id, { clientId: own.id, username: 'cliente.movil', role: 'CLIENT', enabled: true, password: 'ClientMobilePassword123!', mustChangePassword: false });
  const purchasedAt = new Date();
  await db.clientServicePackage.create({ data: { clientId: own.id, serviceId: service.id, sessionsBought: 5, totalAmount: 150, paymentMethod: 'EFECTIVO', paymentStatus: 'PAGADO', purchasedAt } });
  await db.clientMeasurement.create({ data: { clientId: own.id, measuredAt: new Date('2026-11-10T00:00:00Z'), weight: 78.4, bodyFat: 21.3 } });
  await db.trainingPlan.create({ data: { clientId: own.id, name: 'Fuerza', status: 'ACTIVO', startsAt: new Date('2026-11-01T00:00:00Z'), details: { days: [{ name: 'Pierna', weekday: 1, exercises: [{ name: 'Sentadilla', sets: 3, repetitions: '8', load: '80 kg' }] }] } } });
  http = server(store, gym.id, randomUUID());
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${http.address().port}`;
  token = null;
  api = new ApiClient({ baseUrl: base, gymId: gym.id, getToken: async () => token, setToken: async next => { token = next; } });
});
after(async () => {
  if (http) await new Promise(resolve => http.close(resolve));
  await db?.$disconnect(); await pool?.end(); await pg?.stop();
});

test('Cuenta cliente: acceso, datos propios, reserva y bloqueo de datos ajenos', async () => {
  await api.login({ username: 'cliente.movil', password: 'ClientMobilePassword123!', portal: 'CLIENT' });
  const me = await api.getMe();
  assert.equal(me.role, 'CLIENT'); assert.equal(me.clientId, own.id);

  const home = await api.getClientHome();
  assert.equal(home.profile.id, own.id);
  assert.equal(home.profile.lastName, 'Propia');
  assert.equal(home.packages.length, 1);
  assert.equal(home.packages[0].remainingSessions, 5);
  assert.equal(home.packages[0].isActive, true);
  assert.equal(home.measurements[0].weight, 78.4);
  assert.equal(home.measurements[0].bodyFat, 21.3);
  assert.equal(home.measurements[0].measuredAt, '2026-11-10');
  assert.equal(home.trainingPlans[0].name, 'Fuerza');
  assert.equal(home.trainingPlans[0].details.days[0].name, 'Pierna');

  const day = DateTime.now().setZone('Europe/Madrid').plus({ days: 2 }).toISODate();
  const created = await api.createBooking({ clientId: other.id, employeeId: employee.id, serviceId: service.id, roomId: 'r1', date: day, start: '10:00', packageId: home.packages[0].id });
  assert.equal(created.clientId, own.id);
  const agenda = await api.getClientCalendar();
  assert.ok(agenda.bookings.some(booking => booking.id === created.id));
  assert.ok(agenda.bookings.every(booking => booking.clientId === own.id));
  const updated = await api.getClientHome();
  assert.equal(updated.packages[0].remainingSessions, 4);

  const headers = { Authorization: `Bearer ${token}`, 'X-Calendar-Gym': gym.id };
  const query = await fetch(`${base}/api/mobile/client/home?clientId=${other.id}`, { headers });
  assert.equal(query.status, 200);
  assert.equal((await query.json()).profile.id, own.id);
  assert.equal((await fetch(`${base}/api/mobile/clients/${other.id}`, { headers })).status, 403);
  assert.equal((await fetch(`${base}/api/mobile/calendar`, { headers })).status, 403);
  assert.equal((await fetch(`${base}/api/clients/${other.id}/progress`, { headers })).status, 403);
});

test('Cuenta cliente: el servidor principal entrega la ficha propia y mantiene los permisos', async () => {
  const socket = require('node:net').createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const { spawn } = require('node:child_process');
  const options = pool.options;
  const databaseUrl = `postgresql://postgres:${options.password}@127.0.0.1:${options.port}/postgres`;
  const child = spawn(process.execPath, ['dist/index.js'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: databaseUrl, CALENDAR_DATABASE_URL: databaseUrl, CALENDAR_ADMIN_TOKEN: randomUUID(), TRAINERS_POINT_DEV_ADMIN: 'false' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(errors);
      try { ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, errors);
    let token = null;
    const connected = new ApiClient({ baseUrl: `http://127.0.0.1:${port}`, gymId: gym.id, getToken: async () => token, setToken: async next => { token = next; } });
    await connected.login({ username: 'cliente.movil', password: 'ClientMobilePassword123!', portal: 'CLIENT' });
    const home = await connected.getClientHome();
    assert.equal(home.profile.id, own.id);
    assert.equal(home.packages[0].remainingSessions, 4);
    assert.equal((await connected.getClientCalendar()).bookings.length, 1);
    const headers = { Authorization: `Bearer ${token}`, 'X-Calendar-Gym': gym.id };
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/mobile/clients/${other.id}`, { headers })).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/clients/${other.id}/progress`, { headers })).status, 403);
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
  }
});
