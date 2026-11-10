(() => {
  'use strict';
  const dialog = document.createElement('dialog');
  dialog.className = 'quick-payment';
  dialog.setAttribute('aria-labelledby', 'quick-payment-title');
  dialog.innerHTML = `<form><header><h2 id="quick-payment-title">Sesión realizada · pago pendiente</h2><button type="button" data-dismiss aria-label="Cerrar">×</button></header><div class="quick-payment-body"><p data-description></p><p><strong data-balance></strong></p><label>Importe recibido (€)<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Método de pago<select name="method"><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="BIZUM">Bizum</option></select></label><p>Confirma únicamente dinero que ya has recibido. Puedes registrar un pago parcial; el resto seguirá pendiente.</p><p data-error role="alert" hidden></p></div><footer><button type="button" data-dismiss>Dejar pendiente</button><button type="submit">Registrar cobro</button></footer></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), amount = form.elements.amount, method = form.elements.method;
  const error = dialog.querySelector('[data-error]');
  let sale, key, payload, busy = false, afterPayment;
  const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  async function api(path, body) {
    const token = sessionStorage.getItem('calendar-user-token') || sessionStorage.getItem('calendar-admin-token') || window.CALENDAR_DEV_TOKEN || '';
    const response = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo registrar el cobro.');
    return result;
  }
  dialog.querySelectorAll('[data-dismiss]').forEach(button => button.onclick = () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  const setBusy = value => { busy = value; form.querySelectorAll('button,input,select').forEach(el => { el.disabled = value; }); };
  window.TrainersPoint = window.TrainersPoint || {};
  window.TrainersPoint.collectBookingPayment = async (bookingId, onPaid) => {
    if (busy || dialog.open) return;
    setBusy(true);
    try {
      sale = await api('bookings/' + encodeURIComponent(bookingId) + '/billing');
      if (!sale.outstandingAmount) return;
      afterPayment = onPaid;
      key = crypto.randomUUID(); payload = null;
      error.hidden = true;
      amount.value = Number(sale.outstandingAmount).toFixed(2);
      amount.max = String(sale.outstandingAmount); method.value = 'EFECTIVO';
      dialog.querySelector('[data-description]').textContent = sale.scope === 'PACKAGE' ? 'La sesión utiliza un bono pendiente. Este importe corresponde al saldo del bono completo.' : (sale.lines || []).map(line => line.description).join(' · ');
      dialog.querySelector('[data-balance]').textContent = 'Pendiente: ' + euro.format(sale.outstandingAmount);
      dialog.showModal();
    } finally { setBusy(false); }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); error.hidden = true;
    try {
      payload ||= { requestKey: key, amount: Number(amount.value), method: method.value, note: 'Cobro desde asistencia de la reserva.' };
      await api('inventory/sales/' + sale.id + '/payments', payload);
      dialog.close(); payload = null;
      await afterPayment?.();
    } catch (e) {
      error.textContent = e.message + ' Si hubo un fallo de conexión, vuelve a pulsar Registrar cobro: se comprobará el mismo pago sin duplicarlo. Para revisar el saldo, cierra y vuelve a abrir el cobro.';
      error.hidden = false;
    } finally { setBusy(false); if (payload) { amount.disabled = true; method.disabled = true; } }
  });
})();
