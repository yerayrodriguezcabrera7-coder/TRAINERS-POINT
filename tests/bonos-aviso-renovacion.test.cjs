const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clientPackageAlerts } = require('../dist/finance/packages');

test('clientPackageAlerts: detecta última sesión disponible (sessionsRemaining === 1)', async () => {
  const now = new Date();
  const mockDb = {
    $queryRaw: async () => [
      {
        packageId: 'pkg-1',
        clientId: 'client-1',
        serviceName: 'Entrenamiento Personal 10 sesiones',
        sessionsBought: 10,
        sessionsUsed: 9,
        purchasedAt: new Date(now.getTime() - 10 * 86400000), // Hace 10 días
        validityWeeks: 4, // 28 días de validez -> quedan 18 días
      },
    ],
  };

  const alerts = await clientPackageAlerts(mockDb, 'gym-1');
  assert.ok(alerts['client-1']);
  assert.equal(alerts['client-1'].type, 'LAST_SESSION');
  assert.equal(alerts['client-1'].sessionsRemaining, 1);
  assert.equal(alerts['client-1'].needsRenewal, true);
  assert.match(alerts['client-1'].message, /Última sesión/);
});

test('clientPackageAlerts: detecta bono a punto de caducar (<= 7 días)', async () => {
  const now = new Date();
  const mockDb = {
    $queryRaw: async () => [
      {
        packageId: 'pkg-2',
        clientId: 'client-2',
        serviceName: 'Bono Mensual',
        sessionsBought: 8,
        sessionsUsed: 3, // Quedan 5 sesiones
        purchasedAt: new Date(now.getTime() - 25 * 86400000), // Hace 25 días
        validityWeeks: 4, // Validez 28 días -> quedan 3 días
      },
    ],
  };

  const alerts = await clientPackageAlerts(mockDb, 'gym-1');
  assert.ok(alerts['client-2']);
  assert.equal(alerts['client-2'].type, 'EXPIRING_SOON');
  assert.equal(alerts['client-2'].sessionsRemaining, 5);
  assert.ok(alerts['client-2'].daysRemaining <= 7 && alerts['client-2'].daysRemaining >= 0);
  assert.equal(alerts['client-2'].needsRenewal, true);
  assert.match(alerts['client-2'].message, /Caduca en \d+ días? \(5 ses\.\)/);
});

test('clientPackageAlerts: detecta bono ya caducado con sesiones restantes', async () => {
  const now = new Date();
  const mockDb = {
    $queryRaw: async () => [
      {
        packageId: 'pkg-3',
        clientId: 'client-3',
        serviceName: 'Bono Mensual',
        sessionsBought: 8,
        sessionsUsed: 4,
        purchasedAt: new Date(now.getTime() - 35 * 86400000), // Hace 35 días
        validityWeeks: 4, // Validez 28 días -> caducó hace 7 días
      },
    ],
  };

  const alerts = await clientPackageAlerts(mockDb, 'gym-1');
  assert.ok(alerts['client-3']);
  assert.equal(alerts['client-3'].type, 'EXPIRED');
  assert.equal(alerts['client-3'].sessionsRemaining, 4);
  assert.ok(alerts['client-3'].daysRemaining < 0);
  assert.match(alerts['client-3'].message, /Bono caducado \(4 ses\.\)/);
});

test('clientPackageAlerts: detecta bono completamente agotado (0 sesiones)', async () => {
  const now = new Date();
  const mockDb = {
    $queryRaw: async () => [
      {
        packageId: 'pkg-4',
        clientId: 'client-4',
        serviceName: 'Bono 5 sesiones',
        sessionsBought: 5,
        sessionsUsed: 5,
        purchasedAt: new Date(now.getTime() - 10 * 86400000),
        validityWeeks: 4,
      },
    ],
  };

  const alerts = await clientPackageAlerts(mockDb, 'gym-1');
  assert.ok(alerts['client-4']);
  assert.equal(alerts['client-4'].type, 'DEPLETED');
  assert.equal(alerts['client-4'].sessionsRemaining, 0);
  assert.equal(alerts['client-4'].message, 'Bono agotado');
});

test('clientPackageAlerts: no alerta si el cliente ya compró un nuevo bono activo y sano (renovado)', async () => {
  const now = new Date();
  const mockDb = {
    $queryRaw: async () => [
      // Bono nuevo recién comprado (10 sesiones, 0 usadas, 28 días)
      {
        packageId: 'pkg-new',
        clientId: 'client-renovado',
        serviceName: 'Nuevo Bono 10 sesiones',
        sessionsBought: 10,
        sessionsUsed: 0,
        purchasedAt: new Date(now.getTime() - 1 * 86400000),
        validityWeeks: 4,
      },
      // Bono anterior agotado o con 1 sesión
      {
        packageId: 'pkg-old',
        clientId: 'client-renovado',
        serviceName: 'Bono Antiguo 10 sesiones',
        sessionsBought: 10,
        sessionsUsed: 9,
        purchasedAt: new Date(now.getTime() - 27 * 86400000),
        validityWeeks: 4,
      },
    ],
  };

  const alerts = await clientPackageAlerts(mockDb, 'gym-1');
  // Al tener un bono sano con 10 sesiones y >7 días de validez, no debe alertar falsamente
  assert.equal(alerts['client-renovado'], undefined);
});

test('clientPackageAlerts: bono sano sin proximidad a caducar no genera alerta', async () => {
  const now = new Date();
  const mockDb = {
    $queryRaw: async () => [
      {
        packageId: 'pkg-ok',
        clientId: 'client-ok',
        serviceName: 'Bono 10 sesiones',
        sessionsBought: 10,
        sessionsUsed: 3, // Quedan 7 sesiones
        purchasedAt: new Date(now.getTime() - 5 * 86400000), // Quedan 23 días
        validityWeeks: 4,
      },
    ],
  };

  const alerts = await clientPackageAlerts(mockDb, 'gym-1');
  assert.equal(alerts['client-ok'], undefined);
});

test('Calendario: lógica de insignias y aviso de renovación en reservas', () => {
  const alertsData = {
    'c1': {
      packageId: 'p1',
      serviceName: 'Entrenamiento Personal',
      sessionsRemaining: 1,
      daysRemaining: 15,
      type: 'LAST_SESSION',
      message: 'Última sesión disponible',
      needsRenewal: true,
    },
    'c2': {
      packageId: 'p2',
      serviceName: 'Bono Mensual',
      sessionsRemaining: 4,
      daysRemaining: 3,
      type: 'EXPIRING_SOON',
      message: 'Caduca en 3 días (4 ses.)',
      needsRenewal: true,
    },
  };

  function upcomingRenewal(b, alerts) {
    if (!['pending', 'confirmed'].includes(b.status)) return null;
    return alerts?.[b.clientId] || null;
  }

  function renewalBadge(b, alerts) {
    const alert = upcomingRenewal(b, alerts);
    if (!alert || !alert.needsRenewal) return '';
    return `<span class="booking-renewal-badge" title="${alert.message}">🔄 ${alert.message}</span>`;
  }

  // Reserva confirmada para c1 -> muestra insignia de renovación
  const b1 = { id: 'b1', clientId: 'c1', status: 'confirmed' };
  const badge1 = renewalBadge(b1, alertsData);
  assert.match(badge1, /class="booking-renewal-badge"/);
  assert.match(badge1, /Última sesión disponible/);

  // Reserva confirmada para c2 -> muestra insignia de caducidad cercana
  const b2 = { id: 'b2', clientId: 'c2', status: 'confirmed' };
  const badge2 = renewalBadge(b2, alertsData);
  assert.match(badge2, /Caduca en 3 días \(4 ses\.\)/);

  // Reserva cancelada -> no muestra insignia
  const bCancelled = { id: 'b3', clientId: 'c1', status: 'cancelled' };
  assert.equal(renewalBadge(bCancelled, alertsData), '');

  // Cliente sin alertas -> no muestra insignia
  const bClean = { id: 'b4', clientId: 'c_clean', status: 'confirmed' };
  assert.equal(renewalBadge(bClean, alertsData), '');
});
