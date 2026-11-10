(() => {
  const weekdays = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const statuses = {ACTIVO:'Activo',BORRADOR:'Borrador',COMPLETADO:'Completado',ARCHIVADO:'Archivado'};
  function el(tag, text, cls) { const n=document.createElement(tag); if(text)n.textContent=text; if(cls)n.className=cls; return n; }
  function button(text, action) { const n=el('button',text,'tp-button');n.type='button';n.onclick=action;return n; }
  async function request(clientId, options={}, date) {
    const r=await fetch(`/api/clients/${encodeURIComponent(clientId)}/training-plans${date?'?date='+encodeURIComponent(date):''}`,options);
    const data=await r.json();if(!r.ok)throw Error(data.error || 'No se pudieron cargar las rutinas.');return data;
  }
  function dialog(title) {
    const d=el('dialog',null,'tp-dialog');d.setAttribute('aria-label',title);
    const header=el('header');header.append(el('h2',title),button('Cerrar',()=>d.close()));
    d.append(header);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d;
  }
  function renderDays(container, days) {
    if(!days.length){container.append(el('p','No hay una rutina asignada a este día. Consulta el plan semanal.'));return;}
    for(const day of days){
      const card=el('article',null,'tp-day');card.append(el('h3',`${weekdays[day.weekday-1] || 'Sesión'} · ${day.name}`));
      const list=el('ol');for(const exercise of day.exercises || []){
        const item=el('li');item.append(el('strong',exercise.name),el('p',`${exercise.sets} series · ${exercise.repetitions} · Descanso: ${exercise.rest || 'No indicado'} · Carga: ${exercise.load || 'No indicada'}`));
        if(exercise.notes)item.append(el('p',exercise.notes,'tp-notes'));list.append(item);
      }card.append(list);container.append(card);
    }
  }
  async function preview(clientId,date){
    const d=dialog('Planning de la cita');const body=el('div');body.setAttribute('aria-live','polite');body.append(el('p','Cargando rutina…'));d.append(body);
    try{const data=await request(clientId,{},date);if(!d.isConnected)return;body.replaceChildren(el('p',`Fecha de la cita: ${date.split('-').reverse().join('/')}`));
      if(!data.active){body.append(el('p','Este cliente todavía no tiene un plan activo.'));return;}
      body.append(el('h3',data.active.name),el('p',data.active.goals));renderDays(body,data.days);
      const all=el('details');all.append(el('summary','Consultar el plan semanal completo'));renderDays(all,data.active.details?.days || []);body.append(all);
    }catch(error){body.replaceChildren(el('p',error.message));}
  }
  function field(parent,label,value='',type='text',required=false,max=200){
    const wrap=el('label',label);const input=el(type==='textarea'?'textarea':type==='select'?'select':'input');
    if(input.tagName==='INPUT')input.type=type;input.value=value??'';input.required=required;
    if(type==='text'||type==='textarea')input.maxLength=max;
    wrap.append(input);parent.append(wrap);return input;
  }
  function edit(clientId,old,reload){
    const d=dialog(old?'Editar rutina':'Crear plan de entrenamiento');const form=el('form');d.append(form);
    const general=el('div',null,'tp-grid');form.append(general);
    const name=field(general,'Nombre del plan',old?.name,'text',true);
    const goals=field(general,'Objetivo',old?.goals,'textarea',false,2000);
    const starts=field(general,'Fecha de inicio',old?.startsAt?.slice(0,10)||new Date().toLocaleDateString('en-CA'),'date',true);
    const ends=field(general,'Fecha de fin (opcional)',old?.endsAt?.slice(0,10),'date');
    const status=field(general,'Estado','','select');for(const [value,text] of Object.entries(statuses)){const opt=el('option',text);opt.value=value;status.append(opt);}status.value=old?.status||'ACTIVO';
    form.append(el('p','Cada sesión se repite en el día de la semana elegido. Al activar este plan se archiva el anterior, conservando su información.','tp-notes'));
    const days=el('div',null,'tp-days');form.append(days);const dayRows=[];
    function addDay(value={}){
      const box=el('fieldset',null,'tp-day');box.append(el('legend','Día de entrenamiento'));days.append(box);
      const grid=el('div',null,'tp-grid');box.append(grid);const dayName=field(grid,'Nombre de la sesión',value.name||`Día ${dayRows.length+1}`,'text',true);
      const weekday=field(grid,'Día de la semana','','select');weekdays.forEach((text,i)=>{const o=el('option',text);o.value=i+1;weekday.append(o);});weekday.value=value.weekday||1;
      const exercises=el('div');box.append(exercises);const exerciseRows=[];
      function addExercise(v={}){
        const row=el('fieldset',null,'tp-exercise');row.append(el('legend','Ejercicio / bloque'));exercises.append(row);const grid=el('div',null,'tp-grid');row.append(grid);
        const fields={name:field(grid,'Ejercicio',v.name,'text',true),sets:field(grid,'Series',v.sets||3,'number',true),repetitions:field(grid,'Repeticiones o tiempo',v.repetitions,'text',true),rest:field(grid,'Descanso (ej. 60 s)',v.rest),load:field(grid,'Carga sugerida (ej. 10 kg)',v.load),notes:field(grid,'Observaciones técnicas',v.notes,'textarea',false,2000)};
        fields.sets.min=1;fields.sets.max=100;fields.sets.step=1;
        const entry={row,fields};exerciseRows.push(entry);row.append(button('Quitar ejercicio',()=>{exerciseRows.splice(exerciseRows.indexOf(entry),1);row.remove();}));
      }
      box.append(button('＋ Añadir ejercicio',()=>addExercise()));
      const entry={box,dayName,weekday,exerciseRows};dayRows.push(entry);box.append(button('Quitar día',()=>{dayRows.splice(dayRows.indexOf(entry),1);box.remove();}));
      (value.exercises?.length?value.exercises:[{}]).forEach(addExercise);
    }
    (old?.details?.days?.length?old.details.days:[{}]).forEach(addDay);
    form.append(button('＋ Añadir día de entrenamiento',()=>addDay()));
    const error=el('p',null,'tp-error');error.setAttribute('role','alert');form.append(error);
    const save=el('button','Guardar plan','tp-button tp-primary');save.type='submit';form.append(save);
    const id=old?.id||crypto.randomUUID();let saving=false;
    form.onsubmit=async event=>{
      event.preventDefault();if(saving)return;error.textContent='';
      if(!dayRows.length||dayRows.some(day=>!day.exerciseRows.length)){error.textContent='Añade al menos un día y un ejercicio en cada día.';return;}
      if(ends.value&&ends.value<starts.value){error.textContent='La fecha de fin debe ser igual o posterior al inicio.';return;}
      const input={id,name:name.value,goals:goals.value,startsAt:starts.value,endsAt:ends.value||null,status:status.value,days:dayRows.map(day=>({name:day.dayName.value,weekday:Number(day.weekday.value),exercises:day.exerciseRows.map(({fields})=>Object.fromEntries(Object.entries(fields).map(([key,f])=>[key,key==='sets'?Number(f.value):f.value])))}))};
      if(old)input.updatedAt=old.updatedAt;
      saving=true;save.disabled=true;
      try{await request(clientId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});d.close();await reload();}
      catch(e){error.textContent=e.message;}finally{saving=false;save.disabled=false;}
    };
  }
  const section=document.querySelector('#training-plans');
  if(section){
    const clientId=location.pathname.match(/^\/clientes\/([0-9a-f-]+)\/ficha$/i)?.[1];
    async function load(){
      section.replaceChildren(el('h2','Planificación deportiva / Rutina'),el('p','Cargando planes…'));
      try{const data=await request(clientId);section.replaceChildren(el('h2','Planificación deportiva / Rutina'));
        const actions=el('div',null,'tp-actions');actions.append(button('Actualizar rutinas',load));if(data.canEdit)actions.append(button('＋ Crear nuevo plan',()=>edit(clientId,null,load)));section.append(actions);
        if(!data.active)section.append(el('p','No hay un plan activo. Crea uno y añade los días de entrenamiento.'));
        for(const plan of data.plans){
          const card=el('details',null,'tp-plan');card.open=plan.status==='ACTIVO';card.append(el('summary',`${plan.name} · ${statuses[plan.status]||plan.status}`));
          card.append(el('p',plan.goals),el('p',`${plan.startsAt?.slice(0,10)||'Sin fecha de inicio'} → ${plan.endsAt?.slice(0,10)||'Sin fecha de fin'}`));
          renderDays(card,plan.details?.days||[]);if(data.canEdit)card.append(button('Editar plan',()=>edit(clientId,plan,load)));section.append(card);
        }
      }catch(e){section.replaceChildren(el('h2','Planificación deportiva / Rutina'),el('p',e.message),button('Reintentar',load));}
    }load();
  }
  window.TrainersPoint=window.TrainersPoint||{};window.TrainersPoint.openTrainingPlan=preview;
})();
