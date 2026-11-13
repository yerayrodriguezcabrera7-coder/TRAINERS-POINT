(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const token = () => sessionStorage.getItem('calendar-user-token') || sessionStorage.getItem('calendar-admin-token') || window.CALENDAR_DEV_TOKEN || '';
  const gym = () => localStorage.getItem('calendar-selected-gym') || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const labels = {
    CASH_OPENED: 'Caja abierta', CASH_MOVEMENT: 'Movimiento de efectivo', CASH_CLOSED: 'Caja cerrada',
    SALE_COMPLETED: 'Venta registrada', SALE_CANCELLED: 'Venta anulada', SALE_RETURNED: 'Devolución de productos',
    PAYMENT_REGISTERED: 'Cobro registrado', PAYMENT_VERIFIED: 'Pago antiguo verificado', PAYMENT_REFUNDED: 'Dinero devuelto',
    PRODUCT_CREATED: 'Producto creado', PRODUCT_UPDATED: 'Producto modificado', PRODUCT_DISABLED: 'Producto desactivado',
    PRODUCT_STOCK_ADJUSTED: 'Stock ajustado', RESTOCK_REQUEST_UPDATED: 'Reposición actualizada',
    BOOKING_CREATED: 'Reserva creada', BOOKING_UPDATED: 'Reserva modificada', BOOKING_CANCELLED: 'Reserva cancelada',
    PERMISSIONS_CHANGED: 'Permisos modificados', PASSWORD_CHANGED: 'Contraseña cambiada', PASSWORD_RESET: 'Contraseña restablecida',
  };
  const key = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(date);
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  $('from').value = key(month);
  $('to').value = key(now);

  async function load() {
    const status = $('status');
    status.textContent = 'Consultando actividad…';
    status.classList.remove('error');
    try {
      const query = new URLSearchParams({ from: $('from').value, to: $('to').value });
      if ($('type').value) query.set('type', $('type').value);
      if ($('user').value.trim()) query.set('user', $('user').value.trim());
      const headers = { Authorization: 'Bearer ' + token() };
      if (gym()) headers['x-calendar-gym'] = gym();
      const response = await fetch('/api/audit-events?' + query, { headers });
      const data = await response.json();
      if (response.status === 401) { location.href = '/login.html'; return; }
      if (!response.ok) throw Error(data.error || 'No se pudo consultar el historial.');
      const selected = $('type').value;
      $('type').innerHTML = '<option value="">Todos los eventos</option>' + data.types.map(type => `<option value="${esc(type)}">${esc(labels[type] || type)}</option>`).join('');
      $('type').value = selected;
      $('audit-list').innerHTML = data.events.length ? data.events.map(event => `<li class="audit-event"><div><h3>${esc(labels[event.action] || event.action)}</h3><div class="audit-meta"><span>${esc(event.actorName)}</span><span>${esc(event.entityType)}</span></div>${event.detail ? `<p>${esc(event.detail)}</p>` : ''}<time datetime="${esc(event.occurredAt)}">${new Date(event.occurredAt).toLocaleString('es-ES')}</time></div></li>`).join('') : '<li class="empty-business">No hay acciones registradas para estos filtros.</li>';
      status.textContent = `${data.events.length} eventos del ${data.range.from} al ${data.range.to}`;
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  }
  $('audit-filters').addEventListener('submit', event => { event.preventDefault(); load(); });
  load();
})();
