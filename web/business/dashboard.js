(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const token = () => sessionStorage.getItem('calendar-user-token') || sessionStorage.getItem('calendar-admin-token') || window.CALENDAR_DEV_TOKEN || '';
  const gym = () => localStorage.getItem('calendar-selected-gym') || '';
  const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(date);
  const dataPanels = ['.metric-grid', '.business-grid'];

  function setRange(kind) {
    const now = new Date(), to = key(now), fromDate = new Date(now);
    if (kind === 'week') fromDate.setDate(fromDate.getDate() - ((fromDate.getDay() + 6) % 7));
    else if (kind === 'month') fromDate.setDate(1);
    $('from').value = kind === 'today' ? to : key(fromDate);
    $('to').value = to;
    document.querySelectorAll('[data-range]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.range === kind)));
  }

  function clearData() {
    ['revenue-total', 'revenue-services', 'revenue-products', 'product-profit'].forEach(id => { $(id).textContent = '—'; });
    $('revenue-chart').replaceChildren(); $('occupancy').replaceChildren(); $('brand-comparison').replaceChildren(); $('updated-at').textContent = '';
  }

  async function load() {
    const status = $('status');
    status.textContent = 'Actualizando resultados…'; status.classList.remove('error');
    dataPanels.forEach(selector => { document.querySelector(selector).hidden = false; });
    try {
      const query = new URLSearchParams({ from: $('from').value, to: $('to').value });
      const headers = { Authorization: 'Bearer ' + token() };
      if (gym()) headers['x-calendar-gym'] = gym();
      const response = await fetch('/api/dashboard?' + query, { headers });
      const data = await response.json();
      if (response.status === 401) { location.href = '/login.html'; return; }
      if (response.status === 403) throw Object.assign(new Error('Tu perfil no tiene permiso para consultar el Cuadro de mando. Pide acceso a administración.'), { forbidden: true });
      if (!response.ok) throw Error(data.error || 'No se pudieron cargar las métricas. Inténtalo de nuevo.');
      $('revenue-total').textContent = euro.format(data.revenue.total);
      $('revenue-services').textContent = euro.format(data.revenue.services);
      $('revenue-products').textContent = euro.format(data.revenue.products);
      $('product-profit').textContent = euro.format(data.revenue.productProfit);
      const max = Math.max(1, ...data.daily.flatMap(day => [day.services, day.products]));
      $('revenue-chart').innerHTML = data.daily.length ? data.daily.map(day => `<div class="bar-day" title="${esc(day.date)} · Servicios ${esc(euro.format(day.services))} · Productos ${esc(euro.format(day.products))}"><i class="services" style="height:${Math.max(2, day.services / max * 100)}%"></i><i class="products" style="height:${Math.max(2, day.products / max * 100)}%"></i><time>${esc(day.date.slice(8))}</time></div>`).join('') : '<p class="empty-business">No hay ventas registradas en este período.</p>';
      const occupancy = [['Realizadas', 'completed', ''], ['Canceladas', 'cancelled', 'cancelled'], ['No presentados', 'noShow', 'no-show'], ['Programadas', 'scheduled', 'scheduled']];
      const total = Math.max(1, ...occupancy.map(([, key]) => data.occupancy[key]));
      $('occupancy').innerHTML = occupancy.map(([label, key, css]) => `<div class="occupancy-row ${css}"><span>${label}</span><div class="occupancy-track"><i style="width:${data.occupancy[key] / total * 100}%"></i></div><strong>${data.occupancy[key]}</strong></div>`).join('');
      $('brand-comparison').innerHTML = data.brandComparison.map(row => `<tr><td>${row.brand === 'TRAINERS_POINT' ? 'Trainers Point' : 'Cobosu'}</td><td>${row.activeClients}</td><td>${row.activity}</td><td>${esc(euro.format(row.revenue))}</td></tr>`).join('');
      $('updated-at').textContent = 'Datos actualizados: ' + new Date(data.updatedAt).toLocaleString('es-ES');
      status.textContent = `Período: ${data.range.from} a ${data.range.to}`;
    } catch (error) {
      clearData();
      if (error.forbidden) dataPanels.forEach(selector => { document.querySelector(selector).hidden = true; });
      status.textContent = error.message || 'No se pudieron cargar las métricas. Inténtalo de nuevo.';
      status.classList.add('error');
    }
  }

  $('dashboard-filters').addEventListener('submit', event => { event.preventDefault(); load(); });
  document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => { setRange(button.dataset.range); load(); }));
  setRange('month'); load();
})();
