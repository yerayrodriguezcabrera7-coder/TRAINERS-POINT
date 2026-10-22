import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { ZodError, z } from "zod";
import { Store } from "./store";
import { ApiError } from "./model";
async function body(req: IncomingMessage) {
  let text = "";
  for await (const part of req) {
    text += part;
    if (Buffer.byteLength(text) > 32768)
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
  gym: string,
  token: string,
  options: { exposeAdminToken?: boolean } = {},
) {
  if (token.length < 24)
    throw new Error("CALENDAR_ADMIN_TOKEN debe tener al menos 24 caracteres.");
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const path = url.pathname;
      if (path === "/api/health") {
        send(res, 200, { mode: "server" });
        return;
      }
      if (path.startsWith("/api/")) {
        const publicRoute = path.startsWith("/api/public/");
        if (!publicRoute) {
          const actual = Buffer.from(req.headers.authorization || "");
          const expected = Buffer.from(`Bearer ${token}`);
          if (
            actual.length !== expected.length ||
            !timingSafeEqual(actual, expected)
          )
            throw new ApiError(401, "Clave de administración incorrecta.");
        }
        if (req.method === "GET" && path === "/api/state") {
          send(res, 200, await store.state(gym));
          return;
        }
        if (req.method === "GET" && path === "/api/public/catalog") {
          const s = await store.state(gym);
          send(res, 200, {
            timezone: s.timezone,
            employees: s.employees.map(({ id, name }: any) => ({ id, name })),
            services: s.services,
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
          send(
            res,
            200,
            await store.slots(gym, Object.fromEntries(url.searchParams)),
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
          const raw = await body(req);
          send(
            res,
            201,
            await store.save(gym, raw.booking, undefined, raw.client),
          );
          return;
        }
        if (req.method === "PUT" && path.startsWith("/api/bookings/")) {
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
        path === "/" || path === "/calendario/"
          ? "index.html"
          : path.replace(/^\/calendario\//, "");
      if (file === "runtime.js" || path === "/runtime.js") {
        res.writeHead(200, {
          "Content-Type": "text/javascript",
          "Cache-Control": "no-store",
        });
        res.end(
          `window.CALENDAR_SERVER = true;${
            options.exposeAdminToken
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
      };
      if (!allowed[name]) throw new ApiError(404, "Archivo desconocido.");
      res.writeHead(200, {
        "Content-Type": `${allowed[name]}; charset=utf-8`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(await readFile(resolve("calendario", name)));
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
