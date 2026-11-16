const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
async function until(check) { const deadline=Date.now()+5000; while(!check()){if(Date.now()>deadline)throw Error('La pantalla no terminó de actualizarse.');await new Promise(r=>setTimeout(r,15));} }
function page(file,script,handler,url='http://localhost/') {
  const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(fs.readFileSync(file,'utf8'),{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window;w.structuredClone=structuredClone;w.TrainersPoint={poll:()=>()=>{}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.fetch=async (url,options={})=>({ok:true,json:async()=>handler(new URL(url,'http://localhost'),options)});
  w.eval(fs.readFileSync(script,'utf8'));return {dom,w,d:w.document,errors};
}

test('Catálogo: solo alerta operativa, búsqueda por código, miniaturas y detalle con precios editables',async()=>{
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=';
  const products=[{id:randomUUID(),name:'Producto con imagen',imageData:image,barcode:'0000123456789',unitPrice:'9.68',costPrice:'6',taxRate:'21',stock:0,trackStock:true,isActive:true,revision:1},
    {id:randomUUID(),name:'Producto sin seguimiento',unitPrice:'10',costPrice:'0',taxRate:'0',stock:0,trackStock:false,isActive:true,revision:1}];let saved;
  const p=page('web/inventory/productos.html','web/inventory/productos.js',(url,options)=>{
    if(url.pathname==='/api/me')return {role:'ADMIN'};
    if(options.method==='PUT'){saved=JSON.parse(options.body);Object.assign(products[0],saved,{unitPrice:saved.price});return products[0];}
    return {products};
  });
  try {
    await until(()=>p.d.querySelector('[data-edit]'));
    assert.equal(p.d.querySelector('#stats strong').textContent,'1');assert.equal(p.d.querySelectorAll('#stats article').length,1);
    assert.equal(p.d.getElementById('sales-panel'),null);assert.equal(p.d.getElementById('sales-tab'),null);
    assert.equal(p.d.querySelectorAll('#products img').length,1);assert.equal(p.d.querySelectorAll('#products .product-placeholder').length,1);
    p.d.getElementById('search').value='0000123456789';p.d.getElementById('search').dispatchEvent(new p.w.Event('input'));
    assert.equal(p.d.querySelectorAll('#products tr').length,1);
    p.d.querySelector('[data-detail]').click();assert.equal(p.d.querySelector('#product-detail-content img').src,image);
    p.d.querySelector('[data-edit]').click();const fields=p.d.getElementById('product-form').elements;
    assert.equal(fields.barcode.value,'0000123456789');assert.match(p.d.getElementById('pricing-base').textContent,/8,00/);assert.match(p.d.getElementById('pricing-tax').textContent,/1,68/);assert.match(p.d.getElementById('pricing-margin').textContent,/2,00/);
    fields.costPrice.value='5';fields.costPrice.dispatchEvent(new p.w.Event('input'));assert.match(p.d.getElementById('pricing-margin').textContent,/3,00/);
    fields.trackStock.checked=false;p.d.getElementById('product-form').requestSubmit(p.d.getElementById('save-product'));await until(()=>saved);
    assert.equal(saved.costPrice,5);assert.equal(saved.taxRate,21);assert.equal(saved.imageData,image);assert.equal(saved.trackStock,false);
    await until(()=>p.d.querySelector('#stats strong').textContent==='0');assert.deepEqual(p.errors,[]);
  }finally{p.dom.window.close();}
});

test('Servicios: sin dashboards, categoría Cabina, duración de 45 minutos y color se editan y guardan',async()=>{
  const service={id:randomUUID(),name:'Bono cabina',category:'CABIN',color:'#235678',type:'SESION_INDIVIDUAL',modality:'INDIVIDUAL',trainingCount:1,price:100,durationMin:45,validityWeeks:8,isActive:true};let saved;
  const p=page('web/services/services.html','web/services/services.js',(url,options)=>{
    if(url.pathname==='/api/me')return {role:'ADMIN'};
    if(options.method==='PUT'){saved=JSON.parse(options.body);Object.assign(service,saved);return {service};}
    return {services:[service]};
  },'http://localhost/servicios');
  try{
    await until(()=>p.d.querySelector('[data-edit-id]'));
    assert.equal(p.d.querySelector('.stats-grid'),null);assert.match(p.d.querySelector('.service-card').textContent,/45 min/);
    p.d.querySelector('[data-edit-id]').click();assert.equal(p.d.getElementById('field-category').value,'CABIN');assert.equal(p.d.getElementById('field-validityWeeks').value,'8');assert.equal(p.d.getElementById('field-color').value,'#235678');
    p.d.getElementById('field-name').value='Valoración cabina';p.d.getElementById('field-validityWeeks').value='2';p.d.getElementById('field-color').value='#ab2345';
    p.d.getElementById('service-form').requestSubmit(p.d.getElementById('submit-dialog'));await until(()=>saved);
    assert.equal(saved.validityWeeks,2);assert.equal(saved.color,'#ab2345');assert.equal(saved.category,'CABIN');assert.equal(saved.name,'Valoración cabina');
    await until(()=>p.d.querySelector('.service-card').textContent.includes('Valoración cabina'));assert.deepEqual(p.errors,[]);
  }finally{p.dom.window.close();}
});

test('Clientes: marcas separadas, búsqueda compartida y ningún acceso rápido de bonos para Cobosu',async()=>{
  const gym={id:randomUUID(),name:'Centro de prueba',_count:{clients:2}};
  const clients=[{id:randomUUID(),firstName:'Ana',lastName:'Trainers',brand:'TRAINERS_POINT'}, {id:randomUUID(),firstName:'Bea',lastName:'Cobosu',brand:'COBOSU'}].map(c=>({...c,email:c.firstName+'@example.invalid',phone:'600000001',status:'ACTIVO',gymId:gym.id,gym,remainingSessions:0,pendingPayments:0,servicePackageCount:0,trainingPlans:[],clientNotes:[],createdAt:new Date().toISOString()}));
  let clientPosts=0, packagePosts=0, submitted;
  const p=page('web/clients/clients.html','web/clients/clients.js',(url,options)=>{
    if(url.pathname==='/api/me')return {role:'ADMIN'};
    if(url.pathname==='/api/gyms')return {gyms:[gym]};
    if(url.pathname==='/api/clients'&&options.method==='POST'){clientPosts++;submitted=JSON.parse(options.body);return {client:{...clients[1],...submitted}};}
    if(url.pathname.endsWith('/service-packages')&&options.method==='POST'){packagePosts++;return {};}
    const q=(url.searchParams.get('q')||'').toLowerCase(),filtered=clients.filter(c=>(c.firstName+' '+c.lastName).toLowerCase().includes(q));
    return {clients:filtered,total:filtered.length,counts:{ACTIVO:filtered.length},limit:100};
  },'http://localhost/clientes');
  try{
    await until(()=>p.d.querySelectorAll('.client-brand-group').length===2);
    assert.equal(p.d.querySelector('[data-filter=today]'),null);assert.equal(p.d.querySelector('[data-filter=leads]'),null);assert.equal(p.d.getElementById('count-today'),null);
    assert.equal(p.d.querySelectorAll('#create-brand').length,1);
    assert.equal(p.d.querySelectorAll('[data-brand=TRAINERS_POINT] .client-card-bono-btn').length,1);assert.equal(p.d.querySelectorAll('[data-brand=COBOSU] .client-card-bono-btn').length,0);
    p.d.getElementById('search-input').value='Bea';p.d.getElementById('search-input').dispatchEvent(new p.w.Event('input'));
    await until(()=>p.d.querySelector('[data-brand=TRAINERS_POINT]').textContent.includes('No hay clientes'));
    assert.match(p.d.querySelector('[data-brand=COBOSU]').textContent,/Bea/);assert.deepEqual(p.errors,[]);
    const form=p.d.getElementById('create-form');
    form.elements.namedItem('brand').value='COBOSU';form.elements.namedItem('firstName').value='Nueva';form.elements.namedItem('lastName').value='Cobosu';form.elements.namedItem('email').value='nueva@example.invalid';form.elements.namedItem('phone').value='600000002';form.elements.namedItem('consentData').checked=true;
    assert.equal(form.elements.namedItem('gymId'),null);assert.equal(p.d.getElementById('gym-filter'),null);assert.equal(p.d.getElementById('gyms'),null);
    p.w.eval('updateIntakeStep(3,false); renderProposal();');
    assert.equal(p.d.getElementById('submit-create').hidden,true);
    form.requestSubmit(p.d.getElementById('create-client-only'));await until(()=>submitted);
    await new Promise(r=>setTimeout(r,30));assert.equal(submitted.brand,'COBOSU');assert.equal(submitted.gymId,undefined);assert.equal(clientPosts,1);assert.equal(packagePosts,0);
  }finally{p.dom.window.close();}
});
