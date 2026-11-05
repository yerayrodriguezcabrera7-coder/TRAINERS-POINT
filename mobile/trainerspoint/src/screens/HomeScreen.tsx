import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { trainersPointTheme } from "../../shared/theme";
import { ApiClient } from "../../shared/api";
import { Identity } from "../../shared/types";

interface HomeScreenProps {
  api: ApiClient;
  user: Identity;
  onLogout: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ api, user, onLogout }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const isTrainer = user.role === "TRAINER" || user.role === "ADMIN";

  const loadData = async () => {
    setLoading(true);
    try {
      if (isTrainer) {
        const today = new Date().toISOString().split("T")[0];
        const slots = await api.getStaffSlots(today);
        setData(slots);
      } else {
        const calendar = await api.getClientCalendar();
        setData(calendar);
      }
    } catch (e: any) {
      Alert.alert("Aviso", e.message || "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola,</Text>
          <Text style={styles.userName}>{user.name || user.username}</Text>
          <Text style={styles.roleBadge}>{user.role === "CLIENT" ? "Socio" : "Entrenador"}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Card de Estado */}
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>
          {isTrainer ? "Agenda de Hoy" : "Tu Próximo Entrenamiento"}
        </Text>
        <Text style={styles.heroSubtitle}>
          Sede: {api.getGymId()}
        </Text>

        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>
                {isTrainer ? (data?.slots?.length ?? 0) : (data?.upcoming?.length ?? 1)}
              </Text>
              <Text style={styles.statLabel}>
                {isTrainer ? "Sesiones asignadas" : "Sesiones restantes"}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Acciones Rápidas */}
      <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
      <View style={styles.actionsGrid}>
        {isTrainer ? (
          <>
            <TouchableOpacity style={styles.actionCard} onPress={loadData}>
              <Text style={styles.actionIcon}>📋</Text>
              <Text style={styles.actionTitle}>Ver Agenda</Text>
              <Text style={styles.actionDesc}>Consulta tus citas del día</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => Alert.alert("Asistencia", "Selecciona una reserva para pasar lista.")}>
              <Text style={styles.actionIcon}>✅</Text>
              <Text style={styles.actionTitle}>Check-in</Text>
              <Text style={styles.actionDesc}>Marcar asistencia de alumno</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.actionCard} onPress={() => Alert.alert("Reservar", "Abre el selector de horas disponibles.")}>
              <Text style={styles.actionIcon}>📅</Text>
              <Text style={styles.actionTitle}>Reservar Sesión</Text>
              <Text style={styles.actionDesc}>Elige día y hora con tu coach</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => Alert.alert("Rutina", "Mostrando el plan de entreno activo.")}>
              <Text style={styles.actionIcon}>🏋️</Text>
              <Text style={styles.actionTitle}>Mi Rutina</Text>
              <Text style={styles.actionDesc}>Ejercicios y series</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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

