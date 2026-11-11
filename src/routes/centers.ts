import { Prisma } from "@prisma/client";
import { type IncomingMessage, type ServerResponse } from "node:http";
import type { ApiContext } from '../http/api-context';
import { readJsonBody, sendError, sendJson } from "../http/json";
import { prisma } from "../lib/prisma";
import { parseGymInput, type GymScheduleDay } from "../validation/records";

function centerSlug(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function syncGymExtras(
  gym: { id: string; name: string; city: string | null; province: string | null; address: string | null },
  extras: {
    photoData?: string;
    latitude?: number | null;
    longitude?: number | null;
    radiusMeters?: number | null;
    maxBookingsPerHour?: number | null;
    schedule?: GymScheduleDay[] | null;
  },
  calendarPool: ApiContext["calendarPool"],
): Promise<void> {
  const { photoData, latitude, longitude, radiusMeters, maxBookingsPerHour, schedule } = extras;
  await prisma.$executeRaw(Prisma.sql`ALTER TABLE "Gym" ADD COLUMN IF NOT EXISTS "schedule" JSONB`).catch(() => { });
  await prisma.$executeRaw(
    Prisma.sql`UPDATE "Gym" SET "photoData" = COALESCE(${photoData ?? null}, "photoData"), "latitude" = ${latitude ?? null}, "longitude" = ${longitude ?? null}, "radiusMeters" = ${radiusMeters ?? 200}, "maxBookingsPerHour" = ${maxBookingsPerHour ?? null} WHERE "id" = ${gym.id}::uuid`,
  ).catch(() => { });
  if (schedule !== undefined) {
    const scheduleJson = schedule ? JSON.stringify(schedule) : null;
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "Gym" SET "schedule" = ${scheduleJson}::jsonb WHERE "id" = ${gym.id}::uuid`,
    ).catch(() => { });
  }
  if (!calendarPool) return;
  const slug = centerSlug(gym.name);
  const matchParams = [gym.id, gym.name, slug];
  const updateConfigKey = (key: string, jsonValue: string) =>
    calendarPool.query(
      `UPDATE calendar.gyms SET config = jsonb_set(config, $1::text[], $2::jsonb) WHERE id=$3 OR lower(name)=lower($4) OR id=$5`,
      [[key], jsonValue, ...matchParams],
    ).catch(() => { });
  await updateConfigKey("maxBookingsPerHour", JSON.stringify(maxBookingsPerHour ?? null));
  if (schedule) {
    await updateConfigKey("schedule", JSON.stringify(schedule));
  }
  if (typeof latitude === "number" && typeof longitude === "number") {
    const locationObj = {
      latitude,
      longitude,
      radiusMeters: radiusMeters ?? 200,
      maxBookingsPerHour: maxBookingsPerHour ?? null,
      address: [gym.address, gym.city, gym.province].filter(Boolean).join(", "),
    };
    await updateConfigKey("location", JSON.stringify(locationObj));
  }
}
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
    type ExtraRow = {
      id: string;
      photoData: string | null;
      latitude: number | null;
      longitude: number | null;
      radiusMeters: number | null;
      maxBookingsPerHour: number | null;
      schedule?: unknown;
    };
    const extraRows = await prisma.$queryRaw<Array<ExtraRow>>(
      Prisma.sql`SELECT "id", "photoData", "latitude", "longitude", "radiusMeters", "maxBookingsPerHour", "schedule" FROM "Gym" WHERE "isActive" = true`,
    ).catch(() =>
      prisma.$queryRaw<Array<ExtraRow>>(
        Prisma.sql`SELECT "id", "photoData", "latitude", "longitude", "radiusMeters", "maxBookingsPerHour" FROM "Gym" WHERE "isActive" = true`,
      ).catch(() => []),
    );
    const extraById = new Map(extraRows.map((e) => [e.id, e]));
    const calendarSchedules = calendarPool
      ? await calendarPool.query(`SELECT id, name, config->'schedule' AS schedule FROM calendar.gyms`).then((r) => r.rows).catch(() => [])
      : [];
    sendJson(response, 200, {
      gyms: gyms.map((gym) => {
        const extra = extraById.get(gym.id);
        const gymSlug = centerSlug(gym.name);
        const fallbackCalendar = calendarSchedules.find((row) => row.id === gym.id || row.name === gym.name || centerSlug(String(row.id || "")) === gymSlug);
        const schedule = Array.isArray(extra?.schedule) && extra.schedule.length === 7
          ? extra.schedule
          : Array.isArray(fallbackCalendar?.schedule) && fallbackCalendar.schedule.length === 7
          ? fallbackCalendar.schedule
          : null;
        return {
          ...gym,
          photoData: extra?.photoData ?? null,
          latitude: extra?.latitude ?? null,
          longitude: extra?.longitude ?? null,
          radiusMeters: extra?.radiusMeters ?? 200,
          maxBookingsPerHour: extra?.maxBookingsPerHour != null ? Number(extra.maxBookingsPerHour) : null,
          schedule,
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
      const { photoData, latitude, longitude, radiusMeters, maxBookingsPerHour, schedule, ...gymData } = input;
      const gym = await prisma.gym.create({
        data: gymData,
        select: { id: true, name: true, city: true, province: true, address: true },
      });
      await syncGymExtras(gym, { photoData, latitude, longitude, radiusMeters, maxBookingsPerHour, schedule }, calendarPool);
      sendJson(response, 201, {
        gym: {
          ...gym,
          photoData: photoData ?? null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          radiusMeters: radiusMeters ?? 200,
          maxBookingsPerHour: maxBookingsPerHour ?? null,
          schedule: schedule ?? null,
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
      const { photoData, latitude, longitude, radiusMeters, maxBookingsPerHour, schedule, ...gymData } = input;
      const updated = await prisma.gym.update({
        where: { id: gymId },
        data: gymData,
        select: { id: true, name: true, city: true, province: true, address: true },
      });
      await syncGymExtras(updated, { photoData, latitude, longitude, radiusMeters, maxBookingsPerHour, schedule }, calendarPool);
      sendJson(response, 200, {
        gym: {
          ...updated,
          photoData: photoData ?? null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          radiusMeters: radiusMeters ?? 200,
          maxBookingsPerHour: maxBookingsPerHour ?? null,
          schedule: schedule ?? null,
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
