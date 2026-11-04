const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {mkdtemp,readdir,readFile}=require('node:fs/promises');const {tmpdir}=require('node:os');const {join}=require('node:path');const {Pool}=require('pg');const {PrismaClient}=require('@prisma/client');const {Inventory,inventoryPermission}=require('../dist/finance/inventory');let pg,pool,db,inventory;
before(async()=>{const {default:Embedded}=await import('embedded-postgres');const net=require('node:net'),socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const password=randomUUID();pg=new Embedded({databaseDir:join(await mkdtemp(join(tmpdir(),'inventory-test-')),'db'),user:'postgres',password,port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});await pg.initialise();await pg.start();pool=new Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres'});for(const dir of (await readdir('prisma/migrations')).sort()){if(!/^\d+_/.test(dir))continue;const sql=await readFile(join('prisma/migrations',dir,'migration.sql'),'utf8');await pool.query(sql);}db=new PrismaClient({datasources:{db:{url:`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`}}});inventory=new Inventory(db);});
after(async()=>{await db?.$disconnect();await pool?.end();await pg?.stop();});
test('Stock: venta concurrente, precios fiables, persona de paso e idempotencia',async()=>{const gym=randomUUID(),p=await inventory.saveProduct(gym,{name:'Agua',price:1.25,stock:3});const clientCount=await db.client.count();const input={requestKey:randomUUID(),clientId:null,lines:[{productId:p.id,quantity:2}],totalAmount:0};const results=await Promise.allSettled([inventory.sell(gym,'admin',input),inventory.sell(gym,'admin',{...input,requestKey:randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const sale=results.find(r=>r.status==='fulfilled').value;assert.equal(Number(sale.totalAmount),2.5);assert.equal((await inventory.products(gym))[0].stock,1);assert.equal(await db.client.count(),clientCount);assert.equal((await inventory.sell(gym,'admin',{...input,requestKey:sale.requestKey})).id,sale.id);assert.equal((await inventory.products(gym))[0].stock,1);assert.equal((await inventory.sales(gym,new URLSearchParams({client:'walkin',product:p.id}))).length,1);});
test('Devoluciones parciales y anulación reponen solo las unidades pendientes',async()=>{const gym=randomUUID(),p=await inventory.saveProduct(gym,{name:'Camiseta',price:20,stock:5});const sale=await inventory.sell(gym,'admin',{requestKey:randomUUID(),clientId:null,lines:[{productId:p.id,quantity:4}]});const payload={requestKey:randomUUID(),lines:[{lineId:sale.lines[0].id,quantity:2}]};await inventory.reverse(gym,sale.id,payload);await inventory.reverse(gym,sale.id,payload);assert.equal((await inventory.products(gym))[0].stock,3);await assert.rejects(inventory.reverse(gym,sale.id,{requestKey:randomUUID(),lines:[{lineId:sale.lines[0].id,quantity:3}]}),/supera/);await inventory.reverse(gym,sale.id,{},true);await inventory.reverse(gym,sale.id,{},true);assert.equal((await inventory.products(gym))[0].stock,5);const history=await inventory.sales(gym,new URLSearchParams());assert.equal(history[0].status,'CANCELADA');assert.equal(history[0].lines[0].returnedQuantity,4);assert.equal(Number(history[0].totalAmount),80);});
test('Aislamiento por centro, borrado conserva historia, edición vieja y permisos',async()=>{const gym=randomUUID(),p=await inventory.saveProduct(gym,{name:'Barrita',price:2,stock:8});await assert.rejects(inventory.sell(randomUUID(),'admin',{requestKey:randomUUID(),clientId:null,lines:[{productId:p.id,quantity:1}]}));const sale=await inventory.sell(gym,'admin',{requestKey:randomUUID(),clientId:null,lines:[{productId:p.id,quantity:1}]});await assert.rejects(inventory.saveProduct(gym,{name:'Barrita',price:2,stock:8,revision:p.revision},p.id),/ha cambiado/);await inventory.removeProduct(gym,p.id);assert.equal((await inventory.products(gym))[0].isActive,false);await assert.rejects(inventory.sell(gym,'admin',{requestKey:randomUUID(),clientId:null,lines:[{productId:p.id,quantity:1}]}));assert.equal((await inventory.sales(gym,new URLSearchParams()))[0].id,sale.id);assert.throws(()=>inventoryPermission({role:'TRAINER'},'read'),/permiso/);assert.throws(()=>inventoryPermission({role:'RECEPTION'},'admin'),/permiso/);assert.doesNotThrow(()=>inventoryPermission({role:'RECEPTION'},'sell'));});
test('Ventas a clientes reales, filtros, recuperación persistente y devolución total',async()=>{const gym=await db.gym.create({data:{name:randomUUID()}}),otherGym=await db.gym.create({data:{name:randomUUID()}});const client=await db.client.create({data:{firstName:'Ana',lastName:'Prueba',email:randomUUID()+'@example.com',phone:'',gymId:gym.id}});const p=await inventory.saveProduct(gym.id,{name:'Toalla',price:12.35,stock:10});await assert.rejects(inventory.sell(otherGym.id,'admin',{requestKey:randomUUID(),clientId:client.id,lines:[{productId:p.id,quantity:1}]}),/cliente/);const s=await inventory.sell(gym.id,'admin',{requestKey:randomUUID(),clientId:client.id,lines:[{productId:p.id,quantity:3}]});assert.equal(s.clientId,client.id);assert.equal(Number(s.totalAmount),37.05);const persisted=new Inventory(db);assert.equal((await persisted.sales(gym.id,new URLSearchParams({client:client.id})))[0].client.firstName,'Ana');assert.equal((await persisted.sales(gym.id,new URLSearchParams({client:'walkin'}))).length,0);await persisted.reverse(gym.id,s.id,{requestKey:randomUUID(),lines:[{lineId:s.lines[0].id,quantity:3}]});assert.equal((await persisted.products(gym.id))[0].stock,10);assert.equal((await persisted.sales(gym.id,new URLSearchParams()))[0].status,'REEMBOLSADA');await assert.rejects(persisted.reverse(gym.id,s.id,{requestKey:randomUUID(),lines:[{lineId:s.lines[0].id,quantity:1}]}));});
test('Interfaz: producto, carrito y comprador de paso sin crear cliente',async()=>{const {JSDOM}=require('jsdom'),fs=require('node:fs');const product={id:randomUUID(),name:'Agua',unitPrice:'1.25',stock:3,isActive:true};let submitted;const dom=new JSDOM(fs.readFileSync('web/inventory/productos.html','utf8'),{url:'http://localhost/productos.html',runScripts:'outside-only'});const w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.fetch=async(url,o={})=>{let data={};if(url==='/api/me')data={role:'ADMIN'};if(url==='/api/manage')data={clients:[]};if(url==='/api/inventory/products')data={products:[product]};if(url.startsWith('/api/inventory/sales')&&o.method==='POST'){submitted=JSON.parse(o.body);data={totalAmount:2.5};}else if(url.startsWith('/api/inventory/sales'))data={sales:[]};return {ok:true,json:async()=>data};};try{w.eval(fs.readFileSync('web/inventory/productos.js','utf8'));for(let i=0;i<30&&!w.document.querySelector('[data-edit]');i++)await new Promise(r=>setTimeout(r,10));const d=w.document;assert.match(d.getElementById('products').textContent,/Agua/);d.getElementById('new-sale').click();d.querySelector('#cart input').value='2';d.getElementById('sale-form').requestSubmit(d.getElementById('confirm-sale'));for(let i=0;i<30&&!submitted;i++)await new Promise(r=>setTimeout(r,10));assert.equal(submitted.clientId,null);assert.equal(submitted.lines[0].quantity,2);assert.equal(submitted.lines[0].productId,product.id);assert.equal(submitted.lines[0].expectedUnitPrice,1.25);}finally{w.close();}});
test('Un cambio de precio exige revisar la venta y no descuenta stock',async()=>{const gym=randomUUID();const p=await inventory.saveProduct(gym,{name:'Proteína',price:20,stock:5});await inventory.saveProduct(gym,{name:p.name,price:25,stock:5,revision:p.revision},p.id);const input={requestKey:randomUUID(),clientId:null,lines:[{productId:p.id,quantity:2,expectedUnitPrice:20}]};await assert.rejects(inventory.sell(gym,'admin',input),/precio.*ha cambiado/);assert.equal((await inventory.products(gym))[0].stock,5);assert.equal((await inventory.sales(gym,new URLSearchParams())).length,0);const sale=await inventory.sell(gym,'admin',{...input,lines:[{...input.lines[0],expectedUnitPrice:25}]});assert.equal(Number(sale.totalAmount),50);assert.equal((await inventory.products(gym))[0].stock,3);});
test('Historial paginado estable, aislamiento de centro y validación de filtros',async()=>{const gym=randomUUID(),date=new Date('2030-07-15T12:00:00Z');await db.sale.createMany({data:Array.from({length:53},()=>({gymKey:gym,status:'COMPLETADA',subtotal:1,taxAmount:0,totalAmount:1,soldAt:date}))});await db.sale.create({data:{gymKey:randomUUID(),status:'COMPLETADA',subtotal:1,taxAmount:0,totalAmount:1,soldAt:date}});const first=await inventory.salesPage(gym,new URLSearchParams({page:'1',from:'2030-07-15',to:'2030-07-15',status:'COMPLETADA'}));const second=await inventory.salesPage(gym,new URLSearchParams({page:'2'}));assert.equal(first.sales.length,50);assert.equal(first.pagination.hasPrevious,false);assert.equal(first.pagination.hasNext,true);assert.equal(second.sales.length,3);assert.equal(second.pagination.hasPrevious,true);assert.equal(second.pagination.hasNext,false);assert.equal(new Set([...first.sales,...second.sales].map(s=>s.id)).size,53);assert.ok([...first.sales,...second.sales].every(s=>s.gymKey===gym));assert.equal((await inventory.salesPage(gym,new URLSearchParams({status:'CANCELADA'}))).sales.length,0);for(const q of [{page:'0'},{page:'1.2'},{client:'invalido'},{product:'invalido'},{from:'2030-02-30'},{from:'2030-08-01',to:'2030-07-01'},{status:'DESCONOCIDO'}])await assert.rejects(inventory.salesPage(gym,new URLSearchParams(q)));});

test('Cobros: deuda única, pagos parciales mixtos, saldo y filtro por método',async()=>{
 const gym=await db.gym.create({data:{name:randomUUID()}});
 const client=await db.client.create({data:{firstName:'Ana',lastName:'Pagos',email:randomUUID()+'@example.com',phone:'',gymId:gym.id}});
 const p=await inventory.saveProduct(gym.id,{name:'Bono producto',price:30,stock:10});
 const input={requestKey:randomUUID(),clientId:client.id,paymentMode:'PENDING',lines:[{productId:p.id,quantity:2}]};
 const sale=await inventory.sell(gym.id,'desk',input);
 assert.equal(sale.outstandingAmount,60);assert.equal(sale.paymentStatus,'PENDIENTE');assert.equal(sale.payments.length,0);
 await inventory.sell(gym.id,'desk',input);
 assert.equal((await inventory.products(gym.id))[0].stock,8);assert.deepEqual(await inventory.debtSummary(gym.id),{[client.id]:60});
 const first={requestKey:randomUUID(),amount:20,method:'EFECTIVO'};
 let updated=await inventory.pay(gym.id,'desk',sale.id,first);
 assert.equal(updated.paymentStatus,'PARCIAL');assert.equal(updated.outstandingAmount,40);
 updated=await inventory.pay(gym.id,'desk',sale.id,first);assert.equal(updated.payments.length,1);
 await assert.rejects(inventory.pay(gym.id,'desk',sale.id,{...first,amount:21}),/Identificador/);
 await inventory.pay(gym.id,'desk',sale.id,{requestKey:randomUUID(),amount:25,method:'TARJETA'});
 updated=await inventory.pay(gym.id,'desk',sale.id,{requestKey:randomUUID(),amount:15,method:'BIZUM'});
 assert.equal(updated.paymentStatus,'PAGADO');assert.equal(updated.outstandingAmount,0);assert.equal(updated.paidAmount,60);
 assert.deepEqual(await inventory.debtSummary(gym.id),{});
 assert.deepEqual(updated.payments.map(p=>p.method).sort(),['BIZUM','EFECTIVO','TARJETA']);
 assert.ok(updated.payments.every(p=>p.paidAt&&p.actorAccountId==='desk'));
 assert.equal((await inventory.sales(gym.id,new URLSearchParams({method:'BIZUM',client:client.id})))[0].id,sale.id);
 await assert.rejects(inventory.pay(gym.id,'desk',sale.id,{requestKey:randomUUID(),amount:1,method:'EFECTIVO'}),/supera/);
 await assert.rejects(inventory.pay(randomUUID(),'desk',sale.id,first),/desconocida/);
 await assert.rejects(inventory.pay(gym.id,'desk',sale.id,{requestKey:randomUUID(),amount:1,method:'OTRO'}));
});

test('Cobros simultáneos: no sobrecobrar y una sola aplicación del mismo recibo',async()=>{
 const gym=await db.gym.create({data:{name:randomUUID()}}),client=await db.client.create({data:{firstName:'Cliente',lastName:'Concurrente',email:randomUUID()+'@example.com',phone:'',gymId:gym.id}});
 const p=await inventory.saveProduct(gym.id,{name:'Producto',price:50,stock:4});
 const sale=await inventory.sell(gym.id,'admin',{requestKey:randomUUID(),clientId:client.id,paymentMode:'PENDING',lines:[{productId:p.id,quantity:1}]});
 const request={requestKey:randomUUID(),amount:10,method:'BIZUM'};
 await Promise.all([inventory.pay(gym.id,'a',sale.id,request),inventory.pay(gym.id,'b',sale.id,request)]);
 assert.equal(await db.payment.count({where:{saleId:sale.id}}),1);
 const results=await Promise.allSettled(['a','b'].map(actor=>inventory.pay(gym.id,actor,sale.id,{requestKey:randomUUID(),amount:40,method:'TARJETA'})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await inventory.sales(gym.id,new URLSearchParams()))[0].paidAmount,50);
});

test('Deudas: varios recibos, devolución reduce saldo, anulación y ventas antiguas sin inventar pagos',async()=>{
 const gym=await db.gym.create({data:{name:randomUUID()}}),client=await db.client.create({data:{firstName:'Cliente',lastName:'Saldo',email:randomUUID()+'@example.com',phone:'',gymId:gym.id}});
 const p=await inventory.saveProduct(gym.id,{name:'Toalla',price:10,stock:10});
 const make=quantity=>inventory.sell(gym.id,'admin',{requestKey:randomUUID(),clientId:client.id,paymentMode:'PENDING',lines:[{productId:p.id,quantity}]});
 const a=await make(3),b=await make(2);
 assert.deepEqual(await inventory.debtSummary(gym.id),{[client.id]:50});
 await inventory.pay(gym.id,'admin',a.id,{requestKey:randomUUID(),amount:10,method:'EFECTIVO'});
 await inventory.reverse(gym.id,a.id,{requestKey:randomUUID(),lines:[{lineId:a.lines[0].id,quantity:1}]});
 assert.deepEqual(await inventory.debtSummary(gym.id),{[client.id]:30});
 await inventory.reverse(gym.id,b.id,{},true);
 assert.deepEqual(await inventory.debtSummary(gym.id),{[client.id]:10});
 const cancelled=await inventory.reverse(gym.id,a.id,{},true);
 assert.equal(cancelled.outstandingAmount,0);assert.equal(cancelled.refundDue,10);assert.equal(cancelled.payments.length,1);
 const legacy=await db.sale.create({data:{gymKey:gym.id,clientId:client.id,status:'COMPLETADA',subtotal:20,taxAmount:0,totalAmount:20}});
 const old=(await inventory.sales(gym.id,new URLSearchParams())).find(s=>s.id===legacy.id);
 assert.equal(old.paymentStatus,'SIN_VERIFICAR');assert.deepEqual(await inventory.debtSummary(gym.id),{});
 await assert.rejects(inventory.pay(gym.id,'admin',legacy.id,{requestKey:randomUUID(),amount:20,method:'TARJETA'}),/no admite/);
 const count=await db.client.count();
 await assert.rejects(inventory.sell(gym.id,'admin',{requestKey:randomUUID(),clientId:null,paymentMode:'PENDING',lines:[{productId:p.id,quantity:1}]}),/paso/);
 const walkin=await inventory.sell(gym.id,'admin',{requestKey:randomUUID(),clientId:null,paymentMode:'PAID',paymentMethod:'BIZUM',lines:[{productId:p.id,quantity:1}]});
 assert.equal(walkin.paymentStatus,'PAGADO');assert.equal(walkin.clientId,null);assert.equal(walkin.payments[0].method,'BIZUM');assert.equal(await db.client.count(),count);
});

test('Calendario: saldo actualizado sin cambiar reservas ni su revisión',async()=>{
 const {Store}=require('../dist/calendar/store'),{server}=require('../dist/calendar/http');
 const gym=await db.gym.create({data:{name:randomUUID()}}),client=await db.client.create({data:{firstName:'Cliente',lastName:'Calendario',email:randomUUID()+'@example.com',phone:'',gymId:gym.id}});
 const store=new Store(pool,db),hours=Array.from({length:7},()=>({open:'09:00',close:'19:00',closed:false}));
 await store.seed(gym.id,{timezone:'Europe/Madrid',schedule:hours,employees:[{id:'e1',name:'Entrenador',color:'#123456',schedule:hours}],rooms:[{id:'r1',name:'Sala'}],services:[{id:'session',name:'Sesión',duration:60,capacity:1}],clients:[]});
 const booking=await store.save(gym.id,{clientId:client.id,employeeId:'e1',serviceId:'session',roomId:'r1',date:'2030-12-02',start:'10:00',status:'CONFIRMED'});
 const p=await inventory.saveProduct(gym.id,{name:'Camiseta',price:20,stock:3});
 const sale=await inventory.sell(gym.id,'admin',{requestKey:randomUUID(),clientId:client.id,paymentMode:'PENDING',lines:[{productId:p.id,quantity:1}]});
 const token=randomUUID(),http=server(store,gym.id,token);await new Promise(r=>http.listen(0,'127.0.0.1',r));
 const get=async()=>{const r=await fetch(`http://127.0.0.1:${http.address().port}/api/state`,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);return r.json();};
 let dom;
 async function until(fn){const deadline=Date.now()+7000;while(Date.now()<deadline){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Aviso de deuda no actualizado');}
 try{const first=await get();assert.equal(first.clientDebts[client.id],20);
 const {JSDOM}=require('jsdom');const base=`http://127.0.0.1:${http.address().port}`;
 dom=await JSDOM.fromURL(base+'/?fecha=2030-12-02',{pretendToBeVisual:true,resources:'usable',runScripts:'dangerously',beforeParse(w){w.fetch=(p,o)=>fetch(new URL(p,base),o);w.AbortSignal=AbortSignal;w.structuredClone=structuredClone;w.sessionStorage.setItem('calendar-user-token',token);w.CALENDAR_SERVER=true;w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};}});
 await until(()=>dom.window.document.querySelector('.booking-debt-badge'));
 assert.match(dom.window.document.querySelector('.booking-debt-badge').textContent,/20/);
 await inventory.pay(gym.id,'admin',sale.id,{requestKey:randomUUID(),amount:5,method:'EFECTIVO'});
 const partial=await get();assert.equal(partial.clientDebts[client.id],15);assert.equal(partial.revision,first.revision);
 await until(()=>dom.window.document.querySelector('.booking-debt-badge')?.textContent.includes('15'));
 dom.window.document.querySelector('[data-booking]').click();assert.match(dom.window.document.getElementById('booking-debt').textContent,/15/);assert.match(dom.window.document.querySelector('#booking-debt a').href,/productos.html\?client=/);
 await inventory.pay(gym.id,'admin',sale.id,{requestKey:randomUUID(),amount:15,method:'TARJETA'});
 const final=await get();assert.deepEqual(final.clientDebts,{});assert.deepEqual(final.bookings,first.bookings);assert.equal(final.bookings[0].id,booking.id);
 await until(()=>!dom.window.document.querySelector('.booking-debt-badge'));assert.equal(dom.window.document.getElementById('booking-debt').hidden,true);
 }finally{dom?.window.close();await new Promise(r=>http.close(r));}
});

test('API completa: registrar deuda, cobrar en recepción y consultar la ficha del mismo cliente',async()=>{
 const {spawn}=require('node:child_process'),net=require('node:net');
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const gym=await db.gym.create({data:{name:'000 · Prueba HTTP pagos'}}),client=await db.client.create({data:{firstName:'Cliente',lastName:'HTTP',email:randomUUID()+'@example.com',phone:'',gymId:gym.id}});
 const opts=pool.options,url=`postgresql://postgres:${opts.password}@127.0.0.1:${opts.port}/postgres`,token=randomUUID();
 const child=spawn(process.execPath,['dist/index.js'],{env:{...process.env,PORT:String(port),DATABASE_URL:url,CALENDAR_DATABASE_URL:url,CALENDAR_ADMIN_TOKEN:token,TRAINERS_POINT_DEV_ADMIN:'false'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const base=`http://127.0.0.1:${port}`,headers={Authorization:'Bearer '+token,'X-Calendar-Gym':gym.id,'Content-Type':'application/json',Origin:base};
 const request=async(path,method='GET',body)=>{const response=await fetch(base+'/api/'+path,{method,headers,body:body?JSON.stringify(body):undefined});const data=await response.json();return {status:response.status,data};};
 let dom;
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,50));}assert.ok(ready,logs);
  const created=await request('inventory/products','POST',{name:'Producto HTTP',price:24,stock:4});assert.equal(created.status,201,JSON.stringify(created.data));
  const {Access}=require('../dist/calendar/access'),access=new Access(pool,db);
  await access.seedLocalDevelopmentAdmin(gym.id);
  await access.save(gym.id,{name:'Recepción de prueba',username:'desk',role:'RECEPTION',enabled:true});
  const login=await access.login(gym.id,{username:'desk',password:'Trainerspoint'});
  await access.changePassword(gym.id,login.token,{currentPassword:'Trainerspoint',newPassword:'Reception-test-password-123',confirmPassword:'Reception-test-password-123'});
  headers.Authorization='Bearer '+login.token;
  const drawer=await request('cash/sessions','POST',{requestKey:randomUUID(),openingAmount:100});assert.equal(drawer.status,201,JSON.stringify(drawer.data));
  assert.equal((await request('inventory/products','POST',{name:'No autorizado',price:2,stock:1})).status,403);
  const sale=await request('inventory/sales','POST',{requestKey:randomUUID(),clientId:client.id,paymentMode:'PENDING',lines:[{productId:created.data.id,quantity:1}]});assert.equal(sale.status,201,JSON.stringify(sale.data));
  let history=await request('clients/'+client.id+'/service-history');assert.equal(history.status,200,JSON.stringify(history.data));assert.equal(history.data.debt[0].amount,24);assert.equal(history.data.sales[0].paymentStatus,'PENDIENTE');
  const {JSDOM}=require('jsdom');
  dom=await JSDOM.fromURL(base+'/productos.html?client='+client.id,{pretendToBeVisual:true,resources:'usable',runScripts:'dangerously',beforeParse(w){w.fetch=(p,o)=>fetch(new URL(p,base),o);w.AbortSignal=AbortSignal;w.structuredClone=structuredClone;w.sessionStorage.setItem('calendar-user-token',headers.Authorization.slice(7));w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};}});
  async function until(fn){for(let i=0;i<140;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('La tienda no actualizó el cobro');}
  const document=dom.window.document;await until(()=>document.querySelector('[data-pay]'));
  document.querySelector('[data-pay]').click();document.getElementById('payment-amount').value='5';document.getElementById('payment-method').value='EFECTIVO';document.getElementById('payment-form').requestSubmit(document.getElementById('confirm-payment'));
  await until(()=>document.querySelector('.payment-summary')?.textContent.includes('Pago parcial'));
  history=await request('clients/'+client.id+'/service-history');assert.equal(history.data.debt[0].amount,19);
  const paid=await request('inventory/sales/'+sale.data.id+'/payments','POST',{requestKey:randomUUID(),amount:19,method:'BIZUM'});assert.equal(paid.status,200,JSON.stringify(paid.data));assert.equal(paid.data.paymentStatus,'PAGADO');
  history=await request('clients/'+client.id+'/service-history');assert.deepEqual(history.data.debt,[]);assert.ok(history.data.sales[0].payments.some(p=>p.method==='BIZUM'));assert.equal(history.data.sales[0].payments.length,2);
  assert.equal((await request('inventory/sales/'+sale.data.id+'/cancel','POST',{})).status,403);
  document.querySelector('[data-return]').click();document.querySelector('#return-lines input[data-line]').value='1';document.getElementById('return-reason').value='Cambio solicitado por el cliente';document.getElementById('return-form').requestSubmit(document.querySelector('#return-form button.primary'));
  await until(()=>document.querySelector('[data-refund]'));
  document.querySelector('[data-refund]').click();document.getElementById('payment-note').value='Dinero entregado al cliente';document.getElementById('payment-confirm').checked=true;document.getElementById('payment-method').value='BIZUM';document.getElementById('payment-form').requestSubmit(document.getElementById('confirm-payment'));
  await until(()=>!document.querySelector('[data-refund]'));
  history=await request('clients/'+client.id+'/service-history');assert.equal(history.data.sales[0].refundedAmount,24);assert.deepEqual(history.data.debt,[]);
  const legacy=await db.sale.create({data:{gymKey:gym.id,clientId:client.id,status:'COMPLETADA',subtotal:12,taxAmount:0,totalAmount:12,soldAt:new Date()}});
  document.getElementById('sales-tab').click();await until(()=>document.querySelector('[data-verify]'));
  document.querySelector('[data-verify]').click();document.getElementById('payment-note').value='Justificante del cobro revisado';document.getElementById('payment-confirm').checked=true;document.getElementById('payment-form').requestSubmit(document.getElementById('confirm-payment'));
  await until(()=>!document.querySelector('[data-verify]'));
  assert.equal(await db.payment.count({where:{saleId:legacy.id,status:'PAGADO'}}),1);
  dom.window.close();
  dom=await JSDOM.fromURL(base+'/caja.html',{pretendToBeVisual:true,resources:'usable',runScripts:'dangerously',beforeParse(w){w.fetch=(p,o)=>fetch(new URL(p,base),o);w.AbortSignal=AbortSignal;w.structuredClone=structuredClone;w.sessionStorage.setItem('calendar-user-token',headers.Authorization.slice(7));w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};}});
  const cashDoc=dom.window.document;await until(()=>cashDoc.getElementById('expected-amount').textContent.includes('105'));
  assert.match(cashDoc.getElementById('cash-payments').textContent,/Efectivo/);assert.match(cashDoc.getElementById('cash-payments').textContent,/Bizum/);
  cashDoc.getElementById('add-movement').click();cashDoc.getElementById('movement-type').value='WITHDRAWAL';cashDoc.getElementById('movement-amount').value='10';cashDoc.getElementById('movement-reason').value='Retirada para ingreso';cashDoc.getElementById('movement-form').requestSubmit(cashDoc.querySelector('#movement-form .primary'));
  await until(()=>cashDoc.getElementById('expected-amount').textContent.includes('95'));
  cashDoc.getElementById('close-cash').click();await until(()=>cashDoc.getElementById('close-dialog').open);
  cashDoc.getElementById('counted-amount').value='94';cashDoc.getElementById('close-note').value='Diferencia en el cambio';cashDoc.getElementById('close-form').requestSubmit(cashDoc.querySelector('#close-form .primary'));
  await until(()=>cashDoc.getElementById('session-state').textContent==='Cerrada');assert.match(cashDoc.getElementById('closing-result').textContent,/Falta dinero/);
  const closedDrawer=await request('cash/sessions/'+drawer.data.id);assert.equal(Number(closedDrawer.data.difference),-1);assert.equal(closedDrawer.data.closedByName,'Recepción de prueba');
  assert.equal((await request('cash/sessions')).data.sessions[0].collectedAmount,24);
  const service=await db.service.create({data:{name:'Bono HTTP',price:50,durationMin:60}}),packageInput={requestKey:randomUUID(),serviceId:service.id,sessionsBought:2,totalAmount:50,paymentMethod:'OTRO',paymentStatus:'PENDIENTE'};
  const createdPackage=await request('clients/'+client.id+'/service-packages','POST',packageInput);assert.equal(createdPackage.status,201,JSON.stringify(createdPackage.data));assert.ok(createdPackage.data.servicePackage.saleId);
  let packageHistory=await request('clients/'+client.id+'/service-history');assert.equal(packageHistory.data.debt[0].amount,50);
  const billing=await request('service-packages/'+createdPackage.data.servicePackage.id+'/billing','POST',{});assert.equal(billing.status,200);
  const packagePayment=await request('inventory/sales/'+billing.data.saleId+'/payments','POST',{requestKey:randomUUID(),amount:50,method:'BIZUM'});assert.equal(packagePayment.status,200);
  packageHistory=await request('clients/'+client.id+'/service-history');assert.deepEqual(packageHistory.data.debt,[]);assert.equal(packageHistory.data.packages[0].paymentStatus,'PAGADO');
  assert.equal((await request('cash/sessions/'+drawer.data.id)).data.summary.collections.EFECTIVO,5);

  const ownExport=await fetch(base+'/api/attendance/export?from=2026-01-01&to=2026-01-31',{headers});
  assert.equal(ownExport.status,200);assert.match(ownExport.headers.get('content-type'),/text\/csv/);assert.match(await ownExport.text(),/Fecha entrada/);
  assert.equal((await fetch(base+'/api/attendance/export?from=2026-01-01&to=2026-01-31&employeeId=otro',{headers})).status,200);
  assert.equal((await fetch(base+'/api/attendance/export?from=2026-01-01&to=2026-12-31',{headers})).status,400);
  const {Store}=require('../dist/calendar/store'),appointmentStore=new Store(pool,db);
  const session=await appointmentStore.save(gym.id,{clientId:client.id,employeeId:'e1',serviceId:service.id,roomId:'r1',date:'2026-01-05',start:'10:00',status:'CONFIRMED'});
  const completedSession=await request('bookings/'+session.id+'/attendance','PATCH',{attendance:'ASISTIO'});assert.equal(completedSession.status,200,JSON.stringify(completedSession.data));
  const quickBill=await request('bookings/'+session.id+'/billing','POST',{});assert.equal(quickBill.status,200,JSON.stringify(quickBill.data));assert.equal(quickBill.data.outstandingAmount,50);assert.equal(quickBill.data.scope,'SESSION');
  const {JSDOM:PaymentDOM}=require('jsdom');const quickDom=new PaymentDOM('<body></body>',{url:base,runScripts:'outside-only'});
  try {
   const w=quickDom.window;w.AbortSignal=AbortSignal;w.fetch=(p,o)=>fetch(new URL(p,base),{...o,headers:{...headers,...o.headers}});w.sessionStorage.setItem('calendar-user-token',headers.Authorization.slice(7));
   w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
   w.eval(await readFile('web/shared/booking-payment.js','utf8'));
   let paid=false;await w.TrainersPoint.collectBookingPayment(session.id,()=>{paid=true;});
   const paymentDialog=w.document.querySelector('.quick-payment');assert.equal(paymentDialog.open,true);assert.match(paymentDialog.textContent,/50/);
   paymentDialog.querySelector('select').value='TARJETA';paymentDialog.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));
   await until(()=>paid);assert.equal(paymentDialog.open,false);
  }finally{quickDom.window.close();}
  assert.equal((await request('bookings/'+session.id+'/billing','POST',{})).data.outstandingAmount,0);
  assert.equal((await request('state')).data.bookings.find(b=>b.id===session.id).paymentDue,false);

  assert.equal((await fetch(base+'/api/inventory/sales/'+sale.data.id+'/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 }finally{dom?.window.close();child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}
});


test('Devolución: motivo y responsable, producto deteriorado sin reponer y reembolso concurrente',async()=>{
 const gym=randomUUID(),product=await inventory.saveProduct(gym,{name:'Botella',price:20,stock:3});
 const sale=await inventory.sell(gym,'desk',{requestKey:randomUUID(),clientId:null,paymentMethod:'TARJETA',lines:[{productId:product.id,quantity:2}]});
 const reversed=await inventory.reverse(gym,sale.id,{requestKey:randomUUID(),reason:'Producto deteriorado',lines:[{lineId:sale.lines[0].id,quantity:1,restock:false}]},false,'reception-1');
 assert.equal((await inventory.products(gym))[0].stock,1);assert.equal(reversed.refundDue,20);assert.equal(reversed.outstandingAmount,0);
 assert.equal(reversed.returnHistory[0].actor,'reception-1');assert.equal(reversed.returnHistory[0].reason,'Producto deteriorado');
 const input={requestKey:randomUUID(),amount:20,method:'TARJETA',note:'Reembolso entregado'};
 const results=await Promise.allSettled([inventory.refund(gym,'r1',sale.id,input),inventory.refund(gym,'r2',sale.id,{...input,requestKey:randomUUID()})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const receipt=results.find(r=>r.status==='fulfilled').value.payments.find(p=>p.kind==='REFUND');
 const retry=await inventory.refund(gym,'r1',sale.id,{...input,requestKey:receipt.requestKey});assert.equal(retry.refundDue,0);assert.equal(retry.outstandingAmount,0);assert.equal(retry.refundedAmount,20);
 assert.equal(await db.payment.count({where:{saleId:sale.id,kind:'REFUND'}}),1);
 await assert.rejects(inventory.refund(gym,'r1',sale.id,{...input,requestKey:randomUUID(),amount:1}),/supera/);
 assert.doesNotThrow(()=>inventoryPermission({role:'RECEPTION'},'return'));assert.throws(()=>inventoryPermission({role:'TRAINER'},'return'),/permiso/);
});

test('Ventas antiguas: recepción verifica una vez el pago con fecha, método y evidencia',async()=>{
 const gym=randomUUID(),sale=await db.sale.create({data:{gymKey:gym,status:'COMPLETADA',subtotal:35,taxAmount:0,totalAmount:35}});
 const input={requestKey:randomUUID(),amount:35,method:'BIZUM',paidAt:'2026-01-03T10:00:00.000Z',note:'Justificante revisado en recepción'};
 const results=await Promise.all([inventory.verifyPaid(gym,'desk',sale.id,input),inventory.verifyPaid(gym,'desk',sale.id,input)]);
 assert.ok(results.every(r=>r.paymentStatus==='PAGADO'));assert.equal(await db.payment.count({where:{saleId:sale.id}}),1);
 assert.equal(results[0].payments[0].paidAt.toISOString(),input.paidAt);assert.equal(results[0].payments[0].actorAccountId,'desk');
 await assert.rejects(inventory.verifyPaid(gym,'desk',sale.id,{...input,requestKey:randomUUID()}),/ya está verificada/);
 await assert.rejects(inventory.verifyPaid(gym,'desk',sale.id,{...input,note:'Otro justificante'}),/ya utilizado/);
 await assert.rejects(inventory.verifyPaid(gym,'desk',sale.id,{...input,paidAt:'2099-01-01T00:00:00.000Z'}));
});

test('Caja: ejemplo 100 inicial + 75 efectivo + 120 tarjeta = 175 en el cajón',async()=>{
 const {CashRegister}=require('../dist/finance/cash'),cash=new CashRegister(db),gym=randomUUID(),actor={id:'desk',name:'Recepción Uno',role:'RECEPTION'};
 const opened=await cash.open(gym,actor,{requestKey:randomUUID(),openingAmount:100});
 const p=await inventory.saveProduct(gym,{name:'Compra',price:15,stock:30});
 await inventory.sell(gym,actor.id,{requestKey:randomUUID(),clientId:null,paymentMethod:'EFECTIVO',lines:[{productId:p.id,quantity:5}]});
 await inventory.sell(gym,actor.id,{requestKey:randomUUID(),clientId:null,paymentMethod:'TARJETA',lines:[{productId:p.id,quantity:8}]});
 const current=(await cash.current(gym)).session;
 assert.equal(current.summary.expectedCash,175);assert.equal(current.summary.collections.TARJETA,120);assert.equal(current.summary.soldTotal,195);assert.equal(current.summary.collections.EFECTIVO,75);
 assert.equal(current.summary.debtCollections.EFECTIVO,0);assert.equal(current.summary.sales.length,2);assert.equal(current.openedByName,'Recepción Uno');assert.equal(current.id,opened.id);
 const closed=await cash.close(gym,actor,current.id,{requestKey:randomUUID(),revision:current.revision,countedAmount:174,note:'Diferencia de cambio'});
 assert.equal(Number(closed.difference),-1);assert.equal(closed.closedBy,'desk');assert.equal(closed.summary.expectedCash,175);
});

test('Caja: cobrar deudas anteriores por método, pendiente no es cobro, Bizum separado',async()=>{
 const {CashRegister}=require('../dist/finance/cash'),cash=new CashRegister(db),gym=await db.gym.create({data:{name:randomUUID()}}),actor={id:'desk',name:'Recepción',role:'RECEPTION'};
 const client=await db.client.create({data:{firstName:'Ana',lastName:'Caja',email:randomUUID()+'@example.com',phone:'',gymId:gym.id}}),p=await inventory.saveProduct(gym.id,{name:'Producto',price:100,stock:5});
 const old=await inventory.sell(gym.id,'desk',{requestKey:randomUUID(),clientId:client.id,paymentMode:'PENDING',lines:[{productId:p.id,quantity:1}]});
 await cash.open(gym.id,actor,{requestKey:randomUUID(),openingAmount:100});
 await inventory.pay(gym.id,'desk',old.id,{requestKey:randomUUID(),amount:30,method:'EFECTIVO'});
 await inventory.pay(gym.id,'desk',old.id,{requestKey:randomUUID(),amount:40,method:'TARJETA'});
 await inventory.sell(gym.id,'desk',{requestKey:randomUUID(),clientId:client.id,paymentMode:'PENDING',lines:[{productId:p.id,quantity:1}]});
 await inventory.sell(gym.id,'desk',{requestKey:randomUUID(),clientId:null,paymentMethod:'BIZUM',lines:[{productId:p.id,quantity:1}]});
 const summary=(await cash.current(gym.id)).session.summary;
 assert.equal(summary.expectedCash,130);assert.equal(summary.collections.TARJETA,40);assert.equal(summary.collections.BIZUM,100);
 assert.equal(summary.debtCollections.EFECTIVO,30);assert.equal(summary.debtCollections.TARJETA,40);assert.equal(summary.soldTotal,200);assert.equal(summary.payments.length,3);
 const legacy=await db.sale.create({data:{gymKey:gym.id,status:'COMPLETADA',subtotal:20,taxAmount:0,totalAmount:20}});
 await inventory.verifyPaid(gym.id,'desk',legacy.id,{requestKey:randomUUID(),amount:20,method:'EFECTIVO',paidAt:new Date(Date.now()-1000).toISOString(),note:'Justificante antiguo revisado'});
 assert.equal((await cash.current(gym.id)).session.summary.expectedCash,130);
});

test('Caja: apertura única, movimientos idempotentes y cierre exige revisar operaciones nuevas',async()=>{
 const {CashRegister,cashPermission}=require('../dist/finance/cash'),cash=new CashRegister(db),gym=randomUUID(),actor={id:'desk',name:'Recepción',role:'RECEPTION'};
 const opened=await Promise.allSettled([cash.open(gym,actor,{requestKey:randomUUID(),openingAmount:100}),cash.open(gym,actor,{requestKey:randomUUID(),openingAmount:100})]);
 assert.equal(opened.filter(r=>r.status==='fulfilled').length,1);let session=(await cash.current(gym)).session;
 const input={requestKey:randomUUID(),direction:'IN',category:'CHANGE',amount:20,reason:'Añadir cambio'};
 await cash.movement(gym,actor,session.id,input);await cash.movement(gym,actor,session.id,input);
 await assert.rejects(cash.movement(gym,actor,session.id,{...input,amount:30}),/ya utilizado/);
 await assert.rejects(cash.close(gym,actor,session.id,{requestKey:randomUUID(),revision:session.revision,countedAmount:120}),/operaciones nuevas/);
 await cash.movement(gym,actor,session.id,{requestKey:randomUUID(),direction:'OUT',category:'WITHDRAWAL',amount:10,reason:'Retirada para ingreso'});
 session=(await cash.current(gym)).session;assert.equal(session.summary.expectedCash,110);
 const close={requestKey:randomUUID(),revision:session.revision,countedAmount:112,note:'Sobran dos euros'};
 const closed=await cash.close(gym,actor,session.id,close);assert.equal(Number(closed.difference),2);
 assert.equal((await cash.close(gym,actor,session.id,close)).id,closed.id);
 await assert.rejects(cash.movement(gym,actor,session.id,{...input,requestKey:randomUUID()}),/cerrada/);
 await assert.rejects(cash.detail(randomUUID(),session.id),/desconocida/);
 assert.equal((await cash.current(gym)).session,null);
 const history=await cash.history(gym,new URLSearchParams());assert.equal(history.sessions[0].id,closed.id);assert.equal('summary' in history.sessions[0],false);
 assert.throws(()=>cashPermission({role:'TRAINER'}),/recepción/);assert.throws(()=>cashPermission({role:'CLIENT'}),/recepción/);assert.doesNotThrow(()=>cashPermission(actor));
});

test('Caja: devoluciones en caja posterior no cambian el cierre anterior',async()=>{
 const {CashRegister}=require('../dist/finance/cash'),cash=new CashRegister(db),gym=randomUUID(),actor={id:'desk',name:'Recepción',role:'RECEPTION'};
 await cash.open(gym,actor,{requestKey:randomUUID(),openingAmount:100});
 const p=await inventory.saveProduct(gym,{name:'Toalla',price:20,stock:5});
 const sale=await inventory.sell(gym,'desk',{requestKey:randomUUID(),clientId:null,paymentMethod:'EFECTIVO',lines:[{productId:p.id,quantity:2}]});
 let session=(await cash.current(gym)).session;
 const first=await cash.close(gym,actor,session.id,{requestKey:randomUUID(),revision:session.revision,countedAmount:140});
 await cash.open(gym,actor,{requestKey:randomUUID(),openingAmount:140});
 await inventory.reverse(gym,sale.id,{requestKey:randomUUID(),reason:'Cambio solicitado',lines:[{lineId:sale.lines[0].id,quantity:1}]},false,'desk');
 let summary=(await cash.current(gym)).session.summary;assert.equal(summary.expectedCash,140);assert.equal(summary.returnsTotal,20);assert.equal(summary.soldTotal,0);
 await inventory.refund(gym,'desk',sale.id,{requestKey:randomUUID(),amount:20,method:'EFECTIVO',note:'Dinero entregado al cliente'});
 summary=(await cash.current(gym)).session.summary;assert.equal(summary.expectedCash,120);assert.equal(summary.refunds.EFECTIVO,20);
 assert.deepEqual((await cash.detail(gym,first.id)).summary,first.summary);
});

test('Caja: operaciones sin caja se conservan sin atribuirlas después a una apertura',async()=>{
 const {CashRegister}=require('../dist/finance/cash'),cash=new CashRegister(db),gym=randomUUID(),actor={id:'desk',name:'Recepción',role:'RECEPTION'};
 const p=await inventory.saveProduct(gym,{name:'Agua',price:5,stock:5});
 await inventory.sell(gym,'desk',{requestKey:randomUUID(),clientId:null,paymentMethod:'EFECTIVO',lines:[{productId:p.id,quantity:1}]});
 assert.equal((await cash.current(gym)).unassignedPayments,1);
 await cash.open(gym,actor,{requestKey:randomUUID(),openingAmount:105});
 assert.equal((await cash.current(gym)).session.summary.expectedCash,105);
 assert.equal((await cash.current(gym)).session.summary.collections.EFECTIVO,0);
});

test('Calendario y bonos: consumo atómico, cancelación libera sesión y reservas sin bono quedan pendientes',async()=>{
 const {Store}=require('../dist/calendar/store'),gym=await db.gym.create({data:{name:randomUUID()}}),client=await db.client.create({data:{gymId:gym.id,firstName:'Cliente',lastName:'Bonos',email:randomUUID()+'@example.com',phone:''}}),other=await db.client.create({data:{gymId:gym.id,firstName:'Otra',lastName:'Persona',email:randomUUID()+'@example.com',phone:''}});
 const service=await db.service.create({data:{name:'Servicio bono',price:50,durationMin:45}}),pkg=await db.clientServicePackage.create({data:{clientId:client.id,serviceId:service.id,sessionsBought:1,totalAmount:50,paymentMethod:'EFECTIVO',paymentStatus:'PAGADO'}});
 const store=new Store(pool,db),hours=Array.from({length:7},()=>({open:'09:00',close:'21:00',closed:false}));
 await store.seed(gym.id,{timezone:'Europe/Madrid',schedule:hours,employees:[{id:'e1',name:'Entrenador',color:'#123456',schedule:hours}],rooms:[{id:'r1',name:'Sala'}],clients:[],services:[{id:service.id,name:service.name,duration:45,capacity:1}]});
 const input={clientId:client.id,employeeId:'e1',serviceId:service.id,packageId:pkg.id,roomId:'r1',date:'2030-12-02',start:'10:00',status:'CONFIRMED'};
 const results=await Promise.allSettled([store.save(gym.id,input),store.save(gym.id,{...input,start:'12:00'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const booked=results.find(r=>r.status==='fulfilled').value;
 const mirror=await db.booking.findUnique({where:{id:booked.id}});assert.equal(mirror.packageId,pkg.id);assert.equal(mirror.calendarGymId,gym.id);assert.equal(mirror.paymentPending,false);assert.equal(booked.end,booked.start==='10:00'?'10:45':'12:45');
 assert.equal(await db.booking.count({where:{packageId:pkg.id,attendance:'PENDIENTE'}}),1);
 await store.save(gym.id,{...booked,status:'CANCELLED'},booked.id);assert.equal((await db.booking.findUnique({where:{id:booked.id}})).attendance,'CANCELADA');
 const next=await store.save(gym.id,{...input,start:'14:00'});assert.equal(next.paymentDue,false);
 await assert.rejects(store.save(gym.id,{...input,clientId:other.id,start:'16:00'}),/compatible/);
 const unpaid=await store.save(gym.id,{...input,packageId:null,start:'17:00'});assert.equal(unpaid.paymentDue,true);assert.equal(unpaid.status,'CONFIRMED');assert.equal((await db.booking.findUnique({where:{id:unpaid.id}})).paymentPending,true);
 const pending=await db.clientServicePackage.create({data:{clientId:client.id,serviceId:service.id,sessionsBought:1,totalAmount:50,paymentMethod:'OTRO',paymentStatus:'PENDIENTE'}});
 const reserve=await store.save(gym.id,{...input,packageId:pending.id,start:'18:00'});assert.equal(reserve.paymentDue,true);
 await db.clientServicePackage.update({where:{id:pending.id},data:{paymentStatus:'PAGADO'}});assert.equal((await store.state(gym.id)).bookings.find(b=>b.id===reserve.id).paymentDue,false);
});

test('Bonos: una recuperación conserva la sesión del bono sin duplicar derechos',async()=>{
 const {Store}=require('../dist/calendar/store'),gym=await db.gym.create({data:{name:randomUUID()}}),client=await db.client.create({data:{gymId:gym.id,firstName:'Cliente',lastName:'Recuperación',email:randomUUID()+'@example.com',phone:''}}),service=await db.service.create({data:{name:'Servicio recuperación',price:30,durationMin:60}});
 const pkg=await db.clientServicePackage.create({data:{clientId:client.id,serviceId:service.id,sessionsBought:1,totalAmount:30,paymentMethod:'TARJETA',paymentStatus:'PAGADO'}}),store=new Store(pool,db),schedule=Array.from({length:7},()=>({open:'09:00',close:'21:00',closed:false}));
 await store.seed(gym.id,{timezone:'Europe/Madrid',schedule,employees:[{id:'e1',name:'Entrenador',color:'#123456',schedule}],rooms:[{id:'r1',name:'Sala'}],services:[{id:service.id,name:service.name,duration:60,capacity:1}],clients:[]});
 const input={clientId:client.id,employeeId:'e1',serviceId:service.id,packageId:pkg.id,roomId:'r1',date:'2030-12-02',start:'10:00',status:'CONFIRMED'};
 const original=await store.save(gym.id,input),credit=await store.deferBooking(gym.id,original.id,{id:'admin',role:'ADMIN',employeeId:null});
 await assert.rejects(store.save(gym.id,{...input,start:'12:00'}),/sesiones disponibles/);
 const recovered=await store.save(gym.id,{...input,start:'14:00',packageId:null,recoveryId:credit.id});assert.equal(recovered.chargeAmount,0);assert.equal((await db.booking.findUnique({where:{id:recovered.id}})).packageId,pkg.id);
});

test('Bonos y Caja: pagos mixtos y parciales, deuda única, sesión utilizable al completar y cierre estable',async()=>{
 const {Packages}=require('../dist/finance/packages'),{CashRegister}=require('../dist/finance/cash'),packages=new Packages(db),cash=new CashRegister(db),gym=await db.gym.create({data:{name:randomUUID()}}),actor={id:'desk',name:'Recepción',role:'RECEPTION'};
 const client=await db.client.create({data:{gymId:gym.id,firstName:'Cliente',lastName:'Cobro bonos',email:randomUUID()+'@example.com',phone:''}}),service=await db.service.create({data:{name:'Bono prueba cobros',price:100,durationMin:60}});
 const input={requestKey:randomUUID(),serviceId:service.id,sessionsBought:4,totalAmount:100,paymentMethod:'OTRO',paymentStatus:'PENDIENTE'};
 const pkg=await packages.create(gym.id,client.id,actor.id,input);assert.ok(pkg.saleId);
 await packages.create(gym.id,client.id,actor.id,input);assert.equal(await db.sale.count({where:{id:pkg.saleId}}),1);assert.equal(await db.payment.count({where:{saleId:pkg.saleId}}),0);
 const session=await cash.open(gym.id,actor,{requestKey:randomUUID(),openingAmount:50});
 const receipt={requestKey:randomUUID(),amount:30,method:'EFECTIVO'};
 await inventory.pay(gym.id,actor.id,pkg.saleId,receipt);await inventory.pay(gym.id,actor.id,pkg.saleId,receipt);
 assert.equal((await db.clientServicePackage.findUnique({where:{id:pkg.id}})).paymentStatus,'PENDIENTE');assert.equal((await inventory.debtSummary(gym.id))[client.id],70);
 await inventory.pay(gym.id,actor.id,pkg.saleId,{requestKey:randomUUID(),amount:70,method:'TARJETA'});
 assert.equal((await db.clientServicePackage.findUnique({where:{id:pkg.id}})).paymentStatus,'PAGADO');assert.deepEqual(await inventory.debtSummary(gym.id),{});
 const current=(await cash.current(gym.id)).session;assert.equal(current.summary.expectedCash,80);assert.equal(current.summary.collections.TARJETA,70);assert.equal(current.summary.debtCollections.EFECTIVO,30);assert.equal(current.summary.debtCollections.TARJETA,70);
 const closed=await cash.close(gym.id,actor,session.id,{requestKey:randomUUID(),revision:current.revision,countedAmount:80});assert.equal(Number(closed.difference),0);
 const paid=await packages.create(gym.id,client.id,actor.id,{...input,requestKey:randomUUID(),paymentStatus:'PAGADO',paymentMethod:'BIZUM'});assert.equal((await db.payment.findFirst({where:{saleId:paid.saleId}})).method,'BIZUM');assert.deepEqual((await cash.detail(gym.id,closed.id)).summary,closed.summary);
 await assert.rejects(packages.create(gym.id,client.id,actor.id,{...input,paymentMethod:'TARJETA'}),/ya se utilizó/);
 await assert.rejects(packages.billing(randomUUID(),pkg.id,actor.id),/desconocido/);
 await assert.rejects(inventory.reverse(gym.id,pkg.saleId,{},true),/bono/);
});

test('Bonos anteriores: preparar cobro no duplica deuda ni añade dinero al cajón',async()=>{
 const {Packages}=require('../dist/finance/packages'),{CashRegister}=require('../dist/finance/cash'),packages=new Packages(db),cash=new CashRegister(db),gym=await db.gym.create({data:{name:randomUUID()}}),actor={id:'desk',name:'Recepción',role:'RECEPTION'},client=await db.client.create({data:{gymId:gym.id,firstName:'Cliente',lastName:'Bono anterior',email:randomUUID()+'@example.com',phone:''}}),service=await db.service.create({data:{name:'Servicio bono anterior',price:40,durationMin:60}});
 const legacy=await db.clientServicePackage.create({data:{clientId:client.id,serviceId:service.id,sessionsBought:2,totalAmount:40,paymentStatus:'PENDIENTE',paymentMethod:'OTRO'}});
 await cash.open(gym.id,actor,{requestKey:randomUUID(),openingAmount:100});assert.equal((await inventory.debtSummary(gym.id))[client.id],40);
 const [a,b]=await Promise.all([packages.billing(gym.id,legacy.id,actor.id),packages.billing(gym.id,legacy.id,actor.id)]);assert.equal(a.saleId,b.saleId);assert.equal((await inventory.debtSummary(gym.id))[client.id],40);assert.equal((await cash.current(gym.id)).session.summary.soldTotal,0);
 await inventory.pay(gym.id,actor.id,a.saleId,{requestKey:randomUUID(),amount:40,method:'BIZUM'});assert.equal((await cash.current(gym.id)).session.summary.expectedCash,100);assert.equal((await cash.current(gym.id)).session.summary.debtCollections.BIZUM,40);
});


test('Copias: guardar y restaurar PostgreSQL recupera clientes y bonos sin mostrar credenciales',async()=>{
 const {spawnSync}=require('node:child_process'),fs=require('node:fs'),directory=await mkdtemp(join(tmpdir(),'backup-proof-'));
 const bin=join(process.cwd(),'node_modules','@embedded-postgres',process.platform+'-'+process.arch,'native','bin'),opts=pool.options,url=`postgresql://postgres:${opts.password}@127.0.0.1:${opts.port}/postgres`;
 const environment={...process.env,DATABASE_URL:url,BACKUP_DIR:directory,PG_DUMP_BIN:process.env.PG_DUMP_BIN||(fs.existsSync('/opt/homebrew/opt/libpq/bin/pg_dump')?'/opt/homebrew/opt/libpq/bin/pg_dump':'pg_dump'),PG_RESTORE_BIN:process.env.PG_RESTORE_BIN||(fs.existsSync('/opt/homebrew/opt/libpq/bin/pg_restore')?'/opt/homebrew/opt/libpq/bin/pg_restore':'pg_restore')};
 const saved=spawnSync(process.execPath,['scripts/database-backup.cjs'],{env:environment,encoding:'utf8'});assert.equal(saved.status,0,saved.stderr);assert.doesNotMatch(saved.stdout,new RegExp(opts.password));
 const dump=join(directory,fs.readdirSync(directory).find(n=>n.endsWith('.dump')));assert.equal(fs.statSync(dump).mode&0o777,0o600);
 await pool.query('CREATE DATABASE restore_proof');
 try{const restored=spawnSync(process.execPath,['scripts/database-backup.cjs','restore',dump,'--confirm-restore'],{env:{...environment,DATABASE_URL:(()=>{const target=new URL(url);target.pathname='/restore_proof';return target.href;})()},encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);
 const target=new Pool({host:'127.0.0.1',port:opts.port,user:'postgres',password:opts.password,database:'restore_proof'});try{assert.equal(Number((await target.query('SELECT count(*) FROM "Client"')).rows[0].count),await db.client.count());assert.equal(Number((await target.query('SELECT count(*) FROM "ClientServicePackage"')).rows[0].count),await db.clientServicePackage.count());}finally{await target.end();}
 }finally{await pool.query('DROP DATABASE restore_proof');}
});

test('Servidor en producción: arranca sin datos ficticios y nunca publica la clave de administración',async()=>{
 const seededBefore=await pool.query('SELECT id,config FROM calendar.gyms ORDER BY id');
 const {spawn}=require('node:child_process'),net=require('node:net');const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const opts=pool.options,url=`postgresql://postgres:${opts.password}@127.0.0.1:${opts.port}/postgres`,secret=randomUUID()+randomUUID();
 const child=spawn(process.execPath,['dist/index.js'],{env:{...process.env,NODE_ENV:'production',PUBLIC_ORIGIN:'https://gym.example',HOST:'127.0.0.1',PORT:String(port),DATABASE_URL:url,CALENDAR_DATABASE_URL:url,CALENDAR_ADMIN_TOKEN:secret,TRAINERS_POINT_DEV_ADMIN:'false'},stdio:['ignore','pipe','pipe']});let log='';child.stderr.on('data',b=>log+=b);child.stdout.resume();
 try{let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(log);try{ready=(await fetch(`http://127.0.0.1:${port}/api/health`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,50));}assert.ok(ready,log);
 const runtime=await (await fetch(`http://127.0.0.1:${port}/runtime.js`)).text();assert.ok(!runtime.includes(secret));assert.ok(runtime.includes('CALENDAR_DEV_TOKEN=""'));
 assert.equal((await fetch(`http://127.0.0.1:${port}/api/manage`)).status,401);
 const hostRequest=host=>new Promise((resolve,reject)=>{require('node:http').get({host:'127.0.0.1',port,path:'/api/health',headers:{Host:host}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
 assert.equal(await hostRequest('malicious.example'),403);assert.equal(await hostRequest('gym.example'),200);
 assert.deepEqual((await pool.query('SELECT id,config FROM calendar.gyms ORDER BY id')).rows,seededBefore.rows);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}
});

test('Primera cuenta: el operador crea administración sin imprimir la contraseña y no la sobrescribe',async()=>{
 const {spawnSync}=require('node:child_process'),{Access}=require('../dist/calendar/access'),gym=await db.gym.create({data:{name:randomUUID()}}),opts=pool.options,url=`postgresql://postgres:${opts.password}@127.0.0.1:${opts.port}/postgres`,password='Secret-test-admin-password-123';
 const env={...process.env,DATABASE_URL:url,ADMIN_GYM_ID:gym.id,ADMIN_NAME:'Administración de prueba',ADMIN_USERNAME:'manager',ADMIN_PASSWORD:password};
 const created=spawnSync(process.execPath,['scripts/create-admin.cjs'],{env,encoding:'utf8'});assert.equal(created.status,0,created.stderr);assert.ok(!created.stdout.includes(password));
 const login=await new Access(pool,db).login(gym.id,{username:'manager',password});assert.equal(login.role,'ADMIN');assert.equal(login.mustChangePassword,true);
 const repeated=spawnSync(process.execPath,['scripts/create-admin.cjs'],{env,encoding:'utf8'});assert.equal(repeated.status,1);assert.match(repeated.stderr,/ya tiene cuentas/);
});

 test('Optimización de deudas: una consulta, saldos equivalentes y datos agregados en vez de historiales completos',async t=>{
  const {saleBalance}=require('../dist/finance/inventory');
  const gym=await db.gym.create({data:{name:randomUUID()}});
  const clients=Array.from({length:8},(_,i)=>({id:randomUUID(),firstName:'Prueba',lastName:String(i),email:randomUUID()+'@example.com',phone:'',gymId:gym.id}));
  await db.client.createMany({data:clients});
  const sales=Array.from({length:180},(_,i)=>({id:randomUUID(),gymKey:gym.id,clientId:clients[i%clients.length].id,status:i%11===0?'CANCELADA':'COMPLETADA',paymentTracking:i%7!==0,subtotal:50.03,taxAmount:0,totalAmount:50.03}));
  await db.sale.createMany({data:sales});
  await db.saleLine.createMany({data:sales.flatMap((s,i)=>Array.from({length:3},()=>({saleId:s.id,type:'SERVICIO',description:'Sesión de prueba',quantity:1,unitPrice:10.01,taxRate:0,lineSubtotal:10.01,taxAmount:0,lineTotal:10.01,returnedQuantity:i%4===0?1:0})))});
  await db.payment.createMany({data:sales.flatMap((s,i)=>i%7===0?[]:[{saleId:s.id,method:'EFECTIVO',status:'PAGADO',amount:10.01},{saleId:s.id,method:'BIZUM',status:i%3===0?'PENDIENTE':'PAGADO',kind:i%5===0?'REFUND':'COLLECTION',amount:5.02}])});
  const rows=await db.sale.findMany({where:{gymKey:gym.id,clientId:{not:null},status:'COMPLETADA',OR:[{paymentTracking:true},{payments:{some:{}}}]},include:{lines:true,payments:true}});
  const expected={};for(const sale of rows){const due=Math.round(saleBalance(sale).outstandingAmount*100);if(due>0)expected[sale.clientId]=(expected[sale.clientId]||0)+due;}
  for(const id of Object.keys(expected))expected[id]/=100;
  const opts=pool.options,watched=new PrismaClient({datasources:{db:{url:`postgresql://postgres:${opts.password}@127.0.0.1:${opts.port}/postgres`}},log:[{emit:'event',level:'query'}]});
  const queries=[];watched.$on('query',event=>queries.push(event.query));
  try{
   await watched.$queryRaw`SELECT 1`;queries.length=0;
   const start=performance.now(),actual=await new Inventory(watched).debtSummary(gym.id),ms=performance.now()-start;
   assert.deepEqual(actual,expected);assert.equal(queries.length,1);assert.deepEqual(await inventory.debtSummary('legacy-test-centre'),{});
   const oldBytes=Buffer.byteLength(JSON.stringify(rows)),newBytes=Buffer.byteLength(JSON.stringify(actual));assert.ok(newBytes<oldBytes/10);
   t.diagnostic(`180 ventas: ${oldBytes} bytes de historiales → ${newBytes} bytes de saldos; 1 consulta (${ms.toFixed(1)} ms en base temporal).`);
  }finally{await watched.$disconnect();}
 });

 test('Optimización de ventas: 20 productos se leen juntos y conservan su stock e historial de movimientos',async t=>{
  const gym=randomUUID();const products=Array.from({length:20},(_,i)=>({id:randomUUID(),gymKey:gym,name:'Producto '+i,unitPrice:1.25,stock:5}));await db.product.createMany({data:products});
  const opts=pool.options,watched=new PrismaClient({datasources:{db:{url:`postgresql://postgres:${opts.password}@127.0.0.1:${opts.port}/postgres`}},log:[{emit:'event',level:'query'}]});const queries=[];watched.$on('query',e=>queries.push(e.query));
  try{const sale=await new Inventory(watched).sell(gym,'prueba',{requestKey:randomUUID(),clientId:null,lines:products.map(p=>({productId:p.id,quantity:2}))});
   assert.equal(Number(sale.totalAmount),50);assert.equal(await db.stockMovement.count({where:{reference:sale.id}}),20);assert.ok((await inventory.products(gym)).every(p=>p.stock===3));
   const reads=queries.filter(q=>q.startsWith('SELECT')&&q.includes('"Product"')).length;assert.equal(reads,1);t.diagnostic('20 líneas de venta: 1 lectura de productos y 1 inserción conjunta de movimientos; stock e importe verificados.');
  }finally{await watched.$disconnect();}
 });

async function appointmentFixture(preference = 'SMS') {
 const {Store}=require('../dist/calendar/store');
 const gym=await db.gym.create({data:{name:randomUUID()}});
 const client=await db.client.create({data:{gymId:gym.id,firstName:'Ana',lastName:'Prueba',email:randomUUID()+'@example.com',phone:'+34600000000',contactPreference:preference}});
 const service=await db.service.create({data:{name:'Sesión de fuerza',price:40,durationMin:60}});
 const schedule=Array.from({length:7},()=>({open:'00:00',close:'23:59',closed:false}));
 const store=new Store(pool,db);
 await store.seed(gym.id,{timezone:'Europe/Madrid',schedule,employees:[{id:'e1',name:'Entrenadora Julia',color:'#123456',schedule}],rooms:[{id:'r1',name:'Sala'}],services:[{id:service.id,name:service.name,duration:60,capacity:1}],clients:[]});
 const input={clientId:client.id,employeeId:'e1',serviceId:service.id,roomId:'r1',date:'2026-01-15',start:'10:00',status:'CONFIRMED'};
 return {gym,client,service,store,input};
}

test('Asistencia sin bono: deuda única, pagos parciales idempotentes, Caja y calendario sincronizados',async()=>{
 const {CashRegister}=require('../dist/finance/cash'),{saleBalance}=require('../dist/finance/inventory');
 const f=await appointmentFixture(),cash=new CashRegister(db),actor={id:'desk',name:'Recepción',role:'RECEPTION'};
 await cash.open(f.gym.id,actor,{requestKey:randomUUID(),openingAmount:100});
 const reservation=await f.store.save(f.gym.id,f.input);
 const completed=await f.store.save(f.gym.id,{...reservation,status:'COMPLETED'},reservation.id);
 const mirror=await db.booking.findUnique({where:{id:reservation.id}});
 assert.ok(mirror.saleId);assert.equal(mirror.paymentPending,true);
 await f.store.save(f.gym.id,completed,reservation.id);
 assert.equal(await db.sale.count({where:{gymKey:f.gym.id}}),1);
 const sale=await db.sale.findUnique({where:{id:mirror.saleId},include:{lines:true,payments:true}});
 assert.equal(saleBalance(sale).outstandingAmount,40);assert.equal(sale.payments.length,0);
 assert.equal((await inventory.debtSummary(f.gym.id))[f.client.id],40);
 const input={requestKey:randomUUID(),amount:10,method:'EFECTIVO'};
 await Promise.all([inventory.pay(f.gym.id,'desk',sale.id,input),inventory.pay(f.gym.id,'desk',sale.id,input)]);
 assert.equal(await db.payment.count({where:{saleId:sale.id}}),1);
 assert.equal((await f.store.state(f.gym.id)).bookings[0].paymentDue,true);
 await inventory.pay(f.gym.id,'desk',sale.id,{requestKey:randomUUID(),amount:30,method:'BIZUM'});
 assert.equal((await f.store.state(f.gym.id)).bookings[0].paymentDue,false);
 assert.deepEqual(await inventory.debtSummary(f.gym.id),{});
 await assert.rejects(inventory.pay(f.gym.id,'desk',sale.id,{requestKey:randomUUID(),amount:1,method:'TARJETA'}),/supera/);
 await assert.rejects(inventory.reverse(f.gym.id,sale.id,{},true),/sesión/);
 const state=await f.store.state(f.gym.id);
 await f.store.save(f.gym.id,{...state.bookings[0]},reservation.id);
 assert.equal((await f.store.state(f.gym.id)).bookings[0].paymentDue,false);
 const drawer=await cash.current(f.gym.id);assert.equal(drawer.session.summary.expectedCash,110);
});

test('Recordatorios: día anterior, canal de ficha, procesos concurrentes y reprogramación sin duplicados',async()=>{
 const {ReminderWorker}=require('../dist/reminders/worker');const f=await appointmentFixture('WHATSAPP');
 const b=await f.store.save(f.gym.id,{...f.input,date:'2031-01-15'});
 const now=new Date('2031-01-14T09:00:30Z'),sent=[];
 const provider={send:async m=>{sent.push(m);await new Promise(r=>setTimeout(r,20));return 'SM-test';}};
 await Promise.all([new ReminderWorker(pool,provider).run(now),new ReminderWorker(pool,provider).run(now)]);
 assert.equal(sent.length,1);assert.equal(sent[0].channel,'WHATSAPP');assert.equal(sent[0].trainer,'Entrenadora Julia');assert.equal(sent[0].service,'Sesión de fuerza');assert.equal(sent[0].date,'15/01/2031');
 await new ReminderWorker(pool,provider).run(now);assert.equal(sent.length,1);
 const moved=await f.store.save(f.gym.id,{...b,date:'2031-01-16'},b.id);
 await db.client.update({where:{id:f.client.id},data:{contactPreference:'SMS'}});
 await new ReminderWorker(pool,provider).run(new Date('2031-01-15T09:00:30Z'));
 assert.equal(sent.length,2);assert.equal(sent[1].channel,'SMS');
 await f.store.save(f.gym.id,{...moved,status:'CANCELLED'},b.id);
 await new ReminderWorker(pool,provider).run(new Date('2031-01-15T09:01:00Z'));assert.equal(sent.length,2);
});

test('Recordatorios: fallo ambiguo no repite; rechazo temporal se reintenta; modo desactivado no envía',async()=>{
 const {ReminderWorker}=require('../dist/reminders/worker'),{DeliveryError}=require('../dist/reminders/provider');
 const f=await appointmentFixture();await f.store.save(f.gym.id,{...f.input,date:'2032-01-15'});
 const now=new Date('2032-01-14T09:00:30Z');let calls=0;
 const worker=new ReminderWorker(pool,{send:async()=>{calls++;throw new DeliveryError('UNKNOWN','Sin respuesta');}});
 await worker.run(now);await worker.run(now);assert.equal(calls,1);
 const g=await appointmentFixture();await g.store.save(g.gym.id,{...g.input,date:'2033-01-15'});
 let retries=0;const retry=new ReminderWorker(pool,{send:async()=>{retries++;if(retries===1)throw new DeliveryError('RETRY','Límite');return 'SM-retry';}});
 await retry.run(new Date('2033-01-14T09:00:30Z'));await retry.run(new Date('2033-01-14T09:01:00Z'));assert.equal(retries,1);
 await retry.run(new Date('2033-01-14T09:06:00Z'));assert.equal(retries,2);
 await new ReminderWorker({query:()=>{throw Error('No debe consultar ni enviar');}},null).run(now);
});
