import { DateTime } from 'luxon';
import { Pool } from 'pg';
import type { ReminderProvider } from './provider';
import { DeliveryError } from './provider';

export interface WeeklyPlanningBooking {
  date: string;
  start: string;
  end: string;
  service_name: string;
  trainer_name: string;
  center_name?: string;
}

export interface WeeklyPlanningGroup {
  gym_id: string;
  client_id: string;
  client_email: string | null;
  client_phone: string | null;
  preference: string | null;
  client_name: string;
  week_start: string;
  week_end: string;
  bookings: WeeklyPlanningBooking[];
}

export class WeeklyPlanningReminder {
  constructor(private pool: Pool, private provider: ReminderProvider | null) {}

  async findUpcomingWeek(now = new Date()): Promise<{ weekStart: string; weekEnd: string }> {
    const monday = DateTime.fromJSDate(now).setZone('Europe/Madrid').startOf('week').plus({ weeks: 1 });
    return { weekStart: monday.toISODate()!, weekEnd: monday.plus({ days: 6 }).toISODate()! };
  }

  async getBookingsForNextWeek(weekStart: string, weekEnd: string): Promise<WeeklyPlanningGroup[]> {
    const query = `
      SELECT b.gym_id,c.id AS client_id,c.email AS client_email,c.phone AS client_phone,
        c."contactPreference" AS preference,
        COALESCE(NULLIF(TRIM(concat_ws(' ',c."firstName",c."lastName")),''),c.email) AS client_name,
        b.data->>'date' AS date,b.data->>'start' AS start,b.data->>'end' AS end,
        s.name AS service_name,NULLIF(TRIM(concat_ws(' ',u."firstName",u."lastName")),'') AS trainer_name,
        g.name AS center_name
      FROM calendar.bookings b
      JOIN calendar.gyms g ON g.id=b.gym_id
      JOIN "Client" c ON c.id::text=b.data->>'clientId' AND c."gymId"::text=b.gym_id
      JOIN "Service" s ON s.id::text=b.data->>'serviceId'
      LEFT JOIN "Employee" e ON e.id::text=b.data->>'employeeId'
      LEFT JOIN "User" u ON u.id=e."userId"
      WHERE b.data->>'status' IN ('PENDING','CONFIRMED')
        AND b.data->>'date' BETWEEN $1 AND $2
        AND b.data->>'employeeId' IS NOT NULL
      ORDER BY b.data->>'date',b.data->>'start',b.gym_id,c.id`;
    const result = await this.pool.query(query, [weekStart, weekEnd]);
    type Raw = { gym_id: string; client_id: string; client_email: string | null; client_phone: string | null; preference: string | null; client_name: string | null; date: string; start: string; end: string; service_name: string; trainer_name: string | null; center_name: string | null };
    const grouped = new Map<string, WeeklyPlanningGroup>();
    for (const row of result.rows as Raw[]) {
      const key = `${row.gym_id}||${row.client_id}`;
      const booking: WeeklyPlanningBooking = { date: row.date, start: row.start, end: row.end, service_name: row.service_name, trainer_name: row.trainer_name || 'Pendiente de asignar', ...(row.center_name ? { center_name: row.center_name } : {}) };
      const existing = grouped.get(key);
      if (existing) existing.bookings.push(booking);
      else grouped.set(key, { gym_id: row.gym_id, client_id: row.client_id, client_email: row.client_email, client_phone: row.client_phone, preference: row.preference, client_name: row.client_name || 'Cliente', week_start: weekStart, week_end: weekEnd, bookings: [booking] });
    }
    return [...grouped.values()];
  }

  async run(nowDate = new Date()): Promise<number> {
    const now = DateTime.fromJSDate(nowDate).setZone('Europe/Madrid');
    if (now.weekday !== 5 || now.hour !== 10 || now.minute > 5 || !this.provider) return 0;
    const { weekStart, weekEnd } = await this.findUpcomingWeek(nowDate);
    const rows = await this.getBookingsForNextWeek(weekStart, weekEnd);
    let sent = 0;
    for (const reminder of rows) {
      const channel = reminder.preference;
      if (!['WHATSAPP', 'SMS', 'EMAIL'].includes(channel || '')) continue;
      const recipient = channel === 'EMAIL' ? reminder.client_email : reminder.client_phone?.replace(/[\s()-]/g, '');
      if (!recipient || (channel !== 'EMAIL' && !/^\+[1-9]\d{7,14}$/.test(recipient))) continue;
      const agenda = reminder.bookings.map(item => `${DateTime.fromISO(item.date).setLocale('es').toFormat('ccc dd/MM')} ${item.start}-${item.end}: ${item.service_name} con ${item.trainer_name}${item.center_name ? ` (${item.center_name})` : ''}`).join('\n');
      const body = `Hola ${reminder.client_name}. Este es tu planning de la semana del ${weekStart} al ${weekEnd}:\n${agenda}\nTrainers Point.`;
      const dedupeKey = `WEEKLY_PLANNING:${reminder.gym_id}:${reminder.client_id}:${weekStart}`;
      const claimed = await this.pool.query<{ id: string }>(
        `INSERT INTO calendar.notifications(gym_id,type,channel,recipient,subject,body,status,dedupe_key)
         VALUES($1,'WEEKLY_PLANNING',$2,$3,$4,$5,'PENDING',$6)
         ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
        [reminder.gym_id, channel, recipient, `Planning semanal ${weekStart}`, body, dedupeKey],
      );
      if (!claimed.rowCount) continue;
      const booking = reminder.bookings[0];
      try {
        await this.provider.send({
          channel: channel as 'WHATSAPP' | 'SMS' | 'EMAIL',
          ...(channel === 'EMAIL' ? { email: recipient } : { phone: recipient }),
          client: reminder.client_name,
          date: `${weekStart}–${weekEnd}`,
          time: booking?.start || '',
          service: agenda,
          trainer: booking?.trainer_name || '',
          body,
          ...(channel === 'WHATSAPP' ? {
            templateSid: process.env.TWILIO_WHATSAPP_WEEKLY_CONTENT_SID,
            templateVariables: { '1': reminder.client_name, '2': weekStart, '3': weekEnd, '4': agenda.slice(0, 900), '5': booking?.center_name || 'Tu centro' },
          } : {}),
        });
        await this.pool.query(`UPDATE calendar.notifications SET status='SENT',sent_at=now(),updated_at=now() WHERE id=$1`, [claimed.rows[0].id]);
        sent++;
      } catch (error) {
        const reason = error instanceof DeliveryError ? error.message : 'Fallo desconocido al enviar.';
        await this.pool.query(`UPDATE calendar.notifications SET status='FAILED',reason=$2,updated_at=now() WHERE id=$1`, [claimed.rows[0].id, reason]);
      }
    }
    return sent;
  }
}
