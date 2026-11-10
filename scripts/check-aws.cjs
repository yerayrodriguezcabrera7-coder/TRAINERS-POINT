require('dotenv/config');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { cognitoConfig } = require('../dist/cloud/cognito');
const { databaseConfig } = require('../dist/cloud/database');
// Strictly offline: reads configuration and files, never calls AWS or PostgreSQL.
let failed = false;
try {
  const config = cognitoConfig();
  console.log(config ? 'Cognito: configuración presente; falta validar con el servicio real.' : 'Cognito: preparado, desactivado. Se conserva el acceso local.');
} catch { console.error('Cognito: revisa COGNITO_ENABLED, COGNITO_USER_POOL_ID y COGNITO_CLIENT_ID.'); failed = true; }
try {
  databaseConfig(process.env.DATABASE_URL);
  console.log(process.env.DATABASE_URL ? 'Base de datos: configuración legible; no se ha conectado ni migrado.' : 'Base de datos: falta configurar DATABASE_URL.');
  if (!process.env.DATABASE_URL) failed = true;
} catch { console.error('Base de datos: revisa la URL, DATABASE_SSL_CA_FILE y el certificado de RDS.'); failed = true; }
try {
  const template = JSON.parse(readFileSync(join(__dirname,'../deploy/aws/api-gateway.json'),'utf8'));
  if (template.Resources.Api.Properties.ProtocolType !== 'HTTP') throw Error();
  console.log('API Gateway: plantilla disponible, sin desplegar.');
} catch { console.error('API Gateway: no se ha podido leer la plantilla.'); failed = true; }
console.log('Amplify y Lambda: opcionales; no instalados ni activados.');
console.log('Comprobación local: no acredita un despliegue en AWS. No se han creado recursos, enviado mensajes ni realizado cobros.');
process.exitCode = failed ? 1 : 0;
