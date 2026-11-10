const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mobileStaffView, staffClientIds } = require('../dist/calendar/mobile-view');
const state = {
  clients: [
    { id: 'c1', name: 'Cliente uno', assignedWorkerId: 'e1', notes: 'private health notes' },
    { id: 'c2', name: 'Cliente dos', assignedWorkerId: 'e2' },
    { id: 'c3', name: 'Cliente tres', assignedWorkerId: 'e1' },
  ],
  employees: [{ id: 'e1', name: 'Uno', schedule: ['private'] }, { id: 'e2', name: 'Dos' }],
  services: [{ id: 's1', name: 'Personal', color: '#abcdef', price: 100 }],
  rooms: [{ id: 'r1', name: 'Sala' }],
  centers: [{ id: 'g1', name: 'Centro uno' }, { id: 'g2', name: 'Centro dos' }],
  users: [{ passwordHash: 'secret' }],
  clientDebts: { c1: 20, c2: 100 },
  bookings: [
    { id: 'b1', clientId: 'c1', employeeId: 'e1', centerId: 'g1', date: '2030-01-01', status: 'CONFIRMED', history: [{ actor: 'other worker' }], chargeAmount: 100 },
    { id: 'b2', clientId: 'c2', employeeId: 'e2', centerId: 'g2', date: '2030-01-01', status: 'CONFIRMED' },
    { id: 'b3', clientId: 'c2', employeeId: null, centerId: 'g2', date: '2030-01-02', status: 'PENDING', needsReschedule: true },
  ],
};

test('mobile worker sees only their own appointments, linked clients and centres', () => {
  const view = mobileStaffView(state, { role: 'TRAINER', employeeId: 'e1' });
  assert.deepEqual(view.bookings.map(b => b.id), ['b1']);
  assert.deepEqual(view.clients.map(c => c.id), ['c1', 'c3']);
  assert.deepEqual(view.employees.map(e => e.id), ['e1']);
  assert.deepEqual(view.centers.map(c => c.id), ['g1']);
  assert.equal(view.clients[0].notes, undefined);
  assert.equal(view.bookings[0].history, undefined);
  assert.equal(view.bookings[0].chargeAmount, undefined);
  assert.equal(view.services[0].price, undefined);
  assert.equal(view.users, undefined);
  assert.equal(view.clientDebts, undefined);
});

test('mobile reception sees all agendas and pending bookings without account or financial configuration', () => {
  const view = mobileStaffView(state, { role: 'RECEPTION', employeeId: 'reception' });
  assert.equal(view.bookings.length, 3);
  assert.equal(view.clients.length, 3);
  assert.equal(view.employees.length, 2);
  assert.equal(view.bookings.find(b => b.id === 'b3').needsReschedule, true);
  assert.equal(view.users, undefined);
  assert.equal(view.clientDebts, undefined);
});

test('client credentials and unlinked workers cannot request the staff projection', () => {
  assert.throws(() => mobileStaffView(state, { role: 'CLIENT', clientId: 'c1' }), error => error.status === 403);
  assert.throws(() => mobileStaffView(state, { role: 'TRAINER', employeeId: null }), error => error.status === 403);
  assert.deepEqual([...staffClientIds(state, { role: 'TRAINER', employeeId: 'e2' })], ['c2']);
});
