import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import { ZodError } from "zod";
import { Access, accessMigration } from "./calendar/access";
import { server as createCalendarServer } from "./calendar/http";
import { ApiError } from "./calendar/model";
import { Store, migration as calendarMigration } from "./calendar/store";
import { serveAsset } from "./http/assets";
import { authorize } from './http/authorize';
import { sendError, sendJson } from "./http/json";
import { serveRuntime } from "./http/runtime";
import { prisma } from "./lib/prisma";
import { progressMigration } from "./progress-migration";
import { centersRoutes } from './routes/centers';
import { clientsRoutes } from './routes/clients';
import { financeRoutes } from './routes/finance';
import { packagesRoutes } from './routes/packages';
import { servicesRoutes } from './routes/services';
import { runtimeConfig } from "./runtime-config";
const deployment = runtimeConfig();
const host = deployment.host, port = deployment.port;
let calendarHandler: ((request: IncomingMessage, response: ServerResponse) => unknown) | undefined;
let calendarBootstrapToken = "";
let calendarAccess: Access | undefined;
let calendarPool: Pool | undefined;
let currentConfiguredGym = "trainers-point-bizkaia";
function isLocalRequest(request: IncomingMessage): boolean {
  if (deployment.production)
    return true;
  const address = request.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
function hasTrustedOrigin(request: IncomingMessage, port: number): boolean {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}` || origin === deployment.publicOrigin;
}
async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const context = { port, calendarAccess, calendarHandler, calendarBootstrapToken, currentConfiguredGym, calendarPool, hasTrustedOrigin };
  if (await authorize(request, response, url, context))
    return;
  for (const route of [financeRoutes, servicesRoutes, packagesRoutes, centersRoutes, clientsRoutes])
    if (await route(request, response, url, context))
      return;
  if (calendarHandler) {
    await calendarHandler(request, response);
    return;
  }
  sendError(response, 404, "No se encontró el recurso.");
}
const server = createServer(async (request, response) => {
  if (!isLocalRequest(request)) {
    sendError(response, 403, "La aplicación solo acepta conexiones locales.");
    return;
  }
  const hostHeader = request.headers.host;
  if (hostHeader !== `localhost:${port}` && hostHeader !== `127.0.0.1:${port}` && hostHeader !== (deployment.publicOrigin ? new URL(deployment.publicOrigin).host : undefined)) {
    sendError(response, 403, "Host no permitido.");
    return;
  }
  let url: URL;
  try {
    url = new URL(request.url ?? "/", `http://${hostHeader}`);
  }
  catch {
    sendError(response, 400, "La solicitud no es válida.");
    return;
  }
  // Las rutas antiguas conservan sus enlaces, pero toda la operativa vive en
  // la navegación y el estilo compartidos del calendario.
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    if (url.pathname === '/api/health') {
      try {
        await prisma.$queryRaw`SELECT 1`;
        sendJson(response, 200, { status: 'ok' });
      }
      catch {
        sendError(response, 503, 'La base de datos no está disponible.');
      }
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendError(response, 405, "Método no permitido.");
      return;
    }
    if (url.pathname === "/runtime.js") {
      await serveRuntime(request, response, deployment.production ? '' : calendarBootstrapToken);
      return;
    }
    if (!await serveAsset(request, response, url.pathname))
      sendError(response, 404, "No se encontró la página.");
  }
  catch (error) {
    if (error instanceof ApiError) {
      sendError(response, error.status, error.message);
      return;
    }
    if (error instanceof ZodError) {
      sendError(response, 400, "Revisa los datos enviados.");
      return;
    }
    if (error instanceof RangeError) {
      sendError(response, 413, "La solicitud supera el tamaño permitido.");
      return;
    }
    if (error instanceof SyntaxError) {
      sendError(response, 400, "El contenido JSON no es válido.");
      return;
    }
    if (!response.headersSent) {
      sendError(response, 500, "No se pudo completar la solicitud. Comprueba la base de datos.");
    }
    else {
      response.destroy();
    }
  }
});
async function start(): Promise<void> {
  const calendarDatabaseUrl = process.env.CALENDAR_DATABASE_URL || process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: calendarDatabaseUrl });
  const crmPool = calendarDatabaseUrl === process.env.DATABASE_URL
    ? pool
    : new Pool({ connectionString: process.env.DATABASE_URL });
  calendarPool = pool;
  const store = new Store(pool, prisma);
  calendarAccess = new Access(pool, prisma);
  await pool.query(calendarMigration);
  await pool.query(accessMigration);
  await crmPool.query(progressMigration);
  const activeGyms = await prisma.gym.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const configuredGym = activeGyms[0]?.id || "trainers-point-bizkaia";
  const developmentGyms = activeGyms.length ? activeGyms : [{ id: configuredGym, name: "Trainers Point" }];
  let gym = configuredGym;
  currentConfiguredGym = gym;
  const schedule = Array.from({ length: 7 }, (_, i) => ({ open: "09:00", close: i === 5 ? "14:00" : "21:00", closed: i === 6 }));
  const initialCalendarConfig = {
    leaveRequests: [],
    timezone: "Europe/Madrid",
    schedule,
    employees: [{ id: "e1", name: "Entrenador de prueba", color: "#8498bc", schedule }],
    services: [
      { id: "s1", name: "Personal 60 minutos", duration: 60, capacity: 1 },
      { id: "s2", name: "Valoración 45 minutos", duration: 45, capacity: 1 },
      { id: "s3", name: "Clase grupal", duration: 60, capacity: 4 },
    ],
    rooms: [{ id: "r1", name: "Sala principal" }],
    clients: [{ id: "c1", name: "Cliente de prueba", email: "cliente@example.com", phone: "", notes: "" }],
    location: {
      latitude: 43.2630,
      longitude: -2.9350,
      radiusMeters: 200,
      address: "Trainers Point · Bizkaia",
    },
  };
  if (!deployment.production)
    await store.seed(gym, initialCalendarConfig);
  if (process.env.TRAINERS_POINT_DEV_ADMIN === "true") {
    if (process.env.NODE_ENV === "production")
      throw new Error("No se permite activar la cuenta provisional admin/admin en producción.");
    let databaseHost: string;
    try {
      databaseHost = new URL(calendarDatabaseUrl || "").hostname.toLowerCase();
    }
    catch {
      throw new Error("La cuenta provisional requiere una CALENDAR_DATABASE_URL local válida.");
    }
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseHost))
      throw new Error("La cuenta provisional admin/admin solo se permite con PostgreSQL local; no se ha creado ninguna cuenta.");
    let createdAdmin = false;
    for (const activeGym of developmentGyms) {
      if (activeGym.id !== gym)
        await store.seed(activeGym.id, initialCalendarConfig);
      createdAdmin = await calendarAccess.seedLocalDevelopmentAdmin(activeGym.id) || createdAdmin;
    }
    if (createdAdmin)
      console.warn("Cuenta provisional local creada para centros sin cuentas previas. Usuario: admin · Contraseña: admin. No usar fuera de desarrollo.");
  }
  const token = process.env.CALENDAR_ADMIN_TOKEN || randomBytes(24).toString("hex");
  calendarBootstrapToken = token;
  const calendar = createCalendarServer(store, gym, token, { exposeAdminToken: !deployment.production });
  calendarHandler = calendar.listeners("request")[0] as (request: IncomingMessage, response: ServerResponse) => unknown;
  server.listen(port, host, () => console.log(`Trainers Point disponible en http://localhost:${port}/`));
  const close = () => {
    void server.close(async () => {
      calendar.close();
      await pool.end();
      if (crmPool !== pool)
        await crmPool.end();
      await prisma.$disconnect();
    });
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
void start().catch((error: unknown) => {
  console.error("No se pudo iniciar Trainers Point:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
