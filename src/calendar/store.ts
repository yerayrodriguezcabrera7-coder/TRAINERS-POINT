import { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
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
} from "./model";
export const migration = `CREATE SCHEMA IF NOT EXISTS calendar;
CREATE TABLE IF NOT EXISTS calendar.gyms(id text PRIMARY KEY, config jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS calendar.bookings(id text NOT NULL, gym_id text NOT NULL REFERENCES calendar.gyms(id), data jsonb NOT NULL, PRIMARY KEY(gym_id,id), CHECK(data->>'status' IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')));
CREATE INDEX IF NOT EXISTS bookings_date ON calendar.bookings(gym_id, (data->>'date'));`;
export class Store {
  constructor(public pool: Pool) {}
  async migrate() {
    await this.pool.query(migration);
  }
  async seed(gym: string, config: Config) {
    await this.pool.query(
      "INSERT INTO calendar.gyms(id,config) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [gym, configSchema.parse(config)],
    );
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
        rows[0].config,
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
      for (const b of bookings) {
        normalize(b, config);
        if (b.status !== "CANCELLED") assertAvailable(b, bookings, config);
      }
      await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [
        gym,
        config,
      ]);
      return config;
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
}
