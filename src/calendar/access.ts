import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";
import { z } from "zod";
import { ApiError } from "./model";

const derive = promisify(scrypt);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const roles = ["ADMIN", "RECEPTION", "TRAINER"] as const;
export type Identity = { id: string; name: string; role: typeof roles[number]; employeeId: string | null };
const accountSchema = z.object({
  username: z.email().transform(v => v.toLowerCase()),
  employeeId: z.string().min(1).max(100),
  role: z.enum(roles),
  enabled: z.boolean(),
  password: z.string().min(10).max(128).optional(),
});
export const accessMigration = `
CREATE TABLE IF NOT EXISTS calendar.users (
 id text PRIMARY KEY, gym_id text NOT NULL REFERENCES calendar.gyms(id),
 employee_id text NOT NULL, username text NOT NULL, role text NOT NULL CHECK(role IN ('ADMIN','RECEPTION','TRAINER')),
 password_hash text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 UNIQUE(gym_id,username), UNIQUE(gym_id,employee_id));
CREATE TABLE IF NOT EXISTS calendar.sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES calendar.users(id), expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON calendar.sessions(user_id);`;

export class Access {
  constructor(private pool: Pool) {}
  async needsSetup(gym: string) {
    return !(await this.pool.query("SELECT 1 FROM calendar.users WHERE gym_id=$1 LIMIT 1",[gym])).rows.length;
  }
  async list(gym: string) {
    return (await this.pool.query(`SELECT id,employee_id AS "employeeId",username,role,enabled
      FROM calendar.users WHERE gym_id=$1 ORDER BY username`, [gym])).rows;
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
      const employee = gymRow.rows[0]?.config.employees.find((e: any) => e.id === input.employeeId);
      if (!employee || (input.enabled && employee.active === false))
        throw new ApiError(400, "Selecciona un empleado activo.");
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
      await db.query(`INSERT INTO calendar.users(id,gym_id,employee_id,username,role,password_hash,enabled)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET
        employee_id=EXCLUDED.employee_id,username=EXCLUDED.username,role=EXCLUDED.role,
        password_hash=EXCLUDED.password_hash,enabled=EXCLUDED.enabled`,
      [userId,gym,input.employeeId,input.username,input.role,hash || old?.password_hash,input.enabled]);
      await db.query("DELETE FROM calendar.sessions WHERE user_id=$1", [userId]);
      await db.query("COMMIT");
      return { id: userId };
    } catch (e) {
      await db.query("ROLLBACK");
      if ((e as any).code === "23505") throw new ApiError(409, "Ese correo o empleado ya tiene un usuario.");
      throw e;
    } finally { db.release(); }
  }
  async login(gym: string, raw: unknown) {
    const input = z.object({ username: z.string().max(254), password: z.string().max(128) }).parse(raw);
    const row = (await this.pool.query(`SELECT u.*,g.config FROM calendar.users u JOIN calendar.gyms g ON g.id=u.gym_id
      WHERE u.gym_id=$1 AND u.username=$2`, [gym,input.username.trim().toLowerCase()])).rows[0];
    const [salt, expected] = (row?.password_hash || "unavailable:" + "00".repeat(64)).split(":");
    const actual = (await derive(input.password, salt, 64)) as Buffer;
    const employee = row?.config.employees.find((e: any) => e.id === row.employee_id);
    if (!timingSafeEqual(actual, Buffer.from(expected,"hex")) || !row?.enabled || !employee || employee.active === false)
      throw new ApiError(401, "Correo o contraseña incorrectos, o cuenta desactivada.");
    const token = randomBytes(32).toString("hex");
    await this.pool.query("DELETE FROM calendar.sessions WHERE expires_at < now()");
    await this.pool.query("INSERT INTO calendar.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')", [digest(token),row.id]);
    return { token, role: row.role };
  }
  async identify(gym: string, token: string): Promise<Identity> {
    const row = (await this.pool.query(`SELECT u.*,g.config FROM calendar.sessions s
      JOIN calendar.users u ON u.id=s.user_id JOIN calendar.gyms g ON g.id=u.gym_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.gym_id=$2 AND u.enabled`, [digest(token),gym])).rows[0];
    const employee = row?.config.employees.find((e: any) => e.id === row.employee_id);
    if (!employee || employee.active === false) throw new ApiError(401, "Inicia sesión para continuar.");
    return { id: row.id, name: employee.name, role: row.role, employeeId: employee.id };
  }
  async logout(token: string) {
    await this.pool.query("DELETE FROM calendar.sessions WHERE token_hash=$1", [digest(token)]);
  }
}
