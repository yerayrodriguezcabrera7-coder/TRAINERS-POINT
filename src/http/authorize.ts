import { type IncomingMessage, type ServerResponse } from "node:http";
import { type Identity } from "../calendar/access";
import type { ApiContext } from './api-context';
import { sendError } from "./json";
export async function authorize(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiContext): Promise<boolean> {
  const { calendarAccess, calendarHandler, calendarBootstrapToken, currentConfiguredGym } = context;
  const isPublic = url.pathname === "/api/health" || url.pathname === "/api/login" || url.pathname.startsWith("/api/public/");
  if (!isPublic && calendarAccess) {
    const bearer = (request.headers.authorization || "").replace(/^Bearer /, "");
    let selectedGym = (request.headers["x-calendar-gym"] as string) || currentConfiguredGym;
    let identity: Identity | null = null;
    if (bearer && bearer === calendarBootstrapToken && (await calendarAccess.needsSetup(selectedGym))) {
      identity = { id: "bootstrap", name: "Administrador local", role: "ADMIN", employeeId: null, clientId: null, mustChangePassword: false };
    }
    else if (bearer) {
      try {
        identity = await calendarAccess.identify(selectedGym, bearer);
      }
      catch {
        identity = null;
      }
    }
    if (!identity && bearer && url.pathname === "/api/gyms" && selectedGym !== currentConfiguredGym) {
      try {
        selectedGym = currentConfiguredGym;
        identity = await calendarAccess.identify(selectedGym, bearer);
      }
      catch {
        identity = null;
      }
    }
    if (!identity) {
      const calendarOnlyRoutes = ["/api/client-calendar", "/api/client-slots", "/api/leaves", "/api/recoveries", "/api/me", "/api/logout", "/api/password/change", "/api/manage", "/api/state", "/api/attendance", "/api/bookings", "/api/config", "/api/slots"];
      const isCalendarOnly = calendarOnlyRoutes.some(p => url.pathname === p || url.pathname.startsWith(p + "/"));
      if (isCalendarOnly && calendarHandler) {
        await calendarHandler(request, response);
        return true;
      }
      sendError(response, 401, "Inicia sesión para continuar.");
      return true;
    }
    if (identity.mustChangePassword &&
      url.pathname !== "/api/me" &&
      url.pathname !== "/api/logout" &&
      url.pathname !== "/api/password/change") {
      sendError(response, 403, "Debes cambiar la contraseña antes de continuar.");
      return true;
    }
    if (identity.role === "CLIENT") {
      const isMeOrLogout = ["/api/client-calendar", "/api/client-slots", "/api/recoveries"].includes(url.pathname) || url.pathname === "/api/me" || url.pathname === "/api/logout" || url.pathname === "/api/password/change";
      if (!isMeOrLogout) {
        sendError(response, 403, "Tu perfil no tiene acceso a las funciones de gestión.");
        return true;
      }
    }
    if (url.pathname.startsWith("/api/gyms")) {
      if (identity.role !== "ADMIN" && !(identity.role === "RECEPTION" && request.method === "GET")) {
        sendError(response, 403, "Solo administración puede gestionar sedes.");
        return true;
      }
    }
    if (identity.role === "TRAINER") {
      if (url.pathname.startsWith("/api/services") && request.method !== "GET") {
        sendError(response, 403, "Tu perfil no permite modificar servicios.");
        return true;
      }
      if (url.pathname.startsWith("/api/clients") && request.method !== "GET") {
        sendError(response, 403, "Tu perfil no permite modificar fichas de clientes.");
        return true;
      }
      if (url.pathname.startsWith("/api/service-packages") || /^\/api\/bookings\/[^/]+\/attendance$/.test(url.pathname)) {
        sendError(response, 403, "Tu perfil no permite modificar bonos ni asistencia de clientes.");
        return true;
      }
    }
    (request as any).identity = identity;
    (request as any).selectedGym = selectedGym;
  }
  return false;
}
