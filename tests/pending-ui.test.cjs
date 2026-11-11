const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const {randomUUID}=require('node:crypto');
async function until(check){const deadline=Date.now()+5000;while(!check()){if(Date.now()>deadline)throw Error('No se actualizó la pantalla de pendientes');await new Promise(r=>setTimeout(r,20));}}

test('Pendientes: cuatro prioridades por cliente, lista completa, búsqueda y agendar con el bono existente',async()=>{
 const gymId=randomUUID(),serviceId=randomUUID(),now=Date.now();
 const clients=Array.from({length:6},(_,i)=>({id:randomUUID(),name:i===0?'Ana <prueba>':'Cliente '+i}));
 const packages=clients.map((client,i)=>({packageId:randomUUID(),clientId:client.id,clientName:client.name,serviceId,serviceName:'Entrenamiento',sessionsToSchedule:i===1?5:2,sessionsScheduled:0,expiresAt:new Date(now+([2,2,4,6,8,10][i])*86400000).toISOString(),daysRemaining:[2,2,4,6,8,10][i]}));
 const state={gymId,timezone:'Europe/Madrid',clients,services:[{id:serviceId,name:'Entrenamiento',duration:60}],employees:[{id:'e1',name:'Entrenador',active:true}],rooms:[{id:'r1',name:'Sala'}],bookings:[]};
 const errors=[],calls=[],console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync('web/planning/pendientes.html','utf8'),{url:'http://localhost/pendientes.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,d=w.document;
 w.structuredClone=structuredClone;w.TrainersPoint={poll:()=>()=>{}};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.fetch=async(path,options={})=>{calls.push({path,options});let result={};
  if(path==='/api/me')result={role:'RECEPTION'};
  else if(path==='/api/state')result=structuredClone(state);
  else if(path==='/api/pending-packages')result={packages:structuredClone(packages.filter(p=>p.sessionsToSchedule>0))};
  else if(path.startsWith('/api/slots?'))result=[{start:'10:00',end:'11:00'}];
  else if(path==='/api/bookings' && options.method==='POST'){
   const booking=JSON.parse(options.body).booking;const pkg=packages.find(p=>p.packageId===booking.packageId);assert.ok(pkg);pkg.sessionsToSchedule--;pkg.sessionsScheduled++;
   result={...booking,id:randomUUID(),version:1};state.bookings.push(result);
  }else throw Error('Petición inesperada '+path);
  return {ok:true,json:async()=>result};
 };
 try{
  w.eval(fs.readFileSync('web/planning/pendientes.js','utf8'));await until(()=>d.querySelectorAll('#rows tr').length===6);
  assert.equal(d.querySelectorAll('.pending-urgent-card').length,4);assert.match(d.querySelector('.pending-urgent-card h3').textContent,/Cliente 1/); // Same expiry, more sessions first.
  assert.equal(d.querySelectorAll('#urgent-list h3').length,4);assert.equal(d.getElementById('center'),null);assert.equal(d.getElementById('booking-center'),null);assert.equal(d.querySelectorAll('th').length,5);
  assert.equal(d.querySelector('#rows').textContent.includes('Ana <prueba>'),true);assert.equal(d.querySelector('#rows prueba'),null);
  d.getElementById('search').value='Ana';d.getElementById('search').dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('#rows tr').length,1);assert.equal(d.querySelectorAll('.pending-urgent-card').length,1);
  d.querySelector('#rows [data-package]').click();assert.equal(d.getElementById('editor').open,true);assert.match(d.getElementById('original').textContent,/sin crear otra compra/);
  const tomorrow=new Date(now+86400000).toISOString().slice(0,10);d.getElementById('date').value=tomorrow;
  d.getElementById('check').click();await until(()=>d.querySelector('[data-slot]'));d.querySelector('[data-slot]').click();assert.equal(d.getElementById('start').value,'10:00');
  d.getElementById('form').requestSubmit(d.getElementById('save'));await until(()=>d.getElementById('notice').textContent.includes('Sesión organizada'));
  const posts=calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);const sent=JSON.parse(posts[0].options.body).booking;
  assert.equal(sent.packageId,packages[0].packageId);assert.equal(sent.clientId,clients[0].id);assert.equal(sent.centerId,gymId);assert.equal(sent.employeeId,'e1');assert.equal(sent.end,'11:00');
  assert.equal(packages[0].sessionsToSchedule,1);assert.match(d.getElementById('rows').textContent,/1 sesión sin agendar/);assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

test('Ficha: se conserva la información del centro de origen y desaparece el cambio de centro',()=>{
 const dom=new JSDOM(fs.readFileSync('web/clients/client-profile.html','utf8'));
 try{assert.ok(dom.window.document.getElementById('profile-gym'));assert.equal(dom.window.document.getElementById('profile-gym-form'),null);assert.equal(dom.window.document.getElementById('profile-gym-select'),null);}finally{dom.window.close();}
});
