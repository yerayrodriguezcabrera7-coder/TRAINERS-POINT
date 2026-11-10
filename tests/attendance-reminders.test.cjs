const {test}=require('node:test');const assert=require('node:assert/strict');
const {attendanceCsv}=require('../dist/calendar/attendance-export');
const {prepareReminder}=require('../dist/reminders/worker');
const {configuredProvider,DeliveryError}=require('../dist/reminders/provider');
test('CSV: Excel UTF-8, fórmulas neutralizadas, jornada nocturna, cambio horario y abiertos sin total inventado',()=>{
 const report={timezone:'Europe/Madrid',from:'2026-10-25',to:'2026-10-25',employees:[{id:'e1',name:'=SUM(1;2)'},{id:'e2',name:'María; "López"'}],records:[{id:'a',employeeId:'e1',clockIn:'2026-10-24T21:00:00Z',clockOut:'2026-10-25T03:00:00Z'},{id:'b',employeeId:'e2',clockIn:'2026-10-25T09:00:00Z',clockOut:null}]};
 const csv=attendanceCsv(report);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/'=SUM/);assert.match(csv,/María; ""López""/);assert.match(csv,/06:00:00/);assert.match(csv,/05:00:00/);assert.match(csv,/En curso: pendiente de salida/);assert.match(csv,/\+02:00/);assert.match(csv,/\+01:00/);
 assert.equal(csv.split('\r\n').length,4);
});
const row=()=>({gym_id:'g',id:'b',data:{date:'2026-03-29',start:'10:00',status:'CONFIRMED',employeeId:'e'},config:{timezone:'Europe/Madrid',employees:[{id:'e',name:'Luis'}]},client_name:'Ana',phone:'+34 600 000 000',preference:'SMS',service_name:'Fuerza',employee_name:null});
test('Recordatorio: día anterior a la misma hora local, no exactamente 24 h en cambio de horario',()=>{
 const r=row();assert.ok(prepareReminder(r,new Date('2026-03-28T09:00:00Z')));assert.equal(prepareReminder(r,new Date('2026-03-28T08:00:00Z')),null);
 for (const status of ['CANCELLED','COMPLETED','NO_SHOW'])assert.equal(prepareReminder({...r,data:{...r.data,status}},new Date('2026-03-28T09:00:00Z')),null);
 assert.equal(prepareReminder({...r,preference:'EMAIL'},new Date('2026-03-28T09:00:00Z')),null);
 assert.equal(prepareReminder({...r,phone:'600000000'},new Date('2026-03-28T09:00:00Z')),null);
 assert.equal(prepareReminder(r,new Date('2026-03-28T12:00:00Z')),null);
});
const settings={REMINDERS_ENABLED:'true',REMINDERS_ALLOW_SEND:'true',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fake-token-for-test',TWILIO_SMS_FROM:'+34611111111',TWILIO_WHATSAPP_FROM:'+34622222222',TWILIO_WHATSAPP_CONTENT_SID:'HX'+'b'.repeat(32)};
test('Proveedor: desactivado por defecto; WhatsApp usa plantilla y SMS texto; ninguna llamada real',async()=>{
 assert.equal(configuredProvider({}),null);assert.equal(configuredProvider({...settings,REMINDERS_ALLOW_SEND:'false'}),null);
 const calls=[];const provider=configuredProvider(settings,async(url,options)=>{calls.push({url,body:options.body});return new Response(JSON.stringify({sid:'SM-test'}),{status:201});});
 const m=prepareReminder(row(),new Date('2026-03-28T09:00:00Z')).message;
 await provider.send(m);await provider.send({...m,channel:'WHATSAPP'});
 assert.match(calls[0].body.get('Body'),/Ana.*29\/03\/2026.*10:00.*Fuerza.*Luis/);
 assert.equal(calls[1].body.get('To'),'whatsapp:+34600000000');assert.equal(calls[1].body.has('Body'),false);assert.equal(JSON.parse(calls[1].body.get('ContentVariables'))['5'],'Luis');
});
test('Proveedor: 429 permite reintentar; timeout y 500 se guardan como resultado desconocido',async()=>{
 const message=prepareReminder(row(),new Date('2026-03-28T09:00:00Z')).message;
 for(const [code,outcome] of [[429,'RETRY'],[400,'FAILED'],[500,'UNKNOWN']])await assert.rejects(configuredProvider(settings,async()=>new Response('{}',{status:code})).send(message),e=>e instanceof DeliveryError&&e.outcome===outcome);
 await assert.rejects(configuredProvider(settings,async()=>{throw Error('timeout');}).send(message),e=>e.outcome==='UNKNOWN');
});
