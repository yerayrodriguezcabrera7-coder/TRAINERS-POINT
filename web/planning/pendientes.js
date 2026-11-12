(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const type = new URLSearchParams(location.search).get('tipo') === 'reprogramacion' ? 'reprogramacion' : 'asignacion';
  let data, packages = [], editing, loading, saving = false;
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
  const assignmentBookings = () => data.bookings.filter(b => !b.employeeId && ['PENDING','CONFIRMED'].includes(b.status));
  const rescheduleBookings = () => data.bookings.filter(b => b.needsReschedule);
  const clientLink = (id, label) => `<a href="/clientes/${encodeURIComponent(id)}/ficha">${esc(label)}</a>`;

  function groups() {
    const clients = new Map();
    const group = (id, label) => {
      if (!clients.has(id)) clients.set(id,{id,name:label,packages:[],bookings:[],deadline:'9999-12-31',pressure:0});
      return clients.get(id);
    };
    if (type === 'asignacion') {
      for (const pkg of packages) {
        const item=group(pkg.clientId,pkg.clientName);
        item.packages.push(pkg);
        if(dayKey(pkg.expiresAt)<item.deadline)item.deadline=dayKey(pkg.expiresAt);
        item.pressure+=pkg.sessionsToSchedule/Math.max(1,pkg.daysRemaining);
      }
    }
    for (const booking of type === 'asignacion' ? assignmentBookings() : rescheduleBookings()) {
      const item=group(booking.clientId,name('clients',booking.clientId));
      item.bookings.push(booking);
      if(booking.date<item.deadline)item.deadline=booking.date;
    }
    const query=$('search').value.trim().toLocaleLowerCase('es');
    return [...clients.values()].filter(item => (item.name+' '+item.packages.map(p=>p.serviceName).join(' ')+' '+item.bookings.map(b=>name('services',b.serviceId)).join(' ')).toLocaleLowerCase('es').includes(query))
      .sort((a,b)=>a.deadline.localeCompare(b.deadline) || b.pressure-a.pressure || a.name.localeCompare(b.name,'es') || a.id.localeCompare(b.id));
  }
  function render() {
    const assignments=assignmentBookings(), reschedules=rescheduleBookings();
    const allClients=new Set([...assignments.map(b=>b.clientId),...packages.map(p=>p.clientId)]);
    $('assignment-tab').textContent=`Por organizar (${quantity(allClients.size,'cliente','clientes')})`;
    $('reschedule-tab').textContent=`Por reprogramar (${reschedules.length})`;
    $(type === 'asignacion' ? 'assignment-tab' : 'reschedule-tab').setAttribute('aria-current','page');
    document.querySelector('h1').textContent=type === 'asignacion' ? 'Pendientes de asignación' : 'Pendientes de reprogramación';
    $('page-description').textContent=type === 'asignacion' ? 'Sesiones disponibles de bonos y citas sin trabajador, organizadas desde el centro activo.' : 'Busca una nueva fecha sin perder el historial ni volver a cobrar la sesión.';
    const items=groups();
    const free=items.reduce((sum,item)=>sum+item.packages.reduce((n,p)=>n+p.sessionsToSchedule,0),0);
    const bookings=items.reduce((sum,item)=>sum+item.bookings.length,0);
    $('list-summary').textContent=type === 'asignacion' ? `${items.length} clientes · ${free} sesiones de bono sin agendar · ${bookings} citas sin trabajador` : `${items.length} clientes · ${bookings} citas por reprogramar`;
    $('urgent-panel').hidden=type !== 'asignacion' || !items.length;
    $('urgent-count').textContent=`${Math.min(4,items.length)} de ${items.length} clientes`;
    $('urgent-list').innerHTML=type !== 'asignacion' ? '' : items.slice(0,4).map((item,index)=>{
      const pkg=item.packages[0], booking=item.bookings[0];
      const prioritizeBooking=booking && (!pkg || booking.date<=dayKey(pkg.expiresAt));
      const reason=!prioritizeBooking && pkg ? `Bono: ${pkg.daysRemaining <= 1 ? 'caduca hoy o mañana' : `caduca en ${pkg.daysRemaining} días`}` : 'Cita sin trabajador asignado';
      const total=item.packages.reduce((n,p)=>n+p.sessionsToSchedule,0);
      return `<article class="pending-urgent-card"><span class="pending-rank">Prioridad ${index+1}</span><h3>${esc(item.name)}</h3><p class="pending-reason">${esc(reason)}</p><p>${[...(total ? [quantity(total,'sesión de bono sin agendar','sesiones de bono sin agendar')] : []),...(item.bookings.length ? [quantity(item.bookings.length,'cita sin trabajador','citas sin trabajador')] : [])].join(' · ')}</p>${!prioritizeBooking && pkg ? `<small>Caducidad más próxima: ${esc(dateLabel(pkg.expiresAt))}</small>` : `<small>Cita: ${esc(booking.date)} · ${esc(booking.start)}</small>`}<button type="button" ${prioritizeBooking ? `data-edit="${esc(booking.id)}"` : `data-package="${esc(pkg.packageId)}"`}>${prioritizeBooking ? 'Organizar cita' : 'Agendar una sesión'}</button></article>`;
    }).join('');
    $('rows').innerHTML=items.flatMap(item=>[
      ...item.bookings.map(booking=>`<tr><td><strong>${clientLink(item.id,item.name)}</strong></td><td>${esc(name('services',booking.serviceId))}<small>${type === 'asignacion' ? 'Cita sin trabajador' : 'Pendiente de reprogramar'}</small></td><td>${esc(booking.date)} · ${esc(booking.start)}–${esc(booking.end)}</td><td>${esc(name('employees',booking.employeeId))}</td><td class="pending-actions"><button type="button" data-edit="${esc(booking.id)}">${type === 'asignacion' ? 'Asignar trabajador' : 'Reprogramar'}</button><a href="/index.html?fecha=${encodeURIComponent(booking.date)}&reserva=${encodeURIComponent(booking.id)}">Ver historial</a></td></tr>`),
      ...item.packages.map(pkg=>`<tr><td><strong>${clientLink(item.id,item.name)}</strong></td><td>${esc(pkg.serviceName)}<small>${quantity(pkg.sessionsToSchedule,'sesión sin agendar','sesiones sin agendar')} · ${quantity(pkg.sessionsScheduled,'ya reservada','ya reservadas')}</small>${pkg.paymentPending ? '<small>Bono con pago pendiente</small>' : ''}</td><td>Caduca el ${esc(dateLabel(pkg.expiresAt))}<small>${pkg.daysRemaining} días restantes</small></td><td>Por elegir</td><td class="pending-actions"><button type="button" data-package="${esc(pkg.packageId)}">Agendar una sesión</button><a href="/clientes/${encodeURIComponent(item.id)}/ficha">Ver bono y ficha</a></td></tr>`)
    ]).join('') || '<tr><td colspan="5">No hay sesiones ni citas pendientes para esta búsqueda.</td></tr>';
  }
  async function load() {
    if (loading) return loading;
    loading=(async()=>{
      const [state,result]=await Promise.all([api('state'),api('pending-packages')]);
      data=state;packages=result.packages;render();
    })();
    try {await loading;} finally {loading=null;}
  }
  function openEditor(event) {
    if(saving)return;
    const target=event.target.closest('[data-edit],[data-package]');
    if (!target) return;
    const pkg=target.dataset.package ? packages.find(p=>p.packageId===target.dataset.package) : null;
    const booking=target.dataset.edit ? data.bookings.find(b=>b.id===target.dataset.edit) : null;
    if (!pkg && !booking) return;
    editing=pkg ? {clientId:pkg.clientId,serviceId:pkg.serviceId,packageId:pkg.packageId,centerId:data.gymId} : structuredClone(booking);
    const service=data.services.find(s=>s.id===editing.serviceId);
    if(!service){$('notice').textContent='El servicio ya no está disponible. Actualiza la lista.';return;}
    $('employee').innerHTML=options(data.employees.filter(e=>e.active !== false && (!service.employeeIds?.length || service.employeeIds.includes(e.id))));
    $('employee').value=editing.employeeId || $('employee').options[0]?.value || '';
    $('room').innerHTML=options(data.rooms);$('room').value=editing.roomId || data.rooms[0]?.id || '';
    $('date').min=dayKey(Date.now());$('date').max=pkg ? dayKey(pkg.expiresAt) : '';
    $('date').value=editing.date || dayKey(Date.now());$('start').value=editing.start || '';
    $('error').textContent='';$('availability').replaceChildren();
    $('title').textContent=pkg ? 'Agendar una sesión del bono' : 'Organizar reserva';
    $('save').textContent=pkg ? 'Confirmar sesión del bono' : 'Confirmar nueva organización';
    $('original').textContent=pkg ? `${pkg.clientName} · ${pkg.serviceName} · ${quantity(pkg.sessionsToSchedule,'sesión disponible','sesiones disponibles')}. Se utilizará este bono sin crear otra compra.` : `${name('clients',editing.clientId)} · ${name('services',editing.serviceId)} · Anterior: ${editing.date} ${editing.start}`;
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
      $('availability').innerHTML=slots.length ? '<p>Elige un hueco disponible:</p>'+slots.map(slot=>`<button type="button" data-slot="${esc(slot.start)}">${esc(slot.start)}</button>`).join('') : '<p>No hay huecos disponibles. Prueba otro día o trabajador.</p>';
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
  try {
    const me=await api('me');const canPending=me.role==='ADMIN'||(Array.isArray(me.pagePermissions)?me.pagePermissions.includes('pendientes.html'):['ADMIN','RECEPTION'].includes(me.role));if(!canPending)throw Error('No tienes permiso para gestionar pendientes.');
    await load();
    window.TrainersPoint.poll(()=>!$('editor').open ? load() : undefined,2000,error=>$('notice').textContent=error.message);
  } catch(error){$('notice').textContent=error.message;$('list-summary').textContent='No se pudieron cargar los pendientes.';$('rows').innerHTML='<tr><td colspan="5">Pulsa Actualizar para volver a intentarlo.</td></tr>';}
})();
