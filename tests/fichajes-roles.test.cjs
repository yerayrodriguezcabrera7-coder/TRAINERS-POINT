const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../dist/calendar/store');

test('Fichajes RBAC: Trainer solo ve sus fichajes; Reception y Admin pueden consultar la plantilla', async () => {
  const fakeEmployees = [
    { id: 'e1', name: 'Admin Uno', color: '#111111', active: true },
    { id: 'e2', name: 'Entrenador Dos', color: '#222222', active: true },
    { id: 'e3', name: 'Entrenador Tres', color: '#333333', active: true },
    { id: 'e4', name: 'Recepción Cuatro', color: '#444444', active: true },
  ];

  const fakeRows = [
    { id: 'att-1', employeeId: 'e1', clockIn: '2026-11-02T08:00:00.000Z', clockOut: '2026-11-02T16:00:00.000Z' },
    { id: 'att-2', employeeId: 'e2', clockIn: '2026-11-02T09:00:00.000Z', clockOut: null },
    { id: 'att-3', employeeId: 'e3', clockIn: '2026-11-02T10:00:00.000Z', clockOut: '2026-11-02T14:00:00.000Z' },
    { id: 'att-4', employeeId: 'e4', clockIn: '2026-11-02T07:30:00.000Z', clockOut: null },
  ];

  const mockPool = {
    query: async () => ({ rows: fakeRows }),
  };

  const store = new Store(mockPool);
  store.state = async () => ({
    timezone: 'Europe/Madrid',
    employees: fakeEmployees,
  });

  // 1. Admin consulta fichajes -> ve a los 4 trabajadores y todos los registros
  const adminRes = await store.attendance('gym-1', '2026-11-02', '2026-11-02', undefined, 'ADMIN');
  assert.equal(adminRes.employees.length, 4, 'Admin debe ver a los 4 empleados');
  assert.equal(adminRes.records.length, 4, 'Admin debe ver todos los registros');

  // 2. Entrenador e2 consulta fichajes -> solo ve a e2 y sus propios registros
  const trainerRes = await store.attendance('gym-1', '2026-11-02', '2026-11-02', 'e2', 'TRAINER');
  assert.equal(trainerRes.employees.length, 1, 'Entrenador solo debe ver a un empleado');
  assert.equal(trainerRes.employees[0].id, 'e2', 'Entrenador solo se ve a sí mismo');
  assert.equal(trainerRes.records.length, 1, 'Entrenador solo ve su propio registro');
  assert.equal(trainerRes.records[0].employeeId, 'e2');

  // 3. Recepcionista e4 consulta fichajes -> solo ve a e4 y sus propios registros
  const recRes = await store.attendance('gym-1', '2026-11-02', '2026-11-02', undefined, 'RECEPTION');
  assert.equal(recRes.employees.length, 4);
  assert.equal(recRes.records.length, 4);

  // 4. Entrenador e3 consulta fichajes -> solo ve a e3
  const trainer3Res = await store.attendance('gym-1', '2026-11-02', '2026-11-02', 'e3', 'TRAINER');
  assert.equal(trainer3Res.employees.length, 1);
  assert.equal(trainer3Res.employees[0].id, 'e3');
  assert.equal(trainer3Res.records.length, 1);
  assert.equal(trainer3Res.records[0].employeeId, 'e3');
});

