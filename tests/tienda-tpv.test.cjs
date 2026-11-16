const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('Tienda TPV: la página HTML tiene la estructura correcta para venta física y cuadre', () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');

  // Menú y shell
  assert.ok(html.includes('data-app-menu'), 'Debe incluir aside data-app-menu');
  assert.ok(html.includes('class="breadcrumb"'), 'Debe incluir breadcrumb');
  assert.ok(html.includes('Tienda TPV'), 'Debe incluir Tienda TPV en breadcrumb');
  assert.ok(html.includes('href="/tienda.css"'), 'Debe vincular tienda.css');
  assert.ok(html.includes('src="/tienda.js"'), 'Debe vincular tienda.js');

  // Estado de caja en directo
  assert.ok(html.includes('id="cash-status-pill"'), 'Debe tener indicador de estado de caja');
  assert.ok(html.includes('id="btn-quick-open-cash"'), 'Debe tener botón de apertura rápida de caja');

  // Pestañas principales
  assert.ok(html.includes('id="tab-pos"'), 'Debe tener pestaña de Mostrador de venta');
  assert.ok(html.includes('id="tab-dispatched"'), 'Debe tener pestaña de Salidas de hoy');
  assert.ok(html.includes('id="tab-balance"'), 'Debe tener pestaña de Cuadre con caja');

  // Catálogo y buscador
  assert.ok(html.includes('id="product-search"'), 'Debe tener buscador de productos');
  assert.ok(html.includes('id="category-pills"'), 'Debe tener selector de categorías');
  assert.ok(html.includes('id="products-grid"'), 'Debe tener contenedor de productos visuales');

  // Ticket y cobro
  assert.ok(html.includes('id="buyer-opt-walkin"'), 'Debe permitir venta a persona de paso');
  assert.ok(html.includes('id="buyer-opt-client"'), 'Debe permitir venta a cliente registrado');
  assert.ok(html.includes('id="ticket-items"'), 'Debe tener lista de artículos en ticket');
  assert.ok(html.includes('id="ticket-total-price"'), 'Debe mostrar el total a pagar');
  assert.ok(html.includes('id="pay-btn-cash"'), 'Debe tener botón de Efectivo');
  assert.ok(html.includes('id="pay-btn-card"'), 'Debe tener botón de Tarjeta');
  assert.ok(html.includes('id="pay-btn-bizum"'), 'Debe tener botón de Bizum');
  assert.ok(html.includes('id="cash-calc-wrap"'), 'Debe tener calculadora de cambio para efectivo');
  assert.ok(html.includes('id="cash-tendered"'), 'Debe tener campo para efectivo entregado');
  assert.ok(html.includes('id="change-display"'), 'Debe tener visualización del cambio');
  assert.ok(html.includes('id="btn-confirm-sale"'), 'Debe tener botón para confirmar la venta');

  // Salidas de hoy ("apuntar lo que sale")
  assert.ok(html.includes('id="panel-dispatched"'), 'Debe tener panel de salidas de hoy');
  assert.ok(html.includes('id="dispatched-products-tbody"'), 'Debe tener tabla de resumen de productos salidos');
  assert.ok(html.includes('id="dispatched-tickets-tbody"'), 'Debe tener tabla de tickets del día');

  // Cuadre con caja ("calcularlo despues con lo de la caja")
  assert.ok(html.includes('id="panel-balance"'), 'Debe tener panel de cuadre con caja');
  assert.ok(html.includes('id="balance-cash-sales"'), 'Debe tener total cobrado en efectivo');
  assert.ok(html.includes('id="balance-expected-cash"'), 'Debe mostrar el efectivo esperado en el cajón');
  assert.ok(html.includes('id="recount-input"'), 'Debe permitir ingresar el efectivo contado físicamente');
  assert.ok(html.includes('id="btn-calc-difference"'), 'Debe calcular la diferencia de arqueo');
  assert.ok(html.includes('id="btn-close-cash-from-tpv"'), 'Debe permitir cerrar la caja con el arqueo');

  // Diálogo de comprobante / ticket
  assert.ok(html.includes('id="receipt-dialog"'), 'Debe tener diálogo para imprimir/ver ticket');
  assert.ok(html.includes('id="open-cash-dialog"'), 'Debe tener diálogo para abrir caja');

  // Sección y diálogo de reposición ("poner desde recepcion que falta para pedirlo")
  assert.ok(html.includes('id="btn-quick-restock"'), 'Debe tener botón de acceso rápido para anotar lo que falta');
  assert.ok(html.includes('id="tab-restock"'), 'Debe tener pestaña de Falta para pedir');
  assert.ok(html.includes('id="badge-restock-count"'), 'Debe mostrar el contador de productos que faltan');
  assert.ok(html.includes('id="panel-restock"'), 'Debe tener panel de productos que faltan para pedir');
  assert.ok(html.includes('id="btn-catalog-restock"'), 'Debe permitir anotar falta desde la barra del catálogo');
  assert.ok(html.includes('id="restock-requests-tbody"'), 'Debe tener tabla para listar lo que falta');
  assert.ok(html.includes('id="restock-dialog"'), 'Debe tener diálogo para anotar lo que falta para pedir');
  assert.ok(html.includes('id="restock-product-select"'), 'Debe permitir seleccionar producto del catálogo o externo');
  assert.ok(html.includes('id="restock-quantity"'), 'Debe permitir especificar la cantidad a pedir');
  assert.ok(html.includes('id="btn-submit-restock"'), 'Debe tener botón para guardar el aviso para pedir');
});

test('Tienda TPV: asset-catalog y menu incluyen las rutas de la tienda', () => {
  const catalog = fs.readFileSync('src/http/asset-catalog.ts', 'utf8');
  assert.ok(catalog.includes('"/tienda.html"'), 'asset-catalog debe incluir /tienda.html');
  assert.ok(catalog.includes('"/tienda"'), 'asset-catalog debe incluir /tienda');
  assert.ok(catalog.includes('"/tienda.js"'), 'asset-catalog debe incluir /tienda.js');
  assert.ok(catalog.includes('"/tienda.css"'), 'asset-catalog debe incluir /tienda.css');

  const menu = fs.readFileSync('web/shared/menu.js', 'utf8');
  assert.ok(menu.includes("['Tienda TPV','bag','/tienda.html']"), 'El menú debe incluir Tienda TPV');
  assert.ok(menu.includes("['Ventas y caja',['Tienda TPV','Productos','Caja']]"), 'El grupo de ventas y caja debe incluir Tienda TPV y Caja sin Ventas y cobros duplicado');
});

test('Tienda TPV: simulación de ticket, cálculo de cambio y arqueo con caja', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  // Mock de datos de backend
  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', description: 'Bebida fría', unitPrice: 1.50, stock: 20, isActive: true },
    { id: 'p2', name: 'Barrita de proteínas chocolate', description: 'Snack nutricional', unitPrice: 2.50, stock: 15, isActive: true },
    { id: 'p3', name: 'Batido Whey Vainilla', description: 'Suplemento proteico', unitPrice: 3.50, stock: 0, isActive: true } // Agotado
  ];
  const mockSession = {
    id: 'sess-1',
    businessDate: '2026-11-06',
    openedAt: '2026-11-06T08:00:00Z',
    openedByName: 'Admin',
    openingAmount: 100.00,
    closedAt: null,
    revision: 1,
    summary: {
      soldTotal: 40.00,
      returnsTotal: 0,
      netSales: 40.00,
      collections: { EFECTIVO: 25.00, TARJETA: 15.00, BIZUM: 0 },
      cashIn: 0,
      cashOut: 0,
      refunds: { EFECTIVO: 0 },
      expectedCash: 125.00, // 100 inicial + 25 en efectivo
      sales: [
        {
          id: 'sale-1',
          at: '2026-11-06T09:30:00Z',
          client: 'Persona de paso',
          amount: 25.00,
          status: 'COMPLETADA',
          products: [
            { name: 'Agua mineral 500ml', quantity: 10, unitPrice: 1.50 },
            { name: 'Barrita de proteínas chocolate', quantity: 4, unitPrice: 2.50 }
          ]
        }
      ]
    }
  };

  w.fetch = async (url) => {
    if (url === '/api/me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION' }) };
    if (url === '/api/inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (url === '/api/manage') return { ok: true, json: async () => ({ clients: [{ id: 'c1', firstName: 'Juan', lastName: 'García', email: 'juan@test.com', phone: '600112233' }] }) };
    if (url === '/api/cash/current') return { ok: true, json: async () => ({ session: mockSession, unassignedPayments: 0 }) };
    return { ok: true, json: async () => ({}) };
  };

  // Ejecutamos el script del TPV
  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);

  // Esperar a que se completen las promesas iniciales
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // 1. Verificar estado de caja
  assert.ok(doc.getElementById('cash-status-text').textContent.includes('Caja abierta'));

  // 2. Catálogo renderizado
  const cards = doc.querySelectorAll('.tpv-product-card');
  assert.equal(cards.length, 3, 'Deben renderizarse 3 tarjetas de producto');
  assert.ok(cards[2].classList.contains('out-of-stock'), 'El producto con stock 0 debe tener la clase out-of-stock');

  // 3. Añadir producto al ticket (clic en Agua mineral p1, 1.50 €)
  cards[0].click();
  assert.equal(doc.getElementById('ticket-count').textContent, '(1)');
  assert.ok(doc.getElementById('ticket-total-price').textContent.includes('1,50'));

  // Añadir Barrita p2 (2.50 €)
  cards[1].click();
  assert.equal(doc.getElementById('ticket-count').textContent, '(2)');
  assert.ok(doc.getElementById('ticket-total-price').textContent.includes('4,00'));

  // 4. Calculadora de cambio para efectivo
  const tenderedInput = doc.getElementById('cash-tendered');
  tenderedInput.value = '10';
  tenderedInput.dispatchEvent(new w.Event('input'));

  const changeDisplay = doc.getElementById('change-display');
  assert.equal(changeDisplay.hidden, false, 'El display de cambio debe ser visible');
  assert.ok(changeDisplay.textContent.includes('6,00'), 'El cambio de 10 € para un total de 4 € debe ser 6,00 €');

  // Si entrega menos de lo debido (ej. 3 €)
  tenderedInput.value = '3';
  tenderedInput.dispatchEvent(new w.Event('input'));
  assert.ok(changeDisplay.textContent.includes('1,00'), 'Debe indicar que falta 1,00 €');
  assert.equal(doc.getElementById('btn-confirm-sale').disabled, true, 'El botón debe deshabilitarse si falta dinero');

  // 5. Comprobación de arqueo de caja ("calcularlo después con lo de la caja")
  // Abrimos panel de arqueo
  doc.getElementById('tab-balance').click();
  assert.ok(doc.getElementById('balance-cash-sales').textContent.includes('25,00'), 'Ventas en efectivo deben ser 25 €');
  assert.ok(doc.getElementById('balance-expected-cash').textContent.includes('125,00'), 'Efectivo esperado debe ser 125 € (100 inicial + 25 cobrado)');

  // Simular recuento exacto: 125 €
  const recountInput = doc.getElementById('recount-input');
  recountInput.value = '125';
  doc.getElementById('btn-calc-difference').click();

  const diffBox = doc.getElementById('recount-diff-box');
  assert.equal(diffBox.hidden, false);
  assert.ok(diffBox.textContent.includes('cuadra perfectamente'), 'Con 125 € contados debe indicar cuadre perfecto');

  // Simular recuento con falta: 120 €
  recountInput.value = '120';
  doc.getElementById('btn-calc-difference').click();
  assert.ok(diffBox.textContent.includes('Falta dinero'), 'Con 120 € debe avisar que faltan 5 €');

  // 6. Comprobación de salidas de hoy ("apuntar lo que sale")
  doc.getElementById('tab-dispatched').click();
  assert.ok(doc.getElementById('badge-dispatched-units').textContent.includes('14'), 'Total de 14 unidades salidas (10 agua + 4 barrita)');
  assert.ok(doc.getElementById('dispatched-products-tbody').textContent.includes('Agua mineral'));
  assert.ok(doc.getElementById('dispatched-products-tbody').textContent.includes('10 uds'));

  dom.window.close();
});

test('Tienda TPV: numeración correlativa por centro, formato estrecho para impresora térmica y política legal en el ticket', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const css = fs.readFileSync('web/inventory/tienda.css', 'utf8');

  // 1. Verificación en HTML de elementos de ticket térmico y política legal
  assert.ok(html.includes('id="printable-receipt"'), 'Debe existir contenedor del ticket para impresora');
  assert.ok(html.includes('id="receipt-ticket-number"'), 'Debe existir campo para el número correlativo de ticket');
  assert.ok(html.includes('id="receipt-legal-policy"'), 'Debe existir sección de política legal al pie del ticket');
  assert.ok(html.includes('No se devuelve el dinero'), 'Debe indicar que no se devuelve el dinero');
  assert.ok(html.includes('15 días'), 'Debe indicar plazo máximo de 15 días para cambios');
  assert.ok(html.includes('alimentación') && html.includes('suplementación'), 'Debe mencionar alimentación y suplementación');
  assert.ok(html.includes('abiertos'), 'Debe indicar que no admiten cambio si están abiertos');

  // 2. Verificación de CSS de formato estrecho y reglas de impresión térmica (80mm)
  assert.ok(css.includes('80mm'), 'Debe incluir tamaño de rollo térmico de 80mm');
  assert.ok(css.includes('@media print'), 'Debe incluir estilos para impresión');
  assert.ok(css.includes('#printable-receipt'), 'Debe aplicar formato a #printable-receipt en impresión');

  // 3. Verificación de backend: series correlativas independientes por centro
  const { getGymSeriesFromKey, getGymSeriesPrefix, saleBalance } = require('../dist/finance/inventory');

  // Pruebas de asignación de series por sede
  assert.equal(getGymSeriesFromKey('centro-1'), '001');
  assert.equal(getGymSeriesFromKey('centro-2'), '002');
  assert.equal(getGymSeriesFromKey('sede-3'), '003');
  assert.equal(getGymSeriesFromKey('005'), '005');

  const mockTx = {
    gym: {
      findMany: async () => [
        { id: 'gym-bizkaia', name: 'Trainers Point Bizkaia' },
        { id: 'gym-madrid', name: 'Trainers Point Madrid' },
        { id: 'gym-valencia', name: 'Trainers Point Valencia' }
      ]
    }
  };

  const serie1 = await getGymSeriesPrefix(mockTx, 'gym-bizkaia');
  const serie2 = await getGymSeriesPrefix(mockTx, 'gym-madrid');
  const serie3 = await getGymSeriesPrefix(mockTx, 'gym-valencia');

  assert.equal(serie1, '001', 'Centro 1 debe empezar en serie 001');
  assert.equal(serie2, '002', 'Centro 2 debe empezar en serie 002');
  assert.equal(serie3, '003', 'Centro 3 debe empezar en serie 003');

  // Prueba de saleBalance con invoice vinculado
  const balanced = saleBalance({
    id: 'sale-1',
    gymKey: 'gym-bizkaia',
    totalAmount: 12.50,
    status: 'COMPLETADA',
    lines: [{ unitPrice: 12.50, quantity: 1 }],
    payments: [{ status: 'PAGADO', amount: 12.50 }],
    invoice: { series: '001', number: '000042' }
  });

  assert.equal(balanced.ticketNumber, '001-000042');
  assert.equal(balanced.series, '001');
  assert.equal(balanced.invoiceNumber, '000042');

  // 4. Prueba en JSDOM del diálogo de ticket térmico
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true }
  ];

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: [] }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          id: 'sale-term-1',
          ticketNumber: '001-000001',
          series: '001',
          invoiceNumber: '000001',
          status: 'COMPLETADA',
          totalAmount: 1.50,
          subtotal: 1.24,
          taxAmount: 0.26,
          paymentMethod: 'EFECTIVO',
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 1.50, description: 'Agua mineral 500ml', lineTotal: 1.50 }]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Añadir agua y confirmar venta
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que el diálogo de ticket se abre y muestra la serie y política legal
  const receiptDialog = doc.getElementById('receipt-dialog');
  assert.equal(receiptDialog.open, true, 'El modal de comprobante debe abrirse tras completar la venta');
  assert.equal(doc.getElementById('receipt-ticket-number').textContent, '001-000001', 'Debe mostrar el número de ticket correlativo 001-000001');
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('No se devuelve el dinero'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('15 días'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('suplementación'));

  dom.window.close();
});

test('Tienda TPV: desde recepción se puede registrar, listar y gestionar lo que falta para pedir', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  // Dialog mocks
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', description: 'Bebida fría', unitPrice: 1.50, stock: 20, isActive: true },
    { id: 'p2', name: 'Batido Whey Vainilla', description: 'Suplemento proteico', unitPrice: 3.50, stock: 0, isActive: true }, // Agotado
    { id: 'p3', name: 'Toalla microfibra azul', description: 'Accesorio entrenamiento', unitPrice: 12.00, stock: 0, isActive: false } // Producto que ha existido (descatalogado)
  ];

  let restockList = [
    {
      id: 'restock-1',
      productId: 'p2',
      productName: 'Batido Whey Vainilla',
      quantity: 12,
      status: 'PENDIENTE',
      notes: 'Agotado en mostrador, clientes preguntan',
      requestedBy: 'usr-1',
      requestedByName: 'Recepcionista Turno Mañana',
      createdAt: '2026-11-09T09:00:00Z',
      product: { id: 'p2', name: 'Batido Whey Vainilla', stock: 0, unitPrice: 3.50, isActive: true }
    }
  ];

  let lastCreatedPayload = null;
  let lastUpdatedStatus = null;

  w.fetch = async (url, opts = {}) => {
    if (url === '/api/me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION' }) };
    if (url === '/api/inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (url === '/api/manage') return { ok: true, json: async () => ({ clients: [] }) };
    if (url === '/api/cash/current') return { ok: true, json: async () => ({ session: null }) };
    if (url === '/api/inventory/restock' && (!opts.method || opts.method === 'GET')) {
      return { ok: true, json: async () => ({ requests: restockList }) };
    }
    if (url === '/api/inventory/restock' && opts.method === 'POST') {
      lastCreatedPayload = JSON.parse(opts.body);
      const newReq = {
        id: 'restock-2',
        productId: lastCreatedPayload.productId,
        productName: lastCreatedPayload.productName,
        quantity: lastCreatedPayload.quantity,
        status: 'PENDIENTE',
        notes: lastCreatedPayload.notes,
        requestedBy: 'usr-1',
        requestedByName: 'Recepcionista',
        createdAt: new Date().toISOString(),
        product: mockProducts.find(p => p.id === lastCreatedPayload.productId) || null
      };
      restockList.push(newReq);
      return { ok: true, json: async () => newReq };
    }
    if (url.startsWith('/api/inventory/restock/') && opts.method === 'PATCH') {
      const id = url.split('/').pop();
      const body = JSON.parse(opts.body);
      lastUpdatedStatus = body.status;
      const target = restockList.find(r => r.id === id);
      if (target) {
        target.status = body.status;
        if (body.addToStock && target.productId) {
          const p = mockProducts.find(prod => prod.id === target.productId);
          if (p) p.stock += target.quantity;
        }
      }
      return { ok: true, json: async () => target };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);

  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // 1. Contador y badges iniciales
  assert.equal(doc.getElementById('badge-restock-count').textContent, '1', 'Debe marcar 1 producto pendiente de pedir');
  assert.equal(doc.getElementById('kpi-restock-pending').textContent, '1');

  // 2. El producto p2 (Batido Whey) que ya tiene solicitud pendiente muestra la etiqueta "📋 Falta (12 uds)"
  const cards = doc.querySelectorAll('.tpv-product-card');
  assert.ok(cards[1].innerHTML.includes('Falta (12 uds)'), 'Debe mostrar en la tarjeta que ya está anotado que falta');

  // 3. El producto p1 (Agua mineral) aún no está pedido -> debe tener el botón "⚠️ Falta para pedir"
  const restockBtnP1 = cards[0].querySelector('.tpv-card-restock-btn');
  assert.ok(restockBtnP1, 'Debe haber botón para anotar que falta el producto');

  // Al pulsar "⚠️ Falta para pedir" en Agua mineral:
  restockBtnP1.click();
  const select = doc.getElementById('restock-product-select');
  assert.equal(select.value, 'p1', 'El modal debe abrirse con el producto p1 preseleccionado');

  // Simular anotar 24 botellas de agua que faltan
  doc.getElementById('restock-quantity').value = '24';
  doc.getElementById('restock-notes').value = 'Pedir para reponer la nevera del mostrador';
  doc.getElementById('restock-form').requestSubmit();

  await new Promise(r => setTimeout(r, 60));

  assert.equal(lastCreatedPayload.productId, 'p1');
  assert.equal(lastCreatedPayload.productName, 'Agua mineral 500ml');
  assert.equal(lastCreatedPayload.quantity, 24);
  assert.ok(lastCreatedPayload.notes.includes('nevera'));
  assert.equal(doc.getElementById('badge-restock-count').textContent, '2', 'El contador debe subir a 2');

  // 4. Cambiar a la pestaña de Falta para pedir
  doc.getElementById('tab-restock').click();
  assert.equal(doc.getElementById('panel-restock').hidden, false, 'El panel de reposición debe ser visible');

  const rows = doc.querySelectorAll('#restock-requests-tbody tr');
  assert.equal(rows.length, 2, 'Debe mostrar 2 filas de productos que faltan');

  // 5. Marcar como pedido al proveedor
  const orderBtn = doc.querySelector('.btn-mark-ordered');
  assert.ok(orderBtn, 'Debe haber botón para marcar pedido');
  orderBtn.click();

  await new Promise(r => setTimeout(r, 60));
  assert.equal(lastUpdatedStatus, 'PEDIDO', 'El estado debe haber cambiado a PEDIDO');

  // 6. Marcar como recibido y comprobar actualización
  const receivedBtn = doc.querySelector('.btn-mark-received');
  assert.ok(receivedBtn, 'Debe haber botón para marcar como recibido');
  receivedBtn.click();

  await new Promise(r => setTimeout(r, 60));
  assert.equal(lastUpdatedStatus, 'RECIBIDO', 'El estado debe haber cambiado a RECIBIDO');

  // 7. Comprobar opción de productos que ya existen o han existido
  // Volvemos a mostrador de venta
  doc.getElementById('tab-pos').click();

  // Abrir modal de reposición desde la cabecera
  doc.getElementById('btn-quick-restock').click();
  const restockSelect = doc.getElementById('restock-product-select');
  assert.ok(restockSelect.innerHTML.includes('Productos que ya existen en tienda'), 'Debe incluir grupo de productos que ya existen');
  assert.ok(restockSelect.innerHTML.includes('Productos que han existido'), 'Debe incluir grupo de productos que han existido');
  assert.ok(restockSelect.innerHTML.includes('Toalla microfibra azul'), 'Debe permitir seleccionar el producto que ha existido (p3)');

  // Filtrar origen: pulsar píldora "📦 Que han existido"
  const inactivePill = doc.querySelector('#restock-source-pills [data-source="inactive"]');
  assert.ok(inactivePill, 'Debe tener píldora para filtrar productos que han existido');
  inactivePill.click();
  assert.ok(restockSelect.innerHTML.includes('Toalla microfibra azul'));
  assert.ok(!restockSelect.innerHTML.includes('Agua mineral 500ml'), 'Al filtrar por anteriores no debe listar los activos');

  // Seleccionar producto que ha existido (p3)
  restockSelect.value = 'p3';
  restockSelect.dispatchEvent(new w.Event('change'));
  assert.equal(doc.getElementById('restock-inactive-notice').style.display, 'block', 'Debe mostrar aviso de que es un producto que existió anteriormente');

  // Comprobar también el filtro del catálogo "📦 Han existido (Anteriores)"
  doc.querySelector('[data-close="restock-dialog"]').click();
  const catAnteriores = doc.querySelector('#category-pills [data-cat="anteriores"]');
  assert.ok(catAnteriores, 'El catálogo debe tener píldora para ver productos que han existido');
  catAnteriores.click();

  const anteriorCards = doc.querySelectorAll('.tpv-product-card');
  assert.equal(anteriorCards.length, 1, 'Debe listar el producto que ha existido en la tienda');
  assert.ok(anteriorCards[0].textContent.includes('Toalla microfibra azul'));
  assert.ok(anteriorCards[0].textContent.includes('Descatalogado'));
  assert.ok(anteriorCards[0].textContent.includes('Volver a pedir'));

  dom.window.close();
});

test('Tienda TPV: numeración correlativa por centro, formato estrecho para impresora térmica y política legal en el ticket', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const css = fs.readFileSync('web/inventory/tienda.css', 'utf8');

  // 1. Verificación en HTML de elementos de ticket térmico y política legal
  assert.ok(html.includes('id="printable-receipt"'), 'Debe existir contenedor del ticket para impresora');
  assert.ok(html.includes('id="receipt-ticket-number"'), 'Debe existir campo para el número correlativo de ticket');
  assert.ok(html.includes('id="receipt-legal-policy"'), 'Debe existir sección de política legal al pie del ticket');
  assert.ok(html.includes('No se devuelve el dinero'), 'Debe indicar que no se devuelve el dinero');
  assert.ok(html.includes('15 días'), 'Debe indicar plazo máximo de 15 días para cambios');
  assert.ok(html.includes('alimentación') && html.includes('suplementación'), 'Debe mencionar alimentación y suplementación');
  assert.ok(html.includes('abiertos'), 'Debe indicar que no admiten cambio si están abiertos');

  // 2. Verificación de CSS de formato estrecho y reglas de impresión térmica (80mm)
  assert.ok(css.includes('80mm'), 'Debe incluir tamaño de rollo térmico de 80mm');
  assert.ok(css.includes('@media print'), 'Debe incluir estilos para impresión');
  assert.ok(css.includes('#printable-receipt'), 'Debe aplicar formato a #printable-receipt en impresión');

  // 3. Verificación de backend: series correlativas independientes por centro
  const { getGymSeriesFromKey, getGymSeriesPrefix, saleBalance } = require('../dist/finance/inventory');

  // Pruebas de asignación de series por sede
  assert.equal(getGymSeriesFromKey('centro-1'), '001');
  assert.equal(getGymSeriesFromKey('centro-2'), '002');
  assert.equal(getGymSeriesFromKey('sede-3'), '003');
  assert.equal(getGymSeriesFromKey('005'), '005');

  const mockTx = {
    gym: {
      findMany: async () => [
        { id: 'gym-bizkaia', name: 'Trainers Point Bizkaia' },
        { id: 'gym-madrid', name: 'Trainers Point Madrid' },
        { id: 'gym-valencia', name: 'Trainers Point Valencia' }
      ]
    }
  };

  const serie1 = await getGymSeriesPrefix(mockTx, 'gym-bizkaia');
  const serie2 = await getGymSeriesPrefix(mockTx, 'gym-madrid');
  const serie3 = await getGymSeriesPrefix(mockTx, 'gym-valencia');

  assert.equal(serie1, '001', 'Centro 1 debe empezar en serie 001');
  assert.equal(serie2, '002', 'Centro 2 debe empezar en serie 002');
  assert.equal(serie3, '003', 'Centro 3 debe empezar en serie 003');

  // Prueba de saleBalance con invoice vinculado
  const balanced = saleBalance({
    id: 'sale-1',
    gymKey: 'gym-bizkaia',
    totalAmount: 12.50,
    status: 'COMPLETADA',
    lines: [{ unitPrice: 12.50, quantity: 1 }],
    payments: [{ status: 'PAGADO', amount: 12.50 }],
    invoice: { series: '001', number: '000042' }
  });

  assert.equal(balanced.ticketNumber, '001-000042');
  assert.equal(balanced.series, '001');
  assert.equal(balanced.invoiceNumber, '000042');

  // 4. Prueba en JSDOM del diálogo de ticket térmico
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true }
  ];

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: [] }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          id: 'sale-term-1',
          ticketNumber: '001-000001',
          series: '001',
          invoiceNumber: '000001',
          status: 'COMPLETADA',
          totalAmount: 1.50,
          subtotal: 1.24,
          taxAmount: 0.26,
          paymentMethod: 'EFECTIVO',
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 1.50, description: 'Agua mineral 500ml', lineTotal: 1.50 }]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Añadir agua y confirmar venta
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que el diálogo de ticket se abre y muestra la serie y política legal
  const receiptDialog = doc.getElementById('receipt-dialog');
  assert.equal(receiptDialog.open, true, 'El modal de comprobante debe abrirse tras completar la venta');
  assert.equal(doc.getElementById('receipt-ticket-number').textContent, '001-000001', 'Debe mostrar el número de ticket correlativo 001-000001');
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('No se devuelve el dinero'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('15 días'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('suplementación'));

  dom.window.close();
});

test('Tienda TPV: compatibilidad con pistola lectora de códigos de barras y gestión de cambio de EAN', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');

  // 1. Verificación estática de elementos HTML del lector y gestión EAN
  assert.ok(html.includes('id="btn-barcode-mode"'), 'Debe tener botón de lector EAN en toolbar');
  assert.ok(html.includes('id="ean-manager-dialog"'), 'Debe tener diálogo para gestionar EAN');
  assert.ok(html.includes('id="ean-scanned-code-display"'), 'Debe mostrar el código escaneado');
  assert.ok(html.includes('id="ean-product-select"'), 'Debe permitir seleccionar producto para reasignar');
  assert.ok(html.includes('id="barcode-manual-dialog"'), 'Debe tener diálogo manual de lector');

  // 2. Simulación JSDOM
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  // Mock API
  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', barcode: '8412345678901', unitPrice: 1.50, stock: 10, isActive: true },
    { id: 'p2', name: 'Barrita Proteína', barcode: '8412345678902', unitPrice: 2.50, stock: 5, isActive: true },
    { id: 'p3', name: 'Creatina Monohidrato', barcode: '8412345678903', unitPrice: 18.00, stock: 0, isActive: true } // Agotado
  ];

  let patchedBarcode = null;
  let patchedProductId = null;

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') {
      return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    }
    if (path === 'inventory/products') {
      return { ok: true, json: async () => ({ products: mockProducts }) };
    }
    if (path === 'manage') {
      return { ok: true, json: async () => ({ clients: [] }) };
    }
    if (path === 'inventory/restock') {
      return { ok: true, json: async () => ({ requests: [] }) };
    }
    if (path === 'cash/current') {
      return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    }
    const barcodeMatch = path.match(/^inventory\/products\/([^\/]+)\/barcode$/);
    if (barcodeMatch && opts.method === 'PATCH') {
      patchedProductId = barcodeMatch[1];
      const body = JSON.parse(opts.body);
      patchedBarcode = body.barcode;
      const target = mockProducts.find(p => p.id === patchedProductId);
      if (target) target.barcode = patchedBarcode;
      return { ok: true, json: async () => ({ product: target }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  // Mock dialog methods
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };

  // Cargar tienda.js
  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);

  await new Promise(r => setTimeout(r, 60));
  const doc = w.document;

  // 3. Simular disparo de pistola lectora con código conocido (p1: 8412345678901)
  const codeP1 = '8412345678901';
  for (const char of codeP1) {
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: char, bubbles: true }));
  }
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  await new Promise(r => setTimeout(r, 60));

  // Comprobar que p1 se añadió al ticket de venta
  const ticketItems = doc.querySelectorAll('.tpv-item-row');
  assert.equal(ticketItems.length, 1, 'Debe haber 1 producto en ticket tras el escaneo');
  assert.ok(ticketItems[0].textContent.includes('Agua mineral 500ml'));
  assert.ok(doc.getElementById('ticket-count').textContent.includes('1'));

  // 4. Simular lectura con lector de un código que cambia (EAN nuevo desconocido: 8499999999999)
  const newEan = '8499999999999';
  for (const char of newEan) {
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: char, bubbles: true }));
  }
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  await new Promise(r => setTimeout(r, 60));

  // Debe abrirse el diálogo de gestión EAN
  const eanDialog = doc.getElementById('ean-manager-dialog');
  assert.equal(eanDialog.open, true, 'El diálogo de gestión EAN debe abrirse');
  assert.equal(doc.getElementById('ean-scanned-code-display').textContent, newEan);

  // Seleccionar producto p2 (Barrita Proteína) para asignarle el nuevo EAN
  const eanSelect = doc.getElementById('ean-product-select');
  eanSelect.value = 'p2';
  eanSelect.dispatchEvent(new w.Event('change'));

  // Comprobar previsualización del producto
  assert.equal(doc.getElementById('ean-product-preview').hidden, false);
  assert.equal(doc.getElementById('ean-preview-name').textContent, 'Barrita Proteína');

  // Enviar formulario para reasignar nuevo EAN a p2
  const eanForm = doc.getElementById('ean-manager-form');
  eanForm.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));

  await new Promise(r => setTimeout(r, 80));

  // Verificar llamada al backend
  assert.equal(patchedProductId, 'p2');
  assert.equal(patchedBarcode, newEan);
  assert.equal(eanDialog.open, false, 'El diálogo debe cerrarse tras guardar');

  // Al tener marcado "Añadir 1 unidad al ticket", debe haberse añadido p2 al ticket
  const ticketItemsAfter = doc.querySelectorAll('.tpv-item-row');
  assert.equal(ticketItemsAfter.length, 2, 'Deben haber 2 productos en ticket tras reasignar y añadir');

  // 5. Ahora escanear nuevamente el nuevo EAN debe encontrar directamente a p2
  for (const char of newEan) {
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: char, bubbles: true }));
  }
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  await new Promise(r => setTimeout(r, 60));
  assert.ok(doc.getElementById('ticket-count').textContent.includes('3'), 'Debe haberse sumado otra unidad de p2 con el nuevo EAN');

  dom.window.close();
});

test('Tienda TPV: numeración correlativa por centro, formato estrecho para impresora térmica y política legal en el ticket', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const css = fs.readFileSync('web/inventory/tienda.css', 'utf8');

  // 1. Verificación en HTML de elementos de ticket térmico y política legal
  assert.ok(html.includes('id="printable-receipt"'), 'Debe existir contenedor del ticket para impresora');
  assert.ok(html.includes('id="receipt-ticket-number"'), 'Debe existir campo para el número correlativo de ticket');
  assert.ok(html.includes('id="receipt-legal-policy"'), 'Debe existir sección de política legal al pie del ticket');
  assert.ok(html.includes('No se devuelve el dinero'), 'Debe indicar que no se devuelve el dinero');
  assert.ok(html.includes('15 días'), 'Debe indicar plazo máximo de 15 días para cambios');
  assert.ok(html.includes('alimentación') && html.includes('suplementación'), 'Debe mencionar alimentación y suplementación');
  assert.ok(html.includes('abiertos'), 'Debe indicar que no admiten cambio si están abiertos');

  // 2. Verificación de CSS de formato estrecho y reglas de impresión térmica (80mm)
  assert.ok(css.includes('80mm'), 'Debe incluir tamaño de rollo térmico de 80mm');
  assert.ok(css.includes('@media print'), 'Debe incluir estilos para impresión');
  assert.ok(css.includes('#printable-receipt'), 'Debe aplicar formato a #printable-receipt en impresión');

  // 3. Verificación de backend: series correlativas independientes por centro
  const { getGymSeriesFromKey, getGymSeriesPrefix, saleBalance } = require('../dist/finance/inventory');

  // Pruebas de asignación de series por sede
  assert.equal(getGymSeriesFromKey('centro-1'), '001');
  assert.equal(getGymSeriesFromKey('centro-2'), '002');
  assert.equal(getGymSeriesFromKey('sede-3'), '003');
  assert.equal(getGymSeriesFromKey('005'), '005');

  const mockTx = {
    gym: {
      findMany: async () => [
        { id: 'gym-bizkaia', name: 'Trainers Point Bizkaia' },
        { id: 'gym-madrid', name: 'Trainers Point Madrid' },
        { id: 'gym-valencia', name: 'Trainers Point Valencia' }
      ]
    }
  };

  const serie1 = await getGymSeriesPrefix(mockTx, 'gym-bizkaia');
  const serie2 = await getGymSeriesPrefix(mockTx, 'gym-madrid');
  const serie3 = await getGymSeriesPrefix(mockTx, 'gym-valencia');

  assert.equal(serie1, '001', 'Centro 1 debe empezar en serie 001');
  assert.equal(serie2, '002', 'Centro 2 debe empezar en serie 002');
  assert.equal(serie3, '003', 'Centro 3 debe empezar en serie 003');

  // Prueba de saleBalance con invoice vinculado
  const balanced = saleBalance({
    id: 'sale-1',
    gymKey: 'gym-bizkaia',
    totalAmount: 12.50,
    status: 'COMPLETADA',
    lines: [{ unitPrice: 12.50, quantity: 1 }],
    payments: [{ status: 'PAGADO', amount: 12.50 }],
    invoice: { series: '001', number: '000042' }
  });

  assert.equal(balanced.ticketNumber, '001-000042');
  assert.equal(balanced.series, '001');
  assert.equal(balanced.invoiceNumber, '000042');

  // 4. Prueba en JSDOM del diálogo de ticket térmico
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true }
  ];

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: [] }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          id: 'sale-term-1',
          ticketNumber: '001-000001',
          series: '001',
          invoiceNumber: '000001',
          status: 'COMPLETADA',
          totalAmount: 1.50,
          subtotal: 1.24,
          taxAmount: 0.26,
          paymentMethod: 'EFECTIVO',
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 1.50, description: 'Agua mineral 500ml', lineTotal: 1.50 }]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Añadir agua y confirmar venta
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que el diálogo de ticket se abre y muestra la serie y política legal
  const receiptDialog = doc.getElementById('receipt-dialog');
  assert.equal(receiptDialog.open, true, 'El modal de comprobante debe abrirse tras completar la venta');
  assert.equal(doc.getElementById('receipt-ticket-number').textContent, '001-000001', 'Debe mostrar el número de ticket correlativo 001-000001');
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('No se devuelve el dinero'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('15 días'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('suplementación'));

  dom.window.close();
});

test('Tienda TPV & Ficha: cobro cruzado de bono con productos de la tienda', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');

  // 1. Verificación estática HTML
  assert.ok(html.includes('id="btn-tpv-add-bono"'), 'Debe tener botón para añadir bono en TPV');
  assert.ok(html.includes('id="tpv-bono-dialog"'), 'Debe tener diálogo modal de bono');
  assert.ok(html.includes('id="tpv-bono-service-select"'), 'Debe tener selector de servicio/bono');

  const profileHtml = fs.readFileSync('web/clients/client-profile.html', 'utf8');
  assert.ok(profileHtml.includes('id="bono-product-select"'), 'Ficha cliente debe tener selector de productos de tienda en bono');
  assert.ok(profileHtml.includes('id="btn-bono-add-product"'), 'Ficha cliente debe tener botón de añadir producto a bono');

  // 2. Simulación JSDOM en TPV
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true },
    { id: 'p2', name: 'Barrita Proteína', unitPrice: 2.50, stock: 10, isActive: true }
  ];
  const mockClients = [{ id: 'cl-1', firstName: 'Elena', lastName: 'Navarro', name: 'Elena Navarro' }];
  const mockServices = [
    { id: 'srv-1', name: 'Bono 10 Sesiones PT', type: 'PACK', sessionsBought: 10, price: 250.00 }
  ];

  let bonoPurchasedBody = null;
  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') {
      return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    }
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: mockClients }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: mockServices }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path.startsWith('clients/cl-1/service-packages') && opts.method === 'POST') {
      bonoPurchasedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          servicePackage: {
            id: 'pkg-1',
            saleId: 'sale-combo-1',
            serviceId: bonoPurchasedBody.serviceId,
            sessionsBought: bonoPurchasedBody.sessionsBought,
            totalAmount: bonoPurchasedBody.totalAmount
          }
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Seleccionar cliente registrado
  doc.getElementById('buyer-opt-client').click();
  doc.getElementById('client-select').value = 'cl-1';
  doc.getElementById('client-select').dispatchEvent(new w.Event('change'));

  // Añadir 1 producto de tienda (Agua mineral: 1,50 €)
  const cardAgua = doc.querySelector('.tpv-product-card[data-product-id="p1"]');
  cardAgua.click();
  await new Promise(r => setTimeout(r, 30));

  // Abrir diálogo de bono y añadir Bono 10 sesiones (250,00 €)
  doc.getElementById('btn-tpv-add-bono').click();
  assert.equal(doc.getElementById('tpv-bono-dialog').open, true);

  const bonoSelect = doc.getElementById('tpv-bono-service-select');
  bonoSelect.value = 'srv-1';
  bonoSelect.dispatchEvent(new w.Event('change'));
  assert.equal(doc.getElementById('tpv-bono-price-input').value, '250.00');

  // Enviar modal de bono
  doc.getElementById('tpv-bono-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));

  // Comprobar que en el ticket aparecen tanto el producto como el bono
  const ticketItems = doc.querySelectorAll('.tpv-item-row');
  assert.equal(ticketItems.length, 2, 'Deben existir 2 filas en el ticket: producto + bono');
  assert.ok(doc.getElementById('ticket-total-price').textContent.includes('251,50'), 'Total debe ser 251,50 € (250 € bono + 1,50 € agua)');

  // Confirmar cobro conjunto de bono + producto
  doc.getElementById('pay-btn-card').click();
  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que se llamó a service-packages con los productos incluidos en el mismo cobro
  assert.ok(bonoPurchasedBody, 'Debe haberse procesado la compra del bono');
  assert.equal(bonoPurchasedBody.serviceId, 'srv-1');
  assert.equal(bonoPurchasedBody.sessionsBought, 10);
  assert.equal(bonoPurchasedBody.paymentMethod, 'TARJETA');
  assert.ok(Array.isArray(bonoPurchasedBody.products), 'Debe incluir los productos en el mismo cobro');
  assert.equal(bonoPurchasedBody.products.length, 1);
  assert.equal(bonoPurchasedBody.products[0].productId, 'p1');
  assert.equal(bonoPurchasedBody.products[0].quantity, 1);

  dom.window.close();
});

test('Tienda TPV: numeración correlativa por centro, formato estrecho para impresora térmica y política legal en el ticket', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const css = fs.readFileSync('web/inventory/tienda.css', 'utf8');

  // 1. Verificación en HTML de elementos de ticket térmico y política legal
  assert.ok(html.includes('id="printable-receipt"'), 'Debe existir contenedor del ticket para impresora');
  assert.ok(html.includes('id="receipt-ticket-number"'), 'Debe existir campo para el número correlativo de ticket');
  assert.ok(html.includes('id="receipt-legal-policy"'), 'Debe existir sección de política legal al pie del ticket');
  assert.ok(html.includes('No se devuelve el dinero'), 'Debe indicar que no se devuelve el dinero');
  assert.ok(html.includes('15 días'), 'Debe indicar plazo máximo de 15 días para cambios');
  assert.ok(html.includes('alimentación') && html.includes('suplementación'), 'Debe mencionar alimentación y suplementación');
  assert.ok(html.includes('abiertos'), 'Debe indicar que no admiten cambio si están abiertos');

  // 2. Verificación de CSS de formato estrecho y reglas de impresión térmica (80mm)
  assert.ok(css.includes('80mm'), 'Debe incluir tamaño de rollo térmico de 80mm');
  assert.ok(css.includes('@media print'), 'Debe incluir estilos para impresión');
  assert.ok(css.includes('#printable-receipt'), 'Debe aplicar formato a #printable-receipt en impresión');

  // 3. Verificación de backend: series correlativas independientes por centro
  const { getGymSeriesFromKey, getGymSeriesPrefix, saleBalance } = require('../dist/finance/inventory');

  // Pruebas de asignación de series por sede
  assert.equal(getGymSeriesFromKey('centro-1'), '001');
  assert.equal(getGymSeriesFromKey('centro-2'), '002');
  assert.equal(getGymSeriesFromKey('sede-3'), '003');
  assert.equal(getGymSeriesFromKey('005'), '005');

  const mockTx = {
    gym: {
      findMany: async () => [
        { id: 'gym-bizkaia', name: 'Trainers Point Bizkaia' },
        { id: 'gym-madrid', name: 'Trainers Point Madrid' },
        { id: 'gym-valencia', name: 'Trainers Point Valencia' }
      ]
    }
  };

  const serie1 = await getGymSeriesPrefix(mockTx, 'gym-bizkaia');
  const serie2 = await getGymSeriesPrefix(mockTx, 'gym-madrid');
  const serie3 = await getGymSeriesPrefix(mockTx, 'gym-valencia');

  assert.equal(serie1, '001', 'Centro 1 debe empezar en serie 001');
  assert.equal(serie2, '002', 'Centro 2 debe empezar en serie 002');
  assert.equal(serie3, '003', 'Centro 3 debe empezar en serie 003');

  // Prueba de saleBalance con invoice vinculado
  const balanced = saleBalance({
    id: 'sale-1',
    gymKey: 'gym-bizkaia',
    totalAmount: 12.50,
    status: 'COMPLETADA',
    lines: [{ unitPrice: 12.50, quantity: 1 }],
    payments: [{ status: 'PAGADO', amount: 12.50 }],
    invoice: { series: '001', number: '000042' }
  });

  assert.equal(balanced.ticketNumber, '001-000042');
  assert.equal(balanced.series, '001');
  assert.equal(balanced.invoiceNumber, '000042');

  // 4. Prueba en JSDOM del diálogo de ticket térmico
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true }
  ];

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: [] }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          id: 'sale-term-1',
          ticketNumber: '001-000001',
          series: '001',
          invoiceNumber: '000001',
          status: 'COMPLETADA',
          totalAmount: 1.50,
          subtotal: 1.24,
          taxAmount: 0.26,
          paymentMethod: 'EFECTIVO',
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 1.50, description: 'Agua mineral 500ml', lineTotal: 1.50 }]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Añadir agua y confirmar venta
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que el diálogo de ticket se abre y muestra la serie y política legal
  const receiptDialog = doc.getElementById('receipt-dialog');
  assert.equal(receiptDialog.open, true, 'El modal de comprobante debe abrirse tras completar la venta');
  assert.equal(doc.getElementById('receipt-ticket-number').textContent, '001-000001', 'Debe mostrar el número de ticket correlativo 001-000001');
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('No se devuelve el dinero'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('15 días'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('suplementación'));

  dom.window.close();
});


test('Tienda TPV: numeración correlativa por centro, formato estrecho para impresora térmica y política legal en el ticket', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const css = fs.readFileSync('web/inventory/tienda.css', 'utf8');

  // 1. Verificación en HTML de elementos de ticket térmico y política legal
  assert.ok(html.includes('id="printable-receipt"'), 'Debe existir contenedor del ticket para impresora');
  assert.ok(html.includes('id="receipt-ticket-number"'), 'Debe existir campo para el número correlativo de ticket');
  assert.ok(html.includes('id="receipt-legal-policy"'), 'Debe existir sección de política legal al pie del ticket');
  assert.ok(html.includes('No se devuelve el dinero'), 'Debe indicar que no se devuelve el dinero');
  assert.ok(html.includes('15 días'), 'Debe indicar plazo máximo de 15 días para cambios');
  assert.ok(html.includes('alimentación') && html.includes('suplementación'), 'Debe mencionar alimentación y suplementación');
  assert.ok(html.includes('abiertos'), 'Debe indicar que no admiten cambio si están abiertos');

  // 2. Verificación de CSS de formato estrecho y reglas de impresión térmica (80mm)
  assert.ok(css.includes('80mm'), 'Debe incluir tamaño de rollo térmico de 80mm');
  assert.ok(css.includes('@media print'), 'Debe incluir estilos para impresión');
  assert.ok(css.includes('#printable-receipt'), 'Debe aplicar formato a #printable-receipt en impresión');

  // 3. Verificación de backend: series correlativas independientes por centro
  const { getGymSeriesFromKey, getGymSeriesPrefix, saleBalance } = require('../dist/finance/inventory');

  // Pruebas de asignación de series por sede
  assert.equal(getGymSeriesFromKey('centro-1'), '001');
  assert.equal(getGymSeriesFromKey('centro-2'), '002');
  assert.equal(getGymSeriesFromKey('sede-3'), '003');
  assert.equal(getGymSeriesFromKey('005'), '005');

  const mockTx = {
    gym: {
      findMany: async () => [
        { id: 'gym-bizkaia', name: 'Trainers Point Bizkaia' },
        { id: 'gym-madrid', name: 'Trainers Point Madrid' },
        { id: 'gym-valencia', name: 'Trainers Point Valencia' }
      ]
    }
  };

  const serie1 = await getGymSeriesPrefix(mockTx, 'gym-bizkaia');
  const serie2 = await getGymSeriesPrefix(mockTx, 'gym-madrid');
  const serie3 = await getGymSeriesPrefix(mockTx, 'gym-valencia');

  assert.equal(serie1, '001', 'Centro 1 debe empezar en serie 001');
  assert.equal(serie2, '002', 'Centro 2 debe empezar en serie 002');
  assert.equal(serie3, '003', 'Centro 3 debe empezar en serie 003');

  // Prueba de saleBalance con invoice vinculado
  const balanced = saleBalance({
    id: 'sale-1',
    gymKey: 'gym-bizkaia',
    totalAmount: 12.50,
    status: 'COMPLETADA',
    lines: [{ unitPrice: 12.50, quantity: 1 }],
    payments: [{ status: 'PAGADO', amount: 12.50 }],
    invoice: { series: '001', number: '000042' }
  });

  assert.equal(balanced.ticketNumber, '001-000042');
  assert.equal(balanced.series, '001');
  assert.equal(balanced.invoiceNumber, '000042');

  // 4. Prueba en JSDOM del diálogo de ticket térmico
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true }
  ];

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: [] }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          id: 'sale-term-1',
          ticketNumber: '001-000001',
          series: '001',
          invoiceNumber: '000001',
          status: 'COMPLETADA',
          totalAmount: 1.50,
          subtotal: 1.24,
          taxAmount: 0.26,
          paymentMethod: 'EFECTIVO',
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 1.50, description: 'Agua mineral 500ml', lineTotal: 1.50 }]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Añadir agua y confirmar venta
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que el diálogo de ticket se abre y muestra la serie y política legal
  const receiptDialog = doc.getElementById('receipt-dialog');
  assert.equal(receiptDialog.open, true, 'El modal de comprobante debe abrirse tras completar la venta');
  assert.equal(doc.getElementById('receipt-ticket-number').textContent, '001-000001', 'Debe mostrar el número de ticket correlativo 001-000001');
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('No se devuelve el dinero'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('15 días'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('suplementación'));

  dom.window.close();
});

test('Tienda TPV: detección de deudas pendientes al comprar un producto y cobro simultáneo', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [{ id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true }];
  const mockClients = [{ id: 'cl-deuda', firstName: 'Marcos', lastName: 'Ruiz', name: 'Marcos Ruiz' }];
  const mockDebts = { 'cl-deuda': 45.00 }; // 45 € de deuda pendiente

  let debtPayCall = null;
  let saleCreated = null;

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: mockClients }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: mockDebts }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      saleCreated = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'sale-1', totalAmount: 1.50, lines: [{ quantity: 1, unitPrice: 1.5, description: 'Agua mineral 500ml' }] }) };
    }
    if (path.startsWith('inventory/clients/cl-deuda/pay-debt') && opts.method === 'POST') {
      debtPayCall = JSON.parse(opts.body);
      mockDebts['cl-deuda'] = 0; // Se salda la deuda
      return { ok: true, json: async () => ({ success: true, paidAmount: 45.00, remainingDebt: 0 }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // 1. Seleccionar cliente con deuda
  doc.getElementById('buyer-opt-client').click();
  doc.getElementById('client-select').value = 'cl-deuda';
  doc.getElementById('client-select').dispatchEvent(new w.Event('change'));
  await new Promise(r => setTimeout(r, 30));

  // 2. Comprobar que aparece el aviso de deuda pendiente de 45,00 €
  const alertBox = doc.getElementById('tpv-debt-alert-box');
  assert.equal(alertBox.hidden, false, 'El banner de deuda pendiente debe ser visible');
  assert.ok(doc.getElementById('tpv-debt-amount-text').textContent.includes('45,00'), 'Debe mostrar 45,00 €');

  // 3. Añadir agua (1,50 €) al carrito
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  // 4. Pulsar botón "Cobrar deuda ahora (+45,00 €)"
  doc.getElementById('btn-tpv-collect-debt').click();
  await new Promise(r => setTimeout(r, 30));

  // Comprobar que el total del ticket ahora es 46,50 € (1,50 € agua + 45 € deuda)
  assert.ok(doc.getElementById('ticket-total-price').textContent.includes('46,50'));
  assert.ok(doc.getElementById('ticket-items').textContent.includes('Cobro de deuda pendiente'));

  // 5. Confirmar cobro en efectivo
  doc.getElementById('pay-btn-cash').click();
  doc.getElementById('cash-tendered').value = '50.00';
  doc.getElementById('cash-tendered').dispatchEvent(new w.Event('input'));
  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que se registró la venta y se saldó la deuda
  assert.ok(saleCreated, 'La venta de productos debe haberse registrado');
  assert.ok(debtPayCall, 'Debe haberse llamado a pay-debt para saldar la deuda');
  assert.equal(debtPayCall.amount, 45.00);
  assert.equal(debtPayCall.method, 'EFECTIVO');

  dom.window.close();
});

test('Tienda TPV: numeración correlativa por centro, formato estrecho para impresora térmica y política legal en el ticket', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const css = fs.readFileSync('web/inventory/tienda.css', 'utf8');

  // 1. Verificación en HTML de elementos de ticket térmico y política legal
  assert.ok(html.includes('id="printable-receipt"'), 'Debe existir contenedor del ticket para impresora');
  assert.ok(html.includes('id="receipt-ticket-number"'), 'Debe existir campo para el número correlativo de ticket');
  assert.ok(html.includes('id="receipt-legal-policy"'), 'Debe existir sección de política legal al pie del ticket');
  assert.ok(html.includes('No se devuelve el dinero'), 'Debe indicar que no se devuelve el dinero');
  assert.ok(html.includes('15 días'), 'Debe indicar plazo máximo de 15 días para cambios');
  assert.ok(html.includes('alimentación') && html.includes('suplementación'), 'Debe mencionar alimentación y suplementación');
  assert.ok(html.includes('abiertos'), 'Debe indicar que no admiten cambio si están abiertos');

  // 2. Verificación de CSS de formato estrecho y reglas de impresión térmica (80mm)
  assert.ok(css.includes('80mm'), 'Debe incluir tamaño de rollo térmico de 80mm');
  assert.ok(css.includes('@media print'), 'Debe incluir estilos para impresión');
  assert.ok(css.includes('#printable-receipt'), 'Debe aplicar formato a #printable-receipt en impresión');

  // 3. Verificación de backend: series correlativas independientes por centro
  const { getGymSeriesFromKey, getGymSeriesPrefix, saleBalance } = require('../dist/finance/inventory');

  // Pruebas de asignación de series por sede
  assert.equal(getGymSeriesFromKey('centro-1'), '001');
  assert.equal(getGymSeriesFromKey('centro-2'), '002');
  assert.equal(getGymSeriesFromKey('sede-3'), '003');
  assert.equal(getGymSeriesFromKey('005'), '005');

  const mockTx = {
    gym: {
      findMany: async () => [
        { id: 'gym-bizkaia', name: 'Trainers Point Bizkaia' },
        { id: 'gym-madrid', name: 'Trainers Point Madrid' },
        { id: 'gym-valencia', name: 'Trainers Point Valencia' }
      ]
    }
  };

  const serie1 = await getGymSeriesPrefix(mockTx, 'gym-bizkaia');
  const serie2 = await getGymSeriesPrefix(mockTx, 'gym-madrid');
  const serie3 = await getGymSeriesPrefix(mockTx, 'gym-valencia');

  assert.equal(serie1, '001', 'Centro 1 debe empezar en serie 001');
  assert.equal(serie2, '002', 'Centro 2 debe empezar en serie 002');
  assert.equal(serie3, '003', 'Centro 3 debe empezar en serie 003');

  // Prueba de saleBalance con invoice vinculado
  const balanced = saleBalance({
    id: 'sale-1',
    gymKey: 'gym-bizkaia',
    totalAmount: 12.50,
    status: 'COMPLETADA',
    lines: [{ unitPrice: 12.50, quantity: 1 }],
    payments: [{ status: 'PAGADO', amount: 12.50 }],
    invoice: { series: '001', number: '000042' }
  });

  assert.equal(balanced.ticketNumber, '001-000042');
  assert.equal(balanced.series, '001');
  assert.equal(balanced.invoiceNumber, '000042');

  // 4. Prueba en JSDOM del diálogo de ticket térmico
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true }
  ];

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: [] }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          id: 'sale-term-1',
          ticketNumber: '001-000001',
          series: '001',
          invoiceNumber: '000001',
          status: 'COMPLETADA',
          totalAmount: 1.50,
          subtotal: 1.24,
          taxAmount: 0.26,
          paymentMethod: 'EFECTIVO',
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 1.50, description: 'Agua mineral 500ml', lineTotal: 1.50 }]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Añadir agua y confirmar venta
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que el diálogo de ticket se abre y muestra la serie y política legal
  const receiptDialog = doc.getElementById('receipt-dialog');
  assert.equal(receiptDialog.open, true, 'El modal de comprobante debe abrirse tras completar la venta');
  assert.equal(doc.getElementById('receipt-ticket-number').textContent, '001-000001', 'Debe mostrar el número de ticket correlativo 001-000001');
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('No se devuelve el dinero'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('15 días'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('suplementación'));

  dom.window.close();
});

test("Tienda TPV: botón rápido de incidencia 'Se ha ido sin pagar' registra la venta como deuda en la ficha", async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  assert.ok(html.includes('id="btn-unpaid-incident"'), 'Debe tener botón de incidencia Se ha ido sin pagar');

  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Barrita Proteína', unitPrice: 2.50, stock: 10, isActive: true }
  ];
  const mockClients = [{ id: 'cl-huidizo', firstName: 'Rubén', lastName: 'Sánchez', name: 'Rubén Sánchez' }];

  let saleRecorded = null;

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: mockClients }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      saleRecorded = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          id: 'sale-unpaid-1',
          status: 'COMPLETADA',
          totalAmount: 2.50,
          paymentTracking: true,
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 2.50, description: 'Barrita Proteína' }]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Seleccionar cliente registrado
  doc.getElementById('buyer-opt-client').click();
  doc.getElementById('client-select').value = 'cl-huidizo';
  doc.getElementById('client-select').dispatchEvent(new w.Event('change'));

  // Añadir barrita al carrito (2,50 €)
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  // Pulsar botón "🏃‍♂️ Se ha ido sin pagar"
  const unpaidBtn = doc.getElementById('btn-unpaid-incident');
  assert.equal(unpaidBtn.disabled, false);
  unpaidBtn.click();
  await new Promise(r => setTimeout(r, 80));

  // Comprobar que se envió a la API con paymentMode: 'PENDING' vinculado al clientId
  assert.ok(saleRecorded, 'Debe haberse enviado la venta al backend');
  assert.equal(saleRecorded.paymentMode, 'PENDING', 'Debe registrarse como PENDING (deuda pendiente)');
  assert.equal(saleRecorded.clientId, 'cl-huidizo', 'Debe estar asignada a la ficha del cliente');
  assert.equal(saleRecorded.lines.length, 1);
  assert.equal(saleRecorded.lines[0].productId, 'p1');

  // El carrito debe haber quedado resuelto/vaciado
  assert.ok(doc.getElementById('ticket-count').textContent.includes('0'));

  dom.window.close();
});

test('Tienda TPV: numeración correlativa por centro, formato estrecho para impresora térmica y política legal en el ticket', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const css = fs.readFileSync('web/inventory/tienda.css', 'utf8');

  // 1. Verificación en HTML de elementos de ticket térmico y política legal
  assert.ok(html.includes('id="printable-receipt"'), 'Debe existir contenedor del ticket para impresora');
  assert.ok(html.includes('id="receipt-ticket-number"'), 'Debe existir campo para el número correlativo de ticket');
  assert.ok(html.includes('id="receipt-legal-policy"'), 'Debe existir sección de política legal al pie del ticket');
  assert.ok(html.includes('No se devuelve el dinero'), 'Debe indicar que no se devuelve el dinero');
  assert.ok(html.includes('15 días'), 'Debe indicar plazo máximo de 15 días para cambios');
  assert.ok(html.includes('alimentación') && html.includes('suplementación'), 'Debe mencionar alimentación y suplementación');
  assert.ok(html.includes('abiertos'), 'Debe indicar que no admiten cambio si están abiertos');

  // 2. Verificación de CSS de formato estrecho y reglas de impresión térmica (80mm)
  assert.ok(css.includes('80mm'), 'Debe incluir tamaño de rollo térmico de 80mm');
  assert.ok(css.includes('@media print'), 'Debe incluir estilos para impresión');
  assert.ok(css.includes('#printable-receipt'), 'Debe aplicar formato a #printable-receipt en impresión');

  // 3. Verificación de backend: series correlativas independientes por centro
  const { getGymSeriesFromKey, getGymSeriesPrefix, saleBalance } = require('../dist/finance/inventory');

  // Pruebas de asignación de series por sede
  assert.equal(getGymSeriesFromKey('centro-1'), '001');
  assert.equal(getGymSeriesFromKey('centro-2'), '002');
  assert.equal(getGymSeriesFromKey('sede-3'), '003');
  assert.equal(getGymSeriesFromKey('005'), '005');

  const mockTx = {
    gym: {
      findMany: async () => [
        { id: 'gym-bizkaia', name: 'Trainers Point Bizkaia' },
        { id: 'gym-madrid', name: 'Trainers Point Madrid' },
        { id: 'gym-valencia', name: 'Trainers Point Valencia' }
      ]
    }
  };

  const serie1 = await getGymSeriesPrefix(mockTx, 'gym-bizkaia');
  const serie2 = await getGymSeriesPrefix(mockTx, 'gym-madrid');
  const serie3 = await getGymSeriesPrefix(mockTx, 'gym-valencia');

  assert.equal(serie1, '001', 'Centro 1 debe empezar en serie 001');
  assert.equal(serie2, '002', 'Centro 2 debe empezar en serie 002');
  assert.equal(serie3, '003', 'Centro 3 debe empezar en serie 003');

  // Prueba de saleBalance con invoice vinculado
  const balanced = saleBalance({
    id: 'sale-1',
    gymKey: 'gym-bizkaia',
    totalAmount: 12.50,
    status: 'COMPLETADA',
    lines: [{ unitPrice: 12.50, quantity: 1 }],
    payments: [{ status: 'PAGADO', amount: 12.50 }],
    invoice: { series: '001', number: '000042' }
  });

  assert.equal(balanced.ticketNumber, '001-000042');
  assert.equal(balanced.series, '001');
  assert.equal(balanced.invoiceNumber, '000042');

  // 4. Prueba en JSDOM del diálogo de ticket térmico
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true }
  ];

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: [] }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          id: 'sale-term-1',
          ticketNumber: '001-000001',
          series: '001',
          invoiceNumber: '000001',
          status: 'COMPLETADA',
          totalAmount: 1.50,
          subtotal: 1.24,
          taxAmount: 0.26,
          paymentMethod: 'EFECTIVO',
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 1.50, description: 'Agua mineral 500ml', lineTotal: 1.50 }]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Añadir agua y confirmar venta
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que el diálogo de ticket se abre y muestra la serie y política legal
  const receiptDialog = doc.getElementById('receipt-dialog');
  assert.equal(receiptDialog.open, true, 'El modal de comprobante debe abrirse tras completar la venta');
  assert.equal(doc.getElementById('receipt-ticket-number').textContent, '001-000001', 'Debe mostrar el número de ticket correlativo 001-000001');
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('No se devuelve el dinero'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('15 días'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('suplementación'));

  dom.window.close();
});


test('Tienda TPV: gestión de tickets múltiples (en espera), pestañas/nubes laterales y cambio entre clientes', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');

  // 1. Verificación estática de elementos HTML para tickets en espera
  assert.ok(html.includes('id="btn-hold-ticket"'), 'Debe tener botón de poner en espera');
  assert.ok(html.includes('id="btn-new-ticket"'), 'Debe tener botón de nuevo ticket');
  assert.ok(html.includes('id="ticket-clouds-list"'), 'Debe tener contenedor para las nubes/pestañas de tickets');
  assert.ok(html.includes('id="badge-waiting-tickets"'), 'Debe tener badge contador de tickets en espera');
  assert.ok(html.includes('id="current-ticket-title"'), 'Debe tener título del ticket activo');
  assert.ok(html.includes('id="btn-rename-ticket"'), 'Debe tener botón para renombrar ticket / cliente');
  assert.ok(html.includes('id="btn-hold-current-ticket"'), 'Debe tener botón rápido para poner en espera el ticket actual');
  assert.ok(html.includes('id="rename-ticket-dialog"'), 'Debe tener diálogo para renombrar');

  // 2. Simulación JSDOM
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  // Mock dialog methods
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true },
    { id: 'p2', name: 'Barrita Proteína', unitPrice: 2.50, stock: 10, isActive: true }
  ];

  let salesRecorded = [];
  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') {
      return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    }
    if (path === 'inventory/products') {
      return { ok: true, json: async () => ({ products: mockProducts }) };
    }
    if (path === 'manage') {
      return { ok: true, json: async () => ({ clients: [{ id: 'cl-1', firstName: 'Juan', lastName: 'Pérez' }] }) };
    }
    if (path === 'inventory/restock') {
      return { ok: true, json: async () => ({ requests: [] }) };
    }
    if (path === 'cash/current') {
      return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    }
    if (path === 'inventory/sales' && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      const sale = {
        id: 'sale-' + Date.now(),
        soldAt: new Date().toISOString(),
        totalAmount: body.lines.reduce((s, l) => s + (l.quantity * (l.expectedUnitPrice || 1.5)), 0),
        paymentMethod: body.paymentMethod,
        lines: body.lines.map(l => ({ ...l, description: l.productId === 'p1' ? 'Agua mineral 500ml' : 'Barrita Proteína', unitPrice: 1.5 }))
      };
      salesRecorded.push(sale);
      return { ok: true, json: async () => sale };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // 3. Estado inicial: 1 ticket activo
  assert.equal(doc.getElementById('current-ticket-title').textContent, 'Ticket 1');
  let clouds = doc.querySelectorAll('.tpv-ticket-cloud-tab');
  assert.equal(clouds.length, 1, 'Debe haber 1 pestaña/nube inicialmente');
  assert.ok(clouds[0].classList.contains('is-active'), 'El ticket inicial debe estar activo');
  assert.ok(clouds[0].querySelector('[title="Atendiendo"]'), 'Debe tener indicador de atendiendo');

  // 4. Añadir producto al Ticket 1
  const cardAgua = doc.querySelector('.tpv-product-card[data-product-id="p1"]');
  cardAgua.click();
  await new Promise(r => setTimeout(r, 30));

  assert.ok(doc.getElementById('ticket-count').textContent.includes('1'));
  assert.ok(doc.getElementById('ticket-total-price').textContent.includes('1,50'));

  // Renombrar Ticket 1 a "Carlos Gómez" mediante el modal de renombrar
  doc.getElementById('btn-rename-ticket').click();
  assert.equal(doc.getElementById('rename-ticket-dialog').open, true);
  doc.getElementById('rename-ticket-input').value = 'Carlos Gómez';
  doc.getElementById('rename-ticket-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));

  assert.equal(doc.getElementById('current-ticket-title').textContent, 'Carlos Gómez');
  clouds = doc.querySelectorAll('.tpv-ticket-cloud-tab');
  assert.ok(clouds[0].textContent.includes('Carlos Gómez'));
  assert.ok(clouds[0].textContent.includes('1,50'));

  // 5. Poner en espera y crear un nuevo ticket en paralelo
  doc.getElementById('btn-hold-ticket').click();
  await new Promise(r => setTimeout(r, 40));

  // Ahora debe haber 2 tickets: Carlos Gómez (en espera) y Ticket 2 (activo)
  clouds = doc.querySelectorAll('.tpv-ticket-cloud-tab');
  assert.equal(clouds.length, 2, 'Deben existir 2 nubes/pestañas de tickets');
  assert.equal(doc.getElementById('badge-waiting-tickets').textContent, '1 en espera');

  // El ticket activo actual debe ser el nuevo (Ticket 2) con carrito vacío
  assert.equal(doc.getElementById('current-ticket-title').textContent, 'Ticket 2');
  assert.ok(doc.getElementById('ticket-count').textContent.includes('0'));
  assert.ok(doc.getElementById('ticket-total-price').textContent.includes('0,00'));

  // Comprobar estado de las nubes
  const waitingCloud = Array.from(clouds).find(c => c.textContent.includes('Carlos Gómez'));
  assert.ok(waitingCloud.classList.contains('is-waiting'), 'Carlos Gómez debe estar en espera');
  assert.ok(waitingCloud.querySelector('[title="En espera"]'), 'Carlos Gómez debe mostrar tooltip en espera');
  assert.ok(waitingCloud.textContent.includes('1,50'));

  const activeCloud = Array.from(clouds).find(c => c.textContent.includes('Ticket 2'));
  assert.ok(activeCloud.classList.contains('is-active'), 'Ticket 2 debe ser el activo');

  // 6. Añadir producto a Ticket 2 (Barrita Proteína)
  const cardBarrita = doc.querySelector('.tpv-product-card[data-product-id="p2"]');
  cardBarrita.click();
  await new Promise(r => setTimeout(r, 30));

  assert.ok(doc.getElementById('ticket-count').textContent.includes('1'));
  assert.ok(doc.getElementById('ticket-total-price').textContent.includes('2,50'));

  // Renombrar Ticket 2 a "Mesa 3 / María"
  doc.getElementById('btn-rename-ticket').click();
  doc.getElementById('rename-ticket-input').value = 'Mesa 3 / María';
  doc.getElementById('rename-ticket-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));

  // 7. Alternar de nuevo al ticket de Carlos Gómez haciendo clic en su pestaña/nube
  waitingCloud.click();
  await new Promise(r => setTimeout(r, 40));

  // Verificar que se restaura el ticket de Carlos Gómez con su producto
  assert.equal(doc.getElementById('current-ticket-title').textContent, 'Carlos Gómez');
  assert.ok(doc.getElementById('ticket-count').textContent.includes('1'));
  assert.ok(doc.getElementById('ticket-total-price').textContent.includes('1,50'));
  assert.ok(doc.getElementById('ticket-items').textContent.includes('Agua mineral 500ml'));

  // Y que "Mesa 3 / María" pasa a estar en espera
  clouds = doc.querySelectorAll('.tpv-ticket-cloud-tab');
  const mariaCloud = Array.from(clouds).find(c => c.textContent.includes('Mesa 3 / María'));
  assert.ok(mariaCloud.classList.contains('is-waiting'), 'Mesa 3 / María debe estar ahora en espera');
  assert.ok(mariaCloud.textContent.includes('2,50'));

  // 8. Cobrar y completar la venta de Carlos Gómez
  doc.getElementById('pay-btn-cash').click();
  doc.getElementById('cash-tendered').value = '10.00';
  doc.getElementById('cash-tendered').dispatchEvent(new w.Event('input'));
  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // La venta debe haberse registrado
  assert.equal(salesRecorded.length, 1);
  assert.equal(salesRecorded[0].totalAmount, 1.50);

  // Al completar la venta, el sistema debe reanudar automáticamente el ticket en espera ("Mesa 3 / María")
  assert.equal(doc.getElementById('current-ticket-title').textContent, 'Mesa 3 / María');
  assert.ok(doc.getElementById('ticket-count').textContent.includes('1'));
  assert.ok(doc.getElementById('ticket-items').textContent.includes('Barrita Proteína'));
  assert.equal(doc.getElementById('badge-waiting-tickets').textContent, '0 en espera');

  // Las nubes deben tener solo 1 ticket ahora
  clouds = doc.querySelectorAll('.tpv-ticket-cloud-tab');
  assert.equal(clouds.length, 1);
  assert.ok(clouds[0].textContent.includes('Mesa 3 / María'));

  // 9. Verificar persistencia en localStorage
  const savedInStorage = JSON.parse(w.localStorage.getItem('tpv_multi_tickets'));
  assert.ok(savedInStorage && Array.isArray(savedInStorage.tickets), 'Debe haberse guardado el estado en localStorage');
  assert.equal(savedInStorage.tickets.length, 1);
  assert.equal(savedInStorage.tickets[0].name, 'Mesa 3 / María');

  dom.window.close();
});

test('Tienda TPV: numeración correlativa por centro, formato estrecho para impresora térmica y política legal en el ticket', async () => {
  const html = fs.readFileSync('web/inventory/tienda.html', 'utf8');
  const css = fs.readFileSync('web/inventory/tienda.css', 'utf8');

  // 1. Verificación en HTML de elementos de ticket térmico y política legal
  assert.ok(html.includes('id="printable-receipt"'), 'Debe existir contenedor del ticket para impresora');
  assert.ok(html.includes('id="receipt-ticket-number"'), 'Debe existir campo para el número correlativo de ticket');
  assert.ok(html.includes('id="receipt-legal-policy"'), 'Debe existir sección de política legal al pie del ticket');
  assert.ok(html.includes('No se devuelve el dinero'), 'Debe indicar que no se devuelve el dinero');
  assert.ok(html.includes('15 días'), 'Debe indicar plazo máximo de 15 días para cambios');
  assert.ok(html.includes('alimentación') && html.includes('suplementación'), 'Debe mencionar alimentación y suplementación');
  assert.ok(html.includes('abiertos'), 'Debe indicar que no admiten cambio si están abiertos');

  // 2. Verificación de CSS de formato estrecho y reglas de impresión térmica (80mm)
  assert.ok(css.includes('80mm'), 'Debe incluir tamaño de rollo térmico de 80mm');
  assert.ok(css.includes('@media print'), 'Debe incluir estilos para impresión');
  assert.ok(css.includes('#printable-receipt'), 'Debe aplicar formato a #printable-receipt en impresión');

  // 3. Verificación de backend: series correlativas independientes por centro
  const { getGymSeriesFromKey, getGymSeriesPrefix, saleBalance } = require('../dist/finance/inventory');

  // Pruebas de asignación de series por sede
  assert.equal(getGymSeriesFromKey('centro-1'), '001');
  assert.equal(getGymSeriesFromKey('centro-2'), '002');
  assert.equal(getGymSeriesFromKey('sede-3'), '003');
  assert.equal(getGymSeriesFromKey('005'), '005');

  const mockTx = {
    gym: {
      findMany: async () => [
        { id: 'gym-bizkaia', name: 'Trainers Point Bizkaia' },
        { id: 'gym-madrid', name: 'Trainers Point Madrid' },
        { id: 'gym-valencia', name: 'Trainers Point Valencia' }
      ]
    }
  };

  const serie1 = await getGymSeriesPrefix(mockTx, 'gym-bizkaia');
  const serie2 = await getGymSeriesPrefix(mockTx, 'gym-madrid');
  const serie3 = await getGymSeriesPrefix(mockTx, 'gym-valencia');

  assert.equal(serie1, '001', 'Centro 1 debe empezar en serie 001');
  assert.equal(serie2, '002', 'Centro 2 debe empezar en serie 002');
  assert.equal(serie3, '003', 'Centro 3 debe empezar en serie 003');

  // Prueba de saleBalance con invoice vinculado
  const balanced = saleBalance({
    id: 'sale-1',
    gymKey: 'gym-bizkaia',
    totalAmount: 12.50,
    status: 'COMPLETADA',
    lines: [{ unitPrice: 12.50, quantity: 1 }],
    payments: [{ status: 'PAGADO', amount: 12.50 }],
    invoice: { series: '001', number: '000042' }
  });

  assert.equal(balanced.ticketNumber, '001-000042');
  assert.equal(balanced.series, '001');
  assert.equal(balanced.invoiceNumber, '000042');

  // 4. Prueba en JSDOM del diálogo de ticket térmico
  const dom = new JSDOM(html, { url: 'http://localhost/tienda.html', runScripts: 'outside-only' });
  const w = dom.window;

  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.confirm = () => true;

  const mockProducts = [
    { id: 'p1', name: 'Agua mineral 500ml', unitPrice: 1.50, stock: 20, isActive: true }
  ];

  w.fetch = async (url, opts = {}) => {
    const path = url.replace('/api/', '');
    if (path === 'me') return { ok: true, json: async () => ({ id: 'usr-1', name: 'Recepcionista', role: 'RECEPTION', pagePermissions: ['tienda.html'] }) };
    if (path === 'inventory/products') return { ok: true, json: async () => ({ products: mockProducts }) };
    if (path === 'manage') return { ok: true, json: async () => ({ clients: [] }) };
    if (path === 'inventory/debts') return { ok: true, json: async () => ({ debts: {} }) };
    if (path === 'services') return { ok: true, json: async () => ({ services: [] }) };
    if (path === 'services/packs') return { ok: true, json: async () => ({ packages: [] }) };
    if (path === 'cash/current') return { ok: true, json: async () => ({ session: { id: 's1', openedAt: '2026-11-06T08:00:00Z', summary: { expectedCash: 100 } } }) };
    if (path === 'inventory/restock') return { ok: true, json: async () => ({ requests: [] }) };

    if (path === 'inventory/sales' && opts.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          id: 'sale-term-1',
          ticketNumber: '001-000001',
          series: '001',
          invoiceNumber: '000001',
          status: 'COMPLETADA',
          totalAmount: 1.50,
          subtotal: 1.24,
          taxAmount: 0.26,
          paymentMethod: 'EFECTIVO',
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 1.50, description: 'Agua mineral 500ml', lineTotal: 1.50 }]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const scriptContent = fs.readFileSync('web/inventory/tienda.js', 'utf8');
  w.eval(scriptContent);
  await new Promise(r => setTimeout(r, 60));

  const doc = w.document;

  // Añadir agua y confirmar venta
  doc.querySelector('.tpv-product-card[data-product-id="p1"]').click();
  await new Promise(r => setTimeout(r, 30));

  doc.getElementById('btn-confirm-sale').click();
  await new Promise(r => setTimeout(r, 80));

  // Verificar que el diálogo de ticket se abre y muestra la serie y política legal
  const receiptDialog = doc.getElementById('receipt-dialog');
  assert.equal(receiptDialog.open, true, 'El modal de comprobante debe abrirse tras completar la venta');
  assert.equal(doc.getElementById('receipt-ticket-number').textContent, '001-000001', 'Debe mostrar el número de ticket correlativo 001-000001');
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('No se devuelve el dinero'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('15 días'));
  assert.ok(doc.getElementById('receipt-legal-policy').textContent.includes('suplementación'));

  dom.window.close();
});
