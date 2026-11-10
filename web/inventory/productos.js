const moneyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
(async () => {
    'use strict';
    const $ = id => document.getElementById(id), esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), eur = v => moneyFormatter.format(Number(v));
    let products = [], clients = [], sales = [], me, editing = null, returning = null, key, returnKey, salesPage = 1, salesRequest = 0, paying = null, paymentKey, paymentAction = 'payments';
    const methods = { EFECTIVO: "Efectivo", TARJETA: "Tarjeta", BIZUM: "Bizum", OTRO: "Otro", TRANSFERENCIA: "Transferencia" }, paymentStates = { PAGADO: "Pagado", PARCIAL: "Pago parcial", PENDIENTE: "Pago pendiente", SIN_VERIFICAR: "Sin verificar" };
    async function api(path, method = 'GET', body) { const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const data = await r.json(); if (!r.ok)
        throw Error(data.error || 'No se pudo completar la operación.'); return data; }
    const options = items => items.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    function render() { const q = $('search').value.toLocaleLowerCase('es'); $('products').innerHTML = products.filter(p => (p.name + ' ' + (p.description || '')).toLocaleLowerCase('es').includes(q)).map(p => `<tr><td>${esc(p.name)}<small>${esc(p.description)}</small></td><td>${eur(p.unitPrice)}</td><td><strong>${p.stock}</strong> unidades</td><td>${p.isActive ? 'Activo' : 'Retirado'}</td><td>${me.role === 'ADMIN' && p.isActive ? `<button data-edit="${p.id}">Editar</button> <button data-delete="${p.id}">Eliminar</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5">No hay productos para mostrar.</td></tr>'; $('stats').innerHTML = [['PRODUCTOS ACTIVOS', products.filter(p => p.isActive).length], ['UNIDADES DISPONIBLES', products.filter(p => p.isActive).reduce((s, p) => s + p.stock, 0)], ['SIN STOCK', products.filter(p => p.isActive && !p.stock).length]].map(([a, b]) => `<article><div><small>${a}</small><strong>${b}</strong></div></article>`).join(''); }
    async function loadProducts() { products = (await api('inventory/products')).products; render(); const selected = $('filter-product').value; $('filter-product').innerHTML = '<option value="">Todos los productos</option>' + options(products); $('filter-product').value = selected; }
    function buyerOptions() { const q = $('buyer-search').value.toLocaleLowerCase('es'); $('buyer').innerHTML = '<option value="">Selecciona un cliente</option>' + options(clients.filter(c => [c.name, c.email, c.phone].join(' ').toLocaleLowerCase('es').includes(q))); }
    function addLine() { const row = document.createElement('div'); row.className = 'cart-line'; row.innerHTML = `<label>Producto<select required>${options(products.filter(p => p.isActive && p.stock > 0).map(p => ({ ...p, name: p.name + ' · ' + eur(p.unitPrice) + ' · ' + p.stock + ' disponibles' })))}</select></label><label>Unidades<input type="number" min="1" max="10000" step="1" value="1" required></label><button type="button">Quitar</button>`; row.querySelector('button').onclick = () => { row.remove(); total(); }; row.oninput = total; row.onchange = total; $('cart').append(row); total(); }
    const cart = () => [...$('cart').children].map(row => ({ productId: row.querySelector('select').value, quantity: Number(row.querySelector('input').value) }));
    function total() { $('total').textContent = 'Total estimado: ' + eur(cart().reduce((s, l) => s + Number(products.find(p => p.id === l.productId)?.unitPrice || 0) * l.quantity, 0)); }
    $('new-product').onclick = () => edit();
    function edit(p) { editing = p || null; const f = $('product-form'); f.reset(); for (const [k, v] of Object.entries({ name: p?.name || '', price: p?.unitPrice || 0, stock: p?.stock || 0, description: p?.description || '' }))
        f.elements[k].value = v; $('product-error').textContent = ''; $('product-title').textContent = p ? 'Editar producto' : 'Nuevo producto'; $('product-dialog').showModal(); }
    $('product-form').onsubmit = async (e) => { e.preventDefault(); const b = e.submitter; b.disabled = true; const f = e.target.elements; try {
        await api('inventory/products' + (editing ? '/' + editing.id : ''), editing ? 'PUT' : 'POST', { name: f.name.value, description: f.description.value, price: Number(f.price.value), stock: Number(f.stock.value), revision: editing?.revision });
        $('product-dialog').close();
        await loadProducts();
        $('notice').textContent = 'Producto guardado.';
    }
    catch (e) {
        $('product-error').textContent = e.message;
    }
    finally {
        b.disabled = false;
    } };
    $('products').onclick = async (e) => { if (e.target.dataset.edit)
        edit(products.find(p => p.id === e.target.dataset.edit)); if (e.target.dataset.delete && confirm('¿Retirar este producto? Se conservarán las ventas y su historial.')) {
        try {
            await api('inventory/products/' + e.target.dataset.delete, 'DELETE');
            await loadProducts();
        }
        catch (e) {
            $('notice').textContent = e.message;
        }
    } };
    $('new-sale').onclick = () => { key = crypto.randomUUID(); $('sale-form').reset(); $('sale-error').textContent = ''; $('cart').innerHTML = ''; $('buyer-wrap').hidden = true; $('buyer').required = false; updatePaymentMode(); buyerOptions(); addLine(); $('sale-dialog').showModal(); };
    $('add-line').onclick = addLine;
    $('buyer-search').oninput = buyerOptions;
    $('buyer-kind').onchange = () => { $('buyer-wrap').hidden = $('buyer-kind').value !== 'client'; $('buyer').required = !$('buyer-wrap').hidden; updatePaymentMode(); };
    function updatePaymentMode() { const registered = $('buyer-kind').value === 'client'; $('sale-payment-mode').querySelector('[value=PENDING]').disabled = !registered; if (!registered)
        $('sale-payment-mode').value = 'PAID'; $('sale-method-wrap').hidden = $('sale-payment-mode').value === 'PENDING'; $('buyer-hint').textContent = registered ? 'La compra y sus cobros quedarán asociados a la ficha del cliente.' : 'No se pedirán datos personales ni se creará una ficha. El cobro debe completarse al confirmar.'; }
    $('sale-payment-mode').onchange = updatePaymentMode;
    $('sale-form').onsubmit = async (e) => { e.preventDefault(); $('confirm-sale').disabled = true; try {
        const grouped = new Map();
        for (const l of cart())
            grouped.set(l.productId, (grouped.get(l.productId) || 0) + l.quantity);
        const sale = await api('inventory/sales', 'POST', { requestKey: key, paymentMode: $('sale-payment-mode').value, paymentMethod: $('sale-payment-method').value, clientId: $('buyer-kind').value === 'client' ? $('buyer').value : null, lines: [...grouped].map(([productId, quantity]) => ({ productId, quantity, expectedUnitPrice: Number(products.find(p => p.id === productId)?.unitPrice) })) });
        $('sale-dialog').close();
        $('notice').textContent = 'Venta registrada: ' + eur(sale.totalAmount);
        await loadProducts();
        await loadSales();
    }
    catch (e) {
        $('sale-error').textContent = e.message;
    }
    finally {
        $('confirm-sale').disabled = false;
    } };
    async function loadSales() { const request = ++salesRequest; const q = new URLSearchParams({ page: String(salesPage) }); $('previous-sales').disabled = true; $('next-sales').disabled = true; for (const [k, id] of [['from', 'from'], ['to', 'to'], ['product', 'filter-product'], ['client', 'filter-client'], ['status', 'filter-state'], ['method', 'filter-method']])
        if ($(id).value)
            q.set(k, $(id).value); const response = await api('inventory/sales?' + q); if (request !== salesRequest)
        return; sales = response.sales; const pagination = response.pagination || { page: salesPage, hasPrevious: false, hasNext: false }; $('sales-page').textContent = 'Página ' + pagination.page; $('previous-sales').disabled = !pagination.hasPrevious; $('next-sales').disabled = !pagination.hasNext; const states = { COMPLETADA: 'Confirmada', CANCELADA: 'Anulada', REEMBOLSADA: 'Devuelta', BORRADOR: 'Borrador' }; $('sales').innerHTML = sales.map(s => { const returned = s.lines.reduce((v, l) => v + Number(l.unitPrice) * l.returnedQuantity, 0); return `<article class="sale-entry"><header><div><strong>${s.clientId ? esc(s.client ? s.client.firstName + ' ' + s.client.lastName : 'Cliente registrado') : 'Persona de paso'}</strong><p>${new Date(s.soldAt).toLocaleString('es-ES')} · ${states[s.status]} · Ref. ${esc(s.id)}</p></div><strong>${eur(s.totalAmount)}</strong></header><table><thead><tr><th>Producto o bono</th><th>Unidades</th><th>Devueltas</th><th>Precio aplicado</th><th>Importe original</th></tr></thead><tbody>${s.lines.map(l => `<tr><td>${esc(l.description)}</td><td>${esc(l.quantity)}</td><td>${l.returnedQuantity}</td><td>${eur(l.unitPrice)}</td><td>${eur(l.lineTotal)}</td></tr>`).join('')}</tbody></table><p>Importe devuelto: ${eur(returned)} · Importe neto: ${eur(Number(s.totalAmount) - returned)}</p>${paymentInfo(s)}${returnInfo(s)}${['ADMIN', 'RECEPTION'].includes(me.role) && s.status === 'COMPLETADA' && s.lines.every(l => l.type !== 'SERVICIO') ? `<button data-return="${s.id}">Devolver productos</button>${me.role === 'ADMIN' ? `<button data-cancel="${s.id}">Anular venta</button>` : ''}` : ''}</article>`; }).join('') || '<p>No hay ventas para estos filtros.</p>'; }
    function paymentInfo(s) {
        const pending = Number(s.outstandingAmount || 0), paid = Number(s.paidAmount || 0);
        return `<div class="payment-summary ${pending > 0 ? 'has-debt' : ''}"><strong>${paymentStates[s.paymentStatus] || 'Sin verificar'}</strong><p>Cobros recibidos: ${eur(s.receivedAmount ?? paid)} · Dinero devuelto: ${eur(s.refundedAmount || 0)} · Pendiente: ${eur(pending)}</p>${Number(s.refundDue) > 0 ? `<p>Importe a devolver: ${eur(s.refundDue)}. Los cobros originales se conservan.</p><button data-refund="${s.id}">Registrar dinero devuelto</button>` : ''}${pending > 0 ? `<button data-pay="${s.id}">Registrar pago / Marcar pagado</button>` : ''}${s.paymentStatus === 'SIN_VERIFICAR' && s.status === 'COMPLETADA' && Number(s.netAmount) > 0 ? `<button data-verify="${s.id}">Confirmar que ya está pagado</button>` : ''}${s.clientId ? `<a href="/clientes/${encodeURIComponent(s.clientId)}/ficha">Ver ficha del cliente</a>` : ''}<ul>${(s.payments || []).map(p => `<li>${p.kind === 'REFUND' ? 'Devolución de dinero' : 'Cobro'} · ${eur(p.amount)} · ${esc(methods[p.method] || p.method)} · ${new Date(p.paidAt || p.createdAt).toLocaleString('es-ES')} · ${p.kind === 'REFUND' ? 'Devuelto' : esc(paymentStates[p.status] || p.status)}${p.note ? ' · ' + esc(p.note) : ''}</li>`).join('')}</ul></div>`;
    }
    function returnInfo(s) { return `<ul class="return-history">${(s.returnHistory || []).map(r => `<li>Devolución · ${new Date(r.at).toLocaleString('es-ES')} · ${esc(r.reason)}<ul>${(r.lines || []).map(l => `<li>${esc(s.lines.find(row => row.id === l.lineId)?.description || 'Producto')} × ${Number(l.quantity)}${l.restock === false ? ' · No vuelve al stock' : ''}</li>`).join('')}</ul></li>`).join('')}</ul>`; }
    function openPayment(id, action) {
        paying = sales.find(s => s.id === id);
        paymentAction = action;
        paymentKey = crypto.randomUUID();
        $('payment-form').reset();
        $('payment-error').textContent = '';
        const refund = action === 'refunds', verify = action === 'verify-payment', amount = refund ? paying.refundDue : verify ? paying.netAmount : paying.outstandingAmount;
        $('payment-amount-label').textContent = refund ? 'Importe devuelto (€)' : 'Importe recibido (€)';
        $('payment-title').textContent = refund ? 'Devolución del dinero' : verify ? 'Confirmar pago de venta antigua' : 'Registrar pago / Marcar pagado';
        $('payment-summary').textContent = (refund ? 'Dinero pendiente de devolver: ' : verify ? 'Importe de la venta a verificar: ' : 'Importe pendiente de esta venta: ') + eur(amount);
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
    $('payment-form').onsubmit = async (e) => { e.preventDefault(); const button = $('confirm-payment'); button.disabled = true; try {
        await api('inventory/sales/' + paying.id + '/' + paymentAction, 'POST', { requestKey: paymentKey, amount: Number($('payment-amount').value), method: $('payment-method').value, paidAt: new Date($('payment-date').value).toISOString(), note: $('payment-note').value });
        $('payment-dialog').close();
        await loadSales();
        $('notice').textContent = paymentAction === 'refunds' ? 'Devolución de dinero registrada.' : paymentAction === 'verify-payment' ? 'Pago antiguo verificado y guardado.' : 'Pago registrado. El saldo y los avisos del calendario se actualizan automáticamente.';
    }
    catch (error) {
        $('payment-error').textContent = error.message;
    }
    finally {
        button.disabled = false;
    } };
    $('sales').onclick = async (e) => { for (const [attribute, action] of [['pay', 'payments'], ['verify', 'verify-payment'], ['refund', 'refunds']])
        if (e.target.dataset[attribute]) {
            openPayment(e.target.dataset[attribute], action);
            return;
        } const id = e.target.dataset.cancel; if (id && confirm('¿Anular esta venta y reponer las unidades que aún no se hayan devuelto?')) {
        e.target.disabled = true;
        try {
            await api('inventory/sales/' + id + '/cancel', 'POST', {});
            await loadProducts();
            await loadSales();
            $('notice').textContent = 'Venta anulada y stock repuesto.';
        }
        catch (e) {
            $('notice').textContent = e.message;
        }
        finally {
            e.target.disabled = false;
        }
    } const rid = e.target.dataset.return; if (rid) {
        returnKey = crypto.randomUUID();
        returning = sales.find(s => s.id === rid);
        $('return-error').textContent = '';
        $('return-reason').value = '';
        $('return-lines').innerHTML = returning.lines.filter(l => Number(l.quantity) > l.returnedQuantity).map(l => `<label>${esc(l.description)} · ${Number(l.quantity) - l.returnedQuantity} disponibles para devolver<input data-line="${l.id}" type="number" min="0" step="1" max="${Number(l.quantity) - l.returnedQuantity}" value="0" required></label><label><input data-restock="${l.id}" type="checkbox" checked> Reincorporar ${esc(l.description)} al stock (solo si está en buen estado)</label>`).join('');
        $('return-dialog').showModal();
    } };
    $('return-form').onsubmit = async (e) => { e.preventDefault(); e.submitter.disabled = true; try {
        await api('inventory/sales/' + returning.id + '/return', 'POST', { requestKey: returnKey, reason: $('return-reason').value, lines: [...$('return-lines').querySelectorAll('input[data-line]')].filter(i => Number(i.value) > 0).map(i => ({ lineId: i.dataset.line, quantity: Number(i.value), restock: $('return-lines').querySelector('[data-restock="' + i.dataset.line + '"]').checked })) });
        $('return-dialog').close();
        await loadProducts();
        await loadSales();
        $('notice').textContent = 'Devolución registrada. El stock se ha ajustado según el estado del producto.';
    }
    catch (e) {
        $('return-error').textContent = e.message;
    }
    finally {
        e.submitter.disabled = false;
    } };
    $('filters').onsubmit = e => { e.preventDefault(); salesPage = 1; loadSales().catch(e => $('notice').textContent = e.message); };
    $('search').oninput = render;
    $('refresh').onclick = () => loadProducts().catch(e => $('notice').textContent = e.message);
    $('previous-sales').onclick = () => { salesPage = Math.max(1, salesPage - 1); loadSales().catch(e => $('notice').textContent = e.message); };
    $('next-sales').onclick = () => { salesPage++; loadSales().catch(e => $('notice').textContent = e.message); };
    $('refresh-cart').onclick = async () => { const button = $('refresh-cart'); button.disabled = true; try {
        await loadProducts();
        for (const row of $('cart').children) {
            const select = row.querySelector('select'), id = select.value;
            select.innerHTML = options(products.filter(p => p.isActive && p.stock > 0 || p.id === id).map(p => ({ ...p, name: p.name + ' · ' + eur(p.unitPrice) + ' · ' + p.stock + ' disponibles' })));
            select.value = id;
        }
        total();
        $('sale-error').textContent = 'Precios y existencias actualizados. Revisa el total antes de confirmar.';
    }
    catch (e) {
        $('sale-error').textContent = e.message;
    }
    finally {
        button.disabled = false;
    } };
    $('stock-tab').onclick = () => { $('stock-tab').setAttribute('aria-pressed', 'true'); $('sales-tab').setAttribute('aria-pressed', 'false'); $('stock-panel').hidden = false; $('sales-panel').hidden = true; };
    $('sales-tab').onclick = () => { $('stock-tab').setAttribute('aria-pressed', 'false'); $('sales-tab').setAttribute('aria-pressed', 'true'); $('stock-panel').hidden = true; $('sales-panel').hidden = false; loadSales().catch(e => $('notice').textContent = e.message); };
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());
    try {
        me = await api('me');
        if (!['ADMIN', 'RECEPTION'].includes(me.role))
            throw Error('Tu perfil no permite acceder a productos.');
        $('new-product').hidden = me.role !== 'ADMIN';
        clients = (await api('manage')).clients;
        buyerOptions();
        $('filter-client').innerHTML = '<option value="">Todos los compradores</option><option value="walkin">Personas de paso</option>' + options(clients);
        await loadProducts();
        const clientFilter = new URLSearchParams(location.search).get('client');
        if (clientFilter && clients.some(c => c.id === clientFilter)) {
            $('filter-client').value = clientFilter;
            $('sales-tab').click();
        }
    }
    catch (e) {
        $('notice').textContent = e.message;
        $('new-sale').disabled = true;
    }
})();
