import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ApiClient } from "../../../shared/api";
import type {
  Booking,
  CalendarData,
  Identity,
  ServicePackage,
  Measurement,
  TrainingPlan,
} from "../../../shared/types";

/* ────────────────── Colores ────────────────── */
const COLORS = {
  primary: "#ed691d",
  primaryDark: "#c45612",
  success: "#386a48",
  warning: "#9b5b12",
  danger: "#a12d23",
  dark: "#1d302e",
  text: "#1d302e",
  textMuted: "#506257",
  bg: "#f7f4ee",
  surface: "#ffffff",
  border: "#e0ddd5",
};

const STATUS_LABEL: Record<Booking["status"], string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Realizada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No asistió",
};

const STATUS_BG: Record<Booking["status"], string> = {
  PENDING: "#fff3e0",
  CONFIRMED: "#e8f5e9",
  COMPLETED: "#eceff1",
  CANCELLED: "#fce4ec",
  NO_SHOW: "#fff3e0",
};

/* ────────────────── Utilidades ────────────────── */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(`${iso}T00:00:00`);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function progressPercent(pkg: ServicePackage): number {
  if (!pkg.totalSessions) return 0;
  return Math.round(((pkg.totalSessions - pkg.remainingSessions) / pkg.totalSessions) * 100);
}

/* ═══════════════════════════════════════════════
   Componente principal
   ═══════════════════════════════════════════════ */
export default function ClientHomeScreen({
  api,
  user,
  onLogout,
}: {
  api: ApiClient;
  user: Identity;
  onLogout: () => void;
}) {
  const [data, setData] = useState<CalendarData | null>(null);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [trainingPlans, setTrainingPlans] = useState<TrainingPlan[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [tab, setTab] = useState<
    "reservas" | "bonos" | "medidas" | "plan" | "perfil"
  >("reservas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<TrainingPlan | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ServicePackage | null>(null);

  // Expandible plan de entrenamiento (días visibles)
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);

  const active = useRef(true), inFlight = useRef(false);

  /* ── Carga de datos ── */
  const loadAll = useCallback(async (showSpinner = true) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (showSpinner) setLoading(true);
    try {
      const [cal, pkgs, meas, plans] = await Promise.allSettled([
        api.getClientCalendar(),
        user.clientId ? api.getPackages(user.clientId) : Promise.resolve([]),
        user.clientId ? api.getMeasurements(user.clientId) : Promise.resolve([]),
        user.clientId ? api.getTrainingPlans(user.clientId) : Promise.resolve([]),
      ]);
      if (active.current) {
        setData(cal.status === "fulfilled" ? cal.value : null);
        setPackages(pkgs.status === "fulfilled" ? pkgs.value : []);
        setMeasurements(
          meas.status === "fulfilled" ? meas.value : []
        );
        setTrainingPlans(
          plans.status === "fulfilled" ? plans.value : []
        );
        setError("");
        setUpdatedAt(
          new Date().toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          })
        );
      }
    } catch (reason) {
      if (active.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudieron cargar los datos."
        );
      }
    } finally {
      inFlight.current = false;
      if (active.current) setLoading(false);
    }
  }, [api, user.clientId]);

  const loadProfile = useCallback(async () => {
    try {
      if (user.clientId) {
        const profileData = await api.getClientProfile(user.clientId);
        if (active.current) setProfile(profileData);
      }
    } catch {
      /* Profile is optional */
    }
  }, [api, user.clientId]);

  /* ── Refresh ── */
  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadAll(true);
    setRefreshing(false);
  }, [loadAll, refreshing]);

  useEffect(() => {
    active.current = true;
    void loadAll();
    void loadProfile();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void loadAll(false);
    }, 30000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, [loadAll, loadProfile]);

  /* ── Helpers ── */
  const upcoming = data
    ? data.bookings
        .filter(b =>
          ["PENDING", "CONFIRMED"].includes(b.status) &&
          b.date > new Date().toISOString().split("T")[0]
        )
        .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    : [];
  const past = data
    ? data.bookings
        .filter(b => ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(b.status))
        .sort((a, b) => `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`))
    : [];
  const serviceName = (sid: string) =>
    data?.services.find(s => s.id === sid)?.name || "Sesión";
  const employeeName = (eid: string | null) =>
    eid ? (data?.employees.find(e => e.id === eid)?.name || "Pendiente") : "Pendiente";

  const toggleDay = useCallback((planId: string, idx: string) => {
    setExpandedDays(prev => ({ ...prev, [`${planId}-${idx}`]: !prev[`${planId}-${idx}`] }));
  }, []);

  /* ═══════════════════════════════════════════════
   Render
   ═══════════════════════════════════════════════ */
  return (
    <View style={s.page}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.brand}>
            <Text style={s.orange}>T.</Text> trainerspoint
          </Text>
          <Text style={s.greeting}>
            Hola, {user.name || user.username}
          </Text>
        </View>
        <View style={s.headerRight}>
          <Pressable
            accessibilityRole="button"
            onPress={onLogout}
            style={s.logout}
          >
            <Text style={s.logoutText}>Salir</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Scroll ── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {error && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* ═══════════════════════════════════════
            TAB: RESERVAS
            ═══════════════════════════════════════ */}
        {tab === "reservas" && (
          <View style={s.section}>
            {/* Hero Card: próxima cita */}
            {upcoming.length > 0 && (
              <View style={s.heroCard}>
                {/* Badge "Faltan X días" */}
                {(() => {
                  const d = daysUntil(upcoming[0].date);
                  const isToday = d === 0;
                  return (
                    <View style={s.heroBadge}>
                      <Text style={s.heroBadgeText}>
                        {isToday ? "🔥 ¡Es hoy!" : `⏱ Faltan ${d} día${d > 1 ? "s" : ""}`}
                      </Text>
                    </View>
                  );
                })()}

                {/* Service name */}
                <Text style={s.heroService}>
                  {serviceName(upcoming[0].serviceId)}
                </Text>

                {/* Date */}
                <Text style={s.heroDate}>
                  {formatDate(upcoming[0].date).replace(/^\w/, c => c.toUpperCase())}
                </Text>

                {/* Time */}
                <Text style={s.heroTime}>
                  {upcoming[0].start} – {upcoming[0].end}
                </Text>

                {/* Divider */}
                <View style={s.heroDivider} />

                {/* Trainer */}
                <Text style={s.heroTrainerLine}>
                  👤 {employeeName(upcoming[0].employeeId)}
                </Text>

                {/* Center */}
                {upcoming[0].centerName && (
                  <Text style={s.heroCenterLine}>
                    📍 {upcoming[0].centerName}
                  </Text>
                )}
                {upcoming[0].centerAddress && (
                  <Text style={s.heroCenterLine}>
                    🏢 {upcoming[0].centerAddress}
                  </Text>
                )}
              </View>
            )}

            {/* Próximas reservas */}
            {upcoming.length > 0 && (
              <>
                <Text style={s.sectionTitle}>
                  Próximas reservas ({upcoming.length})
                </Text>
                {upcoming.map(b => {
                  const service = data?.services.find(s => s.id === b.serviceId);
                  const color = service?.color || COLORS.primary;
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => setSelectedBooking(b)}
                      style={s.largeCard}
                    >
                      {/* Barra lateral de color */}
                      <View style={[s.sideBar, { backgroundColor: color }]} />

                      <View style={s.largeCardContent}>
                        {/* Service name + status badge */}
                        <View style={s.largeCardTop}>
                          <Text style={s.largeCardService}>
                            {serviceName(b.serviceId)}
                          </Text>
                          <View style={[s.statusBadge, { backgroundColor: STATUS_BG[b.status] }]}>
                            <Text style={[s.statusText, { color: STATUS_BG[b.status] === "#fff3e0" ? COLORS.warning : STATUS_BG[b.status] === "#e8f5e9" ? COLORS.success : COLORS.textMuted }]}>
                              {STATUS_LABEL[b.status]}
                            </Text>
                          </View>
                        </View>

                        {/* Date & time */}
                        <Text style={s.largeCardDate}>
                          {formatDate(b.date).replace(/^\w/, c => c.toUpperCase())}
                        </Text>
                        <Text style={s.largeCardTime}>
                          {b.start} – {b.end}
                        </Text>

                        {/* Trainer */}
                        <Text style={s.largeCardTrainer}>
                          👤 {employeeName(b.employeeId)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </>
            )}

            {/* Historial */}
            {past.length > 0 && (
              <>
                <Text style={s.sectionTitle}>
                  Historial ({past.length})
                </Text>
                {past.slice(0, 10).map(b => {
                  const service = data?.services.find(s => s.id === b.serviceId);
                  const color = service?.color || "#aaa";
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => setSelectedBooking(b)}
                      style={[s.largeCard, s.largeCardPast]}
                    >
                      <View style={[s.sideBar, { backgroundColor: color, opacity: 0.4 }]} />
                      <View style={s.largeCardContent}>
                        <View style={s.largeCardTop}>
                          <Text style={[s.largeCardService, s.largeCardServicePast]}>
                            {serviceName(b.serviceId)}
                          </Text>
                          <View style={[s.statusBadge, { backgroundColor: STATUS_BG[b.status] }]}>
                            <Text style={[s.statusText, { color: STATUS_BG[b.status] === "#fff3e0" ? COLORS.warning : STATUS_BG[b.status] === "#e8f5e9" ? COLORS.success : COLORS.textMuted }]}>
                              {STATUS_LABEL[b.status]}
                            </Text>
                          </View>
                        </View>
                        <Text style={s.largeCardDate}>
                          {formatDate(b.date).replace(/^\w/, c => c.toUpperCase())}
                        </Text>
                        <Text style={s.largeCardTime}>
                          {b.start} – {b.end}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </>
            )}

            {/* Empty state */}
            {!loading && !upcoming.length && !past.length && (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>📅</Text>
                <Text style={s.emptyTitle}>Sin reservas</Text>
                <Text style={s.emptyText}>
                  No hay reservas todavía. Contacta con recepción para
                  reservar tu primera sesión.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════
            TAB: BONOS
            ═══════════════════════════════════════ */}
        {tab === "bonos" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Mis bonos activos</Text>

            {packages
              .filter(p => p.isActive)
              .map(p => {
                const pct = progressPercent(p);
                const isUrgent = p.remainingSessions <= 2;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedPackage(p)}
                    style={[s.largeCard, isUrgent && s.largeCardUrgent]}
                  >
                    {/* Barra de progreso */}
                    <View style={s.progressTrack}>
                      <View
                        style={[
                          s.progressFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: isUrgent ? COLORS.danger : COLORS.success,
                          },
                        ]}
                      />
                    </View>

                    <View style={s.largeCardContent}>
                      <View style={s.largeCardTop}>
                        <Text style={s.largeCardService}>{p.serviceName}</Text>
                        {isUrgent && (
                          <View style={s.urgentBadge}>
                            <Text style={s.urgentBadgeText}>⚠️ Por agotarse</Text>
                          </View>
                        )}
                        {!isUrgent && (
                          <View style={[s.statusBadge, { backgroundColor: "#e8f5e9" }]}>
                            <Text style={[s.statusText, { color: COLORS.success }]}>Activo</Text>
                          </View>
                        )}
                      </View>

                      {/* Sesiones */}
                      <View style={s.sessionsRow}>
                        <Text style={s.sessionsBig}>
                          {p.totalSessions - p.remainingSessions}
                        </Text>
                        <Text style={s.sessionsSlash}>/</Text>
                        <Text style={s.sessionsSmall}>{p.totalSessions}</Text>
                        <Text style={s.sessionsLabel}>sesiones</Text>
                      </View>

                      {/* Remaining */}
                      <Text style={s.sessionsRemaining}>
                        Faltan {p.remainingSessions} de {p.totalSessions}
                      </Text>

                      {/* Expiry */}
                      {p.expiresAt && (
                        <Text style={s.expiryText}>
                          ⏰ Vence: {formatDate(p.expiresAt)}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}

            {/* Empty state */}
            {!loading && packages.filter(p => p.isActive).length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🎫</Text>
                <Text style={s.emptyTitle}>Sin bonos activos</Text>
                <Text style={s.emptyText}>
                  Pregunta en recepción sobre los bonos de sesiones
                  disponibles para tu centro.
                </Text>
              </View>
            )}

            {/* Nota */}
            {packages.filter(p => p.isActive).length > 0 && (
              <View style={s.note}>
                <Text style={s.noteText}>
                  💡 Para contratar bonos o renovar, contacta con recepción.
                  Las sesiones se gestionan desde el centro.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════
            TAB: MEDIDAS
            ═══════════════════════════════════════ */}
        {tab === "medidas" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              Mis medidas ({measurements.length})
            </Text>

            {measurements.map((m, idx) => {
              // Comparar con la anterior (más reciente que esta)
              const prev = idx < measurements.length - 1 ? measurements[idx + 1] : null;
              const diff = (current?: number, prevVal?: number) => {
                if (current == null || prevVal == null || !prev) return null;
                const d = current - prevVal;
                if (d === 0) return null;
                return d > 0 ? `+${d}` : `${d}`;
              };

              const fields: Array<{
                label: string;
                value: number | undefined;
                unit: string;
                diffFn: () => string | null;
              }> = [
                { label: "Peso", value: m.weight, unit: "kg", diffFn: () => diff(m.weight, prev?.weight) },
                { label: "Cintura", value: m.waist, unit: "cm", diffFn: () => diff(m.waist, prev?.waist) },
                { label: "Cadera", value: m.hip, unit: "cm", diffFn: () => diff(m.hip, prev?.hip) },
                { label: "Pecho", value: m.chest, unit: "cm", diffFn: () => diff(m.chest, prev?.chest) },
                { label: "Brazo", value: m.arm, unit: "cm", diffFn: () => diff(m.arm, prev?.arm) },
                { label: "Pierna", value: m.leg, unit: "cm", diffFn: () => diff(m.leg, prev?.leg) },
              ];

              return (
                <Pressable
                  key={m.id}
                  onPress={() => setSelectedMeasurement(m)}
                  style={s.largeCard}
                >
                  <Text style={s.measureDate}>
                    {formatDate(m.measuredAt).replace(/^\w/, c => c.toUpperCase())}
                  </Text>

                  <View style={s.measureGrid}>
                    {fields
                      .filter(f => f.value != null)
                      .map(f => (
                        <View key={f.label} style={s.measureCell}>
                          <Text style={s.measureCellLabel}>{f.label}</Text>
                          <View style={s.measureCellRow}>
                            <Text style={s.measureCellValue}>{f.value}</Text>
                            <Text style={s.measureCellUnit}>{f.unit}</Text>
                          </View>
                          {f.diffFn() && (
                            <Text style={[s.measureCellDiff, f.diffFn()![0] === "+" ? s.measureCellDiffUp : s.measureCellDiffDown]}>
                              {f.diffFn()}
                            </Text>
                          )}
                        </View>
                      ))}
                  </View>
                </Pressable>
              );
            })}

            {/* Empty */}
            {!loading && measurements.length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>📏</Text>
                <Text style={s.emptyTitle}>Sin medidas</Text>
                <Text style={s.emptyText}>
                  El centro puede añadir tus medidas de progreso.
                  ¡Sigue así y pronto aparecerán aquí!
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════
            TAB: PLAN
            ═══════════════════════════════════════ */}
        {tab === "plan" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              Mi plan de entrenamiento ({trainingPlans.length})
            </Text>

            {trainingPlans
              .filter(p => p.status === "ACTIVO")
              .map(plan => {
                const days = plan.details?.days ?? [];
                return (
                  <Pressable
                    key={plan.id}
                    onPress={() => setSelectedPlan(plan)}
                    style={s.planCard}
                  >
                    {/* Header del plan */}
                    <View style={s.planHeader}>
                      <View style={s.planHeaderLeft}>
                        <Text style={s.planTitle}>{plan.name}</Text>
                        {plan.goals && (
                          <Text style={s.planGoals}>{plan.goals}</Text>
                        )}
                      </View>
                      <View style={s.planStatusBadge}>
                        <Text style={s.planStatusText}>ACTIVO</Text>
                      </View>
                    </View>

                    {/* Dates */}
                    {(plan.startsAt || plan.endsAt) && (
                      <View style={s.planDatesRow}>
                        {plan.startsAt && (
                          <Text style={s.planDate}>
                            📅 Desde {formatDate(plan.startsAt)}
                          </Text>
                        )}
                        {plan.endsAt && (
                          <Text style={s.planDate}>
                            → {formatDate(plan.endsAt)}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Días expandibles */}
                    {days.map((day, idx) => {
                      const key = `${plan.id}-${idx}`;
                      const expanded = expandedDays[key];
                      return (
                        <View key={idx} style={s.planDay}>
                          <Pressable
                            onPress={() => toggleDay(plan.id, String(idx))}
                            style={s.planDayHeader}
                          >
                            <Text style={s.planDayTitle}>
                              Día {idx + 1}: {day.name}
                            </Text>
                            <Text style={s.planDayArrow}>
                              {expanded ? "▲" : "▼"}
                            </Text>
                          </Pressable>
                          {/* Mostrar/ocultar sin animación */}
                          {expanded && (
                            <View style={s.planExercises}>
                              {day.exercises.map((ex, i) => (
                                <Text key={i} style={s.exerciseText}>
                                  {ex.name}: {ex.sets}x{ex.repetitions} · {ex.load}
                                  {ex.notes ? ` · ${ex.notes}` : ""}
                                </Text>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}

                    {days.length === 0 && (
                      <Text style={s.planNoDays}>
                        No hay días de rutina disponibles todavía.
                      </Text>
                    )}
                  </Pressable>
                );
              })}

            {/* Empty */}
            {!loading && trainingPlans.filter(p => p.status === "ACTIVO").length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>📋</Text>
                <Text style={s.emptyTitle}>Sin plan activo</Text>
                <Text style={s.emptyText}>
                  Pregúntale a tu entrenador sobre un plan
                  personalizado para ti.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════
            TAB: PERFIL
            ═══════════════════════════════════════ */}
        {tab === "perfil" && (
          <View style={s.section}>
            {profile ? (
              <View style={s.profileCard}>
                {/* Avatar */}
                <View style={s.profileAvatar}>
                  <Text style={s.profileInitials}>
                    {(profile.firstName || user.name || user.username || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>

                {/* Nombre */}
                <Text style={s.profileName}>
                  {profile.firstName} {profile.lastName}
                </Text>

                {/* Email */}
                {profile.email && (
                  <View style={s.profileRow}>
                    <Text style={s.profileRowIcon}>✉️</Text>
                    <Text style={s.profileRowText}>{profile.email}</Text>
                  </View>
                )}

                {/* Teléfono */}
                {profile.phone && (
                  <View style={s.profileRow}>
                    <Text style={s.profileRowIcon}>📞</Text>
                    <Text style={s.profileRowText}>{profile.phone}</Text>
                  </View>
                )}

                {/* Estado */}
                {profile.status && (
                  <View
                    style={[
                      s.profileStatus,
                      profile.status === "ACTIVO"
                        ? s.profileStatusActive
                        : profile.status === "BAJA"
                        ? s.profileStatusBaja
                        : s.profileStatusLead,
                    ]}
                  >
                    <Text style={s.profileStatusText}>
                      {profile.status === "ACTIVO"
                        ? "✓ Activo"
                        : profile.status === "BAJA"
                        ? "⊘ Dado de baja"
                        : "◉ Lead"}
                    </Text>
                  </View>
                )}

                {/* Objetivo */}
                {profile.objective && (
                  <View style={s.profileObjectiveBox}>
                    <Text style={s.profileObjectiveQuote}>
                      "{profile.objective}"
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={s.profilePlaceholder}>
                <View style={s.profileAvatar}>
                  <Text style={s.profileInitials}>
                    {(user.name || user.username || "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={s.profileName}>
                  {user.name || user.username}
                </Text>
                <Text style={s.profilePlaceholderText}>
                  Tu ficha se actualiza desde el centro.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadAll()}
            style={s.refreshBtn}
          >
            <Text style={s.refreshText}>Actualizar datos</Text>
          </Pressable>
          {!!updatedAt && (
            <Text style={s.lastUpdate}>
              Actualizado a las {updatedAt}
            </Text>
          )}
          <Text style={s.footerNote}>
            Para solicitar cambios en tus citas, bonos o medidas,
            contacta con recepción.
          </Text>
        </View>
      </ScrollView>

      {/* ═══════════════════════════════════════
          Bottom Tab Bar (fijo)
          ═══════════════════════════════════════ */}
      <View style={s.tabBar}>
        {[
          { key: "reservas" as const, label: "Reservas", emoji: "📅" },
          { key: "bonos" as const, label: "Bonos", emoji: "🎫" },
          { key: "medidas" as const, label: "Medidas", emoji: "📏" },
          { key: "plan" as const, label: "Plan", emoji: "📋" },
          { key: "perfil" as const, label: "Perfil", emoji: "👤" },
        ].map(t => (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
            onPress={() => setTab(t.key)}
            style={[s.tabItem, tab === t.key && s.tabItemActive]}
          >
            <Text style={[s.tabEmoji, tab === t.key && s.tabEmojiActive]}>
              {t.emoji}
            </Text>
            <Text
              style={[s.tabLabel, tab === t.key && s.tabLabelActive]}
              numberOfLines={1}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ═══════════════════════════════════════
          Modales de detalle (sin cambios)
          ═══════════════════════════════════════ */}
      <Modal
        visible={selectedBooking !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedBooking(null)}
      >
        <View style={s.overlay}>
          <View style={s.panel}>
            {selectedBooking && (
              <ScrollView style={s.modalScroll}>
                <Text style={s.modalEyebrow}>RESERVA</Text>
                <Text style={s.modalTitle}>
                  {serviceName(selectedBooking.serviceId)}
                </Text>
                <Text style={s.modalRow}>
                  📅 {formatDate(selectedBooking.date).replace(/^\w/, c => c.toUpperCase())}
                </Text>
                <Text style={s.modalRow}>
                  🕐 {selectedBooking.start} – {selectedBooking.end}
                </Text>
                <Text style={s.modalRow}>
                  👤{" "}
                  {employeeName(selectedBooking.employeeId)}
                </Text>
                {selectedBooking.centerName && (
                  <Text style={s.modalRow}>📍 {selectedBooking.centerName}</Text>
                )}
                {selectedBooking.centerAddress && (
                  <Text style={s.modalRow}>
                    🏢 {selectedBooking.centerAddress}
                  </Text>
                )}
                <View
                  style={[s.modalStatus, { backgroundColor: STATUS_BG[selectedBooking.status] }]}
                >
                  <Text
                    style={[
                      s.modalStatusText,
                      {
                        color:
                          STATUS_BG[selectedBooking.status] ===
                          "#fff3e0"
                            ? COLORS.warning
                            : STATUS_BG[selectedBooking.status] ===
                              "#e8f5e9"
                            ? COLORS.success
                            : COLORS.textMuted,
                      },
                    ]}
                  >
                    {STATUS_LABEL[selectedBooking.status]}
                  </Text>
                </View>
                {selectedBooking.notes && (
                  <Text style={s.modalRow}>📝 {selectedBooking.notes}</Text>
                )}
                <Pressable
                  onPress={() => setSelectedBooking(null)}
                  style={s.modalClose}
                >
                  <Text style={s.modalCloseText}>Cerrar</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedMeasurement !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMeasurement(null)}
      >
        <View style={s.overlay}>
          <View style={s.panel}>
            {selectedMeasurement && (
              <ScrollView style={s.modalScroll}>
                <Text style={s.modalEyebrow}>MEDIDAS</Text>
                <Text style={s.modalTitle}>
                  {formatDate(selectedMeasurement.measuredAt).replace(/^\w/, c => c.toUpperCase())}
                </Text>
                {selectedMeasurement.weight && (
                  <Text style={s.modalRow}>⚖️ Peso: {selectedMeasurement.weight} kg</Text>
                )}
                {selectedMeasurement.waist && (
                  <Text style={s.modalRow}>📏 Cintura: {selectedMeasurement.waist} cm</Text>
                )}
                {selectedMeasurement.hip && (
                  <Text style={s.modalRow}>📏 Cadera: {selectedMeasurement.hip} cm</Text>
                )}
                {selectedMeasurement.chest && (
                  <Text style={s.modalRow}>📏 Pecho: {selectedMeasurement.chest} cm</Text>
                )}
                {selectedMeasurement.arm && (
                  <Text style={s.modalRow}>📏 Brazo: {selectedMeasurement.arm} cm</Text>
                )}
                {selectedMeasurement.leg && (
                  <Text style={s.modalRow}>📏 Pierna: {selectedMeasurement.leg} cm</Text>
                )}
                {selectedMeasurement.notes && (
                  <Text style={s.modalRow}>📝 {selectedMeasurement.notes}</Text>
                )}
                <Pressable
                  onPress={() => setSelectedMeasurement(null)}
                  style={s.modalClose}
                >
                  <Text style={s.modalCloseText}>Cerrar</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedPlan !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPlan(null)}
      >
        <View style={s.overlay}>
          <View style={s.panel}>
            {selectedPlan && (
              <ScrollView style={s.modalScroll}>
                <Text style={s.modalEyebrow}>PLAN DE ENTRENAMIENTO</Text>
                <Text style={s.modalTitle}>{selectedPlan.name}</Text>
                {selectedPlan.goals && (
                  <Text style={s.modalRow}>{selectedPlan.goals}</Text>
                )}
                {selectedPlan.startsAt && (
                  <Text style={s.modalRow}>
                    📅 Desde: {formatDate(selectedPlan.startsAt)}
                  </Text>
                )}
                {selectedPlan.endsAt && (
                  <Text style={s.modalRow}>
                    📅 Hasta: {formatDate(selectedPlan.endsAt)}
                  </Text>
                )}
                {selectedPlan.details?.days &&
                  selectedPlan.details.days.map((day, idx) => (
                    <View key={idx} style={s.dayBlock}>
                      <Text style={s.dayTitle}>
                        Día {idx + 1}: {day.name}
                      </Text>
                      {day.exercises.map((ex, i) => (
                        <Text key={i} style={s.exerciseText}>
                          • {ex.name}: {ex.sets}x{ex.repetitions} · {ex.load}
                          {ex.notes ? ` · ${ex.notes}` : ""}
                        </Text>
                      ))}
                    </View>
                  ))}
                <Pressable
                  onPress={() => setSelectedPlan(null)}
                  style={s.modalClose}
                >
                  <Text style={s.modalCloseText}>Cerrar</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedPackage !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPackage(null)}
      >
        <View style={s.overlay}>
          <View style={s.panel}>
            {selectedPackage && (
              <ScrollView style={s.modalScroll}>
                <Text style={s.modalEyebrow}>BONO</Text>
                <Text style={s.modalTitle}>{selectedPackage.serviceName}</Text>
                <Text style={s.modalRow}>
                  🎫 Sesiones: {selectedPackage.remainingSessions} de{" "}
                  {selectedPackage.totalSessions}
                </Text>
                {selectedPackage.expiresAt && (
                  <Text style={s.modalRow}>
                    ⏰ Vence: {formatDate(selectedPackage.expiresAt)}
                  </Text>
                )}
                <Text style={s.modalRow}>
                  {selectedPackage.remainingSessions > 0
                    ? "✅ Bono activo"
                    : "⊘ Bono agotado"}
                </Text>
                <Pressable
                  onPress={() => setSelectedPackage(null)}
                  style={s.modalClose}
                >
                  <Text style={s.modalCloseText}>Cerrar</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ═══════════════════════════════════════════════
   Estilos
   ═══════════════════════════════════════════════ */
const s = StyleSheet.create({
  /* ── Page ── */
  page: { flex: 1, backgroundColor: COLORS.bg },

  /* ── Header ── */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: { flex: 1 },
  brand: { color: COLORS.text, fontSize: 22, fontWeight: "800", letterSpacing: -1 },
  orange: { color: COLORS.primary },
  greeting: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  logout: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  logoutText: { color: COLORS.danger, fontWeight: "700", fontSize: 13 },

  /* ── Scroll ── */
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },

  /* ── Section ── */
  section: { gap: 12 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 4,
    paddingLeft: 4,
  },

  /* ── Error ── */
  errorBanner: {
    backgroundColor: "#fff0ec",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f5c6b8",
  },
  errorText: { color: COLORS.danger, fontSize: 14, fontWeight: "600" },

  /* ═══════════════════════════════════════════
     Hero Card: próxima cita
     ═══════════════════════════════════════════ */
  heroCard: {
    backgroundColor: COLORS.dark,
    borderRadius: 24,
    padding: 24,
    marginBottom: 8,
    minHeight: 220,
    justifyContent: "space-between",
  },
  heroBadge: {
    backgroundColor: COLORS.primary,
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  heroService: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    marginTop: 16,
    lineHeight: 32,
  },
  heroDate: {
    color: "#c8d4d0",
    fontSize: 16,
    marginTop: 10,
    fontWeight: "500",
  },
  heroTime: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
  },
  heroDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginVertical: 16,
  },
  heroTrainerLine: {
    color: "#a0b5ae",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 2,
  },
  heroCenterLine: {
    color: "#8a9e97",
    fontSize: 13,
    marginTop: 2,
  },

  /* ═══════════════════════════════════════════
     Large Card (reservas, bonos, medidas)
     ═══════════════════════════════════════════ */
  largeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    overflow: "hidden",
    flexDirection: "row",
  },
  largeCardPast: { opacity: 0.72 },
  largeCardUrgent: {
    borderColor: COLORS.danger,
    borderWidth: 2,
  },
  sideBar: {
    width: 8,
    height: "100%",
    alignSelf: "stretch",
  },
  largeCardContent: {
    flex: 1,
    padding: 18,
  },
  largeCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  largeCardService: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  largeCardServicePast: { color: COLORS.textMuted },
  largeCardDate: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "500",
    marginTop: 2,
  },
  largeCardTime: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
  },
  largeCardTrainer: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
    fontWeight: "500",
  },

  /* ── Status badge ── */
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },

  /* ── Urgent badge ── */
  urgentBadge: {
    backgroundColor: "#fce4ec",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  urgentBadgeText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "700",
  },

  /* ═══════════════════════════════════════════
     Bonos: progreso
     ═══════════════════════════════════════════ */
  progressTrack: {
    height: 6,
    backgroundColor: "#e8e4dd",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  sessionsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 14,
  },
  sessionsBig: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "800",
  },
  sessionsSlash: {
    color: COLORS.textMuted,
    fontSize: 20,
    fontWeight: "600",
    marginHorizontal: 4,
  },
  sessionsSmall: {
    color: COLORS.textMuted,
    fontSize: 20,
    fontWeight: "600",
  },
  sessionsLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginLeft: 4,
  },
  sessionsRemaining: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  expiryText: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 8,
  },

  /* ═══════════════════════════════════════════
     Medidas
     ═══════════════════════════════════════════ */
  measureDate: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
    paddingLeft: 4,
  },
  measureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  measureCell: {
    flexBasis: "32%",
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  measureCellLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  measureCellRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  measureCellValue: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
  },
  measureCellUnit: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 2,
  },
  measureCellDiff: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  measureCellDiffUp: { color: COLORS.danger },
  measureCellDiffDown: { color: COLORS.success },

  /* ═══════════════════════════════════════════
     Plan de entrenamiento
     ═══════════════════════════════════════════ */
  planCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  planHeaderLeft: { flex: 1, marginRight: 12 },
  planTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  planGoals: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 4,
    fontStyle: "italic",
  },
  planStatusBadge: {
    backgroundColor: "#e8f5e9",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  planStatusText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: "800",
  },
  planDatesRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
  },
  planDate: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  planDay: {
    marginTop: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    overflow: "hidden",
  },
  planDayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  planDayTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  planDayArrow: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  planExercises: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  exerciseText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 22,
    marginBottom: 2,
  },
  planNoDays: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 8,
  },

  /* ═══════════════════════════════════════════
     Perfil
     ═══════════════════════════════════════════ */
  profileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  profilePlaceholder: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  profileInitials: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
  },
  profileName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  profileRowIcon: { fontSize: 16 },
  profileRowText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  profileStatus: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  profileStatusActive: { backgroundColor: "#e8f5e9" },
  profileStatusBaja: { backgroundColor: "#fce4ec" },
  profileStatusLead: { backgroundColor: "#fff3e0" },
  profileStatusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  profileObjectiveBox: {
    marginTop: 20,
    width: "100%",
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 20,
  },
  profileObjectiveQuote: {
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 24,
    fontStyle: "italic",
    textAlign: "center",
  },
  profilePlaceholderText: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },

  /* ═══════════════════════════════════════════
     Empty State
     ═══════════════════════════════════════════ */
  empty: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 48,
    lineHeight: 48,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },

  /* ═══════════════════════════════════════════
     Note
     ═══════════════════════════════════════════ */
  note: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  noteText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },

  /* ═══════════════════════════════════════════
     Footer
     ═══════════════════════════════════════════ */
  footer: {
    marginTop: 20,
    alignItems: "center",
    gap: 6,
  },
  refreshBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: "center",
  },
  refreshText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  lastUpdate: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  footerNote: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
    paddingHorizontal: 20,
  },

  /* ═══════════════════════════════════════════
     Bottom Tab Bar
     ═══════════════════════════════════════════ */
  tabBar: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: 10,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 12,
    gap: 2,
  },
  tabItemActive: {
    backgroundColor: COLORS.dark,
  },
  tabEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  tabEmojiActive: {
    // emoji se ve bien sin cambio
  },
  tabLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#fff",
    fontWeight: "700",
  },

  /* ═══════════════════════════════════════════
     Modales
     ═══════════════════════════════════════════ */
  overlay: {
    flex: 1,
    backgroundColor: "rgba(29,48,46,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  panel: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: "hidden",
  },
  modalScroll: {
    padding: 24,
    gap: 14,
  },
  modalEyebrow: {
    color: "#697a6c",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  modalRow: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  modalStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  modalStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalClose: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
    minHeight: 48,
  },
  modalCloseText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  dayBlock: {
    marginTop: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 12,
  },
  dayTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
});