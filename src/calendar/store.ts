import { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { accessMigration } from "./access";
import {
  ApiError,
  Booking,
  Config,
  bookingSchema,
  configSchema,
  normalize,
  assertAvailable,
  assertTransition,
  date,
  label,
  minutes,
  clientSchema,
  attendanceActionSchema,
  employeeSchema,
  serviceSchema,
} from "./model";
export const migration = `CREATE SCHEMA IF NOT EXISTS calendar;
CREATE TABLE IF NOT EXISTS calendar.gyms(id text PRIMARY KEY, name text, config jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0);
ALTER TABLE calendar.gyms ADD COLUMN IF NOT EXISTS name text;
CREATE TABLE IF NOT EXISTS calendar.bookings(id text NOT NULL, gym_id text NOT NULL REFERENCES calendar.gyms(id), data jsonb NOT NULL, PRIMARY KEY(gym_id,id), CHECK(data->>'status' IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')));
CREATE INDEX IF NOT EXISTS bookings_date ON calendar.bookings(gym_id, (data->>'date'));
CREATE TABLE IF NOT EXISTS calendar.attendance(
  id text PRIMARY KEY,
  gym_id text NOT NULL REFERENCES calendar.gyms(id),
  employee_id text NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  CHECK(clock_out IS NULL OR clock_out >= clock_in)
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_open_shift ON calendar.attendance(gym_id,employee_id) WHERE clock_out IS NULL;
CREATE INDEX IF NOT EXISTS attendance_by_gym_and_time ON calendar.attendance(gym_id,clock_in DESC);`;
export class Store {
  constructor(public pool: Pool) {}
  async migrate() {
    await this.pool.query(migration);
    await this.pool.query(accessMigration);
  }
  async seed(gym: string, config: Config) {
    await this.pool.query(
      "INSERT INTO calendar.gyms(id,name,config) VALUES($1,$1,$2) ON CONFLICT (id) DO UPDATE SET name=COALESCE(calendar.gyms.name, EXCLUDED.name)",
      [gym, configSchema.parse(config)],
    );
  }
  async listGyms() {
    return (await this.pool.query("SELECT id,name FROM calendar.gyms ORDER BY name NULLS LAST,id")).rows
      .map((row) => ({ id: row.id as string, name: (row.name || row.id) as string }));
  }
  async gymExists(gym: string) {
    return Boolean((await this.pool.query("SELECT 1 FROM calendar.gyms WHERE id=$1", [gym])).rowCount);
  }
  async createGym(name: string, templateGym: string) {
    const id = `${name.toLocaleLowerCase("es").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "gimnasio"}-${randomUUID().slice(0, 8)}`;
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const source = await db.query("SELECT config FROM calendar.gyms WHERE id=$1", [templateGym]);
      if (!source.rows.length) throw new ApiError(404, "No se encontró el gimnasio base.");
      const config = configSchema.parse(source.rows[0].config);
      await db.query("INSERT INTO calendar.gyms(id,name,config) VALUES($1,$2,$3)", [id, name.trim(), config]);
      await db.query("COMMIT");
      return { id, name: name.trim() };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  // Every writer locks the same persisted gym row BEFORE reading bookings. READ COMMITTED
  // gives waiting writers a fresh snapshot after the prior writer commits. Works across processes.
  async transaction<T>(
    gym: string,
    fn: (
      db: PoolClient,
      c: Config,
      bookings: Booking[],
      revision: number,
    ) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await db.query("SET LOCAL lock_timeout = '5s'");
      const { rows } = await db.query(
        "SELECT config,revision FROM calendar.gyms WHERE id=$1 FOR UPDATE",
        [gym],
      );
      if (!rows.length) throw new ApiError(404, "Gimnasio desconocido.");
      const bookings = (
        await db.query("SELECT data FROM calendar.bookings WHERE gym_id=$1", [
          gym,
        ])
      ).rows.map((r) => r.data as Booking);
      const result = await fn(
        db,
        configSchema.parse(rows[0].config),
        bookings,
        Number(rows[0].revision),
      );
      await db.query(
        "UPDATE calendar.gyms SET revision=revision+1 WHERE id=$1",
        [gym],
      );
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async state(gym: string) {
    // Single statement: config and bookings share a consistent snapshot.
    const { rows } = await this.pool.query(
      `SELECT config,revision,COALESCE((SELECT jsonb_agg(data ORDER BY data->>'date',data->>'start') FROM calendar.bookings WHERE gym_id=g.id),'[]'::jsonb) bookings FROM calendar.gyms g WHERE id=$1`,
      [gym],
    );
    if (!rows.length) throw new ApiError(404, "Gimnasio desconocido.");
    return {
      ...rows[0].config,
      bookings: rows[0].bookings,
      revision: Number(rows[0].revision),
      version: 1,
    };
  }
  async save(gym: string, raw: unknown, id?: string, newClient?: unknown) {
    const input = bookingSchema.parse(raw);
    return this.transaction(gym, async (db, c, bookings) => {
      const old = id ? bookings.find((b) => b.id === id) : undefined;
      if (id && !old) throw new ApiError(404, "Reserva desconocida.");
      if (old && input.version !== old.version)
        throw new ApiError(
          409,
          "La reserva cambió. Cierra la ficha y vuelve a abrirla.",
        );
      if (newClient) {
        const client = clientSchema.parse(newClient);
        if (c.clients.some((x) => x.id === client.id))
          throw new ApiError(409, "Cliente duplicado.");
        c.clients.push(client);
      }
      const b = normalize(
        { ...input, id: id || randomUUID(), version: old?.version || 1 },
        c,
      );
      if (!old || (b.status !== "CANCELLED" && ["clientId","employeeId","serviceId","date","start","status"].some(k => (b as any)[k] !== (old as any)[k])))
        this.assertActive(b, c);
      if (old) assertTransition(old, b, c);
      else if (!["PENDING", "CONFIRMED"].includes(b.status))
        throw new ApiError(
          400,
          "Una nueva cita debe estar pendiente o confirmada.",
        );
      assertAvailable(b, bookings, c);
      if (old) b.version++;
      await db.query(
        "INSERT INTO calendar.bookings(id,gym_id,data) VALUES($1,$2,$3) ON CONFLICT(gym_id,id) DO UPDATE SET data=EXCLUDED.data",
        [b.id, gym, b],
      );
      if (newClient)
        await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [
          gym,
          c,
        ]);
      return b;
    });
  }
  async configure(gym: string, raw: unknown, revision: number) {
    const config = configSchema.parse(raw);
    return this.transaction(gym, async (db, _c, bookings, current) => {
      if (revision !== current)
        throw new ApiError(
          409,
          "Los datos han cambiado. Actualiza antes de guardar.",
        );
      await this.validateConfig(db, gym, config, bookings);
      await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [
        gym,
        config,
      ]);
      return config;
    });
  }
  private assertActive(b: Booking, c: Config) {
    if (b.status === "CANCELLED") return;
    if ((c.clients.find(x => x.id === b.clientId)?.status || "ACTIVE") !== "ACTIVE")
      throw new ApiError(409, "El cliente está inactivo o bloqueado.");
    if (c.employees.find(x => x.id === b.employeeId)?.active === false || c.services.find(x => x.id === b.serviceId)?.active === false)
      throw new ApiError(409, "El empleado o servicio está inactivo.");
  }
  private async validateConfig(db: PoolClient, gym: string, config: Config, bookings: Booking[]) {
    const today = DateTime.now().setZone(config.timezone).toISODate()!;
    for (const b of bookings) {
      for (const [list,key] of [["clients","clientId"],["services","serviceId"],["employees","employeeId"],["rooms","roomId"]] as const)
        if (!config[list].some(x => x.id === b[key])) throw new ApiError(409, "No se pueden eliminar fichas con historial. Usa el estado inactivo.");
      if (["PENDING","CONFIRMED"].includes(b.status) && b.date >= today) {
        normalize(b, config); this.assertActive(b, config); assertAvailable(b, bookings, config);
      }
    }
    const linked = (await db.query(`SELECT employee_id FROM calendar.attendance WHERE gym_id=$1
      UNION SELECT employee_id FROM calendar.users WHERE gym_id=$1`, [gym])).rows;
    if (linked.some(r => !config.employees.some(e => e.id === r.employee_id)))
      throw new ApiError(409, "El empleado tiene fichajes o usuario. Desactívalo en lugar de eliminarlo.");
    const open = (await db.query("SELECT employee_id FROM calendar.attendance WHERE gym_id=$1 AND clock_out IS NULL", [gym])).rows;
    if (open.some(r => config.employees.find(e => e.id === r.employee_id)?.active === false))
      throw new ApiError(409, "Cierra la jornada del empleado antes de desactivarlo.");
    const admins = (await db.query("SELECT employee_id FROM calendar.users WHERE gym_id=$1 AND role='ADMIN' AND enabled", [gym])).rows;
    if (admins.length && !admins.some(r => config.employees.find(e => e.id === r.employee_id)?.active !== false))
      throw new ApiError(409, "Debe quedar al menos un administrador activo.");
  }
  async manage(gym: string, kind: string, raw: unknown, revision: number, id?: string) {
    if (!["clients","services","employees"].includes(kind)) throw new ApiError(404, "Sección desconocida.");
    const schema = kind === "clients" ? clientSchema : kind === "services" ? serviceSchema : employeeSchema;
    const record = schema.parse({ ...(raw as object), id: id || randomUUID() });
    return this.transaction(gym, async (db,c,bookings,current) => {
      if (revision !== current) throw new ApiError(409, "Los datos han cambiado. Cierra la ficha, actualiza y vuelve a intentarlo.");
      const list = c[kind as "clients"] as any[];
      const index = list.findIndex(x => x.id === id);
      if (id && index < 0) throw new ApiError(404, "Ficha desconocida.");
      if (id) list[index] = record; else list.push(record);
      await this.validateConfig(db,gym,c,bookings);
      await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym,c]);
      return record;
    });
  }
  async slots(gym: string, query: Record<string, string>) {
    const day = date.parse(query.date),
      c = (await this.state(gym)) as Config & { bookings: Booking[] };
    const service = c.services.find((s) => s.id === query.serviceId);
    if (
      !service ||
      !c.employees.some((e) => e.id === query.employeeId) ||
      !c.rooms.some((r) => r.id === query.roomId)
    )
      throw new ApiError(400, "Recursos desconocidos.");
    if (service.active === false || c.employees.find(e => e.id === query.employeeId)?.active === false) return [];
    const slots = [];
    for (let start = 0; start + service.duration < 1440; start += 15) {
      try {
        const b = normalize(
          {
            clientId: c.clients[0]?.id || "slot-preview",
            employeeId: query.employeeId,
            serviceId: query.serviceId,
            roomId: query.roomId,
            date: day,
            start: label(start),
            status: "PENDING",
            notes: "",
            sessionId: query.sessionId,
          },
          {
            ...c,
            clients: [
              ...c.clients,
              { id: "slot-preview", name: "", email: "", phone: "", notes: "" },
            ],
          },
        );
        b.clientId = "slot-preview";
        assertAvailable(b, c.bookings, c);
        slots.push({ start: b.start, end: b.end });
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
      }
    }
    return slots;
  }

  async attendance(gym: string, from?: string, to?: string, employeeId?: string) {
    const current = await this.state(gym);
    const zone = current.timezone;
    const first = from
      ? date.parse(from)
      : DateTime.now().setZone(zone).toISODate()!;
    const last = to ? date.parse(to) : first;
    const start = DateTime.fromISO(first, { zone }).startOf("day");
    const end = DateTime.fromISO(last, { zone }).plus({ days: 1 }).startOf("day");
    if (end.diff(start, "days").days > 93)
      throw new ApiError(400, "El historial permite consultar hasta 93 días.");
    if (end <= start) throw new ApiError(400, "Rango de fechas inválido.");
    const { rows } = await this.pool.query(
      `SELECT id,employee_id AS "employeeId",clock_in AS "clockIn",clock_out AS "clockOut"
       FROM calendar.attendance
       WHERE gym_id=$1 AND clock_in < $3 AND COALESCE(clock_out,now()) >= $2
       ORDER BY clock_in DESC`,
      [gym, start.toUTC().toISO(), end.toUTC().toISO()],
    );
    return {
      timezone: zone,
      employees: current.employees.filter((e: any) => (!employeeId || e.id === employeeId) && (e.active !== false || rows.some(r => r.employeeId === e.id))).map(
        ({ id, name, color }: { id: string; name: string; color: string }) => ({
          id,
          name,
          color,
        }),
      ),
      records: employeeId ? rows.filter(r => r.employeeId === employeeId) : rows,
      serverNow: new Date().toISOString(),
      from: first,
      to: last,
    };
  }

  async clock(gym: string, raw: unknown) {
    const input = attendanceActionSchema.parse(raw);
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await db.query("SET LOCAL lock_timeout = '5s'");
      const gymResult = await db.query(
        "SELECT config FROM calendar.gyms WHERE id=$1 FOR SHARE",
        [gym],
      );
      if (!gymResult.rows.length)
        throw new ApiError(404, "Gimnasio desconocido.");
      const employee = gymResult.rows[0].config.employees.find(
        (item: { id: string }) => item.id === input.employeeId,
      );
      if (!employee) throw new ApiError(404, "Empleado desconocido.");
      if (employee.active === false && input.action === "IN") throw new ApiError(409, "Empleado inactivo.");
      const open = await db.query(
        `SELECT id,employee_id AS "employeeId",clock_in AS "clockIn",clock_out AS "clockOut"
         FROM calendar.attendance
         WHERE gym_id=$1 AND employee_id=$2 AND clock_out IS NULL
         FOR UPDATE`,
        [gym, input.employeeId],
      );
      let row;
      if (input.action === "IN") {
        if (open.rows.length)
          throw new ApiError(409, `${employee.name} ya tiene una jornada abierta.`);
        row = (
          await db.query(
            `INSERT INTO calendar.attendance(id,gym_id,employee_id)
             VALUES($1,$2,$3)
             RETURNING id,employee_id AS "employeeId",clock_in AS "clockIn",clock_out AS "clockOut"`,
            [randomUUID(), gym, input.employeeId],
          )
        ).rows[0];
      } else {
        if (!open.rows.length)
          throw new ApiError(409, `${employee.name} no tiene una jornada abierta.`);
        row = (
          await db.query(
            `UPDATE calendar.attendance SET clock_out=now() WHERE id=$1
             RETURNING id,employee_id AS "employeeId",clock_in AS "clockIn",clock_out AS "clockOut"`,
            [open.rows[0].id],
          )
        ).rows[0];
      }
      await db.query("COMMIT");
      return row;
    } catch (error) {
      await db.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505")
        throw new ApiError(409, "Este empleado ya tiene una jornada abierta.");
      throw error;
    } finally {
      db.release();
    }
  }
}
