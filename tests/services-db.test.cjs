require('dotenv').config();
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

let prisma, pg, pool;
const createdServiceIds = [];
const createdClientIds = [];
const createdPackageIds = [];

before(async () => {
  // Keep the team's database tests isolated from development and company data.
  const { default: Embedded } = await import('embedded-postgres');
  const { randomUUID } = require('node:crypto');
  const { mkdtemp, readdir, readFile } = require('node:fs/promises');
  const { tmpdir } = require('node:os');
  const { Pool } = require('pg');
  const socket = require('node:net').createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const password = randomUUID();
  pg = new Embedded({ databaseDir: path.join(await mkdtemp(path.join(tmpdir(), 'services-test-')), 'db'),
    user: 'postgres', password, port, persistent: false, postgresFlags: ['-h', '127.0.0.1'],
    onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  pool = new Pool({ connectionString: url });
  for (const dir of (await readdir('prisma/migrations')).sort()) {
    if (/^\d+_/.test(dir)) await pool.query(await readFile(path.join('prisma/migrations', dir, 'migration.sql'), 'utf8'));
  }
  prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
});

after(async () => {
  if (prisma) {
    if (createdPackageIds.length) {
      await prisma.clientServicePackage.deleteMany({
        where: { id: { in: createdPackageIds } },
      });
    }
    if (createdClientIds.length) {
      await prisma.client.deleteMany({
        where: { id: { in: createdClientIds } },
      });
    }
    if (createdServiceIds.length) {
      await prisma.service.deleteMany({
        where: { id: { in: createdServiceIds } },
      });
    }
    await prisma.$disconnect();
  }
  await pool?.end();
  await pg?.stop();
});

test('Base de datos: Almacenar servicio dinámico con todos los atributos requeridos', async () => {
  const service = await prisma.service.create({
    data: {
      name: 'Test Bono 10 Dúo Fuerza',
      description: 'Entrenamiento en pareja de 10 sesiones enfocado en fuerza.',
      modality: 'DUAL',
      type: 'PACK',
      trainingCount: 10,
      price: 450.00,
      durationMin: 60,
      validityWeeks: 4,
      recommendedWeeklyFrequency: 2,
      conditions: 'Cancelaciones con un mínimo de 24 horas de antelación.',
      isActive: true,
    },
  });

  createdServiceIds.push(service.id);

  assert.ok(service.id, 'Debe generar un UUID válido');
  assert.equal(service.name, 'Test Bono 10 Dúo Fuerza');
  assert.equal(service.description, 'Entrenamiento en pareja de 10 sesiones enfocado en fuerza.');
  assert.equal(service.modality, 'DUAL');
  assert.equal(service.type, 'PACK');
  assert.equal(service.trainingCount, 10);
  assert.equal(Number(service.price), 450.00);
  assert.equal(service.durationMin, 60);
  assert.equal(service.validityWeeks, 4);
  assert.equal(service.recommendedWeeklyFrequency, 2);
  assert.equal(service.conditions, 'Cancelaciones con un mínimo de 24 horas de antelación.');
  assert.equal(service.isActive, true);
  assert.ok(service.createdAt instanceof Date);
  assert.ok(service.updatedAt instanceof Date);
});

test('Base de datos: Valores por defecto en servicios individuales básicos', async () => {
  const service = await prisma.service.create({
    data: {
      name: 'Test Sesión Individual Básica',
      price: 40.00,
      durationMin: 45,
    },
  });

  createdServiceIds.push(service.id);

  assert.equal(service.modality, 'INDIVIDUAL', 'Modalidad por defecto debe ser INDIVIDUAL');
  assert.equal(service.type, 'SESION_INDIVIDUAL', 'Tipo por defecto debe ser SESION_INDIVIDUAL');
  assert.equal(service.trainingCount, 1, 'Número de entrenamientos por defecto debe ser 1');
  assert.equal(service.durationMin, 45);
  assert.equal(Number(service.price), 40.00);
  assert.equal(service.validityWeeks, null);
  assert.equal(service.recommendedWeeklyFrequency, null);
  assert.equal(service.conditions, null);
  assert.equal(service.isActive, true, 'Estado por defecto debe ser activo');
});

test('Base de datos: Modificar servicio existente', async () => {
  const service = await prisma.service.create({
    data: {
      name: 'Test Servicio a Modificar',
      price: 50.00,
      durationMin: 50,
      modality: 'INDIVIDUAL',
      type: 'SESION_INDIVIDUAL',
    },
  });

  createdServiceIds.push(service.id);

  const updated = await prisma.service.update({
    where: { id: service.id },
    data: {
      name: 'Test Servicio Modificado',
      price: 55.50,
      durationMin: 60,
      modality: 'DUAL',
      type: 'PACK',
      trainingCount: 5,
      validityWeeks: 4,
      recommendedWeeklyFrequency: 1,
      conditions: 'Válido durante 4 semanas.',
    },
  });

  assert.equal(updated.name, 'Test Servicio Modificado');
  assert.equal(Number(updated.price), 55.50);
  assert.equal(updated.durationMin, 60);
  assert.equal(updated.modality, 'DUAL');
  assert.equal(updated.type, 'PACK');
  assert.equal(updated.trainingCount, 5);
  assert.equal(updated.validityWeeks, 4);
  assert.equal(updated.recommendedWeeklyFrequency, 1);
  assert.equal(updated.conditions, 'Válido durante 4 semanas.');
});

test('Base de datos: Desactivar servicio sin eliminarlo físicamente', async () => {
  const service = await prisma.service.create({
    data: {
      name: 'Test Servicio Para Desactivar',
      price: 35.00,
      durationMin: 30,
      isActive: true,
    },
  });

  createdServiceIds.push(service.id);

  // Desactivación lógica
  const deactivated = await prisma.service.update({
    where: { id: service.id },
    data: { isActive: false },
  });

  assert.equal(deactivated.isActive, false, 'El servicio debe quedar inactivo');

  // Comprobar filtro de activos
  const activeServices = await prisma.service.findMany({
    where: { isActive: true },
  });
  assert.ok(!activeServices.some(s => s.id === service.id), 'No debe aparecer en la lista de activos');

  // Comprobar que sigue existiendo en el catálogo general
  const allServices = await prisma.service.findMany();
  assert.ok(allServices.some(s => s.id === service.id), 'Debe seguir existiendo en la base de datos');
});

test('Interfaz y archivos: Comprobar existencia y estructura de la página de servicios', () => {
  const htmlPath = path.join(__dirname, '..', 'web', 'services', 'services.html');
  const cssPath = path.join(__dirname, '..', 'web', 'services', 'services.css');
  const jsPath = path.join(__dirname, '..', 'web', 'services', 'services.js');

  assert.ok(fs.existsSync(htmlPath), 'Debe existir web/services/services.html');
  assert.ok(fs.existsSync(cssPath), 'Debe existir web/services/services.css');
  assert.ok(fs.existsSync(jsPath), 'Debe existir web/services/services.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('id="services-grid"'), 'Debe incluir el grid de servicios');
  assert.ok(html.includes('id="open-service-create"'), 'Debe incluir el botón de añadir servicio');
  assert.ok(html.includes('id="service-dialog"'), 'Debe incluir el diálogo modal');
  assert.ok(html.includes('id="service-form"'), 'Debe incluir el formulario');
  assert.ok(html.includes('id="service-search"'), 'Debe incluir el buscador');
  assert.ok(html.includes('id="count-total"'), 'Debe incluir métricas de resumen');
  assert.ok(html.includes('data-app-menu'), 'Debe incluir el menú de navegación corporativo');
  assert.ok(html.includes('page-heading-logo'), 'Debe incluir el logo de cabecera con el estilo de clientes');
  assert.ok(html.includes('stats-grid'), 'Debe emplear el componente stats-grid de clientes');
  assert.ok(html.includes('client-panel'), 'Debe emplear el contenedor client-panel de clientes');
  assert.ok(html.includes('filter-chip'), 'Debe emplear chips de filtro compatibles con clientes');

  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('#ff7f0a') || css.includes('#ff8a1f') || css.includes('--tp-accent'), 'Debe emplear el naranja corporativo de Trainers Point');
  assert.ok(css.includes('--tp-surface') || css.includes('#fffdf9') || css.includes('#f7f4ee'), 'Debe emplear la identidad visual compartida con clientes');

  const js = fs.readFileSync(jsPath, 'utf8');
  assert.ok(js.includes('/api/') && js.includes('services'), 'Debe conectar realmente con la API de servicios');
  assert.ok(js.includes('POST') && js.includes('PUT') && js.includes('PATCH'), 'Debe manejar altas, modificaciones y activaciones');
});


test('Integración: servicios compartidos actualizan el calendario y conservan su color y disponibilidad', async () => {
  const { Store } = require('../dist/calendar/store');
  const gym = await prisma.gym.create({ data: { name: 'Centro integración servicios' } });
  const service = await prisma.service.create({ data: { name: 'Servicio compartido', price: 55, durationMin: 45, modality: 'DUAL', type: 'PACK', trainingCount: 8 } });
  createdServiceIds.push(service.id);
  const schedule = Array.from({ length: 7 }, () => ({ open: '09:00', close: '18:00', closed: false }));
  const store = new Store(pool, prisma);
  await store.seed(gym.id, { timezone: 'Europe/Madrid', schedule,
    employees: [{ id: 'e1', name: 'Entrenador', color: '#123456', schedule }],
    rooms: [{ id: 'r1', name: 'Sala' }], clients: [],
    services: [{ id: service.id, name: 'Nombre anterior', duration: 60, capacity: 1, price: 30,
      color: '#ab1234', schedule, employeeIds: ['e1'] }] });
  const synced = (await store.state(gym.id)).services.find(item => item.id === service.id);
  assert.equal(synced.name, 'Servicio compartido');
  assert.equal(synced.duration, 45);
  assert.equal(synced.price, 55);
  assert.equal(synced.capacity, 2);
  assert.equal(synced.trainingCount, 8);
  assert.equal(synced.color, '#ab1234');
  assert.deepEqual(synced.employeeIds, ['e1']);
  assert.deepEqual(synced.schedule, schedule);
  await prisma.service.update({ where: { id: service.id }, data: { isActive: false } });
  assert.equal((await store.state(gym.id)).services.find(item => item.id === service.id).active, false);
});

test('Formulario: Configuración de los 11 campos, cálculo automático y duración de 4 semanas solo', () => {
  const htmlPath = path.join(__dirname, '..', 'web', 'services', 'services.html');
  const jsPath = path.join(__dirname, '..', 'web', 'services', 'services.js');
  const cssPath = path.join(__dirname, '..', 'web', 'services', 'services.css');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Comprobar los 11 campos requeridos en el HTML del formulario
  const expectedFields = [
    'field-name',          // 1. Nombre del servicio
    'field-description',   // 2. Descripción
    'field-modality',      // 3. Modalidad
    'field-type',          // 4. Tipo de servicio
    'field-trainingCount', // 5. Número de sesiones
    'field-price',         // 6. Precio total
    'field-durationMin',   // 7. Duración por sesión
    'field-validityWeeks', // 8. Validez (4 semanas solo)
    'field-frequency',     // 9. Frecuencia semanal recomendada
    'field-conditions',    // 10. Condiciones
    'field-isActive',      // 11. Estado
  ];

  for (const fieldId of expectedFields) {
    assert.ok(html.includes(`id="${fieldId}"`), `El formulario HTML debe contener el campo con id="${fieldId}"`);
  }

  // Comprobar regla de duración de 4 semanas solo
  assert.ok(html.includes('min="4"') && html.includes('max="4"') && html.includes('value="4"'), 'El campo de validez debe estar fijado a 4 semanas');
  assert.ok(html.includes('4 semanas solo'), 'Debe indicar visualmente que la duración es de 4 semanas solo');
  assert.ok(js.includes('validityWeeks !== 4') || js.includes('validityWeeks: 4'), 'El script JS debe asegurar la duración de 4 semanas solo');

  // Comprobar contenedor del cálculo automático en HTML
  assert.ok(html.includes('id="calculated-rate-panel"'), 'Debe existir el panel de cálculo automático');
  assert.ok(html.includes('id="calc-session-price"'), 'Debe existir el elemento para mostrar el precio por sesión calculado');
  assert.ok(html.includes('id="calc-formula"'), 'Debe existir el elemento para el desglose de la fórmula de cálculo');

  // Comprobar estilos de cálculo y validación en CSS
  assert.ok(css.includes('.calculated-rate-panel'), 'Debe incluir estilos para el panel de cálculo automático');
  assert.ok(css.includes('.is-invalid'), 'Debe incluir estilos para el estado visual de error en los campos');

  // Comprobar lógica de cálculo automático y reactividad en JS
  assert.ok(js.includes('updateCalculatedPrice'), 'Debe existir la función de cálculo de precio por sesión');
  assert.ok(js.includes('price / count'), 'Debe calcular el coste dividiendo precio entre sesiones');
  assert.ok(js.includes('field-price') && js.includes('addEventListener'), 'Debe recalcular en tiempo real al cambiar el precio');
  assert.ok(js.includes('field-trainingCount'), 'Debe recalcular en tiempo real al cambiar el número de sesiones');

  // Comprobar validaciones en frontend
  assert.ok(js.includes('El precio total no puede ser negativo'), 'Debe validar precios negativos');
  assert.ok(js.includes('El número de sesiones debe ser un entero'), 'Debe validar sesiones inválidas');
  assert.ok(js.includes('El nombre del servicio es obligatorio'), 'Debe validar servicios sin nombre');
  assert.ok(js.includes('setFieldError'), 'Debe marcar campos erróneos y alertar al usuario');

  // Comprobar que en openEditDialog se cargan todos los campos y en submit se envían todos
  assert.ok(js.includes('openEditDialog'), 'Debe existir la función de edición de servicios');
  for (const fieldId of expectedFields) {
    assert.ok(js.includes(fieldId), `El script JS debe gestionar el campo ${fieldId}`);
  }
});

test('Base de datos: Modificación completa posterior de todos los 11 campos de un servicio', async () => {
  // 1. Crear servicio inicial con duración de 4 semanas
  const service = await prisma.service.create({
    data: {
      name: 'Servicio Inicial Ficha Completa',
      description: 'Descripción inicial de prueba',
      modality: 'INDIVIDUAL',
      type: 'SESION_INDIVIDUAL',
      trainingCount: 1,
      price: 60.00,
      durationMin: 60,
      validityWeeks: 4,
      recommendedWeeklyFrequency: 1,
      conditions: 'Condición previa.',
      isActive: true,
    },
  });
  createdServiceIds.push(service.id);

  // 2. Modificar posteriormente todos los campos manteniendo la regla de 4 semanas
  const updated = await prisma.service.update({
    where: { id: service.id },
    data: {
      name: 'Bono 20 Sesiones Dúo Avanzado',
      description: 'Plan de 20 sesiones para parejas con seguimiento nutricional.',
      modality: 'DUAL',
      type: 'PACK',
      trainingCount: 20,
      price: 750.50,
      durationMin: 75,
      validityWeeks: 4,
      recommendedWeeklyFrequency: 3,
      conditions: 'Cancelación con 24h de antelación y reserva anticipada.',
      isActive: false,
    },
  });

  // 3. Verificar que todos y cada uno de los 11 campos se actualizaron en la base de datos
  assert.equal(updated.name, 'Bono 20 Sesiones Dúo Avanzado');
  assert.equal(updated.description, 'Plan de 20 sesiones para parejas con seguimiento nutricional.');
  assert.equal(updated.modality, 'DUAL');
  assert.equal(updated.type, 'PACK');
  assert.equal(updated.trainingCount, 20);
  assert.equal(Number(updated.price), 750.50);
  assert.equal(updated.durationMin, 75);
  assert.equal(updated.validityWeeks, 4);
  assert.equal(updated.recommendedWeeklyFrequency, 3);
  assert.equal(updated.conditions, 'Cancelación con 24h de antelación y reserva anticipada.');
  assert.equal(updated.isActive, false);

  // 4. Comprobar cálculo de precio por sesión resultante
  const pricePerSession = Number(updated.price) / updated.trainingCount;
  assert.equal(Math.round(pricePerSession * 100) / 100, 37.53);

  // 5. Verificar vaciado de campos opcionales (pasar a null)
  const cleared = await prisma.service.update({
    where: { id: service.id },
    data: {
      description: null,
      conditions: null,
      validityWeeks: null,
      recommendedWeeklyFrequency: null,
    },
  });
  assert.equal(cleared.description, null);
  assert.equal(cleared.conditions, null);
  assert.equal(cleared.validityWeeks, null);
  assert.equal(cleared.recommendedWeeklyFrequency, null);
});

test('Backend: Verificación de reglas de validación en parseServiceInput (validation/records.ts)', () => {
  const indexPath = path.join(__dirname, '..', 'src', 'validation', 'records.ts');
  const src = fs.readFileSync(indexPath, 'utf8');

  // Validación de nombre
  assert.ok(src.includes('El nombre del servicio es obligatorio'), 'Debe validar que el nombre no esté vacío');
  assert.ok(src.includes('120'), 'Debe validar longitud máxima del nombre a 120');

  // Validación de precios negativos
  assert.ok(src.includes('price < 0'), 'Debe validar precios negativos');
  assert.ok(src.includes('El precio total es obligatorio, no puede ser negativo'), 'Debe emitir mensaje claro de precio no negativo');

  // Validación de sesiones inválidas
  assert.ok(src.includes('rawTrainingCount < 1') || src.includes('trainingCount < 1'), 'Debe validar que las sesiones sean >= 1');
  assert.ok(src.includes('El número de sesiones debe ser un entero entre 1 y 500'), 'Debe validar rango y enteros en sesiones');

  // Validación de duración de 4 semanas solo
  assert.ok(src.includes('parsedWeeks !== 4'), 'Debe rechazar cualquier duración que no sea de 4 semanas');
  assert.ok(src.includes('La duración/validez del servicio debe ser de 4 semanas solo'), 'Debe emitir mensaje indicando la regla de 4 semanas');

  // Validación de duración de sesión y completitud
  assert.ok(src.includes('durationMin < 5'), 'Debe validar duración mínima de 5 minutos');
  assert.ok(src.includes('rawModality !== "INDIVIDUAL" && rawModality !== "DUAL"'), 'Debe validar modalidad individual o dual');
  assert.ok(src.includes('rawType !== "PACK" && rawType !== "SESION_INDIVIDUAL"'), 'Debe validar tipo pack o sesión individual');
});


test('Clientes y Bonos: Asignar bono a cliente vinculado a servicio dinámico activo en base de datos', async () => {
  // Obtener un gimnasio existente o crear uno de prueba
  let gym = await prisma.gym.findFirst();
  if (!gym) {
    gym = await prisma.gym.create({
      data: { name: 'Gym Test Bonos', city: 'Madrid', province: 'Madrid' },
    });
  }

  // Crear cliente de prueba
  const client = await prisma.client.create({
    data: {
      firstName: 'Marcos',
      lastName: 'Gómez Bono',
      phone: `+34 655${Math.floor(100000 + Math.random() * 900000)}`,
      email: `marcos.bono.${Date.now()}@test.com`,
      gymId: gym.id,
    },
  });
  createdClientIds.push(client.id);

  // Crear servicio dinámico tipo Pack 8 entrenamientos de 4 semanas
  const service = await prisma.service.create({
    data: {
      name: 'Bono 8 Sesiones Fuerza Test',
      modality: 'INDIVIDUAL',
      type: 'PACK',
      trainingCount: 8,
      price: 320.00,
      durationMin: 60,
      validityWeeks: 4,
      recommendedWeeklyFrequency: 2,
      isActive: true,
    },
  });
  createdServiceIds.push(service.id);

  // Asignar bono al cliente (ClientServicePackage)
  const bono = await prisma.clientServicePackage.create({
    data: {
      clientId: client.id,
      serviceId: service.id,
      sessionsBought: service.trainingCount,
      totalAmount: service.price,
      paymentMethod: 'TARJETA',
      paymentStatus: 'PAGADO',
      notes: 'Bono adquirido en recepción',
    },
    include: {
      client: true,
      service: true,
    },
  });
  createdPackageIds.push(bono.id);

  assert.ok(bono.id, 'Debe generar identificador de bono');
  assert.equal(bono.clientId, client.id);
  assert.equal(bono.serviceId, service.id);
  assert.equal(bono.sessionsBought, 8);
  assert.equal(Number(bono.totalAmount), 320.00);
  assert.equal(bono.paymentMethod, 'TARJETA');
  assert.equal(bono.paymentStatus, 'PAGADO');
  assert.equal(bono.service.validityWeeks, 4, 'La validez del servicio del bono debe ser de 4 semanas');

  // Comprobar asignación de bono con pago pendiente (genera deuda)
  const bonoPendiente = await prisma.clientServicePackage.create({
    data: {
      clientId: client.id,
      serviceId: service.id,
      sessionsBought: service.trainingCount,
      totalAmount: service.price,
      paymentMethod: 'TRANSFERENCIA',
      paymentStatus: 'PENDIENTE',
      notes: 'Pendiente de justificante',
    },
  });
  createdPackageIds.push(bonoPendiente.id);

  assert.equal(bonoPendiente.paymentStatus, 'PENDIENTE');
  assert.equal(Number(bonoPendiente.totalAmount), 320.00);
});

test('Clientes y Bonos: Interfaz de ficha del cliente contiene modal y lógica de asignación de bonos', () => {
  const profileHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'clients', 'client-profile.html'), 'utf8');
  const profileJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'clients', 'client-profile.js'), 'utf8');
  const profileCss = fs.readFileSync(path.join(__dirname, '..', 'web', 'clients', 'client-profile.css'), 'utf8');

  // Comprobar elementos HTML en la ficha
  assert.ok(profileHtml.includes('id="open-add-bono"'), 'Debe existir botón para abrir el modal de añadir bono');
  assert.ok(profileHtml.includes('id="add-bono-dialog"'), 'Debe existir el diálogo modal de asignación de bono');
  assert.ok(profileHtml.includes('id="bono-service-select"'), 'Debe existir selector de servicio');
  assert.ok(profileHtml.includes('id="bono-sessions-bought"'), 'Debe existir campo para sesiones compradas');
  assert.ok(profileHtml.includes('id="bono-total-amount"'), 'Debe existir campo para importe total');
  assert.ok(profileHtml.includes('id="bono-calc-callout"'), 'Debe existir callout de cálculo');
  assert.ok(profileHtml.includes('4 semanas solo'), 'Debe mostrar la regla de validez de 4 semanas');

  // Comprobar lógica en el script JS de la ficha
  assert.ok(profileJs.includes('/api/services?activeOnly=true') || profileJs.includes('/api/services'), 'Debe cargar el catálogo de servicios');
  assert.ok(profileJs.includes('/service-packages'), 'Debe enviar POST al endpoint de service-packages');
  assert.ok(profileJs.includes('updateBonoCalculation'), 'Debe calcular automáticamente el precio por sesión');
  assert.ok(profileJs.includes('loadPurchaseHistory'), 'Debe recargar el historial de compras tras guardar el bono');

  // Comprobar estilos CSS
  assert.ok(profileCss.includes('.add-bono-dialog'), 'Debe contener estilos para el diálogo de bonos');
  assert.ok(profileCss.includes('.bono-calc-callout'), 'Debe contener estilos para el bloque de cálculo de bonos');
});

test('Clientes y Bonos: Directorio de clientes incluye botón de asignación rápida y auto-completado', () => {
  const clientsHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'clients', 'clients.html'), 'utf8');
  const clientsJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'clients', 'clients.js'), 'utf8');
  const clientsCss = fs.readFileSync(path.join(__dirname, '..', 'web', 'clients', 'clients.css'), 'utf8');

  // Comprobar botón rápido en la tarjeta de cliente
  assert.ok(clientsJs.includes('client-card-bono-btn'), 'Debe incluir botón rápido de bono en cada tarjeta de cliente');
  assert.ok(clientsCss.includes('.client-card-bono-btn'), 'Debe contener estilos para el botón rápido de bono');

  // Comprobar auto-completado al seleccionar servicio en el historial
  assert.ok(clientsJs.includes('purchaseServiceSelect'), 'Debe escuchar cambios en el selector de servicio');
  assert.ok(clientsJs.includes('updatePurchaseCallout'), 'Debe recalcular valores y tasa por sesión');
  assert.ok(clientsHtml.includes('purchase-calc-callout'), 'Debe contener bloque visual con duración y 4 semanas de validez');
  assert.ok(clientsHtml.includes('4 semanas solo'), 'Debe reflejar la validez fija de 4 semanas');
});


test('Seguridad y Accesos: Administrador puede cambiar o restablecer la contraseña de un entrenador si se le olvida', async () => {
  const { Access, initialPassword } = require('../dist/calendar/access.js');
  await new (require('../dist/calendar/store').Store)(pool).migrate();

  const access = new Access(pool);

  // Crear un gimnasio de prueba en el esquema calendar si no existe
  const gymId = 'gym-pwd-test';
  await pool.query(
    `INSERT INTO calendar.gyms(id, name, config)
     VALUES($1, 'Gym Password Test', '{"employees":[{"id":"emp-pwd-1","name":"Carlos Entrenador","active":true,"jobTitle":"Entrenador"}],"clients":[]}')
     ON CONFLICT(id) DO NOTHING`,
    [gymId]
  );

  // Crear un administrador primero (requerido como primera cuenta del gimnasio)
  const adminRes = await access.save(gymId, {
    username: `admin.pwd.${Date.now()}`,
    name: 'Admin Principal',
    role: 'ADMIN',
    enabled: true,
  });
  assert.ok(adminRes.id, 'Debe crear la cuenta inicial de administrador');

  // Crear un usuario entrenador con contraseña inicial
  const username = `carlos.trainer.${Date.now()}`;
  const saveRes = await access.save(gymId, {
    username,
    role: 'TRAINER',
    name: 'Carlos Entrenador',
    employeeId: 'emp-pwd-1',
    enabled: true,
  });
  assert.ok(saveRes.id, 'Debe crear el usuario');

  // El entrenador inicia sesión por primera vez con contraseña inicial Trainerspoint
  const firstLogin = await access.login(gymId, { username, password: initialPassword });
  assert.ok(firstLogin.token);
  assert.equal(firstLogin.mustChangePassword, true);

  // El entrenador cambia su contraseña a una personal
  await access.changePassword(gymId, firstLogin.token, {
    currentPassword: initialPassword,
    newPassword: 'Mi-Password-Super-Segura-1234',
    confirmPassword: 'Mi-Password-Super-Segura-1234',
  });

  // Supongamos que el entrenador olvida su contraseña.
  // El administrador restablece la contraseña del entrenador a la temporal Trainerspoint
  const resetRes = await access.adminResetPassword(gymId, saveRes.id);
  assert.ok(resetRes.ok);
  assert.equal(resetRes.temporaryPassword, initialPassword);
  assert.equal(resetRes.mustChangePassword, true);

  // El entrenador ahora puede volver a entrar con la contraseña temporal Trainerspoint
  const afterResetLogin = await access.login(gymId, { username, password: initialPassword });
  assert.ok(afterResetLogin.token);
  assert.equal(afterResetLogin.mustChangePassword, true);

  // El administrador también puede establecerle directamente una nueva contraseña específica
  const customPass = 'NuevaClaveTemporal2026';
  await access.adminResetPassword(gymId, saveRes.id, customPass);

  const customLogin = await access.login(gymId, { username, password: customPass });
  assert.ok(customLogin.token);
  assert.equal(customLogin.mustChangePassword, true);

  // Limpiar
  await pool.query('DELETE FROM calendar.sessions WHERE user_id IN (SELECT id FROM calendar.users WHERE gym_id=$1)', [gymId]);
  await pool.query('DELETE FROM calendar.users WHERE gym_id=$1', [gymId]);
  await pool.query('DELETE FROM calendar.gyms WHERE id=$1', [gymId]);
});

test('Interfaz de Usuarios y Profesionales: Elementos para cambio y restablecimiento de contraseña de entrenadores', () => {
  const usersHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'staff', 'users.html'), 'utf8');
  const usersJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'staff', 'users.js'), 'utf8');
  const profHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'staff', 'professionals.html'), 'utf8');
  const profJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'staff', 'professionals.js'), 'utf8');

  // En gestión de usuarios (users.html y users.js)
  assert.ok(usersHtml.includes('id="user-password-box"'), 'Debe incluir caja de gestión de contraseña');
  assert.ok(usersHtml.includes('id="btn-quick-reset-pwd"'), 'Debe incluir botón de restablecer a Trainerspoint');
  assert.ok(usersHtml.includes('id="user-password"'), 'Debe incluir campo para nueva contraseña');
  assert.ok(usersJs.includes('btn-card-reset-pwd'), 'Debe incluir botón de restablecer clave en tarjetas de usuario');
  assert.ok(usersJs.includes('reset-password'), 'Debe conectar con endpoint reset-password');

  // En gestión de profesionales (professionals.html y professionals.js)
  assert.ok(profHtml.includes('id="prof-user-account-box"'), 'Debe incluir bloque de cuenta de usuario en ficha de profesional');
  assert.ok(profHtml.includes('id="prof-btn-reset-pwd"'), 'Debe incluir botón de restablecer contraseña de entrenador');
  assert.ok(profJs.includes('prof-btn-reset-pwd'), 'Debe incluir manejador para restablecer contraseña del profesional');
  assert.ok(profJs.includes('reset-password'), 'Debe llamar al endpoint de reseteo de contraseña');
});

test('Control de acceso y navegación para perfil Entrenador: Restricción de ventanas y rutas privadas', () => {
  const menuJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'shared', 'menu.js'), 'utf8');
  const menuCss = fs.readFileSync(path.join(__dirname, '..', 'web', 'shared', 'menu.css'), 'utf8');
  const gymsJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'centers', 'gyms.js'), 'utf8');
  const servicesJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'services', 'services.js'), 'utf8');
  const usersJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'staff', 'users.js'), 'utf8');
  const profJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'staff', 'professionals.js'), 'utf8');
  const gestionJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'staff', 'gestion.js'), 'utf8');
  const clientsJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'clients', 'clients.js'), 'utf8');
  const clientProfileJs = fs.readFileSync(path.join(__dirname, '..', 'web', 'clients', 'client-profile.js'), 'utf8');

  // Menú lateral y redirección global
  assert.ok(menuJs.includes("location.replace('/index.html')"), 'menu.js debe redirigir si se intenta acceder a una ruta no autorizada');
  assert.ok(menuCss.includes('[hidden]'), 'menu.css debe forzar display: none !important para elementos ocultos');

  // Páginas protegidas contra acceso directo de entrenadores
  assert.ok(gymsJs.includes('location.replace("/index.html")'), 'gyms.js debe expulsar perfiles que no sean ADMIN');
  assert.ok(servicesJs.includes("location.replace('/index.html')"), 'services.js debe expulsar perfiles TRAINER');
  assert.ok(usersJs.includes("location.replace('/index.html')"), 'users.js debe expulsar perfiles no ADMIN');
  assert.ok(profJs.includes("location.replace('/index.html')"), 'professionals.js debe expulsar perfiles no autorizados');

  // Gestión de turnos sin redirección accidental
  assert.ok(gestionJs.includes("section = 'shifts'"), 'gestion.js debe fijar la sección de turnos para entrenadores');

  // Ficha de clientes
  assert.ok(clientsJs.includes("currentUserRole !== 'TRAINER'"), 'clients.js no debe renderizar acción de añadir bono a entrenadores');
  assert.ok(clientProfileJs.includes("currentUserRole === 'TRAINER'"), 'client-profile.js debe ocultar asignación de bonos y cambios de sede a entrenadores');
});
