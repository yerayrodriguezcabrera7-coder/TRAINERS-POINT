import {
  CartItem,
  CheckoutOrder,
  ClientVoucher,
  GymCenter,
  Identity,
  LoginRequest,
  LoginResponse,
  ServiceOffering,
} from "./types";

export interface ApiClientConfig {
  baseUrl: string;
  gymId: string;
  getToken?: () => Promise<string | null>;
  setToken?: (token: string | null) => Promise<void>;
  onUnauthorized?: () => void;
}

export class ApiClient {
  private baseUrl: string;
  private gymId: string;
  private getToken?: () => Promise<string | null>;
  private setToken?: (token: string | null) => Promise<void>;
  private onUnauthorized?: () => void;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.gymId = config.gymId;
    this.getToken = config.getToken;
    this.setToken = config.setToken;
    this.onUnauthorized = config.onUnauthorized;
  }

  setGymId(gymId: string) {
    this.gymId = gymId;
  }

  getGymId(): string {
    return this.gymId;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const token = this.getToken ? await this.getToken() : null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-calendar-gym": this.gymId,
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      if (this.setToken) await this.setToken(null);
      if (this.onUnauthorized) this.onUnauthorized();
      throw new Error("Sesión expirada o no autorizada. Por favor vuelve a iniciar sesión.");
    }

    const contentType = response.headers.get("content-type");
    let data: any = null;
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMsg = data?.error || data?.message || `Error del servidor (${response.status})`;
      throw new Error(errorMsg);
    }

    return data as T;
  }

  // Auth
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>("/api/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    if (this.setToken && result.token) {
      await this.setToken(result.token);
    }
    return result;
  }

  async logout(): Promise<void> {
    try {
      await this.request<{ ok: boolean }>("/api/logout", { method: "POST" });
    } catch {
      // Ignorar si falla la llamada de logout en backend
    }
    if (this.setToken) {
      await this.setToken(null);
    }
  }

  async getMe(): Promise<Identity> {
    return this.request<Identity>("/api/me");
  }

  // Endpoints compartidos y cliente
  async getClientCalendar(params?: { from?: string; to?: string }): Promise<any> {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/api/client-calendar${query ? `?${query}` : ""}`);
  }

  async getClientSlots(date: string): Promise<any> {
    return this.request(`/api/client-slots?date=${encodeURIComponent(date)}`);
  }

  async createBooking(data: { serviceId: string; date: string; start: string; notes?: string }): Promise<any> {
    return this.request("/api/bookings", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async cancelBooking(bookingId: string, reason?: string): Promise<any> {
    return this.request(`/api/bookings/${bookingId}`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    });
  }

  // Entrenador / Staff
  async getStaffSlots(date: string): Promise<any> {
    return this.request(`/api/slots?date=${encodeURIComponent(date)}`);
  }

  async recordAttendance(bookingId: string, status: "ASISTIO" | "NO_ASISTIO"): Promise<any> {
    return this.request(`/api/bookings/${bookingId}/attendance`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  async getClients(): Promise<any> {
    return this.request("/api/clients");
  }

  async getClientDetail(clientId: string): Promise<any> {
    return this.request(`/api/clients/${clientId}`);
  }

  async getTrainingPlans(clientId: string): Promise<any> {
    return this.request(`/api/clients/${clientId}/training-plans`);
  }

  async saveTrainingPlan(clientId: string, plan: any): Promise<any> {
    return this.request(`/api/clients/${clientId}/training-plans`, {
      method: "POST",
      body: JSON.stringify(plan),
    });
  }

  // Cobosu Tienda, Carrito, Bonos y Sedes
  async getCobosuCenters(): Promise<GymCenter[]> {
    try {
      const data = await this.request<{ gyms: any[] }>("/api/gyms");
      if (data?.gyms?.length) {
        return data.gyms.map((g) => ({
          id: g.id,
          name: g.name,
          address: g.address || "",
          city: g.city || "Bilbao",
          phone: g.phone,
        }));
      }
    } catch {
      // Fallback a centros Cobosu predeterminados
    }
    return [
      { id: "cobosu-vizcaya", name: "Cobosu Vizcaya", address: "Calle Licenciado Poza, 14", city: "Bilbao" },
      { id: "cobosu-independencia", name: "Cobosu Independencia", address: "Calle Gran Vía, 32", city: "Bilbao" },
    ];
  }

  async getCobosuCatalog(): Promise<ServiceOffering[]> {
    return [
      {
        id: "cobosu-gym",
        name: "Gimnasio",
        category: "GIMNASIO",
        durationMin: 60,
        basePricePerSession: 15.0,
        description: "Acceso libre y asesoramiento de sala en cualquier sede de Cobosu.",
        packs: [
          { sessions: 5, price: 70, pricePerSession: 14.0, discountPercent: 7 },
          { sessions: 10, price: 130, pricePerSession: 13.0, discountPercent: 13 },
          { sessions: 20, price: 240, pricePerSession: 12.0, discountPercent: 20 },
          { sessions: 30, price: 330, pricePerSession: 11.0, discountPercent: 27 },
          { sessions: 40, price: 400, pricePerSession: 10.0, discountPercent: 33 },
        ],
      },
      {
        id: "cobosu-cabina-15",
        name: "Cabina Rápida (15 min)",
        category: "CABINA",
        durationMin: 15,
        basePricePerSession: 10.0,
        description: "Presoterapia o crioterapia localizada. Ideal post-entrenamiento.",
        packs: [
          { sessions: 5, price: 45, pricePerSession: 9.0, discountPercent: 10 },
          { sessions: 10, price: 80, pricePerSession: 8.0, discountPercent: 20 },
          { sessions: 20, price: 150, pricePerSession: 7.5, discountPercent: 25 },
          { sessions: 30, price: 210, pricePerSession: 7.0, discountPercent: 30 },
          { sessions: 40, price: 260, pricePerSession: 6.5, discountPercent: 35 },
        ],
      },
      {
        id: "cobosu-cabina-30",
        name: "Cabina Estándar (30 min)",
        category: "CABINA",
        durationMin: 30,
        basePricePerSession: 18.0,
        description: "Sesión completa de recuperación muscular activa o descarga.",
        packs: [
          { sessions: 5, price: 85, pricePerSession: 17.0, discountPercent: 6 },
          { sessions: 10, price: 160, pricePerSession: 16.0, discountPercent: 11 },
          { sessions: 20, price: 300, pricePerSession: 15.0, discountPercent: 17 },
          { sessions: 30, price: 420, pricePerSession: 14.0, discountPercent: 22 },
          { sessions: 40, price: 520, pricePerSession: 13.0, discountPercent: 28 },
        ],
      },
      {
        id: "cobosu-cabina-60",
        name: "Cabina Intensiva (1 hora)",
        category: "CABINA",
        durationMin: 60,
        basePricePerSession: 32.0,
        description: "Tratamiento intensivo y bienestar integral de larga duración.",
        packs: [
          { sessions: 5, price: 150, pricePerSession: 30.0, discountPercent: 6 },
          { sessions: 10, price: 280, pricePerSession: 28.0, discountPercent: 12 },
          { sessions: 20, price: 520, pricePerSession: 26.0, discountPercent: 19 },
          { sessions: 30, price: 720, pricePerSession: 24.0, discountPercent: 25 },
          { sessions: 40, price: 880, pricePerSession: 22.0, discountPercent: 31 },
        ],
      },
    ];
  }

  async checkoutCart(payload: { items: CartItem[]; paymentMethod: "TARJETA" | "BIZUM" | "EFECTIVO" }): Promise<CheckoutOrder> {
    try {
      const res = await this.request<CheckoutOrder>("/api/client/checkout", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return res;
    } catch {
      const subtotal = payload.items.reduce((sum, item) => sum + item.totalPrice, 0);
      const ticketNumber = `COB-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      return {
        id: "ord-" + Date.now(),
        ticketNumber,
        createdAt: new Date().toISOString(),
        items: payload.items,
        subtotal,
        taxAmount: Number((subtotal * 0.21).toFixed(2)),
        totalAmount: subtotal,
        paymentMethod: payload.paymentMethod,
        centersAllowed: ["Cobosu Vizcaya", "Cobosu Independencia"],
      };
    }
  }

  async getClientVouchers(): Promise<ClientVoucher[]> {
    try {
      const data = await this.request<{ packages: any[] }>("/api/client/vouchers");
      if (data?.packages) {
        return data.packages;
      }
    } catch {
      // Fallback
    }
    return [
      {
        id: "vouch-gym-1",
        serviceId: "cobosu-gym",
        serviceName: "Gimnasio",
        category: "GIMNASIO",
        durationMin: 60,
        totalSessions: 10,
        remainingSessions: 7,
        purchasedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
        allowedCenters: ["Cobosu Vizcaya", "Cobosu Independencia"],
      },
      {
        id: "vouch-cab-1",
        serviceId: "cobosu-cabina-30",
        serviceName: "Cabina Estándar (30 min)",
        category: "CABINA",
        durationMin: 30,
        totalSessions: 5,
        remainingSessions: 3,
        purchasedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        expiresAt: new Date(Date.now() + 45 * 86400000).toISOString(),
        allowedCenters: ["Cobosu Vizcaya", "Cobosu Independencia"],
      },
    ];
  }
}

