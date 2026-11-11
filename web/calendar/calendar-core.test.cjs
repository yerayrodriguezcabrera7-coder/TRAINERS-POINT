const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./calendar-core.js');
const schedule = Array.from({length:7},(_,i)=>({open:'09:00',close:'21:00',closed:i===6}));
const base = {id:'one',date:'2026-10-22',start:'10:00',end:'11:00',employeeId:'e1',roomId:'r1',status:'confirmed'};
test('Admite una reserva dentro del horario',()=>assert.equal(C.validateBooking(base,[],schedule),''));
test('Rechaza horas invertidas o iguales',()=>{for(const end of ['09:00','10:00'])assert.match(C.validateBooking({...base,end},[],schedule),/posterior/);});
test('Rechaza fechas inexistentes y horas inválidas',()=>{assert.match(C.validateBooking({...base,date:'2026-02-30'},[],schedule),/válidas/);assert.match(C.validateBooking({...base,start:'25:00'},[],schedule),/válidas/);});
test('Rechaza reservas fuera del horario y en domingo si tienen trabajador asignado',()=>{assert.match(C.validateBooking({...base,start:'08:30'},[],schedule),/apertura/);assert.match(C.validateBooking({...base,date:'2026-10-25'},[],schedule),/apertura/);});
test('Permite reservas sin asignar en domingo para reubicar después',()=>{assert.equal(C.validateBooking({...base,date:'2026-10-25',employeeId:null,status:'pending'},[],schedule),'');});
test('Detecta solapamiento de entrenador',()=>assert.match(C.validateBooking({...base,id:'two',roomId:'r2'},[base],schedule),/entrenador/));
test('Permite citas simultáneas con distintos entrenadores sin bloqueo de sala',()=>{assert.equal(C.validateBooking({...base,id:'two',employeeId:'e2'},[base],schedule),'');});
test('Permite citas consecutivas y simultáneas con recursos distintos',()=>{assert.equal(C.validateBooking({...base,id:'two',start:'11:00',end:'12:00'},[base],schedule),'');assert.equal(C.validateBooking({...base,id:'two',employeeId:'e2',roomId:'r2'},[base],schedule),'');});
test('Editar una reserva no colisiona consigo misma',()=>assert.equal(C.validateBooking({...base,end:'11:30'},[base],schedule),''));
test('Canceladas liberan el horario y pueden cancelarse fuera de apertura',()=>{assert.equal(C.validateBooking({...base,id:'two'},[{...base,status:'cancelled'}],schedule),'');assert.equal(C.validateBooking({...base,status:'cancelled',date:'2026-10-25'},[],schedule),'');});
test('Reactivar una cita cancelada vuelve a validar disponibilidad',()=>assert.match(C.validateBooking({...base,id:'two',status:'pending'},[base],schedule),/entrenador/));
test('Fechas estables en cambio de año, febrero y horario de invierno',()=>{assert.equal(C.addDays('2026-12-31',1),'2027-01-01');assert.equal(C.addDays('2028-02-28',1),'2028-02-29');assert.equal(C.addDays('2026-10-24',2),'2026-10-26');assert.equal(C.monday('2026-10-25'),'2026-10-19');});
test('Distribuye citas superpuestas y recupera ancho en el siguiente grupo',()=>{const out=C.layoutEvents([base,{...base,id:'two',start:'10:30',end:'11:30'},{...base,id:'three',start:'12:00',end:'13:00'}]);assert.deepEqual(out.map(({lane,count})=>[lane,count]),[[0,2],[1,2],[0,1]]);});
test('Límite de reservas por hora en el centro: rechaza si se supera el aforo y permite si hay hueco',()=>{
  const centers = [{ id: 'center-1', name: 'Centro 1', maxBookingsPerHour: 2 }, { id: 'center-2', name: 'Centro 2', maxBookingsPerHour: null }];
  const b1 = { ...base, id: 'b1', centerId: 'center-1', employeeId: 'e1', roomId: 'r1', start: '10:00', end: '11:00' };
  const b2 = { ...base, id: 'b2', centerId: 'center-1', employeeId: 'e2', roomId: 'r2', start: '10:00', end: '11:00' };
  const b3 = { ...base, id: 'b3', centerId: 'center-1', employeeId: 'e3', roomId: 'r3', start: '10:00', end: '11:00' };
  const bDifferentCenter = { ...base, id: 'b4', centerId: 'center-2', employeeId: 'e4', roomId: 'r4', start: '10:00', end: '11:00' };
  // 1 booking exists, second allowed
  assert.equal(C.validateBooking(b2, [b1], schedule, centers), '');
  // 2 bookings exist in center-1, third is rejected with hourly limit message
  assert.match(C.validateBooking(b3, [b1, b2], schedule, centers), /límite máximo de 2 reservas por hora/i);
  // bDifferentCenter in center-2 is allowed even though center-1 is full
  assert.equal(C.validateBooking(bDifferentCenter, [b1, b2], schedule, centers), '');
  // Cancelled booking does not count
  assert.equal(C.validateBooking(b3, [b1, { ...b2, status: 'cancelled' }], schedule, centers), '');
});
