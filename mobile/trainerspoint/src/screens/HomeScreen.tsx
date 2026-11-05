import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { trainersPointTheme } from "../../../shared/theme";
import { ApiClient } from "../../../shared/api";
import { CalendarData, Identity } from "../../../shared/types";
import { localDay, upcomingBookings } from "../../../shared/calendar";

interface HomeScreenProps {
  api: ApiClient;
  user: Identity;
  onLogout: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ api, user, onLogout }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState("");

  const isTrainer = user.role !== "CLIENT";
  const upcoming = upcomingBookings(data);
  const sessions = isTrainer ? upcoming.filter(booking => booking.date === localDay()) : upcoming;

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      if (isTrainer) {
        setData(await api.getStaffCalendar());
      } else {
        const calendar = await api.getClientCalendar();
        setData(calendar);
      }
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [api, user.id]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola,</Text>
          <Text style={styles.userName}>{user.name || user.username}</Text>
          <Text style={styles.roleBadge}>{{ CLIENT: "Cliente", TRAINER: "Entrenador / Trabajador", ADMIN: "Administración", RECEPTION: "Recepción" }[user.role]}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Card de Estado */}
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>
          {isTrainer ? "Agenda de Hoy" : "Tu Próximo Entrenamiento"}
        </Text>
        <Text style={styles.heroSubtitle}>
          {isTrainer ? "Tus reservas de hoy" : "Tus próximas reservas"}
        </Text>

        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>
                {error ? "—" : sessions.length}
              </Text>
              <Text style={styles.statLabel}>
                {isTrainer ? "Reservas de hoy" : "Reservas próximas"}
              </Text>
            </View>
          </View>
        )}
      </View>

      {!!error && <Text accessibilityRole="alert" style={{ color: "#a52c20", marginBottom: 16 }}>{error}</Text>}
      {sessions.map(booking => <View key={booking.id} style={[styles.actionCard, { marginBottom: 12 }]}>
        <Text style={styles.actionTitle}>{data?.services.find(service => service.id === booking.serviceId)?.name || "Sesión"}</Text>
        <Text style={styles.actionDesc}>{booking.date} · {booking.start} – {booking.end}</Text>
        <Text style={styles.actionDesc}>{data?.employees.find(employee => employee.id === booking.employeeId)?.name || "Pendiente de asignar"}</Text>
        <Text style={styles.actionDesc}>{booking.centerName || "Consulta el centro con recepción"}</Text>
        {!!booking.centerAddress && <Text style={styles.actionDesc}>{booking.centerAddress}</Text>}
      </View>)}
      {!loading && !error && !sessions.length && <Text style={styles.actionDesc}>No hay reservas para mostrar.</Text>}
      <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
      <View style={styles.actionsGrid}>
            <TouchableOpacity accessibilityRole="button" style={styles.actionCard} onPress={loadData}>
              <Text style={styles.actionIcon}>📋</Text>
              <Text style={styles.actionTitle}>Actualizar agenda</Text>
              <Text style={styles.actionDesc}>Consultar las últimas reservas</Text>
            </TouchableOpacity>
      </View>
      <Text style={styles.actionDesc}>Para crear o cambiar una cita, contacta con recepción. Las rutinas móviles estarán disponibles en una próxima fase.</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: trainersPointTheme.colors.background,
  },
  content: {
    padding: 20,
    paddingTop: 50,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: trainersPointTheme.colors.textMuted,
  },
  userName: {
    fontSize: 22,
    fontWeight: "700",
    color: trainersPointTheme.colors.text,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: trainersPointTheme.colors.surfaceSubtle,
    color: trainersPointTheme.colors.primary,
    fontWeight: "700",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: trainersPointTheme.colors.border,
    backgroundColor: "#ffffff",
  },
  logoutText: {
    fontSize: 12,
    color: trainersPointTheme.colors.danger,
    fontWeight: "600",
  },
  heroCard: {
    backgroundColor: trainersPointTheme.colors.text,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  heroSubtitle: {
    color: "#a0aec0",
    fontSize: 12,
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: "row",
    marginTop: 16,
  },
  statBox: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    padding: 12,
    borderRadius: 10,
    minWidth: 130,
  },
  statNumber: {
    fontSize: 26,
    fontWeight: "800",
    color: trainersPointTheme.colors.primary,
  },
  statLabel: {
    fontSize: 11,
    color: "#e2e8f0",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: trainersPointTheme.colors.text,
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: trainersPointTheme.colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: trainersPointTheme.colors.border,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: trainersPointTheme.colors.text,
  },
  actionDesc: {
    fontSize: 11,
    color: trainersPointTheme.colors.textMuted,
    marginTop: 4,
  },
});

