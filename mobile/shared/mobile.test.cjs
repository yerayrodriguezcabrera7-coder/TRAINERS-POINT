const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require(require.resolve('typescript', { paths: [process.cwd()] }));
// Compile only shared modules in memory; no native runtime or real backend required.
require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(compiled.outputText, filename);
};
const { ApiClient } = require('./api.ts');
const { apiBaseUrl } = require('./config.ts');
const { upcomingBookings } = require('./calendar.ts');
const { mobileCognito, CognitoPasswordRequired } = require('./cognito.ts');
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function capture(result = {}) {
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, ...options, body: options.body ? JSON.parse(options.body) : null }); return json(result); };
  return calls;
}

test('Cognito is opt-in and only accepts a public app client configuration', () => {
  assert.equal(mobileCognito(),undefined);
  assert.equal(mobileCognito('local'),undefined);
  assert.throws(() => mobileCognito('unknown'),/local o cognito/);
  assert.throws(() => mobileCognito('cognito'),/Falta configurar/);
});

test('Cognito login exchanges the access token without sending passwords or AWS tokens to calendar endpoints', async () => {
  const calls = [], saved = [];
  global.fetch = async (url,options) => {
    calls.push({url,...options,body:JSON.parse(options.body)});
    return json(calls.length === 1 ? { AuthenticationResult:{AccessToken:'verified-access-token',IdToken:'unused-id-token'} } :
      { token:'local-session',role:'TRAINER',mustChangePassword:false });
  };
  const api = new ApiClient({baseUrl:'https://gym.example',cognito:mobileCognito('cognito','eu-south-2_TestPool','testclient123'),setToken:async t=>saved.push(t)});
  await api.login({username:'worker',password:'PersonalPassword123!',portal:'TRAINER'});
  assert.equal(calls[0].url,'https://cognito-idp.eu-south-2.amazonaws.com/');
  assert.equal(calls[0].body.AuthFlow,'USER_PASSWORD_AUTH');
  assert.equal(calls[0].body.AuthParameters.PASSWORD,'PersonalPassword123!');
  assert.equal(calls[1].url,'https://gym.example/api/cognito/login');
  assert.deepEqual(calls[1].body,{accessToken:'verified-access-token',portal:'TRAINER'});
  assert.deepEqual(saved,[null,'local-session']);
});

test('Cognito provisional password challenge creates no local session until completed', async () => {
  const calls = [], saved = [];
  global.fetch = async (url,options) => {
    calls.push({url,...options,body:JSON.parse(options.body)});
    return json(calls.length===1 ? {ChallengeName:'NEW_PASSWORD_REQUIRED',Session:'challenge-session',ChallengeParameters:{requiredAttributes:'[]',USER_ID_FOR_SRP:'canonical-user'}} :
      calls.length===2 ? {AuthenticationResult:{AccessToken:'new-access'}} : {token:'local-session',role:'CLIENT',mustChangePassword:false});
  };
  const api = new ApiClient({baseUrl:'https://gym.example',cognito:mobileCognito('cognito','eu-south-2_TestPool','testclient123'),setToken:async t=>saved.push(t)});
  await assert.rejects(api.login({username:'client',password:'Temporary123!',portal:'CLIENT'}),CognitoPasswordRequired);
  assert.deepEqual(saved,[null]); assert.equal(calls.length,1);
  await assert.rejects(api.changePassword('Temporary123!','different','not matching'),/repítela/);
  assert.equal(calls.length,1);
  await api.changePassword('Temporary123!','NewPassword123!','NewPassword123!');
  assert.equal(calls[1].headers['X-Amz-Target'],'AWSCognitoIdentityProviderService.RespondToAuthChallenge');
  assert.deepEqual(calls[1].body.ChallengeResponses,{USERNAME:'canonical-user',NEW_PASSWORD:'NewPassword123!'});
  assert.equal(calls[2].body.portal,'CLIENT'); assert.deepEqual(saved,[null,'local-session']);
});

test('Rejected Cognito tokens never create a local session or fall back to password login', async () => {
  const calls = [], saved = [];
  global.fetch = async (url,options) => {
    calls.push(url);
    return calls.length===1 ? json({AuthenticationResult:{AccessToken:'unlinked'}}) : json({error:'Cuenta no vinculada'},403);
  };
  const api = new ApiClient({baseUrl:'https://gym.example',cognito:mobileCognito('cognito','eu-south-2_TestPool','testclient123'),setToken:async t=>saved.push(t)});
  await assert.rejects(api.login({username:'client',password:'Secret',portal:'CLIENT'}),/no vinculada/);
  assert.deepEqual(saved,[null]); assert.equal(calls.length,2);
  assert.equal(calls.includes('https://gym.example/api/login'),false);
});

test('Cognito reports unsupported verification and authentication failures without exposing AWS responses', async () => {
  const cognito = mobileCognito('cognito','eu-south-2_TestPool','testclient123');
  global.fetch = async () => json({ChallengeName:'SOFTWARE_TOKEN_MFA',Session:'private'});
  await assert.rejects(cognito.login('user','password'),/verificación adicional/);
  assert.equal(cognito.hasPasswordChallenge(),false);
  global.fetch = async () => json({__type:'NotAuthorizedException',message:'private AWS diagnostic'},400);
  await assert.rejects(cognito.login('user','password'),error => /incorrectos/.test(error.message) && !/private/.test(error.message));
});

test('iPhone and Android use the correct local host, and secrets cannot be embedded in the URL', () => {
  assert.equal(apiBaseUrl('ios'), 'http://127.0.0.1:3000');
  assert.equal(apiBaseUrl('android'), 'http://10.0.2.2:3000');
  assert.equal(apiBaseUrl('web'), '');
  assert.equal(apiBaseUrl('ios', 'https://gym.example/'), 'https://gym.example');
  assert.throws(() => apiBaseUrl('ios', 'https://user:secret@gym.example'));
  assert.throws(() => apiBaseUrl('ios', 'file:///private/data'));
});

test('login does not attach a stale session and stores the new token', async () => {
  const calls = capture({ token: 'new-token', role: 'CLIENT', mustChangePassword: false });
  let saved;
  const api = new ApiClient({ baseUrl: 'https://gym.example/', getToken: async () => 'old-token', setToken: async value => { saved = value; } });
  await api.login({ username: 'example', password: 'example', portal: 'CLIENT' });
  assert.equal(calls[0].headers.has('Authorization'), false);
  assert.equal(calls[0].headers.has('x-calendar-gym'), false);
  assert.equal(saved, 'new-token');
});

test('an expired session clears the token and informs the app', async () => {
  global.fetch = async () => json({ error: 'Sesión caducada' }, 401);
  let token = 'expired', notified = false;
  const api = new ApiClient({ baseUrl: 'https://gym.example', setToken: async value => { token = value; }, onUnauthorized: () => { notified = true; } });
  await assert.rejects(api.getMe(), /Sesión caducada/);
  assert.equal(token, null);
  assert.equal(notified, true);
});

test('logout clears local credentials even without a network', async () => {
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  let token = 'session';
  const api = new ApiClient({ baseUrl: 'https://gym.example', setToken: async value => { token = value; } });
  await assert.rejects(api.logout(), /No se puede conectar/);
  assert.equal(token, null);
});

test('slow requests terminate instead of leaving the login spinner forever', async () => {
  global.fetch = (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  const api = new ApiClient({ baseUrl: 'https://gym.example', timeoutMs: 10 });
  await assert.rejects(api.getMe(), /tarda demasiado/);
});

test('a web page returned instead of JSON is reported clearly', async () => {
  global.fetch = async () => new Response('<html>Wrong port</html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(new ApiClient({ baseUrl: 'https://gym.example' }).getMe(), /no devuelve una respuesta de la API/);
});

test('client reservations use the client endpoint with all resource IDs', async () => {
  const calls = capture({ id: 'reservation' });
  const api = new ApiClient({ baseUrl: 'https://gym.example', gymId: 'actual-centre', getToken: async () => 'session' });
  const booking = { date: '2026-11-20', start: '10:00', employeeId: 'worker', roomId: 'room', serviceId: 'service' };
  await api.createBooking(booking);
  assert.equal(calls[0].url, 'https://gym.example/api/client-calendar');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, booking);
  assert.equal(calls[0].headers.get('x-calendar-gym'), 'actual-centre');
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer session');
});

test('availability includes trainer, room and service; agenda uses reservations, not free slots', async () => {
  const calls = capture([]), api = new ApiClient({ baseUrl: 'https://gym.example' });
  await api.getClientSlots({ date: '2026-11-20', employeeId: 'worker', roomId: 'room', serviceId: 'service' });
  const query = new URL(calls[0].url).searchParams;
  assert.equal(query.get('employeeId'), 'worker');
  assert.equal(query.get('roomId'), 'room');
  assert.equal(query.get('serviceId'), 'service');
  await api.getStaffCalendar();
  assert.equal(calls[1].url, 'https://gym.example/api/mobile/calendar');
});

test('worker attendance retains the booking version for concurrent change protection', async () => {
  const calls = capture(), api = new ApiClient({ baseUrl: 'https://gym.example' });
  await api.completeWorkerBooking('booking', 4);
  assert.equal(calls[0].url, 'https://gym.example/api/bookings/booking/worker-action');
  assert.deepEqual(calls[0].body, { action: 'COMPLETE', version: 4 });
  await api.getClientDetail('client');
  assert.equal(calls[1].url, 'https://gym.example/api/clients/client/progress');
});

test('the agenda excludes cancelled, finished and past sessions and sorts upcoming ones', () => {
  const now = new Date(2026, 10, 6, 12, 0);
  const make = (id, date, start, end, status) => ({ id, date, start, end, status });
  const bookings = [
    make('next', '2026-11-07', '10:00', '11:00', 'CONFIRMED'),
    make('cancelled', '2026-11-07', '10:00', '11:00', 'CANCELLED'),
    make('past', '2026-11-06', '10:00', '11:00', 'CONFIRMED'),
    make('today', '2026-11-06', '13:00', '14:00', 'PENDING'),
    make('completed', '2026-11-06', '13:00', '14:00', 'COMPLETED'),
  ];
  assert.deepEqual(upcomingBookings({ bookings }, now).map(booking => booking.id), ['today', 'next']);
  assert.deepEqual(upcomingBookings(null, now), []);
});

test('non-API requests preserve Metro next middleware instead of crashing the dev server', () => {
  const apiProxy = require('./metro-api-proxy.cjs');
  let delegated = false;
  apiProxy((req, res, next) => next())({ url: '/favicon.ico' }, {}, () => { delegated = true; });
  assert.equal(delegated, true);
});

test('local web API proxy forwards auth and rejects foreign browser origins', async t => {
  const http = require('node:http');
  const apiProxy = require('./metro-api-proxy.cjs');
  let received;
  const backend = http.createServer((req, res) => {
    received = req.headers;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await listen(backend);
  t.after(() => { backend.closeAllConnections(); backend.close(); });
  const proxy = http.createServer(apiProxy((req, res) => res.end('app'), `http://127.0.0.1:${backend.address().port}`));
  await listen(proxy);
  t.after(() => { proxy.closeAllConnections(); proxy.close(); });
  const url = `http://127.0.0.1:${proxy.address().port}`;
  const response = await realFetch(`${url}/api/me`, { headers: { Authorization: 'Bearer demo-token', Origin: url } });
  assert.equal(response.status, 200);
  assert.equal(received.authorization, 'Bearer demo-token');
  assert.equal(received.origin, `http://127.0.0.1:${backend.address().port}`);
  assert.equal((await realFetch(`${url}/api/me`, { headers: { Origin: 'https://foreign.example' } })).status, 403);
});
