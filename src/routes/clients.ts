import { AttendanceStatus, PaymentStatus, Prisma, type ClientStatus } from "@prisma/client";
import { type IncomingMessage, type ServerResponse } from "node:http";
import type { ApiContext } from '../http/api-context';
import { readJsonBody, sendError, sendJson } from "../http/json";
import { prisma } from "../lib/prisma";
import { accessibleClient, clientScope, clientScopeSQL } from "../network/scope";
import { isRecord, parseClientInput, parseMeasurementInput, phoneDigits, validStatuses } from "../validation/records";
export async function clientsRoutes(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiContext): Promise<boolean> {
  const { port, currentConfiguredGym, calendarPool, hasTrustedOrigin } = context;
  const selectedGym=(request as any).selectedGym || currentConfiguredGym;
  const item=url.pathname.match(/^\/api\/clients\/([0-9a-f-]{36})(?:\/|$)/i);
  if(item && !await accessibleClient(prisma,selectedGym,item[1])) { sendError(response,404,"Cliente desconocido en este centro."); return true; }
  if (request.method === "GET" && url.pathname === "/api/clients/duplicates") {
    const email = url.searchParams.get("email")?.trim().toLowerCase().slice(0, 254) ?? "";
    const phone = url.searchParams.get("phone")?.trim().slice(0, 40) ?? "";
    const digits = phoneDigits(phone);
    if (!email && digits.length < 4) {
      sendError(response, 400, "Introduce un correo o un teléfono para comprobar si ya hay una ficha.");
      return true;
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
      FROM "Client" c
      WHERE ${clientScopeSQL(selectedGym)} AND ((${phoneCondition}) OR (${emailCondition}))
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
    return true;
  }
  const clientProgressMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/progress$/i);
  if (request.method === "GET" && clientProgressMatch) {
    const client = await prisma.client.findUnique({
      where: { id: clientProgressMatch[1] },
      select: {
        id: true,
        firstName: true,
        brand: true,
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
    if (!client) {
      sendError(response, 404, "No se encontró el cliente.");
      return true;
    }
    if ((request as any).identity?.role === "TRAINER") {
      const empId = (request as any).identity.employeeId;
      const trainerBookings = calendarPool ? (await calendarPool.query("SELECT 1 FROM calendar.bookings WHERE $1::text IS NOT NULL AND data->>'employeeId'=$2 AND data->>'clientId'=$3 LIMIT 1", [(request as any).selectedGym || currentConfiguredGym, empId, client.id])).rows.length > 0 : false;
      if (!trainerBookings && (client as any).assignedWorkerId !== empId) {
        sendError(response, 403, "No tienes acceso a esta ficha de cliente.");
        return true;
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
    return true;
  }
  const clientDetailsMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/details$/i);
  if (request.method === "PATCH" && clientDetailsMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      sendError(response, 400, "Los datos de la ficha no tienen un formato válido.");
      return true;
    }
    const editableFields = [
      "dni", "address", "birthDate", "sex", "source", "sourceDetail", "preferredName", "contactPreference", "contactSlot",
      "injuries", "injuryNotes", "availability", "sessionsPerWeek", "firstSessionPreference", "consentData", "consentMarketing", "consentPhotos",
    ] as const;
    const submitted = Object.fromEntries(editableFields
      .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
      .map((field) => [field, body[field]]));
    if (!Object.keys(submitted).length) {
      sendError(response, 400, "No hay cambios para guardar.");
      return true;
    }
    const input = parseClientInput({
      firstName: "Ficha",
      lastName: "Cliente",
      email: "ficha@example.com",
      phone: "000",
      gymId: "00000000-0000-4000-8000-000000000000",
      ...submitted,
    });
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
    const data: Prisma.ClientUpdateInput = {};
    if (Object.prototype.hasOwnProperty.call(body, "dni"))
      data.dni = input.dni ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "address"))
      data.address = input.address ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "birthDate")) {
      data.birthDate = input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "sex"))
      data.sex = input.sex ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "source"))
      data.source = input.source ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "sourceDetail"))
      data.sourceDetail = input.sourceDetail ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "preferredName"))
      data.preferredName = input.preferredName ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "contactPreference"))
      data.contactPreference = input.contactPreference ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "contactSlot"))
      data.contactSlot = input.contactSlot ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "injuries"))
      data.injuries = input.injuries ?? Prisma.DbNull;
    if (Object.prototype.hasOwnProperty.call(body, "injuryNotes"))
      data.injuryNotes = input.injuryNotes ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "availability"))
      data.availability = input.availability ?? Prisma.DbNull;
    if (Object.prototype.hasOwnProperty.call(body, "sessionsPerWeek"))
      data.sessionsPerWeek = input.sessionsPerWeek ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "firstSessionPreference"))
      data.firstSessionPreference = input.firstSessionPreference ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "consentData"))
      data.consentData = input.consentData ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "consentMarketing"))
      data.consentMarketing = input.consentMarketing ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "consentPhotos"))
      data.consentPhotos = input.consentPhotos ?? null;
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
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = error.meta?.target;
        const dniConflict = Array.isArray(target)
          ? target.includes("dni")
          : typeof target === "string" && target.toLowerCase().includes("dni");
        if (dniConflict) {
          sendError(response, 409, "Ese DNI ya está asociado a otra ficha.");
          return true;
        }
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente.");
        return true;
      }
      throw error;
    }
    return true;
  }
  const clientObjectiveMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/objective$/i);
  if (request.method === "PATCH" && clientObjectiveMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const body = await readJsonBody(request);
    const objective = isRecord(body) && typeof body.objective === "string" ? body.objective.trim() : "";
    if (objective.length > 1000) {
      sendError(response, 400, "El objetivo supera la longitud permitida.");
      return true;
    }
    try {
      const client = await prisma.client.update({
        where: { id: clientObjectiveMatch[1] },
        data: { objective: objective || null },
        select: { id: true, objective: true },
      });
      sendJson(response, 200, { client });
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente.");
        return true;
      }
      throw error;
    }
    return true;
  }
  const clientMeasurementMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/measurements$/i);
  if (request.method === "POST" && clientMeasurementMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const input = parseMeasurementInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
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
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente.");
        return true;
      }
      throw error;
    }
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/clients") {
    const search = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const status = url.searchParams.get("status") ?? "";
    const gymId = url.searchParams.get("gymId") ?? "";
    if (status && !validStatuses.includes(status as ClientStatus)) {
      sendError(response, 400, "El filtro de estado no es válido.");
      return true;
    }
    if (gymId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gymId)) {
      sendError(response, 400, "El filtro de gimnasio no es válido.");
      return true;
    }
    const where: Prisma.ClientWhereInput = {
      ...(status ? { status: status as ClientStatus } : {}),
      AND: [await clientScope(prisma,gymId || selectedGym)],
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
      const trainerBookings = calendarPool ? (await calendarPool.query("SELECT data->>'clientId' as cid FROM calendar.bookings WHERE $1::text IS NOT NULL AND data->>'employeeId'=$2", [(request as any).selectedGym || currentConfiguredGym, empId])).rows.map((r: any) => r.cid) : [];
      const trainerConditions: Prisma.ClientWhereInput[] = [];
      if (empId)
        trainerConditions.push({ assignedWorkerId: empId });
      if (trainerBookings.length)
        trainerConditions.push({ id: { in: trainerBookings } });
      if (trainerConditions.length) {
        where.AND = [{ OR: trainerConditions }];
      }
      else {
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
          brand: true,
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
        const sessionsBought = client.servicePackages.reduce((totalSessions, servicePackage) => totalSessions + servicePackage.sessionsBought, 0);
        const sessionsCommitted = client.servicePackages.reduce((committed, servicePackage) => committed +
          servicePackage.bookings.filter((booking) => booking.attendance === AttendanceStatus.ASISTIO ||
            booking.attendance === AttendanceStatus.PENDIENTE).length, 0);
        const pendingPayments = client.servicePackages.filter((servicePackage) => servicePackage.paymentStatus === PaymentStatus.PENDIENTE ||
          servicePackage.paymentStatus === PaymentStatus.FALLIDO).length;
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
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/clients") {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const input = parseClientInput(await readJsonBody(request));
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
    if (!input.consentData) {
      sendError(response, 400, "Confirma el uso de datos personales para crear la ficha.");
      return true;
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
          brand: input.brand,
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
          brand: true,
          createdAt: true,
        },
      });
      sendJson(response, 201, { client });
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = error.meta?.target;
        const dniConflict = Array.isArray(target)
          ? target.includes("dni")
          : typeof target === "string" && target.toLowerCase().includes("dni");
        if (dniConflict) {
          sendError(response, 409, "Ese DNI ya está asociado a otra ficha.");
          return true;
        }
        sendError(response, 409, "Ya existe un cliente con ese correo.");
        return true;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 400, "El gimnasio seleccionado no existe o ya no está disponible.");
        return true;
      }
      throw error;
    }
    return true;
  }
  const statusMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/status$/i);
  if (request.method === "PATCH" && statusMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const body = await readJsonBody(request);
    const status = isRecord(body) && typeof body.status === "string" ? body.status : undefined;
    if (!status || !validStatuses.includes(status as ClientStatus)) {
      sendError(response, 400, "Selecciona un estado válido.");
      return true;
    }
    try {
      const client = await prisma.client.update({
        where: { id: statusMatch[1] },
        data: { status: status as ClientStatus },
        select: { id: true, status: true },
      });
      sendJson(response, 200, { client });
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente.");
        return true;
      }
      throw error;
    }
    return true;
  }
  const gymMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/gym$/i);
  if (request.method === "PATCH" && gymMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const body = await readJsonBody(request);
    const gymId = isRecord(body) && typeof body.gymId === "string" ? body.gymId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gymId)) {
      sendError(response, 400, "Selecciona un gimnasio válido.");
      return true;
    }
    try {
      const client = await prisma.client.update({
        where: { id: gymMatch[1] },
        data: { gym: { connect: { id: gymId } } },
        select: { id: true, gym: { select: { id: true, name: true, city: true, province: true } } },
      });
      sendJson(response, 200, { client });
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente o el gimnasio.");
        return true;
      }
      throw error;
    }
    return true;
  }
  return false;
}
