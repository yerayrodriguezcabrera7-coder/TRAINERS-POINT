import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Pressable,
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

const COLORS = {
  primary: "#ed691d",
  primaryDark: "#c45612",
  success: "#386a48",
  warning: "#9b5b12",
  danger: "#a12d23",
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
  const active = useRef(true), inFlight = useRef(false);

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

  const tabs = [
    { key: "reservas", label: "Reservas" },
    { key: "bonos", label: "Mis bonos" },
    { key: "medidas", label: "Medidas" },
    { key: "plan", label: "Plan" },
    { key: "perfil", label: "Perfil" },
  ];

  return (
    <View style={s.page}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.brand}>
            <Text style={s.orange}>T.</Text> trainerspoint
          </Text>
          <Text style={s.greeting}>
            Hola, {user.name || user.username}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={s.logout}
        >
          <Text style={s.logoutText}>Salir</Text>
        </Pressable>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Tabs */}
        <View style={s.tabBar}>
          {tabs.map(t => (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
              onPress={() => setTab(t.key as typeof tab)}
              style={[s.tab, tab === t.key && s.tabActive]}
            >
              <Text
                style={[s.tabText, tab === t.key && s.tabTextActive]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {error && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {/* ===================== RESERVAS ===================== */}
        {tab === "reservas" && (
          <View style={s.section}>
            {/* Próxima cita */}
            {upcoming.length > 0 && (
              <View style={s.heroCard}>
                <Text style={s.heroLabel}>Tu próxima cita</Text>
                <Text style={s.heroService}>
                  {serviceName(upcoming[0].serviceId)}
                </Text>
                <Text style={s.heroDate}>
                  {formatDate(upcoming[0].date).replace(/^\w/, c => c.toUpperCase())}
                </Text>
                <Text style={s.heroTime}>
                  {upcoming[0].start} – {upcoming[0].end}
                </Text>
                <Text style={s.heroTrainer}>
                  {data?.employees.find(e => e.id === upcoming[0].employeeId)
                    ?.name || "Pendiente de asignar"}
                </Text>
                {upcoming[0].centerName && (
                  <Text style={s.heroCenter}>
                    📍 {upcoming[0].centerName}
                  </Text>
                )}
                <Text style={s.heroDays}>
                  {daysUntil(upcoming[0].date) === 0
                    ? "¡Es hoy!"
                    : `Faltan ${daysUntil(upcoming[0].date)} días`}
                </Text>
              </View>
            )}

            {/* Lista de próximas */}
            {upcoming.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Próximas reservas ({upcoming.length})</Text>
                {upcoming.map(b => (
                  <Pressable
                    key={b.id}
                    onPress={() => setSelectedBooking(b)}
                    style={s.itemCard}
                  >
                    <View style={s.itemLeft}>
                      <Text style={s.itemService}>
                        {serviceName(b.serviceId)}
                      </Text>
                      <Text style={s.itemDate}>
                        {formatDate(b.date).replace(/^\w/, c => c.toUpperCase())}
                      </Text>
                      <Text style={s.itemTime}>
                        {b.start} – {b.end}
                      </Text>
                      <Text style={s.itemTrainer}>
                        {data?.employees.find(e => e.id === b.employeeId)
                          ?.name || "Sin asignar"}
                      </Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: STATUS_BG[b.status] }]}>
                      <Text style={[s.statusText, { color: STATUS_BG[b.status] === "#fff3e0" ? COLORS.warning : STATUS_BG[b.status] === "#e8f5e9" ? COLORS.success : COLORS.textMuted }]}>
                        {STATUS_LABEL[b.status]}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}

            {/* Historial */}
            {past.length > 0 && (
              <>
                <Text style={s.sectionTitle}>
                  Historial ({past.length})
                </Text>
                {past.slice(0, 10).map(b => (
                  <Pressable
                    key={b.id}
                    onPress={() => setSelectedBooking(b)}
                    style={[s.itemCard, s.itemPast]}
                  >
                    <View style={s.itemLeft}>
                      <Text style={[s.itemService, s.itemServicePast]}>
                        {serviceName(b.serviceId)}
                      </Text>
                      <Text style={s.itemDate}>
                        {formatDate(b.date).replace(/^\w/, c => c.toUpperCase())}
                      </Text>
                      <Text style={s.itemTime}>
                        {b.start} – {b.end}
                      </Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: STATUS_BG[b.status] }]}>
                      <Text style={s.statusText}>{STATUS_LABEL[b.status]}</Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}

            {!loading && !upcoming.length && !past.length && (
              <View style={s.empty}>
                <Text>📅</Text>
                <Text style={s.emptyText}>
                  No hay reservas todavía.
                </Text>
                <Text style={s.emptySub}>
                  Contacta con recepción para reservar tu primera sesión.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ===================== BONOS ===================== */}
        {tab === "bonos" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Mis bonos activos</Text>
            {packages.length > 0 ? (
              packages
                .filter(p => p.isActive)
                .map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedPackage(p)}
                    style={s.bonoCard}
                  >
                    <View style={s.bonoHeader}>
                      <Text style={s.bonoTitle}>{p.serviceName}</Text>
                      <Text
                        style={[
                          s.bonoRemaining,
                          p.remainingSessions <= 2 && { color: COLORS.danger },
                        ]}
                      >
                        {p.remainingSessions}/{p.totalSessions} sesiones
                      </Text>
                    </View>
                    {p.expiresAt && (
                      <Text style={s.bonoExpiry}>
                        ⏰ Vence: {formatDate(p.expiresAt)}
                      </Text>
                    )}
                    {p.remainingSessions <= 2 && p.expiresAt && (
                      <Text style={s.bonoUrgent}>
                        ⚠️ Quedan pocas sesiones y se acerca la fecha de
                        caducidad.
                      </Text>
                    )}
                  </Pressable>
                ))
            ) : (
              <View style={s.empty}>
                <Text>🎫</Text>
                <Text style={s.emptyText}>No tienes bonos activos.</Text>
                <Text style={s.emptySub}>
                  Pregunta en recepción sobre los bonos disponibles.
                </Text>
              </View>
            )}
            {!loading && packages.filter(p => p.isActive).length > 0 && (
              <View style={s.note}>
                <Text>
                  Para contratar bonos o renovar, contacta con recepción.
                  Las sesiones se gestionan desde el centro.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ===================== MEDIDAS ===================== */}
        {tab === "medidas" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              Mis medidas ({measurements.length})
            </Text>
            {measurements.length > 0 ? (
              measurements
                .slice(0, 5)
                .map(m => (
                  <Pressable
                    key={m.id}
                    onPress={() => setSelectedMeasurement(m)}
                    style={s.measureCard}
                  >
                    <Text style={s.measureDate}>
                      {formatDate(m.measuredAt).replace(/^\w/, c => c.toUpperCase())}
                    </Text>
                    <View style={s.measureGrid}>
                      {m.weight && (
                        <View style={s.measureItem}>
                          <Text style={s.measureValue}>{m.weight} kg</Text>
                          <Text style={s.measureLabel}>Peso</Text>
                        </View>
                      )}
                      {m.waist && (
                        <View style={s.measureItem}>
                          <Text style={s.measureValue}>{m.waist} cm</Text>
                          <Text style={s.measureLabel}>Cintura</Text>
                        </View>
                      )}
                      {m.hip && (
                        <View style={s.measureItem}>
                          <Text style={s.measureValue}>{m.hip} cm</Text>
                          <Text style={s.measureLabel}>Cadera</Text>
                        </View>
                      )}
                      {m.chest && (
                        <View style={s.measureItem}>
                          <Text style={s.measureValue}>{m.chest} cm</Text>
                          <Text style={s.measureLabel}>Pecho</Text>
                        </View>
                      )}
                      {m.arm && (
                        <View style={s.measureItem}>
                          <Text style={s.measureValue}>{m.arm} cm</Text>
                          <Text style={s.measureLabel}>Brazo</Text>
                        </View>
                      )}
                      {m.leg && (
                        <View style={s.measureItem}>
                          <Text style={s.measureValue}>{m.leg} cm</Text>
                          <Text style={s.measureLabel}>Pierna</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))
            ) : (
              <View style={s.empty}>
                <Text>📏</Text>
                <Text style={s.emptyText}>
                  Aún no hay medidas registradas.
                </Text>
                <Text style={s.emptySub}>
                  El centro puede añadir tus medidas de progreso.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ===================== PLAN ===================== */}
        {tab === "plan" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              Mi plan de entrenamiento ({trainingPlans.length})
            </Text>
            {trainingPlans.length > 0 ? (
              trainingPlans
                .filter(p => p.status === "ACTIVO")
                .map(plan => (
                  <Pressable
                    key={plan.id}
                    onPress={() => setSelectedPlan(plan)}
                    style={s.planCard}
                  >
                    <Text style={s.planTitle}>{plan.name}</Text>
                    {plan.goals && (
                      <Text style={s.planGoals}>{plan.goals}</Text>
                    )}
                    {plan.startsAt && (
                      <Text style={s.planDates}>
                        Desde {formatDate(plan.startsAt)}
                      </Text>
                    )}
                    {plan.endsAt && (
                      <Text style={s.planDates}>
                        Hasta {formatDate(plan.endsAt)}
                      </Text>
                    )}
                    {plan.details?.days && plan.details.days.length > 0 && (
                      <Text style={s.planDays}>
                        {plan.details.days.length} días de rutina
                      </Text>
                    )}
                  </Pressable>
                ))
            ) : (
              <View style={s.empty}>
                <Text>📋</Text>
                <Text style={s.emptyText}>
                  No tienes planes de entrenamiento activos.
                </Text>
                <Text style={s.emptySub}>
                  Pregúntale a tu entrenador sobre un plan personalizado.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ===================== PERFIL ===================== */}
        {tab === "perfil" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Mi perfil</Text>
            {profile ? (
              <View style={s.profileCard}>
                <View style={s.profileAvatar}>
                  <Text style={s.profileInitials}>
                    {(profile.firstName || user.name || user.username || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>
                <Text style={s.profileName}>
                  {profile.firstName} {profile.lastName}
                </Text>
                {profile.email && (
                  <Text style={s.profileInfo}>{profile.email}</Text>
                )}
                {profile.phone && (
                  <Text style={s.profileInfo}>
                    📞 {profile.phone}
                  </Text>
                )}
                {profile.status && (
                  <View style={s.profileStatus}>
                    <Text style={s.profileStatusText}>
                      {profile.status === "ACTIVO"
                        ? "✓ Activo"
                        : profile.status === "BAJA"
                        ? "⊘ Dado de baja"
                        : profile.status === "LEAD"
                        ? "◉ Lead"
                        : profile.status}
                    </Text>
                  </View>
                )}
                {profile.objective && (
                  <View style={s.profileObjectives}>
                    <Text style={s.profileObjectivesTitle}>
                      Mi objetivo
                    </Text>
                    <Text style={s.profileObjectiveText}>
                      {profile.objective}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={s.profilePlaceholder}>
                <Text style={s.profileInitials}>
                  {(user.name || user.username || "U").charAt(0).toUpperCase()}
                </Text>
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

        {/* Footer */}
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
              Actualizado a las {updatedAt}.
            </Text>
          )}
          <Text style={s.footerNote}>
            Para solicitar cambios en tus citas, bonos o medidas, contacta
            con recepción.
          </Text>
        </View>
      </ScrollView>

      {/* ===================== MODALES ===================== */}
      {/* Reserva detalle */}
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
                  {data?.employees.find(e => e.id === selectedBooking.employeeId)
                    ?.name || "Pendiente de asignar"}
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

      {/* Medida detalle */}
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
                  <Text style={s.modalRow}>
                    ⚖️ Peso: {selectedMeasurement.weight} kg
                  </Text>
                )}
                {selectedMeasurement.waist && (
                  <Text style={s.modalRow}>
                    📏 Cintura: {selectedMeasurement.waist} cm
                  </Text>
                )}
                {selectedMeasurement.hip && (
                  <Text style={s.modalRow}>
                    📏 Cadera: {selectedMeasurement.hip} cm
                  </Text>
                )}
                {selectedMeasurement.chest && (
                  <Text style={s.modalRow}>
                    📏 Pecho: {selectedMeasurement.chest} cm
                  </Text>
                )}
                {selectedMeasurement.arm && (
                  <Text style={s.modalRow}>
                    📏 Brazo: {selectedMeasurement.arm} cm
                  </Text>
                )}
                {selectedMeasurement.leg && (
                  <Text style={s.modalRow}>
                    📏 Pierna: {selectedMeasurement.leg} cm
                  </Text>
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

      {/* Plan detalle */}
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

      {/* Bono detalle */}
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

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerLeft: { flex: 1 },
  brand: { color: COLORS.text, fontSize: 22, fontWeight: "800", letterSpacing: -1 },
  orange: { color: COLORS.primary },
  greeting: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  logout: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  logoutText: { color: COLORS.danger, fontWeight: "700", fontSize: 13 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 6, paddingBottom: 40 },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 3,
    gap: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  tabActive: { backgroundColor: COLORS.text },
  tabText: { color: COLORS.textMuted, fontSize: 11, fontWeight: "600" },
  tabTextActive: { color: "#fff", fontSize: 11, fontWeight: "700" },

  // Hero card
  heroCard: {
    backgroundColor: COLORS.text,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  heroLabel: { color: "#a0aec0", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  heroService: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 6 },
  heroDate: { color: "#cbd5e1", fontSize: 14, marginTop: 8 },
  heroTime: { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 2 },
  heroTrainer: { color: "#a0aec0", fontSize: 12, marginTop: 4 },
  heroCenter: { color: "#cbd5e1", fontSize: 12, marginTop: 2 },
  heroDays: { color: COLORS.primary, fontSize: 13, fontWeight: "700", marginTop: 8, backgroundColor: "rgba(237,105,29,0.15)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },

  // Sections
  section: { gap: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700", marginTop: 8, marginBottom: 4 },

  // Cards
  itemCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemPast: { opacity: 0.7 },
  itemLeft: { flex: 1 },
  itemService: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  itemServicePast: { color: COLORS.textMuted },
  itemDate: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  itemTime: { color: COLORS.text, fontSize: 13, fontWeight: "600", marginTop: 1 },
  itemTrainer: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },

  // Status badge
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginLeft: 10 },
  statusText: { fontSize: 11, fontWeight: "700" },

  // Empty
  empty: { alignItems: "center", paddingVertical: 30, gap: 8 },
  emptyText: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  emptySub: { color: COLORS.textMuted, fontSize: 13, textAlign: "center" },

  // Bono
  bonoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  bonoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bonoTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  bonoRemaining: { color: COLORS.success, fontSize: 14, fontWeight: "700" },
  bonoExpiry: { color: COLORS.textMuted, fontSize: 12, marginTop: 6 },
  bonoUrgent: { color: COLORS.danger, fontSize: 12, fontWeight: "600", marginTop: 6 },

  // Measures
  measureCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  measureDate: { color: COLORS.text, fontSize: 14, fontWeight: "700", marginBottom: 10 },
  measureGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  measureItem: { flexBasis: "32%", backgroundColor: COLORS.bg, borderRadius: 10, padding: 10, alignItems: "center" },
  measureValue: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  measureLabel: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },

  // Plan
  planCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  planTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  planGoals: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, fontStyle: "italic" },
  planDates: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  planDays: { color: COLORS.primary, fontSize: 12, fontWeight: "600", marginTop: 6 },

  // Profile
  profileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  profileInitials: { color: "#fff", fontSize: 28, fontWeight: "800" },
  profileName: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  profileInfo: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  profileStatus: { marginTop: 8, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#e8f5e9" },
  profileStatusText: { color: COLORS.success, fontSize: 12, fontWeight: "700" },
  profileObjectives: { marginTop: 16, width: "100%" },
  profileObjectivesTitle: { color: COLORS.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  profileObjectiveText: { color: COLORS.text, fontSize: 14, lineHeight: 22, fontStyle: "italic" },
  profilePlaceholder: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  profilePlaceholderText: { color: COLORS.textMuted, fontSize: 13, marginTop: 10, textAlign: "center" },

  // Error
  errorBanner: {
    backgroundColor: "#fff0ec",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  errorText: { color: COLORS.danger, fontSize: 13 },

  // Note
  note: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
  },

  // Footer
  footer: { marginTop: 20, alignItems: "center", gap: 8 },
  refreshBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    minWidth: 200,
    alignItems: "center",
  },
  refreshText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  lastUpdate: { color: COLORS.textMuted, fontSize: 11 },
  footerNote: { color: COLORS.textMuted, fontSize: 11, textAlign: "center", lineHeight: 18, marginTop: 4, paddingHorizontal: 20 },

  // Modal
  overlay: { flex: 1, backgroundColor: "rgba(16,32,24,0.5)", justifyContent: "center", padding: 20 },
  panel: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: "hidden",
  },
  modalScroll: { padding: 24, gap: 14 },
  modalEyebrow: { color: "#697a6c", fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: "800", marginTop: 4 },
  modalRow: { color: COLORS.textMuted, fontSize: 14, lineHeight: 22 },
  modalStatus: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: "flex-start", marginTop: 4 },
  modalStatusText: { fontSize: 12, fontWeight: "700" },
  modalClose: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16, minHeight: 48 },
  modalCloseText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  dayBlock: { marginTop: 12, backgroundColor: COLORS.bg, borderRadius: 10, padding: 12 },
  dayTitle: { color: COLORS.text, fontSize: 14, fontWeight: "700", marginBottom: 6 },
  exerciseText: { color: COLORS.textMuted, fontSize: 12, lineHeight: 20, marginBottom: 3 },
});