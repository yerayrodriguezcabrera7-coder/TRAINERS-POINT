const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync('web/ayuda.js','utf8');
const screens=[['web/index.html','index.html'],['web/caja.html','caja.html'],['web/productos.html','productos.html'],['public/clients.html','clientes'],['public/client-profile.html','clientes/123/ficha'],['public/services.html','servicios'],['public/professionals.html','profesionales'],['public/users.html','usuarios'],['public/gyms.html','gimnasios'],['web/fichajes.html','fichajes.html'],['web/ausencias.html','ausencias.html'],['web/pendientes.html','pendientes.html'],['web/recuperaciones.html','recuperaciones.html'],['web/mis-reservas.html','mis-reservas.html'],['web/gestion.html','gestion.html?section=shifts'],['web/gestion.html','gestion.html?section=roles'],['web/inicio.html','inicio.html'],['web/login.html','login.html'],['web/change-password.html','change-password.html']];
test('Usabilidad: cada pantalla ofrece ayuda específica con pasos accesibles',()=>{
 for(const [file,route] of screens){const html=fs.readFileSync(file,'utf8');assert.ok(html.includes('/ayuda.js'),file);const dom=new JSDOM(html,{url:'http://localhost/'+route,runScripts:'outside-only'});try{dom.window.eval(script);const guide=dom.window.document.querySelector('.usage-guide');assert.ok(guide,route);assert.equal(guide.querySelectorAll('ol li').length,3,route);assert.equal(guide.querySelector('details').open,false);assert.ok(guide.querySelector('summary').textContent.includes('paso a paso'));}finally{dom.window.close();}}
});
test('Usabilidad: apertura de caja explica el importe y valida sin cambiar el recuento',()=>{
 const dom=new JSDOM(fs.readFileSync('web/caja.html','utf8'),{url:'http://localhost/caja.html',runScripts:'outside-only'});
 try{dom.window.eval(script);const d=dom.window.document,input=d.getElementById('opening-amount');assert.match(d.querySelector('#open-dialog .dialog-guidance').textContent,/billetes y monedas/);assert.match(d.querySelector('#open-dialog .dialog-guidance').textContent,/100/);assert.ok(input.getAttribute('aria-describedby'));
 assert.equal(input.checkValidity(),false);assert.equal(input.getAttribute('aria-invalid'),'true');assert.match(d.querySelector('.usage-field-error').textContent,/Completa/);
 input.value='100';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(input.hasAttribute('aria-invalid'),false);assert.equal(input.value,'100');assert.equal(input.checkValidity(),true);
 }finally{dom.window.close();}
});
test('Usabilidad: la guía del trabajador explica su propia agenda',async()=>{
 const dom=new JSDOM(fs.readFileSync('web/index.html','utf8'),{url:'http://localhost/index.html',runScripts:'outside-only'});
 try{dom.window.CALENDAR_SERVER=true;dom.window.fetch=async()=>({ok:true,json:async()=>({role:'TRAINER'})});dom.window.eval(script);await new Promise(r=>setTimeout(r,0));assert.match(dom.window.document.querySelector('.usage-guide').textContent,/tienes asignada como trabajador/);assert.doesNotMatch(dom.window.document.querySelector('.usage-guide').textContent,/registrar ventas/);}finally{dom.window.close();}
});
