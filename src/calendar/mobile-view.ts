import type { Identity } from "./access";
import { ApiError, type Booking, type Config } from "./model";

type PendingPackage = {
  packageId: string;
  clientId: string;
  clientName: string;
  serviceId: string;
  serviceName: string;
  sessionsBought: number;
  sessionsUsed: number;
  sessionsScheduled: number;
  sessionsHeld: number;
  sessionsToSchedule: number;
  expiresAt: string;
  daysRemaining: number;
  paymentPending: boolean;
};

type RecoveryItem = Record<string, unknown> & { originCenterId?: string };

type MobileState = Pick<Config, "clients" | "employees" | "services" | "rooms" | "centers"> & {
  bookings: Booking[];
  pendingPackages?: PendingPackage[];
  recoveries?: RecoveryItem[];
};

export function staffClientIds(state: MobileState, actor: Identity): Set<string> {
  if (actor.role === "TRAINER") {
    if (!actor.employeeId) throw new ApiError(403, "La cuenta no tiene un trabajador asociado.");
    return new Set([
      ...state.bookings.filter(booking => booking.employeeId === actor.employeeId).map(booking => booking.clientId),
      ...state.clients.filter(client => client.assignedWorkerId === actor.employeeId).map(client => client.id),
    ]);
  }
  if (!["ADMIN", "RECEPTION"].includes(actor.role)) throw new ApiError(403, "Este apartado corresponde al equipo del centro.");
  return new Set(state.clients.map(client => client.id));
}

// Return an explicit projection: never send the whole management state to mobile.
export function mobileStaffView(state: MobileState, actor: Identity) {
  const clientIds = staffClientIds(state, actor);
  const bookings = actor.role === "TRAINER" ? state.bookings.filter(booking => booking.employeeId === actor.employeeId) : state.bookings;
  const centerIds = new Set(bookings.map(booking => booking.centerId));

  // Filter pendingPackages by the actor's visible clients (trainers see only their clients' packages)
  const filteredPendingPackages = state.pendingPackages?.filter(pkg =>
    actor.role === "TRAINER" ? clientIds.has(pkg.clientId) : true
  );

  // Filter recoveries by the actor's visible clients (trainers see only their clients' recoveries)
  const filteredRecoveries = state.recoveries?.filter(rec => {
    if (actor.role !== "TRAINER") return true;
    return clientIds.has(rec.clientId as string);
  });

  return {
    bookings: bookings.map(booking => ({
      id: booking.id, clientId: booking.clientId, employeeId: booking.employeeId,
      serviceId: booking.serviceId, roomId: booking.roomId, centerId: booking.centerId,
      date: booking.date, start: booking.start, end: booking.end, status: booking.status,
      version: booking.version, centerName: booking.centerName, centerAddress: booking.centerAddress,
      needsReschedule: booking.needsReschedule,
    })),
    clients: state.clients.filter(client => clientIds.has(client.id)).map(client => ({
      id: client.id, name: client.name, phone: client.phone, email: client.email, status: client.status,
    })),
    employees: state.employees.filter(employee => actor.role !== "TRAINER" || employee.id === actor.employeeId)
      .map(employee => ({ id: employee.id, name: employee.name })),
    services: state.services.map(service => ({ id: service.id, name: service.name, color: service.color })),
    rooms: state.rooms.map(room => ({ id: room.id, name: room.name })),
    centers: (state.centers || []).filter(center => actor.role !== "TRAINER" || centerIds.has(center.id))
      .map(center => ({ id: center.id, name: center.name })),
    pendingPackages: filteredPendingPackages,
    recoveries: filteredRecoveries,
  };
}
