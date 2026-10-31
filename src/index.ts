import "dotenv/config";
import { Inventory, inventoryPermission } from "./inventory";
import { ApiError } from "./calendar/model";
import { ZodError } from "zod";
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
  SaleStatus,
  type ClientStatus,
} from "@prisma/client";
import { prisma } from "./lib/prisma";
import { Store, migration as calendarMigration } from "./calendar/store";
import { accessMigration, Access, type Identity } from "./calendar/access";
import { server as createCalendarServer } from "./calendar/http";
import { progressMigration } from "./progress-migration";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
const maxBodyBytes = 2 * 1024 * 1024;
const validStatuses: ClientStatus[] = ["LEAD", "ACTIVO", "INACTIVO", "BAJA"];
const validPaymentMethods: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];
const validPaymentStatuses: PaymentStatus[] = ["PENDIENTE", "PAGADO", "FALLIDO", "REEMBOLSADO"];
const validAttendanceStatuses: AttendanceStatus[] = ["PENDIENTE", "ASISTIO", "NO_ASISTIO", "CANCELADA"];
let calendarHandler: ((request: IncomingMessage, response: ServerResponse) => unknown) | undefined;
let calendarBootstrapToken = "";
let calendarAccess: Access | undefined;
let calendarPool: Pool | undefined;
let currentConfiguredGym = "trainers-point-bizkaia";

type ClientInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gymId: string;
  dni?: string | null;
  address?: string | null;
  birthDate?: string;
  notes?: string;
  objective?: string;
  sex?: ClientSexInput | null;
  source?: ClientSourceInput | null;
  sourceDetail?: string | null;
  preferredName?: string | null;
  contactPreference?: ContactPreferenceInput | null;
  contactSlot?: ContactSlotInput | null;
  injuries?: string[] | null;
  injuryNotes?: string | null;
  availability?: { days: string[]; slots: string[] } | null;
  sessionsPerWeek?: number | null;
  firstSessionPreference?: Date | null;
  consentData?: Date | null;
  consentMarketing?: Date | null;
  consentPhotos?: Date | null;
};

const clientSexValues = ["MUJER", "HOMBRE", "NO_INDICA"] as const;
const clientSourceValues = ["INSTAGRAM", "RECOMENDACION", "PASO_POR_LA_PUERTA", "GOOGLE", "OTRO"] as const;
const contactPreferenceValues = ["WHATSAPP", "SMS", "LLAMADA", "EMAIL"] as const;
const contactSlotValues = ["MANANA", "MEDIODIA", "TARDE"] as const;
const injuryZoneValues = ["RODILLA", "ESPALDA", "HOMBRO", "CUELLO", "CADERA", "OTRA"] as const;
const availabilityDayValues = ["L", "M", "X", "J", "V", "S", "D"] as const;
const sessionsPerWeekValues = [1, 2, 3, 4] as const;
type ClientSexInput = (typeof clientSexValues)[number];
type ClientSourceInput = (typeof clientSourceValues)[number];
type ContactPreferenceInput = (typeof contactPreferenceValues)[number];
type ContactSlotInput = (typeof contactSlotValues)[number];

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
  photoData?: string;
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

function isOneOf<T extends readonly (string | number)[]>(value: unknown, values: T): value is T[number] {
  return values.some((candidate) => candidate === value);
}

function parseConsentDate(value: unknown): Date | null | undefined | string {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return "La fecha del consentimiento no es válida.";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return "La fecha del consentimiento no es válida.";
  }
  return parsed;
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function parseClientInput(value: unknown): ClientInput | string {
  if (!isRecord(value)) {
    return "El formulario no tiene un formato válido.";
  }

  const firstName = typeof value.firstName === "string" ? value.firstName.trim() : "";
  const lastName = typeof value.lastName === "string" ? value.lastName.trim() : "";
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const phone = typeof value.phone === "string" ? value.phone.trim() : "";
  const dni = value.dni === undefined ? undefined : value.dni === null ? null : typeof value.dni === "string" ? value.dni.trim() : "";
  const address = value.address === undefined ? undefined : value.address === null ? null : typeof value.address === "string" ? value.address.trim() : "";
  const notes = typeof value.notes === "string" ? value.notes.trim() : "";
  const objective = typeof value.objective === "string" ? value.objective.trim() : "";
  const birthDate = typeof value.birthDate === "string" ? value.birthDate.trim() : "";
  const gymId = typeof value.gymId === "string" ? value.gymId.trim() : "";
  const sex = value.sex === undefined ? undefined : value.sex === null || value.sex === "" ? null : value.sex;
  const source = value.source === undefined ? undefined : value.source === null || value.source === "" ? null : value.source;
  const contactPreference = value.contactPreference === undefined ? undefined : value.contactPreference === null || value.contactPreference === "" ? null : value.contactPreference;
  const contactSlot = value.contactSlot === undefined ? undefined : value.contactSlot === null || value.contactSlot === "" ? null : value.contactSlot;
  const sourceDetail = value.sourceDetail === undefined ? undefined : value.sourceDetail === null ? null : typeof value.sourceDetail === "string" ? value.sourceDetail.trim() : "";
  const preferredName = value.preferredName === undefined ? undefined : value.preferredName === null ? null : typeof value.preferredName === "string" ? value.preferredName.trim() : "";
  const injuryNotes = value.injuryNotes === undefined ? undefined : value.injuryNotes === null ? null : typeof value.injuryNotes === "string" ? value.injuryNotes.trim() : "";
  const injuries = value.injuries;
  const availability = value.availability;
  const sessionsPerWeek = value.sessionsPerWeek;
  const firstSessionPreference = parseConsentDate(value.firstSessionPreference);
  const consentData = parseConsentDate(value.consentData);
  const consentMarketing = parseConsentDate(value.consentMarketing);
  const consentPhotos = parseConsentDate(value.consentPhotos);
  if (
    (value.birthDate !== undefined && value.birthDate !== null && typeof value.birthDate !== "string") ||
    (value.dni !== undefined && value.dni !== null && typeof value.dni !== "string") ||
    (value.address !== undefined && value.address !== null && typeof value.address !== "string") ||
    (value.sourceDetail !== undefined && value.sourceDetail !== null && typeof value.sourceDetail !== "string") ||
    (value.preferredName !== undefined && value.preferredName !== null && typeof value.preferredName !== "string") ||
    (value.injuryNotes !== undefined && value.injuryNotes !== null && typeof value.injuryNotes !== "string")
  ) {
    return "Revisa los campos de texto de la ficha.";
  }

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

  if (notes.length > 5000 || objective.length > 1000) {
    return "Las notas o el objetivo superan la longitud permitida.";
  }
  if ((dni?.length ?? 0) > 40 || (address?.length ?? 0) > 300) {
    return "El DNI o la dirección superan la longitud permitida.";
  }

  if (sex !== undefined && sex !== null && !isOneOf(sex, clientSexValues)) return "Selecciona una opción de sexo válida.";
  if (source !== undefined && source !== null && !isOneOf(source, clientSourceValues)) return "Selecciona un origen válido.";
  if (contactPreference !== undefined && contactPreference !== null && !isOneOf(contactPreference, contactPreferenceValues)) return "Selecciona una forma de contacto válida.";
  if (contactSlot !== undefined && contactSlot !== null && !isOneOf(contactSlot, contactSlotValues)) return "Selecciona una franja de contacto válida.";
  if ((sourceDetail?.length ?? 0) > 200 || (preferredName?.length ?? 0) > 100 || (injuryNotes?.length ?? 0) > 3000) {
    return "Uno de los campos de la ficha supera la longitud permitida.";
  }
  if (injuries !== undefined && injuries !== null &&
      (!Array.isArray(injuries) || injuries.length > injuryZoneValues.length ||
       injuries.some((zone) => !isOneOf(zone, injuryZoneValues)) ||
       new Set(injuries).size !== injuries.length)) {
    return "Revisa las zonas de lesión seleccionadas.";
  }
  if (availability !== undefined && availability !== null) {
    if (!isRecord(availability) || !Array.isArray(availability.days) || !Array.isArray(availability.slots) ||
        availability.days.some((day) => !isOneOf(day, availabilityDayValues)) ||
        availability.slots.some((slot) => !isOneOf(slot, contactSlotValues)) ||
        new Set(availability.days).size !== availability.days.length ||
        new Set(availability.slots).size !== availability.slots.length) {
      return "Revisa los días y las franjas de disponibilidad.";
    }
  }
  if (sessionsPerWeek !== undefined && sessionsPerWeek !== null &&
      !isOneOf(sessionsPerWeek, sessionsPerWeekValues)) {
    return "Selecciona una frecuencia semanal válida.";
  }
  if (
    typeof firstSessionPreference === "string" ||
    typeof consentData === "string" ||
    typeof consentMarketing === "string" ||
    typeof consentPhotos === "string"
  ) {
    return "Una de las fechas indicadas no es válida.";
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
    ...(dni !== undefined ? { dni: dni || null } : {}),
    ...(address !== undefined ? { address: address || null } : {}),
    ...(birthDate ? { birthDate } : {}),
    ...(notes ? { notes } : {}),
    ...(objective ? { objective } : {}),
    ...(sex !== undefined ? { sex: sex as ClientSexInput | null } : {}),
    ...(source !== undefined ? { source: source as ClientSourceInput | null } : {}),
    ...(sourceDetail !== undefined ? { sourceDetail: sourceDetail || null } : {}),
    ...(preferredName !== undefined ? { preferredName: preferredName || null } : {}),
    ...(contactPreference !== undefined ? { contactPreference: contactPreference as ContactPreferenceInput | null } : {}),
    ...(contactSlot !== undefined ? { contactSlot: contactSlot as ContactSlotInput | null } : {}),
    ...(injuries !== undefined ? { injuries: injuries as string[] | null } : {}),
    ...(injuryNotes !== undefined ? { injuryNotes: injuryNotes || null } : {}),
    ...(availability !== undefined ? {
      availability: availability === null ? null : {
        days: availability.days as string[],
        slots: availability.slots as string[],
      },
    } : {}),
    ...(sessionsPerWeek !== undefined ? { sessionsPerWeek: sessionsPerWeek as number | null } : {}),
    ...(firstSessionPreference !== undefined ? { firstSessionPreference } : {}),
    ...(consentData !== undefined ? { consentData } : {}),
    ...(consentMarketing !== undefined ? { consentMarketing } : {}),
    ...(consentPhotos !== undefined ? { consentPhotos } : {}),
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
  const photoData = typeof value.photoData === "string" ? value.photoData.trim() : "";

  if (!name || name.length > 120) {
    return "El nombre es obligatorio y debe tener como máximo 120 caracteres.";
  }
  if (city.length > 100 || province.length > 100 || address.length > 200) {
    return "La ubicación supera la longitud permitida.";
  }

  if (photoData && (!/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(photoData) || photoData.length > 1_500_000)) {
    return "La imagen no es vÃ¡lida o supera el tamaÃ±o permitido.";
  }

  return {
    name,
    ...(city ? { city } : {}),
    ...(province ? { province } : {}),
    ...(address ? { address } : {}),
    ...(photoData ? { photoData } : {}),
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
  const isPublic = url.pathname === "/api/health" || url.pathname === "/api/login" || url.pathname.startsWith("/api/public/");
  if (!isPublic && calendarAccess) {
    const bearer = (request.headers.authorization || "").replace(/^Bearer /, "");
    let selectedGym = (request.headers["x-calendar-gym"] as string) || currentConfiguredGym;
    let identity: Identity | null = null;
    if (bearer && bearer === calendarBootstrapToken && (await calendarAccess.needsSetup(selectedGym))) {
      identity = { id: "bootstrap", name: "Administrador local", role: "ADMIN", employeeId: null, clientId: null, mustChangePassword: false };
    } else if (bearer) {
      try {
        identity = await calendarAccess.identify(selectedGym, bearer);
      } catch {
        identity = null;
      }
    }
    if (!identity && bearer && url.pathname === "/api/gyms" && selectedGym !== currentConfiguredGym) {
      try {
        selectedGym = currentConfiguredGym;
        identity = await calendarAccess.identify(selectedGym, bearer);
      } catch {
        identity = null;
      }
    }
    if (!identity) {
      const calendarOnlyRoutes = ["/api/client-calendar", "/api/client-slots", "/api/leaves", "/api/recoveries", "/api/me", "/api/logout", "/api/password/change", "/api/manage", "/api/state", "/api/attendance", "/api/bookings", "/api/config", "/api/slots"];
      const isCalendarOnly = calendarOnlyRoutes.some(p => url.pathname === p || url.pathname.startsWith(p + "/"));
      if (isCalendarOnly && calendarHandler) {
        await calendarHandler(request, response);
        return;
      }
      sendError(response, 401, "Inicia sesión para continuar.");
      return;
    }
    if (identity.mustChangePassword &&
      url.pathname !== "/api/me" &&
      url.pathname !== "/api/logout" &&
      url.pathname !== "/api/password/change") {
      sendError(response, 403, "Debes cambiar la contraseña antes de continuar.");
      return;
    }
    if (identity.role === "CLIENT") {
      const isMeOrLogout = ["/api/client-calendar", "/api/client-slots", "/api/recoveries"].includes(url.pathname) || url.pathname === "/api/me" || url.pathname === "/api/logout" || url.pathname === "/api/password/change";
      if (!isMeOrLogout) {
        sendError(response, 403, "Tu perfil no tiene acceso a las funciones de gestión.");
        return;
      }
    }
    if (url.pathname.startsWith("/api/gyms")) {
      if (identity.role !== "ADMIN" && !(identity.role === "RECEPTION" && request.method === "GET")) {
        sendError(response, 403, "Solo administración puede gestionar sedes.");
        return;
      }
    }
    if (identity.role === "TRAINER") {
      if (url.pathname.startsWith("/api/services") && request.method !== "GET") {
        sendError(response, 403, "Tu perfil no permite modificar servicios.");
        return;
      }
      if (url.pathname.startsWith("/api/clients") && request.method !== "GET") {
        sendError(response, 403, "Tu perfil no permite modificar fichas de clientes.");
        return;
      }
      if (url.pathname.startsWith("/api/service-packages") || url.pathname.includes("/attendance")) {
        sendError(response, 403, "Tu perfil no permite modificar bonos ni asistencia de clientes.");
        return;
      }
    }
    (request as any).identity = identity;
    (request as any).selectedGym = selectedGym;
  }
  if (url.pathname.startsWith("/api/inventory/")) {
    try {
      const actor=(request as any).identity as Identity | undefined;
      const gym=(request as any).selectedGym as string;
      const inventory=new Inventory(prisma);
      const product=url.pathname.match(/^\/api\/inventory\/products(?:\/([0-9a-f-]+))?$/i);
      const reversal=url.pathname.match(/^\/api\/inventory\/sales\/([0-9a-f-]+)\/(cancel|return)$/i);
      inventoryPermission(actor,request.method==='GET'?'read':url.pathname==='/api/inventory/sales'?'sell':'admin');
      if(product && request.method==='GET'&&!product[1])sendJson(response,200,{products:await inventory.products(gym)});
      else if(product&&request.method==='POST'&&!product[1])sendJson(response,201,await inventory.saveProduct(gym,await readJsonBody(request)));
      else if(product&&request.method==='PUT'&&product[1])sendJson(response,200,await inventory.saveProduct(gym,await readJsonBody(request),product[1]));
      else if(product&&request.method==='DELETE'&&product[1])sendJson(response,200,await inventory.removeProduct(gym,product[1]));
      else if(url.pathname==='/api/inventory/sales'&&request.method==='GET')sendJson(response,200,await inventory.salesPage(gym,url.searchParams));
      else if(url.pathname==='/api/inventory/sales'&&request.method==='POST')sendJson(response,201,await inventory.sell(gym,actor!.id,await readJsonBody(request)));
      else if(reversal&&request.method==='POST')sendJson(response,200,await inventory.reverse(gym,reversal[1],reversal[2]==='cancel'?{}:await readJsonBody(request),reversal[2]==='cancel'));
      else sendError(response,404,"Operación desconocida.");
    } catch(error) {
      if(error instanceof ApiError)sendError(response,error.status,error.message);
      else if(error instanceof ZodError)sendError(response,400,"Revisa los campos, cantidades y precios de la operación.");
      else throw error;
    }
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/services") {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true, durationMin: true, price: true },
      orderBy: { name: "asc" },
    });
    sendJson(response, 200, { services });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/clients/duplicates") {
    const email = url.searchParams.get("email")?.trim().toLowerCase().slice(0, 254) ?? "";
    const phone = url.searchParams.get("phone")?.trim().slice(0, 40) ?? "";
    const digits = phoneDigits(phone);
    if (!email && digits.length < 4) {
      sendError(response, 400, "Introduce un correo o un teléfono para comprobar si ya hay una ficha.");
      return;
    }

    const phoneCondition = digits.length >= 4
      ? Prisma.sql`regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}`
      : Prisma.sql`FALSE`;
    const emailCondition = email
      ? Prisma.sql`lower(email) = ${email}`
      : Prisma.sql`FALSE`;
    const candidates = await prisma.$queryRaw<Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    }>>(Prisma.sql`
      SELECT id, "firstName", "lastName", email, phone
      FROM "Client"
      WHERE (${phoneCondition}) OR (${emailCondition})
      LIMIT 100
    `);
    const matches = candidates.flatMap((client) => {
      const field = email && client.email.toLowerCase() === email
        ? "email"
        : digits.length >= 4 && phoneDigits(client.phone) === digits
          ? "phone"
          : "";
      return field ? [{ field, client: { id: client.id, firstName: client.firstName, lastName: client.lastName } }] : [];
    });
    sendJson(response, 200, { matches });
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
        dni: true, assignedWorkerId: true,
        address: true,
        objective: true,
        birthDate: true,
        sex: true,
        source: true,
        sourceDetail: true,
        preferredName: true,
        contactPreference: true,
        contactSlot: true,
        injuries: true,
        injuryNotes: true,
        availability: true,
        sessionsPerWeek: true,
        firstSessionPreference: true,
        consentData: true,
        consentMarketing: true,
        consentPhotos: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
        gym: { select: { id: true, name: true, city: true, province: true } },
      },
    });
    if (!client) { sendError(response, 404, "No se encontró el cliente."); return; }
    if ((request as any).identity?.role === "TRAINER") {
      const empId = (request as any).identity.employeeId;
      const trainerBookings = calendarPool ? (await calendarPool.query(
        "SELECT 1 FROM calendar.bookings WHERE gym_id=$1 AND data->>'employeeId'=$2 AND data->>'clientId'=$3 LIMIT 1",
        [(request as any).selectedGym || currentConfiguredGym, empId, client.id]
      )).rows.length > 0 : false;
      if (!trainerBookings && (client as any).assignedWorkerId !== empId) {
        sendError(response, 403, "No tienes acceso a esta ficha de cliente.");
        return;
      }
    }
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

  const clientDetailsMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/details$/i);
  if (request.method === "PATCH" && clientDetailsMatch) {
    if (!hasTrustedOrigin(request, port)) { sendError(response, 403, "Origen de la solicitud no permitido."); return; }
    const body = await readJsonBody(request);
    if (!isRecord(body)) { sendError(response, 400, "Los datos de la ficha no tienen un formato válido."); return; }
    const editableFields = [
      "dni", "address", "birthDate", "sex", "source", "sourceDetail", "preferredName", "contactPreference", "contactSlot",
      "injuries", "injuryNotes", "availability", "sessionsPerWeek", "firstSessionPreference", "consentData", "consentMarketing", "consentPhotos",
    ] as const;
    const submitted = Object.fromEntries(editableFields
      .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
      .map((field) => [field, body[field]]));
    if (!Object.keys(submitted).length) { sendError(response, 400, "No hay cambios para guardar."); return; }

    const input = parseClientInput({
      firstName: "Ficha",
      lastName: "Cliente",
      email: "ficha@example.com",
      phone: "000",
      gymId: "00000000-0000-4000-8000-000000000000",
      ...submitted,
    });
    if (typeof input === "string") { sendError(response, 400, input); return; }

    const data: Prisma.ClientUpdateInput = {};
    if (Object.prototype.hasOwnProperty.call(body, "dni")) data.dni = input.dni ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "address")) data.address = input.address ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "birthDate")) {
      data.birthDate = input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "sex")) data.sex = input.sex ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "source")) data.source = input.source ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "sourceDetail")) data.sourceDetail = input.sourceDetail ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "preferredName")) data.preferredName = input.preferredName ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "contactPreference")) data.contactPreference = input.contactPreference ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "contactSlot")) data.contactSlot = input.contactSlot ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "injuries")) data.injuries = input.injuries ?? Prisma.DbNull;
    if (Object.prototype.hasOwnProperty.call(body, "injuryNotes")) data.injuryNotes = input.injuryNotes ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "availability")) data.availability = input.availability ?? Prisma.DbNull;
    if (Object.prototype.hasOwnProperty.call(body, "sessionsPerWeek")) data.sessionsPerWeek = input.sessionsPerWeek ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "firstSessionPreference")) data.firstSessionPreference = input.firstSessionPreference ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "consentData")) data.consentData = input.consentData ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "consentMarketing")) data.consentMarketing = input.consentMarketing ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "consentPhotos")) data.consentPhotos = input.consentPhotos ?? null;

    try {
      const client = await prisma.client.update({
        where: { id: clientDetailsMatch[1] },
        data,
        select: {
          id: true,
          dni: true, assignedWorkerId: true,
          address: true,
          birthDate: true,
          sex: true,
          source: true,
          sourceDetail: true,
          preferredName: true,
          contactPreference: true,
          contactSlot: true,
          injuries: true,
          injuryNotes: true,
          availability: true,
          sessionsPerWeek: true,
          firstSessionPreference: true,
          consentData: true,
          consentMarketing: true,
          consentPhotos: true,
        },
      });
      sendJson(response, 200, { client });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = error.meta?.target;
        const dniConflict = Array.isArray(target)
          ? target.includes("dni")
          : typeof target === "string" && target.toLowerCase().includes("dni");
        if (dniConflict) {
          sendError(response, 409, "Ese DNI ya está asociado a otra ficha.");
          return;
        }
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente.");
        return;
      }
      throw error;
    }
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
      select: { id: true, firstName: true, lastName: true, assignedWorkerId: true },
    });
    if (!client) {
      sendError(response, 404, "No se encontró el cliente.");
      return;
    }
    if ((request as any).identity?.role === "TRAINER") {
      const empId = (request as any).identity.employeeId;
      const trainerBookings = calendarPool ? (await calendarPool.query(
        "SELECT 1 FROM calendar.bookings WHERE gym_id=$1 AND data->>'employeeId'=$2 AND data->>'clientId'=$3 LIMIT 1",
        [(request as any).selectedGym || currentConfiguredGym, empId, client.id]
      )).rows.length > 0 : false;
      if (!trainerBookings && (client as any).assignedWorkerId !== empId) {
        sendError(response, 403, "No tienes acceso a esta ficha de cliente."); return; } /*
        return;
      }
      return;
    }

*/ }
    const packages = await prisma.clientServicePackage.findMany({
      where: { clientId },
      include: { service: { select: { id: true, name: true, durationMin: true } } },
      orderBy: { purchasedAt: "desc" },
    });
    const [bookings, bookingCounts, sales, debtSales] = await Promise.all([
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
      prisma.sale.findMany({
        where: { clientId },
        select: {
          id: true,
          status: true,
          currency: true,
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          soldAt: true,
          createdAt: true,
          lines: { select: { description: true, quantity: true, unitPrice: true, lineTotal: true, type: true } },
          payments: { select: { method: true, status: true, amount: true, paidAt: true } },
        },
        orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.sale.findMany({
        where: { clientId, status: SaleStatus.COMPLETADA },
        select: {
          currency: true,
          totalAmount: true,
          payments: {
            where: { status: PaymentStatus.PAGADO },
            select: { amount: true },
          },
        },
      }),
    ]);

    const debtByCurrency = new Map<string, number>();
    for (const servicePackage of packages) {
      if (
        servicePackage.paymentStatus === PaymentStatus.PENDIENTE ||
        servicePackage.paymentStatus === PaymentStatus.FALLIDO
      ) {
        debtByCurrency.set("EUR", (debtByCurrency.get("EUR") ?? 0) + Number(servicePackage.totalAmount));
      }
    }
    for (const sale of debtSales) {
      const paid = sale.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const outstanding = Math.max(0, Number(sale.totalAmount) - paid);
      if (outstanding > 0) {
        debtByCurrency.set(sale.currency, (debtByCurrency.get(sale.currency) ?? 0) + outstanding);
      }
    }
    const debt = [...debtByCurrency]
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
      .filter(({ amount }) => amount > 0);

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
      sales,
      debt,
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
    const photos = await prisma.$queryRaw<Array<{ id: string; photoData: string | null }>>(Prisma.sql`SELECT "id", "photoData" FROM "Gym" WHERE "isActive" = true`);
    const photoById = new Map(photos.map((photo) => [photo.id, photo.photoData]));
    sendJson(response, 200, { gyms: gyms.map((gym) => ({ ...gym, photoData: photoById.get(gym.id) ?? null })) });
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
      const { photoData, ...gymData } = input;
      const gym = await prisma.gym.create({
        data: gymData,
        select: { id: true, name: true, city: true, province: true, address: true },
      });
      if (photoData) {
        await prisma.$executeRaw(Prisma.sql`UPDATE "Gym" SET "photoData" = ${photoData} WHERE "id" = ${gym.id}::uuid`);
      }
      sendJson(response, 201, { gym: { ...gym, photoData: photoData ?? null } });
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

    if ((request as any).identity?.role === "TRAINER") {
      const empId = (request as any).identity.employeeId;
      const trainerBookings = calendarPool ? (await calendarPool.query(
        "SELECT data->>'clientId' as cid FROM calendar.bookings WHERE gym_id=$1 AND data->>'employeeId'=$2",
        [(request as any).selectedGym || currentConfiguredGym, empId]
      )).rows.map((r: any) => r.cid) : [];
      const trainerConditions: Prisma.ClientWhereInput[] = [];
      if (empId) trainerConditions.push({ assignedWorkerId: empId });
      if (trainerBookings.length) trainerConditions.push({ id: { in: trainerBookings } });
      if (trainerConditions.length) {
        where.AND = [{ OR: trainerConditions }];
      } else {
        where.id = "00000000-0000-0000-0000-000000000000";
      }
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
          notes: true,
          objective: true,
          sex: true,
          source: true,
          sourceDetail: true,
          preferredName: true,
          contactPreference: true,
          contactSlot: true,
          injuries: true,
          injuryNotes: true,
          availability: true,
          sessionsPerWeek: true,
          firstSessionPreference: true,
          consentData: true,
          consentMarketing: true,
          consentPhotos: true,
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
    if (!input.consentData) {
      sendError(response, 400, "Confirma el uso de datos personales para crear la ficha.");
      return;
    }

    try {
      const client = await prisma.client.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          ...(input.dni !== undefined ? { dni: input.dni } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          gym: { connect: { id: input.gymId } },
          ...(input.birthDate ? { birthDate: new Date(`${input.birthDate}T00:00:00.000Z`) } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
          ...(input.objective ? { objective: input.objective } : {}),
          ...(input.sex !== undefined ? { sex: input.sex } : {}),
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.sourceDetail !== undefined ? { sourceDetail: input.sourceDetail } : {}),
          ...(input.preferredName !== undefined ? { preferredName: input.preferredName } : {}),
          ...(input.contactPreference !== undefined ? { contactPreference: input.contactPreference } : {}),
          ...(input.contactSlot !== undefined ? { contactSlot: input.contactSlot } : {}),
          ...(input.injuries !== undefined ? { injuries: input.injuries === null ? Prisma.DbNull : input.injuries } : {}),
          ...(input.injuryNotes !== undefined ? { injuryNotes: input.injuryNotes } : {}),
          ...(input.availability !== undefined ? { availability: input.availability === null ? Prisma.DbNull : input.availability } : {}),
          ...(input.sessionsPerWeek !== undefined ? { sessionsPerWeek: input.sessionsPerWeek } : {}),
          ...(input.firstSessionPreference !== undefined ? { firstSessionPreference: input.firstSessionPreference } : {}),
          ...(input.consentData !== undefined ? { consentData: input.consentData } : {}),
          ...(input.consentMarketing !== undefined ? { consentMarketing: input.consentMarketing } : {}),
          ...(input.consentPhotos !== undefined ? { consentPhotos: input.consentPhotos } : {}),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dni: true, assignedWorkerId: true,
          address: true,
          email: true,
          phone: true,
          birthDate: true,
          objective: true,
          sex: true,
          source: true,
          sourceDetail: true,
          preferredName: true,
          contactPreference: true,
          contactSlot: true,
          injuries: true,
          injuryNotes: true,
          availability: true,
          sessionsPerWeek: true,
          firstSessionPreference: true,
          consentData: true,
          consentMarketing: true,
          consentPhotos: true,
          status: true,
          gymId: true,
          gym: { select: { id: true, name: true, city: true, province: true } },
          createdAt: true,
        },
      });
      sendJson(response, 201, { client });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = error.meta?.target;
        const dniConflict = Array.isArray(target)
          ? target.includes("dni")
          : typeof target === "string" && target.toLowerCase().includes("dni");
        if (dniConflict) {
          sendError(response, 409, "Ese DNI ya está asociado a otra ficha.");
          return;
        }
        sendError(response, 409, "Ya existe un cliente con ese correo.");
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
        select: { id: true, gym: { select: { id: true, name: true, city: true, province: true } } },
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
  "/ausencias.html": { file: "web/ausencias.html", contentType: "text/html; charset=utf-8" },
  "/ausencias.js": { file: "web/ausencias.js", contentType: "text/javascript; charset=utf-8" },
  "/ausencias.css": { file: "web/ausencias.css", contentType: "text/css; charset=utf-8" },
  "/recuperaciones.html": { file: "web/recuperaciones.html", contentType: "text/html; charset=utf-8" },
  "/recuperaciones.js": { file: "web/recuperaciones.js", contentType: "text/javascript; charset=utf-8" },
  "/mis-reservas.html": { file: "web/mis-reservas.html", contentType: "text/html; charset=utf-8" },
  "/mis-reservas.js": { file: "web/mis-reservas.js", contentType: "text/javascript; charset=utf-8" },
  "/productos.html": { file: "web/productos.html", contentType: "text/html; charset=utf-8" },
  "/productos.js": { file: "web/productos.js", contentType: "text/javascript; charset=utf-8" },
  "/productos.css": { file: "web/productos.css", contentType: "text/css; charset=utf-8" },
  "/gestion.html": { file: "web/gestion.html", contentType: "text/html; charset=utf-8" },
  "/gestion.css": { file: "web/gestion.css", contentType: "text/css; charset=utf-8" },
  "/gestion.js": { file: "web/gestion.js", contentType: "text/javascript; charset=utf-8" },
  "/login.html": { file: "web/login.html", contentType: "text/html; charset=utf-8" },
  "/login.js": { file: "web/login.js", contentType: "text/javascript; charset=utf-8" },
  "/change-password.html": { file: "web/change-password.html", contentType: "text/html; charset=utf-8" },
  "/change-password.js": { file: "web/change-password.js", contentType: "text/javascript; charset=utf-8" },
  "/app.js": { file: "web/app.js", contentType: "text/javascript; charset=utf-8" },
  "/calendar-core.js": { file: "web/calendar-core.js", contentType: "text/javascript; charset=utf-8" },
  "/runtime.js": { file: "web/runtime.js", contentType: "text/javascript; charset=utf-8" },
  "/menu.js": { file: "web/menu.js", contentType: "text/javascript; charset=utf-8" },
  "/menu.css": { file: "web/menu.css", contentType: "text/css; charset=utf-8" },
  "/assets/trainers-point-logo.png": { file: "public/assets/trainers-point-logo.png", contentType: "image/png" },
  "/assets/fonts/bahnschrift.ttf": { file: "public/assets/fonts/bahnschrift.ttf", contentType: "font/ttf" },
  "/assets/fonts/arial.ttf": { file: "public/assets/fonts/arial.ttf", contentType: "font/ttf" },
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
  "/usuarios": { file: "public/users.html", contentType: "text/html; charset=utf-8" },
  "/usuarios.html": { file: "public/users.html", contentType: "text/html; charset=utf-8" },
  "/users.js": { file: "public/users.js", contentType: "text/javascript; charset=utf-8" },
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
      response.end(`window.CALENDAR_SERVER=true;(()=>{const f=window.fetch.bind(window);window.fetch=(i,o={})=>{const u=typeof i==='string'?i:i.url;if(u.startsWith('/api/')){const h=new Headers(o.headers||(typeof i!=='string'?i.headers:undefined)),g=localStorage.getItem('calendar-selected-gym');if(g)h.set('X-Calendar-Gym',g);const t=sessionStorage.getItem('calendar-user-token')||sessionStorage.getItem('calendar-admin-token')||window.CALENDAR_DEV_TOKEN||'';if(t&&!h.has('Authorization'))h.set('Authorization','Bearer '+t);o={...o,headers:h};}return f(i,o);};})();window.CALENDAR_DEV_TOKEN=${JSON.stringify(calendarBootstrapToken)};`);
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
  const calendarDatabaseUrl = process.env.CALENDAR_DATABASE_URL || process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: calendarDatabaseUrl });
  const crmPool = calendarDatabaseUrl === process.env.DATABASE_URL
    ? pool
    : new Pool({ connectionString: process.env.DATABASE_URL });
  calendarPool = pool;
  const store = new Store(pool,prisma);
  calendarAccess = new Access(pool,prisma);
  await pool.query(calendarMigration);
  await pool.query(accessMigration);
  await crmPool.query(progressMigration);
  const activeGyms = await prisma.gym.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const configuredGym = activeGyms[0]?.id || "trainers-point-bizkaia";
  const developmentGyms = activeGyms.length ? activeGyms : [{ id: configuredGym, name: "Trainers Point" }];
  let gym = configuredGym;
  currentConfiguredGym = gym;
  const schedule = Array.from({ length: 7 }, (_, i) => ({ open: "09:00", close: i === 5 ? "14:00" : "21:00", closed: i === 6 }));
  const initialCalendarConfig = {
    leaveRequests: [],
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
  };
  await store.seed(gym, initialCalendarConfig);
  if (process.env.TRAINERS_POINT_DEV_ADMIN === "true") {
    if (process.env.NODE_ENV === "production")
      throw new Error("No se permite activar la cuenta provisional admin/admin en producción.");
    let databaseHost: string;
    try {
      databaseHost = new URL(calendarDatabaseUrl || "").hostname.toLowerCase();
    } catch {
      throw new Error("La cuenta provisional requiere una CALENDAR_DATABASE_URL local válida.");
    }
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseHost))
      throw new Error("La cuenta provisional admin/admin solo se permite con PostgreSQL local; no se ha creado ninguna cuenta.");
    let createdAdmin = false;
    for (const activeGym of developmentGyms) {
      if (activeGym.id !== gym) await store.seed(activeGym.id, initialCalendarConfig);
      createdAdmin = await calendarAccess.seedLocalDevelopmentAdmin(activeGym.id) || createdAdmin;
    }
    if (createdAdmin)
      console.warn("Cuenta provisional local creada para centros sin cuentas previas. Usuario: admin · Contraseña: admin. No usar fuera de desarrollo.");
  }
  const token = process.env.CALENDAR_ADMIN_TOKEN || randomBytes(24).toString("hex");
  calendarBootstrapToken = token;
  const calendar = createCalendarServer(store, gym, token, { exposeAdminToken: true });
  calendarHandler = calendar.listeners("request")[0] as (request: IncomingMessage, response: ServerResponse) => unknown;
  server.listen(port, host, () => console.log(`Trainers Point disponible en http://localhost:${port}/`));
  const close = () => {
    void server.close(async () => {
      calendar.close();
      await pool.end();
      if (crmPool !== pool) await crmPool.end();
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
