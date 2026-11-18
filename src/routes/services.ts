import { type IncomingMessage, type ServerResponse } from "node:http";
import { type Identity } from "../calendar/access";
import { ApiError } from "../calendar/model";
import type { ApiContext } from '../http/api-context';
import { readJsonBody, sendError, sendJson } from "../http/json";
import { prisma } from "../lib/prisma";
import { queryCache } from "../cache/query-cache";
import { isRecord, parseServiceInput, serviceSelectFields } from "../validation/records";
async function enrichPacks(packs: any[]) {
  const linkedIds = [...new Set(packs.map(pack => pack.serviceId).filter(Boolean))];
  const linked = linkedIds.length ? await prisma.service.findMany({ where: { id: { in: linkedIds }, type: { not: 'PACK' } }, select: { id: true, name: true, color: true, modality: true, durationMin: true, category: true } }) : [];
  const byId = new Map(linked.map(service => [service.id, service]));
  return packs.map(pack => {
    const base = byId.get(pack.serviceId);
    return { ...pack, service: base || null, color: base?.color || pack.color, modality: base?.modality || pack.modality, durationMin: base?.durationMin || pack.durationMin };
  });
}
async function inheritLinkedService(input: any) {
  if (typeof input === 'string' || input.type !== 'PACK') return input;
  if (!input.serviceId) return 'Selecciona el servicio base al que pertenece este pack.';
  const base = await prisma.service.findFirst({ where: { id: input.serviceId, type: { not: 'PACK' }, isActive: true }, select: { color: true, modality: true, durationMin: true } });
  if (!base) return 'Elige un servicio base activo para este pack.';
  return { ...input, color: base.color, modality: base.modality, durationMin: base.durationMin };
}
function requireCatalogPage(request: IncomingMessage, page: 'servicios' | 'packs.html', allowDefaultReception = false) {
  const actor = (request as any).identity as Identity | undefined;
  if (!actor) throw new ApiError(401, 'Inicia sesión para continuar.');
  if (actor.role === 'ADMIN') return;
  if (Array.isArray(actor.pagePermissions)) {
    if (actor.pagePermissions.includes(page)) return;
  } else if (allowDefaultReception && actor.role === 'RECEPTION') return;
  throw new ApiError(403, 'Tu perfil no tiene permiso para gestionar este catálogo.');
}
const DEFAULT_SERVICES = [
  { name: 'Individual', modality: 'INDIVIDUAL', color: '#317b9b', durationMin: 60, category: 'TRAINING' as const },
  { name: 'Dual', modality: 'DUAL', color: '#b85c38', durationMin: 60, category: 'TRAINING' as const },
  { name: 'Cabina', modality: 'INDIVIDUAL', color: '#477458', durationMin: 60, category: 'CABIN' as const },
  { name: 'Estudio Corporal', modality: 'INDIVIDUAL', color: '#885b9c', durationMin: 60, category: 'TRAINING' as const },
] as const;

async function ensureDefaultServices() {
  for (const def of DEFAULT_SERVICES) {
    const existing = await prisma.service.findFirst({
      where: {
        type: { not: 'PACK' },
        name: { equals: def.name, mode: 'insensitive' }
      }
    });
    if (!existing) {
      await prisma.service.create({
        data: {
          name: def.name,
          modality: def.modality,
          color: def.color,
          durationMin: def.durationMin,
          category: def.category,
          type: 'SESION_INDIVIDUAL',
          trainingCount: 1,
          price: 0,
          validityWeeks: 4,
          isActive: true
        }
      });
    }
  }
}

export async function servicesRoutes(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiContext): Promise<boolean> {
  const { port, hasTrustedOrigin } = context;
  // GET /api/services/packs – only return packs (type=PACK) with service reference
  if (request.method === "GET" && url.pathname === "/api/services/packs") {
    requireCatalogPage(request, 'packs.html', true);
    const includeAll = url.searchParams.get('all') === 'true' || url.searchParams.get('includeInactive') === 'true';
    const packs = await prisma.service.findMany({
      where: { type: "PACK", ...(includeAll ? {} : { isActive: true }) },
      select: {
        ...serviceSelectFields,
      },
      orderBy: { name: "asc" },
    });
    sendJson(response, 200, { packages: await enrichPacks(packs) });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/services") {
    await ensureDefaultServices();
    const includeAll = url.searchParams.get("all") === "true" || url.searchParams.get("includeInactive") === "true";
    // Exclude packs from the main services list (those are managed in the Packs screen)
    const services = await prisma.service.findMany({
      // Inactive services may be requested by administration, but packs are
      // never part of the service catalogue. Packs have their own screen/API.
      where: { type: { not: "PACK" }, ...(includeAll ? {} : { isActive: true }) },
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
    const input = await inheritLinkedService(parseServiceInput(await readJsonBody(request)));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
    requireCatalogPage(request, input.type === 'PACK' ? 'packs.html' : 'servicios');
    const service = await prisma.service.create({
      data: input,
      select: serviceSelectFields,
    });
    queryCache.clear();
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
    const input = await inheritLinkedService(parseServiceInput(await readJsonBody(request)));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
    requireCatalogPage(request, input.type === 'PACK' || existing.type === 'PACK' ? 'packs.html' : 'servicios');
    const service = await prisma.service.update({
      where: { id },
      data: input,
      select: serviceSelectFields,
    });
    queryCache.clear();
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
    requireCatalogPage(request, existing.type === 'PACK' ? 'packs.html' : 'servicios');
    const service = await prisma.service.update({
      where: { id },
      data: { isActive: body.isActive },
      select: serviceSelectFields,
    });
    queryCache.clear();
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
    requireCatalogPage(request, existing.type === 'PACK' ? 'packs.html' : 'servicios');
    if (existing.type !== 'PACK' && DEFAULT_SERVICES.some(d => d.name.toLowerCase() === existing.name.trim().toLowerCase())) {
      sendError(response, 400, `El servicio "${existing.name}" es un servicio base predeterminado y siempre debe estar en el sistema.`);
      return true;
    }
    if (existing._count.bookings > 0 || existing._count.packages > 0) {
      const service = await prisma.service.update({
        where: { id },
        data: { isActive: false },
        select: serviceSelectFields,
      });
      queryCache.clear();
      sendJson(response, 200, { service, deactivated: true, message: "El servicio tiene historial y ha sido desactivado en lugar de eliminado." });
      return true;
    }
    await prisma.service.delete({ where: { id } });
    queryCache.clear();
    sendJson(response, 200, { deleted: true, id });
    return true;
  }
  return false;
}
