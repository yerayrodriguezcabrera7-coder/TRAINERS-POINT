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
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  notes?: string;
}

export interface CalendarData {
  bookings: Booking[];
  services: Array<{ id: string; name: string; color?: string }>;
  employees: Array<{ id: string; name: string }>;
  rooms: Array<{ id: string; name: string }>;
  clients?: Array<{ id: string; name: string; email?: string; phone?: string; status?: string }>;
  centers?: Array<{ id: string; name: string }>;
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

export interface Measurement {
  id: string;
  clientId: string;
  measuredAt: string;
  weight?: number;
  waist?: number;
  hip?: number;
  chest?: number;
  arm?: number;
  leg?: number;
  notes?: string;
}

