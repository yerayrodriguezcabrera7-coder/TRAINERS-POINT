import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { ApiClient } from "../../../shared/api";
import type { Booking, CalendarData, Identity } from "../../../shared/types";
import { localDay } from "../../../shared/calendar";

const statuses: Record<Booking["status"], string> = { PENDING: "Pendiente", CONFIRMED: "Confirmada", COMPLETED: "Realizada", CANCELLED: "Cancelada", NO_SHOW: "No asistió" };
const statusColors: Record<Booking["status"], string> = { PENDING: "#9b5b12", CONFIRMED: "#386a48", COMPLETED: "#68796e", CANCELLED: "#a12d23", NO_SHOW: "#9b5b12" };
function dayLabel(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }); }
function moveDay(day: string, delta: number) { const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + delta); return localDay(date); }

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.chip, selected && s.selectedChip]}><Text style={[s.chipText, selected && s.white]}>{label}</Text></Pressable>;
}

export function StaffScreen({ api, user, onLogout }: { api: ApiClient; user: Identity; onLogout: () => void }) {
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
  const active = useRef(true), inFlight = useRef(false);
  const load = useCallback(async (showSpinner = true) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (showSpinner) setLoading(true);
    try {
      const result = await api.getStaffCalendar();
      if (active.current) { setData(result); setError(""); setUpdatedAt(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })); }
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : "No se pudo actualizar la agenda.");
    } finally { inFlight.current = false; if (active.current) setLoading(false); }
  }, [api]);
  useEffect(() => {
    active.current = true;
    void load();
    const timer = setInterval(() => { if (AppState.currentState === "active") void load(false); }, 15000);
    return () => { active.current = false; clearInterval(timer); };
  }, [load]);

  const clients = data?.clients || [], bookings = data?.bookings || [];
  const clientName = (booking: Booking) => clients.find(client => client.id === booking.clientId)?.name || "Cliente";
  const serviceName = (booking: Booking) => data?.services.find(service => service.id === booking.serviceId)?.name || "Servicio";
  const employeeName = (booking: Booking) => data?.employees.find(person => person.id === booking.employeeId)?.name || "Pendiente de asignar";
  const pending = bookings.filter(booking => booking.needsReschedule || !booking.employeeId && ["PENDING", "CONFIRMED"].includes(booking.status));
  const term = search.trim().toLocaleLowerCase("es");
  const visible = (tab === "pending" ? pending : bookings.filter(booking => booking.date === date))
    .filter(booking => (!office || employee === "all" || booking.employeeId === employee) &&
      (center === "all" || booking.centerId === center) &&
      (!term || `${clientName(booking)} ${serviceName(booking)} ${employeeName(booking)}`.toLocaleLowerCase("es").includes(term)))
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  const visibleClients = clients.filter(client => !term || `${client.name} ${client.phone || ""} ${client.email || ""}`.toLocaleLowerCase("es").includes(term));
  const tabs: Array<{ value: "agenda" | "pending" | "clients"; label: string }> = [
    { value: "agenda", label: "Agenda" },
    ...(office ? [{ value: "pending" as const, label: `Pendientes · ${pending.length}` }] : []),
    { value: "clients", label: office ? "Clientes" : "Mis clientes" },
  ];

  return <View style={s.page}>
    <View style={s.header}><View style={s.flex}><Text style={s.brand}><Text style={s.orange}>T.</Text> trainerspoint</Text><Text style={s.role}>{office ? user.role === "ADMIN" ? "Administración" : "Recepción" : "Entrenador / Trabajador"}</Text></View><Pressable accessibilityRole="button" onPress={onLogout} style={s.logout}><Text style={s.link}>Salir</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>HOLA, {user.name || user.username}</Text>
      <Text accessibilityRole="header" style={s.title}>{office ? "El centro, al día." : "Tu jornada, clara."}</Text>
      <Text style={s.muted}>{office ? "Consulta las agendas, los clientes y las citas que necesitan atención." : "Tus citas asignadas y tus clientes. Comprueba el centro de cada sesión."}</Text>
      <View accessibilityRole="tablist" style={s.tabs}>{tabs.map(item => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: tab === item.value }} accessibilityLabel={item.label} onPress={() => { setTab(item.value); setSearch(""); }} style={[s.tab, tab === item.value && s.activeTab]}><Text style={[s.tabText, tab === item.value && s.white]}>{item.label}</Text></Pressable>)}</View>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error} {data ? "Se conservan los últimos datos recibidos." : ""}</Text>}
      <TextInput accessibilityLabel={tab === "clients" ? "Buscar cliente" : "Buscar reserva"} placeholder={tab === "clients" ? "Buscar por nombre, teléfono o correo" : "Buscar cliente, servicio o trabajador"} value={search} onChangeText={setSearch} style={s.input} />
      {tab === "agenda" && <View style={s.dates}>
        <Pressable accessibilityRole="button" accessibilityLabel="Día anterior" style={s.arrow} onPress={() => setDate(day => moveDay(day, -1))}><Feather name="chevron-left" size={20} color="#1d302e" aria-hidden /></Pressable>
        <View style={s.flex}><Text style={s.dateLabel}>{dayLabel(date)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Ver hoy" style={s.today} onPress={() => setDate(localDay())}><Text style={s.link}>Hoy</Text></Pressable></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Día siguiente" style={s.arrow} onPress={() => setDate(day => moveDay(day, 1))}><Feather name="chevron-right" size={20} color="#1d302e" aria-hidden /></Pressable>
      </View>}
      {office && tab !== "clients" && <View><Text style={s.filterLabel}>Trabajador</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Chip label="Todos" selected={employee === "all"} onPress={() => setEmployee("all")} />{data?.employees.map(person => <Chip key={person.id} label={person.name} selected={employee === person.id} onPress={() => setEmployee(person.id)} />)}</ScrollView></View>}
      {tab !== "clients" && (data?.centers?.length || 0) > 1 && <View><Text style={s.filterLabel}>Centro</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Chip label="Todos los centros" selected={center === "all"} onPress={() => setCenter("all")} />{data?.centers?.map(item => <Chip key={item.id} label={item.name} selected={center === item.id} onPress={() => setCenter(item.id)} />)}</ScrollView></View>}
      {loading && <ActivityIndicator accessibilityLabel="Cargando agenda" color="#ed691d" />}
      {tab === "pending" && <Text style={s.muted}>Reservas sin trabajador o pendientes de reprogramación, aunque su fecha anterior ya haya pasado.</Text>}
      {tab === "clients" ? <>
        <Text style={s.sectionTitle}>{office ? "Clientes del centro" : "Clientes vinculados a ti"} · {visibleClients.length}</Text>
        {visibleClients.map(client => <View key={client.id} style={s.card}>
          <Text style={s.cardTitle}>{client.name}</Text>
          {!!client.phone && <Text style={s.muted}>Teléfono: {client.phone}</Text>}
          {!!client.email && <Text style={s.muted}>{client.email}</Text>}
          <Text style={s.small}>{{ ACTIVE: "Activo", INACTIVE: "Inactivo", BLOCKED: "Baja / bloqueado" }[client.status || ""] || "Ficha del centro"}</Text>
        </View>)}
        {!loading && !visibleClients.length && <Text style={s.empty}>No hay clientes que mostrar.</Text>}
      </> : <>
        <Text style={s.sectionTitle}>{tab === "pending" ? "Requieren atención" : "Reservas del día"} · {visible.length}</Text>
        {visible.map(booking => <Pressable key={booking.id} accessibilityRole="button" accessibilityLabel={`Ver reserva de ${clientName(booking)}`} onPress={() => setSelected(booking)} style={[s.card, { borderLeftWidth: 4, borderLeftColor: data?.services.find(service => service.id === booking.serviceId)?.color || "#ed691d" }]}>
          <Text style={s.cardTitle}>{clientName(booking)}</Text><Text style={s.muted}>{serviceName(booking)}</Text>
          <Text style={s.time}>{booking.start} – {booking.end}{tab === "pending" ? ` · ${booking.date}` : ""}</Text>
          <Text style={s.muted}>{employeeName(booking)}</Text><Text style={s.small}>{booking.centerName || "Consulta el centro en recepción"}</Text>
          <Text style={[s.status, { color: statusColors[booking.status] }]}>{statuses[booking.status]}</Text>
          {!!booking.needsReschedule && <Text style={s.warning}>Pendiente de reprogramar</Text>}
          {!booking.employeeId && <Text style={s.warning}>Sin trabajador asignado</Text>}
        </Pressable>)}
        {!loading && !visible.length && <Text style={s.empty}>{tab === "pending" ? "No hay reservas pendientes con estos filtros." : "No hay reservas para este día con estos filtros."}</Text>}
      </>}
      <Pressable accessibilityRole="button" accessibilityLabel="Actualizar agenda" style={s.refresh} onPress={() => void load()}><Feather name="refresh-cw" size={17} color="#1d302e" aria-hidden /><Text style={s.link}>Actualizar agenda</Text></Pressable>
      {!!updatedAt && <Text style={s.small}>Actualizado a las {updatedAt}. Se actualiza automáticamente mientras usas esta pantalla.</Text>}
      <Text style={s.note}>{office ? "La asignación, creación y modificación de citas se realizan en el panel de gestión del centro." : "Para solicitar cambios en una cita, contacta con recepción. La configuración y los permisos los gestiona administración."}</Text>
    </ScrollView>
    <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={s.overlay}><View style={s.panel}><ScrollView contentContainerStyle={s.modalContent}>{selected && <>
        <Text style={s.eyebrow}>DETALLE DE LA RESERVA</Text><Text style={s.title}>{clientName(selected)}</Text>
        <Text style={s.cardTitle}>{serviceName(selected)}</Text><Text style={s.muted}>{dayLabel(selected.date)} · {selected.start} – {selected.end}</Text>
        <Text style={s.muted}>Trabajador: {employeeName(selected)}</Text><Text style={s.cardTitle}>{selected.centerName || "Centro pendiente de consultar"}</Text>
        <Text style={s.muted}>{selected.centerAddress || "Solicita la dirección del centro en recepción."}</Text><Text style={[s.status, { color: statusColors[selected.status] }]}>{statuses[selected.status]}</Text>
      </>}<Pressable accessibilityRole="button" style={s.close} onPress={() => setSelected(null)}><Text style={s.white}>Cerrar detalle</Text></Pressable></ScrollView></View></View>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f6f6f0" }, flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: 20, gap: 12, borderBottomWidth: 1, borderColor: "#e0e5d9" },
  brand: { color: "#1d302e", fontSize: 22, fontWeight: "800", letterSpacing: -1 }, orange: { color: "#ed691d" }, role: { color: "#637468", fontSize: 11, marginTop: 5 },
  logout: { minHeight: 44, padding: 12, justifyContent: "center" }, link: { color: "#6d4c27", fontSize: 13, fontWeight: "700" },
  content: { padding: 20, gap: 16, paddingBottom: 35 }, eyebrow: { color: "#697a6c", fontSize: 10, letterSpacing: 1.2, fontWeight: "700" },
  title: { color: "#1d302e", fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -.7 }, muted: { color: "#607167", fontSize: 13, lineHeight: 21 }, small: { color: "#68796e", fontSize: 11, lineHeight: 18 },
  tabs: { flexDirection: "row", gap: 5, backgroundColor: "#e9ede3", padding: 5, borderRadius: 14 }, tab: { flex: 1, minHeight: 46, borderRadius: 10, padding: 6, alignItems: "center", justifyContent: "center" }, activeTab: { backgroundColor: "#1d302e" }, tabText: { color: "#516459", fontSize: 12, textAlign: "center", fontWeight: "600" }, white: { color: "white", fontWeight: "600", textAlign: "center" },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#dce2d4", borderRadius: 12, padding: 13, fontSize: 13, backgroundColor: "white", color: "#1d302e" },
  dates: { flexDirection: "row", alignItems: "center", gap: 8 }, arrow: { width: 44, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: "white", borderRadius: 12 }, dateLabel: { color: "#1d302e", fontSize: 14, fontWeight: "700", textAlign: "center", textTransform: "capitalize" }, today: { minHeight: 34, alignItems: "center", justifyContent: "center" },
  filterLabel: { color: "#64766b", fontSize: 11, marginBottom: 8 }, chips: { gap: 8 }, chip: { borderWidth: 1, borderColor: "#dce2d4", backgroundColor: "white", borderRadius: 20, minHeight: 44, justifyContent: "center", paddingHorizontal: 15 }, selectedChip: { backgroundColor: "#1d302e", borderColor: "#1d302e" }, chipText: { color: "#506257", fontSize: 12 },
  sectionTitle: { color: "#1d302e", fontSize: 17, fontWeight: "700" }, card: { backgroundColor: "white", borderRadius: 16, padding: 17, gap: 7, borderWidth: 1, borderColor: "#dfe5d9" }, cardTitle: { color: "#1d302e", fontSize: 16, fontWeight: "700", lineHeight: 23 }, time: { color: "#1d302e", fontSize: 14, fontWeight: "600" }, status: { color: "#386a48", fontSize: 12, fontWeight: "600" }, warning: { color: "#9b5b12", fontSize: 12, fontWeight: "600" }, empty: { color: "#6d7b71", paddingVertical: 22, fontSize: 13, lineHeight: 22 }, error: { color: "#a12d23", padding: 12, backgroundColor: "#fff0ec", borderRadius: 12, fontSize: 13, lineHeight: 20 },
  refresh: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderWidth: 1, borderColor: "#dce2d4", borderRadius: 12, padding: 14, minHeight: 48 }, note: { color: "#6e7b71", fontSize: 12, lineHeight: 20, paddingTop: 10 },
  overlay: { flex: 1, backgroundColor: "rgba(16,32,24,.5)", alignItems: "center", justifyContent: "center", padding: 20 }, panel: { width: "100%", maxWidth: 440, maxHeight: "90%", backgroundColor: "#f6f6f0", borderRadius: 22, overflow: "hidden" }, modalContent: { padding: 24, gap: 18 }, close: { backgroundColor: "#ed691d", minHeight: 48, padding: 14, borderRadius: 12, justifyContent: "center" },
});
