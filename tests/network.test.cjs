const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {mkdtemp,readdir,readFile}=require('node:fs/promises'),{join}=require('node:path'),{tmpdir}=require('node:os');
const {Pool}=require('pg'),{PrismaClient}=require('@prisma/client');
const {Store}=require('../dist/calendar/store'),{Access}=require('../dist/calendar/access');
const {Packages}=require('../dist/finance/packages'),{Inventory}=require('../dist/finance/inventory');
const {CashRegister}=require('../dist/finance/cash'),{accessibleClient}=require('../dist/network/scope');
const {pendingPackages}=require('../dist/planning/pending-packages');
let pg,pool,db,store,access,A,B,C,client1,client2,privateClient,service,admin,trainer,reception;
const hours=Array.from({length:7},()=>({open:'08:00',close:'22:00',closed:false}));
const people=[['Administración','ADMIN'],['Entrenador','TRAINER'],['Recepción','RECEPTION'],['Segundo entrenador','TRAINER']].map(([name,role])=>({id:randomUUID(),name,role,color:'#ef1234',active:true,schedule:hours}));
before(async()=>{
 const {default:Embedded}=await import('embedded-postgres');const socket=require('node:net').createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const password=randomUUID();pg=new Embedded({databaseDir:join(await mkdtemp(join(tmpdir(),'network-test-')),'db'),user:'postgres',password,port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog(){},onError(){}});await pg.initialise();await pg.start();
 pool=new Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',max:15});
 for(const dir of(await readdir('prisma/migrations')).sort())if(/^\d+_/.test(dir))await pool.query(await readFile(join('prisma/migrations',dir,'migration.sql'),'utf8'));
 db=new PrismaClient({datasources:{db:{url:`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`}}});
 [A,B,C]=await Promise.all(['A','B','C'].map((name,i)=>db.gym.create({data:{name:'Red '+name,brand:i===2?'COBOSU':'TRAINERS_POINT'}})));
 service=await db.service.create({data:{name:'Sesión global',price:30,durationMin:60,color:'#234567'}});
 [client1,client2,privateClient]=await Promise.all([A,A,C].map((gym,i)=>db.client.create({data:{firstName:'Cliente',lastName:String(i),email:randomUUID()+'@example.invalid',phone:'',gymId:gym.id,brand:i===2?'COBOSU':'TRAINERS_POINT',status:'ACTIVO'}})));
 store=new Store(pool,db);await store.migrate();access=new Access(pool,db);
 for(const gym of[A,B,C])await store.seed(gym.id,{timezone:'Europe/Madrid',schedule:hours,employees:people,rooms:[{id:'r1',name:'Sala local'}],services:[{id:service.id,name:service.name,duration:60,capacity:1}],clients:[]});
 await access.save(A.id,{employeeId:people[0].id,username:'network.admin',role:'ADMIN',enabled:true,password:'NetworkPassword123!',mustChangePassword:false});
 await access.save(A.id,{employeeId:people[1].id,username:'network.trainer',role:'TRAINER',enabled:true,password:'NetworkPassword123!',mustChangePassword:false});
 await access.save(B.id,{employeeId:people[2].id,username:'network.reception',role:'RECEPTION',enabled:true,password:'NetworkPassword123!',mustChangePassword:false});
 admin=await access.login(C.id,{username:'network.admin',password:'NetworkPassword123!',portal:'OFFICE'});
 trainer=await access.login(B.id,{username:'network.trainer',password:'NetworkPassword123!',portal:'TRAINER'});
 reception=await access.login(A.id,{username:'network.reception',password:'NetworkPassword123!',portal:'OFFICE'});
});
after(async()=>{await db?.$disconnect();await pool?.end();await pg?.stop();});
const booking=(client=client1,employee=people[1],extra={})=>({clientId:client.id,employeeId:employee.id,serviceId:service.id,roomId:'r1',date:'2031-05-05',start:'10:00',status:'CONFIRMED',...extra});

test('Red: un fichaje abierto aparece al cambiar de centro y no permite una segunda entrada',async()=>{
 const worker=await access.identify(B.id,trainer.token);
 const entered=await store.clock(A.id,{employeeId:worker.employeeId,action:'IN'},worker);
 const current=await store.attendance(B.id,undefined,undefined,worker.employeeId,'TRAINER');
 assert.equal(current.records.length,0);assert.equal(current.openRecords.length,1);assert.equal(current.openRecords[0].centerId,A.id);
 await assert.rejects(store.clock(B.id,{employeeId:worker.employeeId,action:'IN'},worker),/jornada abierta/);
 const closed=await store.clock(B.id,{employeeId:worker.employeeId,action:'OUT'},worker);assert.equal(closed.id,entered.id);
 assert.equal((await store.attendance(B.id,undefined,undefined,worker.employeeId,'TRAINER')).openRecords.length,0);
 assert.equal((await pool.query('SELECT gym_id,actor_out FROM calendar.attendance WHERE id=$1',[entered.id])).rows[0].gym_id,A.id);
});

test('Red: una recuperación TP se usa una vez desde otra sede y conserva el bono sin un segundo cobro',async()=>{
 const pkg=await new Packages(db).create(A.id,client1.id,'desk',{requestKey:randomUUID(),serviceId:service.id,sessionsBought:1,totalAmount:30,paymentMethod:'EFECTIVO',paymentStatus:'PAGADO'});
 const original=await store.save(A.id,booking(client1,people[1],{date:'2031-05-20',packageId:pkg.id}));
 const credit=await store.deferBooking(A.id,original.id,{id:'desk',role:'ADMIN',employeeId:null});
 assert.ok((await store.recoveries(B.id)).some(r=>r.id===credit.id));assert.equal((await store.recoveries(C.id)).some(r=>r.id===credit.id),false);
 const attempts=await Promise.allSettled([store.save(B.id,booking(client1,people[1],{date:'2031-05-21',recoveryId:credit.id})),store.save(A.id,booking(client1,people[1],{date:'2031-05-22',recoveryId:credit.id}))]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 const recovered=attempts.find(r=>r.status==='fulfilled').value;
 assert.equal(recovered.chargeAmount,0);assert.equal(recovered.paymentDue,false);
 assert.equal((await db.booking.findUnique({where:{id:recovered.id}})).packageId,pkg.id);
 assert.equal((await store.recoveries(B.id)).find(r=>r.id===credit.id).status,'SCHEDULED');
});

test('Red: una plantilla y una cuenta por persona funcionan desde las tres sedes sin escalar permisos',async()=>{
 for(const gym of[A,B,C]){
  assert.equal((await access.identify(gym.id,admin.token)).role,'ADMIN');
  const worker=await access.identify(gym.id,trainer.token);assert.equal(worker.employeeId,people[1].id);assert.equal(worker.role,'TRAINER');
  assert.equal((await access.identify(gym.id,reception.token)).role,'RECEPTION');
  assert.equal((await store.state(gym.id)).employees.length,4);
  assert.equal((await access.list(gym.id)).filter(u=>u.role!=='CLIENT').length,3);
 }
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM calendar.users WHERE role<>'CLIENT'")).rows[0].n,3);
 assert.equal(await access.seedLocalDevelopmentAdmin(C.id),false);
 await assert.rejects(access.save(C.id,{employeeId:people[1].id,username:'duplicated',role:'TRAINER',enabled:true}),/ya tiene una cuenta compartida/);
 const state=await store.state(B.id),record=state.employees.find(e=>e.id===people[3].id);
 await store.manage(B.id,'employees',{...record,name:'Nombre actualizado',color:'#ff0000'},state.revision,record.id);
 assert.equal((await store.state(A.id)).employees.find(e=>e.id===record.id).name,'Nombre actualizado');
 assert.equal((await store.state(C.id)).employees.find(e=>e.id===record.id).color,'#7b858d');
});

test('Red: fichas TP compartidas, clientes Cobosu locales y cuentas de cliente sin acceso a otras personas',async()=>{
 assert.ok(await accessibleClient(db,B.id,client1.id));assert.equal(await accessibleClient(db,A.id,privateClient.id),null);assert.equal(await accessibleClient(db,C.id,client1.id),null);
 assert.ok((await store.state(B.id)).clients.some(c=>c.id===client1.id));assert.equal((await store.state(B.id)).clients.some(c=>c.id===privateClient.id),false);
 await access.save(A.id,{clientId:client1.id,username:'network.client',role:'CLIENT',enabled:true,password:'ClientPassword123!',mustChangePassword:false});
 const session=await access.login(B.id,{username:'network.client',password:'ClientPassword123!',portal:'CLIENT'});
 assert.equal((await access.identify(A.id,session.token)).clientId,client1.id);assert.equal((await access.identify(B.id,session.token)).clientId,client1.id);
 await assert.rejects(access.identify(C.id,session.token),{status:401});
 await assert.rejects(access.save(B.id,{clientId:client1.id,username:'second.client',role:'CLIENT',enabled:true}),/ya tiene una cuenta/);
 assert.equal(await db.client.count({where:{id:client1.id}}),1);assert.equal((await db.client.findUnique({where:{id:client1.id}})).gymId,A.id);
});

test('Red: huecos, reservas simultáneas y ausencias comprueban todos los centros',async()=>{
 await store.save(A.id,booking());
 await assert.rejects(store.save(B.id,booking(client2)),/otro centro/);
 await assert.rejects(store.save(B.id,booking(client1,people[3])),/otro centro/);
 await store.save(B.id,booking(client2,people[3])); // r1 is a different physical room in each centre.
 const slots=await store.slots(B.id,{date:'2031-05-05',serviceId:service.id,employeeId:people[1].id,roomId:'r1'});
 assert.equal(slots.some(s=>s.start==='10:00'),false);assert.ok(slots.some(s=>s.start==='11:00'));
 const results=await Promise.allSettled([store.save(A.id,booking(client1,people[1],{start:'16:00'})),store.save(B.id,booking(client2,people[1],{start:'16:00'}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 const conflicting=await store.requestLeave(B.id,people[1].id,{type:'VACATION',startDate:'2031-05-05',endDate:'2031-05-05',reason:'Vacaciones'});
 await assert.rejects(store.reviewLeave(C.id,conflicting.id,'APPROVED','admin'),/reservas activas/);
 const leave=await store.requestLeave(A.id,people[1].id,{type:'VACATION',startDate:'2031-05-12',endDate:'2031-05-12',reason:'Vacaciones'});
 await store.reviewLeave(C.id,leave.id,'APPROVED','admin');assert.equal((await store.slots(B.id,{date:'2031-05-12',serviceId:service.id,employeeId:people[1].id,roomId:'r1'})).length,0);
});

test('Red: un bono se consume una vez entre sedes y el cobro recibido queda en la caja correcta',async()=>{
 const packages=new Packages(db),inventory=new Inventory(db),cash=new CashRegister(db),actor={id:'desk',name:'Recepción',role:'RECEPTION'};
 const pkg=await packages.create(B.id,client1.id,'desk',{requestKey:randomUUID(),serviceId:service.id,sessionsBought:1,totalAmount:30,paymentMethod:'EFECTIVO',paymentStatus:'PAGADO'});
 await store.save(A.id,booking(client1,people[1],{date:'2031-05-15',packageId:pkg.id}));
 await assert.rejects(store.save(B.id,booking(client1,people[1],{date:'2031-05-16',packageId:pkg.id})),/sesiones disponibles/);
 await cash.open(A.id,actor,{requestKey:randomUUID(),openingAmount:50});await cash.open(B.id,actor,{requestKey:randomUUID(),openingAmount:100});
 const product=await inventory.saveProduct(A.id,{name:'Producto A',price:30,stock:3});
 const sale=await inventory.sell(A.id,'desk',{requestKey:randomUUID(),clientId:client2.id,paymentMode:'PENDING',lines:[{productId:product.id,quantity:1}]});
 assert.equal((await inventory.debtSummary(B.id))[client2.id],30);
 const results=await Promise.allSettled([inventory.pay(A.id,'desk',sale.id,{requestKey:randomUUID(),amount:20,method:'EFECTIVO'}),inventory.pay(B.id,'desk',sale.id,{requestKey:randomUUID(),amount:20,method:'EFECTIVO'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 const paid=await inventory.pay(B.id,'desk',sale.id,{requestKey:randomUUID(),amount:10,method:'EFECTIVO'});assert.equal(paid.outstandingAmount,0);
 const ca=await cash.current(A.id),cb=await cash.current(B.id);assert.equal(ca.session.summary.expectedCash+cb.session.summary.expectedCash,180);
 assert.equal((await inventory.products(A.id))[0].stock,2);assert.equal((await inventory.products(B.id)).length,0);
 await assert.rejects(inventory.reverse(B.id,sale.id,{},true),{status:404});
});

test('Pendientes: solo sesiones libres de bonos activos; cuenta citas de toda la red y reserva recuperaciones',async()=>{
 const now=Date.now(),day=86400000;
 const client=await db.client.create({data:{firstName:'Planificar',lastName:'Sesiones',gymId:A.id,email:randomUUID()+'@example.invalid',phone:'',brand:'TRAINERS_POINT',status:'ACTIVO'}});
 const create=(overrides={})=>db.clientServicePackage.create({data:{clientId:client.id,serviceId:service.id,sessionsBought:5,totalAmount:100,paymentMethod:'OTRO',paymentStatus:'PAGADO',purchasedAt:new Date(now-25*day),...overrides}});
 const active=await create();
 const add=(pkg,attendance,status='CONFIRMADA',extra={})=>db.booking.create({data:{clientId:client.id,serviceId:service.id,packageId:pkg.id,startTime:new Date(now+day),endTime:new Date(now+day+3600000),calendarGymId:B.id,attendance,status,...extra}});
 await add(active,'ASISTIO','COMPLETADA');await add(active,'PENDIENTE');
 const original=await add(active,'CANCELADA','CANCELADA');const recoveryId=randomUUID();
 await pool.query('INSERT INTO calendar.recoveries(gym_id,id,original_id,data) VALUES($1,$2,$3,$4)',[A.id,recoveryId,original.id,{id:recoveryId,clientId:client.id,serviceId:service.id,status:'PENDING',originalId:original.id}]);
 await add(active,'CANCELADA','CANCELADA'); // A normal cancellation makes its session available again.
 const expired=await create({purchasedAt:new Date(now-40*day)}),failed=await create({paymentStatus:'FALLIDO'});
 const lost=await create({sessionsBought:1});await add(lost,'NO_ASISTIO','COMPLETADA');
 const forfeited=await create({sessionsBought:1}),cancelled=await add(forfeited,'CANCELADA','CANCELADA');const lostId=randomUUID();
 await pool.query('INSERT INTO calendar.recoveries(gym_id,id,original_id,data) VALUES($1,$2,$3,$4)',[A.id,lostId,cancelled.id,{id:lostId,clientId:client.id,serviceId:service.id,status:'FORFEITED',originalId:cancelled.id}]);
 const customService=await db.service.create({data:{name:'Bono largo',price:100,durationMin:60,validityWeeks:8}});
 const custom=await create({serviceId:customService.id,purchasedAt:new Date(now-40*day)});
 const privatePackage=await db.clientServicePackage.create({data:{clientId:privateClient.id,serviceId:service.id,sessionsBought:3,totalAmount:90,paymentMethod:'OTRO',paymentStatus:'PAGADO'}});
 const list=await pendingPackages(db,B.id),row=list.find(p=>p.packageId===active.id);
 assert.equal(row.sessionsToSchedule,2);assert.equal(row.sessionsUsed,1);assert.equal(row.sessionsScheduled,1);assert.equal(row.sessionsHeld,1);assert.equal(row.daysRemaining,3);
 for(const id of[expired.id,failed.id,lost.id,forfeited.id,privatePackage.id])assert.equal(list.some(p=>p.packageId===id),false);
 assert.ok(list.some(p=>p.packageId===custom.id));assert.ok((await pendingPackages(db,C.id)).some(p=>p.packageId===privatePackage.id));
 assert.equal(list.filter(p=>p.packageId===active.id).length,1);
 await db.client.update({where:{id:client.id},data:{status:'INACTIVO'}});assert.equal((await pendingPackages(db,B.id)).some(p=>p.clientId===client.id),false);
});

test('Red HTTP: cambiar de sede conserva permisos, permite gestionar la ficha TP y protege Cobosu',async()=>{
 const net=require('node:net'),{spawn}=require('node:child_process');const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const opts=pool.options,url=`postgresql://postgres:${opts.password}@127.0.0.1:${opts.port}/postgres`;
 const child=spawn(process.execPath,['dist/index.js'],{env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:'https://gym.example',DATABASE_URL:url,CALENDAR_DATABASE_URL:url,CALENDAR_ADMIN_TOKEN:randomUUID(),TRAINERS_POINT_DEV_ADMIN:'false'},stdio:['ignore','ignore','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);
 try{
  let ready=false;for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(errors);try{ready=(await fetch(`http://127.0.0.1:${port}/api/health`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,50));}assert.ok(ready,errors);
  const api=(path,token=reception.token,gym=B.id,method='GET',body)=>fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'X-Calendar-Gym':gym,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await api('/api/gyms',trainer.token)).status,200);
  assert.equal((await api('/api/pending-packages')).status,200);
  assert.equal((await api('/api/pending-packages',trainer.token)).status,403);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/pending-packages`)).status,401);
  assert.equal((await api('/api/gyms',trainer.token,B.id,'POST',{name:'No permitido'})).status,403);
  assert.equal((await api(`/api/clients/${client1.id}/progress`)).status,200);
  assert.equal((await api(`/api/clients/${privateClient.id}/progress`)).status,404);
  assert.equal((await api(`/api/clients/${client1.id}/objective`,reception.token,B.id,'PATCH',{objective:'Objetivo compartido'})).status,200);
  assert.equal((await db.client.findUnique({where:{id:client1.id}})).objective,'Objetivo compartido');
  assert.equal((await api(`/api/clients/${client1.id}/objective`,trainer.token,B.id,'PATCH',{objective:'No permitido'})).status,403);
  await store.save(C.id,booking(privateClient,people[1],{date:'2031-06-10',start:'08:00'}));
  const ownClients=(await(await api('/api/clients?all=true&gymId='+C.id,trainer.token)).json()).clients;
  assert.ok(ownClients.some(c=>c.id===client1.id));assert.equal(ownClients.some(c=>c.id===privateClient.id),false); // The old query parameter cannot replace the active workspace or bypass brand scope.
  const self=await api('/api/manage',trainer.token);assert.equal(self.status,200);const own=await self.json();assert.ok(own.employees.every(e=>e.id===people[1].id));
  const created=await api('/api/gyms',admin.token,A.id,'POST',{name:'Nueva sede de prueba',brand:'TRAINERS_POINT'});assert.equal(created.status,201,await created.clone().text());
  const newGym=(await created.json()).gym;
  assert.equal((await api('/api/me',trainer.token,newGym.id)).status,200);
  assert.equal((await api(`/api/clients/${client1.id}/progress`,reception.token,newGym.id)).status,200);
  assert.equal((await pool.query("SELECT count(*)::int n FROM calendar.users WHERE role<>'CLIENT'")).rows[0].n,3);
  const createdClient=await api('/api/clients',reception.token,B.id,'POST',{firstName:'Alta',lastName:'Centro activo',phone:'600000001',email:randomUUID()+'@example.invalid',consentData:new Date().toISOString(),gymId:C.id});
  assert.equal(createdClient.status,201,await createdClient.clone().text());const newClient=(await createdClient.json()).client;assert.equal(newClient.gymId,B.id);
  const pending=await db.clientServicePackage.create({data:{clientId:newClient.id,serviceId:service.id,sessionsBought:1,totalAmount:30,paymentMethod:'OTRO',paymentStatus:'PAGADO'}});
  assert.equal((await(await api('/api/pending-packages')).json()).packages.find(p=>p.packageId===pending.id).sessionsToSchedule,1);
  const saleCount=await db.sale.count(),paymentCount=await db.payment.count();
  const tomorrow=require('luxon').DateTime.now().setZone('Europe/Madrid').plus({days:1}).toISODate();
  const attempts=await Promise.all(['10:00','11:00'].map(start=>api('/api/bookings',reception.token,B.id,'POST',{booking:{clientId:newClient.id,serviceId:service.id,packageId:pending.id,employeeId:people[3].id,roomId:'r1',date:tomorrow,start,status:'CONFIRMED'}})));
  assert.equal(attempts.filter(response=>response.status===201).length,1);assert.equal(attempts.filter(response=>response.status===409).length,1);
  assert.equal((await(await api('/api/pending-packages')).json()).packages.some(p=>p.packageId===pending.id),false);
  assert.equal(await db.sale.count(),saleCount);assert.equal(await db.payment.count(),paymentCount); // Scheduling consumes the existing right; it never sells or charges again.
 }finally{child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}
});
