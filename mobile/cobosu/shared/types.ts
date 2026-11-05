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
  injuries?: any;
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
  status: "PENDIENTE" | "CONFIRMADA" | "COMPLETADA" | "CANCELADA";
  notes?: string;
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

export type ServiceCategory = "GIMNASIO" | "CABINA";

export interface ServicePackOption {
  sessions: number;
  price: number;
  pricePerSession: number;
  discountPercent?: number;
}

export interface ServiceOffering {
  id: string;
  name: string;
  category: ServiceCategory;
  durationMin: number; // 15, 30, 60
  basePricePerSession: number;
  description: string;
  packs: ServicePackOption[];
}

export interface CartItem {
  cartItemId: string;
  serviceId: string;
  serviceName: string;
  category: ServiceCategory;
  durationMin: number;
  sessions: number;
  unitPrice: number;
  totalPrice: number;
  isCustomQuantity: boolean;
}

export interface CheckoutOrder {
  id: string;
  ticketNumber: string;
  createdAt: string;
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: "TARJETA" | "BIZUM" | "EFECTIVO";
  centersAllowed: string[];
}

export interface GymCenter {
  id: string;
  name: string;
  address: string;
  city: string;
  phone?: string;
}

export interface ClientVoucher {
  id: string;
  serviceId: string;
  serviceName: string;
  category: ServiceCategory;
  durationMin: number;
  totalSessions: number;
  remainingSessions: number;
  purchasedAt: string;
  expiresAt: string;
  allowedCenters: string[];
}

export interface TrainingPlan {
  id: string;
  clientId: string;
  name: string;
  goals?: string;
  details?: {
    weeks?: Array<{
      name: string;
      days: Array<{
        dayName: string;
        exercises: Array<{
          name: string;
          sets: number;
          reps: string;
          restSeconds?: number;
          notes?: string;
        }>;
      }>;
    }>;
  };
  status: "BORRADOR" | "ACTIVO" | "COMPLETADO" | "ARCHIVADO";
  startsAt?: string;
  endsAt?: string;
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

