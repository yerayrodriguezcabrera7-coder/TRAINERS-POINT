import { type IncomingMessage, type ServerResponse } from "node:http";
import type { ApiContext } from '../http/api-context';
import { readJsonBody, sendError, sendJson } from "../http/json";
import { prisma } from "../lib/prisma";
import { isRecord, parseServiceInput, serviceSelectFields } from "../validation/records";
export async function servicesRoutes(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiContext): Promise<boolean> {
  const { port, hasTrustedOrigin } = context;
  // GET /api/services/packs – only return packs (type=PACK) with service reference
  if (request.method === "GET" && url.pathname === "/api/services/packs") {
    const packs = await prisma.service.findMany({
      where: { type: "PACK", isActive: true },
      select: {
        ...serviceSelectFields,
      },
      orderBy: { name: "asc" },
    });
    sendJson(response, 200, { packages: packs });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/services") {
    const includeAll = url.searchParams.get("all") === "true" || url.searchParams.get("includeInactive") === "true";
    // Exclude packs from the main services list (those are managed in the Packs screen)
    const services = await prisma.service.findMany({
      where: includeAll ? undefined : { isActive: true, type: { not: "PACK" } },
      select: serviceSelectFields,
      orderBy: { name: "asc" },
    });
    sendJson(response, 200, { services });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/services") {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const input = parseServiceInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
    const service = await prisma.service.create({
      data: input,
      select: serviceSelectFields,
    });
    sendJson(response, 201, { service });
    return true;
  }
  const serviceItemMatch = url.pathname.match(/^\/api\/services\/([0-9a-f-]+)$/i);
  if (request.method === "PUT" && serviceItemMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const id = serviceItemMatch[1];
    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) {
      sendError(response, 404, "No se encontró el servicio.");
      return true;
    }
    const input = parseServiceInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
    const service = await prisma.service.update({
      where: { id },
      data: input,
      select: serviceSelectFields,
    });
    sendJson(response, 200, { service });
    return true;
  }
  const serviceStatusMatch = url.pathname.match(/^\/api\/services\/([0-9a-f-]+)\/status$/i);
  if (request.method === "PATCH" && serviceStatusMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const id = serviceStatusMatch[1];
    const body = await readJsonBody(request);
    if (!isRecord(body) || typeof body.isActive !== "boolean") {
      sendError(response, 400, "Indica si el servicio debe estar activo (true o false).");
      return true;
    }
    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) {
      sendError(response, 404, "No se encontró el servicio.");
      return true;
    }
    const service = await prisma.service.update({
      where: { id },
      data: { isActive: body.isActive },
      select: serviceSelectFields,
    });
    sendJson(response, 200, { service });
    return true;
  }
  if (request.method === "DELETE" && serviceItemMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const id = serviceItemMatch[1];
    const existing = await prisma.service.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true, packages: true } } },
    });
    if (!existing) {
      sendError(response, 404, "No se encontró el servicio.");
      return true;
    }
    if (existing._count.bookings > 0 || existing._count.packages > 0) {
      const service = await prisma.service.update({
        where: { id },
        data: { isActive: false },
        select: serviceSelectFields,
      });
      sendJson(response, 200, { service, deactivated: true, message: "El servicio tiene historial y ha sido desactivado en lugar de eliminado." });
      return true;
    }
    await prisma.service.delete({ where: { id } });
    sendJson(response, 200, { deleted: true, id });
    return true;
  }
  return false;
}
