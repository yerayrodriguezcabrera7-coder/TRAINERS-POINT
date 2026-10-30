import { z } from "zod";
import { DateTime } from "luxon";
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
});
const period = z.object({ open: time, close: time }).refine(p => p.open < p.close);
export const employeeSchema = named.extend({
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
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
  price: z.number().min(0).max(100000).optional(),
  description: z.string().max(2000).optional(),
  active: z.boolean().optional(),
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
export const configSchema = z
  .object({
    timezone: z.string().refine((v) => DateTime.now().setZone(v).isValid),
    employees: z.array(employeeSchema).min(1),
    services: z.array(serviceSchema).min(1),
    rooms: z.array(named).min(1),
    clients: z.array(clientSchema),
    schedule: week,
    leaveRequests: z.array(leaveRequestSchema).max(10000).default([]),
  })
  .superRefine((c, ctx) => {
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
  employeeId: id,
  serviceId: id,
  roomId: id,
  date,
  start: time,
  end: time.optional(),
  status: z.enum(statuses),
  notes: z.string().max(2000).default(""),
  sessionId: id.nullable().optional(),
  version: z.number().int().positive().optional(),
});
export type Input = z.infer<typeof bookingSchema>;
export type Booking = Input & { id: string; end: string; version: number };
export const attendanceActionSchema = z.object({
  employeeId: id,
  action: z.enum(["IN", "OUT"]),
});
export type AttendanceAction = z.infer<typeof attendanceActionSchema>;
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
    !c.employees.some((x) => x.id === input.employeeId) ||
    !c.rooms.some((x) => x.id === input.roomId) ||
    !c.clients.some((x) => x.id === input.clientId)
  )
    throw new ApiError(
      400,
      "Cliente, entrenador, sala o servicio desconocido.",
    );
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
  const worker = c.employees.find((x) => x.id === b.employeeId)!;
  if (c.leaveRequests.some((leave) => leave.employeeId === b.employeeId && leave.status === "APPROVED" && b.date >= leave.startDate && b.date <= leave.endDate))
    throw new ApiError(409, "El empleado tiene una ausencia aprobada en esa fecha.");
  for (const h of [c.schedule[day]])
    if (h.closed || b.start < h.open || b.end > h.close)
      throw new ApiError(
        409,
        "Fuera del horario de apertura o del entrenador.",
      );
  const override = worker.shifts?.find(s => s.date === b.date);
  const periods = override ? override.periods : worker.weeklyPeriods ? worker.weeklyPeriods[day] : worker.schedule[day].closed ? [] : [worker.schedule[day]];
  if (!periods.some(p => b.start >= p.open && b.end <= p.close))
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
    (o) => o.employeeId === b.employeeId || o.roomId === b.roomId,
  );
  if (resources.some((o) => !same(o)))
    throw new ApiError(409, "Entrenador o sala ya ocupados.");
  if (resources.length >= capacity) throw new ApiError(409, "Aforo completo.");
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
        "notes",
        "sessionId",
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
