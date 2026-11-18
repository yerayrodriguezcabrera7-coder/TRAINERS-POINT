import type { Booking, CalendarData, ClientReservation, Identity, LoginRequest, LoginResponse, SlotQuery } from "./types";
import type { AttendanceData, TrainerClientDetail } from "./trainer-types";
import type { CognitoAuth } from "./cognito";
export { CognitoPasswordRequired } from "./cognito";

export interface ApiClientConfig {
  baseUrl: string;
  gymId?: string;
  getToken?: () => Promise<string | null>;
  setToken?: (token: string | null) => Promise<void>;
  onUnauthorized?: () => void;
  timeoutMs?: number;
  cognito?: CognitoAuth;
}

export class ApiClient {
  private gymId?: string;
  private loginPortal?: LoginRequest["portal"];
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
        this.config.cognito?.clear();
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
    this.loginPortal = credentials.portal;
    await this.config.setToken?.(null);
    if (this.config.cognito) {
      const accessToken = await this.config.cognito.login(credentials.username,credentials.password);
      return this.exchangeCognito(accessToken);
    }
    const result = await this.request<LoginResponse>("/api/login", { method: "POST", body: JSON.stringify(credentials) }, false);
    if (!result.token) throw new Error("El servidor no ha devuelto una sesión válida.");
    await this.config.setToken?.(result.token);
    return result;
  }
  private async exchangeCognito(accessToken: string): Promise<LoginResponse> {
    try {
      const result = await this.request<LoginResponse>("/api/cognito/login", {
        method: "POST", body: JSON.stringify({ accessToken, portal: this.loginPortal }),
      }, false);
      if (!result.token) throw new Error("El servidor no ha devuelto una sesión válida.");
      await this.config.setToken?.(result.token);
      return result;
    } catch (error) { this.config.cognito?.clear(); throw error; }
  }
  async logout(): Promise<void> {
    try { await this.request("/api/logout", { method: "POST" }); }
    finally { this.config.cognito?.clear(); await this.config.setToken?.(null); }
  }
  getMe() { return this.request<Identity>("/api/me"); }
  async cancelLogin() {
    this.loginPortal = undefined;
    this.config.cognito?.clear();
    await this.config.setToken?.(null);
  }
  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
    if (newPassword.length < 12 || newPassword !== confirmPassword)
      throw new Error("Escribe una contraseña nueva de al menos 12 caracteres y repítela igual.");
    if (this.config.cognito) {
      if (this.config.cognito.hasPasswordChallenge()) {
        await this.exchangeCognito(await this.config.cognito.completePassword(newPassword));
        return { ok: true };
      }
      return this.config.cognito.changePassword(currentPassword,newPassword);
    }
    return this.request("/api/password/change", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
  }
  getClientCalendar() { return this.request<CalendarData>("/api/client-calendar"); }
  getStaffCalendar() { return this.request<CalendarData>("/api/mobile/calendar"); }
  getAttendance(day: string) { return this.request<AttendanceData>(`/api/attendance?from=${encodeURIComponent(day)}&to=${encodeURIComponent(day)}`); }
  clock(employeeId: string, action: "IN" | "OUT", geo: {latitude:number;longitude:number;accuracy:number|null}) {
    return this.request<{clockIn:string;clockOut:string|null;geoIn?:{inGeofence:boolean};geoOut?:{inGeofence:boolean}}>("/api/attendance/clock",{method:"POST",body:JSON.stringify({employeeId,action,geo})});
  }
  pause(employeeId: string, action: "START" | "END") {
    return this.request("/api/attendance/pause",{method:"POST",body:JSON.stringify({employeeId,action})});
  }
  getTrainerClient(clientId: string) { return this.request<TrainerClientDetail>(`/api/mobile/clients/${encodeURIComponent(clientId)}`); }
  saveReceptionNote(clientId: string, content: string) { return this.request(`/api/mobile/clients/${encodeURIComponent(clientId)}/reception-note`,{method:"POST",body:JSON.stringify({content})}); }
  saveMeasurement(clientId: string, data: Record<string,number|string>) { return this.request(`/api/clients/${encodeURIComponent(clientId)}/measurements`,{method:"POST",body:JSON.stringify(data)}); }
  markAttendance(bookingId:string,attendance:"ASISTIO"|"NO_ASISTIO"|"REPROGRAMAR",version:number) {
    return this.request<Booking>(`/api/bookings/${encodeURIComponent(bookingId)}/attendance`,{method:"PATCH",body:JSON.stringify({attendance,version})});
  }
  saveSession(bookingId:string, data:{version:number;exercises:string;feeling:"GOOD"|"TIRED"|"PAIN"|null;nextSessionPlan:string}) {
    return this.request<Booking>(`/api/bookings/${encodeURIComponent(bookingId)}/session`,{method:"PATCH",body:JSON.stringify(data)});
  }
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
  // Assign/update a booking (for office/reception)
  assignBooking(bookingId: string, data: {
    clientId?: string;
    serviceId?: string;
    employeeId?: string;
    date?: string;
    start?: string;
    end?: string;
    roomId?: string;
    status?: string;
    needsReschedule?: boolean;
  }) {
    return this.request<Booking>(`/api/bookings/${encodeURIComponent(bookingId)}`, {
      method: "PUT", body: JSON.stringify({ booking: data }),
    });
  }
  // Query available slots
  getSlots(query: { date: string; employeeId: string; serviceId: string; roomId: string; centerId?: string; excludeId?: string }) {
    const params = new URLSearchParams();
    params.set("date", query.date);
    params.set("employeeId", query.employeeId);
    params.set("serviceId", query.serviceId);
    params.set("roomId", query.roomId);
    if (query.centerId) params.set("centerId", query.centerId);
    if (query.excludeId) params.set("excludeId", query.excludeId);
    return this.request<Array<{ start: string; end: string }>>(`/api/slots?${params}`);
  }
  // Get pending packages (to contract/schedule)
  getPendingPackages() {
    return this.request<any[]>("/api/pending-packages");
  }
  // Get recovery credits
  getRecoveries() {
    return this.request<any[]>("/api/recoveries");
  }
  completeWorkerBooking(bookingId: string, version: number) {
    return this.request<Booking>(`/api/bookings/${encodeURIComponent(bookingId)}/worker-action`, {
      method: "POST", body: JSON.stringify({ action: "COMPLETE", version }),
    });
  }
  getClients() { return this.request<{ clients: unknown[] }>("/api/clients"); }
  getClientDetail(clientId: string) { return this.request(`/api/clients/${encodeURIComponent(clientId)}/progress`); }
  getClientProfile(clientId: string) { return this.request<any>(`/api/clients/${encodeURIComponent(clientId)}/progress`); }
  getPackages(clientId: string) { return this.request<any[]>(`/api/clients/${encodeURIComponent(clientId)}/service-packages`); }
  getMeasurements(clientId: string) { return this.request<any[]>(`/api/clients/${encodeURIComponent(clientId)}/measurements`); }
  getTrainingPlans(clientId: string) { return this.request<any[]>(`/api/clients/${encodeURIComponent(clientId)}/training-plans`); }
  saveTrainingPlan(clientId: string, plan: unknown) {
    return this.request(`/api/clients/${encodeURIComponent(clientId)}/training-plans`, { method: "POST", body: JSON.stringify(plan) });
  }
}
