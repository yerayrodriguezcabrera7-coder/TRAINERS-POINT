const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {mkdtemp,readdir,readFile}=require('node:fs/promises');const {tmpdir}=require('node:os');const {join}=require('node:path');const {Pool}=require('pg');const {PrismaClient}=require('@prisma/client');const {savePlan,planAccess,routineOnDate,planInput}=require('../dist/training/plans');let pg,pool,db;
before(async()=>{const {default:Embedded}=await import('embedded-postgres');const net=require('node:net'),socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const password=randomUUID();pg=new Embedded({databaseDir:join(await mkdtemp(join(tmpdir(),'inventory-test-')),'db'),user:'postgres',password,port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});await pg.initialise();await pg.start();pool=new Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres'});for(const dir of (await readdir('prisma/migrations')).sort()){if(!/^\d+_/.test(dir))continue;const sql=await readFile(join('prisma/migrations',dir,'migration.sql'),'utf8');await pool.query(sql);}db=new PrismaClient({datasources:{db:{url:`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`}}});});
after(async()=>{await db?.$disconnect();await pool?.end();await pg?.stop();});
const actor={id:'trainer-account',name:'Entrenador',role:'TRAINER',employeeId:'e1'};
function input(extra={}){return {id:randomUUID(),name:'Fase de fuerza',goals:'Ganar fuerza',startsAt:'2030-01-01',endsAt:'2030-03-01',status:'ACTIVO',days:[{name:'Tren superior',weekday:1,exercises:[{name:'Remo',sets:3,repetitions:'12 repeticiones',rest:'60 s',load:'10 kg',notes:'Controlar el movimiento'}]}],...extra};}
async function fixture(){const gym=await db.gym.create({data:{name:randomUUID()}});const client=await db.client.create({data:{firstName:'Cliente',lastName:'Rutina',email:randomUUID()+'@example.com',phone:'',gymId:gym.id}});return {gym:gym.id,client:client.id};}
test('Rutina semanal: fecha de cita, domingo, límites y plan no vigente',()=>{
 const p=input();p.details={days:p.days};assert.equal(routineOnDate(p,'2030-01-07').length,1);assert.equal(routineOnDate(p,'2030-01-08').length,0);
 assert.equal(routineOnDate(p,'2029-12-31').length,0);assert.equal(routineOnDate(p,'2030-03-04').length,0);
 p.details.days[0].weekday=7;assert.equal(routineOnDate(p,'2030-01-06').length,1);
 assert.equal(routineOnDate({...p,status:'ARCHIVADO'},'2030-01-06').length,0);
 assert.throws(()=>planInput.parse(input({endsAt:'2029-01-01'})));assert.throws(()=>planInput.parse(input({startsAt:'2030-02-30'})));assert.throws(()=>planInput.parse(input({days:[]})));
});
test('Persistencia, planes previos y conflicto al editar una versión antigua',async()=>{
 const f=await fixture();const a=await savePlan(db,f.gym,f.client,actor,input());
 assert.equal((await db.trainingPlan.findUnique({where:{id:a.id}})).details.days[0].exercises[0].load,'10 kg');
 const raw=input({id:a.id,updatedAt:a.updatedAt.toISOString(),name:'Fase revisada'});const edited=await savePlan(db,f.gym,f.client,actor,raw);
 assert.equal(edited.name,'Fase revisada');await assert.rejects(savePlan(db,f.gym,f.client,actor,raw),/ha cambiado/);
 const b=await savePlan(db,f.gym,f.client,actor,input());assert.equal((await db.trainingPlan.findUnique({where:{id:a.id}})).status,'ARCHIVADO');
 assert.equal(await db.trainingPlan.count({where:{clientId:f.client,status:'ACTIVO'}}),1);
 const other=await fixture();await assert.rejects(savePlan(db,other.gym,other.client,actor,input({id:b.id,updatedAt:b.updatedAt.toISOString()})),/desconocido/);
 await assert.rejects(savePlan(db,other.gym,f.client,actor,input()),/desconocido/);
});
test('Activaciones concurrentes dejan un solo plan activo y preservan ambos',async()=>{
 const f=await fixture();await Promise.all([savePlan(db,f.gym,f.client,actor,input()),savePlan(db,f.gym,f.client,actor,input())]);
 assert.equal(await db.trainingPlan.count({where:{clientId:f.client}}),2);assert.equal(await db.trainingPlan.count({where:{clientId:f.client,status:'ACTIVO'}}),1);
});
test('Permisos: entrenador vinculado, recepción consulta, aislamiento entre centros',async()=>{
 const f=await fixture();const admin={...actor,role:'ADMIN'};await planAccess(db,undefined,f.gym,f.client,admin,true);
 await planAccess(db,undefined,f.gym,f.client,{...actor,role:'RECEPTION'},false);
 await assert.rejects(planAccess(db,undefined,f.gym,f.client,{...actor,role:'RECEPTION'},true),/Solo/);
 await assert.rejects(planAccess(db,undefined,f.gym,f.client,{...actor,role:'CLIENT'},false),/Solo/);
 await assert.rejects(planAccess(db,undefined,f.gym,f.client,actor,true),/propios/);
 const assignedPool={query:async(sql,params)=>{assert.equal(params[1],actor.employeeId);assert.match(sql,/CANCELLED/);return {rowCount:1};}};
 await planAccess(db,assignedPool,f.gym,f.client,actor,true);
 await assert.rejects(planAccess(db,assignedPool,randomUUID(),f.client,admin,false),/centro/);
});
test('Interfaz: crea días y ejercicios, guarda y abre la rutina sin salir del calendario',async()=>{
 const {JSDOM}=require('jsdom');const fs=require('node:fs');const clientId=randomUUID();let payload;let saved=null;
 const dom=new JSDOM('<section id="training-plans"></section>',{url:`http://localhost/clientes/${clientId}/ficha`,runScripts:'outside-only'});const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.fetch=async(url,opts={})=>{
  if(opts.method==='POST'){payload=JSON.parse(opts.body);saved={...payload,details:{days:payload.days},updatedAt:new Date().toISOString()};return {ok:true,json:async()=>({plan:saved})};}
  return {ok:true,json:async()=>({plans:saved?[saved]:[],active:saved,canEdit:true,days:saved?.days||[]})};
 };
 const wait=()=>new Promise(r=>setTimeout(r,20));
 try{w.eval(fs.readFileSync('web/shared/training-plans.js','utf8'));await wait();
 const click=text=>{const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);b.click();};
 click('＋ Crear nuevo plan');const form=w.document.querySelector('form');
 const field=(text)=>[...form.querySelectorAll('label')].find(l=>l.firstChild.textContent===text).querySelector('input,select,textarea');
 field('Nombre del plan').value='Rutina semanal';field('Fecha de inicio').value='2030-01-01';field('Ejercicio').value='Remo';field('Repeticiones o tiempo').value='12';
 form.dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(payload.days[0].exercises[0].sets,3);assert.equal(payload.name,'Rutina semanal');assert.match(w.document.querySelector('#training-plans').textContent,/Rutina semanal/);
 await w.TrainersPoint.openTrainingPlan(clientId,'2030-01-07');assert.match(w.document.querySelector('dialog').textContent,/Remo/);assert.match(w.document.querySelector('dialog').textContent,/07\/01\/2030/);
 }finally{w.close();}
});
