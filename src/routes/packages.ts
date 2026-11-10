import { AttendanceStatus, BookingStatus, PaymentStatus, Prisma, SaleStatus } from "@prisma/client";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { type Identity } from "../calendar/access";
import { ApiError } from "../calendar/model";
import { Store } from "../calendar/store";
import { inventoryPermission, saleBalance } from "../finance/inventory";
import { Packages } from "../finance/packages";
import type { ApiContext } from '../http/api-context';
import { readJsonBody, sendError, sendJson } from "../http/json";
import { prisma } from "../lib/prisma";
import { isRecord, parseServicePackageInput } from "../validation/records";
const validAttendanceStatuses: AttendanceStatus[] = ["PENDIENTE", "ASISTIO", "NO_ASISTIO", "CANCELADA"];
export async function packagesRoutes(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiContext): Promise<boolean> {
  const { port, currentConfiguredGym, calendarPool, hasTrustedOrigin } = context;
  const clientHistoryMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/service-history$/i);
  if (request.method === "GET" && clientHistoryMatch) {
    const clientId = clientHistoryMatch[1];
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, firstName: true, lastName: true, assignedWorkerId: true, gymId: true },
    });
    if (!client) {
      sendError(response, 404, "No se encontró el cliente.");
      return true;
    }
    if ((request as any).identity?.role === "TRAINER") {
      const empId = (request as any).identity.employeeId;
      const trainerBookings = calendarPool ? (await calendarPool.query("SELECT 1 FROM calendar.bookings WHERE gym_id=$1 AND data->>'employeeId'=$2 AND data->>'clientId'=$3 LIMIT 1", [(request as any).selectedGym || currentConfiguredGym, empId, client.id])).rows.length > 0 : false;
      if (!trainerBookings && (client as any).assignedWorkerId !== empId) {
        sendError(response, 403, "No tienes acceso a esta ficha de cliente.");
        return true;
      }
    }
    if (client.gymId !== (request as any).selectedGym) {
      sendError(response, 404, "Cliente desconocido en este centro.");
      return true;
    }
    const packages = await prisma.clientServicePackage.findMany({
      where: { clientId },
      include: { service: { select: { id: true, name: true, durationMin: true, validityWeeks: true } }, sale: { include: { lines: true, payments: true } } },
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
        where: { clientId, gymKey: (request as any).selectedGym },
        select: {
          id: true,
          paymentTracking: true,
          status: true,
          currency: true,
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          soldAt: true,
          createdAt: true,
          lines: { select: { description: true, quantity: true, returnedQuantity: true, unitPrice: true, lineTotal: true, type: true } },
          payments: { select: { method: true, kind: true, note: true, status: true, amount: true, paidAt: true } },
        },
        orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.sale.findMany({
        where: { clientId, gymKey: (request as any).selectedGym, status: SaleStatus.COMPLETADA },
        select: {
          status: true, paymentTracking: true, lines: true,
          currency: true,
          totalAmount: true,
          payments: {
            where: { status: PaymentStatus.PAGADO },
            select: { amount: true, status: true, kind: true },
          },
        },
      }),
    ]);
    const debtByCurrency = new Map<string, number>();
    for (const servicePackage of packages) {
      if (!servicePackage.saleId && (servicePackage.paymentStatus === PaymentStatus.PENDIENTE ||
        servicePackage.paymentStatus === PaymentStatus.FALLIDO)) {
        debtByCurrency.set("EUR", (debtByCurrency.get("EUR") ?? 0) + Number(servicePackage.totalAmount));
      }
    }
    for (const sale of debtSales) {
      const outstanding = saleBalance(sale).outstandingAmount;
      if (outstanding > 0) {
        debtByCurrency.set(sale.currency, (debtByCurrency.get(sale.currency) ?? 0) + outstanding);
      }
    }
    const debt = [...debtByCurrency]
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
      .filter(({ amount }) => amount > 0);
    const heldPackages = calendarPool ? (await calendarPool.query(`SELECT original."packageId",count(*) AS held FROM calendar.recoveries r JOIN "Booking" original ON original.id::text=r.original_id WHERE r.gym_id=$1 AND original."clientId"=$2::uuid AND r.data->>'status' IN ('PENDING','RESCHEDULE_PENDING') GROUP BY original."packageId"`, [(request as any).selectedGym, clientId])).rows : [];
    const now = Date.now();
    const mappedPackages = packages.map((servicePackage) => {
      const sessionsUsed = bookingCounts.find((count) => count.packageId === servicePackage.id && count.attendance === AttendanceStatus.ASISTIO)?._count._all ?? 0;
      const sessionsScheduled = bookingCounts.find((count) => count.packageId === servicePackage.id && count.attendance === AttendanceStatus.PENDIENTE)?._count._all ?? 0;
      const held = Number(heldPackages.find((p: any) => p.packageId === servicePackage.id)?.held || 0);
      const sessionsRemaining = Math.max(0, servicePackage.sessionsBought - sessionsUsed - sessionsScheduled - held);
      const validityWeeks = Number(servicePackage.service?.validityWeeks) || 4;
      const purchasedTime = new Date(servicePackage.purchasedAt).getTime();
      const expiresAt = new Date(purchasedTime + validityWeeks * 7 * 86400000);
      const daysRemaining = Math.ceil((expiresAt.getTime() - now) / 86400000);
      const isLastSession = sessionsRemaining === 1;
      const isExpiringSoon = sessionsRemaining > 0 && daysRemaining <= 7 && daysRemaining >= 0;
      const isExpired = sessionsRemaining > 0 && daysRemaining < 0;
      const isDepleted = sessionsRemaining === 0;
      const needsRenewal = isLastSession || isExpiringSoon || isExpired || isDepleted;
      let renewalMessage = "";
      if (isLastSession) {
        renewalMessage = daysRemaining <= 7 && daysRemaining >= 0 ? `Última sesión (caduca en ${daysRemaining}d)` : "Última sesión disponible";
      } else if (isExpiringSoon) {
        renewalMessage = `Caduca en ${daysRemaining} día${daysRemaining === 1 ? "" : "s"} (${sessionsRemaining} ses.)`;
      } else if (isExpired) {
        renewalMessage = `Bono caducado (${sessionsRemaining} ses.)`;
      } else if (isDepleted) {
        renewalMessage = "Bono agotado";
      }
      return {
        ...servicePackage,
        sale: servicePackage.sale ? saleBalance(servicePackage.sale) : null,
        sessionsUsed,
        sessionsScheduled,
        sessionsRemaining,
        validityWeeks,
        expiresAt: expiresAt.toISOString(),
        daysRemaining,
        isLastSession,
        isExpiringSoon,
        isExpired,
        isDepleted,
        needsRenewal,
        renewalMessage,
      };
    });

    const hasHealthyPackage = mappedPackages.some((p) => p.sessionsRemaining > 1 && p.daysRemaining > 7);
    let renewalAlert: any = null;
    if (!hasHealthyPackage) {
      const activeAlertPkg = mappedPackages.find((p) => p.sessionsRemaining > 0 && (p.sessionsRemaining === 1 || p.daysRemaining <= 7))
        || mappedPackages.find((p) => p.sessionsRemaining > 0)
        || mappedPackages[0];
      if (activeAlertPkg && activeAlertPkg.needsRenewal) {
        renewalAlert = {
          packageId: activeAlertPkg.id,
          serviceName: activeAlertPkg.service?.name || "Bono",
          sessionsRemaining: activeAlertPkg.sessionsRemaining,
          daysRemaining: activeAlertPkg.daysRemaining,
          expiresAt: activeAlertPkg.expiresAt,
          type: activeAlertPkg.isLastSession ? 'LAST_SESSION' : (activeAlertPkg.isExpiringSoon ? 'EXPIRING_SOON' : (activeAlertPkg.isExpired ? 'EXPIRED' : 'DEPLETED')),
          message: activeAlertPkg.renewalMessage,
          needsRenewal: true,
        };
      }
    }

    sendJson(response, 200, {
      client,
      packages: mappedPackages,
      bookings,
      sales: sales.map(saleBalance),
      debt,
      renewalAlert,
    });
    return true;
  }
  const clientPackagesMatch = url.pathname.match(/^\/api\/clients\/([0-9a-f-]+)\/service-packages$/i);
  if (request.method === "POST" && clientPackagesMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const rawPackage = await readJsonBody(request);
    const input = parseServicePackageInput(rawPackage);
    if (typeof input === "string") {
      sendError(response, 400, input);
      return true;
    }
    try {
      const requestKey = isRecord(rawPackage) && rawPackage.requestKey !== undefined ? z.string().uuid().parse(rawPackage.requestKey) : undefined;
      const servicePackage = await new Packages(prisma).create((request as any).selectedGym, clientPackagesMatch[1], (request as any).identity.id, { ...input, requestKey });
      sendJson(response, 201, { servicePackage });
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró el cliente o el servicio.");
        return true;
      }
      throw error;
    }
    return true;
  }
  const bookingBillingMatch = url.pathname.match(/^\/api\/bookings\/([0-9a-f-]+)\/billing$/i);
  if (bookingBillingMatch && request.method === 'POST') {
    const actor = (request as any).identity as Identity, gym = (request as any).selectedGym as string;
    inventoryPermission(actor, 'sell');
    const booking = await prisma.booking.findFirst({ where: { id: bookingBillingMatch[1], calendarGymId: gym }, include: { package: true } });
    if (!booking) throw new ApiError(404, 'Reserva desconocida en este centro.');
    let saleId = booking.saleId;
    if (booking.packageId) {
      if (booking.package?.paymentStatus === 'PAGADO') { sendJson(response, 200, { outstandingAmount: 0 }); return true; }
      const pkg = await new Packages(prisma).billing(gym, booking.packageId, actor.id);
      saleId = pkg.saleId;
    }
    if (!saleId && booking.paymentPending && booking.status === 'COMPLETADA' && calendarPool) {
      const store = new Store(calendarPool, prisma), state = await store.state(gym);
      const previous = state.bookings.find((b: any) => b.id === booking.id);
      if (previous) {
        await store.save(gym, previous, previous.id, undefined, actor.id);
        saleId = (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).saleId;
      }
    }
    if (!saleId && booking.paymentPending) throw new ApiError(409, 'Revisa la sesión y su importe antes de registrar el cobro.');
    if (!saleId) { sendJson(response, 200, { outstandingAmount: 0 }); return true; }
    const sale = await prisma.sale.findFirstOrThrow({ where: { id: saleId, gymKey: gym }, include: { lines: true, payments: true } });
    sendJson(response, 200, { ...saleBalance(sale), scope: booking.packageId ? 'PACKAGE' : 'SESSION' });
    return true;
  }
  const packageBillingMatch = url.pathname.match(/^\/api\/service-packages\/([0-9a-f-]+)\/billing$/i);
  if (packageBillingMatch && request.method === 'POST') {
    const actor = (request as any).identity as Identity;
    inventoryPermission(actor, 'sell');
    const pkg = await new Packages(prisma).billing((request as any).selectedGym, packageBillingMatch[1], actor.id);
    sendJson(response, 200, { servicePackage: pkg, saleId: pkg.saleId });
    return true;
  }
  const packageBookingsMatch = url.pathname.match(/^\/api\/service-packages\/([0-9a-f-]+)\/bookings$/i);
  if (request.method === "POST" && packageBookingsMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const body = await readJsonBody(request);
    const startTime = isRecord(body) && typeof body.startTime === "string" ? new Date(body.startTime) : new Date(Number.NaN);
    if (Number.isNaN(startTime.getTime()) || startTime.getTime() <= Date.now()) {
      sendError(response, 400, "Selecciona una fecha y hora futura válida.");
      return true;
    }
    const servicePackage = await prisma.clientServicePackage.findUnique({
      where: { id: packageBookingsMatch[1] },
      include: { service: true },
    });
    if (!servicePackage) {
      sendError(response, 404, "No se encontró el bono.");
      return true;
    }
    if (servicePackage.paymentStatus !== PaymentStatus.PAGADO) {
      sendError(response, 409, "El bono debe estar pagado antes de reservar sesiones.");
      return true;
    }
    const booking = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ClientServicePackage" WHERE id=${servicePackage.id}::uuid FOR UPDATE`;
      const sessionsCommitted = await tx.booking.count({
        where: {
          packageId: servicePackage.id,
          attendance: { in: [AttendanceStatus.ASISTIO, AttendanceStatus.PENDIENTE] },
        },
      });
      if (sessionsCommitted >= servicePackage.sessionsBought) {
        throw new ApiError(409, "El bono ya no tiene sesiones disponibles.");
      }
      const endTime = new Date(startTime.getTime() + servicePackage.service.durationMin * 60000);
      return tx.booking.create({
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
    });
    sendJson(response, 201, { booking });
    return true;
  }
  const attendanceMatch = url.pathname.match(/^\/api\/bookings\/([0-9a-f-]+)\/attendance$/i);
  if (request.method === "PATCH" && attendanceMatch) {
    if (!hasTrustedOrigin(request, port)) {
      sendError(response, 403, "Origen de la solicitud no permitido.");
      return true;
    }
    const body = await readJsonBody(request);
    const attendance = isRecord(body) && typeof body.attendance === "string" ? body.attendance : undefined;
    if (!attendance || !validAttendanceStatuses.includes(attendance as AttendanceStatus)) {
      sendError(response, 400, "Selecciona un estado de asistencia válido.");
      return true;
    }
    try {
      if (attendance === AttendanceStatus.ASISTIO || attendance === AttendanceStatus.NO_ASISTIO) {
        const scheduledBooking = await prisma.booking.findUnique({
          where: { id: attendanceMatch[1] },
          select: { startTime: true },
        });
        if (!scheduledBooking) {
          sendError(response, 404, "No se encontró la sesión.");
          return true;
        }
        if (scheduledBooking.startTime.getTime() > Date.now()) {
          sendError(response, 409, "No puedes registrar la asistencia antes de la hora programada.");
          return true;
        }
      }
      const mirror = await prisma.booking.findUnique({ where: { id: attendanceMatch[1] }, select: { calendarGymId: true } });
      if (mirror?.calendarGymId && calendarPool) {
        if (mirror.calendarGymId !== (request as any).selectedGym)
          throw new ApiError(404, 'Reserva desconocida en este centro.');
        const store = new Store(calendarPool, prisma), state = await store.state(mirror.calendarGymId), previous = state.bookings.find((b: any) => b.id === attendanceMatch[1]);
        if (!previous)
          throw new ApiError(404, 'Reserva desconocida.');
        const nextStatus = attendance === 'ASISTIO' ? 'COMPLETED' : attendance === 'NO_ASISTIO' ? 'NO_SHOW' : attendance === 'CANCELADA' ? 'CANCELLED' : 'CONFIRMED';
        await store.save(mirror.calendarGymId, { ...previous, status: nextStatus }, previous.id, undefined, (request as any).identity.id);
        sendJson(response, 200, { booking: await prisma.booking.findUnique({ where: { id: previous.id } }) });
        return true;
      }
      const booking = await prisma.booking.update({
        where: { id: attendanceMatch[1] },
        data: {
          attendance: attendance as AttendanceStatus,
          attendedAt: attendance === AttendanceStatus.ASISTIO ? new Date() : null,
          status: attendance === AttendanceStatus.CANCELADA
            ? BookingStatus.CANCELADA
            : attendance === AttendanceStatus.ASISTIO || attendance === AttendanceStatus.NO_ASISTIO
              ? BookingStatus.COMPLETADA
              : BookingStatus.CONFIRMADA,
        },
        select: { id: true, attendance: true, attendedAt: true, status: true, packageId: true },
      });
      sendJson(response, 200, { booking });
    }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(response, 404, "No se encontró la sesión.");
        return true;
      }
      throw error;
    }
    return true;
  }
  return false;
}
