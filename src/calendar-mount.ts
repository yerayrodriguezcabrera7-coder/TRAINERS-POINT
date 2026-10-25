// Punto de unión entre los dos proyectos: el arranque unificado (scripts/start.cjs)
// registra aquí el manejador HTTP del calendario y src/index.ts le delega
// /calendario/* y las rutas /api/* que no son propias del proyecto de clientes.
import type { IncomingMessage, ServerResponse } from "node:http";

export type CalendarHandler = (request: IncomingMessage, response: ServerResponse) => unknown;

let handler: CalendarHandler | undefined;

export function setCalendarHandler(next: CalendarHandler): void {
  handler = next;
}

export function getCalendarHandler(): CalendarHandler | undefined {
  return handler;
}
