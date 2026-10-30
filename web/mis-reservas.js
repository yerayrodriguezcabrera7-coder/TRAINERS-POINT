(async()=>{
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let data,request=0;
 async function api(path,method='GET',body){const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
 function options(id,items){$(id).innerHTML=items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');}
 async function slots(){const n=++request;$('slot').innerHTML='';$('submit').disabled=true;const service=data.services.find(s=>s.id===$('service').value);if(!service)return;$('price').textContent=`${service.price||0} € · ${service.duration} minutos`;
 const pending=data.recoveries.filter(r=>r.status==='PENDING'&&r.serviceId===service.id);$('credit-wrap').hidden=!pending.length;$('credit').checked=false;
 if(!$('date').value)return;try{const q=new URLSearchParams({serviceId:service.id,employeeId:$('employee').value,roomId:$('room').value,date:$('date').value});const items=await api('client-slots?'+q);if(n!==request)return;options('slot',items.map(s=>({id:s.start,name:s.start+' – '+s.end})));$('submit').disabled=!items.length;if(!items.length)$('notice').textContent='No hay horas disponibles para esta selección.';}catch(e){$('notice').textContent=e.message;}}
 async function load(){data=await api('client-calendar');options('service',data.services);options('employee',data.employees);options('room',data.rooms);const name=id=>data.services.find(s=>s.id===id)?.name||id;
 $('credits').textContent=data.recoveries.filter(r=>r.status==='PENDING').length+' sesiones pendientes de recuperar.';
 $('bookings').innerHTML=data.bookings.map(b=>`<p>${esc(b.date)} ${esc(b.start)} – ${esc(b.end)} · ${esc(name(b.serviceId))} · ${esc(b.status)}${b.recoveryId?' · Recuperación sin nuevo cobro':''}</p>`).join('')||'<p>No hay reservas.</p>';await slots();}
 ['service','employee','room','date'].forEach(id=>$(id).onchange=slots);
 $('reserve').onsubmit=async e=>{e.preventDefault();$('submit').disabled=true;try{const pending=data.recoveries.find(r=>r.status==='PENDING'&&r.serviceId===$('service').value);await api('client-calendar','POST',{serviceId:$('service').value,employeeId:$('employee').value,roomId:$('room').value,date:$('date').value,start:$('slot').value,recoveryId:$('credit').checked?pending?.id:null,notes:''});$('notice').textContent='Reserva confirmada.';await load();}catch(e){$('notice').textContent=e.message;$('submit').disabled=false;}};
 try{await load();}catch(e){$('notice').textContent=e.message;}
})();
