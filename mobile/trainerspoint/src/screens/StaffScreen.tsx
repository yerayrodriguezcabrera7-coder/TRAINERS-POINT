import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { ApiClient } from "../../../shared/api";
import type { Booking, CalendarData, Identity } from "../../../shared/types";
import { localDay } from "../../../shared/calendar";

// ── Helpers ──────────────────────────────────────────────────────────────────

const statuses: Record<Booking["status"], string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Realizada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No asistió",
};

const statusColors: Record<Booking["status"], string> = {
  PENDING: "#9b5b12",
  CONFIRMED: "#386a48",
  COMPLETED: "#68796e",
  CANCELLED: "#a12d23",
  NO_SHOW: "#9b5b12",
};

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function moveDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return localDay(date);
}

// ── Reusable components ──────────────────────────────────────────────────────

function BigChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.bigChip,
        selected && styles.bigChipSelected,
      ]}
    >
      <Text
        style={[styles.bigChipText, selected && styles.whiteText]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export function StaffScreen({
  api,
  user,
  onLogout,
}: {
  api: ApiClient;
  user: Identity;
  onLogout: () => void;
}) {
  const office = user.role === "RECEPTION" || user.role === "ADMIN";

  const [data, setData] = useState<CalendarData | null>(null);
  const [tab, setTab] = useState<"agenda" | "clients" | "pending">("agenda");
  const [date, setDate] = useState(localDay);
  const [employee, setEmployee] = useState("all");
  const [center, setCenter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const active = useRef(true);
  const inFlight = useRef(false);

  const load = useCallback(
    async (showSpinner = true) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (showSpinner) setLoading(true);
      try {
        const result = await api.getStaffCalendar();
        if (active.current) {
          setData(result);
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
              : "No se pudo actualizar la agenda."
          );
        }
      } finally {
        inFlight.current = false;
        if (active.current) setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    active.current = true;
    void load();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void load(false);
    }, 15000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, [load]);

  // ── Data helpers ─────────────────────────────────────────────────────────

  const clients = data?.clients || [];
  const bookings = data?.bookings || [];

  const clientName = (booking: Booking) =>
    clients.find((c) => c.id === booking.clientId)?.name || "Cliente";
  const serviceName = (booking: Booking) =>
    data?.services.find((s) => s.id === booking.serviceId)?.name || "Servicio";
  const employeeName = (booking: Booking) =>
    data?.employees.find((p) => p.id === booking.employeeId)?.name ||
    "Pendiente de asignar";
  const serviceColor = (booking: Booking) =>
    data?.services.find((s) => s.id === booking.serviceId)?.color || "#ed691d";

  // Pending = needs reschedule OR no employee assigned + pending/confirmed
  const pending = bookings.filter(
    (b) =>
      b.needsReschedule ||
      (!b.employeeId && ["PENDING", "CONFIRMED"].includes(b.status))
  );

  const term = search.trim().toLocaleLowerCase("es");

  const visible =
    (tab === "pending" ? pending : bookings.filter((b) => b.date === date))
      .filter(
        (b) =>
          (!office || employee === "all" || b.employeeId === employee) &&
          (center === "all" || b.centerId === center) &&
          (
            !term ||
            `${clientName(b)} ${serviceName(b)} ${employeeName(b)}`
              .toLocaleLowerCase("es")
              .includes(term)
          )
      )
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

  const visibleClients = clients.filter(
    (c) =>
      !term ||
      `${c.name} ${c.phone || ""} ${c.email || ""}`
        .toLocaleLowerCase("es")
        .includes(term)
  );

  // ── Tab bar ──────────────────────────────────────────────────────────────

  const tabItems: Array<{
    value: "agenda" | "pending" | "clients";
    label: string;
    icon: string;
    badge?: number;
  }> = [
    { value: "agenda", label: "Agenda", icon: "calendar" },
    ...(office
      ? [
          {
            value: "pending" as const,
            label: "Pendientes",
            icon: "alert-circle",
            badge: pending.length || undefined,
          },
        ]
      : []),
    { value: "clients", label: office ? "Clientes" : "Mis clientes", icon: "users" },
  ];

  // ── Day-chip helpers ─────────────────────────────────────────────────────

  const today = localDay();
  const daysRange: { key: string; label: string }[] = [];
  for (let i = -7; i <= 7; i++) {
    const d = moveDay(today, i);
    const dateObj = new Date(`${d}T12:00:00`);
    daysRange.push({
      key: d,
      label: dateObj.toLocaleDateString("es-ES", {
        weekday: "short",
        day: "numeric",
      }),
    });
  }

  const [dayScrollOffset, setDayScrollOffset] = useState(0);
  const dayScrollRef = useRef<any>(null);

  // Auto-scroll to show today or selected day
  useEffect(() => {
    if (dayScrollRef.current) {
      const idx = daysRange.findIndex((d) => d.key === date);
      if (idx !== -1 && dayScrollRef.current.scrollTo) {
        // Try to center the selected day chip
        const xPos = Math.max(0, idx * 72 - 100);
        dayScrollRef.current.scrollTo({ x: xPos, animated: true });
      }
    }
  }, [date]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brand}>
            <Text style={styles.orange}>T.</Text> trainerspoint
          </Text>
          <Text style={styles.role}>
            {office
              ? user.role === "ADMIN"
                ? "Administración"
                : "Recepción"
              : "Entrenador / Trabajador"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={styles.logoutBtn}
        >
          <Feather name="log-out" size={20} color="#ed691d" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Welcome */}
        <Text style={styles.greeting}>Hola, {user.name || user.username}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {office ? "El centro, al día." : "Tu jornada, clara."}
        </Text>

        {/* Tab bar */}
        <View style={styles.tabBar} role="tablist">
          {tabItems.map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.value }}
              accessibilityLabel={item.label}
              onPress={() => {
                setTab(item.value);
                setSearch("");
              }}
              style={[
                styles.tabButton,
                tab === item.value && styles.tabActive,
              ]}
            >
              <Feather
                name={item.icon as any}
                size={18}
                color={tab === item.value ? "#fff" : "#68796e"}
              />
              <Text
                style={[
                  styles.tabLabel,
                  tab === item.value && styles.whiteText,
                ]}
              >
                {item.label}
              </Text>
              {item.badge && item.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Pending banner */}
        {office && pending.length > 0 && tab !== "pending" && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setTab("pending")}
            style={styles.pendingBanner}
          >
            <View style={styles.bannerIconWrap}>
              <Text style={styles.bannerEmoji}>⚠️</Text>
            </View>
            <View style={styles.bannerTextWrap}>
              <Text style={styles.bannerTitle}>
                {pending.length} reserva{pending.length !== 1 ? "s" : ""}{" "}
                {pending.length === 1 ? "requiere" : "requieren"} atención
              </Text>
              <Text style={styles.bannerSub}>
                Toca para ver las reservas pendientes de reprogramar
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#fff" />
          </Pressable>
        )}

        {/* Error */}
        {!!error && (
          <View style={styles.errorView}>
            <Feather name="alert-triangle" size={16} color="#a12d23" />
            <Text style={styles.errorText}>
              {error} {data ? "Se conservan los últimos datos recibidos." : ""}
            </Text>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchRow}>
          <Feather name="search" size={20} color="#9fa89d" />
          <TextInput
            accessibilityLabel={
              tab === "clients" ? "Buscar cliente" : "Buscar reserva"
            }
            placeholder={
              tab === "clients"
                ? "Buscar por nombre, teléfono o correo"
                : "Buscar cliente, servicio o trabajador"
            }
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholderTextColor="#9fa89d"
          />
          {search ? (
            <Pressable
              onPress={() => setSearch("")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={20} color="#1d302e" />
            </Pressable>
          ) : null}
        </View>

        {/* ── Agenda tab ── */}
        {tab === "agenda" && (
          <>
            {/* Day chips */}
            <View style={styles.daySection}>
              <View style={styles.dayScrollRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Día anterior"
                  style={styles.dayArrow}
                  onPress={() => setDate((d) => moveDay(d, -1))}
                >
                  <Feather name="chevron-left" size={20} color="#1d302e" />
                </Pressable>
                <ScrollView
                  ref={dayScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayChips}
                  onScroll={(e) =>
                    setDayScrollOffset(e.nativeEvent.contentOffset.x)
                  }
                  scrollEventThrottle={16}
                >
                  {daysRange.map((d) => {
                    const isToday = d.key === today;
                    const isSelected = d.key === date;
                    return (
                      <Pressable
                        key={d.key}
                        accessibilityRole="button"
                        accessibilityLabel={d.label}
                        onPress={() => setDate(d.key)}
                        style={[
                          styles.dayChip,
                          isSelected && styles.dayChipSelected,
                          isToday && !isSelected && styles.dayChipToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayChipLabel,
                            (isSelected || isToday) && styles.dayChipLabelBold,
                          ]}
                          numberOfLines={1}
                        >
                          {d.label}
                        </Text>
                        {isToday && (
                          <View style={styles.todayDot} />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Día siguiente"
                  style={styles.dayArrow}
                  onPress={() => setDate((d) => moveDay(d, 1))}
                >
                  <Feather name="chevron-right" size={20} color="#1d302e" />
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver hoy"
                style={styles.todayBtn}
                onPress={() => setDate(today)}
              >
                <Text style={styles.todayLink}>Ir a hoy</Text>
              </Pressable>
            </View>

            {/* Employee filter */}
            {office && (
              <View style={styles.filterSection}>
                <Text style={styles.filterTitle}>Trabajador</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  <BigChip
                    label="Todos"
                    selected={employee === "all"}
                    onPress={() => setEmployee("all")}
                  />
                  {data?.employees.map((person) => (
                    <BigChip
                      key={person.id}
                      label={person.name}
                      selected={employee === person.id}
                      onPress={() => setEmployee(person.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Center filter */}
            {(data?.centers?.length || 0) > 1 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterTitle}>Centro</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  <BigChip
                    label="Todos"
                    selected={center === "all"}
                    onPress={() => setCenter("all")}
                  />
                  {data?.centers?.map((c) => (
                    <BigChip
                      key={c.id}
                      label={c.name}
                      selected={center === c.id}
                      onPress={() => setCenter(c.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Section title */}
            <Text style={styles.sectionTitle}>
              Reservas del día · {visible.length}
            </Text>

            {/* Booking cards */}
            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Cargando agenda"
                color="#ed691d"
                size="large"
              />
            ) : visible.length === 0 ? (
              <Text style={styles.empty}>
                No hay reservas para este día con estos filtros.
              </Text>
            ) : (
              visible.map((booking) => (
                <Pressable
                  key={booking.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver reserva de ${clientName(booking)}`}
                  onPress={() => setSelected(booking)}
                  style={styles.bookingCard}
                >
                  {/* Color side bar */}
                  <View
                    style={[
                      styles.colorBar,
                      { backgroundColor: serviceColor(booking) },
                    ]}
                  />

                  <View style={styles.cardContent}>
                    {/* Left side */}
                    <View style={styles.cardLeft}>
                      <Text style={styles.clientName}>
                        {clientName(booking)}
                      </Text>
                      <Text style={styles.serviceName}>
                        {serviceName(booking)}
                      </Text>
                      <Text style={styles.timeRange}>
                        {booking.start} – {booking.end}
                      </Text>
                      <Text style={styles.employeeText}>
                        {employeeName(booking)}
                      </Text>
                      <Text style={styles.centerText}>
                        {booking.centerName || "Centro pendiente de consultar"}
                      </Text>
                    </View>

                    {/* Right side — status */}
                    <View style={styles.cardRight}>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              statusColors[booking.status] + "18",
                            borderColor: statusColors[booking.status],
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: statusColors[booking.status] },
                          ]}
                        >
                          {statuses[booking.status]}
                        </Text>
                      </View>
                      {booking.needsReschedule && (
                        <View style={styles.warningBadge}>
                          <Text style={styles.warningText}>
                            Re-programar
                          </Text>
                        </View>
                      )}
                      {!booking.employeeId && !booking.needsReschedule && (
                        <View style={styles.warningBadge}>
                          <Text style={styles.warningText}>
                            Sin asignar
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {/* ── Pending tab ── */}
        {tab === "pending" && (
          <>
            <View style={styles.pendingTabHeader}>
              <View style={styles.pendingTabIcon}>
                <Text style={styles.pendingTabEmoji}>⚠️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingTabTitle}>
                  Requieren atención
                </Text>
                <Text style={styles.pendingTabSub}>
                  {pending.length} reserva
                  {pending.length !== 1 ? "s" : ""} sin asignar o pendientes
                  de reprogramación
                </Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Cargando pendientes"
                color="#ed691d"
                size="large"
              />
            ) : pending.length === 0 ? (
              <Text style={styles.empty}>
                No hay reservas pendientes con estos filtros.
              </Text>
            ) : (
              visible.map((booking) => (
                <Pressable
                  key={booking.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver reserva de ${clientName(booking)}`}
                  onPress={() => setSelected(booking)}
                  style={styles.bookingCard}
                >
                  <View
                    style={[
                      styles.colorBar,
                      { backgroundColor: serviceColor(booking) },
                    ]}
                  />
                  <View style={styles.cardContent}>
                    <View style={styles.cardLeft}>
                      <Text style={styles.clientName}>
                        {clientName(booking)}
                      </Text>
                      <Text style={styles.serviceName}>
                        {serviceName(booking)}
                      </Text>
                      <Text style={styles.timeRange}>
                        {booking.start} – {booking.end} · {booking.date}
                      </Text>
                      <Text style={styles.employeeText}>
                        {employeeName(booking)}
                      </Text>
                      <Text style={styles.centerText}>
                        {booking.centerName || "Centro pendiente de consultar"}
                      </Text>
                    </View>
                    <View style={styles.cardRight}>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              statusColors[booking.status] + "18",
                            borderColor: statusColors[booking.status],
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: statusColors[booking.status] },
                          ]}
                        >
                          {statuses[booking.status]}
                        </Text>
                      </View>
                      <View style={styles.warningBadge}>
                        <Text style={styles.warningText}>
                          {booking.needsReschedule
                            ? "Re-programar"
                            : "Sin asignar"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {/* ── Clients tab ── */}
        {tab === "clients" && (
          <>
            <Text style={styles.sectionTitle}>
              {office ? "Clientes del centro" : "Tus clientes"} ·{" "}
              {visibleClients.length}
            </Text>

            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Cargando clientes"
                color="#ed691d"
                size="large"
              />
            ) : visibleClients.length === 0 ? (
              <Text style={styles.empty}>No hay clientes que mostrar.</Text>
            ) : (
              visibleClients.map((client) => (
                <View key={client.id} style={styles.clientCard}>
                  <View style={styles.clientCardLeft}>
                    <Text style={styles.clientName}>{client.name}</Text>
                    {!!client.phone && (
                      <View style={styles.clientInfoRow}>
                        <Feather
                          name="phone"
                          size={14}
                          color="#9fa89d"
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.clientInfo}>{client.phone}</Text>
                      </View>
                    )}
                    {!!client.email && (
                      <View style={styles.clientInfoRow}>
                        <Feather
                          name="mail"
                          size={14}
                          color="#9fa89d"
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.clientInfo}>{client.email}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.clientCardRight}>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            {
                              ACTIVE: "#386a48",
                              INACTIVE: "#68796e",
                              BLOCKED: "#a12d23",
                            }[client.status || ""] + "18",
                          borderColor:
                            {
                              ACTIVE: "#386a48",
                              INACTIVE: "#68796e",
                              BLOCKED: "#a12d23",
                            }[client.status || ""] || "#68796e",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color:
                              {
                                ACTIVE: "#386a48",
                                INACTIVE: "#68796e",
                                BLOCKED: "#a12d23",
                              }[client.status || ""] || "#68796e",
                          },
                        ]}
                      >
                        {
                          {
                            ACTIVE: "Activo",
                            INACTIVE: "Inactivo",
                            BLOCKED: "Baja / bloqueado",
                          }[client.status || ""] || "Ficha del centro"
                        }
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Actualizar agenda"
            style={styles.refreshBtn}
            onPress={() => void load()}
          >
            <Feather
              name="refresh-cw"
              size={17}
              color="#1d302e"
            />
            <Text style={styles.refreshText}>Actualizar agenda</Text>
          </Pressable>

          {!!updatedAt && (
            <View style={styles.updatedRow}>
              <View style={styles.greenDot} />
              <Text style={styles.updatedText}>
                Actualizado a las {updatedAt}
              </Text>
            </View>
          )}

          <Text style={styles.note}>
            {office
              ? "La asignación, creación y modificación de citas se realizan en el panel de gestión del centro."
              : "Para solicitar cambios en una cita, contacta con recepción. La configuración y los permisos los gestiona administración."}
          </Text>
        </View>
      </ScrollView>

      {/* ── Detail modal ── */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalPanel}>
            {selected && (
              <>
                <ScrollView contentContainerStyle={styles.modalBody}>
                  <Text style={styles.modalEyebrow}>DETALLE DE LA RESERVA</Text>

                  <Text style={styles.modalClient}>
                    {clientName(selected)}
                  </Text>

                  <View style={styles.modalRow}>
                    <View style={styles.modalInfoBlock}>
                      <Text style={styles.modalLabel}>Servicio</Text>
                      <Text style={styles.modalValue}>
                        {serviceName(selected)}
                      </Text>
                    </View>
                    <View style={styles.modalInfoBlock}>
                      <Text style={styles.modalLabel}>Horario</Text>
                      <Text style={styles.modalValue}>
                        {dayLabel(selected.date)} · {selected.start} –{" "}
                        {selected.end}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.modalRow}>
                    <View style={styles.modalInfoBlock}>
                      <Text style={styles.modalLabel}>Trabajador</Text>
                      <Text style={styles.modalValue}>
                        {employeeName(selected)}
                      </Text>
                    </View>
                    <View style={styles.modalInfoBlock}>
                      <Text style={styles.modalLabel}>Estado</Text>
                      <View
                        style={[
                          styles.modalStatusBadge,
                          {
                            backgroundColor:
                              statusColors[selected.status] + "18",
                            borderColor: statusColors[selected.status],
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalStatusText,
                            { color: statusColors[selected.status] },
                          ]}
                        >
                          {statuses[selected.status]}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.modalInfoBlock}>
                    <Text style={styles.modalLabel}>Centro</Text>
                    <Text style={styles.modalValue}>
                      {selected.centerName || "Centro pendiente de consultar"}
                    </Text>
                    {selected.centerAddress && (
                      <Text style={styles.modalAddress}>
                        {selected.centerAddress}
                      </Text>
                    )}
                  </View>

                  {selected.needsReschedule && (
                    <View style={styles.modalWarning}>
                      <Text style={styles.modalWarningText}>
                        ⚠️ Esta reserva requiere reprogramación
                      </Text>
                    </View>
                  )}
                </ScrollView>

                <Pressable
                  accessibilityRole="button"
                  style={styles.closeBtn}
                  onPress={() => setSelected(null)}
                >
                  <Text style={styles.closeBtnText}>Cerrar detalle</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Page
  page: { flex: 1, backgroundColor: "#f6f6f0" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#1d302e",
  },
  headerLeft: { flex: 1 },
  brand: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -1 },
  orange: { color: "#ed691d" },
  role: { color: "#9fa89d", fontSize: 12, marginTop: 4, fontWeight: "500" },
  logoutBtn: {
    padding: 10,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  // Content container
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
    paddingBottom: 32,
  },

  // Greeting & title
  greeting: {
    color: "#697a6c",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  title: {
    color: "#1d302e",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.7,
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#e9ede3",
    padding: 5,
    borderRadius: 16,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    position: "relative",
  },
  tabActive: {
    backgroundColor: "#1d302e",
  },
  tabLabel: {
    color: "#506257",
    fontSize: 13,
    fontWeight: "600",
  },
  whiteText: { color: "#fff" },
  badge: {
    position: "absolute",
    top: 6,
    right: 8,
    backgroundColor: "#ed691d",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  // Pending banner
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ed691d",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  bannerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerEmoji: { fontSize: 22 },
  bannerTextWrap: { flex: 1 },
  bannerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  bannerSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginTop: 2,
  },

  // Error
  errorView: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    backgroundColor: "#fff0ec",
    borderRadius: 14,
  },
  errorText: { color: "#a12d23", fontSize: 13, flex: 1, lineHeight: 20 },

  // Search
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#dce2d4",
    paddingHorizontal: 14,
    minHeight: 52,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#1d302e",
    padding: 0,
  },

  // Day section
  daySection: { gap: 10 },
  dayScrollRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayArrow: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dce2d4",
  },
  dayChips: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "#fff",
  },
  dayChipSelected: {
    backgroundColor: "#1d302e",
    borderColor: "#1d302e",
  },
  dayChipToday: {
    borderColor: "#ed691d",
  },
  dayChipLabel: {
    color: "#68796e",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  dayChipLabelBold: {
    color: "#fff",
    fontWeight: "700",
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ed691d",
    marginTop: 4,
  },
  todayBtn: { minHeight: 36, alignItems: "center", justifyContent: "center" },
  todayLink: { color: "#ed691d", fontSize: 13, fontWeight: "700" },

  // Filter section
  filterSection: { gap: 8 },
  filterTitle: { color: "#64766b", fontSize: 13, fontWeight: "700" },
  chipRow: { gap: 8 },
  bigChip: {
    borderWidth: 1.5,
    borderColor: "#dce2d4",
    backgroundColor: "#fff",
    borderRadius: 16,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  bigChipSelected: {
    backgroundColor: "#1d302e",
    borderColor: "#1d302e",
  },
  bigChipText: { color: "#506257", fontSize: 13, fontWeight: "600" },

  // Section title
  sectionTitle: {
    color: "#1d302e",
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  // ── Booking card ──
  bookingCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e6de",
    minHeight: 120,
    overflow: "hidden",
    shadowColor: "#1d302e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  colorBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    flex: 1,
  },
  cardLeft: { flex: 1, gap: 3 },
  cardRight: { alignItems: "flex-end", gap: 6 },

  // Inside booking card
  clientName: { color: "#1d302e", fontSize: 18, fontWeight: "700", lineHeight: 24 },
  serviceName: { color: "#68796e", fontSize: 15, fontWeight: "500" },
  timeRange: { color: "#1d302e", fontSize: 20, fontWeight: "700", marginTop: 2 },
  employeeText: { color: "#6e7b71", fontSize: 13, fontWeight: "500", marginTop: 2 },
  centerText: { color: "#9fa89d", fontSize: 12, marginTop: 1 },

  // Status & warning badges
  statusBadge: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: { fontSize: 12, fontWeight: "700" },
  warningBadge: {
    backgroundColor: "#fff0ec",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  warningText: { color: "#9b5b12", fontSize: 11, fontWeight: "700" },

  // Pending tab header
  pendingTabHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#fff5f0",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f0ddd0",
  },
  pendingTabIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ed691d",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingTabEmoji: { fontSize: 22 },
  pendingTabTitle: { color: "#1d302e", fontSize: 16, fontWeight: "700" },
  pendingTabSub: { color: "#6e7b71", fontSize: 13, marginTop: 2 },

  // ── Client card ──
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e6de",
    padding: 16,
    gap: 12,
    shadowColor: "#1d302e",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  clientCardLeft: { flex: 1, gap: 6 },
  clientCardRight: {},
  clientInfoRow: { flexDirection: "row", alignItems: "center" },
  clientInfo: { color: "#6e7b71", fontSize: 14, fontWeight: "500" },

  // Empty
  empty: { color: "#6d7b71", paddingVertical: 28, fontSize: 15, lineHeight: 24, textAlign: "center" },

  // Refresh
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#dce2d4",
    borderRadius: 14,
    paddingVertical: 14,
    minHeight: 50,
  },
  refreshText: { color: "#1d302e", fontSize: 14, fontWeight: "700" },

  // Footer
  footer: { gap: 10, paddingTop: 8 },
  updatedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#386a48",
  },
  updatedText: { color: "#6e7b71", fontSize: 12, fontWeight: "500" },
  note: {
    color: "#9fa89d",
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
    paddingTop: 4,
  },

  // ── Modal ──
  overlay: {
    flex: 1,
    backgroundColor: "rgba(16,32,24,0.6)",
    justifyContent: "flex-end",
  },
  modalPanel: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: "24% 24% 0 0",
    overflow: "hidden",
  },
  modalBody: {
    padding: 24,
    gap: 18,
    paddingBottom: 16,
  },
  modalEyebrow: {
    color: "#697a6c",
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  modalClient: {
    color: "#1d302e",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  modalRow: { flexDirection: "row", gap: 12 },
  modalInfoBlock: { gap: 4 },
  modalLabel: { color: "#9fa89d", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  modalValue: { color: "#1d302e", fontSize: 15, fontWeight: "600", lineHeight: 22 },
  modalAddress: { color: "#6e7b71", fontSize: 13, fontWeight: "500", marginTop: 2 },
  modalStatusBadge: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  modalStatusText: { fontSize: 13, fontWeight: "700" },
  modalWarning: {
    backgroundColor: "#fff0ec",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f0ddd0",
  },
  modalWarningText: { color: "#9b5b12", fontSize: 14, fontWeight: "700" },
  closeBtn: {
    backgroundColor: "#1d302e",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});