import { DateTime } from 'luxon';
import { Pool } from 'pg';
import { DeliveryError, type ReminderMessage, type ReminderProvider } from './provider';

type Candidate = { gym_id: string; id: string; data: any; config: any; client_name: string; phone: string; preference: string; service_name: string; employee_name: string | null };
export function prepareReminder(row: Candidate, now: Date): { startsAt: string; message: ReminderMessage } | null {
  if (!['PENDING', 'CONFIRMED'].includes(row.data.status) || row.data.needsReschedule || !row.data.employeeId) return null;
  if (!['WHATSAPP', 'SMS'].includes(row.preference)) return null;
  const phone = row.phone.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  const start = DateTime.fromISO(`${row.data.date}T${row.data.start}`, { zone: row.config.timezone || 'Europe/Madrid' });
  if (!start.isValid) return null;
  // Previous calendar day at the same local time, also across daylight-saving changes.
  const due = start.minus({ days: 1 }).toMillis(), elapsed = now.getTime() - due;
  if (elapsed < 0 || elapsed > 2 * 3600000 || start.toMillis() <= now.getTime()) return null;
  const trainer = row.employee_name || row.config.employees?.find((e: any) => e.id === row.data.employeeId)?.name;
  if (!trainer) return null;
  return { startsAt: start.toUTC().toISO()!, message: { channel: row.preference as 'WHATSAPP' | 'SMS', phone, client: row.client_name, date: start.setLocale('es').toFormat('dd/MM/yyyy'), time: start.toFormat('HH:mm'), service: row.service_name, trainer } };
}
const query = `SELECT b.gym_id,b.id,b.data,g.config,concat_ws(' ',c."firstName",c."lastName") AS client_name,c.phone,c."contactPreference" AS preference,s.name AS service_name,
  NULLIF(concat_ws(' ',u."firstName",u."lastName"),'') AS employee_name
 FROM calendar.bookings b JOIN calendar.gyms g ON g.id=b.gym_id
 JOIN "Client" c ON c.id::text=b.data->>'clientId' AND c."gymId"::text=b.gym_id
 JOIN "Service" s ON s.id::text=b.data->>'serviceId'
 LEFT JOIN "Employee" e ON e.id::text=b.data->>'employeeId' LEFT JOIN "User" u ON u.id=e."userId"`;
export class ReminderWorker {
  constructor(private pool: Pool, private provider: ReminderProvider | null) {}
  async run(now = new Date()) {
    if (!this.provider) return;
    // A crash after dispatch is ambiguous: never blindly repeat a possibly accepted message.
    await this.pool.query(`UPDATE calendar.reminders SET status='UNKNOWN',reason='Proceso interrumpido; comprobar el proveedor.',updated_at=$1 WHERE status='PROCESSING' AND updated_at < $1::timestamptz - interval '10 minutes'`, [now]);
    const candidates = await this.pool.query<Candidate>(query + ` WHERE b.data->>'status' IN ('PENDING','CONFIRMED')
      AND b.data->>'date' BETWEEN $1 AND $2
      AND ((concat(b.data->>'date','T',b.data->>'start')::timestamp - interval '1 day') AT TIME ZONE COALESCE(g.config->>'timezone','Europe/Madrid')) BETWEEN $3::timestamptz - interval '2 hours' AND $3::timestamptz
      ORDER BY b.data->>'date',b.data->>'start',b.id`, [DateTime.fromJSDate(now).toUTC().minus({ days: 1 }).toISODate(), DateTime.fromJSDate(now).toUTC().plus({ days: 2 }).toISODate(), now]);
    for (const row of candidates.rows) {
      const prepared = prepareReminder(row, now);
      if (!prepared) continue;
      const args = [row.gym_id, row.id, prepared.startsAt];
      const claim = await this.pool.query(`INSERT INTO calendar.reminders(gym_id,booking_id,starts_at,channel,status,updated_at) VALUES($1,$2,$3,$4,'PROCESSING',$5)
        ON CONFLICT (gym_id,booking_id,starts_at) DO UPDATE SET status='PROCESSING',attempts=calendar.reminders.attempts+1,channel=EXCLUDED.channel,updated_at=EXCLUDED.updated_at
        WHERE calendar.reminders.status='RETRY' AND calendar.reminders.next_attempt_at <= $5 AND calendar.reminders.attempts < 4 RETURNING booking_id`, [...args, prepared.message.channel, now]);
      if (!claim.rowCount) continue;
      const db = await this.pool.connect();
      try {
        await db.query('BEGIN');
        // Freeze changes to this centre only during the bounded provider call, so a cancelled or moved appointment is not sent from an old snapshot.
        await db.query("SET LOCAL lock_timeout='5s'");
        await db.query('SELECT id FROM calendar.gyms WHERE id=$1 FOR SHARE', [row.gym_id]);
        const fresh = (await db.query<Candidate>(query + ' WHERE b.gym_id=$1 AND b.id=$2', [row.gym_id, row.id])).rows[0];
        const current = fresh && prepareReminder(fresh, now);
        if (!current || current.startsAt !== prepared.startsAt) {
          await db.query("UPDATE calendar.reminders SET status='SKIPPED',reason='La reserva o el contacto han cambiado.',updated_at=now() WHERE gym_id=$1 AND booking_id=$2 AND starts_at=$3", args);
        } else {
          const providerId = await this.provider.send(current.message);
          await db.query("UPDATE calendar.reminders SET status='ACCEPTED',channel=$4,provider_id=$5,reason=NULL,updated_at=now() WHERE gym_id=$1 AND booking_id=$2 AND starts_at=$3", [...args, current.message.channel, providerId]);
        }
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        const failure = error instanceof DeliveryError ? error : new DeliveryError('UNKNOWN','No se pudo confirmar el envío; revisar antes de reenviar.');
        await this.pool.query("UPDATE calendar.reminders SET status=$4,reason=$5,next_attempt_at=$6::timestamptz + interval '5 minutes',updated_at=$6 WHERE gym_id=$1 AND booking_id=$2 AND starts_at=$3", [...args, failure.outcome, failure.message, now]);
      } finally { db.release(); }
    }
  }
  start() {
    if (!this.provider) return async () => {};
    let stopped = false, timer: NodeJS.Timeout | undefined, running: Promise<void> | undefined;
    const tick = () => { running = this.run().catch(() => { console.error('No se pudieron procesar los recordatorios. Revisar la conexión y la configuración.'); }).finally(() => { if (!stopped) { timer = setTimeout(tick,60000); timer.unref(); } }); };
    tick();
    return async () => { stopped = true; clearTimeout(timer); await running; };
  }
}
