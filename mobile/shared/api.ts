import { Identity, LoginRequest, LoginResponse } from "./types";

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
}

