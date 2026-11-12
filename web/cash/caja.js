(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const moneyFormatter = new Intl.NumberFormat('es-ES', { style:'currency', currency:'EUR' });
  const euros = value => moneyFormatter.format(Number(value || 0));
  const date = value => value ? new Date(value).toLocaleString('es-ES', { timeZone:'Europe/Madrid' }) : '—';
  const methods = { EFECTIVO:'Efectivo', TARJETA:'Tarjeta', BIZUM:'Bizum', TRANSFERENCIA:'Transferencia', OTRO:'Otro' };
  const paymentStates = { PAGADO:'Pagado', PARCIAL:'Pago parcial', PENDIENTE:'Pago pendiente', SIN_VERIFICAR:'Sin verificar' };

  let current = null, shown = null, selectedId = null, page = 1, busy = false, openKey, movementKey, movementSessionId, closeKey, closingId, closingRevision, closingExpected;
  let products = [], clients = [], sales = [], me, operatingGym, centers = [], returning = null, saleKey, returnKey, salesPage = 1, salesRequest = 0, paying = null, paymentKey, paymentAction = 'payments';

  async function api(path, method = 'GET', body) {
    const response = await fetch('/api/' + path, { method, headers:{'Content-Type':'application/json'}, body:body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo completar la operación.');
    return data;
  }

  const emptyRow = (columns, text) => `<tr><td colspan="${columns}">${text}</td></tr>`;
  const notice = error => { $('cash-notice').textContent = error.message || error; };

  function render(session, unassigned) {
    shown = session;
    const closed = Boolean(session?.closedAt), summary = session?.summary;
    $('open-cash').disabled = Boolean(current);
    $('open-cash').hidden = Boolean(current);
    $('current-view').hidden = !selectedId;
    $('empty-cash').hidden = Boolean(session);
    $('session-content').hidden = !session;
    $('session-title').textContent = session ? `Caja del ${session.businessDate.split('-').reverse().join('/')}` : 'Caja sin abrir';
    $('session-state').textContent = session ? closed ? 'Cerrada' : 'Abierta' : 'Pendiente de apertura';
    $('session-state').className = 'cash-pill' + (closed ? ' closed' : '');
    $('session-meta').textContent = session ? `Abierta por ${session.openedByName} · ${date(session.openedAt)}${closed ? ` · Cerrada por ${session.closedByName} · ${date(session.closedAt)}` : ''}` : '';
    $('outside-notice').hidden = !unassigned;
    $('outside-notice').textContent = `${unassigned} cobro(s) o devolución(es) registrados hoy fuera de una caja abierta o con fecha anterior a su apertura. No se han añadido al cajón actual ni a cierres anteriores. El efectivo inicial debe reflejar el dinero que ya hay en el cajón.`;
    if (!session) {
      $('expected-amount').textContent = '—';
      $('cash-formula').textContent = 'Abre la caja para comenzar el recuento.';
      return;
    }
    const cards = [
      ['VENTAS REGISTRADAS', summary.soldTotal, `${summary.sales.length} ventas · Productos devueltos: ${euros(summary.returnsTotal)} · Neto: ${euros(summary.netSales)}`],
      ['COBRADO EN EFECTIVO', summary.collections.EFECTIVO, `De ventas anteriores: ${euros(summary.debtCollections.EFECTIVO)} (incluido)`],
      ['COBRADO CON TARJETA', summary.collections.TARJETA, `De ventas anteriores: ${euros(summary.debtCollections.TARJETA)} (incluido) · Reembolsos por tarjeta: ${euros(summary.refunds.TARJETA)}`],
      ['COBRADO POR BIZUM', summary.collections.BIZUM, `De ventas anteriores: ${euros(summary.debtCollections.BIZUM)} (incluido) · Reembolsos por Bizum: ${euros(summary.refunds.BIZUM)}`],
      ['ENTRADAS DE EFECTIVO', summary.cashIn, 'Cambio y otras entradas ajenas a ventas'],
      ['SALIDAS Y REEMBOLSOS EN EFECTIVO', Number(summary.cashOut) + Number(summary.refunds.EFECTIVO), `Retiradas y otras salidas: ${euros(summary.cashOut)} · Reembolsos: ${euros(summary.refunds.EFECTIVO)}`],
    ];
    $('cash-totals').innerHTML = cards.map(([label, value, info]) => `<article><small>${label}</small><strong>${euros(value)}</strong><p>${esc(info)}</p></article>`).join('');
    $('cash-session-actions').hidden = closed;
    $('closing-result').hidden = !closed;
    if (closed) {
      const diff = Number(session.difference);
      $('closing-result').className = 'cash-close-result' + (diff === 0 ? ' balanced' : '');
      $('closing-result').innerHTML = `<strong>${diff === 0 ? 'La caja cuadra' : diff > 0 ? 'Sobra dinero: ' + euros(diff) : 'Falta dinero: ' + euros(-diff)}</strong><p>Esperado: ${euros(session.expectedAmount)} · Contado: ${euros(session.countedAmount)} · Diferencia: ${euros(diff)}</p><p>${esc(session.closingNote || 'Sin observaciones.')}</p>`;
    }
    $('cash-sales').innerHTML = summary.sales.map(s => `<tr><td>${date(s.at)}<small>${esc(s.client)}</small></td><td>${s.products.map(p => `${esc(p.name)} × ${p.quantity} · ${euros(p.unitPrice)}`).join('<br>')}</td><td>${euros(s.amount)}</td><td>${esc(({COMPLETADA:'Confirmada',CANCELADA:'Anulada',REEMBOLSADA:'Devuelta'})[s.status] || s.status)}</td></tr>`).join('') || emptyRow(4, 'Sin ventas en esta caja.');
    $('cash-payments').innerHTML = summary.payments.map(p => `<tr><td>${date(p.at)}<small>${esc(p.client)}</small></td><td>${p.kind === 'REFUND' ? 'Dinero devuelto' : p.previousDebt ? 'Cobro de venta anterior' : 'Cobro'}${p.note ? `<small>${esc(p.note)}</small>` : ''}</td><td>${esc(methods[p.method] || p.method)}</td><td>${p.kind === 'REFUND' ? '−' : ''}${euros(p.amount)}</td><td><a href="#sales-panel" data-find-sale="${esc(p.saleId)}">${esc(p.saleId)}</a></td></tr>`).join('') || emptyRow(5, 'Sin cobros ni devoluciones de dinero.');
    $('cash-movements').innerHTML = summary.movements.map(m => `<tr><td>${date(m.createdAt)}</td><td>${m.direction === 'IN' ? 'Entrada' : 'Salida'}<small>${esc(m.reason)}</small></td><td>${m.direction === 'IN' ? '+' : '−'}${euros(m.amount)}</td><td>${esc(m.actorName)}</td></tr>`).join('') || emptyRow(4, 'Sin movimientos manuales.');
    $('cash-returns').innerHTML = summary.returns.map(r => `<p>${date(r.at)} · ${esc(r.reason)} · ${euros(r.amount)} · Venta ${esc(r.saleId)}</p>`).join('') || '<p>Sin devoluciones de productos en esta caja.</p>';
    $('expected-amount').textContent = euros(summary.expectedCash);
    $('cash-formula').textContent = `${euros(session.openingAmount)} inicial + ${euros(summary.collections.EFECTIVO)} cobros + ${euros(summary.cashIn)} entradas − ${euros(summary.refunds.EFECTIVO)} reembolsos − ${euros(summary.cashOut)} salidas. Tarjeta y Bizum se muestran por separado.`;
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const response = await api('cash/current');
      current = response.session;
      const session = selectedId ? await api('cash/sessions/' + selectedId) : current;
      render(session, response.unassignedPayments);
    } finally { busy = false; }
  }

  async function history() {
    const q = new URLSearchParams({ page:String(page) });
    if ($('cash-from').value) q.set('from', $('cash-from').value);
    if ($('cash-to').value) q.set('to', $('cash-to').value);
    const result = await api('cash/sessions?' + q);
    $('cash-history').innerHTML = result.sessions.map(s => `<tr><td>${esc(s.businessDate)}<small>${date(s.openedAt)} · ${esc(s.openedByName)}</small></td><td>${euros(s.openingAmount)}</td><td>${s.closedAt ? euros(s.collectedAmount) : 'En curso'}</td><td>${s.closedAt ? euros(s.expectedAmount) : 'En curso'}</td><td>${s.closedAt ? euros(s.countedAmount) : '—'}</td><td>${s.closedAt ? Number(s.difference) < 0 ? 'Falta ' + euros(-Number(s.difference)) : Number(s.difference) > 0 ? 'Sobra ' + euros(s.difference) : 'Cuadra' : '—'}</td><td>${s.closedAt ? 'Cerrada' : 'Abierta'}</td><td><button data-session="${s.id}">Ver detalle</button></td></tr>`).join('') || emptyRow(8, 'Todavía no hay cajas para estas fechas.');
    $('history-page').textContent = 'Página ' + result.page;
    $('history-previous').disabled = page <= 1;
    $('history-next').disabled = !result.hasNext;
  }

  // --- Historial completo de ventas y cobros ---
  const options = items => items.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');

  async function loadProducts() {
    products = (await api('inventory/products')).products || [];
    const selected = $('filter-product').value;
    $('filter-product').innerHTML = '<option value="">Todos los productos</option>' + options(products);
    $('filter-product').value = selected;
  }

  function buyerOptions() {
    const q = $('buyer-search').value.toLocaleLowerCase('es');
    $('buyer').innerHTML = '<option value="">Selecciona un cliente</option>' + options(clients.filter(c => [c.name, c.email, c.phone].join(' ').toLocaleLowerCase('es').includes(q)));
  }

  function addLine() {
    const row = document.createElement('div');
    row.className = 'cart-line';
    row.innerHTML = `<label>Producto<select required>${options(products.filter(p => p.isActive && p.stock > 0).map(p => ({ ...p, name: p.name + ' · ' + euros(p.unitPrice) + ' · ' + p.stock + ' disponibles' })))}</select></label><label>Unidades<input type="number" min="1" max="10000" step="1" value="1" required></label><button type="button">Quitar</button>`;
    row.querySelector('button').onclick = () => { row.remove(); total(); };
    row.oninput = total;
    row.onchange = total;
    $('cart').append(row);
    total();
  }

  const cart = () => [...$('cart').children].map(row => ({ productId: row.querySelector('select').value, quantity: Number(row.querySelector('input').value) }));
  function total() {
    $('total').textContent = 'Total estimado: ' + euros(cart().reduce((s, l) => s + Number(products.find(p => p.id === l.productId)?.unitPrice || 0) * l.quantity, 0));
  }

  function updatePaymentMode() {
    const registered = $('buyer-kind').value === 'client';
    $('sale-payment-mode').querySelector('[value=PENDING]').disabled = !registered;
    if (!registered) $('sale-payment-mode').value = 'PAID';
    $('sale-method-wrap').hidden = $('sale-payment-mode').value === 'PENDING';
    $('buyer-hint').textContent = registered ? 'La compra y sus cobros quedarán asociados a la ficha del cliente.' : 'No se pedirán datos personales ni se creará una ficha. El cobro debe completarse al confirmar.';
  }

  function paymentInfo(s) {
    const pending = Number(s.outstandingAmount || 0), paid = Number(s.paidAmount || 0);
    return `<div class="payment-summary ${pending > 0 ? 'has-debt' : ''}"><strong>${paymentStates[s.paymentStatus] || 'Sin verificar'}</strong><p>Cobros recibidos: ${euros(s.receivedAmount ?? paid)} · Dinero devuelto: ${euros(s.refundedAmount || 0)} · Pendiente: ${euros(pending)}</p>${Number(s.refundDue) > 0 ? `<p>Importe a devolver: ${euros(s.refundDue)}. Los cobros originales se conservan.</p><button data-refund="${s.id}">Registrar dinero devuelto</button>` : ''}${pending > 0 ? `<button data-pay="${s.id}">Registrar pago / Marcar pagado</button>` : ''}${s.paymentStatus === 'SIN_VERIFICAR' && s.status === 'COMPLETADA' && Number(s.netAmount) > 0 ? `<button data-verify="${s.id}">Confirmar que ya está pagado</button>` : ''}${s.clientId ? `<a href="/clientes/${encodeURIComponent(s.clientId)}/ficha">Ver ficha del cliente</a>` : ''}<ul>${(s.payments || []).map(p => `<li>${p.kind === 'REFUND' ? 'Devolución de dinero' : 'Cobro'} · ${euros(p.amount)} · ${esc(methods[p.method] || p.method)} · ${new Date(p.paidAt || p.createdAt).toLocaleString('es-ES')} · ${p.kind === 'REFUND' ? 'Devuelto' : esc(paymentStates[p.status] || p.status)}${p.note ? ' · ' + esc(p.note) : ''}</li>`).join('')}</ul></div>`;
  }

  function returnInfo(s) {
    return `<ul class="return-history">${(s.returnHistory || []).map(r => `<li>Devolución · ${new Date(r.at).toLocaleString('es-ES')} · ${esc(r.reason)}<ul>${(r.lines || []).map(l => `<li>${esc(s.lines.find(row => row.id === l.lineId)?.description || 'Producto')} × ${Number(l.quantity)}${l.restock === false ? ' · No vuelve al stock' : ''}</li>`).join('')}</ul></li>`).join('')}</ul>`;
  }

  async function loadSales() {
    const request = ++salesRequest;
    const q = new URLSearchParams({ page: String(salesPage) });
    $('previous-sales').disabled = true;
    $('next-sales').disabled = true;
    for (const [k, id] of [['search', 'filter-search'], ['from', 'from'], ['to', 'to'], ['product', 'filter-product'], ['client', 'filter-client'], ['status', 'filter-state'], ['method', 'filter-method']]) {
      const el = $(id);
      if (el && el.value && el.value.trim()) q.set(k, el.value.trim());
    }
    const response = await api('inventory/sales?' + q);
    if (request !== salesRequest) return;
    sales = response.sales || [];
    const pagination = response.pagination || { page: salesPage, hasPrevious: false, hasNext: false };
    $('sales-page').textContent = 'Página ' + pagination.page;
    $('previous-sales').disabled = !pagination.hasPrevious;
    $('next-sales').disabled = !pagination.hasNext;
    const states = { COMPLETADA: 'Confirmada', CANCELADA: 'Anulada', REEMBOLSADA: 'Devuelta', BORRADOR: 'Borrador' };
    $('sales').innerHTML = sales.map(s => {
      const returned = s.lines.reduce((v, l) => v + Number(l.unitPrice) * l.returnedQuantity, 0);
      return `<article class="sale-entry" data-sale-id="${esc(s.id)}"><header><div><strong>${s.clientId ? esc(s.client ? s.client.firstName + ' ' + s.client.lastName : 'Cliente registrado') : 'Persona de paso'}</strong><p>${new Date(s.soldAt).toLocaleString('es-ES')} · ${states[s.status]} · Ref. ${esc(s.id)}</p></div><strong>${euros(s.totalAmount)}</strong></header><table><thead><tr><th>Producto o bono</th><th>Unidades</th><th>Devueltas</th><th>Precio aplicado</th><th>Importe original</th></tr></thead><tbody>${s.lines.map(l => `<tr><td>${esc(l.description)}</td><td>${esc(l.quantity)}</td><td>${l.returnedQuantity}</td><td>${euros(l.unitPrice)}</td><td>${euros(l.lineTotal)}</td></tr>`).join('')}</tbody></table>${s.gymKey && s.gymKey !== operatingGym ? `<p>Venta de ${esc(centers.find(c => c.id === s.gymKey)?.name || 'otro centro')}. Puedes registrar aquí sus pagos. Las devoluciones de productos se gestionan en el centro de la venta.</p>` : ''}<p>Importe devuelto: ${euros(returned)} · Importe neto: ${euros(Number(s.totalAmount) - returned)}</p>${paymentInfo(s)}${returnInfo(s)}${['ADMIN', 'RECEPTION'].includes(me.role) && s.status === 'COMPLETADA' && (!s.gymKey || s.gymKey === operatingGym) && s.lines.every(l => l.type !== 'SERVICIO') ? `<button data-return="${s.id}">Devolver productos</button>${me.role === 'ADMIN' ? `<button data-cancel="${s.id}">Anular venta</button>` : ''}` : ''}</article>`;
    }).join('') || '<p>No hay ventas para estos filtros.</p>';
  }

  function openPayment(id, action) {
    paying = sales.find(s => s.id === id);
    paymentAction = action;
    paymentKey = crypto.randomUUID();
    $('payment-form').reset();
    $('payment-error').textContent = '';
    const refund = action === 'refunds', verify = action === 'verify-payment', amount = refund ? paying.refundDue : verify ? paying.netAmount : paying.outstandingAmount;
    $('payment-amount-label').textContent = refund ? 'Importe devuelto (€)' : 'Importe recibido (€)';
    $('payment-title').textContent = refund ? 'Devolución del dinero' : verify ? 'Confirmar pago de venta antigua' : 'Registrar pago / Marcar pagado';
    $('payment-summary').textContent = (refund ? 'Dinero pendiente de devolver: ' : verify ? 'Importe de la venta a verificar: ' : 'Importe pendiente de esta venta: ') + euros(amount);
    $('payment-context').textContent = refund ? 'Registra este movimiento cuando hayas devuelto el dinero al cliente.' : verify ? 'Confirma un pago que ya se recibió. Indica la fecha real y cómo lo has comprobado; este formulario no cobra otra vez.' : 'Indica el dinero recibido. Para dejar la venta pagada, registra el importe restante completo.';
    $('payment-amount').value = Number(amount).toFixed(2);
    $('payment-amount').max = amount;
    $('payment-amount').readOnly = verify;
    const now = new Date(), local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $('payment-date').value = local;
    $('payment-date').max = local;
    $('payment-note').required = refund || verify;
    $('payment-confirm-wrap').hidden = !(refund || verify);
    $('payment-confirm').required = refund || verify;
    $('payment-confirm-label').textContent = refund ? 'Confirmo que el dinero ya se ha devuelto al cliente.' : 'He comprobado que esta venta ya estaba pagada.';
    $('confirm-payment').textContent = refund ? 'Guardar devolución de dinero' : verify ? 'Confirmar como pagado' : 'Guardar pago recibido';
    $('payment-dialog').showModal();
  }

  // --- Eventos de Caja ---
  $('open-cash').onclick = () => { openKey = crypto.randomUUID(); $('open-form').reset(); $('open-error').textContent = ''; $('open-dialog').showModal(); };
  $('open-form').onsubmit = async e => {
    e.preventDefault(); const button = e.submitter; button.disabled = true;
    try { await api('cash/sessions', 'POST', { requestKey:openKey, openingAmount:Number($('opening-amount').value) }); selectedId = null; $('open-dialog').close(); await refresh(); await history(); notice('Caja abierta. Los próximos cobros se incorporarán automáticamente.'); }
    catch (error) { $('open-error').textContent = error.message; } finally { button.disabled = false; }
  };
  $('add-movement').onclick = () => { movementKey = crypto.randomUUID(); movementSessionId = shown.id; $('movement-form').reset(); $('movement-error').textContent = ''; $('movement-dialog').showModal(); };
  $('movement-form').onsubmit = async e => {
    e.preventDefault(); const button = e.submitter; button.disabled = true;
    const type = $('movement-type').value;
    try { await api('cash/sessions/' + movementSessionId + '/movements', 'POST', { requestKey:movementKey, direction:['CHANGE','OTHER_IN'].includes(type) ? 'IN' : 'OUT', category:type.startsWith('OTHER') ? 'OTHER' : type, amount:Number($('movement-amount').value), reason:$('movement-reason').value }); $('movement-dialog').close(); await refresh(); notice('Movimiento de efectivo guardado.'); }
    catch (error) { $('movement-error').textContent = error.message; } finally { button.disabled = false; }
  };
  function difference() {
    if ($('counted-amount').value === '') { $('close-difference').textContent = 'Introduce el efectivo contado.'; return; }
    const diff = Math.round((Number($('counted-amount').value) - closingExpected) * 100) / 100;
    $('close-difference').textContent = diff === 0 ? 'La caja cuadra.' : diff > 0 ? 'Sobra dinero: ' + euros(diff) : 'Falta dinero: ' + euros(-diff);
  }
  function captureClose() { closingId = shown.id; closingRevision = shown.revision; closingExpected = Number(shown.summary.expectedCash); $('close-expected').textContent = 'Efectivo esperado: ' + euros(closingExpected); difference(); }
  $('close-cash').onclick = async () => { try { await refresh(); if (!shown || shown.closedAt) throw Error('Esta caja ya está cerrada.'); closeKey = crypto.randomUUID(); $('close-form').reset(); $('close-error').textContent = ''; captureClose(); $('close-dialog').showModal(); } catch (error) { notice(error); } };
  $('counted-amount').oninput = difference;
  $('refresh-close').onclick = async () => { try { await refresh(); if (!shown || shown.closedAt || shown.id !== closingId) throw Error('La caja ya no está disponible para cerrar.'); captureClose(); $('close-error').textContent = ''; } catch (error) { $('close-error').textContent = error.message; } };
  $('close-form').onsubmit = async e => {
    e.preventDefault(); const button = e.submitter; button.disabled = true;
    try { await api('cash/sessions/' + closingId + '/close', 'POST', { requestKey:closeKey, revision:closingRevision, countedAmount:Number($('counted-amount').value), note:$('close-note').value }); selectedId = closingId; $('close-dialog').close(); await refresh(); await history(); notice('Cierre guardado con el recuento y sus diferencias.'); }
    catch (error) { $('close-error').textContent = error.message; } finally { button.disabled = false; }
  };
  $('current-view').onclick = async () => { selectedId = null; try { await refresh(); } catch (error) { notice(error); } };
  $('cash-history').onclick = async e => { if (!e.target.dataset.session) return; selectedId = e.target.dataset.session; try { await refresh(); $('session-title').scrollIntoView?.({ behavior:'smooth', block:'start' }); } catch (error) { notice(error); } };
  $('cash-payments').onclick = async e => {
    const saleId = e.target.dataset.findSale;
    if (!saleId) return;
    e.preventDefault();
    $('filter-search').value = saleId;
    salesPage = 1;
    try {
      await loadSales();
      $('sales-panel').scrollIntoView?.({ behavior:'smooth', block:'start' });
    } catch (error) { $('notice').textContent = error.message; }
  };
  $('cash-filters').onsubmit = async e => { e.preventDefault(); page = 1; try { await history(); } catch (error) { notice(error); } };
  $('history-previous').onclick = async () => { page = Math.max(1, page - 1); try { await history(); } catch (error) { notice(error); } };
  $('history-next').onclick = async () => { page++; try { await history(); } catch (error) { notice(error); } };

  // --- Eventos de Ventas y Cobros ---
  $('new-sale').onclick = () => { saleKey = crypto.randomUUID(); $('sale-form').reset(); $('sale-error').textContent = ''; $('cart').innerHTML = ''; $('buyer-wrap').hidden = true; $('buyer').required = false; updatePaymentMode(); buyerOptions(); addLine(); $('sale-dialog').showModal(); };
  $('add-line').onclick = addLine;
  $('buyer-search').oninput = buyerOptions;
  $('buyer-kind').onchange = () => { $('buyer-wrap').hidden = $('buyer-kind').value !== 'client'; $('buyer').required = !$('buyer-wrap').hidden; updatePaymentMode(); };
  $('sale-payment-mode').onchange = updatePaymentMode;
  $('sale-form').onsubmit = async e => {
    e.preventDefault(); $('confirm-sale').disabled = true;
    try {
      const grouped = new Map();
      for (const l of cart()) grouped.set(l.productId, (grouped.get(l.productId) || 0) + l.quantity);
      const sale = await api('inventory/sales', 'POST', { requestKey: saleKey, paymentMode: $('sale-payment-mode').value, paymentMethod: $('sale-payment-method').value, clientId: $('buyer-kind').value === 'client' ? $('buyer').value : null, lines: [...grouped].map(([productId, quantity]) => ({ productId, quantity, expectedUnitPrice: Number(products.find(p => p.id === productId)?.unitPrice) })) });
      $('sale-dialog').close();
      $('notice').textContent = 'Venta registrada: ' + euros(sale.totalAmount);
      await loadProducts();
      await loadSales();
      await refresh();
    } catch (err) { $('sale-error').textContent = err.message; }
    finally { $('confirm-sale').disabled = false; }
  };
  $('payment-form').onsubmit = async e => {
    e.preventDefault(); const button = $('confirm-payment'); button.disabled = true;
    try {
      await api('inventory/sales/' + paying.id + '/' + paymentAction, 'POST', { requestKey: paymentKey, amount: Number($('payment-amount').value), method: $('payment-method').value, paidAt: new Date($('payment-date').value).toISOString(), note: $('payment-note').value });
      $('payment-dialog').close();
      await loadSales();
      await refresh();
      $('notice').textContent = paymentAction === 'refunds' ? 'Devolución de dinero registrada.' : paymentAction === 'verify-payment' ? 'Pago antiguo verificado y guardado.' : 'Pago registrado. El saldo, Caja y los avisos del calendario se actualizan automáticamente.';
    } catch (error) { $('payment-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('sales').onclick = async e => {
    for (const [attribute, action] of [['pay', 'payments'], ['verify', 'verify-payment'], ['refund', 'refunds']]) {
      if (e.target.dataset[attribute]) { openPayment(e.target.dataset[attribute], action); return; }
    }
    const id = e.target.dataset.cancel;
    if (id && confirm('¿Anular esta venta y reponer las unidades que aún no se hayan devuelto?')) {
      e.target.disabled = true;
      try {
        await api('inventory/sales/' + id + '/cancel', 'POST', {});
        await loadProducts();
        await loadSales();
        await refresh();
        $('notice').textContent = 'Venta anulada y stock repuesto.';
      } catch (err) { $('notice').textContent = err.message; }
      finally { e.target.disabled = false; }
    }
    const rid = e.target.dataset.return;
    if (rid) {
      returnKey = crypto.randomUUID();
      returning = sales.find(s => s.id === rid);
      $('return-error').textContent = '';
      $('return-reason').value = '';
      $('return-lines').innerHTML = returning.lines.filter(l => Number(l.quantity) > l.returnedQuantity).map(l => `<label>${esc(l.description)} · ${Number(l.quantity) - l.returnedQuantity} disponibles para devolver<input data-line="${l.id}" type="number" min="0" step="1" max="${Number(l.quantity) - l.returnedQuantity}" value="0" required></label><label><input data-restock="${l.id}" type="checkbox" checked> Reincorporar ${esc(l.description)} al stock (solo si está en buen estado)</label>`).join('');
      $('return-dialog').showModal();
    }
  };
  $('return-form').onsubmit = async e => {
    e.preventDefault(); e.submitter.disabled = true;
    try {
      await api('inventory/sales/' + returning.id + '/return', 'POST', { requestKey: returnKey, reason: $('return-reason').value, lines: [...$('return-lines').querySelectorAll('input[data-line]')].filter(i => Number(i.value) > 0).map(i => ({ lineId: i.dataset.line, quantity: Number(i.value), restock: $('return-lines').querySelector('[data-restock="' + i.dataset.line + '"]').checked })) });
      $('return-dialog').close();
      await loadProducts();
      await loadSales();
      await refresh();
      $('notice').textContent = 'Devolución registrada. El stock se ha ajustado según el estado del producto.';
    } catch (err) { $('return-error').textContent = err.message; }
    finally { e.submitter.disabled = false; }
  };
  $('filters').onsubmit = e => { e.preventDefault(); salesPage = 1; loadSales().catch(err => $('notice').textContent = err.message); };
  $('refresh').onclick = async () => { try { await loadProducts(); await loadSales(); } catch (err) { $('notice').textContent = err.message; } };
  $('previous-sales').onclick = () => { salesPage = Math.max(1, salesPage - 1); loadSales().catch(err => $('notice').textContent = err.message); };
  $('next-sales').onclick = () => { salesPage++; loadSales().catch(err => $('notice').textContent = err.message); };
  $('refresh-cart').onclick = async () => {
    const button = $('refresh-cart'); button.disabled = true;
    try {
      await loadProducts();
      for (const row of $('cart').children) {
        const select = row.querySelector('select'), id = select.value;
        select.innerHTML = options(products.filter(p => (p.isActive && p.stock > 0) || p.id === id).map(p => ({ ...p, name: p.name + ' · ' + euros(p.unitPrice) + ' · ' + p.stock + ' disponibles' })));
        select.value = id;
      }
      total();
      $('sale-error').textContent = 'Precios y existencias actualizados. Revisa el total antes de confirmar.';
    } catch (err) { $('sale-error').textContent = err.message; }
    finally { button.disabled = false; }
  };

  document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });

  try {
    me = await api('me');
    if (!['ADMIN','RECEPTION'].includes(me.role)) throw Error('Tu perfil no permite consultar la caja.');
    await refresh();
    await history();
    try {
      const workspace = await api('manage');
      clients = workspace.clients || [];
      operatingGym = workspace.gymId;
      centers = workspace.centers || [];
      buyerOptions();
      $('filter-client').innerHTML = '<option value="">Todos los compradores</option><option value="walkin">Personas de paso</option>' + options(clients);
      await loadProducts();
      const params = new URLSearchParams(location.search);
      const clientFilter = params.get('client');
      if (clientFilter && clients.some(c => c.id === clientFilter)) {
        $('filter-client').value = clientFilter;
      }
      await loadSales();
      if (clientFilter) $('sales-panel').scrollIntoView?.({ behavior:'smooth', block:'start' });
      if (params.get('nueva') === '1') $('new-sale').click();
    } catch (salesError) {
      $('notice').textContent = salesError.message;
      $('new-sale').disabled = true;
    }
    window.TrainersPoint?.poll?.(refresh, 2000, notice);
    window.TrainersPoint?.poll?.(history, 10000, notice);
  } catch (error) { notice(error); $('open-cash').disabled = true; $('new-sale').disabled = true; }
})();
