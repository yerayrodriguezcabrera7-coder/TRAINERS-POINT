import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { ZodError, z } from "zod";
import { Store } from "./store";
import { ApiError } from "./model";
import { Access, Identity, initialPassword } from "./access";
async function body(req: IncomingMessage) {
  let text = "";
  for await (const part of req) {
    text += part;
    if (Buffer.byteLength(text) > 1048576)
      throw new ApiError(413, "Petición demasiado grande.");
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new ApiError(400, "JSON inválido.");
  }
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
export function server(
  store: Store,
  defaultGym: string,
  token: string,
  options: { exposeAdminToken?: boolean } = {},
) {
  if (token.length < 24)
    throw new Error("CALENDAR_ADMIN_TOKEN debe tener al menos 24 caracteres.");
  const access = new Access(store.pool);
  const attempts = new Map<string, { count: number; until: number }>();
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const path = url.pathname;
      const gym = defaultGym;
      if (path === "/api/health") {
        send(res, 200, { mode: "server" });
        return;
      }
      if (path.startsWith("/api/")) {
        if (!(await store.gymExists(gym))) throw new ApiError(404, "Gimnasio desconocido.");
        if (req.method === "POST" && path === "/api/login") {
          const key = req.socket.remoteAddress || "unknown";
          const now = Date.now();
          for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
          const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
          if (attempt.count >= 20) throw new ApiError(429, "Demasiados intentos. Espera 15 minutos.");
          attempt.count++; attempts.set(key,attempt);
          send(res,200,await access.login(gym,await body(req)));
          attempts.delete(key);
          return;
        }
        const publicRoute = path.startsWith("/api/public/");
        let identity: Identity = { id: "bootstrap", name: "Administrador local", role: "ADMIN", employeeId: null, clientId: null, mustChangePassword: false };
        const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
        if (!publicRoute) {
          const actual = Buffer.from(req.headers.authorization || "");
          const expected = Buffer.from(`Bearer ${token}`);
          if (
            actual.length !== expected.length ||
            !timingSafeEqual(actual, expected) ||
            !(await access.needsSetup(gym))
          )
            identity = await access.identify(gym,bearer);
          const admin = identity.role === "ADMIN";
          const reception = identity.role === "RECEPTION";
          const trainer = identity.role === "TRAINER";
          const client = identity.role === "CLIENT";
          const office = admin || reception;

          if (identity.mustChangePassword &&
            !(req.method === "GET" && path === "/api/me") &&
            !(req.method === "POST" && path === "/api/password/change") &&
            !(req.method === "POST" && path === "/api/logout"))
            throw new ApiError(403, "Debes cambiar la contraseña antes de continuar.");

          if (req.method === "GET" && path === "/api/me") { send(res,200,identity); return; }
          if (req.method === "POST" && path === "/api/logout") { await access.logout(bearer); send(res,200,{ok:true}); return; }
          if (req.method === "POST" && path === "/api/password/change") {
            send(res,200,await access.changePassword(gym,bearer,await body(req)));
            return;
          }

          if (client) {
            throw new ApiError(403, "Tu perfil no tiene acceso a las funciones de gestión.");
          }

          if (req.method === "GET" && path === "/api/manage") {
            const s = await store.state(gym);
            let clients = s.clients;
            let bookings = s.bookings;
            let employees = s.employees;
            let staffNames = s.employees.map((e: any) => ({id:e.id,name:e.name}));
            if (trainer) {
              const trainerBookingClientIds = new Set(s.bookings.filter((b: any) => b.employeeId === identity.employeeId).map((b: any) => b.clientId));
              clients = s.clients.filter((c: any) => trainerBookingClientIds.has(c.id) || c.assignedWorkerId === identity.employeeId);
              bookings = s.bookings.filter((b: any) => b.employeeId === identity.employeeId);
              employees = s.employees.filter((e: any) => e.id === identity.employeeId);
              staffNames = employees.map((e: any) => ({id:e.id,name:e.name}));
            }
            send(res,200,{ ...identity, revision:s.revision, timezone:s.timezone, schedule:s.schedule,
              clients,
              services: s.services,
              bookings,
              staffNames,
              employees: (admin || reception) ? s.employees : employees,
              users: admin ? await access.list(gym) : [],
            }); return;
          }
          const management = path.match(/^\/api\/manage\/(clients|services|employees|users)(?:\/([^/]+))?$/);
          if (management && ["POST","PUT"].includes(req.method || "")) {
            if (management[1] === "users" && !admin) throw new ApiError(403,"Solo administración puede gestionar usuarios.");
            if (management[1] === "services" && !admin) throw new ApiError(403,"Solo administración puede modificar servicios.");
            if (management[1] === "employees" && !admin && !reception) throw new ApiError(403,"No tienes permiso para modificar esta sección.");
            if (management[1] === "clients" && !admin && !reception) throw new ApiError(403,"No tienes permiso para modificar clientes.");
            if ((req.method === "PUT") !== Boolean(management[2])) throw new ApiError(400,"Ruta de edición inválida.");
            const raw = await body(req), id = management[2] ? decodeURIComponent(management[2]) : undefined;
            const result = management[1] === "users"
              ? await access.save(gym,raw.record,id)
              : await store.manage(gym,management[1],raw.record,raw.revision,id);
            if (management[1] === "users" && identity.id === "bootstrap") {
              const session = await access.login(gym,{ username: raw.record.username, password: initialPassword });
              send(res,201,{...result,...session});
            } else send(res,id ? 200 : 201,result);
            return;
          }
          if (path === "/api/config" && !admin) throw new ApiError(403,"Solo administración puede cambiar horarios y configuración.");
          if (!office && !trainer && !["/api/attendance","/api/attendance/clock"].includes(path)) throw new ApiError(403,"Tu perfil no permite acceder a esta sección.");
        }
        if (req.method === "GET" && path === "/api/state") {
          const s = await store.state(gym);
          if (identity.role === "TRAINER") {
            const trainerBookingClientIds = new Set(s.bookings.filter((b: any) => b.employeeId === identity.employeeId).map((b: any) => b.clientId));
            send(res, 200, {
              ...s,
              bookings: s.bookings.filter((b: any) => b.employeeId === identity.employeeId),
              employees: s.employees.filter((e: any) => e.id === identity.employeeId),
              clients: s.clients.filter((c: any) => trainerBookingClientIds.has(c.id) || (c as any).assignedWorkerId === identity.employeeId),
            });
            return;
          }
          send(res, 200, s);
          return;
        }
        if (req.method === "GET" && path === "/api/attendance") {
          send(
            res,
            200,
            await store.attendance(
              gym,
              url.searchParams.get("from") || undefined,
              url.searchParams.get("to") || undefined,
              identity.role === "ADMIN" ? undefined : identity.employeeId || "unassigned",
              identity.role,
            ),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/attendance/clock") {
          const raw = await body(req);
          if (identity.role !== "ADMIN" && raw.employeeId !== identity.employeeId) throw new ApiError(403,"Solo puedes registrar tus propios fichajes.");
          send(res, 201, await store.clock(gym, raw));
          return;
        }
        if (req.method === "GET" && path === "/api/clients") {
          const s = await store.state(gym);
          let clients = s.clients;
          if (identity.role === "TRAINER") {
            const trainerBookingClientIds = new Set(s.bookings.filter((b: any) => b.employeeId === identity.employeeId).map((b: any) => b.clientId));
            clients = s.clients.filter((c: any) => trainerBookingClientIds.has(c.id) || (c as any).assignedWorkerId === identity.employeeId);
          }
          send(res, 200, {
            clients: clients.map((c: any) => ({
              id: c.id,
              firstName: c.name.split(" ")[0] || c.name,
              lastName: c.name.split(" ").slice(1).join(" ") || "",
              email: c.email || "",
              phone: c.phone || "",
              notes: c.notes || "",
              status: c.status || "ACTIVE",
              servicePackages: [],
              bookings: [],
            })),
            total: clients.length,
            counts: {},
          });
          return;
        }
        if (req.method === "GET" && path === "/api/public/catalog") {
          const s = await store.state(gym);
          send(res, 200, {
            timezone: s.timezone,
            employees: s.employees.filter((e: any) => e.active !== false).map(({ id, name }: any) => ({ id, name })),
            services: s.services.filter((s: any) => s.active !== false),
            rooms: s.rooms,
            sessions: s.bookings
              .filter((b: any) => b.sessionId && b.status !== "CANCELLED")
              .map((b: any) => ({
                sessionId: b.sessionId,
                employeeId: b.employeeId,
                serviceId: b.serviceId,
                roomId: b.roomId,
                date: b.date,
                start: b.start,
                end: b.end,
              })),
          });
          return;
        }
        if (
          req.method === "GET" &&
          ["/api/slots", "/api/public/slots"].includes(path)
        ) {
          const queryParams = Object.fromEntries(url.searchParams);
          if (identity.role === "TRAINER" && queryParams.employeeId && queryParams.employeeId !== identity.employeeId) {
            send(res, 200, []);
            return;
          }
          send(
            res,
            200,
            await store.slots(gym, queryParams),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/public/bookings") {
          const raw = await body(req);
          const client = z
            .object({
              name: z.string().trim().min(1).max(200),
              email: z.email(),
              phone: z.string().max(40).default(""),
            })
            .parse(raw.client);
          const clientId = randomUUID();
          const b = await store.save(
            gym,
            {
              ...raw.booking,
              clientId,
              status: "PENDING",
              id: undefined,
              version: undefined,
            },
            undefined,
            { id: clientId, ...client, notes: "" },
          );
          send(res, 201, { id: b.id, status: b.status });
          return;
        }
        if (req.method === "POST" && path === "/api/bookings") {
          if (identity.role === "TRAINER") throw new ApiError(403, "Tu perfil no permite modificar reservas.");
          const raw = await body(req);
          send(
            res,
            201,
            await store.save(gym, raw.booking, undefined, raw.client),
          );
          return;
        }
        if (req.method === "PUT" && path.startsWith("/api/bookings/")) {
          if (identity.role === "TRAINER") throw new ApiError(403, "Tu perfil no permite modificar reservas.");
          const raw = await body(req);
          send(
            res,
            200,
            await store.save(
              gym,
              raw.booking,
              decodeURIComponent(path.slice("/api/bookings/".length)),
              raw.client,
            ),
          );
          return;
        }
        if (req.method === "PUT" && path === "/api/config") {
          const raw = await body(req);
          send(res, 200, await store.configure(gym, raw.config, raw.revision));
          return;
        }
        throw new ApiError(404, "Ruta desconocida.");
      }
      if (req.method !== "GET") throw new ApiError(405, "Método no permitido.");
      const file =
        path === "/"
          ? "index.html"
          : path.replace(/^\//, "");
      if (file === "runtime.js" || path === "/runtime.js") {
        const exposeBootstrapToken = options.exposeAdminToken && (await access.needsSetup(gym));
        res.writeHead(200, {
          "Content-Type": "text/javascript",
          "Cache-Control": "no-store",
        });
        res.end(
          `window.CALENDAR_SERVER = true;(()=>{const f=window.fetch.bind(window);window.fetch=(i,o={})=>{const u=typeof i==='string'?i:i.url;if(u.startsWith('/api/')){const h=new Headers(o.headers||(typeof i!=='string'?i.headers:undefined)),g=localStorage.getItem('calendar-selected-gym');if(g)h.set('X-Calendar-Gym',g);const t=sessionStorage.getItem('calendar-user-token')||window.CALENDAR_DEV_TOKEN||sessionStorage.getItem('calendar-admin-token')||'';if(t&&!h.has('Authorization'))h.set('Authorization','Bearer '+t);o={...o,headers:h};}return f(i,o);};})();${
            exposeBootstrapToken
              ? `window.CALENDAR_DEV_TOKEN = ${JSON.stringify(token)};`
              : ""
          }`,
        );
        return;
      }
      const name = file.replace(/^\//, "");
      const allowed: Record<string, string> = {
        "index.html": "text/html",
        "app.js": "text/javascript",
        "calendar-core.js": "text/javascript",
        "styles.css": "text/css",
        "menu.css": "text/css",
        "design.css": "text/css",
        "inicio.html": "text/html",
        "inicio.css": "text/css",
        "inicio.js": "text/javascript",
        "menu.js": "text/javascript",
        "fichajes.html": "text/html",
        "fichajes.js": "text/javascript",
        "fichajes.css": "text/css",
        "gestion.html": "text/html",
        "gestion.js": "text/javascript",
        "gestion.css": "text/css",
        "gimnasios.html": "text/html",
        "gimnasios.js": "text/javascript",
        "gimnasios.css": "text/css",
        "login.html": "text/html",
        "login.js": "text/javascript",
        "change-password.html": "text/html",
        "change-password.js": "text/javascript",
      };
      if (!allowed[name]) throw new ApiError(404, "Archivo desconocido.");
      res.writeHead(200, {
        "Content-Type": allowed[name].startsWith("image/") ? allowed[name] : `${allowed[name]}; charset=utf-8`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(await readFile(resolve("web", name)));
    } catch (e) {
      if (e instanceof ZodError) {
        send(res, 400, {
          error: "Datos inválidos.",
          details: e.issues.map((i) => ({ path: i.path, message: i.message })),
        });
        return;
      }
      const code = (e as { code?: string }).code;
      const status =
        e instanceof ApiError ? e.status : code === "55P03" ? 503 : 500;
      if (status === 500)
        console.error("Calendar request failed:", (e as Error).message);
      send(res, status, {
        error:
          e instanceof ApiError
            ? e.message
            : status === 503
              ? "Reserva en curso. Vuelve a intentarlo."
              : "No se ha podido completar la operación.",
      });
    }
  });
}
