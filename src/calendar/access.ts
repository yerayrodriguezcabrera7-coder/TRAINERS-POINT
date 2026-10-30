import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { ApiError } from "./model";

const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
export const initialPassword = "Trainerspoint";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function derivePassword(password: string, salt: string, options: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { ...options, maxmem: SCRYPT_MAXMEM }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derivePassword(password, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString("hex")}`;
}
async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  let salt: string;
  let expected: Buffer;
  let options: { N: number; r: number; p: number };
  if (parts.length === 6 && parts[0] === "scrypt") {
    const [, n, r, p, encodedSalt, encodedHash] = parts;
    options = { N: Number(n), r: Number(r), p: Number(p) };
    if (![options.N, options.r, options.p].every(Number.isSafeInteger) ||
      options.N < 2 || options.N > SCRYPT_N || options.r < 1 || options.r > SCRYPT_R ||
      options.p < 1 || options.p > SCRYPT_P || !/^[a-f0-9]{32}$/i.test(encodedSalt) ||
      !/^[a-f0-9]{128}$/i.test(encodedHash)) {
      throw new Error("Formato de hash de contraseña inválido.");
    }
    salt = encodedSalt;
    expected = Buffer.from(encodedHash, "hex");
  } else {
    const [legacySalt, legacyHash] = encoded.split(":");
    salt = legacySalt || "unavailable";
    expected = /^[a-f0-9]{128}$/i.test(legacyHash || "") ? Buffer.from(legacyHash, "hex") : Buffer.alloc(64);
    options = { N: 16384, r: 8, p: 1 };
  }
  const actual = await derivePassword(password, salt, options);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const roles = ["ADMIN", "RECEPTION", "TRAINER", "CLIENT"] as const;
export type Identity = { id: string; name: string; role: typeof roles[number]; employeeId: string | null; clientId: string | null; mustChangePassword: boolean };
const accountSchema = z.object({
  username: z.string().trim().min(1).max(254).regex(/^[\p{L}\p{N}._@+-]+$/u, "El usuario no puede contener espacios ni símbolos no permitidos.").transform(v => v.toLowerCase()),
  employeeId: z.string().min(1).max(100).optional().nullable(),
  clientId: z.string().min(1).max(100).optional().nullable(),
  name: z.string().min(1).max(200).optional().nullable(),
  role: z.enum(roles),
  enabled: z.boolean(),
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
 must_change_password boolean NOT NULL DEFAULT false,
 UNIQUE(gym_id,username));
ALTER TABLE calendar.users ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE calendar.users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
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
      this.pool.query(`SELECT id,employee_id AS "employeeId",client_id AS "clientId",username,role,enabled,
        must_change_password AS "mustChangePassword"
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
      const passwordHash = old?.password_hash || await hashPassword(initialPassword);
      await db.query(`INSERT INTO calendar.users(id,gym_id,employee_id,client_id,username,role,password_hash,enabled,must_change_password)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET
        employee_id=EXCLUDED.employee_id,client_id=EXCLUDED.client_id,username=EXCLUDED.username,role=EXCLUDED.role,
        password_hash=EXCLUDED.password_hash,enabled=EXCLUDED.enabled,must_change_password=EXCLUDED.must_change_password`,
      [userId,gym,employeeId,clientId,input.username,input.role,passwordHash,input.enabled,old?.must_change_password || !old]);
      await db.query("DELETE FROM calendar.sessions WHERE user_id=$1", [userId]);
      await db.query("COMMIT");
      return { id: userId };
    } catch (e) {
      await db.query("ROLLBACK");
      if ((e as any).code === "23505") throw new ApiError(409, "Ese usuario, empleado o cliente ya tiene una cuenta.");
      throw e;
    } finally { db.release(); }
  }
  async login(gym: string, raw: unknown) {
    const input = z.object({ username: z.string().max(254), password: z.string().max(128) }).parse(raw);
    const row = (await this.pool.query(`SELECT u.*,g.config FROM calendar.users u JOIN calendar.gyms g ON g.id=u.gym_id
      WHERE u.gym_id=$1 AND u.username=$2`, [gym,input.username.trim().toLowerCase()])).rows[0];
    const passwordMatches = await verifyPassword(input.password, row?.password_hash ||
      `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${"00".repeat(16)}$${"00".repeat(64)}`);
    if (!passwordMatches || !row?.enabled)
      throw new ApiError(401, "Usuario o contraseña incorrectos, o cuenta desactivada.");
    if (row.password_hash.includes(":")) {
      await this.pool.query("UPDATE calendar.users SET password_hash=$2 WHERE id=$1", [row.id,await hashPassword(input.password)]);
    }
    if (row.role === "CLIENT") {
      const client = row?.config.clients.find((c: any) => c.id === row.client_id);
      if (!client || client.status === "BLOCKED")
        throw new ApiError(401, "Usuario o contraseña incorrectos, o cuenta desactivada.");
    } else {
      const employee = row?.config.employees.find((e: any) => e.id === row.employee_id);
      if (!employee || employee.active === false)
        throw new ApiError(401, "Usuario o contraseña incorrectos, o cuenta desactivada.");
    }
    const token = randomBytes(32).toString("hex");
    await this.pool.query("DELETE FROM calendar.sessions WHERE expires_at < now()");
    await this.pool.query("INSERT INTO calendar.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')", [digest(token),row.id]);
    return { token, role: row.role, mustChangePassword: row.must_change_password };
  }
  async changePassword(gym: string, token: string, raw: unknown) {
    const input = z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(12).max(128).refine(value => value !== initialPassword, "Elige una contraseña distinta de la temporal."),
      confirmPassword: z.string().min(1).max(128),
    }).refine(value => value.newPassword === value.confirmPassword, {
      message: "Las contraseñas nuevas no coinciden.",
      path: ["confirmPassword"],
    }).parse(raw);
    const tokenHash = digest(token);
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const row = (await db.query(`SELECT u.id,u.password_hash FROM calendar.sessions s
        JOIN calendar.users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>now() AND u.gym_id=$2 AND u.enabled FOR UPDATE OF u`, [tokenHash,gym])).rows[0];
      if (!row) throw new ApiError(401, "Inicia sesión para continuar.");
      if (!(await verifyPassword(input.currentPassword, row.password_hash)))
        throw new ApiError(400, "La contraseña actual no es correcta.");
      if (input.currentPassword === input.newPassword)
        throw new ApiError(400, "La nueva contraseña debe ser distinta de la actual.");
      const passwordHash = await hashPassword(input.newPassword);
      await db.query(`UPDATE calendar.users SET password_hash=$2,must_change_password=false WHERE id=$1`, [row.id,passwordHash]);
      await db.query("DELETE FROM calendar.sessions WHERE user_id=$1 AND token_hash<>$2", [row.id,tokenHash]);
      await db.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  async identify(gym: string, token: string): Promise<Identity> {
    const row = (await this.pool.query(`SELECT u.*,g.config FROM calendar.sessions s
      JOIN calendar.users u ON u.id=s.user_id JOIN calendar.gyms g ON g.id=u.gym_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.gym_id=$2 AND u.enabled`, [digest(token),gym])).rows[0];
    if (!row) throw new ApiError(401, "Inicia sesión para continuar.");
    if (row.role === "CLIENT") {
      const client = row?.config.clients.find((c: any) => c.id === row.client_id);
      if (!client || client.status === "BLOCKED") throw new ApiError(401, "Inicia sesión para continuar.");
      return { id: row.id, name: client.name, role: row.role, employeeId: null, clientId: client.id, mustChangePassword: row.must_change_password };
    }
    const employee = row?.config.employees.find((e: any) => e.id === row.employee_id);
    if (!employee || employee.active === false) throw new ApiError(401, "Inicia sesión para continuar.");
    return { id: row.id, name: employee.name, role: row.role, employeeId: employee.id, clientId: null, mustChangePassword: row.must_change_password };
  }
  async logout(token: string) {
    await this.pool.query("DELETE FROM calendar.sessions WHERE token_hash=$1", [digest(token)]);
  }
}
