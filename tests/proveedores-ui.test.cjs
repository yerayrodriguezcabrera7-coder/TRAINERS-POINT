const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');

async function until(check) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw Error('La pantalla no terminó de actualizarse.');
    await new Promise(r => setTimeout(r, 15));
  }
}

function page(file, script, handler, url = 'http://localhost/proveedores.html') {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.TrainersPoint = { poll: () => () => {} };
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  w.fetch = async (url, options = {}) => {
    const res = await handler(new URL(url, 'http://localhost'), options);
    return { ok: true, json: async () => res };
  };
  w.eval(fs.readFileSync(script, 'utf8'));
  return { dom, w, d: w.document, errors };
}

test('Proveedores: listado, alta, edición, búsqueda y detalle con productos vinculados', async () => {
  const providerId = randomUUID();
  const providers = [{
    id: providerId,
    name: 'Nutrisport Nutrition',
    contactName: 'Carlos Gómez',
    phone: '600123456',
    email: 'pedidos@nutrisport.com',
    address: 'Calle Mayor 10, Madrid',
    notes: 'Descuento 15% por volumen',
    isActive: true,
    productCount: 2
  }];
  let savedProvider;

  const p = page('web/inventory/proveedores.html', 'web/inventory/proveedores.js', (url, options) => {
    if (url.pathname === '/api/me') return { role: 'ADMIN' };
    if (url.pathname.match(new RegExp(`/api/inventory/providers/${providerId}$`))) {
      return {
        provider: {
          ...providers[0],
          products: [
            { id: randomUUID(), name: 'Proteína Whey 1kg', barcode: '840001', unitPrice: 29.99, stock: 15 },
            { id: randomUUID(), name: 'BCAA 300g', barcode: '840002', unitPrice: 19.99, stock: 8 }
          ]
        }
      };
    }
    if (options.method === 'POST') {
      savedProvider = JSON.parse(options.body);
      const newP = { id: randomUUID(), ...savedProvider, isActive: true, productCount: 0 };
      providers.push(newP);
      return newP;
    }
    return { providers };
  });

  try {
    await until(() => p.d.querySelector('#providers tr td'));
    assert.match(p.d.querySelector('#providers').textContent, /Nutrisport Nutrition/);
    assert.match(p.d.querySelector('#providers').textContent, /Carlos Gómez/);
    assert.match(p.d.querySelector('#providers').textContent, /600123456/);
    assert.equal(p.d.querySelector('#stats strong').textContent, '1');

    // Búsqueda
    p.d.getElementById('search').value = 'Inexistente';
    p.d.getElementById('search').dispatchEvent(new p.w.Event('input'));
    assert.match(p.d.querySelector('#providers').textContent, /No hay proveedores/);

    p.d.getElementById('search').value = 'Nutrisport';
    p.d.getElementById('search').dispatchEvent(new p.w.Event('input'));
    assert.match(p.d.querySelector('#providers').textContent, /Nutrisport Nutrition/);

    // Ver detalle
    p.d.querySelector('[data-detail]').click();
    await until(() => p.d.querySelector('#provider-detail-content strong'));
    assert.match(p.d.querySelector('#provider-detail-content').textContent, /Proteína Whey 1kg/);
    assert.match(p.d.querySelector('#provider-detail-content').textContent, /BCAA 300g/);

    p.d.getElementById('search').value = '';
    p.d.getElementById('search').dispatchEvent(new p.w.Event('input'));

    // Alta nuevo proveedor
    p.d.getElementById('new-provider').click();
    const form = p.d.getElementById('provider-form');
    form.elements.name.value = 'Prozis España';
    form.elements.contactName.value = 'Ana Martínez';
    form.elements.phone.value = '611999888';
    form.elements.email.value = 'ventas@prozis.com';
    form.requestSubmit(p.d.getElementById('save-provider'));
    await until(() => savedProvider);
    assert.equal(savedProvider.name, 'Prozis España');
    assert.equal(savedProvider.contactName, 'Ana Martínez');

    await until(() => p.d.querySelectorAll('#providers tr').length >= 2);
    assert.deepEqual(p.errors, []);
  } finally {
    p.dom.window.close();
  }
});

test('Productos: botones superiores de filtrado por proveedor', async () => {
  const provA = { id: 'prov-a', name: 'Nutrisport' };
  const provB = { id: 'prov-b', name: 'Amix' };
  const products = [
    { id: randomUUID(), name: 'Barrita Proteica', providerId: provA.id, provider: provA, unitPrice: 2.5, costPrice: 1, taxRate: 21, stock: 20, trackStock: true, isActive: true, revision: 1 },
    { id: randomUUID(), name: 'Creatina Creapure', providerId: provB.id, provider: provB, unitPrice: 24, costPrice: 12, taxRate: 21, stock: 5, trackStock: true, isActive: true, revision: 1 },
    { id: randomUUID(), name: 'Toalla Microfibra', providerId: null, provider: null, unitPrice: 10, costPrice: 3, taxRate: 21, stock: 10, trackStock: true, isActive: true, revision: 1 }
  ];

  const p = page('web/inventory/productos.html', 'web/inventory/productos.js', (url) => {
    if (url.pathname === '/api/me') return { role: 'ADMIN' };
    if (url.pathname === '/api/inventory/providers') return { providers: [provA, provB] };
    return { products };
  }, 'http://localhost/productos.html');

  try {
    await until(() => p.d.querySelector('#supplier-filters .supplier-pill'));
    const pills = p.d.querySelectorAll('#supplier-filters .supplier-pill');
    assert.ok(pills.length >= 3, 'Debe haber al menos 3 botones de proveedor (Todos, Nutrisport, Amix, Sin proveedor)');

    // Inicialmente se ven los 3 productos
    assert.equal(p.d.querySelectorAll('#products tr').length, 3);

    // Clic en Nutrisport
    const nutrisportPill = Array.from(pills).find(btn => btn.dataset.provider === provA.id);
    assert.ok(nutrisportPill, 'Debe existir el botón de Nutrisport');
    nutrisportPill.click();
    assert.equal(p.d.querySelectorAll('#products tr').length, 1);
    assert.match(p.d.querySelector('#products').textContent, /Barrita Proteica/);

    // Clic en Amix
    const amixPill = p.d.querySelector('#supplier-filters [data-provider="' + provB.id + '"]');
    assert.ok(amixPill, 'Debe existir el botón de Amix');
    amixPill.click();
    assert.equal(p.d.querySelectorAll('#products tr').length, 1);
    assert.match(p.d.querySelector('#products').textContent, /Creatina Creapure/);

    // Clic en Sin proveedor
    const nonePill = p.d.querySelector('#supplier-filters [data-provider="none"]');
    assert.ok(nonePill, 'Debe existir el botón de Sin proveedor');
    nonePill.click();
    assert.equal(p.d.querySelectorAll('#products tr').length, 1);
    assert.match(p.d.querySelector('#products').textContent, /Toalla Microfibra/);

    // Clic en Todos
    const allPill = p.d.querySelector('#supplier-filters [data-provider="all"]');
    allPill.click();
    assert.equal(p.d.querySelectorAll('#products tr').length, 3);

    assert.deepEqual(p.errors, []);
  } finally {
    p.dom.window.close();
  }
});
