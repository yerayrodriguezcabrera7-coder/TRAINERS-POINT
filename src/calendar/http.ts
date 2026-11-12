import { randomUUID,timingSafeEqual } from "node:crypto";
import { createServer,IncomingMessage,ServerResponse } from "node:http";
import { z,ZodError } from "zod";
import { Inventory } from "../finance/inventory";
import { clientPackageAlerts } from "../finance/packages";
import { serveAsset } from "../http/assets";
import { serveRuntime } from "../http/runtime";
import { Access,Identity,initialPassword } from "./access";
import { ApiError } from "./model";
import { Store } from "./store";
import { saveOmission, listOmissions } from './attendance-omissions';
import { attendanceCsv } from "./attendance-export";
import { mobileStaffView, staffClientIds } from "./mobile-view";
import type { CognitoVerifier } from "../cloud/cognito";
import { pendingPackages } from "../planning/pending-packages";
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
function workerBooking(booking:any){const {history,...visible}=booking;return visible;}
function clientBooking(booking:any){const {history,incidents,...visible}=booking;return visible;}
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
  options: { exposeAdminToken?: boolean; cognito?: CognitoVerifier } = {},
) {
  if (token.length < 24)
    throw new Error("CALENDAR_ADMIN_TOKEN debe tener al menos 24 caracteres.");
  const access = new Access(store.pool,store.clientsDb);
  const attempts = new Map<string, { count: number; until: number }>();
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const path = url.pathname;
      const gym = (req.headers["x-calendar-gym"] as string) || defaultGym;
      if (path === "/api/health") {
        send(res, 200, { mode: "server" });
        return;
      }
      if (path.startsWith("/api/")) {
        if (!(await store.gymExists(gym))) {
          if (!req.headers.authorization && !path.startsWith("/api/public/") && !["/api/login","/api/cognito/login"].includes(path))
            throw new ApiError(401,"Inicia sesión para continuar.");
          throw new ApiError(404, "Gimnasio desconocido.");
        }
        if (req.method === "POST" && (path === "/api/login" || path === "/api/cognito/login")) {
          const key = req.socket.remoteAddress || "unknown";
          const now = Date.now();
          for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
          const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
          if (attempt.count >= 20) throw new ApiError(429, "Demasiados intentos. Espera 15 minutos.");
          attempt.count++; attempts.set(key,attempt);
          const raw = await body(req);
          if (path === "/api/cognito/login") {
            if (!options.cognito) throw new ApiError(503, "El acceso con Cognito todavía no está activado en este centro.");
            const input = z.object({ accessToken: z.string().min(1).max(16384), portal: z.enum(["CLIENT","TRAINER","OFFICE"]).optional() }).parse(raw);
            send(res,200,await access.loginWithCognito(gym,await options.cognito(input.accessToken),input.portal));
          } else send(res,200,await access.login(gym,raw));
          attempts.delete(key);
          return;
        }
        const publicRoute = path.startsWith("/api/public/");
        let identity: Identity = { id: "bootstrap", name: "Administrador local", role: "ADMIN", employeeId: null, clientId: null, mustChangePassword: false };
        const hasPage = (pageKey: string): boolean => {
          if (identity.role === "ADMIN") return true;
          if (!identity.pagePermissions) return true; // null = use role defaults, no extra restriction
          return identity.pagePermissions.includes(pageKey);
        };
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
          if (req.method === "GET" && path === "/api/pending-packages") {
            if(!office || !hasPage('pendientes.html'))throw new ApiError(403,"Solo recepción y administración con permiso de pendientes pueden organizar los bonos.");
            send(res,200,{packages:store.clientsDb ? await pendingPackages(store.clientsDb,gym) : []});return;
          }
          if (req.method === "POST" && path === "/api/logout") { await access.logout(bearer); send(res,200,{ok:true}); return; }
          if (req.method === "POST" && path === "/api/password/change") {
            send(res,200,await access.changePassword(gym,bearer,await body(req)));
            return;
          }

          const workerAction=path.match(/^\/api\/bookings\/([^/]+)\/worker-action$/);
          if(workerAction && req.method==='POST'){
            if(!trainer)throw new ApiError(403,"Esta acción corresponde al trabajador asignado.");
            send(res,200,workerBooking(await store.workerAction(gym,decodeURIComponent(workerAction[1]),identity,await body(req))));return;
          }
          if (path === "/api/recoveries" && req.method === "GET") {
            if (!hasPage("recuperaciones.html")) throw new ApiError(403, "No tienes acceso a las recuperaciones.");
            const items = await store.recoveries(gym);
            send(res,200,trainer ? items.filter(r=>r.employeeId===identity.employeeId) : client ? items.filter(r=>r.clientId===identity.clientId) : items); return;
          }
          const defer = path.match(/^\/api\/bookings\/([^/]+)\/defer$/);
          if (defer && req.method === "POST") {
            if (!admin && !trainer) throw new ApiError(403,"Solo administración o entrenador puede autorizar una recuperación.");
            const raw = await body(req);
            send(res,201,await store.deferBooking(gym,decodeURIComponent(defer[1]),identity,raw.exception === true)); return;
          }
          if (path === "/api/client-calendar" && client) {
            if (!identity.clientId) throw new ApiError(403,"Cuenta sin cliente asociado.");
            const s=await store.state(gym);
            if(req.method === "GET") {
              send(res,200,{services:s.services.filter((v:any)=>v.active!==false), employees:s.employees.filter((v:any)=>v.active!==false).map((v:any)=>({id:v.id,name:v.name})), rooms:s.rooms, bookings:s.bookings.filter((v:any)=>v.clientId===identity.clientId).map(clientBooking), recoveries:(await store.recoveries(gym)).filter(v=>v.clientId===identity.clientId)});return;
            }
            if(req.method === "POST") {
              const raw=await body(req);
              if(!raw.employeeId)throw new ApiError(400,"Selecciona un trabajador.");
              send(res,201,await store.save(gym,{...raw,clientId:identity.clientId,id:undefined,version:undefined,status:"CONFIRMED",chargeAmount:undefined}));return;
            }
          }
          if(path === "/api/client-slots" && client && req.method === "GET") {
            send(res,200,await store.slots(gym,Object.fromEntries(url.searchParams)));return;
          }
          if (client) {
            throw new ApiError(403, "Tu perfil no tiene acceso a las funciones de gestión.");
          }

          if (req.method === "GET" && path === "/api/mobile/calendar") {
            send(res, 200, mobileStaffView(await store.state(gym), identity));
            return;
          }

          if (req.method === "GET" && path === "/api/manage") {
            const s = await store.state(gym);
          const [clientDebts, clientPackageAlertsMap] = await Promise.all([
            store.clientsDb ? new Inventory(store.clientsDb).debtSummary(gym) : {},
            store.clientsDb ? clientPackageAlerts(store.clientsDb, gym) : {},
          ]);
            let clients = s.clients;
            let bookings = s.bookings;
            let employees = s.employees;
            let staffNames = s.employees.map((e: any) => ({id:e.id,name:e.name}));
            if (trainer) {
              const trainerBookingClientIds = new Set(s.bookings.filter((b: any) => b.employeeId === identity.employeeId).map((b: any) => b.clientId));
              clients = s.clients.filter((c: any) => trainerBookingClientIds.has(c.id) || c.assignedWorkerId === identity.employeeId);
              bookings = s.bookings.filter((b: any) => b.employeeId === identity.employeeId).map(workerBooking);
              employees = s.employees.filter((e: any) => e.id === identity.employeeId);
              staffNames = employees.map((e: any) => ({id:e.id,name:e.name}));
            }
            send(res,200,{ ...identity, gymId:gym, centers:s.centers, revision:s.revision, timezone:s.timezone, schedule:s.schedule,
              clients,
              services: s.services,
              bookings,
              staffNames,
              employees: (admin || reception) ? s.employees : employees,
              users: admin ? await access.list(gym,s.clients) : [],
            }); return;
          }
                    const resetMatch = path.match(/^\/api\/manage\/users\/([^/]+)\/reset-password$/);
          if (resetMatch && req.method === "POST") {
            if (!admin) throw new ApiError(403, "Solo administración puede restablecer contraseñas.");
            const userId = decodeURIComponent(resetMatch[1]);
            const raw = await body(req).catch(() => ({}));
            const result = await access.adminResetPassword(gym, userId, raw?.password, identity.id !== "bootstrap" ? bearer : undefined);
            send(res, 200, result);
            return;
          }
          const permissionsMatch = path.match(/^\/api\/manage\/users\/([^/]+)\/permissions$/);
          if (permissionsMatch && req.method === 'PUT') {
            if (!admin) throw new ApiError(403, 'Solo administración puede gestionar permisos de página.');
            const userId = decodeURIComponent(permissionsMatch[1]);
            const raw = await body(req);
            const pages = z.array(z.string().min(1).max(200)).nullable().parse(raw.pagePermissions);
            send(res,200,await access.setPagePermissions(gym,userId,pages,identity));
            return;
          }
          if (path === "/api/calendar/shifts" && req.method === "POST") {
            if (!admin && !reception) throw new ApiError(403, "No tienes permiso para modificar turnos.");
            const raw = await body(req);
            const input = z.object({
              employeeId: z.string().min(1),
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              periods: z.array(z.object({
                open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
                close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
              })).nullable(),
            }).parse(raw);
            const result = await store.updateEmployeeShift(gym, input.employeeId, input.date, input.periods);
            send(res, 200, result);
            return;
          }
          if (path === "/api/calendar/shifts/copy-week" && req.method === "POST") {
            if (!admin && !reception) throw new ApiError(403, "No tienes permiso para planificar semanas.");
            const raw = await body(req);
            const input = z.object({
              fromMonday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              toMonday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            }).parse(raw);
            const result = await store.copyWeekShifts(gym, input.fromMonday, input.toMonday);
            send(res, 200, result);
            return;
          }
          const management = path.match(/^\/api\/manage\/(clients|services|employees|users)(?:\/([^/]+))?$/);
          if (management && ["POST","PUT"].includes(req.method || "")) {
            if (management[1] === "users" && (!admin || !hasPage("usuarios"))) throw new ApiError(403,"Solo administración puede gestionar usuarios.");
            if (management[1] === "services" && (!admin || !hasPage("servicios"))) throw new ApiError(403,"Solo administración puede modificar servicios.");
            if (management[1] === "employees" && (!admin && !reception || !hasPage("profesionales"))) throw new ApiError(403,"No tienes permiso para modificar esta sección.");
            if (management[1] === "clients" && (!admin && !reception || !hasPage("clientes"))) throw new ApiError(403,"No tienes permiso para modificar clientes.");
            if ((req.method === "PUT") !== Boolean(management[2])) throw new ApiError(400,"Ruta de edición inválida.");
            const raw = await body(req), id = management[2] ? decodeURIComponent(management[2]) : undefined;
            const result = management[1] === "users"
              ? await access.save(gym,raw.record,id,identity.id !== "bootstrap" ? bearer : undefined)
              : await store.manage(gym,management[1],raw.record,raw.revision,id);
            if (management[1] === "users" && identity.id === "bootstrap") {
              const session = await access.login(gym,{ username: raw.record.username, password: initialPassword });
              send(res,201,{...result,...session});
            } else send(res,id ? 200 : 201,result);
            return;
          }
          if (req.method === "GET" && path === "/api/leaves") {
            if (!hasPage("ausencias.html")) throw new ApiError(403, "No tienes acceso a las ausencias del equipo.");
            const leaves = await store.leaves(gym, identity.role === "ADMIN" ? undefined : identity.employeeId || "unassigned");
            const employees = (await store.state(gym)).employees as Array<{ id: string; name: string }>;
            send(res, 200, leaves.map((leave: any) => ({ ...leave, employeeName: employees.find((employee) => employee.id === leave.employeeId)?.name || "Empleado" })));
            return;
          }
          if (req.method === "POST" && path === "/api/leaves") {
            if (!hasPage("ausencias.html")) throw new ApiError(403, "No tienes acceso a las ausencias del equipo.");
            if (!identity.employeeId) throw new ApiError(403, "Inicia sesión con una cuenta de empleado.");
            send(res, 201, await store.requestLeave(gym, identity.employeeId, await body(req)));
            return;
          }
          const leaveAction = path.match(/^\/api\/leaves\/([^/]+)\/(review|cancel)$/);
          if (leaveAction && req.method === "PUT") {
            const id = decodeURIComponent(leaveAction[1]);
            if (leaveAction[2] === "review") {
              if (!admin) throw new ApiError(403, "Solo administración puede revisar solicitudes.");
              const raw = z.object({ status: z.enum(["APPROVED", "REJECTED"]) }).parse(await body(req));
              send(res, 200, await store.reviewLeave(gym, id, raw.status, identity.id));
            } else {
              if (!identity.employeeId) throw new ApiError(403, "Inicia sesión con una cuenta de empleado.");
              send(res, 200, await store.cancelLeave(gym, id, identity.employeeId));
            }
            return;
          }
          if (path === "/api/config" && !admin) throw new ApiError(403,"Solo administración puede cambiar horarios y configuración.");
          if (!office && !trainer && !["/api/attendance","/api/attendance/clock"].includes(path)) throw new ApiError(403,"Tu perfil no permite acceder a esta sección.");
        }
        if (req.method === "GET" && path === "/api/state") {
          const s = await store.state(gym);
          const [clientDebts, clientPackageAlertsMap] = await Promise.all([
            store.clientsDb ? new Inventory(store.clientsDb).debtSummary(gym) : {},
            store.clientsDb ? clientPackageAlerts(store.clientsDb, gym) : {},
          ]);
          if (identity.role === "TRAINER") {
            const visibleIds = staffClientIds(s, identity);
            const trainerBookingClientIds = new Set(s.bookings.filter((b: any) => b.employeeId === identity.employeeId).map((b: any) => b.clientId));
            send(res, 200, {
              ...s,
              clientDebts: Object.fromEntries(Object.entries(clientDebts).filter(([id]) => visibleIds.has(id))),
              clientPackageAlerts: Object.fromEntries(Object.entries(clientPackageAlertsMap).filter(([id]) => visibleIds.has(id))),
              bookings: s.bookings.filter((b: any) => b.employeeId === identity.employeeId).map(workerBooking),
              employees: s.employees.filter((e: any) => e.id === identity.employeeId),
              clients: s.clients.filter((c: any) => trainerBookingClientIds.has(c.id) || (c as any).assignedWorkerId === identity.employeeId),
              leaveRequests: s.leaveRequests.filter((l:any)=>l.employeeId===identity.employeeId),
            });
            return;
          }
          send(res, 200, { ...s, clientDebts, clientPackageAlerts: clientPackageAlertsMap });
          return;
        }
        if (path === '/api/attendance/omissions') {
          if (!hasPage("fichajes.html")) throw new ApiError(403, "No tienes acceso a los fichajes.");
          if(req.method==='POST'){send(res,201,await saveOmission(store.pool,gym,identity,await body(req)));return;}
          if(req.method==='GET'){send(res,200,await listOmissions(store.pool,gym,identity,url.searchParams.get('from')||'',url.searchParams.get('to')||''));return;}
          throw new ApiError(405,'Operación no permitida.');
        }
        if (req.method === "GET" && path === "/api/attendance/export") {
          if (!hasPage("fichajes.html")) throw new ApiError(403, "No tienes acceso a los fichajes.");
          if (!url.searchParams.get("from") || !url.searchParams.get("to")) throw new ApiError(400, "Selecciona las fechas del informe.");
          const requested = url.searchParams.get("employeeId") || undefined;
          if (!["ADMIN","RECEPTION"].includes(identity.role) && requested && requested !== identity.employeeId) throw new ApiError(403, "Solo puedes exportar tus propios fichajes.");
          const report = await store.attendance(gym, url.searchParams.get("from")!, url.searchParams.get("to")!, ["ADMIN","RECEPTION"].includes(identity.role) ? requested : identity.employeeId || "unassigned", identity.role);
          res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="fichajes-${report.from}-${report.to}.csv"` });
          res.end(attendanceCsv(report));
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
              ["ADMIN","RECEPTION"].includes(identity.role) ? undefined : identity.employeeId || "unassigned",
              identity.role,
            ),
          );
          return;
        }
        if (req.method === "POST" && path === "/api/attendance/clock") {
          const raw = await body(req);
          if (!["ADMIN","RECEPTION"].includes(identity.role) && raw.employeeId !== identity.employeeId) throw new ApiError(403,"Solo puedes registrar tus propios fichajes.");
          send(res, 201, await store.clock(gym, raw, identity));
          return;
        }
        if (req.method === "GET" && path === "/api/clients") {
          if (!hasPage("clientes")) throw new ApiError(403, "No tienes permiso para consultar clientes.");
          const s = await store.state(gym);
          const [clientDebts, clientPackageAlertsMap] = await Promise.all([
            store.clientsDb ? new Inventory(store.clientsDb).debtSummary(gym) : {},
            store.clientsDb ? clientPackageAlerts(store.clientsDb, gym) : {},
          ]);
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
          const [clientDebts, clientPackageAlertsMap] = await Promise.all([
            store.clientsDb ? new Inventory(store.clientsDb).debtSummary(gym) : {},
            store.clientsDb ? clientPackageAlerts(store.clientsDb, gym) : {},
          ]);
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
          if(!raw.booking?.employeeId)throw new ApiError(400,"Selecciona un trabajador.");
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
            await store.save(gym, raw.booking, undefined, raw.client,identity.id),
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
              identity.id,
              undefined,
              Boolean(raw.syncSession),
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
      if (req.method !== "GET" && req.method !== "HEAD") throw new ApiError(405, "Método no permitido.");
      if (path === "/runtime.js") {
        const expose = options.exposeAdminToken && await access.needsSetup(gym);
        await serveRuntime(req,res,expose?token:'');
        return;
      }
      if (!await serveAsset(req,res,path)) throw new ApiError(404,"Archivo desconocido.");
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
