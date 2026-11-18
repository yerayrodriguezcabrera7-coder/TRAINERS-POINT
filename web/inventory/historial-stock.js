(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatDate = d => { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('es-ES', {day:'2-digit',month:'short',year:'numeric'}) + ' ' + dt.toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}); };
  const typeLabels = {ENTRADA:'Entrada',VENTA:'Venta',DEVOLUCION:'Devolución',AJUSTE:'Ajuste',DANO:'Daño',SALIDA:'Salida (merma)'};
  let movements = [], me, allProducts = [];
  async function api(path, method = 'GET', body) {
    const url = '/api/inventory' + path;
    const response = await fetch(url, {method, headers:{'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : undefined});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo completar la operación.');
    return data;
  }
  function typeBadge(type) {
    return `<span class="movement-type ${type}">${typeLabels[type] || type}</span>`;
  }
  function formatQty(qty) {
    const n = Number(qty);
    return n > 0 ? '+' + n : String(n);
  }
  function render() {
    const q = $('search').value.trim().toLocaleLowerCase('es');
    const type = $('filter-type').value;
    const productId = $('filter-product').value;
    const from = $('filter-from').value;
    const to = $('filter-to').value;

    const filtered = movements.filter(m => {
      const matchSearch = !q || [m.product?.name, m.notes, m.reference].join(' ').toLocaleLowerCase('es').includes(q);
      const matchType = type === 'ALL' || m.type === type;
      const matchProduct = productId === 'ALL' || m.productId === productId;
      return matchSearch && matchType && matchProduct;
    });

    $('movements').innerHTML = filtered.map(m => {
      const photo = m.product?.imageData
        ? `<img class="movement-product-photo" src="${esc(m.product.imageData)}" alt="${esc(m.product.name)}" loading="lazy">`
        : `<span class="movement-product-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 6"/></svg></span>`;
      return `<tr data-movement-id="${esc(m.id)}">
        <td>${formatDate(m.occurredAt)}</td>
        <td><div class="movement-product-identity">${photo}<div><strong>${esc(m.product?.name || m.productName)}</strong></div></div></td>
        <td>${typeBadge(m.type)}</td>
        <td><strong style="color:${m.quantity > 0 ? '#2e7d32' : '#c62828'}">${formatQty(m.quantity)}</strong></td>
        <td><small>${esc(m.reference) || '—'}</small></td>
        <td><small>${esc(m.notes) || '—'}</small></td>
        <td><small>${esc(m.actorName || 'Sistema')}</small></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7">No hay movimientos de stock con estos criterios.</td></tr>';

    const entradas = movements.filter(m => m.type === 'ENTRADA').reduce((s,m) => s + m.quantity, 0);
    const ventas = movements.filter(m => m.type === 'VENTA').reduce((s,m) => s + m.quantity, 0);
    const devoluciones = movements.filter(m => m.type === 'DEVOLUCION').reduce((s,m) => s + m.quantity, 0);
    const ajustes = movements.filter(m => ['AJUSTE','DANO','SALIDA'].includes(m.type)).reduce((s,m) => s + Math.abs(m.quantity), 0);
    $('stats').innerHTML = `
      <article><span>Entradas totales</span><strong style="color:#2e7d32">${entradas}</strong><small>Unidades añadidas al stock</small></article>
      <article><span>Ventas</span><strong style="color:#b66a00">−${ventas}</strong><small>Unidades vendidas</small></article>
      <article><span>Devoluciones</span><strong style="color:#1565c0">${devoluciones}</strong><small>Unidades devueltas</small></article>
      <article><span>Ajustes/Daños/Salidas</span><strong style="color:#7b1fa2">−${ajustes}</strong><small>Mermas y correcciones</small></article>`;
  }

  function buildFilterUrl() {
    const params = new URLSearchParams();
    const type = $('filter-type').value;
    if (type && type !== 'ALL') params.set('type', type);
    const productId = $('filter-product').value;
    if (productId && productId !== 'ALL') params.set('product', productId);
    const from = $('filter-from').value;
    if (from) params.set('from', from);
    const to = $('filter-to').value;
    if (to) params.set('to', to);
    return params.toString();
  }

  async function load() {
    movements = (await api('/stock-movements' + (buildFilterUrl() ? '?' + buildFilterUrl() : ''))).movements || [];
    render();
  }

  function loadProducts() {
    return api('/products').then(r => {
      allProducts = r.products;
      populateProductFilter();
    }).catch(() => {});
  }

  function populateProductFilter() {
    const select = $('filter-product');
    select.innerHTML = '<option value="ALL">Todos</option>';
    allProducts.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = `${p.name} (Stock: ${p.stock})`;
      select.appendChild(opt);
    });
  }

  $('search').oninput = render;
  $('filter-type').onchange = render;
  $('filter-product').onchange = render;
  $('filter-from').onchange = render;
  $('filter-to').onchange = render;
  $('refresh').onclick = () => load().catch(error => $('notice').textContent = error.message);
  $('new-stock-loss').onclick = () => {
    const select = $('stock-loss-form').elements.productId;
    select.innerHTML = allProducts.filter(p => p.isActive).map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.stock} disponibles</option>`).join('');
    $('stock-loss-error').textContent = '';
    $('stock-loss-dialog').showModal();
  };
  $('stock-loss-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button.primary'); button.disabled = true;
    try {
      await api('/stock-adjustments', 'POST', { productId: form.elements.productId.value, type: form.elements.type.value, quantity: Number(form.elements.quantity.value), notes: form.elements.notes.value });
      $('stock-loss-dialog').close(); form.reset(); await Promise.all([load(), loadProducts()]); $('notice').textContent = 'Salida registrada y stock actualizado.';
    } catch (error) { $('stock-loss-error').textContent = error.message; } finally { button.disabled = false; }
  };

  $('movements').onclick = async event => {
    if (event.target.closest('button')) return;
    const row = event.target.closest('tr[data-movement-id]');
    if (!row) return;
    const cells = row.querySelectorAll('td');
    const m = movements.find(item => item.id === row.dataset.movementId);
    if (!m) return;
    $('movement-title').textContent = `${typeLabels[m.type]} — ${m.product?.name || m.productName}`;
    $('movement-content').innerHTML = `
      <dl style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px">
        <dt>Fecha / Hora</dt><dd>${formatDate(m.occurredAt)}</dd>
        <dt>Tipo</dt><dd>${typeBadge(m.type)}</dd>
        <dt>Producto</dt><dd>${esc(m.product?.name || m.productName)}</dd>
        <dt>Cantidad</dt><dd><strong style="color:${m.quantity > 0 ? '#2e7d32' : '#c62828'}">${formatQty(m.quantity)} unidades</strong></dd>
        <dt>Referencia</dt><dd><code>${esc(m.reference) || '—'}</code></dd>
        <dt>Registrado por</dt><dd>${esc(m.actorName || 'Sistema')}</dd>
        <dt>Stock tras el movimiento</dt><dd>${m.product != null ? m.product.stock + ' unidades' : '—'}</dd>
        ${m.notes ? `<dt style="grid-column:1/-1">Notas / Motivo</dt><dd style="grid-column:1/-1">${esc(m.notes)}</dd>` : ''}
        ${m.unitCost ? `<dt>Coste unitario</dt><dd>${new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(m.unitCost))}</dd>` : ''}
      </dl>`;
    $('movement-dialog').showModal();
  };

  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());

  try {
    const response = await fetch('/api/me');
    if (!response.ok) throw Error('Inicia sesión para consultar el historial de stock.');
    me = await response.json();
    const canHistory = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) ? me.pagePermissions.includes('historial-stock.html') : ['ADMIN','RECEPTION'].includes(me.role));
    if (!canHistory) throw Error('Tu perfil no permite acceder al historial de stock.');
    const canRecordLoss = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) ? me.pagePermissions.includes('historial-stock.html') || me.pagePermissions.includes('pedidos.html') : me.role === 'RECEPTION');
    $('new-stock-loss').hidden = !canRecordLoss;
    await Promise.all([load(), loadProducts()]);
  } catch (error) {
    $('notice').textContent = error.message;
  }
})();
