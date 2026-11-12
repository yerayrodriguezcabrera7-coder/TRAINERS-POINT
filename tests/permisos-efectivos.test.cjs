const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { authorize } = require('../dist/http/authorize');
const { cashPermission } = require('../dist/finance/cash');
const { inventoryPermission } = require('../dist/finance/inventory');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(chunk) { this.body = chunk; },
  };
}

test('Menú y matriz de permisos: sin duplicidad, sin En preparación y sin Turnos antiguo', () => {
  const menu = fs.readFileSync('web/shared/menu.js', 'utf8');
  const perms = fs.readFileSync('web/admin/permisos-pagina.js', 'utf8');

  assert.ok(!menu.includes("'/gestion.html?section=roles'"), 'No debe existir enlace duplicado a gestion.html?section=roles en el menú');
  assert.ok(!menu.includes("'/gestion.html?section=shifts'"), 'No debe existir enlace antiguo a Turnos en el menú');
  assert.ok(!menu.includes('menu-future') && !menu.includes('En preparación'), 'No debe existir la sección desplegable En preparación');
  for (const dead of ['Informes', 'Cuadro de mando', 'Historial de eventos', 'Reserva web', 'App móvil', 'Notificaciones', 'Buzón de consultas']) {
    assert.ok(!menu.includes(dead), `No debe existir la opción deshabilitada "${dead}" en el menú`);
  }
  assert.ok(menu.includes("['Equipo',['Profesionales','Fichajes','Ausencias del equipo']]"), 'Equipo no debe incluir Turnos');
  assert.ok(menu.includes("['Administración',['Gimnasios','Usuarios','Permisos de página','Configuración']]"), 'Administración debe tener una única entrada de Permisos de página');
  assert.ok(!perms.includes("gestion.html?section=services") && !perms.includes("gestion.html?section=shifts"), 'No debe haber rutas obsoletas en presets o defaults');
  assert.ok(perms.includes("key: 'caja.html', label: 'Caja y ventas'"), 'La matriz debe reflejar Caja y ventas');
});

test('authorize(): los permisos personalizados prevalecen sobre los bloqueos fijos por rol', async () => {
  const trainerWithPerms = {
    id: 'u1',
    name: 'Entrenador Ampliado',
    role: 'TRAINER',
    employeeId: 'e1',
    clientId: null,
    mustChangePassword: false,
    pagePermissions: ['servicios', 'clientes', 'caja.html', 'productos.html', 'gimnasios', 'pendientes.html'],
  };
  const baseContext = {
    calendarAccess: { identify: async () => trainerWithPerms, needsSetup: async () => false },
    calendarHandler: null,
    calendarBootstrapToken: '',
    currentConfiguredGym: 'g1',
  };

  for (const [method, path] of [
    ['POST', '/api/services'],
    ['POST', '/api/clients'],
    ['POST', '/api/service-packages'],
    ['POST', '/api/cash/sessions'],
    ['POST', '/api/inventory/products'],
    ['POST', '/api/gyms'],
    ['GET', '/api/pending-packages'],
  ]) {
    const req = { method, headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    const blocked = await authorize(req, res, new URL('http://localhost' + path), baseContext);
    assert.equal(blocked, false, `${method} ${path} no debe quedar bloqueado por rol TRAINER si tiene pagePermissions`);
  }

  // Recepción restringida por pagePermissions debe quedar bloqueada en rutas no permitidas
  const restrictedReception = {
    id: 'u2',
    name: 'Recepción Limitada',
    role: 'RECEPTION',
    employeeId: 'e2',
    clientId: null,
    mustChangePassword: false,
    pagePermissions: ['index.html'],
  };
  const restrictedCtx = {
    ...baseContext,
    calendarAccess: { identify: async () => restrictedReception, needsSetup: async () => false },
  };
  for (const [method, path] of [
    ['GET', '/api/clients'],
    ['GET', '/api/services'],
    ['GET', '/api/cash/current'],
    ['GET', '/api/inventory/sales'],
    ['GET', '/api/pending-packages'],
  ]) {
    const req = { method, headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    const blocked = await authorize(req, res, new URL('http://localhost' + path), restrictedCtx);
    assert.equal(blocked, true, `${method} ${path} debe bloquearse para RECEPTION sin ese permiso`);
    assert.equal(res.statusCode, 403);
  }
});

test('cashPermission e inventoryPermission respetan pagePermissions sobre el rol base', () => {
  const trainerWithCashAndProducts = {
    id: 'u1',
    name: 'Entrenador',
    role: 'TRAINER',
    employeeId: 'e1',
    clientId: null,
    mustChangePassword: false,
    pagePermissions: ['caja.html', 'productos.html'],
  };
  assert.doesNotThrow(() => cashPermission(trainerWithCashAndProducts));
  assert.doesNotThrow(() => inventoryPermission(trainerWithCashAndProducts, 'read'));
  assert.doesNotThrow(() => inventoryPermission(trainerWithCashAndProducts, 'sell'));
  assert.doesNotThrow(() => inventoryPermission(trainerWithCashAndProducts, 'admin'));

  const receptionWithoutCash = {
    id: 'u2',
    name: 'Recepción',
    role: 'RECEPTION',
    employeeId: 'e2',
    clientId: null,
    mustChangePassword: false,
    pagePermissions: ['index.html'],
  };
  assert.throws(() => cashPermission(receptionWithoutCash), /permiso/);
  assert.throws(() => inventoryPermission(receptionWithoutCash, 'read'), /permiso/);
});
