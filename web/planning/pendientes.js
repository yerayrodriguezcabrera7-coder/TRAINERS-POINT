(async () => {
  'use strict';
  const $ = id => (typeof document !== 'undefined' && document?.getElementById ? document.getElementById(id) : null);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const typeParam = new URLSearchParams(location.search).get('tipo');
  const type = typeParam === 'reprogramacion' ? 'reprogramacion' : typeParam === 'todos' ? 'todos' : 'asignacion';
  let data, packages = [], recoveries = [], editing, loading, saving = false, activeFilter = 'all';
  async function api(path, method = 'GET', body) {
    const response = await fetch('/api/' + path, {method, headers:{'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {})});
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'No se pudo completar la operación.');
    return result;
  }
  const options = items => items.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  const name = (kind, id) => data[kind].find(item => item.id === id)?.name || 'Sin asignar';
  const dayKey = value => new Intl.DateTimeFormat('sv-SE', {timeZone:data.timezone || 'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const timeKey = value => new Intl.DateTimeFormat('en-GB',{timeZone:data.timezone || 'Europe/Madrid',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  const dateLabel = value => new Intl.DateTimeFormat('es-ES', {timeZone:data.timezone || 'Europe/Madrid',dateStyle:'medium'}).format(new Date(value));
  const quantity = (n,one,many) => `${n} ${n===1 ? one : many}`;
  const assignmentBookings = () => data.bookings.filter(b => !b.employeeId && ['PENDING','CONFIRMED'].includes(String(b.status || '').toUpperCase()));
  const rescheduleBookings = () => data.bookings.filter(b => b.needsReschedule);
  const pendingRecoveries = () => recoveries.filter(r => r.status === 'PENDING' || (r.status === 'RESCHEDULE_PENDING' && !data.bookings.some(b => b.recoveryId === r.id && b.needsReschedule)));
  const clientLink = (id, label) => `<a href="/clientes/${encodeURIComponent(id)}/ficha">${esc(label)}</a>`;

  const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const DAY_NAMES_CLEAN = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const DAYS_MAP = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes', S: 'Sábado', D: 'Domingo' };

  function getClientPrefDays(client) {
    if (!client) return [];
    let avail = client.availability;
    if (typeof avail === 'string') {
      try { avail = JSON.parse(avail); } catch (_) {}
    }
    if (Array.isArray(avail?.days)) return avail.days;
    if (Array.isArray(avail)) return avail;
    if (typeof avail === 'object' && avail && Array.isArray(avail.preferredDays)) return avail.preferredDays;
    return [];
  }

  function getClientPrefSlots(client) {
    if (!client) return [];
    let avail = client.availability;
    if (typeof avail === 'string') {
      try { avail = JSON.parse(avail); } catch (_) {}
    }
    const slots = [];
    if (client.contactSlot) slots.push(client.contactSlot);
    if (Array.isArray(avail?.slots)) {
      avail.slots.forEach(s => { if (!slots.includes(s)) slots.push(s); });
    }
    return slots;
  }

  function isPreferredDayOfWeek(date, prefDaysList) {
    if (!prefDaysList || !prefDaysList.length) return false;
    const dow = (date.getDay() + 6) % 7;
    const letter = DAY_SHORT[dow];
    const cleanName = DAY_NAMES_CLEAN[dow];
    return prefDaysList.some(d => {
      const s = String(d || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return s === letter.toLowerCase() || s === cleanName || cleanName.startsWith(s);
    });
  }

  function renderMiniCalendar(container, config) {
    if (!container) return { setSelectedDate: () => {} };
    let viewDate = config.selectedDate ? new Date(config.selectedDate + 'T12:00:00') : new Date();
    if (isNaN(viewDate.getTime())) viewDate = new Date();
    let viewYear = viewDate.getFullYear();
    let viewMonth = viewDate.getMonth();

    function updateView() {
      const firstDayOfMonth = new Date(viewYear, viewMonth, 1, 12);
      const firstDayDow = (firstDayOfMonth.getDay() + 6) % 7;
      const numDays = new Date(viewYear, viewMonth + 1, 0, 12).getDate();
      const prefNames = (config.prefDays || []).map(d => DAYS_MAP[d] || d).join(', ');

      let daysHtml = '';
      for (let i = 0; i < firstDayDow; i++) {
        daysHtml += '<div class="mini-cal-empty" aria-hidden="true"></div>';
      }

      for (let day = 1; day <= numDays; day++) {
        const dObj = new Date(viewYear, viewMonth, day, 12);
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const d = String(dObj.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const isPref = isPreferredDayOfWeek(dObj, config.prefDays);
        const isSelected = dateStr === config.selectedDate;
        const isPast = config.minDate && dateStr < config.minDate;
        const isExpired = config.maxDate && dateStr > config.maxDate;
        const isDisabled = isPast || isExpired;

        const classes = [
          'mini-cal-day',
          isPref ? 'is-preferred-day' : '',
          isSelected ? 'is-selected' : '',
          isPast ? 'is-past' : '',
          isExpired ? 'is-expired' : ''
        ].filter(Boolean).join(' ');

        const title = isPref ? 'Día de preferencia del cliente ⭐' : isSelected ? 'Fecha seleccionada' : 'Seleccionar fecha';

        daysHtml += `<button type="button" class="${classes}" data-mini-date="${dateStr}" ${isDisabled ? 'disabled' : ''} title="${title}">` +
          `<span class="mini-cal-day-num">${day}</span>` +
          (isPref ? '<span class="mini-cal-pref-star" aria-hidden="true">⭐</span>' : '') +
          `</button>`;
      }

      container.innerHTML = `
        <div class="mini-cal-header">
          <button type="button" class="mini-cal-nav mini-cal-prev" aria-label="Mes anterior">‹</button>
          <strong class="mini-cal-title">${MONTH_NAMES[viewMonth]} ${viewYear}</strong>
          <button type="button" class="mini-cal-nav mini-cal-next" aria-label="Mes siguiente">›</button>
        </div>
        <div class="mini-cal-grid">
          ${DAY_SHORT.map(wd => `<div class="mini-cal-weekday">${wd}</div>`).join('')}
          ${daysHtml}
        </div>
        <div class="mini-cal-legend">
          <span class="mini-cal-legend-item"><span class="mini-cal-swatch is-preferred-swatch"></span> Día de preferencia</span>
          <span class="mini-cal-legend-item"><span class="mini-cal-swatch is-selected-swatch"></span> Seleccionado</span>
          ${prefNames ? `<span class="mini-cal-pref-text">Preferencias: <strong>${prefNames}</strong></span>` : '<span class="mini-cal-pref-text is-empty">Sin días de preferencia en ficha</span>'}
        </div>
      `;

      const prevBtn = container.querySelector('.mini-cal-prev');
      if (prevBtn) {
        prevBtn.onclick = (e) => {
          e.preventDefault();
          viewMonth--;
          if (viewMonth < 0) { viewMonth = 11; viewYear--; }
          updateView();
        };
      }
      const nextBtn = container.querySelector('.mini-cal-next');
      if (nextBtn) {
        nextBtn.onclick = (e) => {
          e.preventDefault();
          viewMonth++;
          if (viewMonth > 11) { viewMonth = 0; viewYear++; }
          updateView();
        };
      }

      container.querySelectorAll('.mini-cal-day:not(:disabled)').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          const targetDate = btn.dataset.miniDate;
          config.selectedDate = targetDate;
          if (typeof config.onSelect === 'function') {
            config.onSelect(targetDate);
          }
          updateView();
        };
      });
    }

    updateView();

    return {
      setSelectedDate(newDate) {
        config.selectedDate = newDate;
        const d = new Date(newDate + 'T12:00:00');
        if (!isNaN(d.getTime())) {
          viewYear = d.getFullYear();
          viewMonth = d.getMonth();
        }
        updateView();
      }
    };
  }

  function groups() {
    const clients = new Map();
    const group = (id, label) => {
      if (!clients.has(id)) clients.set(id,{id,name:label,packages:[],bookings:[],recoveries:[],deadline:'9999-12-31',pressure:0});
      return clients.get(id);
    };
    if (type === 'asignacion' || type === 'todos') {
      for (const pkg of packages) {
        const item=group(pkg.clientId,pkg.clientName);
        item.packages.push(pkg);
        if(dayKey(pkg.expiresAt)<item.deadline)item.deadline=dayKey(pkg.expiresAt);
        item.pressure+=pkg.sessionsToSchedule/Math.max(1,pkg.daysRemaining);
      }
      for (const booking of assignmentBookings()) {
        const item=group(booking.clientId,name('clients',booking.clientId));
        item.bookings.push(booking);
        if(booking.date<item.deadline)item.deadline=booking.date;
      }
    }
    if (type === 'reprogramacion' || type === 'todos') {
      for (const booking of rescheduleBookings()) {
        const item=group(booking.clientId,name('clients',booking.clientId));
        item.bookings.push(booking);
        if(booking.date<item.deadline)item.deadline=booking.date;
      }
      for (const rec of pendingRecoveries()) {
        const item=group(rec.clientId,name('clients',rec.clientId));
        item.recoveries.push(rec);
      }
    }
    const query=$('search').value.trim().toLocaleLowerCase('es');
    return [...clients.values()].filter(item => {
      const matchText = (item.name+' '+item.packages.map(p=>p.serviceName).join(' ')+' '+item.bookings.map(b=>name('services',b.serviceId)).join(' ')+' '+item.recoveries.map(r=>name('services',r.serviceId)).join(' ')).toLocaleLowerCase('es').includes(query);
      if (!matchText) return false;
      if (activeFilter === 'urgent') return item.packages.some(p => p.daysRemaining <= 7) || item.bookings.some(b => !b.employeeId && b.date <= dayKey(Date.now() + 86400000 * 2));
      if (activeFilter === 'unassigned') return item.bookings.some(b => !b.employeeId);
      if (activeFilter === 'unpaid') return item.packages.some(p => p.paymentPending);
      return true;
    }).sort((a,b)=>a.deadline.localeCompare(b.deadline) || b.pressure-a.pressure || a.name.localeCompare(b.name,'es') || a.id.localeCompare(b.id));
  }
  function render() {
    const assignments=assignmentBookings(), reschedules=rescheduleBookings(), pendingRecs=pendingRecoveries();
    const allClients=new Set([...assignments.map(b=>b.clientId),...packages.map(p=>p.clientId)]);
    const reschedClients=new Set([...reschedules.map(b=>b.clientId),...pendingRecs.map(r=>r.clientId)]);
    const totalClients=new Set([...allClients,...reschedClients]);
    if ($('all-tab')) $('all-tab').textContent=`Todos (${quantity(totalClients.size,'cliente','clientes')})`;
    $('assignment-tab').textContent=`Por organizar (${quantity(allClients.size,'cliente','clientes')})`;
    $('reschedule-tab').textContent=`Reprogramar / Recuperar (${reschedules.length + pendingRecs.length})`;
    const activeTab = $(type === 'todos' ? 'all-tab' : type === 'reprogramacion' ? 'reschedule-tab' : 'assignment-tab');
    if (activeTab) activeTab.setAttribute('aria-current','page');
    document.querySelector('h1').textContent=type === 'todos' ? 'Todos los pendientes' : type === 'asignacion' ? 'Pendientes de asignación' : 'Pendientes de reprogramación y recuperación';
    $('page-description').textContent=type === 'todos' ? 'Vista completa de todas las sesiones de bonos, citas sin trabajador y reprogramaciones.' : type === 'asignacion' ? 'Sesiones disponibles de bonos y citas sin trabajador, organizadas desde el centro activo.' : 'Reprograma citas aplazadas o agenda sesiones pendientes de recuperar sin volver a cobrar.';
    const items=groups();
    const free=items.reduce((sum,item)=>sum+item.packages.reduce((n,p)=>n+p.sessionsToSchedule,0),0);
    const bookings=items.reduce((sum,item)=>sum+item.bookings.length,0);
    const recsCount=items.reduce((sum,item)=>sum+item.recoveries.length,0);
    $('list-summary').textContent=type === 'todos' ? `${items.length} clientes · ${free} sesiones de bono · ${bookings} citas · ${recsCount} recuperaciones` : type === 'asignacion' ? `${items.length} clientes · ${free} sesiones de bono sin agendar · ${bookings} citas sin trabajador` : `${items.length} clientes · ${bookings} citas por reprogramar · ${recsCount} sesiones por recuperar`;
    $('urgent-panel').hidden=!items.length;
    $('urgent-count').textContent=`${Math.min(4,items.length)} de ${items.length} clientes`;
    $('urgent-list').innerHTML=!items.length ? '' : items.slice(0,4).map((item,index)=>{
      const pkg=item.packages[0], booking=item.bookings[0], rec=item.recoveries[0];
      const prioritizeBooking=booking && (!pkg || booking.date<=dayKey(pkg.expiresAt));
      const reason=!prioritizeBooking && pkg ? `Bono: ${pkg.daysRemaining <= 1 ? 'caduca hoy o mañana' : `caduca en ${pkg.daysRemaining} días`}` : (booking?.needsReschedule ? 'Cita pendiente de reprogramar' : booking ? 'Cita sin trabajador asignado' : 'Sesión pendiente de recuperar');
      const total=item.packages.reduce((n,p)=>n+p.sessionsToSchedule,0);
      const isCritical = (!prioritizeBooking && pkg && pkg.daysRemaining <= 2) || (prioritizeBooking && booking && booking.date <= dayKey(Date.now() + 86400000));
      const client = data?.clients ? data.clients.find(c => c.id === item.id) : null;
      const prefWorker = client?.assignedWorkerId ? name('employees', client.assignedWorkerId) : null;
      const prefSlotLabel = client?.contactSlot === 'MANANA' ? 'Mañanas' : client?.contactSlot === 'TARDE' ? 'Tardes' : client?.contactSlot === 'MEDIODIA' ? 'Mediodía' : null;
      const prefSummary = [prefWorker ? `⭐ ${prefWorker}` : '', prefSlotLabel ? `⏰ ${prefSlotLabel}` : ''].filter(Boolean).join(' · ');
      const dateText = !prioritizeBooking && pkg ? `<small>Caducidad más próxima: ${esc(dateLabel(pkg.expiresAt))}</small>` : booking ? `<small>Cita: ${esc(booking.date)} · ${esc(booking.start)}</small>` : '<small>Recuperación sin fecha límite</small>';
      const actionBtn = prioritizeBooking ? `<button type="button" data-edit="${esc(booking.id)}">${booking.needsReschedule ? 'Reprogramar cita' : 'Organizar cita'}</button>` : pkg ? `<button type="button" data-package="${esc(pkg.packageId)}">Agendar una sesión</button>` : rec ? `<button type="button" data-recovery="${esc(rec.id)}">Agendar recuperación</button>` : '';
      return `<article class="pending-urgent-card ${isCritical ? 'is-critical' : ''}"><div class="pending-card-top"><span class="pending-rank">Prioridad ${index+1}</span>${isCritical ? '<span class="urgency-pill critical">Urgente</span>' : '<span class="urgency-pill normal">Próximo</span>'}</div><h3>${esc(item.name)}</h3><p class="pending-reason">${esc(reason)}</p><p>${[...(total ? [quantity(total,'sesión de bono sin agendar','sesiones de bono sin agendar')] : []),...(item.bookings.length ? [quantity(item.bookings.length,'cita','citas')] : []),...(item.recoveries.length ? [quantity(item.recoveries.length,'recuperación','recuperaciones')] : [])].join(' · ')}</p>${dateText}${prefSummary ? `<small class="pref-hint">${esc(prefSummary)}</small>` : ''}${actionBtn}</article>`;
    }).join('');
    $('rows').innerHTML=items.flatMap(item=>{
      const client = data?.clients ? data.clients.find(c => c.id === item.id) : null;
      const prefWorker = client?.assignedWorkerId ? name('employees', client.assignedWorkerId) : null;
      return [
        ...item.bookings.map(booking=>`<tr><td><strong>${clientLink(item.id,item.name)}</strong></td><td>${esc(name('services',booking.serviceId))}<small>${booking.needsReschedule ? 'Pendiente de reprogramar' : 'Cita sin trabajador'}</small></td><td>${esc(booking.date)} · ${esc(booking.start)}–${esc(booking.end)}</td><td>${esc(name('employees',booking.employeeId))}${!booking.employeeId && prefWorker ? `<small class="pref-hint">⭐ Habitual: ${esc(prefWorker)}</small>` : ''}</td><td class="pending-actions"><button type="button" data-edit="${esc(booking.id)}">${booking.needsReschedule ? 'Reprogramar' : 'Asignar trabajador'}</button><a href="/index.html?fecha=${encodeURIComponent(booking.date)}&reserva=${encodeURIComponent(booking.id)}">Ver historial</a></td></tr>`),
        ...item.recoveries.map(rec=>`<tr><td><strong>${clientLink(item.id,item.name)}</strong></td><td>${esc(name('services',rec.serviceId))}<small>${rec.status === 'RESCHEDULE_PENDING' ? 'Recuperación pendiente de reprogramar' : 'Sesión pendiente de recuperar'}</small></td><td>Sin fecha límite<small>Crédito de recuperación</small></td><td>${esc(name('employees',rec.employeeId))}</td><td class="pending-actions"><button type="button" data-recovery="${esc(rec.id)}">Agendar recuperación</button><a href="/clientes/${encodeURIComponent(item.id)}/ficha">Ver ficha</a></td></tr>`),
        ...item.packages.map(pkg=>`<tr><td><strong>${clientLink(item.id,item.name)}</strong></td><td>${esc(pkg.serviceName)}<small>${quantity(pkg.sessionsToSchedule,'sesión sin agendar','sesiones sin agendar')} · ${quantity(pkg.sessionsScheduled,'ya reservada','ya reservadas')}</small>${pkg.paymentPending ? '<small class="tag-unpaid">⚠️ Bono con pago pendiente</small>' : ''}</td><td>Caduca el ${esc(dateLabel(pkg.expiresAt))}<small class="${pkg.daysRemaining <= 2 ? 'tag-critical' : ''}">${pkg.daysRemaining} días restantes</small></td><td>Por elegir${prefWorker ? `<small class="pref-hint">⭐ Habitual: ${esc(prefWorker)}</small>` : ''}</td><td class="pending-actions"><button type="button" data-package="${esc(pkg.packageId)}">Agendar una sesión</button><a href="/clientes/${encodeURIComponent(item.id)}/ficha">Ver bono y ficha</a></td></tr>`)
      ];
    }).join('') || (() => {
      const otherCount = type === 'asignacion' ? (reschedules.length + pendingRecs.length) : (assignments.length + packages.length);
      return otherCount > 0 && type !== 'todos'
        ? `<tr><td colspan="5">No hay pendientes en esta pestaña. Tienes <strong>${otherCount} pendiente(s)</strong> en <a href="?tipo=${type === 'asignacion' ? 'reprogramacion' : 'asignacion'}">${type === 'asignacion' ? 'Reprogramar / Recuperar' : 'Por organizar'}</a> o puedes consultar <a href="?tipo=todos">Todos (${totalClients.size})</a>.</td></tr>`
        : '<tr><td colspan="5">No hay sesiones ni citas pendientes para esta búsqueda.</td></tr>';
    })();
    const historyPanel=$('recoveries-history-panel'), historyList=$('recoveries-history-list');
    if (historyPanel && historyList) {
      const states={RESCHEDULE_PENDING:'Pendiente de reprogramación',PENDING:'Pendiente de recuperar',SCHEDULED:'Recuperación programada',COMPLETED:'Recuperada',FORFEITED:'Resuelta sin recuperación'};
      historyPanel.hidden=type !== 'reprogramacion' || !recoveries.length;
      historyList.innerHTML=type === 'reprogramacion' && recoveries.length
        ? `<div class="history-scroll"><table class="pending-table"><thead><tr><th>Cliente</th><th>Servicio</th><th>Estado del crédito</th></tr></thead><tbody>${recoveries.map(r=>`<tr><td><strong>${clientLink(r.clientId,name('clients',r.clientId))}</strong></td><td>${esc(name('services',r.serviceId))}</td><td>${esc(states[r.status] || r.status)}</td></tr>`).join('')}</tbody></table></div>`
        : '';
    }
  }
  async function load() {
    if (loading) return loading;
    loading=(async()=>{
      const [state,result,recoveryList]=await Promise.all([api('state'),api('pending-packages'),api('recoveries').catch(()=>[])]);
      data=state;packages=result.packages;recoveries=Array.isArray(recoveryList)?recoveryList:[];render();
    })();
    try {await loading;} finally {loading=null;}
  }
  function openEditor(event) {
    if(saving)return;
    const target=event.target.closest('[data-edit],[data-package],[data-recovery]');
    if (!target) return;
    const pkg=target.dataset.package ? packages.find(p=>p.packageId===target.dataset.package) : null;
    const rec=target.dataset.recovery ? recoveries.find(r=>r.id===target.dataset.recovery) : null;
    const booking=target.dataset.edit ? data.bookings.find(b=>b.id===target.dataset.edit) : null;
    if (!pkg && !rec && !booking) return;
    editing=pkg ? {clientId:pkg.clientId,serviceId:pkg.serviceId,packageId:pkg.packageId,centerId:data.gymId} : rec ? {clientId:rec.clientId,serviceId:rec.serviceId,recoveryId:rec.id,employeeId:rec.employeeId||'',centerId:data.gymId} : structuredClone(booking);
    const service=data.services.find(s=>s.id===editing.serviceId);
    if(!service){$('notice').textContent='El servicio ya no está disponible. Actualiza la lista.';return;}
    const client=data.clients.find(c=>c.id===editing.clientId);
    const activeEmployees=data.employees.filter(e=>e.active !== false && (!service.employeeIds?.length || service.employeeIds.includes(e.id)));
    $('employee').innerHTML=options(activeEmployees);
    // Preferencia de cliente: si no hay trabajador asignado en la cita, usar el entrenador habitual del cliente si está habilitado
    const preferredEmployee=client?.assignedWorkerId && activeEmployees.some(e=>e.id===client.assignedWorkerId) ? client.assignedWorkerId : null;
    $('employee').value=editing.employeeId || preferredEmployee || $('employee').options[0]?.value || '';
    $('room').innerHTML=options(data.rooms);$('room').value=editing.roomId || data.rooms[0]?.id || '';
    $('date').min=dayKey(Date.now());$('date').max=pkg ? dayKey(pkg.expiresAt) : '';
    $('date').value=editing.date || dayKey(Date.now());$('start').value=editing.start || '';
    $('error').textContent='';$('availability').replaceChildren();
    $('title').textContent=pkg ? 'Agendar una sesión del bono' : rec ? 'Agendar sesión de recuperación' : 'Organizar reserva';
    $('save').textContent=pkg ? 'Confirmar sesión del bono' : rec ? 'Confirmar recuperación' : 'Confirmar nueva organización';
    $('original').textContent=pkg ? `${pkg.clientName} · ${pkg.serviceName} · ${quantity(pkg.sessionsToSchedule,'sesión disponible','sesiones disponibles')}. Se utilizará este bono sin crear otra compra.` : rec ? `${name('clients',rec.clientId)} · ${name('services',rec.serviceId)} · Sesión pendiente de recuperar. Se utilizará este crédito sin generar otro cobro.` : `${name('clients',editing.clientId)} · ${name('services',editing.serviceId)} · Anterior: ${editing.date} ${editing.start}`;

    // Mostrar caja de preferencias del cliente
    const prefBox=$('client-preferences-badge');
    const prefDaysList = getClientPrefDays(client);
    const prefSlotsList = getClientPrefSlots(client);
    if(prefBox){
      const assignedEmp=client?.assignedWorkerId ? data.employees.find(e=>e.id===client.assignedWorkerId) : null;
      const slotsMap={MANANA:'Mañanas (09:00–14:00)',MEDIODIA:'Mediodía (14:00–16:00)',TARDE:'Tardes (16:00–21:00)'};
      const prefDaysText = prefDaysList.map(d => DAYS_MAP[d] || d).join(', ');
      const prefSlotsText = prefSlotsList.map(s => slotsMap[s] || s).join(' · ');
      const items=[];
      if(assignedEmp)items.push(`<span class="pref-pill pref-pill-worker">⭐ Entrenador habitual: <strong>${esc(assignedEmp.name)}</strong></span>`);
      if(prefDaysText)items.push(`<span class="pref-pill pref-pill-days">📅 Días: <strong>${esc(prefDaysText)}</strong></span>`);
      if(prefSlotsText)items.push(`<span class="pref-pill pref-pill-time">⏰ Horario: <strong>${esc(prefSlotsText)}</strong></span>`);
      if(client?.objective)items.push(`<span class="pref-pill pref-pill-obj">🎯 Objetivo: <em>${esc(client.objective)}</em></span>`);
      if(client?.injuryNotes)items.push(`<span class="pref-pill pref-pill-injury">⚠️ Consideración: <em>${esc(client.injuryNotes)}</em></span>`);
      if(items.length){
        prefBox.hidden=false;
        prefBox.innerHTML=`<div class="pref-card-title">💡 Preferencias del cliente</div><div class="pref-pills-row">${items.join('')}</div>`;
      } else {
        prefBox.hidden=true;
        prefBox.innerHTML='';
      }
    }

    // Mini-calendario interactivo con días de preferencia en verde
    const miniCalWrap = $('mini-calendar-wrap');
    if (miniCalWrap) {
      const miniCal = renderMiniCalendar(miniCalWrap, {
        selectedDate: $('date').value || dayKey(Date.now()),
        prefDays: prefDaysList,
        minDate: dayKey(Date.now()),
        maxDate: pkg ? dayKey(pkg.expiresAt) : '',
        onSelect: (selectedDateStr) => {
          $('date').value = selectedDateStr;
          $('check').click();
        }
      });
      $('date').onchange = () => {
        miniCal.setSelectedDate($('date').value);
      };
    }

    $('editor').showModal();
  }
  $('rows').onclick=$('urgent-list').onclick=openEditor;
  $('check').onclick=async()=>{
    $('error').textContent='';$('availability').replaceChildren();
    try {
      if(!['date','employee','room'].every(id=>$(id).value && $(id).reportValidity()))throw Error('Selecciona trabajador, fecha y sala para consultar huecos.');
      const query=new URLSearchParams({date:$('date').value,employeeId:$('employee').value,serviceId:editing.serviceId,roomId:$('room').value,centerId:editing.centerId || data.gymId,...(editing.id ? {excludeId:editing.id} : {})});
      const result=await api('slots?'+query);
      const pkg=packages.find(p=>p.packageId===editing.packageId);
      const expiry=pkg ? dayKey(pkg.expiresAt)+'T'+timeKey(pkg.expiresAt) : null;
      const slots=result.filter(slot=>($('date').value>dayKey(Date.now()) || slot.start>timeKey(Date.now())) && (!expiry || $('date').value+'T'+slot.end<=expiry));
      const client=data.clients.find(c=>c.id===editing.clientId);
      const preferredSlot=client?.contactSlot || client?.availability?.slots?.[0];
      const isSlotPreferred=startStr=>{
        if(!preferredSlot)return false;
        const h=parseInt(startStr,10);
        if(preferredSlot==='MANANA')return h<14;
        if(preferredSlot==='MEDIODIA')return h>=14 && h<16;
        if(preferredSlot==='TARDE')return h>=16;
        return false;
      };
      $('availability').innerHTML=slots.length ? '<p>Elige un hueco disponible:</p>'+slots.map(slot=>{
        const isFav=isSlotPreferred(slot.start);
        return `<button type="button" data-slot="${esc(slot.start)}" class="${isFav ? 'is-preferred-slot' : ''}" title="${isFav ? 'Coincide con la preferencia horaria del cliente' : ''}">${isFav ? '⭐ ' : ''}${esc(slot.start)}</button>`;
      }).join('') : '<p>No hay huecos disponibles. Prueba otro día o trabajador.</p>';
    } catch(error){$('error').textContent=error.message;}
  };
  $('availability').onclick=event=>{const slot=event.target.closest('[data-slot]');if(slot){$('start').value=slot.dataset.slot;$('start').focus();}};
  ['employee','date','room'].forEach(id=>$(id).addEventListener('change',()=>{$('availability').replaceChildren();}));
  $('form').onsubmit=async event=>{
    event.preventDefault();if(saving)return;
    if(!$('form').reportValidity())return;
    saving=true;$('save').disabled=true;$('error').textContent='';
    try {
      const service=data.services.find(s=>s.id===editing.serviceId);
      const [hours,minutes]=$('start').value.split(':').map(Number),end=hours*60+minutes+service.duration;
      if(end>=24*60)throw Error('La sesión debe terminar en el mismo día. Elige una hora anterior.');
      const booking={...editing,employeeId:$('employee').value,date:$('date').value,start:$('start').value,roomId:$('room').value,end:String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0'),status:'CONFIRMED',needsReschedule:false};
      if(!editing.id && booking.date===dayKey(Date.now()) && booking.start<=timeKey(Date.now()))throw Error('Elige una hora futura para agendar la sesión.');
      const pkg=packages.find(p=>p.packageId===editing.packageId);
      if(!editing.id && pkg && booking.date+'T'+booking.end>dayKey(pkg.expiresAt)+'T'+timeKey(pkg.expiresAt))throw Error('La sesión debe terminar antes de la caducidad del bono. Elige una fecha u hora anterior.');
      await api('bookings'+(editing.id ? '/'+encodeURIComponent(editing.id) : ''),editing.id ? 'PUT' : 'POST',{booking});
      $('editor').close();if(loading)await loading;await load();
      $('notice').textContent='Sesión organizada. El calendario del trabajador y las sesiones pendientes se han actualizado.';
      $('notice').focus();
    } catch(error){$('error').textContent=error.message;}finally{saving=false;$('save').disabled=false;}
  };
  $('close').onclick=$('cancel').onclick=()=>{if(!saving)$('editor').close();};
  $('editor').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  $('search').oninput=()=>{if(data)render();};
  $('refresh').onclick=()=>load().catch(error=>$('notice').textContent=error.message);
  const quickFilters = $('quick-filters');
  if (quickFilters) {
    quickFilters.onclick = (e) => {
      const chip = e.target.closest('.chip-filter');
      if (!chip) return;
      quickFilters.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter || 'all';
      if (data) render();
    };
  }
  try {
    const me=await api('me');const canPending=me.role==='ADMIN'||(Array.isArray(me.pagePermissions)?me.pagePermissions.includes('pendientes.html'):['ADMIN','RECEPTION'].includes(me.role));if(!canPending)throw Error('No tienes permiso para gestionar pendientes.');
    await load();
    window.TrainersPoint.poll(()=>!$('editor').open ? load() : undefined,2000,error=>$('notice').textContent=error.message);
  } catch(error){$('notice').textContent=error.message;$('list-summary').textContent='No se pudieron cargar los pendientes.';$('rows').innerHTML='<tr><td colspan="5">Pulsa Actualizar para volver a intentarlo.</td></tr>';}
})();
