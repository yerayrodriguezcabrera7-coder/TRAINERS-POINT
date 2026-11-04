import { Prisma } from "@prisma/client";
import { type IncomingMessage, type ServerResponse } from "node:http";
import type { ApiContext } from '../http/api-context';
import { readJsonBody, sendError, sendJson } from "../http/json";
import { prisma } from "../lib/prisma";
import { parseGymInput } from "../validation/records";
export async function centersRoutes(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiContext): Promise<boolean> {
  const { port, calendarPool, hasTrustedOrigin } = context;
  if (request.method === "GET" && url.pathname === "/api/gyms") {
    const gyms = await prisma.gym.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        city: true,
        province: true,
        address: true,
        _count: { select: { clients: true } },
      },
      orderBy: { name: "asc" },
    });
    const extraRows = await prisma.$queryRaw<Array<{
      id: string;
      photoData: string | null;
      latitude: number | null;
      longitude: number | null;
      radiusMeters: number | null;
    }>>(Prisma.sql`SELECT "id", "photoData", "latitude", "longitude", "radiusMeters" FROM "Gym" WHERE "isActive" = true`).catch(() => []);
    const extraById = new Map(extraRows.map((e) => [e.id, e]));
    sendJson(response, 200, {
      gyms: gyms.map((gym) => {
        const extra = extraById.get(gym.id);
        return {
          ...gym,
          photoData: extra?.photoData ?? null,
          latitude: extra?.latitude ?? null,
          longitude: extra?.longitude ?? null,
          radiusMeters: extra?.radiusMeters ?? 200,
        };
      }),
    });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/gyms") {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const input = parseGymInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
    try {
      const { photoData, latitude, longitude, radiusMeters, ...gymData } = input;
      const gym = await prisma.gym.create({
        data: gymData,
        select: { id: true, name: true, city: true, province: true, address: true },
      });
      await prisma.$executeRaw(Prisma.sql`UPDATE "Gym" SET "photoData" = COALESCE(${photoData}, "photoData"), "latitude" = ${latitude ?? null}, "longitude" = ${longitude ?? null}, "radiusMeters" = ${radiusMeters ?? 200} WHERE "id" = ${gym.id}::uuid`).catch(() => { });
      if (typeof latitude === "number" && typeof longitude === "number") {
        const locationObj = {
          latitude,
          longitude,
          radiusMeters: radiusMeters ?? 200,
          address: [gym.address, gym.city, gym.province].filter(Boolean).join(", "),
        };
        if (calendarPool) {
          await calendarPool.query(`UPDATE calendar.gyms SET config = jsonb_set(config, '{location}', $2::jsonb) WHERE id=$1 OR name=$3`, [gym.id, JSON.stringify(locationObj), gym.name]).catch(() => { });
        }
      }
      sendJson(response, 201, {
        gym: {
          ...gym,
          photoData: photoData ?? null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          radiusMeters: radiusMeters ?? 200,
        },
      });
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        sendError(response, 409, "Ya existe un gimnasio con ese nombre.");
        return true;
      }
      throw error;
    }
    return true;
  }
  const gymPatchMatch = url.pathname.match(/^\/api\/gyms\/([0-9a-f-]+)$/i);
  if (request.method === "PATCH" && gymPatchMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const gymId = gymPatchMatch[1];
    const input = parseGymInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
    try {
      const { photoData, latitude, longitude, radiusMeters, ...gymData } = input;
      const updated = await prisma.gym.update({
        where: { id: gymId },
        data: gymData,
        select: { id: true, name: true, city: true, province: true, address: true },
      });
      await prisma.$executeRaw(Prisma.sql`UPDATE "Gym" SET "photoData" = COALESCE(${photoData}, "photoData"), "latitude" = ${latitude ?? null}, "longitude" = ${longitude ?? null}, "radiusMeters" = ${radiusMeters ?? 200} WHERE "id" = ${gymId}::uuid`).catch(() => { });
      if (typeof latitude === "number" && typeof longitude === "number") {
        const locationObj = {
          latitude,
          longitude,
          radiusMeters: radiusMeters ?? 200,
          address: [updated.address, updated.city, updated.province].filter(Boolean).join(", "),
        };
        if (calendarPool) {
          await calendarPool.query(`UPDATE calendar.gyms SET config = jsonb_set(config, '{location}', $2::jsonb) WHERE id=$1 OR name=$3`, [gymId, JSON.stringify(locationObj), updated.name]).catch(() => { });
        }
      }
      sendJson(response, 200, {
        gym: {
          ...updated,
          photoData: photoData ?? null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          radiusMeters: radiusMeters ?? 200,
        },
      });
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        sendError(response, 409, "Ya existe un gimnasio con ese nombre.");
        return true;
      }
      throw error;
    }
    return true;
  }
  const gymDeleteMatch = url.pathname.match(/^\/api\/gyms\/([0-9a-f-]+)$/i);
  if (request.method === "DELETE" && gymDeleteMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const gymId = gymDeleteMatch[1];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gymId)) {
      sendError(response, 400, "La sede no es válida.");
      return true;
    }
    const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true, _count: { select: { clients: true } } } });
    if (!gym) {
      sendError(response, 404, "No se encontró la sede.");
      return true;
    }
    if (gym._count.clients > 0) {
      sendError(response, 409, "No puedes borrar una sede con clientes asignados. Reasígnalos antes de continuar.");
      return true;
    }
    await prisma.gym.update({ where: { id: gymId }, data: { isActive: false } });
    sendJson(response, 200, { deleted: true });
    return true;
  }
  return false;
}
