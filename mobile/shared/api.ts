import type { Booking, CalendarData, ClientReservation, Identity, LoginRequest, LoginResponse, SlotQuery } from "./types";

export interface ApiClientConfig {
  baseUrl: string;
  gymId?: string;
  getToken?: () => Promise<string | null>;
  setToken?: (token: string | null) => Promise<void>;
  onUnauthorized?: () => void;
  timeoutMs?: number;
}

export class ApiClient {
  private gymId?: string;
  constructor(private readonly config: ApiClientConfig) { this.gymId = config.gymId; }
  setGymId(gymId: string) { this.gymId = gymId.trim() || undefined; }
  getGymId() { return this.gymId || "Centro configurado en el servidor"; }

  private async request<T>(endpoint: string, options: RequestInit = {}, authenticated = true): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15000);
    try {
      const headers = new Headers(options.headers);
      headers.set("Accept", "application/json");
      if (options.body) headers.set("Content-Type", "application/json");
      if (this.gymId) headers.set("x-calendar-gym", this.gymId);
      const token = authenticated ? await this.config.getToken?.() : null;
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}${endpoint}`, {
        ...options, headers, signal: controller.signal,
      });
      if (response.status === 401 && authenticated) {
        await this.config.setToken?.(null);
        this.config.onUnauthorized?.();
      }
      const data: unknown = response.status === 204 ? null :
        response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      if (!response.ok) {
        const details = data && typeof data === "object" ? data as Record<string, unknown> : {};
        const message = typeof details.error === "string" ? details.error :
          typeof details.message === "string" ? details.message :
          response.status === 401 ? "Usuario o contraseña incorrectos, o sesión caducada." :
          `No se pudo completar la operación (${response.status}).`;
        throw new Error(message);
      }
      if (data === null && response.status !== 204) throw new Error("La dirección configurada no devuelve una respuesta de la API.");
      return data as T;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("El servidor tarda demasiado en responder. Inténtalo de nuevo.");
      if (error instanceof TypeError) throw new Error("No se puede conectar con el servidor. Comprueba la dirección y la conexión.");
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>("/api/login", { method: "POST", body: JSON.stringify(credentials) }, false);
    if (!result.token) throw new Error("El servidor no ha devuelto una sesión válida.");
    await this.config.setToken?.(result.token);
    return result;
  }
  async logout(): Promise<void> {
    try { await this.request("/api/logout", { method: "POST" }); }
    finally { await this.config.setToken?.(null); }
  }
  getMe() { return this.request<Identity>("/api/me"); }
  changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
    return this.request("/api/password/change", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
  }
  getClientCalendar() { return this.request<CalendarData>("/api/client-calendar"); }
  getStaffCalendar() { return this.request<CalendarData>("/api/mobile/calendar"); }
  getClientSlots(query: SlotQuery) {
    const params = new URLSearchParams({ ...query });
    return this.request<Array<{ start: string; end: string }>>(`/api/client-slots?${params}`);
  }
  createBooking(data: ClientReservation) {
    return this.request<Booking>("/api/client-calendar", { method: "POST", body: JSON.stringify(data) });
  }
  // Clients have no cancellation endpoint: direct them to reception.
  // Office changes retain the version so the server rejects stale edits.
  updateOfficeBooking(booking: Booking) {
    return this.request<Booking>(`/api/bookings/${encodeURIComponent(booking.id)}`, {
      method: "PUT", body: JSON.stringify({ booking }),
    });
  }
  completeWorkerBooking(bookingId: string, version: number) {
    return this.request<Booking>(`/api/bookings/${encodeURIComponent(bookingId)}/worker-action`, {
      method: "POST", body: JSON.stringify({ action: "COMPLETE", version }),
    });
  }
  getClients() { return this.request<{ clients: unknown[] }>("/api/clients"); }
  getClientDetail(clientId: string) { return this.request(`/api/clients/${encodeURIComponent(clientId)}/progress`); }
  getTrainingPlans(clientId: string) { return this.request(`/api/clients/${encodeURIComponent(clientId)}/training-plans`); }
  saveTrainingPlan(clientId: string, plan: unknown) {
    return this.request(`/api/clients/${encodeURIComponent(clientId)}/training-plans`, { method: "POST", body: JSON.stringify(plan) });
  }
}
