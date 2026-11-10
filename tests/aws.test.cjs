const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, randomUUID } = require('node:crypto');
const { mkdtemp, writeFile, rm, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { rootCertificates } = require('node:tls');
const { spawnSync } = require('node:child_process');
const { SimpleJwksCache } = require('aws-jwt-verify/jwk');
const { cognitoConfig, createCognitoVerifier } = require('../dist/cloud/cognito');
const { databaseConfig } = require('../dist/cloud/database');
const { Store } = require('../dist/calendar/store');
const { Access } = require('../dist/calendar/access');
const { server } = require('../dist/calendar/http');
const { authorize } = require('../dist/http/authorize');
const env = { COGNITO_ENABLED: 'true', COGNITO_USER_POOL_ID: 'eu-south-2_TestPool', COGNITO_CLIENT_ID: 'testclient123' };
const issuer = cognitoConfig(env).issuer;
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
function offlineVerifier() {
  const cache = new SimpleJwksCache({ fetcher: { fetch: async () => { throw Error('Network forbidden in AWS tests'); } } });
  cache.addJwks(`${issuer}/.well-known/jwks.json`, { keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'offline-key', alg: 'RS256', use: 'sig' }] });
  return createCognitoVerifier(env,cache);
}
function jwt(patch = {}, privateKey = keys.privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'offline-key' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: issuer, sub: 'verified-sub', client_id: env.COGNITO_CLIENT_ID,
    token_use: 'access', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, ...patch })).toString('base64url');
  const input = `${header}.${body}`;
  return `${input}.${sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')}`;
}

test('Cognito is disabled by default and malformed opt-in configuration fails closed', () => {
  assert.equal(createCognitoVerifier({}),undefined);
  assert.equal(createCognitoVerifier({ COGNITO_ENABLED: 'false', COGNITO_USER_POOL_ID: 'broken' }),undefined);
  assert.throws(() => cognitoConfig({ COGNITO_ENABLED: 'yes' }),/true o false/);
  assert.throws(() => cognitoConfig({ COGNITO_ENABLED: 'true' }),/Configura/);
  assert.equal(cognitoConfig(env).issuer,issuer);
});

test('Cognito verifies real signatures, issuer, expiry, client ID and access-token type without contacting AWS', async () => {
  const verify = offlineVerifier();
  const identity = await verify(jwt({ 'cognito:groups': ['ADMIN'], email: 'someone@example.invalid' }));
  assert.deepEqual(Object.keys(identity).sort(),['expiresAt','issuer','subject']);
  assert.equal(identity.subject,'verified-sub');
  for (const patch of [{ token_use: 'id', aud: env.COGNITO_CLIENT_ID }, { client_id: 'otherapp' },
    { iss: issuer.replace('TestPool','OtherPool') }, { exp: 1 }, { sub: '' }]) {
    await assert.rejects(verify(jwt(patch)),error => error.status === 401 && !error.message.includes('eyJ'));
  }
  const wrongKey = generateKeyPairSync('rsa',{ modulusLength: 2048 }).privateKey;
  await assert.rejects(verify(jwt({},wrongKey)),{ status: 401 });
  await assert.rejects(verify('not-a-jwt'),{ status: 401 });
});

test('RDS requires a CA and both PostgreSQL drivers retain strict certificate verification', async () => {
  const local = 'postgresql://localhost:55439/postgres?sslmode=disable';
  assert.equal(databaseConfig(local,'').prismaUrl,local);
  assert.throws(() => databaseConfig('postgresql://private.us-east-1.rds.amazonaws.com/db',''),/DATABASE_SSL_CA_FILE/);
  const dir = await mkdtemp(join(tmpdir(),'rds-ca-'));
  try {
    const ca = join(dir,'ca.pem'); await writeFile(ca,rootCertificates[0]);
    const config = databaseConfig('postgresql://private.eu-south-2.rds.amazonaws.com/db?sslmode=no-verify&sslaccept=accept_invalid_certs',ca);
    assert.equal(config.pg.ssl.rejectUnauthorized,true);
    assert.equal(config.pg.ssl.ca,rootCertificates[0]);
    assert.equal(new URL(config.pg.connectionString).searchParams.has('sslmode'),false);
    assert.equal(new URL(config.prismaUrl).searchParams.get('sslaccept'),'strict');
    assert.equal(new URL(config.prismaUrl).searchParams.get('sslcert'),ca);
    assert.equal(new URL(config.prismaUrl).searchParams.get('sslmode'),'require');
  } finally { await rm(dir,{ recursive: true, force: true }); }
});

test('Main API lets Cognito exchange reach its verifier but keeps protected routes authenticated', async () => {
  let checks = 0;
  const context = { calendarAccess: { identify: async () => { checks++; throw Error(); } }, calendarHandler: async () => { checks++; }, currentConfiguredGym: 'gym' };
  assert.equal(await authorize({ headers: {} },{},new URL('http://local/api/cognito/login'),context),false);
  assert.equal(checks,0);
  assert.equal(await authorize({ headers: {} },{},new URL('http://local/api/mobile/calendar'),context),true);
  assert.equal(checks,1);
});

test('Cognito exchange retains existing roles and tenant boundaries, revocation, local passwords and session expiry', async () => {
  const { default: Embedded } = await import('embedded-postgres');
  const { Pool } = require('pg'), net = require('node:net');
  const socket = net.createServer(); await new Promise(r => socket.listen(0,'127.0.0.1',r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  const dir = await mkdtemp(join(tmpdir(),'aws-access-'));
  const pg = new Embedded({ databaseDir: join(dir,'db'), user: 'postgres', password: randomUUID(), port, persistent: false,
    postgresFlags: ['-h','127.0.0.1'], onLog() {}, onError() {} });
  let pool, http, disabled;
  try {
    await pg.initialise(); await pg.start();
    const credentials = pg.getPgClient().connectionParameters;
    pool = new Pool({ host: '127.0.0.1', port, user: credentials.user, password: credentials.password, database: 'postgres' });
    const store = new Store(pool); await store.migrate();
    await pool.query(await readFile(join(__dirname,'../prisma/migrations/20261106000100_optional_cognito/migration.sql'),'utf8'));
    const hours = Array.from({ length: 7 },() => ({ open: '09:00', close: '18:00', closed: false }));
    const gym = randomUUID(), otherGym = randomUUID();
    const config = { timezone: 'Europe/Madrid', schedule: hours, employees: [{ id: 'trainer', name: 'Test', schedule: hours, color: '#123456' }],
      services: [{ id: 'service', name: 'Test', duration: 60, capacity: 1 }], rooms: [{ id: 'room', name: 'Test' }], clients: [{ id: 'client', name: 'Test client', status: 'ACTIVE', email: '', phone: '', notes: '' }] };
    await store.seed(gym,config); await store.seed(otherGym,config);
    const access = new Access(pool);
    await access.save(gym,{ employeeId: 'trainer', username: 'operator', role: 'ADMIN', enabled: true, password: 'LocalPassword123!', mustChangePassword: false });
    await access.save(gym,{ clientId: 'client', username: 'client', role: 'CLIENT', enabled: true, password: 'LocalPassword123!', mustChangePassword: true });
    // The operator's link command is repeatable and never guesses a role/email.
    const subject = randomUUID();
    const dbUrl = new URL('postgresql://127.0.0.1/postgres'); dbUrl.port = String(port); dbUrl.username = credentials.user; dbUrl.password = credentials.password;
    const linkEnv = { PATH: process.env.PATH, DATABASE_URL: dbUrl.href, ...env, COGNITO_LINK_GYM_ID: gym, COGNITO_LINK_USERNAME: 'client', COGNITO_LINK_SUBJECT: subject };
    for (let i=0;i<2;i++) {
      const result = spawnSync(process.execPath,['scripts/link-cognito.cjs'],{ cwd: join(__dirname,'..'),env: linkEnv, encoding: 'utf8' });
      assert.equal(result.status,0,result.stderr);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM calendar.external_identities')).rows[0].n,1);
    http = server(store,gym,'offline-bootstrap-token-long-enough',{ cognito: offlineVerifier() });
    disabled = server(store,gym,'offline-bootstrap-token-long-enough');
    await new Promise(r => http.listen(0,'127.0.0.1',r)); await new Promise(r => disabled.listen(0,'127.0.0.1',r));
    const request = async (path,body,token,selectedGym=gym,host=http) => {
      const response = await fetch(`http://127.0.0.1:${host.address().port}${path}`,{ method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', 'x-calendar-gym': selectedGym, ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: await response.json() };
    };
    const external = { accessToken: jwt({ sub: subject, 'cognito:groups': ['ADMIN'], email: 'operator@example.invalid' }), portal: 'CLIENT' };
    assert.equal((await request('/api/cognito/login',external,null,gym,disabled)).status,503);
    assert.equal((await request('/api/cognito/login',{ ...external,accessToken:'tampered' })).status,401);
    assert.equal((await request('/api/cognito/login',{ accessToken:jwt({sub:randomUUID()}) })).status,403);
    assert.equal((await request('/api/cognito/login',external,null,otherGym)).status,403);
    assert.equal((await request('/api/cognito/login',{...external,portal:'OFFICE'})).status,403);
    const login = await request('/api/cognito/login',external);
    assert.equal(login.status,200); assert.equal(login.data.role,'CLIENT'); assert.equal(login.data.mustChangePassword,false);
    const me = await request('/api/me',null,login.data.token);
    assert.equal(me.data.clientId,'client'); assert.equal(me.data.mustChangePassword,false);
    assert.equal((await request('/api/mobile/calendar',null,login.data.token)).status,403);
    assert.equal((await request('/api/me',null,login.data.token,otherGym)).status,401);
    assert.equal((await request('/api/password/change',{currentPassword:'LocalPassword123!',newPassword:'OtherPassword123!',confirmPassword:'OtherPassword123!'},login.data.token)).status,403);
    const local = await access.login(gym,{username:'client',password:'LocalPassword123!',portal:'CLIENT'});
    assert.equal(local.mustChangePassword,true); // Cognito does not modify the local password or flag.
    await pool.query('UPDATE calendar.users SET enabled=false WHERE id=$1',[me.data.id]);
    assert.equal((await request('/api/me',null,login.data.token)).status,401);
    assert.equal((await request('/api/cognito/login',external)).status,403);
    await pool.query('UPDATE calendar.users SET enabled=true WHERE id=$1',[me.data.id]);
    await pool.query('DELETE FROM calendar.external_identities WHERE user_id=$1',[me.data.id]);
    assert.equal((await request('/api/me',null,login.data.token)).status,401);
    const row = (await pool.query('SELECT expires_at FROM calendar.sessions WHERE external_subject=$1',[subject])).rows[0];
    assert.ok(new Date(row.expires_at).getTime() <= Math.floor(Date.now()/1000)*1000+3600_000);
    await assert.rejects(access.loginWithCognito(gym,{ issuer,subject,expiresAt: Date.now()-1 }),{ status:401 });
  } finally {
    for (const item of [http,disabled]) if (item?.listening) await new Promise(r => item.close(r));
    await pool?.end(); await pg.stop(); await rm(dir,{ recursive:true,force:true });
  }
});
