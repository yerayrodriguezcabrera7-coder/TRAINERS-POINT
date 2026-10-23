(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = sessionStorage.getItem('calendar-user-token') || window.CALENDAR_DEV_TOKEN || sessionStorage.getItem('calendar-admin-token') || '';
  let state, attendance, me, day, filter='all', loading=false;
  const names={PENDING:'Pendiente',CONFIRMED:'Confirmada',COMPLETED:'Finalizada',NO_SHOW:'No asistió'};
  async function api(path){
    const response=await fetch('/api/'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
    if(response.status===401){location.href='login.html';throw Error('Inicia sesión para continuar.');}
    const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo actualizar el resumen.');return data;
  }
  function render(){
    const now=new Date();
    day=new Intl.DateTimeFormat('en-CA',{timeZone:state.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    $('overview-date').textContent=new Intl.DateTimeFormat('es-ES',{timeZone:state.timezone,weekday:'long',day:'numeric',month:'long'}).format(now).toUpperCase();
    const bookings=state.bookings.filter(b=>b.date===day && b.status!=='CANCELLED').sort((a,b)=>a.start.localeCompare(b.start));
    const pending=bookings.filter(b=>b.status==='PENDING');
    const working=attendance.records.filter(r=>!r.clockOut);
    $('today-count').textContent=bookings.length;
    $('pending-count').textContent=$('pending-badge').textContent=pending.length;
    $('client-count').textContent=state.clients.filter(c=>(c.status||'ACTIVE')==='ACTIVE').length;
    $('clock-count').textContent=working.length;
    if(me.role!=='ADMIN'){$('team-title').textContent='Mi jornada';$('clock-label').textContent='Mi jornada abierta';$('clock-caption').textContent='Solo tu registro de fichaje';}
    const selected=filter==='pending'?pending:bookings;
    const lookup=(list,id)=>state[list].find(x=>x.id===id)?.name||'Sin asignar';
    $('day-agenda').innerHTML=selected.length?selected.map(b=>`<a class="agenda-item" href="index.html?reserva=${encodeURIComponent(b.id)}&fecha=${day}" aria-label="Abrir reserva de ${esc(lookup('clients',b.clientId))} a las ${b.start}"><time>${b.start}<small>${b.end}</small></time><div><strong>${esc(lookup('clients',b.clientId))}</strong><span class="agenda-description">${esc(lookup('services',b.serviceId))} · ${esc(lookup('employees',b.employeeId))}</span></div><span class="booking-pill ${b.status.toLowerCase()}">${names[b.status]||esc(b.status)}</span></a>`).join(''):`<div class="dashboard-empty"><strong>${filter==='pending'?'Todo al día.':'Hoy tienes espacio para más.'}</strong>${filter==='pending'?'No hay reservas pendientes de confirmar para hoy.':'Cuando añadas una reserva para hoy, aparecerá aquí con su cliente, servicio y horario.'}</div>`;
    $('working-team').innerHTML=working.length?working.map(r=>{
      const employee=attendance.employees.find(e=>e.id===r.employeeId);
      const name=employee?.name||'Empleado';
      const initials=name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
      const time=new Intl.DateTimeFormat('es-ES',{timeZone:state.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(r.clockIn));
      return `<div class="team-person"><span class="initials" aria-hidden="true">${esc(initials)}</span><div><strong>${esc(name)}</strong><small>Entrada registrada · ${time}</small></div></div>`;
    }).join(''):'<p class="dashboard-empty">No hay jornadas abiertas en los fichajes que puedes consultar.</p>';
  }
  async function refresh(){
    if(loading)return;loading=true;$('reload').disabled=true;
    try{[state,attendance]=await Promise.all([api('state'),api('attendance')]);render();$('overview-error').hidden=true;$('sync-time').textContent='Actualizado '+new Intl.DateTimeFormat('es-ES',{timeZone:state.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date());}
    catch(e){$('overview-error').textContent='No se ha actualizado el resumen. '+e.message;$('overview-error').hidden=false;$('sync-time').textContent='Sin actualizar';}
    finally{loading=false;$('reload').disabled=false;}
  }
  $('reload').onclick=refresh;
  document.querySelectorAll('[data-agenda]').forEach(button=>button.addEventListener('click',()=>{
    filter=button.dataset.agenda;document.querySelectorAll('[data-agenda]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(state&&attendance)render();
  }));
  try{me=await api('me');if(me.role==='TRAINER'){location.href='fichajes.html';return;}await refresh();setInterval(()=>{if(!document.hidden)void refresh();},20000);}
  catch(e){$('overview-error').textContent=e.message;$('overview-error').hidden=false;}
})();
