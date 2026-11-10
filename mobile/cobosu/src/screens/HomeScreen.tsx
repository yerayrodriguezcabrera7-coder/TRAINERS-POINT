import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { cobosuTheme } from "../../../shared/theme";
import { ApiClient } from "../../../shared/api";
import { CalendarData, Identity } from "../../../shared/types";
import { upcomingBookings } from "../../../shared/calendar";

interface HomeScreenProps {
  api: ApiClient;
  user: Identity;
  onLogout: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ api, user, onLogout }) => {
  const [loading, setLoading] = useState(true);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [error, setError] = useState("");
  const bookings = upcomingBookings(calendar);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getClientCalendar();
      setCalendar(data);
    } catch (e: unknown) {
      setCalendar(null);
      setError(e instanceof Error ? e.message : "No se pudieron obtener las reservas.");
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
          <Text style={styles.greeting}>Bienvenido/a,</Text>
          <Text style={styles.userName}>{user.name || user.username}</Text>
          <Text style={styles.gymTag}>COBOSU TRAINING</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

      {/* Tarjeta de socio */}
      <View style={styles.memberCard}>
        <Text style={styles.memberCardEyebrow}>TU AGENDA</Text>
        <Text style={styles.memberCardTitle}>Próximas reservas</Text>

        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeNumber}>
                {error ? "—" : bookings.length}
              </Text>
              <Text style={styles.badgeLabel}>Reservas próximas</Text>
            </View>
          </View>
        )}
      </View>

      {!!error && <Text accessibilityRole="alert" style={{ color: "#a52c20", marginBottom: 16 }}>{error}</Text>}
      {bookings.map(booking => <View key={booking.id} style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardTitle}>{calendar?.services.find(service => service.id === booking.serviceId)?.name || "Sesión"}</Text>
        <Text style={styles.cardDesc}>{booking.date} · {booking.start} – {booking.end}</Text>
        <Text style={styles.cardDesc}>{calendar?.employees.find(employee => employee.id === booking.employeeId)?.name || "Pendiente de asignar"}</Text>
        <Text style={styles.cardDesc}>{booking.centerName || "Consulta el centro con recepción"}</Text>
        {!!booking.centerAddress && <Text style={styles.cardDesc}>{booking.centerAddress}</Text>}
      </View>)}
      {!loading && !error && !bookings.length && <Text style={styles.cardDesc}>No hay próximas reservas.</Text>}
      <Text style={styles.sectionTitle}>Servicios de Sala</Text>
      <View style={styles.grid}>
        <TouchableOpacity accessibilityRole="button" style={styles.card} onPress={loadData}>
          <Text style={styles.icon}>📅</Text>
          <Text style={styles.cardTitle}>Actualizar agenda</Text>
          <Text style={styles.cardDesc}>Consultar las últimas reservas</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.icon}>💪</Text>
          <Text style={styles.cardTitle}>Mi Entrenamiento</Text>
          <Text style={styles.cardDesc}>Próximamente · Rutinas, series y pesos</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.icon}>📈</Text>
          <Text style={styles.cardTitle}>Mi Evolución</Text>
          <Text style={styles.cardDesc}>Próximamente · Peso y medidas corporales</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.icon}>💬</Text>
          <Text style={styles.cardTitle}>Atención al Socio</Text>
          <Text style={styles.cardDesc}>Para dudas o cambios de cita, contacta con recepción del centro.</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cobosuTheme.colors.background,
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
    fontSize: 13,
    color: cobosuTheme.colors.textMuted,
  },
  userName: {
    fontSize: 24,
    fontWeight: "800",
    color: cobosuTheme.colors.text,
  },
  gymTag: {
    fontSize: 11,
    fontWeight: "700",
    color: cobosuTheme.colors.primary,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: cobosuTheme.colors.border,
    backgroundColor: "#ffffff",
  },
  logoutText: {
    fontSize: 12,
    color: cobosuTheme.colors.danger,
    fontWeight: "600",
  },
  memberCard: {
    backgroundColor: cobosuTheme.colors.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  memberCardEyebrow: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  memberCardTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  badge: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 120,
  },
  badgeNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
  },
  badgeLabel: {
    fontSize: 11,
    color: "#bfdbfe",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: cobosuTheme.colors.text,
    marginBottom: 12,
  },
  grid: {
    gap: 12,
  },
  card: {
    backgroundColor: cobosuTheme.colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cobosuTheme.colors.border,
  },
  icon: {
    fontSize: 24,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: cobosuTheme.colors.text,
  },
  cardDesc: {
    fontSize: 12,
    color: cobosuTheme.colors.textMuted,
    marginTop: 2,
  },
});

