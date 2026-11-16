(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatDate = d => { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('es-ES', {day:'2-digit',month:'short',year:'numeric'}) + ' ' + dt.toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}); };
  const statusLabels = {PENDIENTE:'Pendiente',PEDIDO:'Pedido',RECIBIDO:'Recibido',CANCELADO:'Cancelado'};
  let pedidos = [], me, allProducts = [], editing = null;
  async function api(path, method = 'GET', body) {
    const response = await fetch('/api/inventory/restock-requests' + path, {method, headers:{'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : undefined});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo completar la operación.');
    return data;
  }
  function statusBadge(status) {
    return `<span class="pedido-status ${status}">${statusLabels[status] || status}</span>`;
  }
  function render() {
    const q = $('search').value.trim().toLocaleLowerCase('es');
    const status = $('filter-status').value;
    const filtered = pedidos.filter(p => {
      const matchSearch = [p.productName, p.notes, p.requestedBy, p.requestedByName].join(' ').toLocaleLowerCase('es').includes(q);
      const matchStatus = status === 'ALL' || p.status === status;
      return matchSearch && matchStatus;
    });
    $('pedidos').innerHTML = filtered.map(p => {
      const photo = p.product && p.product.imageData
        ? `<img class="pedido-product-photo" src="${esc(p.product.imageData)}" alt="${esc(p.product.name)}" loading="lazy">`
        : `<span class="pedido-product-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 6"/></svg></span>`;
      const canEdit = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) && me.pagePermissions.includes('pedidos.html'));
      const canManageStatus = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) ? me.pagePermissions.includes('pedidos.html') : ['ADMIN','RECEPTION'].includes(me.role));
      let actions = `<button type="button" data-detail="${esc(p.id)}">Ver</button>`;
      if (canManageStatus && p.status === 'PENDIENTE') {
        actions += `<button type="button" data-action="PEDIDO" data-id="${esc(p.id)}">Marcar pedido</button>`;
        actions += `<button type="button" data-action="CANCELADO" data-id="${esc(p.id)}">Cancelar</button>`;
      }
      if (canManageStatus && p.status === 'PEDIDO') {
        actions += `<button type="button" data-action="RECIBIDO" data-id="${esc(p.id)}">Recibir mercancía</button>`;
        actions += `<button type="button" data-action="CANCELADO" data-id="${esc(p.id)}">Cancelar</button>`;
      }
      if (canEdit && p.status === 'PENDIENTE') {
        actions += `<button type="button" data-edit="${esc(p.id)}">Editar</button>`;
      }
      return `<tr>
        <td><div class="pedido-product-identity">${photo}<div><strong>${esc(p.productName)}</strong>${p.product ? `<small>${p.product.name === p.productName ? '' : 'ID: ' + esc(p.id)}</small>` : ''}</div></div></td>
        <td><strong>${p.quantity}</strong> uds</td>
        <td>${statusBadge(p.status)}</td>
        <td>${formatDate(p.createdAt)}</td>
        <td>${esc(p.requestedByName) || esc(p.requestedBy) || '—'}</td>
        <td><div class="product-actions">${actions}</div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6">No hay pedidos con estos criterios.</td></tr>';

    const pending = pedidos.filter(p => p.status === 'PENDIENTE').length;
    const ordered = pedidos.filter(p => p.status === 'PEDIDO').length;
    const received = pedidos.filter(p => p.status === 'RECIBIDO').length;
    const cancelled = pedidos.filter(p => p.status === 'CANCELADO').length;
    $('stats').innerHTML = `
      <article><span>Pendientes de pedir</span><strong class="accent">${pending}</strong><small>Artículos que faltan y hay que pedir</small></article>
      <article><span>Ya pedidos</span><strong style="color:#1565c0">${ordered}</strong><small>En camino o pendientes de entrega</small></article>
      <article><span>Recibidos</span><strong style="color:#2e7d32">${received}</strong><small>Completados recientemente</small></article>
      <article><span>Cancelados</span><strong style="color:#c62828">${cancelled}</strong><small>Requisiciones anuladas</small></article>`;
  }
  async function load() {
    pedidos = (await api('?status=' + ($('filter-status')?.value || 'ALL'))).requests || [];
    render();
  }
  function loadProducts() {
    return api('/products').then(r => { allProducts = r.products; populateProductSelect(); }).catch(() => {});
  }
  function populateProductSelect() {
    const select = $('pedido-product-select');
    select.innerHTML = '<option value="">-- Buscar producto existente --</option>';
    const active = allProducts.filter(p => p.isActive);
    if (active.length) {
      const group = document.createElement('optgroup');
      group.label = 'Productos activos';
      active.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id; opt.textContent = `${p.name} (Stock: ${p.stock})`;
        group.appendChild(opt);
      });
      select.appendChild(group);
    }
    const inactive = allProducts.filter(p => !p.isActive);
    if (inactive.length) {
      const group = document.createElement('optgroup');
      group.label = 'Productos desactivados (anteriores)';
      inactive.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id; opt.textContent = `${p.name} (Desactivado)`;
        group.appendChild(opt);
      });
      select.appendChild(group);
    }
  }
  function editPedido(p) {
    editing = p || null;
    $('pedido-title').textContent = p ? 'Editar pedido' : 'Nuevo pedido';
    $('pedido-error').textContent = '';
    formReset();
    if (p) {
      form.elements.quantity.value = p.quantity;
      form.elements.notes.value = p.notes || '';
      if (p.productId) {
        $('pedido-product-select').value = p.productId;
      }
      if (p.productName && !p.productId) {
        $('pedido-product-select').value = '';
        form.elements.productName.value = p.productName;
        $('custom-product-wrap').style.display = '';
      }
    }
    $('pedido-dialog').showModal();
  }
  function formReset() {
    ['quantity','notes'].forEach(f => form.elements[f].value = '');
    form.elements.quantity.value = '1';
    $('pedido-product-select').value = '';
    if (form.elements.productName) form.elements.productName.value = '';
    $('custom-product-wrap').style.display = 'none';
    $('pedido-error').textContent = '';
  }
  const form = $('pedido-form');
  $('new-pedido').onclick = () => editPedido();

  $('pedido-product-select').onchange = function() {
    if (this.value === '') {
      $('custom-product-wrap').style.display = '';
    } else {
      $('custom-product-wrap').style.display = 'none';
      const product = allProducts.find(p => p.id === this.value);
      if (product) {
        form.elements.productName.value = product.name;
      }
    }
  };

  form.onsubmit = async event => {
    event.preventDefault();
    const fields = form.elements;
    const button = $('save-pedido');
    button.disabled = true;
    try {
      const productId = fields['pedido-product-select']?.value || null;
      let productName = (fields.productName?.value || '').trim();
      if (!productName) {
        const product = allProducts.find(p => p.id === productId);
        if (product) productName = product.name;
      }
      if (!productName) throw Error('Indica el nombre del producto que falta para pedir.');
      const data = {
        productId: productId || null,
        productName: productName,
        quantity: Number(fields.quantity.value),
        notes: (fields.notes.value || '').trim() || undefined
      };
      if (editing) {
        await api('/' + editing.id, 'PUT', { ...data, revision: editing.revision });
      } else {
        await api('', 'POST', data);
      }
      $('pedido-dialog').close();
      await load();
      $('notice').textContent = editing ? 'Pedido actualizado.' : 'Pedido creado correctamente.';
    } catch (error) {
      $('pedido-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };

  $('pedidos').onclick = async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.edit) {
      const p = pedidos.find(p => p.id === button.dataset.edit);
      if (p) editPedido(p);
      return;
    }
    if (button.dataset.detail) {
      const p = pedidos.find(p => p.id === button.dataset.detail);
      if (!p) return;
      $('detail-title').textContent = p.productName || 'Detalle del pedido';
      $('detail-content').innerHTML = `
        <dl style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px">
          <dt>Estado</dt><dd>${statusBadge(p.status)}</dd>
          <dt>Producto</dt><dd>${esc(p.productName)}</dd>
          <dt>Cantidad solicitada</dt><dd>${p.quantity} unidades</dd>
          <dt>Fecha de solicitud</dt><dd>${formatDate(p.createdAt)}</dd>
          <dt>Última modificación</dt><dd>${formatDate(p.updatedAt)}</dd>
          <dt>Resuelto</dt><dd>${p.resolvedAt ? formatDate(p.resolvedAt) : 'No'}</dd>
          <dt>Solicitado por</dt><dd>${esc(p.requestedByName) || esc(p.requestedBy) || '—'}</dd>
          ${p.product ? `<dt>Stock actual</dt><dd>${p.product.stock} uds</dd>` : ''}
          ${p.notes ? `<dt style="grid-column:1/-1">Notas</dt><dd style="grid-column:1/-1">${esc(p.notes)}</dd>` : ''}
        </dl>`;
      $('detail-dialog').showModal();
      return;
    }
    if (button.dataset.action) {
      const p = pedidos.find(p => p.id === button.dataset.id);
      if (!p) return;
      const action = button.dataset.action;
      $('action-title').textContent = action === 'RECIBIDO' ? 'Recibir mercancía' : action === 'CANCELADO' ? 'Cancelar pedido' : 'Marcar como pedido';
      const messages = {
        PENDIENTE: '¿Confirmas que el estado es "Pendiente"?',
        PEDIDO: '¿Confirmas que se ha realizado el pedido al proveedor?',
        RECIBIDO: '¿Confirmas que se ha recibido la mercancía y se repone el stock?',
        CANCELADO: '¿Confirmas que cancelas este pedido?'
      };
      $('action-content').innerHTML = `<p>${messages[action] || '¿Estás seguro?'}</p>`;
      $('action-error').textContent = '';
      $('action-dialog').showModal();

      // Override confirm button behavior
      const actionFooter = $('action-dialog').querySelector('.dialog-actions');
      actionFooter.innerHTML = '';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.onclick = () => {
        $('action-dialog').close();
        // Restore original footer
        actionFooter.innerHTML = `<button type="button" data-close="action-dialog">Cerrar</button>`;
      };
      const confirmBtn = document.createElement('button');
      confirmBtn.className = action === 'CANCELADO' ? 'outline-button' : 'primary';
      confirmBtn.textContent = action === 'CANCELADO' ? 'Confirmar cancelación' : action === 'RECIBIDO' ? 'Recibir y repuesto' : 'Confirmar';
      confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        try {
          const updateData = { status: action, addToStock: action === 'RECIBIDO' };
          await api('/' + p.id, 'PUT', updateData);
          $('action-dialog').close();
          await load();
          $('notice').textContent = action === 'RECIBIDO' ? `Mercancía recibida: ${p.quantity} uds de ${p.productName} añadidas al stock.` : action === 'CANCELADO' ? 'Pedido cancelado.' : 'Estado actualizado a pedido.';
        } catch (error) {
          $('action-error').textContent = error.message;
        } finally {
          confirmBtn.disabled = false;
        }
      };
      actionFooter.append(cancelBtn, confirmBtn);
      return;
    }
  };

  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
  $('search').oninput = render;
  $('filter-status').onchange = render;
  $('refresh').onclick = () => load().catch(error => $('notice').textContent = error.message);

  try {
    const response = await fetch('/api/me');
    if (!response.ok) throw Error('Inicia sesión para consultar los pedidos.');
    me = await response.json();
    const canPedidos = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) ? me.pagePermissions.includes('pedidos.html') : ['ADMIN','RECEPTION'].includes(me.role));
    if (!canPedidos) throw Error('Tu perfil no permite acceder a pedidos y albaranes.');
    const canEditPedidos = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) ? me.pagePermissions.includes('pedidos.html') : ['ADMIN','RECEPTION'].includes(me.role));
    if (!canEditPedidos) $('new-pedido').hidden = true;
    await Promise.all([load(), loadProducts()]);
  } catch (error) {
    $('notice').textContent = error.message;
  }
})();