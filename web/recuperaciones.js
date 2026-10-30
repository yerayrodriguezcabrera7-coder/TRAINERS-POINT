(async()=>{
 const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,method='GET',body){const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
 async function load(){const [data,credits,me]=await Promise.all([api('state'),api('recoveries'),api('me')]);const name=(kind,id)=>esc(data[kind].find(x=>x.id===id)?.name||id);const states={PENDING:'Pendiente de recuperar',SCHEDULED:'Recuperación programada',COMPLETED:'Recuperada',FORFEITED:'Resuelta sin recuperación'};
 $('credits').innerHTML=credits.map(c=>`<p>${name('clients',c.clientId)} · ${name('services',c.serviceId)} · <strong>${states[c.status]}</strong></p>`).join('')||'<p>No hay recuperaciones.</p>';
 $('sessions').innerHTML=data.bookings.filter(b=>b.status==='CONFIRMED').map(b=>`<p>${esc(b.date)} ${esc(b.start)} · ${name('clients',b.clientId)} · ${name('services',b.serviceId)} ${!b.recoveryId&&['ADMIN','TRAINER'].includes(me.role)?`<button data-defer="${esc(b.id)}">Dejar pendiente</button>`:''}</p>`).join('')||'<p>No hay sesiones confirmadas.</p>';
 $('sessions').onclick=async e=>{const id=e.target.dataset.defer;if(!id)return;try{await api('bookings/'+encodeURIComponent(id)+'/defer','POST',{});await load();}catch(err){if(me.role==='ADMIN'&&err.message.includes('dos horas')&&confirm('El aviso llega con menos de dos horas. ¿Autorizar una excepción?')){try{await api('bookings/'+encodeURIComponent(id)+'/defer','POST',{exception:true});await load();}catch(x){$('notice').textContent=x.message;}}else $('notice').textContent=err.message;}};
 }
 try{await load();}catch(e){$('notice').textContent=e.message;}
})();
