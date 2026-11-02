const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

let prisma;
const createdServiceIds = [];

before(async () => {
  prisma = new PrismaClient();
  await prisma.$connect();
});

after(async () => {
  if (prisma) {
    if (createdServiceIds.length) {
      await prisma.service.deleteMany({
        where: { id: { in: createdServiceIds } },
      });
    }
    await prisma.$disconnect();
  }
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
      validityWeeks: 12,
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
  assert.equal(service.validityWeeks, 12);
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
      validityWeeks: 6,
      recommendedWeeklyFrequency: 1,
      conditions: 'Válido durante 6 semanas.',
    },
  });

  assert.equal(updated.name, 'Test Servicio Modificado');
  assert.equal(Number(updated.price), 55.50);
  assert.equal(updated.durationMin, 60);
  assert.equal(updated.modality, 'DUAL');
  assert.equal(updated.type, 'PACK');
  assert.equal(updated.trainingCount, 5);
  assert.equal(updated.validityWeeks, 6);
  assert.equal(updated.recommendedWeeklyFrequency, 1);
  assert.equal(updated.conditions, 'Válido durante 6 semanas.');
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

