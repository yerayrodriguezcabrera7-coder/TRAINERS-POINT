(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('provider-form');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = v => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v));
  let providers = [], me, editing = null;

  async function api(path = '', method = 'GET', body) {
    const response = await fetch('/api/inventory/providers' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudo completar la operación.');
    return data;
  }

  function render() {
    const q = $('search').value.trim().toLocaleLowerCase('es');
    const statusFilter = $('filter-status').value;
    let filtered = providers;

    if (statusFilter === 'ACTIVE') {
      filtered = filtered.filter(p => p.isActive);
    } else if (statusFilter === 'INACTIVE') {
      filtered = filtered.filter(p => !p.isActive);
    }

    if (q) {
      filtered = filtered.filter(p => [
        p.name,
        p.contactName,
        p.phone,
        p.email,
        p.address,
        p.notes
      ].join(' ').toLocaleLowerCase('es').includes(q));
    }

    const canEdit = me && (me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) && (me.pagePermissions.includes('proveedores.html') || me.pagePermissions.includes('productos.html'))));

    $('providers').innerHTML = filtered.map(p => {
      const productCount = p.productCount ?? (p.products ? p.products.length : 0);
      return `<tr>
        <td>
          <strong>${esc(p.name)}</strong>
          ${p.address ? `<small>📍 ${esc(p.address)}</small>` : ''}
          ${p.notes ? `<small style="color:#64748b">${esc(p.notes)}</small>` : ''}
        </td>
        <td>${esc(p.contactName || '—')}</td>
        <td>${p.phone ? `<a href="tel:${esc(p.phone)}" style="color:#0369a1;text-decoration:none">📞 ${esc(p.phone)}</a>` : '—'}</td>
        <td>${p.email ? `<a href="mailto:${esc(p.email)}" style="color:#0369a1;text-decoration:none">✉ ${esc(p.email)}</a>` : '—'}</td>
        <td>
          <a href="/productos.html?proveedor=${esc(p.id)}" class="outline-button" style="padding:4px 10px;font-size:11px;text-decoration:none" title="Ver productos de este proveedor">
            📦 <strong>${productCount}</strong> ${productCount === 1 ? 'artículo' : 'artículos'}
          </a>
        </td>
        <td>
          <span class="badge" style="background:${p.isActive ? '#ecfdf5' : '#f1f5f9'};color:${p.isActive ? '#047857' : '#64748b'};padding:3px 8px;border-radius:6px;font-weight:600;font-size:11px">
            ${p.isActive ? 'Activo' : 'De baja'}
          </span>
        </td>
        <td>
          <div class="product-actions">
            <button type="button" data-detail="${esc(p.id)}">Ver detalle</button>
            ${canEdit ? `<button type="button" data-edit="${esc(p.id)}">Editar</button>` : ''}
            ${canEdit && p.isActive ? `<button type="button" data-delete="${esc(p.id)}">Dar de baja</button>` : ''}
            ${canEdit && !p.isActive ? `<button type="button" data-reactivate="${esc(p.id)}">Reactivar</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7">No hay proveedores registrados con este filtro.</td></tr>';

    const activeCount = providers.filter(p => p.isActive).length;
    const withProducts = providers.filter(p => p.isActive && (p.productCount > 0 || (p.products && p.products.length > 0))).length;
    $('stats').innerHTML = `
      <article><span>Proveedores activos</span><strong>${activeCount}</strong><small>Empresas y distribuidores habilitados</small></article>
      <article><span>Con catálogo vinculado</span><strong>${withProducts}</strong><small>Proveedores con productos en almacén</small></article>
    `;
  }

  async function load() {
    const data = await api('?all=1');
    providers = data.providers || [];
    render();
  }

  function edit(p) {
    editing = p || null;
    form.reset();
    for (const [key, value] of Object.entries({
      name: p?.name || '',
      contactName: p?.contactName || '',
      phone: p?.phone || '',
      email: p?.email || '',
      address: p?.address || '',
      notes: p?.notes || ''
    })) {
      if (form.elements[key]) form.elements[key].value = value;
    }
    $('save-provider').disabled = false;
    $('provider-error').textContent = '';
    $('provider-title').textContent = p ? 'Editar proveedor' : 'Nuevo proveedor';
    $('provider-dialog').showModal();
  }

  async function showDetail(id) {
    try {
      const data = await api('/' + id);
      const p = data.provider;
      if (!p) return;
      $('provider-detail-title').textContent = p.name;
      const products = p.products || [];
      $('provider-detail-content').innerHTML = `
        <dl class="product-detail-data" style="margin-bottom:20px">
          <dt>Empresa / Proveedor</dt><dd><strong>${esc(p.name)}</strong></dd>
          <dt>Estado</dt><dd>${p.isActive ? '<span style="color:#047857;font-weight:700">● Activo</span>' : '<span style="color:#64748b;font-weight:700">○ De baja</span>'}</dd>
          <dt>Persona de contacto</dt><dd>${esc(p.contactName || 'No indicada')}</dd>
          <dt>Teléfono</dt><dd>${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : 'No indicado'}</dd>
          <dt>Email</dt><dd>${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : 'No indicado'}</dd>
          <dt>Dirección</dt><dd>${esc(p.address || 'No indicada')}</dd>
          <dt>Notas / Condiciones</dt><dd style="white-space:pre-wrap">${esc(p.notes || 'Sin notas registradas.')}</dd>
        </dl>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px">
          <h3 style="margin:0;font-size:14px">Productos vinculados (${products.length})</h3>
          <a href="/productos.html?proveedor=${esc(p.id)}" class="primary" style="font-size:11px;padding:6px 12px;text-decoration:none">📦 Ver en catálogo</a>
        </div>
        ${products.length ? `
          <div class="history-scroll" style="max-height:220px;overflow-y:auto">
            <table>
              <thead><tr><th>Producto</th><th>Código</th><th>PVP</th><th>Stock</th></tr></thead>
              <tbody>
                ${products.map(pr => `<tr><td><strong>${esc(pr.name)}</strong></td><td>${esc(pr.barcode || '—')}</td><td>${eur(pr.unitPrice)}</td><td><strong>${pr.stock}</strong> uds</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p style="color:#64748b;font-size:12px;margin:8px 0">Este proveedor aún no tiene productos asociados en el catálogo.</p>'}
      `;
      $('provider-detail').showModal();
    } catch (err) {
      $('notice').textContent = err.message;
    }
  }

  $('new-provider').onclick = () => edit();

  form.onsubmit = async event => {
    event.preventDefault();
    const fields = form.elements;
    const button = $('save-provider');
    button.disabled = true;
    try {
      await api(editing ? '/' + editing.id : '', editing ? 'PUT' : 'POST', {
        name: fields.name.value,
        contactName: fields.contactName.value,
        phone: fields.phone.value,
        email: fields.email.value,
        address: fields.address.value,
        notes: fields.notes.value
      });
      $('provider-dialog').close();
      await load();
      $('notice').textContent = 'Proveedor guardado correctamente.';
    } catch (error) {
      $('provider-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };

  $('providers').onclick = async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.detail || button.dataset.edit || button.dataset.delete || button.dataset.reactivate;
    const p = providers.find(x => x.id === id);
    if (!p && !id) return;

    if (button.dataset.detail) {
      showDetail(id);
    } else if (button.dataset.edit) {
      edit(p);
    } else if (button.dataset.delete) {
      if (confirm(`¿Dar de baja al proveedor "${p.name}"? Los productos existentes conservarán el historial.`)) {
        button.disabled = true;
        try {
          await api('/' + p.id, 'DELETE');
          await load();
          $('notice').textContent = 'Proveedor dado de baja.';
        } catch (error) {
          $('notice').textContent = error.message;
          button.disabled = false;
        }
      }
    } else if (button.dataset.reactivate) {
      button.disabled = true;
      try {
        await api('/' + p.id, 'PUT', { name: p.name, isActive: true });
        await load();
        $('notice').textContent = 'Proveedor reactivado.';
      } catch (error) {
        $('notice').textContent = error.message;
        button.disabled = false;
      }
    }
  };

  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
  $('search').oninput = render;
  $('filter-status').onchange = render;
  $('refresh').onclick = () => load().catch(error => $('notice').textContent = error.message);

  try {
    const response = await fetch('/api/me');
    if (!response.ok) throw Error('Inicia sesión para consultar los proveedores.');
    me = await response.json();
    const canProviders = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) ? me.pagePermissions.includes('proveedores.html') || me.pagePermissions.includes('productos.html') : ['ADMIN', 'RECEPTION'].includes(me.role));
    if (!canProviders) throw Error('Tu perfil no permite acceder a proveedores.');
    const canEdit = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) && (me.pagePermissions.includes('proveedores.html') || me.pagePermissions.includes('productos.html')));
    $('new-provider').hidden = !canEdit;
    await load();
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.get('nuevo') === '1' && canEdit) {
      edit();
    }
  } catch (error) {
    $('notice').textContent = error.message;
  }
})();
