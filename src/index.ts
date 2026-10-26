import "dotenv/config";
import { createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import {
  AttendanceStatus,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type ClientStatus,
} from "@prisma/client";
import { prisma } from "./lib/prisma";
import { Store, migration as calendarMigration } from "./calendar/store";
import { accessMigration } from "./calendar/access";
import { server as createCalendarServer } from "./calendar/http";
import { progressMigration } from "./progress-migration";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
const maxBodyBytes = 16 * 1024;
const validStatuses: ClientStatus[] = ["LEAD", "ACTIVO", "INACTIVO", "BAJA"];
const validPaymentMethods: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];
const validPaymentStatuses: PaymentStatus[] = ["PENDIENTE", "PAGADO", "FALLIDO", "REEMBOLSADO"];
const validAttendanceStatuses: AttendanceStatus[] = ["PENDIENTE", "ASISTIO", "NO_ASISTIO", "CANCELADA"];
let calendarHandler: ((request: IncomingMessage, response: ServerResponse) => unknown) | undefined;
let calendarBootstrapToken = "";

type ClientInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gymId: string;
  dni?: string;
  birthDate?: string;
  notes?: string;
  objective?: string;
};

type MeasurementInput = {
  measuredAt: string;
  weight?: number;
  hip?: number;
  waist?: number;
  leg?: number;
  chest?: number;
  arm?: number;
  notes?: string;
};

type GymInput = {
  name: string;
  city?: string;
  province?: string;
  address?: string;
};

type ServiceInput = {
  name: string;
  description?: string;
  durationMin: number;
  price: number;
};

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

function sendError(response: ServerResponse, status: number, message: string): void {
  sendJson(response, status, { error: message });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBodyBytes) {
      throw new RangeError("Request body too large");
    }

    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new SyntaxError("Invalid JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClientInput(value: unknown): ClientInput | string {
  if (!isRecord(value)) {
    return "El formulario no tiene un formato válido.";
  }

  const firstName = typeof value.firstName === "string" ? value.firstName.trim() : "";
  const lastName = typeof value.lastName === "string" ? value.lastName.trim() : "";
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const phone = typeof value.phone === "string" ? value.phone.trim() : "";
  const dni = typeof value.dni === "string" ? value.dni.trim() : "";
  const notes = typeof value.notes === "string" ? value.notes.trim() : "";
  const objective = typeof value.objective === "string" ? value.objective.trim() : "";
  const birthDate = typeof value.birthDate === "string" ? value.birthDate.trim() : "";
  const gymId = typeof value.gymId === "string" ? value.gymId.trim() : "";

  if (!firstName || firstName.length > 100) {
    return "El nombre es obligatorio y debe tener como máximo 100 caracteres.";
  }

  if (!lastName || lastName.length > 100) {
    return "Los apellidos son obligatorios y deben tener como máximo 100 caracteres.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return "Introduce un correo electrónico válido.";
  }

  if (!phone || phone.length > 40) {
    return "El teléfono es obligatorio y debe tener como máximo 40 caracteres.";
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gymId)) {
    return "Selecciona un gimnasio válido.";
  }

  if (dni.length > 30 || notes.length > 5000 || objective.length > 1000) {
    return "El DNI o las notas superan la longitud permitida.";
  }

  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return "La fecha de nacimiento no es válida.";
  }

  if (birthDate) {
    const parsedDate = new Date(`${birthDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== birthDate) {
      return "La fecha de nacimiento no es válida.";
    }
  }

  return {
    firstName,
    lastName,
    email,
    phone,
    gymId,
    ...(dni ? { dni } : {}),
    ...(birthDate ? { birthDate } : {}),
    ...(notes ? { notes } : {}),
    ...(objective ? { objective } : {}),
  };
}

function parseMeasurementInput(value: unknown): MeasurementInput | string {
  if (!isRecord(value)) return "La medición no tiene un formato válido.";
  const measuredAt = typeof value.measuredAt === "string" ? value.measuredAt.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredAt)) return "Introduce una fecha válida.";
  const parsedDate = new Date(`${measuredAt}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== measuredAt) return "Introduce una fecha válida.";
  const fields = ["weight", "hip", "waist", "leg", "chest", "arm"] as const;
  const result: MeasurementInput = { measuredAt };
  for (const field of fields) {
    if (value[field] === undefined || value[field] === null || value[field] === "") continue;
    const number = typeof value[field] === "number" ? value[field] : Number(value[field]);
    if (!Number.isFinite(number) || number <= 0 || number > 1000) return "Las medidas deben ser números positivos válidos.";
    result[field] = Math.round(number * 100) / 100;
  }
  if (fields.every((field) => result[field] === undefined)) return "Introduce al menos una medida.";
  if (typeof value.notes === "string" && value.notes.trim().length > 1000) return "Las notas superan la longitud permitida.";
  if (typeof value.notes === "string" && value.notes.trim()) result.notes = value.notes.trim();
  return result;
}

function parseGymInput(value: unknown): GymInput | string {
  if (!isRecord(value)) {
    return "El formulario del gimnasio no tiene un formato válido.";
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const city = typeof value.city === "string" ? value.city.trim() : "";
  const province = typeof value.province === "string" ? value.province.trim() : "";
  const address = typeof value.address === "string" ? value.address.trim() : "";

  if (!name || name.length > 120) {
    return "El nombre es obligatorio y debe tener como máximo 120 caracteres.";
  }
  if (city.length > 100 || province.length > 100 || address.length > 200) {
    return "La ubicación supera la longitud permitida.";
  }

  return {
    name,
    ...(city ? { city } : {}),
    ...(province ? { province } : {}),
    ...(address ? { address } : {}),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseServiceInput(value: unknown): ServiceInput | string {
  if (!isRecord(value)) {
    return "El formulario del servicio no tiene un formato válido.";
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const durationMin = typeof value.durationMin === "number" ? value.durationMin : Number(value.durationMin);
  const price = typeof value.price === "number" ? value.price : Number(value.price);

  if (!name || name.length > 120) {
    return "El nombre es obligatorio y debe tener como máximo 120 caracteres.";
  }
  if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 1440) {
    return "La duración debe estar entre 1 y 1440 minutos.";
  }
  if (!Number.isFinite(price) || price < 0 || price > 99999999.99) {
    return "Introduce un precio válido.";
  }
  if (description.length > 1000) {
    return "La descripción debe tener como máximo 1000 caracteres.";
  }

  return { name, durationMin, price, ...(description ? { description } : {}) };
}

function parseServicePackageInput(
  value: unknown,
):
  | {
      serviceId: string;
      sessionsBought: number;
      totalAmount: number;
      paymentMethod: PaymentMethod;
      paymentStatus: PaymentStatus;
      notes?: string;
    }
  | string {
  if (!isRecord(value)) {
    return "El formulario del bono no tiene un formato válido.";
  }

  const serviceId = typeof value.serviceId === "string" ? value.serviceId : "";
  const sessionsBought = typeof value.sessionsBought === "number" ? value.sessionsBought : Number(value.sessionsBought);
  const totalAmount = typeof value.totalAmount === "number" ? value.totalAmount : Number(value.totalAmount);
  const paymentMethod = typeof value.paymentMethod === "string" ? value.paymentMethod : "";
  const paymentStatus = typeof value.paymentStatus === "string" ? value.paymentStatus : "";
  const notes = typeof value.notes === "string" ? value.notes.trim() : "";

  if (!isUuid(serviceId)) return "Selecciona un servicio válido.";
  if (!Number.isInteger(sessionsBought) || sessionsBought < 1 || sessionsBought > 500) {
    return "Las sesiones deben estar entre 1 y 500.";
  }
  if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 9999999999.99) {
    return "Introduce un importe válido.";
  }
  if (!validPaymentMethods.includes(paymentMethod as PaymentMethod)) {
    return "Selecciona una forma de pago válida.";
  }
  if (!validPaymentStatuses.includes(paymentStatus as PaymentStatus)) {
    return "Selecciona un estado de pago válido.";
  }
  if (notes.length > 1000) return "Las notas deben tener como máximo 1000 caracteres.";

  return {
    serviceId,
    sessionsBought,
    totalAmount,
    paymentMethod: paymentMethod as PaymentMethod,
    paymentStatus: paymentStatus as PaymentStatus,
    ...(notes ? { notes } : {}),
  };
}

function isLocalRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function hasTrustedOrigin(request: IncomingMessage, port: number): boolean {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (request.method === "GET" && url.pathname === "/api/services") {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true, durationMin: true, price: true },
      orderBy: { name: "asc" },
    });
    sendJson(response, 200, { services });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/services") {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return;
    }

    const input = parseServiceInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return;
    }

    const service = await prisma.service.create({
      data: input,
      select: { id: true, name: true, description: true, durationMin: true, price: true },
    });
    sendJson(response, 201, { service });
    return;
  }

  const clientProgressMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/progress$/i);
  if (request.method === "GET" && clientProgressMatch) {
    const client = await prisma.client.findUnique({
      where: { id: clientProgressMatch[1] },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        objective: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
        gym: { select: { id: true, name: true, city: true, province: true } },
      },
    });
    if (!client) { sendError(response, 404, "No se encontró el cliente."); return; }
    const measurements = await prisma.clientMeasurement.findMany({
      where: { clientId: client.id },
      orderBy: { measuredAt: "asc" },
    });
    sendJson(response, 200, {
      client,
      measurements: measurements.map((measurement) => ({
        ...measurement,
        weight: measurement.weight === null ? null : Number(measurement.weight),
        hip: measurement.hip === null ? null : Number(measurement.hip),
        waist: measurement.waist === null ? null : Number(measurement.waist),
        leg: measurement.leg === null ? null : Number(measurement.leg),
        chest: measurement.chest === null ? null : Number(measurement.chest),
        arm: measurement.arm === null ? null : Number(measurement.arm),
      })),
    });
    return;
  }

  const clientObjectiveMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/objective$/i);
  if (request.method === "PATCH" && clientObjectiveMatch) {
    if (!hasTrustedOrigin(request, port)) { sendError(response, 403, "Origen de la solicitud no permitido."); return; }
    const body = await readJsonBody(request);
    const objective = isRecord(body) && typeof body.objective === "string" ? body.objective.trim() : "";
    if (objective.length > 1000) { sendError(response, 400, "El objetivo supera la longitud permitida."); return; }
    try {
      const client = await prisma.client.update({
        where: { id: clientObjectiveMatch[1] },
        data: { objective: objective || null },
        select: { id: true, objective: true },
      });
      sendJson(response, 200, { client });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { sendError(response, 404, "No se encontró el cliente."); return; }
      throw error;
    }
    return;
  }

  const clientMeasurementMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/measurements$/i);
  if (request.method === "POST" && clientMeasurementMatch) {
    if (!hasTrustedOrigin(request, port)) { sendError(response, 403, "Origen de la solicitud no permitido."); return; }
    const input = parseMeasurementInput(await readJsonBody(request));
    if (typeof input === "string") { sendError(response, 400, input); return; }
    try {
      const measurement = await prisma.clientMeasurement.upsert({
        where: { clientId_measuredAt: { clientId: clientMeasurementMatch[1], measuredAt: new Date(`${input.measuredAt}T00:00:00.000Z`) } },
        create: {
          client: { connect: { id: clientMeasurementMatch[1] } },
          measuredAt: new Date(`${input.measuredAt}T00:00:00.000Z`),
          ...(input.weight !== undefined ? { weight: input.weight } : {}),
          ...(input.hip !== undefined ? { hip: input.hip } : {}),
          ...(input.waist !== undefined ? { waist: input.waist } : {}),
          ...(input.leg !== undefined ? { leg: input.leg } : {}),
          ...(input.chest !== undefined ? { chest: input.chest } : {}),
          ...(input.arm !== undefined ? { arm: input.arm } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        },
        update: {
          ...(input.weight !== undefined ? { weight: input.weight } : { weight: null }),
          ...(input.hip !== undefined ? { hip: input.hip } : { hip: null }),
          ...(input.waist !== undefined ? { waist: input.waist } : { waist: null }),
          ...(input.leg !== undefined ? { leg: input.leg } : { leg: null }),
          ...(input.chest !== undefined ? { chest: input.chest } : { chest: null }),
          ...(input.arm !== undefined ? { arm: input.arm } : { arm: null }),
          notes: input.notes || null,
        },
      });
      sendJson(response, 201, { measurement });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { sendError(response, 404, "No se encontró el cliente."); return; }
      throw error;
    }
    return;
  }

  const clientHistoryMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/service-history$/i);
  if (request.method === "GET" && clientHistoryMatch) {
    const clientId = clientHistoryMatch[1];
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!client) {
      sendError(response, 404, "No se encontró el cliente.");
      return;
    }

    const packages = await prisma.clientServicePackage.findMany({
      where: { clientId },
      include: { service: { select: { id: true, name: true, durationMin: true } } },
      orderBy: { purchasedAt: "desc" },
    });
    const [bookings, bookingCounts] = await Promise.all([
      prisma.booking.findMany({
        where: { clientId },
        select: {
          id: true,
          packageId: true,
          service: { select: { name: true } },
          startTime: true,
          endTime: true,
          status: true,
          attendance: true,
          attendedAt: true,
          package: { select: { id: true } },
        },
        orderBy: { startTime: "desc" },
        take: 100,
      }),
      prisma.booking.groupBy({
        by: ["packageId", "attendance"],
        where: {
          packageId: { in: packages.map((servicePackage) => servicePackage.id) },
          attendance: { in: [AttendanceStatus.ASISTIO, AttendanceStatus.PENDIENTE] },
        },
        _count: { _all: true },
      }),
    ]);

    sendJson(response, 200, {
      client,
      packages: packages.map((servicePackage) => {
        const sessionsUsed =
          bookingCounts.find(
            (count) =>
              count.packageId === servicePackage.id && count.attendance === AttendanceStatus.ASISTIO,
          )?._count._all ?? 0;
        const sessionsScheduled =
          bookingCounts.find(
            (count) =>
              count.packageId === servicePackage.id && count.attendance === AttendanceStatus.PENDIENTE,
          )?._count._all ?? 0;
        return {
        ...servicePackage,
          sessionsUsed,
          sessionsScheduled,
          sessionsRemaining: Math.max(0, servicePackage.sessionsBought - sessionsUsed - sessionsScheduled),
        };
      }),
      bookings,
    });
    return;
  }

  const clientPackagesMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/service-packages$/i);
  if (request.method === "POST" && clientPackagesMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return;
    }
    const input = parseServicePackageInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return;
    }

    try {
      const servicePackage = await prisma.clientServicePackage.create({
        data: {
          client: { connect: { id: clientPackagesMatch[1] } },
          service: { connect: { id: input.serviceId } },
          sessionsBought: input.sessionsBought,
          totalAmount: input.totalAmount,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
      sendJson(response, 201, { servicePackage });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente o el servicio.");
        return;
      }
      throw error;
    }
    return;
  }

  const packageBookingsMatch = url.pathname.match(/^\/api\/service-packages\/([0-9a-f-]+)\/bookings$/i);
  if (request.method === "POST" && packageBookingsMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return;
    }

    const body = await readJsonBody(request);
    const startTime =
      isRecord(body) && typeof body.startTime === "string" ? new Date(body.startTime) : new Date(Number.NaN);
    if (Number.isNaN(startTime.getTime()) || startTime.getTime() <= Date.now()) {
      sendError(response, 400, "Selecciona una fecha y hora futura válida.");
      return;
    }

    const servicePackage = await prisma.clientServicePackage.findUnique({
      where: { id: packageBookingsMatch[1] },
      include: { service: true },
    });
    if (!servicePackage) {
      sendError(response, 404, "No se encontró el bono.");
      return;
    }
    if (servicePackage.paymentStatus !== PaymentStatus.PAGADO) {
      sendError(response, 409, "El bono debe estar pagado antes de reservar sesiones.");
      return;
    }

    const sessionsCommitted = await prisma.booking.count({
      where: {
        packageId: servicePackage.id,
        attendance: { in: [AttendanceStatus.ASISTIO, AttendanceStatus.PENDIENTE] },
      },
    });
    if (sessionsCommitted >= servicePackage.sessionsBought) {
      sendError(response, 409, "El bono ya no tiene sesiones disponibles.");
      return;
    }

    const endTime = new Date(startTime.getTime() + servicePackage.service.durationMin * 60_000);
    const booking = await prisma.booking.create({
      data: {
        clientId: servicePackage.clientId,
        serviceId: servicePackage.serviceId,
        packageId: servicePackage.id,
        startTime,
        endTime,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        attendance: true,
        service: { select: { name: true } },
      },
    });
    sendJson(response, 201, { booking });
    return;
  }

  const attendanceMatch = url.pathname.match(/^\/api\/bookings\/([0-9a-f-]+)\/attendance$/i);
  if (request.method === "PATCH" && attendanceMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return;
    }
    const body = await readJsonBody(request);
    const attendance =
      isRecord(body) && typeof body.attendance === "string" ? body.attendance : undefined;
    if (!attendance || !validAttendanceStatuses.includes(attendance as AttendanceStatus)) {
      sendError(response, 400, "Selecciona un estado de asistencia válido.");
      return;
    }

    try {
      if (attendance === AttendanceStatus.ASISTIO || attendance === AttendanceStatus.NO_ASISTIO) {
        const scheduledBooking = await prisma.booking.findUnique({
          where: { id: attendanceMatch[1] },
          select: { startTime: true },
        });
        if (!scheduledBooking) {
          sendError(response, 404, "No se encontró la sesión.");
          return;
        }
        if (scheduledBooking.startTime.getTime() > Date.now()) {
          sendError(response, 409, "No puedes registrar la asistencia antes de la hora programada.");
          return;
        }
      }

      const booking = await prisma.booking.update({
        where: { id: attendanceMatch[1] },
        data: {
          attendance: attendance as AttendanceStatus,
          attendedAt: attendance === AttendanceStatus.ASISTIO ? new Date() : null,
          status:
            attendance === AttendanceStatus.CANCELADA
              ? BookingStatus.CANCELADA
              : attendance === AttendanceStatus.ASISTIO || attendance === AttendanceStatus.NO_ASISTIO
                ? BookingStatus.COMPLETADA
                : BookingStatus.CONFIRMADA,
        },
        select: { id: true, attendance: true, attendedAt: true, status: true, packageId: true },
      });
      sendJson(response, 200, { booking });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró la sesión.");
        return;
      }
      throw error;
    }
    return;
  }

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
    sendJson(response, 200, { gyms });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/gyms") {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return;
    }

    const input = parseGymInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return;
    }

    try {
      const gym = await prisma.gym.create({
        data: input,
        select: { id: true, name: true, city: true, province: true, address: true },
      });
      sendJson(response, 201, { gym });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        sendError(response, 409, "Ya existe un gimnasio con ese nombre.");
        return;
      }
      throw error;
    }
    return;
  }

  const gymDeleteMatch = url.pathname.match(/^\/api\/gyms\/([0-9a-f-]+)$/i);
  if (request.method === "DELETE" && gymDeleteMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return;
    }
    const gymId = gymDeleteMatch[1];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gymId)) {
      sendError(response, 400, "La sede no es válida.");
      return;
    }
    const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true, _count: { select: { clients: true } } } });
    if (!gym) { sendError(response, 404, "No se encontró la sede."); return; }
    if (gym._count.clients > 0) { sendError(response, 409, "No puedes borrar una sede con clientes asignados. Reasígnalos antes de continuar."); return; }
    await prisma.gym.update({ where: { id: gymId }, data: { isActive: false } });
    sendJson(response, 200, { deleted: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/clients") {
    const search = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const status = url.searchParams.get("status") ?? "";
    const gymId = url.searchParams.get("gymId") ?? "";

    if (status && !validStatuses.includes(status as ClientStatus)) {
      sendError(response, 400, "El filtro de estado no es válido.");
      return;
    }
    if (
      gymId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gymId)
    ) {
      sendError(response, 400, "El filtro de gimnasio no es válido.");
      return;
    }

    const where: Prisma.ClientWhereInput = {
      ...(status ? { status: status as ClientStatus } : {}),
      ...(gymId ? { gymId } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              { dni: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    if (!search && url.searchParams.get("all") !== "true") {
      where.bookings = {
        some: {
          startTime: { gte: todayStart, lt: todayEnd },
          attendance: AttendanceStatus.PENDIENTE,
        },
      };
    }

    const [clients, total, grouped] = await Promise.all([
      prisma.client.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          dni: true,
          notes: true,
          objective: true,
          trainingPlans: { where: { status: "ACTIVO" }, select: { name: true }, take: 1 },
          clientNotes: { orderBy: { createdAt: "desc" }, select: { content: true }, take: 1 },
          birthDate: true,
          status: true,
          gymId: true,
          gym: { select: { id: true, name: true, city: true, province: true } },
          createdAt: true,
          servicePackages: {
            select: {
              sessionsBought: true,
              paymentStatus: true,
              bookings: {
                where: { attendance: { in: [AttendanceStatus.ASISTIO, AttendanceStatus.PENDIENTE] } },
                select: { attendance: true },
              },
            },
          },
          bookings: {
            where: {
              ...(search
                ? { startTime: { gte: new Date() } }
                : { startTime: { gte: todayStart, lt: todayEnd } }),
              attendance: AttendanceStatus.PENDIENTE,
            },
            orderBy: { startTime: "asc" },
            take: 1,
            select: {
              id: true,
              startTime: true,
              service: { select: { name: true } },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 100,
      }),
      prisma.client.count({ where }),
      prisma.client.groupBy({ where, by: ["status"], _count: { _all: true } }),
    ]);

    sendJson(response, 200, {
      clients: clients.map((client) => {
        const sessionsBought = client.servicePackages.reduce(
          (totalSessions, servicePackage) => totalSessions + servicePackage.sessionsBought,
          0,
        );
        const sessionsCommitted = client.servicePackages.reduce(
          (committed, servicePackage) =>
            committed +
            servicePackage.bookings.filter(
              (booking) =>
                booking.attendance === AttendanceStatus.ASISTIO ||
                booking.attendance === AttendanceStatus.PENDIENTE,
            ).length,
          0,
        );
        const pendingPayments = client.servicePackages.filter(
          (servicePackage) =>
            servicePackage.paymentStatus === PaymentStatus.PENDIENTE ||
            servicePackage.paymentStatus === PaymentStatus.FALLIDO,
        ).length;
        const { servicePackages, bookings, ...clientDetails } = client;

        return {
          ...clientDetails,
          nextSession: bookings[0] ?? null,
          remainingSessions: Math.max(0, sessionsBought - sessionsCommitted),
          pendingPayments,
          servicePackageCount: servicePackages.length,
        };
      }),
      total,
      counts: Object.fromEntries(grouped.map((entry) => [entry.status, entry._count._all])),
      limit: 100,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/clients") {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return;
    }

    const input = parseClientInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return;
    }

    try {
      const client = await prisma.client.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          gym: { connect: { id: input.gymId } },
          ...(input.dni ? { dni: input.dni } : {}),
          ...(input.birthDate ? { birthDate: new Date(`${input.birthDate}T00:00:00.000Z`) } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
          ...(input.objective ? { objective: input.objective } : {}),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          dni: true,
          objective: true,
          birthDate: true,
          status: true,
          gymId: true,
          gym: { select: { id: true, name: true, city: true, province: true } },
          createdAt: true,
        },
      });

      sendJson(response, 201, { client });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        sendError(response, 409, "Ya existe un cliente con ese correo o DNI.");
        return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 400, "El gimnasio seleccionado no existe o ya no está disponible.");
        return;
      }

      throw error;
    }
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/status$/i);
  if (request.method === "PATCH" && statusMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return;
    }

    const body = await readJsonBody(request);
    const status =
      isRecord(body) && typeof body.status === "string" ? body.status : undefined;
    if (!status || !validStatuses.includes(status as ClientStatus)) {
      sendError(response, 400, "Selecciona un estado válido.");
      return;
    }

    try {
      const client = await prisma.client.update({
        where: { id: statusMatch[1] },
        data: { status: status as ClientStatus },
        select: { id: true, status: true },
      });
      sendJson(response, 200, { client });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente.");
        return;
      }
      throw error;
    }
    return;
  }

  const gymMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/gym$/i);
  if (request.method === "PATCH" && gymMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return;
    }

    const body = await readJsonBody(request);
    const gymId = isRecord(body) && typeof body.gymId === "string" ? body.gymId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gymId)) {
      sendError(response, 400, "Selecciona un gimnasio válido.");
      return;
    }

    try {
      const client = await prisma.client.update({
        where: { id: gymMatch[1] },
        data: { gym: { connect: { id: gymId } } },
        select: { id: true, gym: { select: { id: true, name: true } } },
      });
      sendJson(response, 200, { client });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente o el gimnasio.");
        return;
      }
      throw error;
    }
    return;
  }

  if (calendarHandler) {
    await calendarHandler(request, response);
    return;
  }

  sendError(response, 404, "No se encontró el recurso.");
}

const staticFiles: Record<string, { file: string; contentType: string }> = {
  "/": { file: "web/index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "web/index.html", contentType: "text/html; charset=utf-8" },
  "/inicio.html": { file: "web/inicio.html", contentType: "text/html; charset=utf-8" },
  "/inicio.css": { file: "web/inicio.css", contentType: "text/css; charset=utf-8" },
  "/inicio.js": { file: "web/inicio.js", contentType: "text/javascript; charset=utf-8" },
  "/fichajes.html": { file: "web/fichajes.html", contentType: "text/html; charset=utf-8" },
  "/fichajes.css": { file: "web/fichajes.css", contentType: "text/css; charset=utf-8" },
  "/fichajes.js": { file: "web/fichajes.js", contentType: "text/javascript; charset=utf-8" },
  "/gestion.html": { file: "web/gestion.html", contentType: "text/html; charset=utf-8" },
  "/gestion.css": { file: "web/gestion.css", contentType: "text/css; charset=utf-8" },
  "/gestion.js": { file: "web/gestion.js", contentType: "text/javascript; charset=utf-8" },
  "/login.html": { file: "web/login.html", contentType: "text/html; charset=utf-8" },
  "/login.js": { file: "web/login.js", contentType: "text/javascript; charset=utf-8" },
  "/app.js": { file: "web/app.js", contentType: "text/javascript; charset=utf-8" },
  "/calendar-core.js": { file: "web/calendar-core.js", contentType: "text/javascript; charset=utf-8" },
  "/runtime.js": { file: "web/runtime.js", contentType: "text/javascript; charset=utf-8" },
  "/menu.js": { file: "web/menu.js", contentType: "text/javascript; charset=utf-8" },
  "/menu.css": { file: "web/menu.css", contentType: "text/css; charset=utf-8" },
  "/styles.css": { file: "web/styles.css", contentType: "text/css; charset=utf-8" },
  "/design.css": { file: "web/design.css", contentType: "text/css; charset=utf-8" },
  "/clientes": { file: "public/clients.html", contentType: "text/html; charset=utf-8" },
  "/clientes.html": { file: "public/clients.html", contentType: "text/html; charset=utf-8" },
  "/client-profile.html": { file: "public/client-profile.html", contentType: "text/html; charset=utf-8" },
  "/client-profile.css": { file: "public/client-profile.css", contentType: "text/css; charset=utf-8" },
  "/client-profile.js": { file: "public/client-profile.js", contentType: "text/javascript; charset=utf-8" },
  "/clients.css": { file: "public/clients.css", contentType: "text/css; charset=utf-8" },
  "/clients.js": { file: "public/clients.js", contentType: "text/javascript; charset=utf-8" },
  "/gimnasios": { file: "public/gyms.html", contentType: "text/html; charset=utf-8" },
  "/gyms.html": { file: "public/gyms.html", contentType: "text/html; charset=utf-8" },
  "/gyms.css": { file: "public/gyms.css", contentType: "text/css; charset=utf-8" },
  "/gyms.js": { file: "public/gyms.js", contentType: "text/javascript; charset=utf-8" },
};

const server = createServer(async (request, response) => {
  if (!isLocalRequest(request)) {
    sendError(response, 403, "La aplicación solo acepta conexiones locales.");
    return;
  }

  const hostHeader = request.headers.host;
  if (hostHeader !== `localhost:${port}` && hostHeader !== `127.0.0.1:${port}`) {
    sendError(response, 403, "Host no permitido.");
    return;
  }

  let url: URL;
  try {
    url = new URL(request.url ?? "/", `http://${hostHeader}`);
  } catch {
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
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendError(response, 405, "Método no permitido.");
      return;
    }

    const profileMatch = url.pathname.match(/^\/clientes\/[0-9a-f-]+\/ficha$/i);
    const asset = profileMatch ? staticFiles["/client-profile.html"] : staticFiles[url.pathname];
    if (!asset) {
      sendError(response, 404, "No se encontró la página.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": asset.contentType,
      "Cache-Control": "no-store",
    });

    if (url.pathname === "/runtime.js") {
      response.end(`window.CALENDAR_SERVER=true;window.CALENDAR_DEV_TOKEN=${JSON.stringify(calendarBootstrapToken)};`);
      return;
    }

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    await pipeline(createReadStream(join(process.cwd(), asset.file)), response);
  } catch (error) {
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
    } else {
      response.destroy();
    }
  }
});

async function start(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const store = new Store(pool);
  await pool.query(calendarMigration);
  await pool.query(accessMigration);
  await pool.query(progressMigration);
  const configuredGym = (await prisma.gym.findFirst({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true } }))?.id || "trainers-point-bizkaia";
  let gym = configuredGym;
  const schedule = Array.from({ length: 7 }, (_, i) => ({ open: "09:00", close: i === 5 ? "14:00" : "21:00", closed: i === 6 }));
  await store.seed(gym, {
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
  });
  const token = process.env.CALENDAR_ADMIN_TOKEN || randomBytes(24).toString("hex");
  calendarBootstrapToken = token;
  const calendar = createCalendarServer(store, gym, token, { exposeAdminToken: true });
  calendarHandler = calendar.listeners("request")[0] as (request: IncomingMessage, response: ServerResponse) => unknown;
  server.listen(port, host, () => console.log(`Trainers Point disponible en http://localhost:${port}/`));
  const close = () => {
    void server.close(async () => {
      calendar.close();
      await pool.end();
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
