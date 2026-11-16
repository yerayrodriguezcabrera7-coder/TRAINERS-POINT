import { DateTime } from 'luxon';
import { Pool } from 'pg';

export interface WeeklyPlanningBooking {
  date: string;       // YYYY-MM-DD
  start: string;      // HH:mm
  end: string;
  service_name: string;
  trainer_name: string;
  center_name?: string;
}

export interface WeeklyPlanningReminder {
  gym_id: string;
  client_email: string;
  client_name: string;
  week_start: string;
  week_end: string;
  bookings: WeeklyPlanningBooking[];
}

export class WeeklyPlanningReminder {
  constructor(private pool: Pool) {}

  /** Calcula el inicio y fin de la semana siguiente al date dado */
  async findUpcomingWeek(now = new Date()): Promise<{ weekStart: string; weekEnd: string }> {
    const nextMonday = DateTime.fromJSDate(now)
      .setZone('Europe/Madrid')
      .startOf('week')
      .plus({ weeks: 1 })
      .toJSDate();
    return {
      weekStart: nextMonday.toISOString().split('T')[0],
      weekEnd: DateTime.fromJSDate(nextMonday).plus({ days: 6 }).toISODate() ?? nextMonday.toISOString().split('T')[0],
    };
  }

  /** Consulta SQL que devuelve todos los clientes con reservas pendientes/confirmadas para la semana siguiente */
  async getBookingsForNextWeek(
    weekStart: string,
    weekEnd: string,
  ): Promise<WeeklyPlanningReminder[]> {
    const query = `
      SELECT
        b.gym_id,
        c.email AS client_email,
        COALESCE(NULLIF(TRIM(concat_ws(' ', c."firstName", c."lastName")), ''), c.email) AS client_name,
        b.data->>'date' AS date,
        b.data->>'start' AS start,
        b.data->>'end' AS end,
        s.name AS service_name,
        NULLIF(TRIM(concat_ws(' ', u."firstName", u."lastName")), '') AS trainer_name,
        g.name AS center_name
      FROM calendar.bookings b
      JOIN calendar.gyms g ON g.id = b.gym_id
      JOIN "Client" c ON c.id::text = b.data->>'clientId'
                      AND c."gymId"::text = b.gym_id
      JOIN "Service" s ON s.id::text = b.data->>'serviceId'
      LEFT JOIN "Employee" e ON e.id::text = b.data->>'employeeId'
      LEFT JOIN "User" u ON u.id = e."userId"
      WHERE b.data->>'status' IN ('PENDING', 'CONFIRMED')
        AND b.data->>'date' BETWEEN $1 AND $2
        AND b.data->>'employeeId' IS NOT NULL
      ORDER BY b.data->>'date', b.data->>'start', b.gym_id, c.email
    `;
    const result = await this.pool.query(query, [weekStart, weekEnd]);

    // Agrupar por cliente y gym
    type RawRow = { gym_id: string; client_email: string; client_name: string | null; date: string; start: string; end: string; service_name: string; trainer_name: string | null; center_name: string | null };
    const map = new Map<string, WeeklyPlanningReminder>();
    for (const row of result.rows as unknown as RawRow[]) {
      const key = `${row.gym_id}||${row.client_email}`;
      if (!map.has(key)) {
        const trainer = row.trainer_name || 'Pendiente de asignar';
        const center = row.center_name ?? undefined;
        map.set(key, {
          gym_id: row.gym_id,
          client_email: row.client_email,
          client_name: row.client_name || row.client_email,
          week_start: row.date,
          week_end: row.date,
          bookings: [{ date: row.date, start: row.start, end: row.end, service_name: row.service_name, trainer_name: trainer, center_name: center } as WeeklyPlanningBooking],
        } as WeeklyPlanningReminder);
      } else {
        const entry = map.get(key)!;
        const trainer = row.trainer_name || 'Pendiente de asignar';
        const center = row.center_name ?? undefined;
        entry.bookings.push({ date: row.date, start: row.start, end: row.end, service_name: row.service_name, trainer_name: trainer, center_name: center } as WeeklyPlanningBooking);
      }
    }
    return [...map.values()];
  }

  /**
   * Punto de entrada principal. Solo se ejecuta los viernes entre 10:00 y 10:30 hora de Madrid.
   * Devuelve el número de recordatorios enviados.
   */
  async run(): Promise<number> {
    const now = DateTime.now().setZone('Europe/Madrid');

    // Solo ejecutar los viernes entre 10:00 y 10:30
    if (now.weekday !== 5) return 0;
    if (now.hour !== 10 || now.minute < 0 || now.minute >= 30) return 0;

    const { weekStart, weekEnd } = await this.findUpcomingWeek(now.toJSDate());
    const reminders = await this.getBookingsForNextWeek(weekStart, weekEnd);

    let sent = 0;
    for (const reminder of reminders) {
      // Build the JSON body for the notification
      const body = JSON.stringify({
        clientName: reminder.client_name,
        weekStart,
        weekEnd,
        bookings: reminder.bookings,
      }, null, 2);
      const truncatedBody = body.length > 4000 ? body.substring(0, 4000) : body;

      await this.pool.query(
        `INSERT INTO calendar.notifications(gym_id, type, channel, recipient, subject, body, status, sent_at)
         VALUES($1, 'WEEKLY_PLANNING', 'EMAIL', $2, 'Tu planning de la semana siguiente', $3, 'SENT', NOW())
         ON CONFLICT DO NOTHING`,
        [reminder.gym_id, reminder.client_email, truncatedBody],
      );
      sent++;
    }
    return sent;
  }
}