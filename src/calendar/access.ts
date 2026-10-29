import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";
import { z } from "zod";
import { ApiError } from "./model";

const derive = promisify(scrypt);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const roles = ["ADMIN", "RECEPTION", "TRAINER", "CLIENT"] as const;
export type Identity = { id: string; name: string; role: typeof roles[number]; employeeId: string | null; clientId: string | null };
const accountSchema = z.object({
  username: z.email().transform(v => v.toLowerCase()),
  employeeId: z.string().min(1).max(100).optional().nullable(),
  clientId: z.string().min(1).max(100).optional().nullable(),
  name: z.string().min(1).max(200).optional().nullable(),
  role: z.enum(roles),
  enabled: z.boolean(),
  password: z.string().min(10).max(128).optional(),
}).superRefine((data, ctx) => {
  if (data.role === "CLIENT") {
    if (!data.clientId && !data.name) ctx.addIssue({ code: "custom", message: "Selecciona una ficha de cliente o escribe su nombre.", path: ["clientId"] });
  } else {
    if (!data.employeeId && !data.name) ctx.addIssue({ code: "custom", message: "Escribe el nombre de la persona.", path: ["name"] });
  }
});
export const accessMigration = `
CREATE TABLE IF NOT EXISTS calendar.users (
 id text PRIMARY KEY, gym_id text NOT NULL REFERENCES calendar.gyms(id),
 employee_id text, client_id text, username text NOT NULL, role text NOT NULL,
 password_hash text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 UNIQUE(gym_id,username));
ALTER TABLE calendar.users ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE calendar.users ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE calendar.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE calendar.users DROP CONSTRAINT IF EXISTS calendar_users_role_check;
ALTER TABLE calendar.users DROP CONSTRAINT IF EXISTS users_gym_id_employee_id_key;
ALTER TABLE calendar.users DROP CONSTRAINT IF EXISTS calendar_users_gym_id_employee_id_key;
DO $$ BEGIN
  ALTER TABLE calendar.users ADD CONSTRAINT users_role_check CHECK(role IN ('ADMIN','RECEPTION','TRAINER','CLIENT'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DROP INDEX IF EXISTS calendar.users_gym_employee;
CREATE UNIQUE INDEX IF NOT EXISTS users_gym_employee ON calendar.users(gym_id, employee_id) WHERE employee_id IS NOT NULL;
DROP INDEX IF EXISTS calendar.users_gym_client;
CREATE UNIQUE INDEX IF NOT EXISTS users_gym_client ON calendar.users(gym_id, client_id) WHERE client_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS calendar.sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES calendar.users(id), expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON calendar.sessions(user_id);`;

export class Access {
  constructor(private pool: Pool) {}
  async needsSetup(gym: string) {
    return !(await this.pool.query("SELECT 1 FROM calendar.users WHERE gym_id=$1 LIMIT 1",[gym])).rows.length;
  }
  async list(gym: string) {
    const [usersRes, gymRes] = await Promise.all([
      this.pool.query(`SELECT id,employee_id AS "employeeId",client_id AS "clientId",username,role,enabled
        FROM calendar.users WHERE gym_id=$1 ORDER BY username`, [gym]),
      this.pool.query(`SELECT config FROM calendar.gyms WHERE id=$1`, [gym]),
    ]);
    const config = gymRes.rows[0]?.config || {};
    const employees: any[] = config.employees || [];
    const clients: any[] = config.clients || [];
    return usersRes.rows.map((u: any) => {
      let name = "";
      if (u.role === "CLIENT") {
        name = clients.find((c: any) => c.id === u.clientId)?.name || "";
      } else {
        name = employees.find((e: any) => e.id === u.employeeId)?.name || "";
      }
      return { ...u, name };
    });
  }
  async save(gym: string, raw: unknown, id?: string) {
    const input = accountSchema.parse(raw);
    if (!id && !input.password) throw new ApiError(400, "Escribe una contraseña de al menos 10 caracteres.");
    let hash: string | null = null;
    if (input.password) {
      const salt = randomBytes(16).toString("hex");
      hash = salt + ":" + ((await derive(input.password, salt, 64)) as Buffer).toString("hex");
    }
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const gymRow = await db.query("SELECT config FROM calendar.gyms WHERE id=$1 FOR UPDATE", [gym]);
      const config = gymRow.rows[0]?.config || { employees: [], clients: [] };
      let employeeId = input.role === "CLIENT" ? null : input.employeeId;
      let clientId = input.role === "CLIENT" ? input.clientId : null;

      if (input.role === "CLIENT") {
        if (!clientId && input.name) {
          let client = config.clients?.find((c: any) => c.name.toLowerCase() === input.name!.trim().toLowerCase());
          if (!client) {
            client = { id: randomUUID(), name: input.name.trim(), email: input.username, phone: "", status: "ACTIVE", notes: "" };
            config.clients = config.clients || [];
            config.clients.push(client);
            await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym, config]);
          }
          clientId = client.id;
        }
        const client = config.clients?.find((c: any) => c.id === clientId);
        if (!client || (input.enabled && client.status === "BLOCKED"))
          throw new ApiError(400, "Selecciona un cliente activo.");
        if (input.name && client.name !== input.name.trim()) {
          client.name = input.name.trim();
          await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym, config]);
        }
      } else {
        if (input.name) {
          const trimmed = input.name.trim();
          let employee = employeeId ? config.employees?.find((e: any) => e.id === employeeId) : null;
          if (!employee) {
            employee = config.employees?.find((e: any) => e.name.toLowerCase() === trimmed.toLowerCase());
          }
          if (!employee && config.employees?.length === 1 && config.employees[0].name === "Entrenador de prueba") {
            employee = config.employees[0];
          }
          if (employee) {
            employee.name = trimmed;
            employee.active = true;
            employeeId = employee.id;
            await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym, config]);
          } else {
            const newId = randomUUID();
            const newEmp = {
              id: newId,
              name: trimmed,
              jobTitle: input.role === "RECEPTION" ? "Recepción" : input.role === "TRAINER" ? "Entrenador" : "Administrador",
              color: "#ff7f0a",
              active: true,
              schedule: config.schedule || [],
            };
            config.employees = config.employees || [];
            config.employees.push(newEmp);
            employeeId = newId;
            await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym, config]);
          }
        }
        const employee = config.employees?.find((e: any) => e.id === employeeId);
        if (!employee || (input.enabled && employee.active === false))
          throw new ApiError(400, "Selecciona un empleado activo.");
      }
      const users = await db.query("SELECT id FROM calendar.users WHERE gym_id=$1",[gym]);
      if (!users.rows.length && (input.role !== "ADMIN" || !input.enabled))
        throw new ApiError(400, "La primera cuenta debe ser un administrador habilitado.");
      const old = id ? (await db.query("SELECT * FROM calendar.users WHERE gym_id=$1 AND id=$2", [gym,id])).rows[0] : null;
      if (id && !old) throw new ApiError(404, "Usuario desconocido.");
      if (old?.role === "ADMIN" && old.enabled && (input.role !== "ADMIN" || !input.enabled)) {
        const others = await db.query("SELECT id FROM calendar.users WHERE gym_id=$1 AND role='ADMIN' AND enabled AND id<>$2", [gym,id]);
        if (!others.rows.length) throw new ApiError(409, "Debe quedar al menos un administrador activo.");
      }
      const userId = id || randomUUID();
      await db.query(`INSERT INTO calendar.users(id,gym_id,employee_id,client_id,username,role,password_hash,enabled)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET
        employee_id=EXCLUDED.employee_id,client_id=EXCLUDED.client_id,username=EXCLUDED.username,role=EXCLUDED.role,
        password_hash=EXCLUDED.password_hash,enabled=EXCLUDED.enabled`,
      [userId,gym,employeeId,clientId,input.username,input.role,hash || old?.password_hash,input.enabled]);
      await db.query("DELETE FROM calendar.sessions WHERE user_id=$1", [userId]);
      await db.query("COMMIT");
      return { id: userId };
    } catch (e) {
      await db.query("ROLLBACK");
      if ((e as any).code === "23505") throw new ApiError(409, "Ese correo, empleado o cliente ya tiene un usuario.");
      throw e;
    } finally { db.release(); }
  }
  async login(gym: string, raw: unknown) {
    const input = z.object({ username: z.string().max(254), password: z.string().max(128) }).parse(raw);
    const row = (await this.pool.query(`SELECT u.*,g.config FROM calendar.users u JOIN calendar.gyms g ON g.id=u.gym_id
      WHERE u.gym_id=$1 AND u.username=$2`, [gym,input.username.trim().toLowerCase()])).rows[0];
    const [salt, expected] = (row?.password_hash || "unavailable:" + "00".repeat(64)).split(":");
    const actual = (await derive(input.password, salt, 64)) as Buffer;
    if (!timingSafeEqual(actual, Buffer.from(expected,"hex")) || !row?.enabled)
      throw new ApiError(401, "Correo o contraseña incorrectos, o cuenta desactivada.");
    if (row.role === "CLIENT") {
      const client = row?.config.clients.find((c: any) => c.id === row.client_id);
      if (!client || client.status === "BLOCKED")
        throw new ApiError(401, "Correo o contraseña incorrectos, o cuenta desactivada.");
    } else {
      const employee = row?.config.employees.find((e: any) => e.id === row.employee_id);
      if (!employee || employee.active === false)
        throw new ApiError(401, "Correo o contraseña incorrectos, o cuenta desactivada.");
    }
    const token = randomBytes(32).toString("hex");
    await this.pool.query("DELETE FROM calendar.sessions WHERE expires_at < now()");
    await this.pool.query("INSERT INTO calendar.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')", [digest(token),row.id]);
    return { token, role: row.role };
  }
  async identify(gym: string, token: string): Promise<Identity> {
    const row = (await this.pool.query(`SELECT u.*,g.config FROM calendar.sessions s
      JOIN calendar.users u ON u.id=s.user_id JOIN calendar.gyms g ON g.id=u.gym_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.gym_id=$2 AND u.enabled`, [digest(token),gym])).rows[0];
    if (!row) throw new ApiError(401, "Inicia sesión para continuar.");
    if (row.role === "CLIENT") {
      const client = row?.config.clients.find((c: any) => c.id === row.client_id);
      if (!client || client.status === "BLOCKED") throw new ApiError(401, "Inicia sesión para continuar.");
      return { id: row.id, name: client.name, role: row.role, employeeId: null, clientId: client.id };
    }
    const employee = row?.config.employees.find((e: any) => e.id === row.employee_id);
    if (!employee || employee.active === false) throw new ApiError(401, "Inicia sesión para continuar.");
    return { id: row.id, name: employee.name, role: row.role, employeeId: employee.id, clientId: null };
  }
  async logout(token: string) {
    await this.pool.query("DELETE FROM calendar.sessions WHERE token_hash=$1", [digest(token)]);
  }
}
