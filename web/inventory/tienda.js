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
  let cart = new Map(); // productId -> quantity (apunta al carrito del ticket activo)
  let selectedCategory = 'all';
  let buyerKind = 'walkin';
  let paymentMethod = 'EFECTIVO';
  let paymentMode = 'PAID';
  let lastCompletedSale = null;
  let restockRequests = [];
  let selectedRestockStatus = 'PENDIENTE';
  let viewMode = 'grid'; // 'grid' | 'list'
  let currentEanToAssign = '';

  // --- GESTIÓN DE TICKETS MÚLTIPLES (EN ESPERA) ---
  function createEmptyTicket(name) {
    const id = 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    return {
      id,
      name: name || `Ticket ${tickets.length + 1}`,
      buyerKind: 'walkin',
      clientId: null,
      clientName: '',
      cart: new Map(),
      paymentMethod: 'EFECTIVO',
      paymentMode: 'PAID',
      cashTendered: '',
      createdAt: Date.now()
    };
  }

  let tickets = [];
  let activeTicketId = null;

  function getActiveTicket() {
    let t = tickets.find(item => item.id === activeTicketId);
    if (!t) {
      if (tickets.length === 0) {
        tickets.push(createEmptyTicket('Ticket 1'));
      }
      activeTicketId = tickets[0].id;
      t = tickets[0];
    }
    return t;
  }

  function saveTicketsToStorage() {
    try {
      const serializable = tickets.map(t => ({
        id: t.id,
        name: t.name,
        buyerKind: t.buyerKind,
        clientId: t.clientId,
        clientName: t.clientName,
        cart: Array.from(t.cart.entries()),
        paymentMethod: t.paymentMethod,
        paymentMode: t.paymentMode,
        cashTendered: t.cashTendered,
        createdAt: t.createdAt
      }));
      localStorage.setItem('tpv_multi_tickets', JSON.stringify({ activeTicketId, tickets: serializable }));
    } catch (_) {}
  }

  function loadTicketsFromStorage() {
    try {
      const raw = localStorage.getItem('tpv_multi_tickets');
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (Array.isArray(data.tickets) && data.tickets.length > 0) {
        tickets = data.tickets.map(t => ({
          ...t,
          cart: new Map(t.cart || [])
        }));
        activeTicketId = data.activeTicketId && tickets.some(t => t.id === data.activeTicketId)
          ? data.activeTicketId
          : tickets[0].id;
        return true;
      }
    } catch (_) {}
    return false;
  }

  function syncActiveTicketFromUI() {
    const t = getActiveTicket();
    t.buyerKind = buyerKind;
    t.paymentMethod = paymentMethod;
    t.paymentMode = paymentMode;
    t.clientId = buyerKind === 'client' ? $('client-select')?.value || null : null;
    const opt = $('client-select')?.selectedOptions?.[0];
    t.clientName = buyerKind === 'client' && opt ? opt.textContent.trim() : '';
    t.cashTendered = $('cash-tendered')?.value || '';
    saveTicketsToStorage();
  }

  function syncActiveTicketToUI() {
    const t = getActiveTicket();
    cart = t.cart;
    buyerKind = t.buyerKind || 'walkin';
    paymentMethod = t.paymentMethod || 'EFECTIVO';
    paymentMode = t.paymentMode || 'PAID';

    $('buyer-opt-walkin')?.classList.toggle('selected', buyerKind === 'walkin');
    $('buyer-opt-client')?.classList.toggle('selected', buyerKind === 'client');
    if ($('client-select-wrap')) {
      $('client-select-wrap').hidden = buyerKind !== 'client';
    }
    if (t.clientId && $('client-select')) {
      $('client-select').value = t.clientId;
    }

    if ($('payment-mode-select')) {
      $('payment-mode-select').value = paymentMode;
    }

    $('payment-methods-grid')?.querySelectorAll('.tpv-pay-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.method === paymentMethod);
    });
    if ($('cash-calc-wrap')) {
      $('cash-calc-wrap').hidden = paymentMethod !== 'EFECTIVO' || paymentMode === 'PENDING';
    }

    if ($('cash-tendered')) {
      $('cash-tendered').value = t.cashTendered || '';
    }

    if ($('current-ticket-title')) {
      $('current-ticket-title').textContent = t.name;
      $('current-ticket-title').title = t.name;
    }
  }

  function switchToTicket(targetId) {
    if (targetId === activeTicketId) return;
    syncActiveTicketFromUI();
    activeTicketId = targetId;
    syncActiveTicketToUI();
    renderCart();
    renderCatalog();
    updateCashCalculator();
    renderTicketClouds();
    saveTicketsToStorage();
  }

  function createNewTicket(customName, autoSwitch = true) {
    syncActiveTicketFromUI();
    const nextNum = tickets.length + 1;
    const newT = createEmptyTicket(customName || `Ticket ${nextNum}`);
    tickets.push(newT);
    if (autoSwitch) {
      switchToTicket(newT.id);
    } else {
      renderTicketClouds();
      saveTicketsToStorage();
    }
    return newT;
  }

  function putCurrentTicketOnHold() {
    syncActiveTicketFromUI();
    const cur = getActiveTicket();

    // Buscar si hay otro ticket abierto
    const other = tickets.find(t => t.id !== cur.id);
    if (other) {
      switchToTicket(other.id);
      showNotice(`Ticket "${cur.name}" puesto en espera.`);
    } else {
      const newT = createNewTicket();
      showNotice(`Ticket "${cur.name}" puesto en espera.`);
    }
  }

  function closeTicket(ticketId) {
    const t = tickets.find(item => item.id === ticketId);
    if (!t) return;

    let totalUnits = 0;
    for (const qty of t.cart.values()) totalUnits += qty;

    if (totalUnits > 0) {
      const ok = window.confirm(`¿Deseas descartar el ticket "${t.name}" con sus ${totalUnits} artículo(s)?`);
      if (!ok) return;
    }

    tickets = tickets.filter(item => item.id !== ticketId);
    if (tickets.length === 0) {
      tickets.push(createEmptyTicket('Ticket 1'));
    }

    if (activeTicketId === ticketId) {
      activeTicketId = tickets[0].id;
      syncActiveTicketToUI();
      renderCart();
      renderCatalog();
      updateCashCalculator();
    }

    renderTicketClouds();
    saveTicketsToStorage();
  }

  function renderTicketClouds() {
    const list = $('ticket-clouds-list');
    if (!list) return;

    const waitingTickets = tickets.filter(t => t.id !== activeTicketId && t.cart.size > 0);
    const badge = $('badge-waiting-tickets');
    if (badge) {
      badge.textContent = `${waitingTickets.length} en espera`;
      badge.hidden = waitingTickets.length === 0;
    }

    list.innerHTML = tickets.map(t => {
      const isActive = t.id === activeTicketId;
      let units = 0;
      let total = 0;
      for (const [pId, qty] of t.cart.entries()) {
        const p = products.find(item => item.id === pId);
        units += qty;
        if (p) total += Number(p.unitPrice) * qty;
      }

      const statusIcon = isActive ? '🟢' : (units > 0 ? '⏳' : '⚪');
      const statusText = isActive ? 'Atendiendo' : (units > 0 ? 'En espera' : 'Vacío');
      const infoText = units > 0 ? `${units} uds · ${eur(total)}` : 'Vacío';
      const closeBtn = tickets.length > 1
        ? `<button class="cloud-tab-btn-close" data-close-ticket="${esc(t.id)}" type="button" title="Cerrar ticket ${esc(t.name)}">✕</button>`
        : '';

      return `
        <div class="tpv-ticket-cloud-tab ${isActive ? 'is-active' : 'is-waiting'}" data-ticket-id="${esc(t.id)}" role="tab" aria-selected="${isActive}">
          <span title="${statusText}">${statusIcon}</span>
          <span class="cloud-tab-name" title="${esc(t.name)}">${esc(t.name)}</span>
          <span class="cloud-tab-badge">${infoText}</span>
          ${closeBtn}
        </div>
      `;
    }).join('');

    list.querySelectorAll('.tpv-ticket-cloud-tab').forEach(tab => {
      tab.onclick = (e) => {
        if (e.target.closest('.cloud-tab-btn-close')) return;
        switchToTicket(tab.dataset.ticketId);
      };
    });

    list.querySelectorAll('.cloud-tab-btn-close').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        closeTicket(btn.dataset.closeTicket);
      };
    });
  }

  function initTickets() {
    const loaded = loadTicketsFromStorage();
    if (!loaded) {
      tickets = [createEmptyTicket('Ticket 1')];
      activeTicketId = tickets[0].id;
    }
    syncActiveTicketToUI();
  }

  // --- BARCODE SCANNER & AUDIO FEEDBACK ---
  function matchesBarcode(productBarcode, code) {
    if (!productBarcode || !code) return false;
    const cleanScan = String(code).trim().toLowerCase();
    const tokens = String(productBarcode).split(/[\s,;/]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    return tokens.includes(cleanScan) || String(productBarcode).trim().toLowerCase() === cleanScan;
  }

  function playScanSound(type = 'success') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1760, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (_) {}
  }

  function handleBarcodeScanned(rawCode, fromSearchInput = false) {
    const code = String(rawCode || '').trim();
    if (!code) return;

    // 1. Search active products by barcode or SKU
    const product = products.find(p => p.isActive && matchesBarcode(p.barcode, code))
                 || products.find(p => p.isActive && p.sku && p.sku.toLowerCase() === code.toLowerCase());

    if (product) {
      if (product.stock <= 0) {
        playScanSound('error');
        showNotice(`⚠️ "${product.name}" está agotado (stock: 0).`, true);
      } else {
        playScanSound('success');
        addToCart(product.id, 1);
        showNotice(`✓ "${product.name}" añadido al ticket (+1 ud) · ${eur(product.unitPrice)}`);

        // Visual pulse animation on the card
        const card = document.querySelector(`.tpv-product-card[data-product-id="${product.id}"]`);
        if (card) {
          card.classList.add('tpv-card-pulse');
          setTimeout(() => card.classList.remove('tpv-card-pulse'), 600);
          card.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        }
      }

      if (fromSearchInput) {
        $('product-search').value = '';
        renderCatalog();
      }
      return;
    }

    // 2. Check if an inactive (descatalogado) product matches
    const inactiveProduct = products.find(p => !p.isActive && matchesBarcode(p.barcode, code));
    if (inactiveProduct) {
      playScanSound('error');
      showNotice(`📦 El producto "${inactiveProduct.name}" está descatalogado o anterior. Abriendo gestión EAN...`, true);
      openEanManagerModal(code, inactiveProduct.id);
      return;
    }

    // 3. Fallback: if entered in search input and matches exactly 1 active product by name, add it
    if (fromSearchInput) {
      const nameMatches = products.filter(p => p.isActive && (p.name + ' ' + (p.description || '')).toLowerCase().includes(code.toLowerCase()));
      if (nameMatches.length === 1 && nameMatches[0].stock > 0) {
        addToCart(nameMatches[0].id, 1);
        playScanSound('success');
        showNotice(`✓ "${nameMatches[0].name}" añadido al ticket (+1 ud).`);
        $('product-search').value = '';
        renderCatalog();
        return;
      }
    }

    // 4. Code not recognized -> Open EAN manager dialog
    playScanSound('error');
    openEanManagerModal(code);
  }

  function openEanManagerModal(code = '', preselectedProductId = '') {
    currentEanToAssign = String(code || '').trim();
    $('ean-scanned-code-display').textContent = currentEanToAssign || '(Sin código escaneado)';
    $('ean-form-error').textContent = '';

    const sel = $('ean-product-select');
    sel.innerHTML = '<option value="">-- Seleccionar producto para asignar código --</option>' +
      products.map(p => `
        <option value="${esc(p.id)}" ${p.id === preselectedProductId ? 'selected' : ''}>
          ${esc(p.name)} (${eur(p.unitPrice)}) ${p.barcode ? `· EAN actual: ${esc(p.barcode)}` : '· Sin EAN'} ${!p.isActive ? '[Descatalogado]' : ''}
        </option>
      `).join('');

    if (preselectedProductId) {
      sel.value = preselectedProductId;
    }

    updateEanProductPreview();
    $('ean-manager-dialog').showModal();
  }

  function updateEanProductPreview() {
    const sel = $('ean-product-select');
    const pId = sel.value;
    const preview = $('ean-product-preview');
    if (!pId) {
      preview.hidden = true;
      return;
    }
    const p = products.find(item => item.id === pId);
    if (!p) {
      preview.hidden = true;
      return;
    }
    preview.hidden = false;
    $('ean-preview-thumb').innerHTML = renderProductImage(p.imageData, p.name, true);
    $('ean-preview-name').textContent = p.name;
    $('ean-preview-price-stock').textContent = `PVP: ${eur(p.unitPrice)} · Stock actual: ${p.stock} uds ${p.isActive ? '' : '(Descatalogado)'}`;
    $('ean-preview-current-barcode').textContent = p.barcode ? `Código actual: ${p.barcode}` : 'Código actual: Ninguno';
  }

  function renderProductImage(imageData, name, isThumb = false) {
    if (imageData && (typeof imageData === 'string' && (/^data:image\/(png|jpeg|webp);base64,/i.test(imageData) || /^https?:\/\//i.test(imageData) || /^\//.test(imageData)))) {
      return `<img class="${isThumb ? 'tpv-item-thumb-img' : 'tpv-product-img'}" src="${esc(imageData)}" alt="${esc(name)}" loading="lazy">`;
    }
    return `
      <div class="${isThumb ? 'tpv-item-thumb-placeholder' : 'tpv-product-placeholder'}" role="img" aria-label="Sin imagen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3"></rect>
          <circle cx="8" cy="8" r="1.5"></circle>
          <path d="m4 17 5-5 4 4 3-3 5 6"></path>
        </svg>
      </div>
    `;
  }

  function updateViewModeUI() {
    const gridEl = $('products-grid');
    const btnGrid = $('view-mode-grid');
    const btnList = $('view-mode-list');
    if (!gridEl) return;
    if (viewMode === 'list') {
      gridEl.classList.add('is-list-view');
      btnList?.classList.add('active');
      btnList?.setAttribute('aria-pressed', 'true');
      btnGrid?.classList.remove('active');
      btnGrid?.setAttribute('aria-pressed', 'false');
    } else {
      gridEl.classList.remove('is-list-view');
      btnGrid?.classList.add('active');
      btnGrid?.setAttribute('aria-pressed', 'true');
      btnList?.classList.remove('active');
      btnList?.setAttribute('aria-pressed', 'false');
    }
  }

  function initViewMode() {
    const saved = localStorage.getItem('tpv_catalog_view_mode');
    if (saved === 'list' || saved === 'grid') {
      viewMode = saved;
    }
    updateViewModeUI();
  }

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
      const canTienda = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) ? me.pagePermissions.includes('tienda.html') : ['ADMIN', 'RECEPTION'].includes(me.role));
      if (!canTienda) {
        throw new Error('Tu perfil no permite acceder a la tienda.');
      }
      $('btn-quick-new-product').hidden = !(me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) && me.pagePermissions.includes('productos.html')));

      const [prodRes, manageRes, restockRes] = await Promise.all([
        api('inventory/products'),
        api('manage'),
        api('inventory/restock').catch(() => ({ requests: [] }))
      ]);

      products = prodRes.products || [];
      clients = manageRes.clients || [];
      restockRequests = restockRes.requests || [];

      renderClientOptions();
      await refreshCashSession();
      initViewMode();
      initTickets();
      renderCatalog();
      renderCart();
      renderTicketClouds();
      updateDispatchedTab();
      renderRestockSection();

      if (window.location.hash === '#tab-restock') {
        $('tab-restock')?.click();
      }
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
      const haystack = (p.name + ' ' + (p.description || '') + ' ' + (p.barcode || '') + ' ' + (p.sku || '')).toLowerCase();
      const matchesQuery = haystack.includes(query);
      if (!matchesQuery) return false;

      if (selectedCategory === 'anteriores') return !p.isActive;
      if (!p.isActive) return false;
      if (selectedCategory === 'all') return true;
      const cat = getCategoryForProduct(p);
      return cat === selectedCategory;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#7e8b92;padding:30px">No hay productos disponibles para este filtro o búsqueda.</p>';
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const isAnterior = !p.isActive;
      const stock = Number(p.stock);
      const isOut = stock <= 0;
      const isLow = stock > 0 && stock <= 3;
      const inCart = cart.get(p.id) || 0;

      const barcodeBadge = p.barcode
        ? `<span class="tpv-product-barcode" data-barcode-pid="${esc(p.id)}" title="EAN: ${esc(p.barcode)} · Pulsa para gestionar o cambiar código">🏷️ ${esc(p.barcode)}</span>`
        : '';

      const stockBadge = isAnterior
        ? '<span class="tpv-product-stock low" style="background:#f3f4f6;color:#556066;border-color:#d1d5db">Descatalogado</span>'
        : isOut
        ? '<span class="tpv-product-stock zero">Agotado</span>'
        : isLow
        ? `<span class="tpv-product-stock low">¡Quedan ${stock}!</span>`
        : `<span class="tpv-product-stock">${stock} disponibles</span>`;

      const inCartBadge = inCart > 0
        ? `<span class="tpv-product-in-cart">${inCart} en ticket</span>`
        : '';

      const pendingRestock = restockRequests.find(r => r.productId === p.id && r.status === 'PENDIENTE');
      const restockActionBadge = pendingRestock
        ? `<span class="tpv-badge-restock-pending" data-pid="${esc(p.id)}" title="Anotado para pedir: ${pendingRestock.quantity} uds">📋 Falta (${pendingRestock.quantity} uds)</span>`
        : `<button class="tpv-card-restock-btn" type="button" data-restock-pid="${esc(p.id)}" title="${isAnterior ? 'Pedir producto anterior para reponerlo' : 'Anotar que falta para pedir'}">${isAnterior ? '📦 Volver a pedir' : '⚠️ Falta para pedir'}</button>`;

      return `
        <article class="tpv-product-card ${isOut || isAnterior ? 'out-of-stock' : ''}" data-product-id="${esc(p.id)}">
          ${inCartBadge}
          <div class="tpv-product-image-container">
            ${renderProductImage(p.imageData, p.name)}
          </div>
          <div class="tpv-product-body">
            <div class="tpv-product-title" title="${esc(p.name)}">${esc(p.name)}</div>
            <div class="tpv-product-desc" title="${esc(p.description || '')}">${esc(p.description || '')}</div>
          </div>
          <div class="tpv-product-footer">
            <span class="tpv-product-price">${eur(p.unitPrice)}</span>
            <div class="tpv-product-badges">
              ${barcodeBadge}
              ${stockBadge}
              ${restockActionBadge}
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Click handler on restock buttons
    grid.querySelectorAll('.tpv-card-restock-btn').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        openRestockModal(btn.dataset.restockPid);
      };
    });

    grid.querySelectorAll('.tpv-badge-restock-pending').forEach(badge => {
      badge.onclick = e => {
        e.stopPropagation();
        $('tab-restock')?.click();
      };
    });

    // Click handler on barcode badge
    grid.querySelectorAll('.tpv-product-barcode').forEach(badge => {
      badge.onclick = e => {
        e.stopPropagation();
        const pId = badge.dataset.barcodePid;
        const p = products.find(item => item.id === pId);
        openEanManagerModal(p?.barcode || '', pId);
      };
    });

    // Click handler on products
    grid.querySelectorAll('.tpv-product-card').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('.tpv-card-restock-btn') || e.target.closest('.tpv-badge-restock-pending') || e.target.closest('.tpv-product-barcode')) return;
        const pId = card.dataset.productId;
        const p = products.find(item => item.id === pId);
        if (!p) return;
        if (!p.isActive) {
          openRestockModal(pId);
          return;
        }
        if (p.stock <= 0) return;
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
    renderTicketClouds();
    saveTicketsToStorage();
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
          <div class="tpv-item-thumb">
            ${renderProductImage(p.imageData, p.name, true)}
          </div>
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
        renderTicketClouds();
        saveTicketsToStorage();
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
    syncActiveTicketFromUI();
    renderTicketClouds();
  };

  $('buyer-opt-client').onclick = () => {
    buyerKind = 'client';
    $('buyer-opt-client').classList.add('selected');
    $('buyer-opt-walkin').classList.remove('selected');
    $('client-select-wrap').hidden = false;
    $('payment-mode-select').querySelector('[value=PENDING]').disabled = false;
    const cur = getActiveTicket();
    const opt = $('client-select').selectedOptions?.[0];
    if (opt && opt.value) {
      cur.clientId = opt.value;
      cur.clientName = opt.textContent.trim();
      if (/^Ticket \d+$/.test(cur.name)) {
        cur.name = `👤 ${cur.clientName.split(' — ')[0].trim()}`;
        if ($('current-ticket-title')) $('current-ticket-title').textContent = cur.name;
      }
    }
    syncActiveTicketFromUI();
    renderTicketClouds();
  };

  $('client-search').oninput = renderClientOptions;

  $('client-select').onchange = () => {
    const opt = $('client-select').selectedOptions?.[0];
    const cur = getActiveTicket();
    if (opt && opt.value) {
      cur.clientId = opt.value;
      cur.clientName = opt.textContent.trim();
      if (/^Ticket \d+$/.test(cur.name) || cur.name.startsWith('👤 ')) {
        cur.name = `👤 ${cur.clientName.split(' — ')[0].trim()}`;
        if ($('current-ticket-title')) $('current-ticket-title').textContent = cur.name;
      }
    }
    syncActiveTicketFromUI();
    renderTicketClouds();
  };

  $('payment-mode-select').onchange = e => {
    paymentMode = e.target.value;
    const isPending = paymentMode === 'PENDING';
    $('payment-methods-grid').style.opacity = isPending ? '0.5' : '1';
    $('cash-calc-wrap').hidden = isPending || paymentMethod !== 'EFECTIVO';
    syncActiveTicketFromUI();
    renderTicketClouds();
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
      syncActiveTicketFromUI();
      renderTicketClouds();
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

  $('cash-tendered').oninput = () => {
    getActiveTicket().cashTendered = $('cash-tendered').value;
    updateCashCalculator();
    saveTicketsToStorage();
  };

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
      getActiveTicket().cashTendered = $('cash-tendered').value;
      updateCashCalculator();
      saveTicketsToStorage();
    };
  });

  // View mode toggle (Tarjetas / Listado)
  $('view-mode-grid')?.addEventListener('click', () => {
    viewMode = 'grid';
    localStorage.setItem('tpv_catalog_view_mode', 'grid');
    updateViewModeUI();
  });

  $('view-mode-list')?.addEventListener('click', () => {
    viewMode = 'list';
    localStorage.setItem('tpv_catalog_view_mode', 'list');
    updateViewModeUI();
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

  // --- BARCODE HARDWARE SCANNER LISTENER ---
  let barcodeBuffer = '';
  let lastKeyTime = 0;
  const SCANNER_CHAR_INTERVAL = 45; // ms between consecutive keystrokes from a barcode scanner gun
  const MIN_SCAN_LENGTH = 3;

  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isTextInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    const now = Date.now();
    const isEnter = e.key === 'Enter';

    if (isEnter) {
      if (barcodeBuffer.length >= MIN_SCAN_LENGTH) {
        const elapsedSinceLast = now - lastKeyTime;
        if (elapsedSinceLast < SCANNER_CHAR_INTERVAL * 5) {
          const scanned = barcodeBuffer.trim();
          barcodeBuffer = '';
          lastKeyTime = 0;
          e.preventDefault();
          e.stopPropagation();

          if (isTextInput && activeEl.id !== 'product-search' && activeEl.id !== 'barcode-manual-input') {
            if (activeEl.value.endsWith(scanned)) {
              activeEl.value = activeEl.value.slice(0, -scanned.length).trim();
            }
          }
          handleBarcodeScanned(scanned, activeEl?.id === 'product-search');
          return;
        }
      }
      barcodeBuffer = '';
      lastKeyTime = 0;
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (now - lastKeyTime > SCANNER_CHAR_INTERVAL) {
        barcodeBuffer = '';
      }
      barcodeBuffer += e.key;
      lastKeyTime = now;
    }
  }, true);

  // Search input keydown listener (Enter triggers scan lookup)
  $('product-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = $('product-search').value.trim();
      if (val) {
        e.preventDefault();
        handleBarcodeScanned(val, true);
      }
    }
  });

  // Manual Barcode Dialog handlers
  $('btn-barcode-mode').onclick = () => {
    $('barcode-manual-form').reset();
    $('barcode-manual-error').textContent = '';
    $('barcode-manual-dialog').showModal();
    setTimeout(() => $('barcode-manual-input').focus(), 50);
  };
  $('btn-close-barcode-manual').onclick = () => $('barcode-manual-dialog').close();
  $('btn-cancel-barcode-manual').onclick = () => $('barcode-manual-dialog').close();

  $('barcode-manual-form').onsubmit = (e) => {
    e.preventDefault();
    const val = $('barcode-manual-input').value.trim();
    if (!val) return;
    $('barcode-manual-dialog').close();
    handleBarcodeScanned(val);
  };

  // EAN Manager Modal handlers
  $('ean-product-select').onchange = updateEanProductPreview;

  $('ean-manager-form').onsubmit = async (e) => {
    e.preventDefault();
    const pId = $('ean-product-select').value;
    if (!pId) {
      $('ean-form-error').textContent = 'Selecciona el producto al que deseas asignar este código.';
      return;
    }
    const p = products.find(item => item.id === pId);
    if (!p) return;

    const mode = document.querySelector('input[name="ean-update-mode"]:checked')?.value || 'replace';
    let newBarcodeValue = currentEanToAssign;
    if (mode === 'append' && p.barcode) {
      const existingTokens = p.barcode.split(/[\s,;/]+/).map(t => t.trim()).filter(Boolean);
      if (!existingTokens.includes(currentEanToAssign)) {
        newBarcodeValue = `${p.barcode}, ${currentEanToAssign}`;
      } else {
        newBarcodeValue = p.barcode;
      }
    }

    const btn = $('btn-save-ean');
    btn.disabled = true;
    $('ean-form-error').textContent = '';

    try {
      await api(`inventory/products/${pId}/barcode`, 'PATCH', { barcode: newBarcodeValue });

      // Update local product record
      p.barcode = newBarcodeValue;

      // Refresh in background
      api('inventory/products').then(res => {
        if (res.products) products = res.products;
        renderCatalog();
      }).catch(() => {});

      renderCatalog();
      $('ean-manager-dialog').close();

      const autoAdd = $('ean-auto-add-cart').checked;
      if (autoAdd && p.isActive && p.stock > 0) {
        addToCart(p.id, 1);
        playScanSound('success');
        showNotice(`✓ Código ${currentEanToAssign} asignado a "${p.name}" y añadido 1 ud al ticket.`);
      } else {
        showNotice(`✓ Código ${currentEanToAssign} asignado correctamente a "${p.name}".`);
      }
    } catch (err) {
      $('ean-form-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };

  $('btn-close-ean-dialog').onclick = () => $('ean-manager-dialog').close();
  $('btn-cancel-ean-dialog').onclick = () => $('ean-manager-dialog').close();

  $('btn-create-product-with-ean').onclick = () => {
    $('ean-manager-dialog').close();
    window.location.href = `/productos.html?nuevo=1&barcode=${encodeURIComponent(currentEanToAssign)}`;
  };

  $('btn-clear-ticket').onclick = () => {
    if (cart.size > 0 && confirm('¿Deseas vaciar el ticket de venta actual?')) {
      cart.clear();
      $('cash-tendered').value = '';
      const cur = getActiveTicket();
      if (cur) {
        cur.items = [];
        cur.cashTendered = '';
      }
      renderCart();
      renderCatalog();
      renderTicketClouds();
      saveTicketsToStorage();
    }
  };

  // --- MULTI-TICKETS / TICKETS EN ESPERA HANDLERS ---
  $('btn-new-ticket').onclick = () => createNewTicket();
  $('btn-hold-ticket').onclick = () => putCurrentTicketOnHold();
  $('btn-hold-current-ticket').onclick = () => putCurrentTicketOnHold();

  $('btn-rename-ticket').onclick = () => {
    const cur = getActiveTicket();
    $('rename-ticket-input').value = cur ? cur.name : '';
    $('rename-ticket-dialog').showModal();
    setTimeout(() => $('rename-ticket-input').select(), 50);
  };

  $('btn-close-rename-dialog').onclick = () => $('rename-ticket-dialog').close();
  $('btn-cancel-rename-dialog').onclick = () => $('rename-ticket-dialog').close();

  $('rename-ticket-form').onsubmit = (e) => {
    e.preventDefault();
    const newName = $('rename-ticket-input').value.trim();
    if (!newName) return;
    const cur = getActiveTicket();
    if (cur) {
      cur.name = newName;
      $('current-ticket-title').textContent = cur.name;
      renderTicketClouds();
      saveTicketsToStorage();
    }
    $('rename-ticket-dialog').close();
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

      // Reset ticket or advance to next waiting ticket
      const completedTicketId = activeTicketId;
      if (tickets.length > 1) {
        tickets = tickets.filter(t => t.id !== completedTicketId);
        activeTicketId = tickets[0].id;
        syncActiveTicketToUI();
        renderCart();
        showNotice(`Venta completada por ${eur(sale.totalAmount)}. Reanudando "${getActiveTicket().name}".`);
      } else {
        cart.clear();
        $('cash-tendered').value = '';
        const cur = getActiveTicket();
        cur.name = 'Ticket 1';
        cur.buyerKind = 'walkin';
        cur.clientId = null;
        cur.clientName = '';
        cur.cashTendered = '';
        cur.items = [];
        syncActiveTicketToUI();
        renderCart();
        showNotice(`Venta completada por ${eur(sale.totalAmount)}.`);
      }
      renderTicketClouds();
      saveTicketsToStorage();

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
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="tpv-item-thumb" style="width:34px;height:34px;flex-shrink:0">
                  ${renderProductImage(prod?.imageData, item.name, true)}
                </div>
                <strong>${esc(item.name)}</strong>
              </div>
            </td>
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
    { btn: $('tab-balance'), panel: $('panel-balance') },
    { btn: $('tab-restock'), panel: $('panel-restock') }
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
      if (btn === $('tab-restock')) renderRestockSection();
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

  // --- 13. MÓDULO: FALTA PARA PEDIR (REPOSICIÓN Y PEDIDOS DESDE RECEPCIÓN) ---
  let restockSelectedSource = 'all';

  function populateRestockSelect(preselectedProductId = '', filterSource = 'all') {
    const sel = $('restock-product-select');
    const activeProds = products.filter(p => p.isActive);
    const inactiveProds = products.filter(p => !p.isActive);

    let html = '<option value="">-- Seleccionar producto --</option>';

    if (filterSource === 'all' || filterSource === 'active') {
      if (activeProds.length > 0) {
        html += `<optgroup id="optgroup-active-products" label="🟢 Productos que ya existen en tienda (${activeProds.length})">`;
        html += activeProds.map(p => `
          <option value="${esc(p.id)}" data-inactive="false" ${p.id === preselectedProductId ? 'selected' : ''}>
            ${esc(p.name)} — ${eur(p.unitPrice)} (Stock actual: ${p.stock} uds)
          </option>
        `).join('');
        html += '</optgroup>';
      }
    }

    if (filterSource === 'all' || filterSource === 'inactive') {
      if (inactiveProds.length > 0) {
        html += `<optgroup id="optgroup-inactive-products" label="📦 Productos que han existido (anteriores / descatalogados) (${inactiveProds.length})">`;
        html += inactiveProds.map(p => `
          <option value="${esc(p.id)}" data-inactive="true" ${p.id === preselectedProductId ? 'selected' : ''}>
            ${esc(p.name)} — [Anterior / Descatalogado] (Último precio: ${eur(p.unitPrice)})
          </option>
        `).join('');
        html += '</optgroup>';
      } else if (filterSource === 'inactive') {
        html += '<option disabled>No hay productos descatalogados o anteriores registrados en el centro</option>';
      }
    }

    html += `
      <optgroup label="➕ Otro artículo">
        <option value="__custom__" ${filterSource === 'custom' ? 'selected' : ''}>➕ Escribir manualmente otro artículo no registrado</option>
      </optgroup>
    `;

    sel.innerHTML = html;

    if (preselectedProductId) {
      sel.value = preselectedProductId;
    } else if (filterSource === 'custom') {
      sel.value = '__custom__';
    }

    updateRestockSelectState();
  }

  function updateRestockSelectState() {
    const sel = $('restock-product-select');
    const isCustom = sel.value === '__custom__';
    $('restock-custom-wrap').hidden = !isCustom;
    $('restock-custom-name').required = isCustom;

    const selectedOpt = sel.selectedOptions?.[0];
    const isInactive = selectedOpt?.dataset?.inactive === 'true';
    const notice = $('restock-inactive-notice');
    if (notice) notice.style.display = isInactive ? 'block' : 'none';

    if (isCustom) $('restock-custom-name').focus();
  }

  function openRestockModal(preselectedProductId = '') {
    restockSelectedSource = 'all';

    // If preselected product is inactive, highlight inactive source
    const preProd = preselectedProductId ? products.find(p => p.id === preselectedProductId) : null;
    if (preProd && !preProd.isActive) {
      restockSelectedSource = 'inactive';
    }

    $('restock-source-pills')?.querySelectorAll('.tpv-cat-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.source === restockSelectedSource);
    });

    populateRestockSelect(preselectedProductId, restockSelectedSource);

    $('restock-custom-name').value = '';
    $('restock-quantity').value = '1';
    $('restock-notes').value = '';
    $('restock-form-error').textContent = '';
    $('restock-dialog').showModal();
  }

  $('restock-source-pills')?.querySelectorAll('.tpv-cat-pill').forEach(pill => {
    pill.onclick = () => {
      $('restock-source-pills').querySelectorAll('.tpv-cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      restockSelectedSource = pill.dataset.source;
      const currentSelectedId = $('restock-product-select').value;
      populateRestockSelect(currentSelectedId !== '__custom__' ? currentSelectedId : '', restockSelectedSource);
    };
  });

  $('restock-product-select').onchange = () => {
    updateRestockSelectState();
  };

  $('btn-quick-restock').onclick = () => openRestockModal();
  $('btn-catalog-restock').onclick = () => openRestockModal();
  $('btn-open-restock-modal').onclick = () => openRestockModal();
  $('btn-refresh-restock').onclick = async () => {
    await refreshRestockRequests();
    showNotice('Lista de pedidos y reposición actualizada.');
  };

  async function refreshRestockRequests() {
    try {
      const res = await api('inventory/restock');
      restockRequests = res.requests || [];
      renderRestockSection();
      renderCatalog();
    } catch (e) {
      showNotice(e.message, true);
    }
  }

  $('restock-filter-pills').querySelectorAll('.tpv-cat-pill').forEach(pill => {
    pill.onclick = () => {
      $('restock-filter-pills').querySelectorAll('.tpv-cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedRestockStatus = pill.dataset.status;
      renderRestockSection();
    };
  });

  $('restock-search-input').oninput = () => {
    renderRestockSection();
  };

  function renderRestockSection() {
    const pending = restockRequests.filter(r => r.status === 'PENDIENTE');
    const ordered = restockRequests.filter(r => r.status === 'PEDIDO');
    const received = restockRequests.filter(r => r.status === 'RECIBIDO');

    $('badge-restock-count').textContent = pending.length;
    $('kpi-restock-pending').textContent = pending.length;
    $('kpi-restock-ordered').textContent = ordered.length;
    $('kpi-restock-received').textContent = received.length;

    const query = ($('restock-search-input')?.value || '').trim().toLowerCase();

    const filtered = restockRequests.filter(r => {
      if (selectedRestockStatus !== 'ALL' && r.status !== selectedRestockStatus) return false;
      if (!query) return true;
      const haystack = `${r.productName} ${r.notes || ''} ${r.requestedByName || ''} ${r.status}`.toLowerCase();
      return haystack.includes(query);
    });

    const tbody = $('restock-requests-tbody');
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#7e8b92">No hay registros de reposición para este filtro.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const isLinked = !!r.productId;
      let prodName = '';
      let stockDisplay = '—';

      if (isLinked) {
        const prod = r.product || products.find(p => p.id === r.productId);
        const isCurrent = prod && prod.isActive;
        const badgeTag = isCurrent
          ? '<span style="font-size:10px;font-weight:700;color:#1e6338;background:#ebf7ee;border:1px solid #bce6c6;padding:1px 5px;border-radius:4px">Existe en tienda</span>'
          : '<span style="font-size:10px;font-weight:700;color:#49545c;background:#f0f2f3;border:1px solid #d2d8dc;padding:1px 5px;border-radius:4px">Existió antes (Descatalogado)</span>';

        prodName = `
          <div style="display:flex;align-items:center;gap:10px">
            <div class="tpv-item-thumb" style="width:34px;height:34px;flex-shrink:0">
              ${renderProductImage(prod?.imageData, r.productName, true)}
            </div>
            <div>
              <div><strong>${esc(r.productName)}</strong> <span style="font-size:11px;color:#6b767d">(${eur(prod?.unitPrice || 0)})</span></div>
              <div style="margin-top:2px">${badgeTag}</div>
            </div>
          </div>
        `;

        const currentStock = prod ? Number(prod.stock) : 0;
        stockDisplay = !isCurrent
          ? '<span style="color:#6b7280;font-size:12px">0 (Inactivo)</span>'
          : currentStock <= 0
          ? '<span style="color:#af241d;font-weight:700">Agotado (0)</span>'
          : `<span style="font-weight:600">${currentStock} uds</span>`;
      } else {
        prodName = `
          <div style="display:flex;align-items:center;gap:10px">
            <div class="tpv-item-thumb" style="width:34px;height:34px;flex-shrink:0">
              ${renderProductImage(null, r.productName, true)}
            </div>
            <div>
              <div><strong>${esc(r.productName)}</strong></div>
              <div style="margin-top:2px"><span style="font-size:10px;font-weight:700;color:#9c4c00;background:#fef5ea;border:1px solid #f9dab1;padding:1px 5px;border-radius:4px">Artículo nuevo</span></div>
            </div>
          </div>
        `;
      }

      let statusBadge = '';
      if (r.status === 'PENDIENTE') {
        statusBadge = '<span class="restock-pill-badge pending">⏳ Falta pedir</span>';
      } else if (r.status === 'PEDIDO') {
        statusBadge = '<span class="restock-pill-badge ordered">🚚 Pedido al proveedor</span>';
      } else if (r.status === 'RECIBIDO') {
        statusBadge = '<span class="restock-pill-badge received">✅ Recibido y repuesto</span>';
      } else {
        statusBadge = '<span class="restock-pill-badge cancelled">Anulado</span>';
      }

      let actionsHtml = '';
      if (r.status === 'PENDIENTE') {
        actionsHtml = `
          <button class="btn-restock-action info-subtle btn-mark-ordered" data-id="${esc(r.id)}" type="button" title="Marcar como ya pedido al proveedor">🚚 Marcar pedido</button>
          <button class="btn-restock-action primary-subtle btn-mark-received" data-id="${esc(r.id)}" type="button" title="Marcar como recibido">✅ Recibido</button>
          <button class="btn-restock-action danger-subtle btn-delete-restock" data-id="${esc(r.id)}" type="button" title="Eliminar de la lista">🗑️</button>
        `;
      } else if (r.status === 'PEDIDO') {
        actionsHtml = `
          <button class="btn-restock-action primary-subtle btn-mark-received" data-id="${esc(r.id)}" type="button" title="Marcar como recibido">✅ Recibido</button>
          <button class="btn-restock-action btn-mark-pending" data-id="${esc(r.id)}" type="button" title="Devolver a pendientes">⏳ Pendiente</button>
          <button class="btn-restock-action danger-subtle btn-delete-restock" data-id="${esc(r.id)}" type="button" title="Eliminar de la lista">🗑️</button>
        `;
      } else {
        actionsHtml = `
          <span style="font-size:11px;color:#267359;margin-right:6px">Completado</span>
          <button class="btn-restock-action danger-subtle btn-delete-restock" data-id="${esc(r.id)}" type="button" title="Eliminar registro">🗑️</button>
        `;
      }

      return `
        <tr>
          <td>
            <div style="font-weight:600">${dateFormat(r.createdAt)}</div>
            <div style="font-size:11px;color:#6b767d">${timeFormat(r.createdAt)}</div>
          </td>
          <td>${prodName}</td>
          <td><strong style="font-size:14px">${r.quantity}</strong> uds</td>
          <td>${stockDisplay}</td>
          <td><span style="font-size:12px;color:#435158">${esc(r.requestedByName || r.requestedBy || 'Recepción')}</span></td>
          <td><span style="font-size:12px;color:#55636a">${esc(r.notes || '—')}</span></td>
          <td>${statusBadge}</td>
          <td style="text-align:right;white-space:nowrap">${actionsHtml}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-mark-ordered').forEach(btn => {
      btn.onclick = async () => {
        try {
          await api(`inventory/restock/${btn.dataset.id}`, 'PATCH', { status: 'PEDIDO' });
          showNotice('Producto marcado como pedido al proveedor.');
          await refreshRestockRequests();
        } catch (e) {
          showNotice(e.message, true);
        }
      };
    });

    tbody.querySelectorAll('.btn-mark-pending').forEach(btn => {
      btn.onclick = async () => {
        try {
          await api(`inventory/restock/${btn.dataset.id}`, 'PATCH', { status: 'PENDIENTE' });
          showNotice('Producto devuelto a pendiente de pedir.');
          await refreshRestockRequests();
        } catch (e) {
          showNotice(e.message, true);
        }
      };
    });

    tbody.querySelectorAll('.btn-mark-received').forEach(btn => {
      btn.onclick = async () => {
        const item = restockRequests.find(r => r.id === btn.dataset.id);
        let addToStock = false;
        if (item && item.productId) {
          const prod = products.find(p => p.id === item.productId);
          const wasInactive = prod && !prod.isActive;
          const msg = wasInactive
            ? `¿El pedido de "${item.productName}" ha llegado? Pulsa Aceptar para sumar ${item.quantity} uds y REACTIVAR este producto en la tienda, o Cancelar para solo marcarlo recibido.`
            : `¿El pedido de "${item.productName}" ha llegado? Pulsa Aceptar para sumar ${item.quantity} uds al stock de la tienda, o Cancelar para solo marcarlo recibido.`;
          addToStock = window.confirm(msg);
        }
        try {
          await api(`inventory/restock/${btn.dataset.id}`, 'PATCH', { status: 'RECIBIDO', addToStock });
          showNotice(addToStock ? `Producto recibido y ${item.quantity} uds añadidas al stock.` : 'Producto marcado como recibido.');
          const prodRes = await api('inventory/products');
          products = prodRes.products || [];
          await refreshRestockRequests();
        } catch (e) {
          showNotice(e.message, true);
        }
      };
    });

    tbody.querySelectorAll('.btn-delete-restock').forEach(btn => {
      btn.onclick = async () => {
        if (!window.confirm('¿Deseas eliminar este registro de falta para pedir?')) return;
        try {
          await api(`inventory/restock/${btn.dataset.id}`, 'DELETE');
          showNotice('Registro eliminado.');
          await refreshRestockRequests();
        } catch (e) {
          showNotice(e.message, true);
        }
      };
    });
  }

  $('restock-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('btn-submit-restock');
    btn.disabled = true;
    const err = $('restock-form-error');
    err.textContent = '';

    try {
      const pSelectVal = $('restock-product-select').value;
      const isCustom = pSelectVal === '__custom__';
      let productId = null;
      let productName = '';

      if (isCustom) {
        productName = $('restock-custom-name').value.trim();
        if (!productName) throw new Error('Escribe el nombre del artículo o producto que falta.');
      } else {
        if (!pSelectVal) throw new Error('Selecciona un producto del catálogo o elige otro artículo.');
        productId = pSelectVal;
        const p = products.find(item => item.id === productId);
        productName = p ? p.name : '';
      }

      const qty = parseInt($('restock-quantity').value, 10);
      if (isNaN(qty) || qty < 1) throw new Error('Indica una cantidad válida a pedir (mínimo 1).');

      const priority = $('restock-priority').value;
      let notes = $('restock-notes').value.trim();
      if (priority === 'ALTA') {
        notes = (notes ? `[URGENTE] ${notes}` : '[URGENTE]').trim();
      }

      await api('inventory/restock', 'POST', {
        productId,
        productName,
        quantity: qty,
        notes
      });

      $('restock-dialog').close();
      showNotice(`Anotado correctamente: ${qty} uds de "${productName}" para pedir.`);
      await refreshRestockRequests();
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

