const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');

test('Caja integra el historial completo de ventas, búsqueda, filtros y diálogos de venta/pago/devolución', async () => {
  const html = fs.readFileSync('web/cash/caja.html', 'utf8');
  const script = fs.readFileSync('web/cash/caja.js', 'utf8');
  const product = { id: randomUUID(), name: 'Agua Mineral', unitPrice: '1.50', stock: 10, isActive: true };
  const client = { id: randomUUID(), name: 'Lucía Gómez', firstName: 'Lucía', lastName: 'Gómez', email: 'lucia@example.com', phone: '600111222' };
  const sale = {
    id: randomUUID(),
    clientId: client.id,
    client: { firstName: 'Lucía', lastName: 'Gómez' },
    soldAt: new Date().toISOString(),
    status: 'COMPLETADA',
    totalAmount: '15.00',
    netAmount: '15.00',
    paidAmount: '5.00',
    receivedAmount: '5.00',
    refundedAmount: '0.00',
    outstandingAmount: '10.00',
    refundDue: '0.00',
    paymentStatus: 'PARCIAL',
    lines: [{ id: randomUUID(), description: 'Agua Mineral', quantity: 10, returnedQuantity: 0, unitPrice: '1.50', lineTotal: '15.00', type: 'PRODUCTO' }],
    payments: [{ kind: 'COLLECTION', amount: '5.00', method: 'EFECTIVO', status: 'PAGADO', paidAt: new Date().toISOString(), note: 'Anticipo' }],
    returnHistory: [],
  };

  const salesQueries = [];
  let submittedSale = null;

  const dom = new JSDOM(html, { url: 'http://localhost/caja.html?client=' + client.id, runScripts: 'outside-only' });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.fetch = async (url, opts = {}) => {
    let data = {};
    if (url === '/api/me') data = { role: 'ADMIN' };
    else if (url === '/api/cash/current') data = { session: null, unassignedPayments: 0 };
    else if (url.startsWith('/api/cash/sessions')) data = { sessions: [], page: 1, hasNext: false };
    else if (url === '/api/manage') data = { clients: [client], gymId: 'g1', centers: [] };
    else if (url === '/api/inventory/products') data = { products: [product] };
    else if (url.startsWith('/api/inventory/sales') && opts.method === 'POST') {
      submittedSale = JSON.parse(opts.body);
      data = { totalAmount: 3.00 };
    } else if (url.startsWith('/api/inventory/sales')) {
      salesQueries.push(url);
      data = { sales: [sale], pagination: { page: 1, hasPrevious: false, hasNext: false } };
    }
    return { ok: true, json: async () => data };
  };

  try {
    w.eval(script);
    for (let i = 0; i < 40 && !w.document.querySelector('#sales .sale-entry'); i++) {
      await new Promise(r => setTimeout(r, 10));
    }
    const d = w.document;
    assert.ok(d.getElementById('sales-panel'), 'Debe existir el panel de historial completo de ventas');
    assert.ok(d.getElementById('filter-search'), 'Debe existir el buscador del historial de ventas');
    assert.ok(d.getElementById('filter-client').value === client.id, 'Debe preseleccionar el cliente desde ?client=');
    assert.match(d.getElementById('sales').textContent, /Lucía Gómez/, 'Debe mostrar la venta del historial completo');
    assert.match(d.getElementById('sales').textContent, /Agua Mineral/, 'Debe mostrar el detalle de líneas de la venta');
    assert.ok(d.querySelector('[data-pay]'), 'Debe permitir registrar pagos pendientes desde Caja');
    assert.ok(d.querySelector('[data-return]'), 'Debe permitir devolver productos desde Caja');

    // Probar búsqueda + filtros
    d.getElementById('filter-search').value = 'Agua';
    d.getElementById('filter-state').value = 'COMPLETADA';
    d.getElementById('filter-method').value = 'EFECTIVO';
    d.getElementById('filters').dispatchEvent(new w.Event('submit', { cancelable: true }));
    for (let i = 0; i < 20 && salesQueries.length < 2; i++) await new Promise(r => setTimeout(r, 10));
    const lastQuery = salesQueries[salesQueries.length - 1];
    assert.match(lastQuery, /search=Agua/);
    assert.match(lastQuery, /status=COMPLETADA/);
    assert.match(lastQuery, /method=EFECTIVO/);

    // Probar registro de nueva venta desde Caja
    d.getElementById('new-sale').click();
    assert.equal(d.getElementById('sale-dialog').open, true);
    d.querySelector('#cart input').value = '2';
    d.getElementById('sale-form').requestSubmit(d.getElementById('confirm-sale'));
    for (let i = 0; i < 40 && (!submittedSale || d.getElementById('sale-dialog').open); i++) await new Promise(r => setTimeout(r, 10));
    await new Promise(r => setTimeout(r, 20));
    assert.equal(submittedSale.lines[0].productId, product.id);
    assert.equal(submittedSale.lines[0].quantity, 2);
    assert.match(d.getElementById('notice').textContent, /Venta registrada/);
  } finally {
    w.close();
  }
});

test('Navegación unificada: no existe pantalla duplicada de Ventas y cobros en el menú ni en permisos', () => {
  const menu = fs.readFileSync('web/shared/menu.js', 'utf8');
  const perms = fs.readFileSync('web/admin/permisos-pagina.js', 'utf8');
  const productosHtml = fs.readFileSync('web/inventory/productos.html', 'utf8');
  const calendarApp = fs.readFileSync('web/calendar/app.js', 'utf8');
  const clientProfile = fs.readFileSync('web/clients/client-profile.js', 'utf8');

  assert.ok(!menu.includes("'/ventas.html'"), 'El menú no debe enlazar a /ventas.html');
  assert.ok(!perms.includes("key: 'ventas.html'"), 'Permisos de página no debe listar ventas.html por separado');
  assert.ok(productosHtml.includes('/caja.html?nueva=1'), 'Productos debe abrir nueva venta en Caja');
  assert.ok(calendarApp.includes('/caja.html?client='), 'Calendario debe enlazar a Caja para deudas');
  assert.ok(clientProfile.includes('/caja.html?client='), 'Ficha de cliente debe enlazar a Caja para ventas y pagos');
});
