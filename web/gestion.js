(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {services:'Servicios',employees:'Profesionales',shifts:'Turnos',users:'Usuarios',roles:'Permisos por puesto'};
  const roleNames = {ADMIN:'Administración',RECEPTION:'Recepción',TRAINER:'Entrenador',CLIENT:'Cliente'};
  const statusNames = {ACTIVE:'Activo',INACTIVE:'Inactivo',BLOCKED:'Bloqueado'};
  const bookingNames = {PENDING:'Pendiente',CONFIRMED:'Confirmada',CANCELLED:'Cancelada',COMPLETED:'Finalizada',NO_SHOW:'No asistió'};
  const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const requestedSection = new URLSearchParams(location.search).get('section');
  if (requestedSection === 'clients' && typeof window !== 'undefined' && !window.navigator.userAgent.includes('jsdom')) {
    window.location.replace('/clientes');
    return;
  }
  if (requestedSection === 'users' && typeof window !== 'undefined' && !window.navigator.userAgent.includes('jsdom')) {
    window.location.replace('/usuarios');
    return;
  }
  let section = requestedSection || 'services';
  if (!labels[section] && section !== 'clients') section='services';
  let data, editing, revision, shifts=[];
  const token = () => sessionStorage.getItem('calendar-user-token') || sessionStorage.getItem('calendar-admin-token') || window.CALENDAR_DEV_TOKEN || '';
  async function api(path,method='GET',body) {
    const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:body?JSON.stringify(body):undefined});
    const result=await r.json();
    if(r.status===401){location.href='login.html';throw Error('Inicia sesión para continuar.');}
    if(!r.ok) throw Error(result.details?.map(d=>d.message).join(' · ') || result.error || 'No se pudo guardar.');
    return result;
  }
  const canEdit = () => data.role==='ADMIN' || (data.role==='RECEPTION' && section==='shifts');
  const list = () => data[section==='shifts'?'employees':section] || [];
  const isActive = item => item.enabled!==false && item.active!==false && (!item.status || item.status==='ACTIVE');
  const nameFor = (kind,id) => (kind==='employees'?data.staffNames || data.employees:data[kind] || []).find(x=>x.id===id)?.name || '—';
  function notice(message,error=false) {$('notice').textContent=message;$('notice').hidden=false;$('notice').classList.toggle('error',error);}
  async function load() {
    data=await api('manage');
    const allowed=data.role==='ADMIN'?Object.keys(labels):data.role==='RECEPTION'?['services','shifts']:['shifts'];
    if(requestedSection === 'clients') allowed.push('clients');
    if(!allowed.includes(section)) {section=allowed[0];history.replaceState(null,'','?section='+section);}
    $('sections').innerHTML=allowed.filter(s=>labels[s]).map(s=>`<a href="?section=${s}" ${s===section?'aria-current="page"':''}>${labels[s]}</a>`).join('');
    $('page-title').textContent=labels[section] || 'Clientes';
    $('page-subtitle').textContent=section==='shifts'?'Horario semanal y cambios para fechas concretas.':`${roleNames[data.role] || data.role} · Datos guardados en el centro`;
    $('add').hidden=!canEdit() || ['shifts','roles'].includes(section);
    $('add').textContent=section==='services'?'＋ Nuevo servicio':section==='users'?'＋ Nuevo usuario':section==='clients'?'＋ Nuevo cliente':'＋ Nuevo empleado';
    render();
  }
  function render() {
    const items=list(), active=items.filter(isActive).length;
    $('stats').innerHTML=[['TOTAL',items.length],['ACTIVOS',active],['INACTIVOS / BLOQUEADOS',items.length-active]].map(([label,value])=>`<article><div><small>${label}</small><strong>${value}</strong></div></article>`).join('');
    const roles=section==='roles';
    $('stats').hidden=roles;$('table-wrap').hidden=roles;$('permissions').hidden=!roles;$('search').hidden=roles;$('status-filter').hidden=roles;
    if(roles){$('empty').hidden=true;$('permissions').innerHTML=`<div class="role-grid"><article><h3>Administración</h3>Gestiona clientes, servicios, plantilla, turnos y cuentas. Puede consultar y registrar los fichajes de toda la plantilla.</article><article><h3>Recepción</h3>Gestiona clientes, reservas y turnos. Consulta servicios y turnos de todos los empleados. Registra solo sus propios fichajes y ve el estado de fichaje de los demás.</article><article><h3>Entrenador</h3>Consulta sus reservas, sus clientes y sus turnos. Registra exclusivamente su propia entrada y salida.</article><article><h3>Cliente</h3>Rol reservado para reservas del cliente. Sin acceso a las herramientas de gestión interna.</article></div><p class="hint">Asigna estos perfiles desde Usuarios. Los permisos se comprueban también en el servidor. Cambiar el puesto laboral no cambia los permisos automáticamente.</p>`;return;}
    const query=$('search').value.toLocaleLowerCase('es');
    const filtered=items.filter(x=>[x.name,x.username,x.email,x.phone,x.jobTitle,nameFor('employees',x.employeeId),nameFor('clients',x.clientId)].join(' ').toLocaleLowerCase('es').includes(query)).filter(x=>$('status-filter').value==='all'||isActive(x)===($('status-filter').value==='active'));
    const heads=section==='clients'?['Cliente','Contacto','Estado','Reservas','Ficha']:section==='services'?['Servicio','Duración / aforo','Precio','Estado','Ficha']:section==='users'?['Usuario','Empleado','Permisos','Estado','Acceso']:['Empleado','Puesto','Horario semanal','Estado',section==='shifts'?'Turnos':'Ficha'];
    $('columns').innerHTML='<tr>'+heads.map(x=>`<th>${x}</th>`).join('')+'</tr>';
    $('empty').hidden=filtered.length>0;
    $('rows').innerHTML=filtered.map(x=>{
      const badge=`<span class="badge ${isActive(x)?'':'inactive'}">${esc(x.status?statusNames[x.status]:isActive(x)?'Activo':'Inactivo')}</span>`;
      let cells;
      if(section==='clients')cells=[esc(x.name),`${esc(x.email||'Sin correo')}<small>${esc(x.phone||'Sin teléfono')}</small>`,badge,(data.bookings||[]).filter(b=>b.clientId===x.id).length];
      else if(section==='services')cells=[`${esc(x.name)}<small>${esc(x.description||'')}</small>`,`${x.duration} min · ${x.capacity} plaza(s)`,new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(x.price||0),badge];
      else if(section==='users')cells=[esc(x.username),esc(x.name||(x.role==='CLIENT'?nameFor('clients',x.clientId):nameFor('employees',x.employeeId))),roleNames[x.role]||x.role,badge];
      else cells=[`${esc(x.name)}<small>${esc(x.email||'')}</small>`,esc(x.jobTitle||'Sin asignar'),`${x.schedule.filter(h=>!h.closed).length} días · ${(x.shifts||[]).length} excepciones`,badge];
      return `<tr>${cells.map(v=>`<td>${v}</td>`).join('')}<td><button data-edit="${esc(x.id)}">${section==='shifts'?'Ver turnos':'Abrir ficha'}</button></td></tr>`;
    }).join('');
  }
  function field(label,key,value='',type='text',extra='') {return `<label>${label}<input name="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
  function select(label,key,options,value) {return `<label>${label}<select name="${key}">${options.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;}
  const activeSelect = item => select('Estado','active',[['true','Activo'],['false','Inactivo']],item.active!==false);
  function edit(id) {
    editing=id?structuredClone(list().find(x=>x.id===id)):null;revision=data.revision;
    const x=editing||{};
    $('record-form').reset();$('form-error').hidden=true;$('save').hidden=!canEdit();
    $('editor-title').textContent=editing?(x.name||x.username):'Nueva ficha';
    let html='';
    if(section==='clients'){
      html=field('Nombre y apellidos','name',x.name,'text','required maxlength="200"')+field('Correo','email',x.email,'email','maxlength="254"')+field('Teléfono','phone',x.phone,'tel','maxlength="40"')+field('Fecha de nacimiento','birthDate',x.birthDate,'date')+select('Estado del cliente','status',Object.entries(statusNames),x.status||'ACTIVE')+`<label class="full">Notas de la ficha<textarea name="notes" maxlength="2000">${esc(x.notes||'')}</textarea></label>`;
    } else if(section==='services'){
      html=field('Nombre del servicio','name',x.name,'text','required maxlength="200"')+field('Duración (minutos)','duration',x.duration||60,'number','required min="5" max="720" step="1"')+field('Aforo','capacity',x.capacity||1,'number','required min="1" max="100" step="1"')+field('Precio (€)','price',x.price||0,'number','required min="0" max="100000" step="0.01"')+activeSelect(x)+`<label class="full">Descripción<textarea name="description" maxlength="2000">${esc(x.description||'')}</textarea></label>`;
    } else if(section==='users'){
      const employeeSelect = select('Empleado','employeeId',data.employees.map(e=>[e.id,e.name]),x.employeeId);
      const clientSelect = select('Cliente','clientId',(data.clients||[]).map(c=>[c.id,c.name]),x.clientId);
      const isClient = x.role === 'CLIENT';
      html = `<div id="employee-picker" ${isClient ? 'hidden' : ''}>${employeeSelect}</div>` +
        `<div id="client-picker" ${isClient ? '' : 'hidden'}>${clientSelect}</div>` +
        field('Usuario de acceso','username',x.username,'text','required maxlength="254"') +
        select('Categoría de seguridad','role',Object.entries(roleNames),x.role||(data.id==='bootstrap'?'ADMIN':'TRAINER')) +
        select('Acceso','enabled',[['true','Habilitado'],['false','Deshabilitado']],x.enabled!==false) +
        `<p class="hint full">${data.id==='bootstrap'?'Crea primero tu cuenta de administración. La contraseña temporal será Trainerspoint y tendrás que cambiarla al entrar.':'Una cuenta por empleado o cliente. La contraseña inicial será Trainerspoint y deberá cambiarse en el primer acceso.'}</p>`;
    } else {
      html=field('Nombre y apellidos','name',x.name,'text','required maxlength="200"')+field('Puesto laboral','jobTitle',x.jobTitle,'text','maxlength="100"')+field('Correo','email',x.email,'email','maxlength="254"')+field('Color en calendario','color',x.color||'#317b9b','color')+activeSelect(x);
    }
    $('fields').innerHTML='<div class="form-grid">'+html+'</div>';
    if(section==='users'){
      const roleEl = $('fields').querySelector('select[name="role"]');
      if (roleEl) {
        const togglePickers = () => {
          const isCli = roleEl.value === 'CLIENT';
          const empWrap = $('employee-picker');
          const cliWrap = $('client-picker');
          if (empWrap && cliWrap) {
            empWrap.hidden = isCli;
            cliWrap.hidden = !isCli;
            const empInput = empWrap.querySelector('select');
            const cliInput = cliWrap.querySelector('select');
            if (empInput) empInput.disabled = isCli;
            if (cliInput) cliInput.disabled = !isCli;
          }
        };
        roleEl.addEventListener('change', togglePickers);
        togglePickers();
      }
    }
    if(['employees','shifts'].includes(section)){
      shifts=structuredClone(x.shifts||[]);
      const schedule=x.schedule||data.schedule;
      $('fields').insertAdjacentHTML('beforeend',`<section class="schedule-editor"><h3>Horario semanal</h3><p class="hint">Las reservas deben estar dentro del horario del centro y del empleado.</p>${schedule.map((h,i)=>`<div class="day"><strong>${days[i]}</strong><input type="time" name="open${i}" value="${h.open}" aria-label="Inicio ${days[i]}" required><input type="time" name="close${i}" value="${h.close}" aria-label="Fin ${days[i]}" required><label><input type="checkbox" name="closed${i}" ${h.closed?'checked':''}> Libre</label></div>`).join('')}</section><section><h3>Turnos por fecha</h3><p class="hint">Sustituyen el horario semanal ese día. Añade varias franjas para una jornada partida, o marca el día libre.</p><div id="overrides"></div><div class="shift-add"><label>Fecha<input id="shift-date" type="date"></label><label>Desde<input id="shift-open" type="time" value="09:00"></label><label>Hasta<input id="shift-close" type="time" value="14:00"></label><button type="button" id="add-shift" class="outline-button">Añadir franja</button><button type="button" id="day-off" class="outline-button">Día libre</button></div></section>`);
      renderShifts();$('add-shift').onclick=()=>addShift(false);$('day-off').onclick=()=>addShift(true);
    }
    if(section==='clients' && editing){
      const history=(data.bookings||[]).filter(b=>b.clientId===x.id).sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start));
      $('fields').insertAdjacentHTML('beforeend',`<section class="history-small"><h3>Historial · ${history.length} reservas</h3>${history.length?`<table><thead><tr><th>Fecha</th><th>Servicio</th><th>Empleado</th><th>Estado</th></tr></thead><tbody>${history.map(b=>`<tr><td>${esc(b.date)} ${esc(b.start)}</td><td>${esc(nameFor('services',b.serviceId))}</td><td>${esc(nameFor('employees',b.employeeId))}</td><td>${esc(bookingNames[b.status])}</td></tr>`).join('')}</tbody></table>`:'<p class="hint">Este cliente todavía no tiene reservas.</p>'}</section>`);
    }
    if(!canEdit()) $('fields').querySelectorAll('input,select,textarea,button').forEach(e=>e.disabled=true);
    $('editor').showModal();
  }
  function renderShifts(){
    $('overrides').innerHTML=shifts.sort((a,b)=>a.date.localeCompare(b.date)).map(s=>`<div class="override"><strong>${esc(s.date)}</strong><span>${s.periods.length?s.periods.map(p=>`${p.open}–${p.close}`).join(' · '):'Día libre'}</span><button type="button" data-remove-shift="${s.date}" aria-label="Quitar excepción ${s.date}">Eliminar excepción</button></div>`).join('');
  }
  function addShift(off){
    const date=$('shift-date').value, open=$('shift-open').value, close=$('shift-close').value;
    if(!date || (!off && (!open||!close||open>=close))) {formError('Selecciona una fecha y un intervalo válido.');return;}
    let shift=shifts.find(s=>s.date===date);
    if(!shift){shift={date,periods:[]};shifts.push(shift);}
    if(!off && shift.periods.some(p=>open<p.close && p.open<close)){formError('Esta franja se solapa con otra del mismo día.');return;}
    if(off)shift.periods=[];else shift.periods.push({open,close});
    $('form-error').hidden=true;renderShifts();
  }
  function formError(message){$('form-error').textContent=message;$('form-error').hidden=false;}
  $('record-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!canEdit())return;
    const form=new FormData(e.target), value=k=>String(form.get(k)||'');
    let record;
    if(section==='clients')record={name:value('name').trim(),email:value('email').trim(),phone:value('phone').trim(),birthDate:value('birthDate'),notes:value('notes'),status:value('status')};
    else if(section==='services')record={name:value('name').trim(),duration:Number(value('duration')),capacity:Number(value('capacity')),price:Number(value('price')),active:value('active')==='true',description:value('description')};
    else if(section==='users'){
      const role=value('role');
      record={username:value('username').trim(),role,enabled:value('enabled')==='true',...(role==='CLIENT'?{clientId:value('clientId')}:{employeeId:value('employeeId')})};
    }
    else record={name:value('name').trim(),email:value('email').trim(),jobTitle:value('jobTitle').trim(),color:value('color'),active:value('active')==='true',schedule:days.map((_,i)=>({open:value('open'+i),close:value('close'+i),closed:form.has('closed'+i)})),shifts};
    const kind=section==='shifts'?'employees':section;
    $('save').disabled=true;
    try{const result=await api('manage/'+kind+(editing?'/'+encodeURIComponent(editing.id):''),editing?'PUT':'POST',{record,revision});if(result.token){sessionStorage.removeItem('calendar-admin-token');sessionStorage.setItem('calendar-user-token',result.token);if(result.mustChangePassword){location.href='change-password.html';return;}}$('editor').close();await load();notice(editing?'Cambios guardados.':'Usuario creado. Comparte Trainerspoint como contraseña temporal.');}
    catch(error){formError(error.message);}finally{$('save').disabled=false;}
  });
  $('rows').addEventListener('click',e=>{const button=e.target.closest('[data-edit]');if(button)edit(button.dataset.edit);});
  $('fields').addEventListener('click',e=>{const button=e.target.closest('[data-remove-shift]');if(button){shifts=shifts.filter(s=>s.date!==button.dataset.removeShift);renderShifts();}});
  $('close').onclick=$('cancel').onclick=()=>$('editor').close();$('add').onclick=()=>edit();
  $('search').oninput=$('status-filter').onchange=render;
  $('refresh').onclick=()=>load().catch(e=>notice(e.message,true));
  load().catch(e=>notice(e.message,true));
})();