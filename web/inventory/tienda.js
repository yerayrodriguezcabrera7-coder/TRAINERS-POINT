/**
 * Trainers Point · Tienda TPV Mostrador (Venta Física y Cuadre de Caja)
 */
(async () => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = val => String(val ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moneyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const eur = val => moneyFormatter.format(Number(val || 0));
  const timeFormat = val => val ? new Date(val).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—';
  const dateFormat = val => val ? new Date(val).toLocaleDateString('es-ES') : '—';

  // State
  let me = null;
  let products = [];
  let clients = [];
  let currentCashSession = null;
  let unassignedPayments = 0;
  let cart = new Map(); // productId -> quantity
  let selectedCategory = 'all';
  let buyerKind = 'walkin';
  let paymentMethod = 'EFECTIVO';
  let paymentMode = 'PAID';
  let lastCompletedSale = null;

  async function api(path, method = 'GET', body) {
    const res = await fetch('/api/' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al procesar la solicitud.');
    return data;
  }

  function showNotice(msg, isError = false) {
    const el = $('notice');
    el.textContent = msg;
    el.style.backgroundColor = isError ? '#ffeaea' : '#edf7ee';
    el.style.color = isError ? '#a52720' : '#1e6138';
    el.style.display = 'block';
    setTimeout(() => { if (el.textContent === msg) el.style.display = 'none'; }, 6000);
  }

  // --- 1. CARGA DE DATOS ---
  async function loadInitialData() {
    try {
      me = await api('me');
      if (!['ADMIN', 'RECEPTION'].includes(me.role)) {
        throw new Error('Solo el personal de recepción y administración tiene acceso a la tienda.');
      }
      $('btn-quick-new-product').hidden = me.role !== 'ADMIN';

      const [prodRes, manageRes] = await Promise.all([
        api('inventory/products'),
        api('manage')
      ]);

      products = prodRes.products || [];
      clients = manageRes.clients || [];

      renderClientOptions();
      await refreshCashSession();
      renderCatalog();
      renderCart();
      updateDispatchedTab();
    } catch (err) {
      showNotice(err.message, true);
    }
  }

  async function refreshCashSession() {
    try {
      const res = await api('cash/current');
      currentCashSession = res.session;
      unassignedPayments = res.unassignedPayments || 0;
      updateCashStatusUI();
      updateBalanceUI();
      updateDispatchedTab();
    } catch (_) {}
  }

  function updateCashStatusUI() {
    const pill = $('cash-status-pill');
    const text = $('cash-status-text');
    const openBtn = $('btn-quick-open-cash');

    if (currentCashSession && !currentCashSession.closedAt) {
      pill.className = 'tpv-status-badge';
      text.textContent = `🟢 Caja abierta hoy (${eur(currentCashSession.summary?.expectedCash ?? currentCashSession.openingAmount)} en cajón)`;
      openBtn.hidden = true;
    } else {
      pill.className = 'tpv-status-badge closed';
      text.textContent = '⚠️ Caja cerrada / sin abrir';
      openBtn.hidden = false;
    }
  }

  // --- 2. CATÁLOGO VISUAL DE PRODUCTOS ---
  function getCategoryForProduct(p) {
    const text = (p.name + ' ' + (p.description || '')).toLowerCase();
    if (text.includes('agua') || text.includes('bebida') || text.includes('isotonic') || text.includes('refresco') || text.includes('café') || text.includes('cafe')) return 'bebidas';
    if (text.includes('proteina') || text.includes('creatina') || text.includes('suplemento') || text.includes('amino') || text.includes('bcaa')) return 'suplementos';
    if (text.includes('barrita') || text.includes('snack') || text.includes('galleta') || text.includes('fruto')) return 'snacks';
    return 'otros';
  }

  function renderCatalog() {
    const query = $('product-search').value.trim().toLowerCase();
    const grid = $('products-grid');

    const filtered = products.filter(p => {
      if (!p.isActive) return false;
      const matchesQuery = (p.name + ' ' + (p.description || '')).toLowerCase().includes(query);
      if (!matchesQuery) return false;

      if (selectedCategory === 'all') return true;
      const cat = getCategoryForProduct(p);
      return cat === selectedCategory;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#7e8b92;padding:30px">No hay productos disponibles para este filtro o búsqueda.</p>';
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const stock = Number(p.stock);
      const isOut = stock <= 0;
      const isLow = stock > 0 && stock <= 3;
      const inCart = cart.get(p.id) || 0;

      const stockBadge = isOut
        ? '<span class="tpv-product-stock zero">Agotado</span>'
        : isLow
        ? `<span class="tpv-product-stock low">¡Quedan ${stock}!</span>`
        : `<span class="tpv-product-stock">${stock} disponibles</span>`;

      const inCartBadge = inCart > 0
        ? `<span class="tpv-product-in-cart">${inCart} en ticket</span>`
        : '';

      return `
        <article class="tpv-product-card ${isOut ? 'out-of-stock' : ''}" data-product-id="${esc(p.id)}">
          ${inCartBadge}
          <div>
            <div class="tpv-product-title">${esc(p.name)}</div>
            <div class="tpv-product-desc">${esc(p.description || '')}</div>
          </div>
          <div class="tpv-product-footer">
            <span class="tpv-product-price">${eur(p.unitPrice)}</span>
            ${stockBadge}
          </div>
        </article>
      `;
    }).join('');

    // Click handler on products
    grid.querySelectorAll('.tpv-product-card').forEach(card => {
      card.onclick = () => {
        const pId = card.dataset.productId;
        const p = products.find(item => item.id === pId);
        if (!p || p.stock <= 0) return;
        addToCart(pId, 1);
      };
    });
  }

  // --- 3. GESTIÓN DEL TICKET / CARRITO ---
  function addToCart(productId, delta) {
    const p = products.find(item => item.id === productId);
    if (!p) return;

    const currentQty = cart.get(productId) || 0;
    const newQty = currentQty + delta;

    if (newQty > p.stock) {
      showNotice(`Stock máximo alcanzado para ${p.name} (${p.stock} disponibles).`, true);
      return;
    }

    if (newQty <= 0) {
      cart.delete(productId);
    } else {
      cart.set(productId, newQty);
    }

    renderCart();
    renderCatalog(); // updates in-cart badges
  }

  function renderCart() {
    const list = $('ticket-items');
    let totalUnits = 0;
    let totalPrice = 0;

    if (cart.size === 0) {
      list.innerHTML = `
        <div class="tpv-ticket-empty">
          <p>El ticket está vacío.</p>
          <small>Pulsa sobre cualquier producto del catálogo para añadirlo a la venta.</small>
        </div>
      `;
      $('ticket-count').textContent = '(0)';
      $('ticket-total-units').textContent = '0 uds';
      $('ticket-total-price').textContent = eur(0);
      $('btn-confirm-sale').disabled = true;
      $('btn-confirm-sale').textContent = 'Confirmar venta y cobrar (0,00 €)';
      updateCashCalculator();
      return;
    }

    const rows = [];
    for (const [pId, qty] of cart.entries()) {
      const p = products.find(item => item.id === pId);
      if (!p) continue;
      const subtotal = Number(p.unitPrice) * qty;
      totalUnits += qty;
      totalPrice += subtotal;

      rows.push(`
        <div class="tpv-item-row" data-id="${esc(p.id)}">
          <div class="tpv-item-info">
            <div class="tpv-item-name" title="${esc(p.name)}">${esc(p.name)}</div>
            <div class="tpv-item-unit-price">${eur(p.unitPrice)} / ud</div>
          </div>
          <div class="tpv-qty-stepper">
            <button class="tpv-qty-btn btn-minus" type="button" aria-label="Restar una unidad">−</button>
            <span class="tpv-qty-num">${qty}</span>
            <button class="tpv-qty-btn btn-plus" type="button" aria-label="Añadir una unidad" ${qty >= p.stock ? 'disabled' : ''}>＋</button>
          </div>
          <div class="tpv-item-subtotal">${eur(subtotal)}</div>
          <button class="tpv-item-del" type="button" title="Eliminar de la lista">✕</button>
        </div>
      `);
    }

    list.innerHTML = rows.join('');

    // Stepper event listeners
    list.querySelectorAll('.tpv-item-row').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('.btn-minus').onclick = () => addToCart(id, -1);
      row.querySelector('.btn-plus').onclick = () => addToCart(id, 1);
      row.querySelector('.tpv-item-del').onclick = () => {
        cart.delete(id);
        renderCart();
        renderCatalog();
      };
    });

    $('ticket-count').textContent = `(${totalUnits})`;
    $('ticket-total-units').textContent = `${totalUnits} uds`;
    $('ticket-total-price').textContent = eur(totalPrice);

    $('btn-confirm-sale').disabled = false;
    $('btn-confirm-sale').textContent = `Confirmar venta y cobrar (${eur(totalPrice)})`;

    updateCashCalculator();
  }

  function getCartTotal() {
    let total = 0;
    for (const [pId, qty] of cart.entries()) {
      const p = products.find(item => item.id === pId);
      if (p) total += Number(p.unitPrice) * qty;
    }
    return total;
  }

  // --- 4. COMPRADOR Y CLIENTES ---
  function renderClientOptions() {
    const q = $('client-search').value.trim().toLowerCase();
    const select = $('client-select');

    const filtered = clients.filter(c => {
      const full = `${c.name || ''} ${c.firstName || ''} ${c.lastName || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase();
      return full.includes(q);
    });

    select.innerHTML = '<option value="">Selecciona un cliente…</option>' + filtered.map(c => {
      const name = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Cliente';
      const detail = [c.phone, c.email].filter(Boolean).join(' · ');
      return `<option value="${esc(c.id)}">${esc(name)}${detail ? ' (' + esc(detail) + ')' : ''}</option>`;
    }).join('');
  }

  $('buyer-opt-walkin').onclick = () => {
    buyerKind = 'walkin';
    $('buyer-opt-walkin').classList.add('selected');
    $('buyer-opt-client').classList.remove('selected');
    $('client-select-wrap').hidden = true;
    $('payment-mode-select').value = 'PAID';
    $('payment-mode-select').querySelector('[value=PENDING]').disabled = true;
    paymentMode = 'PAID';
  };

  $('buyer-opt-client').onclick = () => {
    buyerKind = 'client';
    $('buyer-opt-client').classList.add('selected');
    $('buyer-opt-walkin').classList.remove('selected');
    $('client-select-wrap').hidden = false;
    $('payment-mode-select').querySelector('[value=PENDING]').disabled = false;
  };

  $('client-search').oninput = renderClientOptions;

  $('payment-mode-select').onchange = e => {
    paymentMode = e.target.value;
    const isPending = paymentMode === 'PENDING';
    $('payment-methods-grid').style.opacity = isPending ? '0.5' : '1';
    $('cash-calc-wrap').hidden = isPending || paymentMethod !== 'EFECTIVO';
  };

  // --- 5. FORMAS DE PAGO Y CALCULADORA DE CAMBIO ---
  const payButtons = [
    { btn: $('pay-btn-cash'), method: 'EFECTIVO' },
    { btn: $('pay-btn-card'), method: 'TARJETA' },
    { btn: $('pay-btn-bizum'), method: 'BIZUM' }
  ];

  payButtons.forEach(({ btn, method }) => {
    btn.onclick = () => {
      paymentMethod = method;
      payButtons.forEach(b => b.btn.classList.toggle('selected', b.method === method));
      $('cash-calc-wrap').hidden = method !== 'EFECTIVO' || paymentMode === 'PENDING';
      updateCashCalculator();
    };
  });

  function updateCashCalculator() {
    if (paymentMethod !== 'EFECTIVO' || paymentMode === 'PENDING') return;

    const total = getCartTotal();
    const tenderedVal = $('cash-tendered').value.trim();
    const changeBox = $('change-display');

    if (total === 0 || tenderedVal === '') {
      changeBox.hidden = true;
      return;
    }

    const tendered = parseFloat(tenderedVal);
    if (isNaN(tendered)) {
      changeBox.hidden = true;
      return;
    }

    changeBox.hidden = false;
    const diff = Math.round((tendered - total) * 100) / 100;

    if (diff >= 0) {
      changeBox.className = 'tpv-change-result ok';
      changeBox.innerHTML = `<span>Cambio a devolver:</span><strong>${eur(diff)}</strong>`;
      $('btn-confirm-sale').disabled = cart.size === 0;
    } else {
      changeBox.className = 'tpv-change-result missing';
      changeBox.innerHTML = `<span>Falta por entregar:</span><strong>${eur(-diff)}</strong>`;
      $('btn-confirm-sale').disabled = true;
    }
  }

  $('cash-tendered').oninput = updateCashCalculator;

  // Bill chips
  document.querySelectorAll('.tpv-bill-chip').forEach(chip => {
    chip.onclick = () => {
      const bill = chip.dataset.bill;
      const total = getCartTotal();
      if (bill === 'exact') {
        $('cash-tendered').value = total > 0 ? total.toFixed(2) : '';
      } else {
        const val = Number(bill);
        $('cash-tendered').value = val.toFixed(2);
      }
      updateCashCalculator();
    };
  });

  // Category filter pills
  $('category-pills').querySelectorAll('.tpv-cat-pill').forEach(pill => {
    pill.onclick = () => {
      $('category-pills').querySelectorAll('.tpv-cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedCategory = pill.dataset.cat;
      renderCatalog();
    };
  });

  $('product-search').oninput = renderCatalog;
  $('btn-refresh-products').onclick = async () => {
    try {
      const res = await api('inventory/products');
      products = res.products || [];
      renderCatalog();
      showNotice('Catálogo de productos actualizado.');
    } catch (e) {
      showNotice(e.message, true);
    }
  };

  $('btn-clear-ticket').onclick = () => {
    if (cart.size > 0 && confirm('¿Deseas vaciar el ticket de venta actual?')) {
      cart.clear();
      $('cash-tendered').value = '';
      renderCart();
      renderCatalog();
    }
  };

  // --- 6. CONFIRMAR VENTA ---
  $('btn-confirm-sale').onclick = async () => {
    if (cart.size === 0) return;

    const btn = $('btn-confirm-sale');
    const errEl = $('sale-form-error');
    errEl.textContent = '';
    btn.disabled = true;

    try {
      const isClient = buyerKind === 'client';
      const clientId = isClient ? $('client-select').value : null;

      if (isClient && !clientId) {
        throw new Error('Has seleccionado cliente registrado. Elige un cliente de la lista.');
      }

      const total = getCartTotal();
      const tendered = parseFloat($('cash-tendered').value || 0);

      if (paymentMethod === 'EFECTIVO' && paymentMode === 'PAID' && tendered > 0 && tendered < total) {
        throw new Error('El importe en efectivo entregado no cubre el total de la venta.');
      }

      const lines = [];
      for (const [productId, quantity] of cart.entries()) {
        const p = products.find(item => item.id === productId);
        lines.push({
          productId,
          quantity,
          expectedUnitPrice: Number(p?.unitPrice || 0)
        });
      }

      const requestKey = crypto.randomUUID();
      const sale = await api('inventory/sales', 'POST', {
        requestKey,
        paymentMode,
        paymentMethod,
        clientId,
        lines
      });

      lastCompletedSale = {
        ...sale,
        tendered: paymentMethod === 'EFECTIVO' && tendered >= total ? tendered : total,
        change: paymentMethod === 'EFECTIVO' && tendered >= total ? tendered - total : 0,
        buyerName: isClient ? ($('client-select').options[$('client-select').selectedIndex]?.text || 'Cliente') : 'Persona de paso'
      };

      // Reset ticket
      cart.clear();
      $('cash-tendered').value = '';
      renderCart();
      showNotice(`Venta completada por ${eur(sale.totalAmount)}.`);

      // Update backend data
      const prodRes = await api('inventory/products');
      products = prodRes.products || [];
      renderCatalog();
      await refreshCashSession();

      // Open receipt dialog
      openReceiptDialog(lastCompletedSale);

    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false;
    }
  };

  // --- 7. TICKET / COMPROBANTE DE VENTA ---
  function openReceiptDialog(sale) {
    if (!sale) return;
    $('receipt-ref').textContent = sale.id ? sale.id.slice(0, 8).toUpperCase() : 'TP-' + Date.now();
    $('receipt-date').textContent = `${dateFormat(sale.soldAt || new Date())} ${timeFormat(sale.soldAt || new Date())}`;
    $('receipt-seller').textContent = me ? `${me.name || me.email}` : 'Personal de centro';
    $('receipt-client').textContent = sale.buyerName || (sale.clientId ? 'Cliente registrado' : 'Persona de paso');

    const lines = sale.lines || [];
    $('receipt-lines-tbody').innerHTML = lines.map(l => `
      <tr>
        <td>${l.quantity} × ${esc(l.description)}</td>
        <td>${eur(l.unitPrice)}</td>
        <td>${eur(l.lineTotal || (Number(l.quantity) * Number(l.unitPrice)))}</td>
      </tr>
    `).join('');

    $('receipt-total-amount').textContent = eur(sale.totalAmount);
    const methodNames = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta / Datáfono', BIZUM: 'Bizum' };
    $('receipt-method').textContent = methodNames[sale.paymentMethod || sale.payments?.[0]?.method] || 'Efectivo';

    if (sale.tendered !== undefined && sale.change !== undefined && sale.change > 0) {
      $('receipt-tendered-wrap').hidden = false;
      $('receipt-tendered').textContent = eur(sale.tendered);
      $('receipt-change').textContent = eur(sale.change);
    } else {
      $('receipt-tendered-wrap').hidden = true;
    }

    $('receipt-dialog').showModal();
  }

  $('btn-print-receipt').onclick = () => window.print();
  $('btn-new-sale-after').onclick = () => $('receipt-dialog').close();

  // --- 8. SALIDAS DE HOY ("APUNTAR LO QUE SALE") ---
  function updateDispatchedTab() {
    if (!currentCashSession || !currentCashSession.summary) {
      $('dispatched-products-tbody').innerHTML = '<tr><td colspan="5">No hay caja abierta o no se han registrado ventas hoy.</td></tr>';
      $('dispatched-tickets-tbody').innerHTML = '<tr><td colspan="6">No hay ventas registradas.</td></tr>';
      $('badge-dispatched-units').textContent = '0';
      $('kpi-dispatched-revenue').textContent = eur(0);
      $('kpi-dispatched-units').textContent = '0 uds';
      $('kpi-dispatched-tickets').textContent = '0';
      return;
    }

    const summary = currentCashSession.summary;
    const sessionSales = summary.sales || [];

    // Agrupar unidades salidas por producto
    const productStats = new Map();
    let totalUnitsDispatched = 0;

    sessionSales.forEach(s => {
      (s.products || []).forEach(p => {
        const key = p.name;
        const current = productStats.get(key) || { name: p.name, units: 0, revenue: 0, unitPrice: p.unitPrice };
        current.units += Number(p.quantity);
        current.revenue += Number(p.quantity) * Number(p.unitPrice);
        productStats.set(key, current);
        totalUnitsDispatched += Number(p.quantity);
      });
    });

    $('badge-dispatched-units').textContent = String(totalUnitsDispatched);
    $('kpi-dispatched-units').textContent = `${totalUnitsDispatched} uds`;
    $('kpi-dispatched-revenue').textContent = eur(summary.soldTotal || 0);
    $('kpi-dispatched-tickets').textContent = String(sessionSales.length);

    // Tabla de productos que han salido
    if (productStats.size === 0) {
      $('dispatched-products-tbody').innerHTML = '<tr><td colspan="5">Aún no se han registrado salidas de productos en esta sesión de caja.</td></tr>';
    } else {
      $('dispatched-products-tbody').innerHTML = [...productStats.values()].map(item => {
        const prod = products.find(p => p.name.toLowerCase() === item.name.toLowerCase());
        const remainingStock = prod ? `${prod.stock} uds` : '—';
        return `
          <tr>
            <td><strong>${esc(item.name)}</strong></td>
            <td><strong style="color:var(--ink)">${item.units} uds</strong></td>
            <td>${eur(item.unitPrice)}</td>
            <td><strong>${eur(item.revenue)}</strong></td>
            <td>${remainingStock}</td>
          </tr>
        `;
      }).join('');
    }

    // Tabla de tickets de hoy
    if (sessionSales.length === 0) {
      $('dispatched-tickets-tbody').innerHTML = '<tr><td colspan="6">Sin tickets registrados en esta caja.</td></tr>';
    } else {
      $('dispatched-tickets-tbody').innerHTML = [...sessionSales].reverse().map(s => {
        const itemsText = (s.products || []).map(p => `${p.quantity}× ${esc(p.name)}`).join(', ');
        return `
          <tr>
            <td>${timeFormat(s.at)}<br><small style="color:#777">${esc(s.id.slice(0, 8))}</small></td>
            <td>${esc(s.client || 'Persona de paso')}</td>
            <td>${itemsText}</td>
            <td><span class="badge">${esc(s.status || 'Confirmada')}</span></td>
            <td><strong>${eur(s.amount)}</strong></td>
            <td><button class="outline-button view-ticket-btn" data-sale-id="${esc(s.id)}" type="button" style="padding:4px 8px;font-size:11px">Ticket</button></td>
          </tr>
        `;
      }).join('');

      $('dispatched-tickets-tbody').querySelectorAll('.view-ticket-btn').forEach(b => {
        b.onclick = () => {
          const s = sessionSales.find(item => item.id === b.dataset.saleId);
          if (s) {
            openReceiptDialog({
              id: s.id,
              soldAt: s.at,
              buyerName: s.client,
              totalAmount: s.amount,
              paymentMethod: 'EFECTIVO',
              lines: s.products.map(p => ({
                description: p.name,
                quantity: p.quantity,
                unitPrice: p.unitPrice,
                lineTotal: p.quantity * p.unitPrice
              }))
            });
          }
        };
      });
    }
  }

  // --- 9. CUADRE CON CAJA Y ARQUEO ("CALCULARLO DESPUÉS CON LO DE LA CAJA") ---
  function updateBalanceUI() {
    const banner = $('balance-session-banner');
    const wrap = $('balance-content-wrap');

    if (!currentCashSession || currentCashSession.closedAt) {
      banner.hidden = false;
      wrap.style.opacity = '0.5';
      $('balance-cash-sales').textContent = '0,00 €';
      $('balance-card-sales').textContent = '0,00 €';
      $('balance-bizum-sales').textContent = '0,00 €';
      $('balance-initial-float').textContent = '0,00 €';
      $('balance-cash-collected').textContent = '＋ 0,00 €';
      $('balance-manual-in').textContent = '＋ 0,00 €';
      $('balance-manual-out').textContent = '− 0,00 €';
      $('balance-expected-cash').textContent = '0,00 €';
      return;
    }

    banner.hidden = true;
    wrap.style.opacity = '1';

    const s = currentCashSession.summary;
    const initialFloat = Number(currentCashSession.openingAmount || 0);
    const cashCollected = Number(s.collections?.EFECTIVO || 0);
    const cardCollected = Number(s.collections?.TARJETA || 0);
    const bizumCollected = Number(s.collections?.BIZUM || 0);
    const cashIn = Number(s.cashIn || 0);
    const cashOut = Number(s.cashOut || 0) + Number(s.refunds?.EFECTIVO || 0);
    const expected = Number(s.expectedCash || (initialFloat + cashCollected + cashIn - cashOut));

    $('balance-cash-sales').textContent = eur(cashCollected);
    $('balance-card-sales').textContent = eur(cardCollected);
    $('balance-bizum-sales').textContent = eur(bizumCollected);

    $('balance-initial-float').textContent = eur(initialFloat);
    $('balance-cash-collected').textContent = `＋ ${eur(cashCollected)}`;
    $('balance-manual-in').textContent = `＋ ${eur(cashIn)}`;
    $('balance-manual-out').textContent = `− ${eur(cashOut)}`;
    $('balance-expected-cash').textContent = eur(expected);

    checkRecountDifference();
  }

  function checkRecountDifference() {
    if (!currentCashSession || !currentCashSession.summary) return;
    const inputVal = $('recount-input').value.trim();
    const box = $('recount-diff-box');
    const text = $('recount-diff-text');
    const actions = $('recount-close-actions');

    if (inputVal === '') {
      box.hidden = true;
      actions.hidden = true;
      return;
    }

    const counted = parseFloat(inputVal);
    if (isNaN(counted)) return;

    const expected = Number(currentCashSession.summary.expectedCash);
    const diff = Math.round((counted - expected) * 100) / 100;

    box.hidden = false;
    actions.hidden = false;

    if (diff === 0) {
      box.className = 'tpv-diff-badge balanced';
      text.innerHTML = `✅ <strong>La caja cuadra perfectamente.</strong> El dinero físico contado (${eur(counted)}) coincide exactamente con las salidas de tienda y el fondo inicial.`;
    } else if (diff < 0) {
      box.className = 'tpv-diff-badge shortage';
      text.innerHTML = `❌ <strong>Falta dinero en el cajón:</strong> Hay ${eur(counted)} contados frente a ${eur(expected)} esperados (Diferencia: <strong>${eur(diff)}</strong>).`;
    } else {
      box.className = 'tpv-diff-badge surplus';
      text.innerHTML = `⚠️ <strong>Sobra dinero en el cajón:</strong> Hay ${eur(counted)} contados frente a ${eur(expected)} esperados (Diferencia: <strong>+${eur(diff)}</strong>).`;
    }
  }

  $('btn-calc-difference').onclick = checkRecountDifference;
  $('recount-input').oninput = checkRecountDifference;

  // Cierre oficial de caja desde Tienda
  $('btn-close-cash-from-tpv').onclick = async () => {
    if (!currentCashSession) return;
    const counted = parseFloat($('recount-input').value);
    if (isNaN(counted)) {
      showNotice('Introduce el efectivo contado antes de cerrar la caja.', true);
      return;
    }

    const diff = Math.round((counted - Number(currentCashSession.summary?.expectedCash || 0)) * 100) / 100;
    const confirmMsg = diff === 0
      ? `¿Cerrar oficialmente la caja del día con ${eur(counted)} (Cuadre exacto)?`
      : `¿Cerrar la caja con una diferencia de ${eur(diff)}?`;

    if (!confirm(confirmMsg)) return;

    const btn = $('btn-close-cash-from-tpv');
    btn.disabled = true;

    try {
      const closeKey = crypto.randomUUID();
      await api(`cash/sessions/${currentCashSession.id}/close`, 'POST', {
        requestKey: closeKey,
        countedAmount: counted,
        revision: currentCashSession.revision,
        note: $('recount-close-note').value.trim()
      });

      showNotice('Caja cerrada con éxito. El arqueo ha quedado registrado.');
      $('recount-input').value = '';
      $('recount-close-note').value = '';
      await refreshCashSession();
    } catch (err) {
      showNotice(err.message, true);
    } finally {
      btn.disabled = false;
    }
  };

  // --- 10. TABS DE NAVEGACIÓN ---
  const tabs = [
    { btn: $('tab-pos'), panel: $('panel-pos') },
    { btn: $('tab-dispatched'), panel: $('panel-dispatched') },
    { btn: $('tab-balance'), panel: $('panel-balance') }
  ];

  tabs.forEach(({ btn, panel }) => {
    btn.onclick = () => {
      tabs.forEach(t => {
        t.btn.classList.toggle('active', t.btn === btn);
        t.btn.setAttribute('aria-pressed', String(t.btn === btn));
        t.panel.hidden = t.btn !== btn;
      });
      if (btn === $('tab-dispatched')) updateDispatchedTab();
      if (btn === $('tab-balance')) updateBalanceUI();
    };
  });

  // --- 11. MODAL APERTURA RÁPIDA DE CAJA ---
  function openQuickCashModal() {
    $('open-cash-form').reset();
    $('quick-open-error').textContent = '';
    $('open-cash-dialog').showModal();
  }

  $('btn-quick-open-cash').onclick = openQuickCashModal;
  $('btn-balance-open-cash').onclick = openQuickCashModal;

  $('open-cash-form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    const err = $('quick-open-error');
    err.textContent = '';

    try {
      const amount = parseFloat($('quick-opening-amount').value);
      if (isNaN(amount) || amount < 0) throw new Error('Introduce un importe válido de apertura.');

      const requestKey = crypto.randomUUID();
      await api('cash/sessions', 'POST', {
        requestKey,
        openingAmount: amount
      });

      $('open-cash-dialog').close();
      showNotice(`Caja abierta con éxito con un fondo de ${eur(amount)}.`);
      await refreshCashSession();
    } catch (err2) {
      err.textContent = err2.message;
    } finally {
      btn.disabled = false;
    }
  };

  // --- 12. MODAL NUEVO PRODUCTO RÁPIDO ---
  $('btn-quick-new-product').onclick = () => {
    $('new-product-form').reset();
    $('new-prod-error').textContent = '';
    $('new-product-dialog').showModal();
  };

  $('new-product-form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    const f = e.target.elements;
    const err = $('new-prod-error');
    err.textContent = '';

    try {
      await api('inventory/products', 'POST', {
        name: f.name.value.trim(),
        description: f.description.value.trim(),
        price: Number(f.price.value),
        stock: Number(f.stock.value)
      });

      $('new-product-dialog').close();
      showNotice('Producto creado y disponible para la venta.');
      const res = await api('inventory/products');
      products = res.products || [];
      renderCatalog();
    } catch (err2) {
      err.textContent = err2.message;
    } finally {
      btn.disabled = false;
    }
  };

  // Close modals
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => {
      const modal = $(btn.dataset.close);
      if (modal) modal.close();
    };
  });

  // Start app
  await loadInitialData();
})();

