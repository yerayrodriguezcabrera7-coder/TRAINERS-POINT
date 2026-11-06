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
});

test('Tienda TPV: asset-catalog y menu incluyen las rutas de la tienda', () => {
  const catalog = fs.readFileSync('src/http/asset-catalog.ts', 'utf8');
  assert.ok(catalog.includes('"/tienda.html"'), 'asset-catalog debe incluir /tienda.html');
  assert.ok(catalog.includes('"/tienda"'), 'asset-catalog debe incluir /tienda');
  assert.ok(catalog.includes('"/tienda.js"'), 'asset-catalog debe incluir /tienda.js');
  assert.ok(catalog.includes('"/tienda.css"'), 'asset-catalog debe incluir /tienda.css');

  const menu = fs.readFileSync('web/shared/menu.js', 'utf8');
  assert.ok(menu.includes("['Tienda TPV','bag','/tienda.html']"), 'El menú debe incluir Tienda TPV');
  assert.ok(menu.includes("['Ventas y caja',['Tienda TPV','Productos','Caja']]"), 'El grupo de ventas y caja debe incluir Tienda TPV');
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

