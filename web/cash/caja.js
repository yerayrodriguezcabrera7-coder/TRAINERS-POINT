(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const moneyFormatter = new Intl.NumberFormat('es-ES', { style:'currency', currency:'EUR' });
  const euros = value => moneyFormatter.format(Number(value || 0));
  const date = value => value ? new Date(value).toLocaleString('es-ES', { timeZone:'Europe/Madrid' }) : '—';
  const methods = { EFECTIVO:'Efectivo', TARJETA:'Tarjeta', BIZUM:'Bizum', TRANSFERENCIA:'Transferencia', OTRO:'Otro' };
  let current = null, shown = null, selectedId = null, page = 1, busy = false, openKey, movementKey, movementSessionId, closeKey, closingId, closingRevision, closingExpected;
  async function api(path, method = 'GET', body) {
    const response = await fetch('/api/' + path, { method, headers:{'Content-Type':'application/json'}, body:body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo completar la operación de caja.');
    return data;
  }
  const emptyRow = (columns, text) => `<tr><td colspan="${columns}">${text}</td></tr>`;
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
    $('cash-payments').innerHTML = summary.payments.map(p => `<tr><td>${date(p.at)}<small>${esc(p.client)}</small></td><td>${p.kind === 'REFUND' ? 'Dinero devuelto' : p.previousDebt ? 'Cobro de venta anterior' : 'Cobro'}${p.note ? `<small>${esc(p.note)}</small>` : ''}</td><td>${esc(methods[p.method] || p.method)}</td><td>${p.kind === 'REFUND' ? '−' : ''}${euros(p.amount)}</td><td><a href="/productos.html">${esc(p.saleId)}</a></td></tr>`).join('') || emptyRow(5, 'Sin cobros ni devoluciones de dinero.');
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
  const notice = error => { $('cash-notice').textContent = error.message || error; };
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
  $('cash-filters').onsubmit = async e => { e.preventDefault(); page = 1; try { await history(); } catch (error) { notice(error); } };
  $('history-previous').onclick = async () => { page = Math.max(1, page - 1); try { await history(); } catch (error) { notice(error); } };
  $('history-next').onclick = async () => { page++; try { await history(); } catch (error) { notice(error); } };
  document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });
  try {
    const me = await api('me');
    if (!['ADMIN','RECEPTION'].includes(me.role)) throw Error('Tu perfil no permite consultar la caja.');
    await refresh(); await history();
    window.TrainersPoint.poll(refresh, 2000, notice);
    window.TrainersPoint.poll(history, 10000, notice);
  } catch (error) { notice(error); $('open-cash').disabled = true; }
})();
