import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
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
type LinkedClient = { id: string; name: string; email?: string; phone?: string; notes?: string; status?: string };
const slugUsername = (name: string) => name.toLocaleLowerCase("es").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 60) || "cliente";
const gymSlug = (value: string) => value.toLocaleLowerCase("es").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const accountSchema = z.object({
  username: z.string().trim().min(1).max(254).regex(/^[\p{L}\p{N}._@+-]+$/u, "El usuario no puede contener espacios ni símbolos no permitidos.").transform(v => v.toLowerCase()),
  employeeId: z.string().min(1).max(100).optional().nullable(),
  clientId: z.string().min(1).max(100).optional().nullable(),
  name: z.string().min(1).max(200).optional().nullable(),
  role: z.enum(roles),
  enabled: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.role === "CLIENT") {
    if (!data.clientId) ctx.addIssue({ code: "custom", message: "Selecciona el cliente que tendrá acceso.", path: ["clientId"] });
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
  constructor(private pool: Pool, private clientsDb?: PrismaClient) {}
  async needsSetup(gym: string) {
    return !(await this.pool.query("SELECT 1 FROM calendar.users WHERE gym_id=$1 LIMIT 1",[gym])).rows.length;
  }
  async seedLocalDevelopmentAdmin(gym: string) {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const gymRow = (await db.query("SELECT config FROM calendar.gyms WHERE id=$1 FOR UPDATE", [gym])).rows[0];
      if (!gymRow) throw new ApiError(404, "Gimnasio desconocido.");
      const existing = await db.query("SELECT 1 FROM calendar.users WHERE gym_id=$1 LIMIT 1", [gym]);
      if (existing.rowCount) {
        await db.query("COMMIT");
        return false;
      }
      const employee = (gymRow.config?.employees || []).find((item: any) => item.active !== false);
      if (!employee) throw new ApiError(400, "Añade un empleado activo antes de crear el administrador local.");
      const passwordHash = await hashPassword("admin");
      await db.query(`INSERT INTO calendar.users(id,gym_id,employee_id,username,role,password_hash,enabled,must_change_password)
        VALUES($1,$2,$3,'admin','ADMIN',$4,true,false)`, [randomUUID(),gym,employee.id,passwordHash]);
      await db.query("COMMIT");
      return true;
    } catch (error) {
      await db.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505")
        throw new ApiError(409, "No se pudo crear el administrador provisional porque ya existe una cuenta.");
      throw error;
    } finally {
      db.release();
    }
  }
  async list(gym: string, linkedClients: LinkedClient[] = []) {
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
        name = linkedClients.find(c => c.id === u.clientId)?.name ||
          clients.find((c: any) => c.id === u.clientId)?.name || "";
      } else {
        name = employees.find((e: any) => e.id === u.employeeId)?.name || "";
      }
      return { ...u, name };
    });
  }
  async save(gym: string, raw: unknown, id?: string, callerToken?: string) {
    const input = accountSchema.parse(raw);
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const gymRow = await db.query("SELECT config FROM calendar.gyms WHERE id=$1 FOR UPDATE", [gym]);
      const config = gymRow.rows[0]?.config || { employees: [], clients: [] };
      let employeeId = input.role === "CLIENT" ? null : input.employeeId;
      let clientId = input.role === "CLIENT" ? input.clientId : null;

      if (input.role === "CLIENT") {
        const client = config.clients?.find((c: any) => c.id === clientId) ||
          await this.findExternalClient(gym, clientId!);
        if (!client || (input.enabled && client.status === "BLOCKED"))
          throw new ApiError(400, "Selecciona un cliente activo.");
      } else {
        if (input.name) {
          const trimmed = input.name.trim();
          let employee = employeeId ? config.employees?.find((e: any) => e.id === employeeId) : null;
          // Solo usar el "Entrenador de prueba" como placeholder reemplazable cuando no hay employeeId explícito
          // Y ese placeholder no tiene ya una cuenta de usuario vinculada.
          // El nombre de una persona no es criterio de unicidad: pueden existir varias personas con el mismo
          // nombre y roles distintos (cliente, entrenador, etc.). No se busca empleado por nombre.
          if (!employee && config.employees?.length === 1 && config.employees[0].name === "Entrenador de prueba") {
            const placeholderId = config.employees[0].id;
            const placeholderHasAccount = (await db.query(
              "SELECT 1 FROM calendar.users WHERE gym_id=$1 AND employee_id=$2" + (id ? " AND id<>$3" : ""),
              id ? [gym, placeholderId, id] : [gym, placeholderId]
            )).rows.length > 0;
            if (!placeholderHasAccount) {
              employee = config.employees[0];
            }
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
      // Comprobar de forma explícita si el username ya está en uso por otro usuario del mismo gimnasio.
      // Esto garantiza un mensaje de error claro antes de intentar el INSERT.
      const usernameCheck = await db.query(
        "SELECT 1 FROM calendar.users WHERE gym_id=$1 AND username=$2" + (id ? " AND id<>$3" : ""),
        id ? [gym, input.username, id] : [gym, input.username]
      );
      if (usernameCheck.rows.length) {
        throw new ApiError(409, "Ese nombre de usuario ya está en uso. Elige un nombre de usuario diferente.");
      }
      const userId = id || randomUUID();
      const passwordHash = old?.password_hash || await hashPassword(initialPassword);
      await db.query(`INSERT INTO calendar.users(id,gym_id,employee_id,client_id,username,role,password_hash,enabled,must_change_password)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET
        employee_id=EXCLUDED.employee_id,client_id=EXCLUDED.client_id,username=EXCLUDED.username,role=EXCLUDED.role,
        password_hash=EXCLUDED.password_hash,enabled=EXCLUDED.enabled,must_change_password=EXCLUDED.must_change_password`,
      [userId,gym,employeeId,clientId,input.username,input.role,passwordHash,input.enabled,old?.must_change_password || !old]);
      // Al invalidar sesiones del usuario modificado, preservar la sesión del admin que realiza la operación
      // (en caso de que el admin esté editando su propia cuenta).
      const callerTokenHash = callerToken ? digest(callerToken) : null;
      if (callerTokenHash) {
        await db.query("DELETE FROM calendar.sessions WHERE user_id=$1 AND token_hash<>$2", [userId, callerTokenHash]);
      } else {
        await db.query("DELETE FROM calendar.sessions WHERE user_id=$1", [userId]);
      }
      await db.query("COMMIT");
      return { id: userId };
    } catch (e) {
      await db.query("ROLLBACK");
      if ((e as any).code === "23505") {
        // Determinar si el conflicto es por nombre de usuario o por empleado/cliente ya vinculado
        const constraint = (e as any).constraint || "";
        if (constraint.includes("username") || constraint === "users_gym_id_username_key" || constraint === "calendar_users_gym_id_username_key") {
          throw new ApiError(409, "Ese nombre de usuario ya está en uso. Elige un nombre de usuario diferente.");
        } else if (constraint.includes("employee")) {
          throw new ApiError(409, "Ese empleado ya tiene una cuenta vinculada.");
        } else if (constraint.includes("client")) {
          throw new ApiError(409, "Ese cliente ya tiene una cuenta vinculada.");
        }
        // Si no podemos identificar la restricción exacta, comprobar el username en BD
        const usernameConflict = await db.query(
          "SELECT 1 FROM calendar.users WHERE gym_id=$1 AND username=$2" + (id ? " AND id<>$3" : ""),
          id ? [gym, input.username, id] : [gym, input.username]
        );
        if (usernameConflict.rows.length) {
          throw new ApiError(409, "Ese nombre de usuario ya está en uso. Elige un nombre de usuario diferente.");
        }
        throw new ApiError(409, "Ese empleado o cliente ya tiene una cuenta vinculada.");
      }
      throw e;
    } finally { db.release(); }
  }
  async createClientAccount(gym: string, gymName: string, client: LinkedClient) {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [gym]);
      let gymRow = (await db.query("SELECT config FROM calendar.gyms WHERE id=$1 FOR UPDATE", [gym])).rows[0];
      if (!gymRow) {
        const template = (await db.query("SELECT config FROM calendar.gyms ORDER BY id LIMIT 1 FOR SHARE")).rows[0];
        if (!template) throw new ApiError(404, "No hay una configuración de gimnasio para crear la cuenta del cliente.");
        await db.query("INSERT INTO calendar.gyms(id,name,config) VALUES($1,$2,$3)", [gym,gymName,template.config]);
        gymRow = { config: template.config };
      }
      const config = gymRow.config || { clients: [] };
      config.clients = config.clients || [];
      const existingClient = config.clients.find((item: any) => item.id === client.id);
      const status = client.status === "BAJA" ? "BLOCKED" :
        client.status === "INACTIVO" ? "INACTIVE" : "ACTIVE";
      const linkedClient = {
        id: client.id,
        name: client.name,
        email: client.email || "",
        phone: client.phone || "",
        notes: client.notes || "",
        status,
      };
      if (existingClient) Object.assign(existingClient, linkedClient);
      else config.clients.push(linkedClient);
      await db.query("UPDATE calendar.gyms SET config=$2 WHERE id=$1", [gym,config]);

      const existingAccount = (await db.query("SELECT username FROM calendar.users WHERE gym_id=$1 AND client_id=$2", [gym,client.id])).rows[0];
      if (existingAccount) throw new ApiError(409, "Este cliente ya tiene una cuenta de acceso.");
      const base = slugUsername(client.name);
      const usernames = new Set((await db.query("SELECT username FROM calendar.users WHERE gym_id=$1", [gym])).rows.map(row => row.username as string));
      let username = base;
      for (let suffix = 2; usernames.has(username); suffix++) username = `${base.slice(0, 60 - String(suffix).length - 1)}.${suffix}`;
      const userId = randomUUID();
      const passwordHash = await hashPassword(initialPassword);
      await db.query(`INSERT INTO calendar.users(id,gym_id,employee_id,client_id,username,role,password_hash,enabled,must_change_password)
        VALUES($1,$2,NULL,$3,$4,'CLIENT',$5,true,true)`, [userId,gym,client.id,username,passwordHash]);
      await db.query("COMMIT");
      return { id: userId, username };
    } catch (error) {
      await db.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505")
        throw new ApiError(409, "Este cliente ya tiene una cuenta de acceso.");
      throw error;
    } finally {
      db.release();
    }
  }
  private async findExternalClient(gym: string, clientId: string): Promise<LinkedClient | null> {
    if (!this.clientsDb) return null;
    const calendarGym = (await this.pool.query("SELECT name FROM calendar.gyms WHERE id=$1", [gym])).rows[0];
    if (!calendarGym) return null;
    const gyms = await this.clientsDb.gym.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const externalGym = gyms.find(item => item.id === calendarGym.name || gymSlug(item.name) === gymSlug(String(calendarGym.name)));
    if (!externalGym) return null;
    const client = await this.clientsDb.client.findFirst({
      where: { id: clientId, gymId: externalGym.id },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, notes: true, status: true },
    });
    if (!client) return null;
    return {
      id: client.id,
      name: `${client.firstName} ${client.lastName}`.trim(),
      email: client.email,
      phone: client.phone,
      notes: client.notes || "",
      status: client.status === "BAJA" ? "BLOCKED" : client.status === "INACTIVO" ? "INACTIVE" : "ACTIVE",
    };
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
      const client = (row.client_id ? await this.findExternalClient(gym,row.client_id) : null) ||
        row?.config.clients.find((c: any) => c.id === row.client_id);
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
      const client = (row.client_id ? await this.findExternalClient(gym,row.client_id) : null) ||
        row?.config.clients.find((c: any) => c.id === row.client_id);
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
