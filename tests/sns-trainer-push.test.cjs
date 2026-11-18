const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { agendaPushEvent, SnsTrainerPush } = require('../dist/cloud/sns-trainer-push');
const { CreatePlatformEndpointCommand, PublishCommand, SetSubscriptionAttributesCommand, SubscribeCommand, UnsubscribeCommand } = require('@aws-sdk/client-sns');
const { Access } = require('../dist/calendar/access');
const { server } = require('../dist/calendar/http');

const topicArn = 'arn:aws:sns:eu-south-2:704043378842:trainerspoint-avisos';
const appArn = 'arn:aws:sns:eu-south-2:704043378842:app/GCM/trainerspoint';
const now = DateTime.fromISO('2026-11-18T09:00:00', { zone: 'Europe/Madrid' });
const booking = { id: 'booking-1', employeeId: 'trainer-1', date: '2026-11-18', start: '10:00', status: 'CONFIRMED' };

test('agenda push selects only new today and imminent cancellation for the assigned trainer', () => {
  assert.deepEqual(agendaPushEvent(undefined,booking,'Europe/Madrid',now),{kind:'NEW_TODAY',employeeId:'trainer-1',bookingId:'booking-1'});
  assert.equal(agendaPushEvent(booking,{...booking,version:2},'Europe/Madrid',now),null);
  assert.equal(agendaPushEvent(undefined,{...booking,date:'2026-11-19'},'Europe/Madrid',now),null);
  assert.deepEqual(agendaPushEvent(booking,{...booking,status:'CANCELLED'},'Europe/Madrid',now),{kind:'CANCELLED_SOON',employeeId:'trainer-1',bookingId:'booking-1'});
  assert.equal(agendaPushEvent(booking,{...booking,status:'CANCELLED',start:'13:01'},'Europe/Madrid',now),null);
  assert.equal(agendaPushEvent(booking,{...booking,status:'CANCELLED',start:'08:59'},'Europe/Madrid',now),null);
  assert.deepEqual(agendaPushEvent(booking,{...booking,employeeId:'trainer-2'},'Europe/Madrid',now),{kind:'NEW_TODAY',employeeId:'trainer-2',bookingId:'booking-1'});
});

test('SNS device subscription filters by gym and trainer; publication contains no client details', async () => {
  const calls=[]; const rows=[];
  const pool={query:async(sql,args)=>{
    if(sql.startsWith('SELECT')) return {rows:rows.filter(r=>r.token_hash===args[0])};
    if(sql.startsWith('INSERT')) {rows.push({token_hash:args[0],gym_id:args[1],employee_id:args[2],subscription_arn:args[5]});return {rows:[]};}
    if(sql.startsWith('DELETE')) {rows.length=0;return {rows:[]};}
    throw Error(sql);
  }};
  const sns={send:async(command)=>{
    calls.push(command);
    if(command instanceof CreatePlatformEndpointCommand) return {EndpointArn:'arn:endpoint'};
    if(command instanceof SubscribeCommand) return {SubscriptionArn:'arn:subscription'};
    return {};
  }};
  const push=new SnsTrainerPush(pool,{topicArn,androidArn:appArn},sns);
  await push.register('gym-1','trainer-1','android','device-token-123456789');
  assert.equal(calls[0].input.PlatformApplicationArn,appArn);
  assert.deepEqual(JSON.parse(calls[1].input.Attributes.FilterPolicy),{gymId:['gym-1'],employeeId:['trainer-1']});
  assert.ok(calls[2] instanceof SetSubscriptionAttributesCommand);
  await push.register('gym-1','trainer-1','android','device-token-123456789');
  assert.equal(calls.length,3);
  await push.publish('gym-1',{kind:'NEW_TODAY',employeeId:'trainer-1',bookingId:'booking-1'});
  const published=calls.find(c=>c instanceof PublishCommand).input;
  assert.equal(published.TopicArn,topicArn);
  assert.equal(published.MessageAttributes.employeeId.StringValue,'trainer-1');
  assert.equal(published.MessageAttributes.gymId.StringValue,'gym-1');
  assert.deepEqual(JSON.parse(published.Message).GCM && JSON.parse(JSON.parse(published.Message).GCM).fcmV1Message.message.notification,{title:'Nueva cita hoy',body:'Abre la agenda para consultar el cambio.'});
  assert.ok(!published.Message.includes('client'));
  await push.unregister('gym-1','trainer-1','android','device-token-123456789');
  assert.ok(calls.at(-1) instanceof UnsubscribeCommand);
});

test('push registration API binds a device to the authenticated trainer and rejects clients', async () => {
  const originalIdentify=Access.prototype.identify;
  const originalSetup=Access.prototype.needsSetup;
  const registrations=[];
  Access.prototype.needsSetup=async()=>false;
  Access.prototype.identify=async(_gym,token)=>({id:token,role:token==='client'?'CLIENT':'TRAINER',employeeId:token==='client'?null:'assigned-trainer',clientId:token==='client'?'client-1':null,mustChangePassword:false});
  const store={pool:{},gymExists:async()=>true,trainerPush:{supports:()=>true,register:async(...args)=>registrations.push(args),unregister:async()=>{}}};
  const http=server(store,'gym','long-bootstrap-token-123456789012345');
  try {
    await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${http.address().port}/api/mobile/push`;
    const payload={platform:'android',token:'device-token-123456789',employeeId:'forged-trainer'};
    const trainer=await fetch(url,{method:'POST',headers:{authorization:'Bearer trainer','content-type':'application/json'},body:JSON.stringify(payload)});
    assert.equal(trainer.status,200);
    assert.deepEqual(registrations,[['gym','assigned-trainer','android','device-token-123456789']]);
    const client=await fetch(url,{method:'POST',headers:{authorization:'Bearer client','content-type':'application/json'},body:JSON.stringify(payload)});
    assert.equal(client.status,403);
    assert.equal(registrations.length,1);
  } finally {
    Access.prototype.identify=originalIdentify;
    Access.prototype.needsSetup=originalSetup;
    await new Promise(resolve=>http.close(resolve));
  }
});
