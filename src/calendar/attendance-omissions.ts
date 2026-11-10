import { Pool } from 'pg';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { Identity } from './access';
import { ApiError, date } from './model';

const inputSchema = z.object({id:z.string().uuid(),employeeId:z.string().min(1).max(100),day:date,kind:z.enum(['IN','OUT']),note:z.string().trim().min(10).max(1000),corroborated:z.literal(true)});
export async function saveOmission(pool: Pool, gym: string, actor: Identity, raw: unknown) {
  if (actor.role !== 'RECEPTION') throw new ApiError(403,'Solo recepción puede comentar y corroborar un olvido de fichaje.');
  const input = inputSchema.parse(raw);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const config=(await db.query('SELECT config FROM calendar.gyms WHERE id=$1 FOR SHARE',[gym])).rows[0]?.config;
    if(!config?.employees.some((e:any)=>e.id===input.employeeId))throw new ApiError(404,'Trabajador desconocido en este centro.');
    if(input.day>DateTime.now().setZone(config.timezone).toISODate()!)throw new ApiError(400,'No puedes registrar un olvido en una fecha futura.');
    const audit={id:actor.id,name:actor.name,username:actor.username,role:actor.role};
    const created=await db.query('INSERT INTO calendar.attendance_omissions(id,gym_id,employee_id,day,kind,note,actor) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id',[input.id,gym,input.employeeId,input.day,input.kind,input.note,audit]);
    if(!created.rowCount){
      const old=(await db.query(`SELECT *,to_char(day,'YYYY-MM-DD') AS day FROM calendar.attendance_omissions WHERE id=$1`,[input.id])).rows[0];
      if(old.gym_id!==gym||old.employee_id!==input.employeeId||old.day!==input.day||old.kind!==input.kind||old.note!==input.note||old.actor.id!==actor.id)throw new ApiError(409,'La incidencia ya existe con otros datos.');
    }
    await db.query('COMMIT');return {id:input.id};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function listOmissions(pool: Pool,gym:string,actor:Identity,from:string,to:string){
  if(!['ADMIN','RECEPTION','TRAINER'].includes(actor.role))throw new ApiError(403,'Acceso no permitido.');
  date.parse(from);date.parse(to);
  if(to<from||DateTime.fromISO(to).diff(DateTime.fromISO(from),'days').days>92)throw new ApiError(400,'Selecciona un período de hasta 93 días.');
  return (await pool.query(`SELECT id,employee_id AS "employeeId",to_char(day,'YYYY-MM-DD') AS day,kind,note,actor,created_at AS "createdAt" FROM calendar.attendance_omissions WHERE gym_id=$1 AND day BETWEEN $2 AND $3 AND ($4::text IS NULL OR employee_id=$4) ORDER BY day DESC,created_at DESC`,[gym,from,to,actor.role==='TRAINER'?(actor.employeeId||'unassigned'):null])).rows;
}
