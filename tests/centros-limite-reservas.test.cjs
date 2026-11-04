const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseGymInput } = require('../dist/validation/records');
const { assertAvailable } = require('../dist/calendar/model');

const hours = Array.from({ length: 7 }, () => ({
  open: '09:00',
  close: '21:00',
  closed: false,
}));

function makeConfig(extra = {}) {
  return {
    timezone: 'Europe/Madrid',
    schedule: structuredClone(hours),
    employees: [
      { id: 'e1', name: 'Entrenador 1', color: '#111111', schedule: structuredClone(hours) },
      { id: 'e2', name: 'Entrenador 2', color: '#222222', schedule: structuredClone(hours) },
      { id: 'e3', name: 'Entrenador 3', color: '#333333', schedule: structuredClone(hours) },
    ],
    services: [
      { id: 's1', name: 'Sesión individual', duration: 60, capacity: 1 },
      { id: 's2', name: 'Sesión 30 min', duration: 30, capacity: 1 },
    ],
    rooms: [
      { id: 'r1', name: 'Sala 1' },
      { id: 'r2', name: 'Sala 2' },
      { id: 'r3', name: 'Sala 3' },
    ],
    clients: [
      { id: 'c1', name: 'Cliente 1', email: '', phone: '', notes: '' },
      { id: 'c2', name: 'Cliente 2', email: '', phone: '', notes: '' },
      { id: 'c3', name: 'Cliente 3', email: '', phone: '', notes: '' },
      { id: 'c4', name: 'Cliente 4', email: '', phone: '', notes: '' },
    ],
    leaveRequests: [],
    centers: [
      { id: 'gym-bilbao', name: 'Bilbao', maxBookingsPerHour: 2 },
      { id: 'gym-madrid', name: 'Madrid', maxBookingsPerHour: 1 },
      { id: 'gym-vitoria', name: 'Vitoria', maxBookingsPerHour: null },
    ],
    ...extra,
  };
}

const booking = (extra = {}) => ({
  id: 'b-new',
  clientId: 'c1',
  employeeId: 'e1',
  roomId: 'r1',
  serviceId: 's1',
  date: '2026-11-10',
  start: '10:00',
  end: '11:00',
  status: 'CONFIRMED',
  centerId: 'gym-bilbao',
  version: 1,
  ...extra,
});

test('parseGymInput: validación de límite de reservas por hora', () => {
  // Límite positivo válido
  const valid1 = parseGymInput({ name: 'Centro Test', maxBookingsPerHour: 5 });
  assert.equal(typeof valid1, 'object');
  assert.equal(valid1.maxBookingsPerHour, 5);

  const validString = parseGymInput({ name: 'Centro Test', maxBookingsPerHour: '10' });
  assert.equal(typeof validString, 'object');
  assert.equal(validString.maxBookingsPerHour, 10);

  // Vacío / null / undefined -> sin límite (null)
  const empty1 = parseGymInput({ name: 'Centro Test', maxBookingsPerHour: '' });
  assert.equal(typeof empty1, 'object');
  assert.equal(empty1.maxBookingsPerHour, null);

  const empty2 = parseGymInput({ name: 'Centro Test' });
  assert.equal(typeof empty2, 'object');
  assert.equal(empty2.maxBookingsPerHour, null);

  const empty3 = parseGymInput({ name: 'Centro Test', maxBookingsPerHour: null });
  assert.equal(typeof empty3, 'object');
  assert.equal(empty3.maxBookingsPerHour, null);

  // Valores inválidos: <= 0 o no enteros
  const invalidZero = parseGymInput({ name: 'Centro Test', maxBookingsPerHour: 0 });
  assert.match(invalidZero, /entero positivo/i);

  const invalidNegative = parseGymInput({ name: 'Centro Test', maxBookingsPerHour: -2 });
  assert.match(invalidNegative, /entero positivo/i);

  const invalidText = parseGymInput({ name: 'Centro Test', maxBookingsPerHour: 'cinco' });
  assert.match(invalidText, /entero positivo/i);
});

test('assertAvailable: límite de reservas por hora en centro', () => {
  const config = makeConfig();

  // Bilbao tiene maxBookingsPerHour = 2
  const b1 = booking({ id: 'b1', clientId: 'c1', employeeId: 'e1', roomId: 'r1', centerId: 'gym-bilbao' });
  const b2 = booking({ id: 'b2', clientId: 'c2', employeeId: 'e2', roomId: 'r2', centerId: 'gym-bilbao' });
  const b3 = booking({ id: 'b3', clientId: 'c3', employeeId: 'e3', roomId: 'r3', centerId: 'gym-bilbao' });

  // 1. Con 0 reservas, b1 se permite
  assert.doesNotThrow(() => assertAvailable(b1, [], config));

  // 2. Con 1 reserva existente (b1), b2 se permite (llegamos a 2)
  assert.doesNotThrow(() => assertAvailable(b2, [b1], config));

  // 3. Con 2 reservas existentes (b1 y b2) a las 10:00, b3 se rechaza por superar el límite
  assert.throws(
    () => assertAvailable(b3, [b1, b2], config),
    /límite máximo de 2 reservas por hora/i
  );

  // 4. Pero a otra hora (11:00), b3 sí se permite
  const b3Later = booking({ id: 'b3', clientId: 'c3', employeeId: 'e3', roomId: 'r3', start: '11:00', end: '12:00', centerId: 'gym-bilbao' });
  assert.doesNotThrow(() => assertAvailable(b3Later, [b1, b2], config));

  // 5. En otro centro (gym-madrid) que tiene su propio aforo
  const bMadrid = booking({ id: 'b-mad', clientId: 'c3', employeeId: 'e3', roomId: 'r3', centerId: 'gym-madrid' });
  assert.doesNotThrow(() => assertAvailable(bMadrid, [b1, b2], config));

  // 6. Si una de las reservas de Bilbao está CANCELADA, se libera el hueco
  const b2Cancelled = { ...b2, status: 'CANCELLED' };
  assert.doesNotThrow(() => assertAvailable(b3, [b1, b2Cancelled], config));

  // 7. Modificar la misma reserva no colisiona consigo misma
  assert.doesNotThrow(() => assertAvailable(b1, [b1, b2], config));
});

test('assertAvailable: centro sin límite (null) permite múltiples reservas simultáneas', () => {
  const config = makeConfig();
  // Vitoria tiene maxBookingsPerHour = null
  const v1 = booking({ id: 'v1', clientId: 'c1', employeeId: 'e1', roomId: 'r1', centerId: 'gym-vitoria' });
  const v2 = booking({ id: 'v2', clientId: 'c2', employeeId: 'e2', roomId: 'r2', centerId: 'gym-vitoria' });
  const v3 = booking({ id: 'v3', clientId: 'c3', employeeId: 'e3', roomId: 'r3', centerId: 'gym-vitoria' });

  assert.doesNotThrow(() => assertAvailable(v3, [v1, v2], config));
});

