const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync('web/shared/ayuda.js','utf8');
const screens=[['web/calendar/index.html','index.html'],['web/cash/caja.html','caja.html'],['web/inventory/productos.html','productos.html'],['web/inventory/tienda.html','tienda.html'],['web/clients/clients.html','clientes'],['web/clients/client-profile.html','clientes/123/ficha'],['web/services/services.html','servicios'],['web/staff/professionals.html','profesionales'],['web/staff/users.html','usuarios'],['web/centers/gyms.html','gimnasios'],['web/staff/fichajes.html','fichajes.html'],['web/staff/ausencias.html','ausencias.html'],['web/planning/pendientes.html','pendientes.html'],['web/planning/recuperaciones.html','recuperaciones.html'],['web/planning/mis-reservas.html','mis-reservas.html'],['web/staff/gestion.html','gestion.html?section=shifts'],['web/staff/gestion.html','gestion.html?section=roles'],['web/dashboard/inicio.html','inicio.html'],['web/auth/login.html','login.html'],['web/auth/change-password.html','change-password.html']];
test('Usabilidad: cada pantalla ofrece ayuda específica con pasos accesibles',()=>{
 for(const [file,route] of screens){const html=fs.readFileSync(file,'utf8');assert.ok(html.includes('/ayuda.js'),file);const dom=new JSDOM(html,{url:'http://localhost/'+route,runScripts:'outside-only'});try{dom.window.eval(script);const guide=dom.window.document.querySelector('.usage-guide');assert.ok(guide,route);assert.equal(guide.querySelectorAll('ol li').length,3,route);assert.equal(guide.querySelector('details').open,false);assert.ok(guide.querySelector('summary').textContent.includes('paso a paso'));}finally{dom.window.close();}}
});
test('Usabilidad: apertura de caja explica el importe y valida sin cambiar el recuento',()=>{
 const dom=new JSDOM(fs.readFileSync('web/cash/caja.html','utf8'),{url:'http://localhost/caja.html',runScripts:'outside-only'});
 try{dom.window.eval(script);const d=dom.window.document,input=d.getElementById('opening-amount');assert.match(d.querySelector('#open-dialog .dialog-guidance').textContent,/billetes y monedas/);assert.match(d.querySelector('#open-dialog .dialog-guidance').textContent,/100/);assert.ok(input.getAttribute('aria-describedby'));
 assert.equal(input.checkValidity(),false);assert.equal(input.getAttribute('aria-invalid'),'true');assert.match(d.querySelector('.usage-field-error').textContent,/Completa/);
 input.value='100';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(input.hasAttribute('aria-invalid'),false);assert.equal(input.value,'100');assert.equal(input.checkValidity(),true);
 }finally{dom.window.close();}
});
test('Usabilidad: la guía del trabajador explica su propia agenda',async()=>{
 const dom=new JSDOM(fs.readFileSync('web/calendar/index.html','utf8'),{url:'http://localhost/index.html',runScripts:'outside-only'});
 try{dom.window.CALENDAR_SERVER=true;dom.window.fetch=async()=>({ok:true,json:async()=>({role:'TRAINER'})});dom.window.eval(script);await new Promise(r=>setTimeout(r,0));assert.match(dom.window.document.querySelector('.usage-guide').textContent,/tienes asignada como trabajador/);assert.doesNotMatch(dom.window.document.querySelector('.usage-guide').textContent,/registrar ventas/);}finally{dom.window.close();}
});

test('Estructura: todas las pantallas del centro comparten barra lateral, main, cabecera y contenido',()=>{
 for(const [file]of screens.filter(([f])=>!f.includes('login')&&!f.includes('change-password'))){const dom=new JSDOM(fs.readFileSync(file,'utf8'));try{const d=dom.window.document;assert.ok(d.querySelector('body > .app-shell > aside[data-app-menu]'),file);assert.ok(d.querySelector('.app-shell > main.main-content > .topbar,.app-shell > main.main-content > .profile-topbar'),file);assert.ok(d.querySelector('.main-content > .page-content,.main-content > .profile-content'),file);}finally{dom.window.close();}}
});

test('Calendario guiado: consulta bonos y vincula servicio, duración y reserva',async()=>{
 const {randomUUID}=require('node:crypto'),clientId=randomUUID(),serviceId=randomUUID(),packageId=randomUUID();
 const schedule=Array.from({length:7},()=>({open:'09:00',close:'21:00',closed:false}));
 const state={packagesEnabled:true,gymId:'gym',revision:1,version:1,timezone:'Europe/Madrid',schedule,centers:[{id:'gym',name:'Centro'}],employees:[{id:'e1',name:'Entrenador',color:'#112233',schedule}],rooms:[{id:'r1',name:'Sala'}],services:[{id:serviceId,name:'Servicio',duration:45,capacity:1}],clients:[{id:clientId,name:'Cliente',email:'test@example.com',phone:'',notes:''}],bookings:[]};
 const dom=new JSDOM(fs.readFileSync('web/calendar/index.html','utf8'),{url:'http://localhost/index.html?fecha=2030-12-02&nueva=1',runScripts:'outside-only'}),w=dom.window;let submitted;
 try{
 w.CALENDAR_SERVER=true;w.CALENDAR_DEV_TOKEN='test-token';w.structuredClone=structuredClone;w.AbortSignal=AbortSignal;w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 w.fetch=async(path,options={})=>{let data={};if(path==='/api/me')data={role:'ADMIN'};else if(path==='/api/state')data=structuredClone(state);else if(path.startsWith('/api/clients?'))data={clients:[{id:clientId,firstName:'Cliente',lastName:'Prueba',email:'test@example.com',phone:'',status:'ACTIVO'}]};else if(path.endsWith('/service-history'))data={packages:[{id:packageId,service:{id:serviceId,name:'Servicio',durationMin:45},sessionsRemaining:2,paymentStatus:'PAGADO'}]};else if(path==='/api/recoveries')data=[];else if(path==='/api/bookings'&&options.method==='POST'){submitted=JSON.parse(options.body).booking;data=submitted;}return {ok:true,json:async()=>data};};
 w.eval(fs.readFileSync('web/shared/polling.js','utf8'));w.eval(fs.readFileSync('web/calendar/calendar-core.js','utf8'));w.eval(fs.readFileSync('web/calendar/app.js','utf8'));
 const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('El calendario no completó el flujo guiado');};
 await until(()=>w.document.querySelector('#booking-package option[value="'+packageId+'"]'));
 const select=w.document.getElementById('booking-package');select.value=packageId;select.dispatchEvent(new w.Event('change'));assert.equal(w.document.getElementById('booking-service').value,serviceId);
 const start=w.document.getElementById('booking-start');start.value='10:00';start.dispatchEvent(new w.Event('change'));assert.equal(w.document.getElementById('booking-end').value,'10:45');
 w.document.getElementById('booking-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>submitted);assert.equal(submitted.packageId,packageId);assert.equal(submitted.serviceId,serviceId);assert.equal(submitted.end,'10:45');await until(()=>w.document.getElementById('toast').textContent.includes('Reserva guardada'));
 }finally{w.close();}
});
