import { DateTime } from "luxon";
import { z } from "zod";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const statuses = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const;
const id = z.string().min(1).max(100);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid);
const hours = z
  .object({ open: time, close: time, closed: z.boolean() })
  .refine((h) => h.open < h.close);
export const week = z.array(hours).length(7);
const named = z.object({ id, name: z.string().trim().min(1).max(200) });
export const clientSchema = named.extend({
  email: z.union([z.literal(""), z.email()]).default(""),
  phone: z.string().max(40),
  notes: z.string().max(2000),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).optional(),
  birthDate: date.or(z.literal("")).optional(),
  assignedWorkerId: z.string().optional().nullable(),
});
const period = z.object({ open: time, close: time }).refine(p => p.open < p.close);
export const employeeSchema = named.extend({
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#7b858d").transform(()=>"#7b858d"),
  schedule: week,
  email: z.union([z.literal(""), z.email()]).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  active: z.boolean().optional(),
  weeklyPeriods: z.array(z.array(period).max(8)).length(7).optional(),
  shifts: z.array(z.object({ date, periods: z.array(period).max(8) })).max(366).optional(),
}).superRefine((e, ctx) => {
  const shifts = e.shifts || [];
  if (new Set(shifts.map(s => s.date)).size !== shifts.length)
    ctx.addIssue({ code: "custom", message: "Hay fechas de turno duplicadas." });
  for (const periods of [...shifts.map(s => s.periods), ...(e.weeklyPeriods || [])]) {
    const sorted = [...periods].sort((a,b) => a.open.localeCompare(b.open));
    if (sorted.some((p,i) => i > 0 && p.open < sorted[i-1].close))
      ctx.addIssue({ code: "custom", message: "Los turnos del mismo día se solapan." });
  }
});
export const serviceSchema = named.extend({
  duration: z.number().int().min(5).max(720),
  capacity: z.number().int().min(1).max(100),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  schedule: week.optional(),
  employeeIds: z.array(id).optional(),
  price: z.number().min(0).max(100000).optional(),
  description: z.string().max(2000).optional(),
  active: z.boolean().optional(),
  modality: z.enum(["INDIVIDUAL", "DUAL"]).optional(),
  type: z.enum(["PACK", "SESION_INDIVIDUAL"]).optional(),
  trainingCount: z.number().int().min(1).max(500).optional(),
  validityWeeks: z.number().int().min(1).max(5200).nullable().optional(),
  recommendedWeeklyFrequency: z.number().int().min(1).max(14).nullable().optional(),
  conditions: z.string().max(5000).nullable().optional(),
});
export const leaveTypes = ["VACATION", "SICK_LEAVE", "PERMISSION", "OTHER"] as const;
export const leaveStatuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
const leaveRequestFields = z.object({
  id,
  employeeId: id,
  type: z.enum(leaveTypes),
  startDate: date,
  endDate: date,
  // Deliberately limited to administrative information. Medical details do not belong here.
  note: z.string().trim().max(500).default(""),
  status: z.enum(leaveStatuses),
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable().optional(),
  reviewerId: id.nullable().optional(),
});
export const leaveRequestSchema = leaveRequestFields.refine((leave) => leave.startDate <= leave.endDate, {
  message: "La fecha final debe ser igual o posterior a la inicial.",
  path: ["endDate"],
});
export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(10).max(10000).default(200),
  address: z.string().optional(),
}).optional();

export const configSchema = z
  .object({
    timezone: z.string().refine((v) => DateTime.now().setZone(v).isValid),
    employees: z.array(employeeSchema).min(1),
    services: z.array(serviceSchema).min(1),
    rooms: z.array(named).min(1),
    clients: z.array(clientSchema),
    schedule: week,
    leaveRequests: z.array(leaveRequestSchema).max(10000).default([]),
    location: locationSchema,
    maxBookingsPerHour: z.number().int().positive().nullable().optional(),
    centers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      maxBookingsPerHour: z.number().int().positive().nullable().optional(),
      address: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      province: z.string().optional().nullable(),
    })).optional(),
  })
  .superRefine((c, ctx) => {
    if(c.services.some(s=>s.employeeIds?.some(id=>!c.employees.some(e=>e.id===id)))) ctx.addIssue({code:"custom",message:"El servicio contiene entrenadores desconocidos."});
    for (const key of ["employees", "services", "rooms", "clients"] as const)
      if (new Set(c[key].map((x) => x.id)).size !== c[key].length)
        ctx.addIssue({ code: "custom", message: `IDs duplicados: ${key}` });
  });
export type Config = z.infer<typeof configSchema>;
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;
export const leaveRequestInputSchema = leaveRequestFields.pick({
  type: true,
  startDate: true,
  endDate: true,
  note: true,
}).refine((leave) => leave.startDate <= leave.endDate, {
  message: "La fecha final debe ser igual o posterior a la inicial.",
  path: ["endDate"],
});
export const bookingSchema = z.object({
  id: id.optional(),
  clientId: id,
  employeeId: id.nullable().default(null),
  centerId: id.optional(),
  needsReschedule: z.boolean().default(false),
  serviceId: id,
  packageId: z.string().uuid().nullable().optional(),
  paymentDue: z.boolean().optional(),
  roomId: id,
  date,
  start: time,
  end: time.optional(),
  status: z.enum(statuses),
  notes: z.string().max(2000).default(""),
  recoveryId: id.nullable().optional(),
  chargeAmount: z.number().nonnegative().optional(),
  sessionId: id.nullable().optional(),
  version: z.number().int().positive().optional(),
});
export type Input = z.infer<typeof bookingSchema>;
export type Booking = Input & { id: string; end: string; version: number; centerName?:string; centerAddress?:string; history?: Array<{at:string;actorId:string;action:string;previous:Record<string,unknown>}>; incidents?:Array<{at:string;actorId:string;message:string}> };
export const attendanceGeoInputSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).optional().nullable(),
}).optional().nullable();

export const attendanceActionSchema = z.object({
  employeeId: id,
  action: z.enum(["IN", "OUT"]),
  geo: attendanceGeoInputSchema,
});
export type AttendanceAction = z.infer<typeof attendanceActionSchema>;

export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}
export const minutes = (s: string) =>
  Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export const label = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const overlaps = (a: Booking, b: Booking) =>
  a.date === b.date && a.start < b.end && b.start < a.end;
export function normalize(input: Input, c: Config): Booking {
  const service = c.services.find((x) => x.id === input.serviceId);
  if (
    !service ||
    (input.employeeId !== null && !c.employees.some((x) => x.id === input.employeeId)) ||
    !c.rooms.some((x) => x.id === input.roomId) ||
    !c.clients.some((x) => x.id === input.clientId)
  )
    throw new ApiError(
      400,
      "Cliente, entrenador, sala o servicio desconocido.",
    );
  if(!input.employeeId && !["PENDING","CANCELLED"].includes(input.status)) throw new ApiError(409,"Asigna un trabajador antes de confirmar o cerrar la reserva.");
  if(input.needsReschedule && input.status !== "CANCELLED") throw new ApiError(400,"La reserva pendiente de reprogramación debe liberar el horario anterior.");
  const endMinute = minutes(input.start) + service.duration;
  if (endMinute >= 1440)
    throw new ApiError(400, "La cita debe terminar el mismo día.");
  const end = label(endMinute);
  if (input.end && input.end !== end)
    throw new ApiError(400, "La duración debe coincidir con el servicio.");
  for (const t of [input.start, end]) {
    const dt = DateTime.fromISO(`${input.date}T${t}`, { zone: c.timezone });
    if (
      !dt.isValid ||
      dt.toFormat("HH:mm") !== t ||
      dt.getPossibleOffsets().length !== 1
    )
      throw new ApiError(400, "Hora inexistente o ambigua por cambio horario.");
  }
  return { ...input, id: input.id || "", end, version: input.version || 1 };
}
export function assertAvailable(b: Booking, all: Booking[], c: Config) {
  if (b.status === "CANCELLED") return;
  const day = DateTime.fromISO(b.date).weekday - 1;
  const service = c.services.find(s => s.id === b.serviceId)!;
  if (b.employeeId && service.employeeIds?.length && !service.employeeIds.includes(b.employeeId)) throw new ApiError(409, "El entrenador no realiza este servicio.");
  const serviceHours = service.schedule?.[day];
  if (serviceHours && (serviceHours.closed || b.start < serviceHours.open || b.end > serviceHours.close)) throw new ApiError(409, "Fuera del horario del servicio.");
  const worker = c.employees.find((x) => x.id === b.employeeId)!;
  if (c.leaveRequests.some((leave) => leave.employeeId === b.employeeId && leave.status === "APPROVED" && b.date >= leave.startDate && b.date <= leave.endDate))
    throw new ApiError(409, "El empleado tiene una ausencia aprobada en esa fecha.");
  for (const h of [c.schedule[day]])
    if (h.closed || b.start < h.open || b.end > h.close)
      throw new ApiError(
        409,
        "Fuera del horario de apertura o del entrenador.",
      );
  const override = worker?.shifts?.find(s => s.date === b.date);
  const periods = override ? override.periods : worker?.weeklyPeriods ? worker.weeklyPeriods[day] : !worker ? [] : worker.schedule[day].closed ? [] : [worker.schedule[day]];
  if (worker && !periods.some(p => b.start >= p.open && b.end <= p.close))
    throw new ApiError(409, "Fuera del horario del entrenador.");
  const clashes = all.filter(
    (o) => o.id !== b.id && o.status !== "CANCELLED" && overlaps(b, o),
  );
  if (clashes.some((o) => o.clientId === b.clientId))
    throw new ApiError(409, "El cliente ya tiene una reserva en ese horario.");
  const capacity = c.services.find((s) => s.id === b.serviceId)!.capacity;
  const same = (o: Booking) =>
    capacity > 1 &&
    b.sessionId &&
    o.sessionId === b.sessionId &&
    o.employeeId === b.employeeId &&
    o.centerId === b.centerId &&
    o.roomId === b.roomId &&
    o.serviceId === b.serviceId &&
    o.date === b.date &&
    o.start === b.start &&
    o.end === b.end;
  if (
    b.sessionId &&
    all.some(
      (o) =>
        o.id !== b.id &&
        o.status !== "CANCELLED" &&
        o.sessionId === b.sessionId &&
        !same(o),
    )
  )
    throw new ApiError(
      409,
      "La sesión grupal no coincide con el horario o los recursos.",
    );
  const resources = clashes.filter(
    (o) => (b.employeeId && o.employeeId === b.employeeId) || (o.roomId === b.roomId && o.centerId === b.centerId),
  );
  if (resources.some((o) => !same(o)))
    throw new ApiError(409, "Entrenador o sala ya ocupados.");
  if (resources.length >= capacity) throw new ApiError(409, "Aforo completo.");

  const targetCenterId = b.centerId || (c as any).gymId;
  const centerConfig = c.centers?.find((x) => x.id === targetCenterId || x.id === b.centerId);
  const hourlyLimit = centerConfig?.maxBookingsPerHour ?? (b.centerId === (c as any).gymId ? c.maxBookingsPerHour : null) ?? c.maxBookingsPerHour ?? null;

  if (hourlyLimit != null && hourlyLimit > 0) {
    const startMin = minutes(b.start);
    const endMin = minutes(b.end);
    const startHour = Math.floor(startMin / 60);
    const endHour = Math.floor((endMin - 1) / 60);

    const otherCenterBookings = all.filter(
      (o) =>
        o.id !== b.id &&
        o.status !== "CANCELLED" &&
        o.date === b.date &&
        (o.centerId || targetCenterId) === targetCenterId
    );

    for (let h = startHour; h <= endHour; h++) {
      const hStart = h * 60;
      const hEnd = (h + 1) * 60;
      const count = otherCenterBookings.filter(
        (o) => minutes(o.start) < hEnd && minutes(o.end) > hStart
      ).length;

      if (count + 1 > hourlyLimit) {
        throw new ApiError(
          409,
          `El centro ha alcanzado el límite máximo de ${hourlyLimit} reserva${hourlyLimit === 1 ? "" : "s"} por hora.`
        );
      }
    }
  }
}
export function assertTransition(old: Booking, next: Booking, c: Config) {
  const allowed: Record<string, string[]> = {
    PENDING: ["PENDING", "CONFIRMED", "CANCELLED"],
    CONFIRMED: ["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"],
    CANCELLED: ["CANCELLED", "PENDING", "CONFIRMED"],
    COMPLETED: ["COMPLETED"],
    NO_SHOW: ["NO_SHOW"],
  };
  if (!allowed[old.status].includes(next.status))
    throw new ApiError(409, "Cambio de estado no permitido.");
  if (
    ["COMPLETED", "NO_SHOW"].includes(old.status) &&
    (
      [
        "clientId",
        "employeeId",
        "serviceId",
        "roomId",
        "date",
        "start",
        "end",
        "centerId",
        "needsReschedule",
        "notes",
        "sessionId",
        "packageId",
      ] as const
    ).some((k) => old[k] !== next[k])
  )
    throw new ApiError(409, "Una cita cerrada no puede modificarse.");
  if (
    ["COMPLETED", "NO_SHOW"].includes(next.status) &&
    DateTime.fromISO(`${next.date}T${next.end}`, {
      zone: c.timezone,
    }).toMillis() > Date.now()
  )
    throw new ApiError(409, "La cita todavía no ha terminado.");
}

export const workerActionSchema=z.object({action:z.enum(["COMPLETE","INCIDENT"]),version:z.number().int().positive(),message:z.string().trim().max(1000).optional()});
