export type Role = "ADMIN" | "RECEPTION" | "TRAINER" | "CLIENT";

export interface Identity {
  id: string;
  name: string;
  username?: string;
  role: Role;
  employeeId: string | null;
  clientId: string | null;
  mustChangePassword: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
  portal?: "TRAINER" | "OFFICE" | "CLIENT";
}

export interface LoginResponse {
  token: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface ClientProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: "LEAD" | "ACTIVO" | "INACTIVO" | "BAJA";
  objective?: string;
  injuries?: unknown;
  notes?: string;
  sessionsPerWeek?: number;
}

export interface Booking {
  id: string;
  clientId: string;
  clientName?: string;
  employeeId: string | null;
  employeeName?: string;
  serviceId: string;
  serviceName?: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string;
  roomId: string;
  version: number;
  centerName?: string;
  centerAddress?: string;
  centerId?: string;
  needsReschedule?: boolean;
  packageId?: string | null;
  recoveryId?: string | null;
  sessionId?: string | null;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  notes?: string;
  sessionLog?: { exercises: string; feeling: "GOOD" | "TIRED" | "EASY" | "ADEQUATE" | "LIMIT" | "PAIN" | null };
  nextSessionPlan?: string;
}

export interface CalendarData {
  bookings: Booking[];
  services: Array<{ id: string; name: string; color?: string }>;
  employees: Array<{ id: string; name: string; schedule?: Array<{open:string;close:string;closed:boolean}>; weeklyPeriods?: Array<Array<{open:string;close:string}>>; shifts?: Array<{date:string;periods:Array<{open:string;close:string}>}> }>;
  rooms: Array<{ id: string; name: string }>;
  clients?: Array<{ id: string; name: string; email?: string; phone?: string; status?: string }>;
  centers?: Array<{ id: string; name: string }>;
  pendingPackages?: Array<{clientId:string;sessionsToSchedule:number;expiresAt:string;serviceName:string}>;
}

export interface SlotQuery {
  date: string;
  serviceId: string;
  employeeId: string;
  roomId: string;
}

export interface ClientReservation extends SlotQuery {
  start: string;
  notes?: string;
  packageId?: string | null;
  recoveryId?: string | null;
}

export interface ServicePackage {
  id: string;
  clientId: string;
  serviceName: string;
  totalSessions: number;
  remainingSessions: number;
  expiresAt?: string;
  isActive: boolean;
}

export interface TrainingPlan {
  id: string;
  clientId: string;
  name: string;
  goals?: string;
  details?: {
    version?: number;
    days?: Array<{
      name: string;
      weekday: number;
      exercises: Array<{
          name: string;
          sets: number;
          repetitions: string;
          rest: string;
          load: string;
          notes?: string;
      }>;
    }>;
  };
  status: "BORRADOR" | "ACTIVO" | "COMPLETADO" | "ARCHIVADO";
  startsAt?: string;
  endsAt?: string | null;
}

export interface PendingPackage {
  packageId: string;
  clientId: string;
  clientName: string;
  serviceName: string;
  sessionsToSchedule: number;
  sessionsScheduled: number;
  expiresAt: string;
  daysRemaining: number;
  paymentPending?: boolean;
}

export interface Recovery {
  id: string;
  clientId: string;
  clientName?: string;
  serviceId: string;
  serviceName?: string;
  status: string;
  employeeId?: string;
}

export interface Measurement {
  id: string;
  clientId: string;
  measuredAt: string;
  weight?: number;
  bodyFat?: number;
  waist?: number;
  hip?: number;
  chest?: number;
  arm?: number;
  leg?: number;
  notes?: string;
}

