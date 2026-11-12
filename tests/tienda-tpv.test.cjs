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

