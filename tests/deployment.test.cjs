const {test}=require('node:test'),assert=require('node:assert/strict'),{runtimeConfig}=require('../dist/runtime-config');
test('Producción: exige dominio HTTPS, clave propia y una base compartida; impide cuentas provisionales',()=>{
 const env={NODE_ENV:'production',PUBLIC_ORIGIN:'https://centro.example',DATABASE_URL:'postgresql://host/db',CALENDAR_ADMIN_TOKEN:'x'.repeat(40)};
 assert.equal(runtimeConfig(env).host,'0.0.0.0');assert.equal(runtimeConfig({}).host,'127.0.0.1');
 for(const patch of [{PUBLIC_ORIGIN:undefined},{PUBLIC_ORIGIN:'http://centro.example'},{CALENDAR_ADMIN_TOKEN:'short'},{TRAINERS_POINT_DEV_ADMIN:'true'},{CALENDAR_DATABASE_URL:'postgresql://other/db'},{PORT:'wrong'}])assert.throws(()=>runtimeConfig({...env,...patch}));
});
