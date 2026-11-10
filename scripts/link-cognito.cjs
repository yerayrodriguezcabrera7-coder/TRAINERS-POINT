require('dotenv/config');
const { Pool } = require('pg');
const { cognitoConfig } = require('../dist/cloud/cognito');
const { databaseConfig } = require('../dist/cloud/database');

async function main() {
  const config = cognitoConfig({ ...process.env, COGNITO_ENABLED: 'true' });
  const gym = process.env.COGNITO_LINK_GYM_ID?.trim();
  const username = process.env.COGNITO_LINK_USERNAME?.trim().toLowerCase();
  const subject = process.env.COGNITO_LINK_SUBJECT?.trim();
  if (!gym || !username || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subject || ''))
    throw Error('Indica COGNITO_LINK_GYM_ID, COGNITO_LINK_USERNAME y COGNITO_LINK_SUBJECT (el sub verificado en Cognito).');
  if (!process.env.DATABASE_URL) throw Error('Configura DATABASE_URL antes de vincular una cuenta.');
  const pool = new Pool(databaseConfig(process.env.DATABASE_URL).pg), db = await pool.connect();
  try {
    await db.query('BEGIN');
    const user = (await db.query('SELECT id FROM calendar.users WHERE gym_id=$1 AND username=$2 AND enabled FOR UPDATE', [gym,username])).rows[0];
    if (!user) throw Error('No existe una cuenta habilitada con ese usuario en el centro indicado. No se ha creado ni modificado ninguna cuenta.');
    await db.query(`INSERT INTO calendar.external_identities(gym_id,issuer,subject,user_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(gym_id,issuer,subject) DO NOTHING`, [gym,config.issuer,subject,user.id]);
    const link = (await db.query('SELECT user_id FROM calendar.external_identities WHERE gym_id=$1 AND issuer=$2 AND subject=$3', [gym,config.issuer,subject])).rows[0];
    if (link?.user_id !== user.id) throw Error('Esta identidad ya está vinculada a otra cuenta. Revisa la vinculación antes de cambiarla.');
    await db.query('COMMIT');
    console.log('Cuenta vinculada. Se conservan su rol y sus permisos; no se ha contactado con AWS.');
  } catch (error) {
    await db.query('ROLLBACK');
    if (error.code === '23505') throw Error('Esta cuenta ya tiene otra identidad de Cognito vinculada. Revisa la vinculación existente.');
    throw error;
  } finally { db.release(); await pool.end(); }
}
if (require.main === module) main().catch(() => {
  // Detailed PG errors can contain connection credentials or personal data.
  console.error('No se pudo vincular la cuenta. Comprueba la configuración, las migraciones y que no exista otra vinculación.');
  process.exitCode = 1;
});
module.exports = { main };
