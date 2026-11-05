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
import { cobosuTheme } from "../../../shared/theme";
import { ApiClient } from "../../../shared/api";
import { Identity } from "../../../shared/types";

interface HomeScreenProps {
  api: ApiClient;
  user: Identity;
  onLogout: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ api, user, onLogout }) => {
  const [loading, setLoading] = useState(false);
  const [calendar, setCalendar] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getClientCalendar();
      setCalendar(data);
    } catch (e: any) {
      Alert.alert("Aviso", e.message || "No se pudieron obtener las reservas.");
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
          <Text style={styles.greeting}>Bienvenido/a,</Text>
          <Text style={styles.userName}>{user.name || user.username}</Text>
          <Text style={styles.gymTag}>COBOSU TRAINING</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

      {/* Tarjeta de socio */}
      <View style={styles.memberCard}>
        <Text style={styles.memberCardEyebrow}>ESTADO DEL SOCIO</Text>
        <Text style={styles.memberCardTitle}>Tu Plan Activo</Text>

        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeNumber}>
                {calendar?.upcoming?.length ?? 1}
              </Text>
              <Text style={styles.badgeLabel}>Próxima sesión</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeNumber}>Activo</Text>
              <Text style={styles.badgeLabel}>Estado de cuota</Text>
            </View>
          </View>
        )}
      </View>

      {/* Menú de acciones */}
      <Text style={styles.sectionTitle}>Servicios de Sala</Text>
      <View style={styles.grid}>
        <TouchableOpacity style={styles.card} onPress={() => Alert.alert("Cobosu Reservas", "Abriendo calendario de citas...")}>
          <Text style={styles.icon}>📅</Text>
          <Text style={styles.cardTitle}>Reservar Cita</Text>
          <Text style={styles.cardDesc}>Elige tu sesión semanal</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => Alert.alert("Cobosu Rutina", "Cargando tus ejercicios asignados...")}>
          <Text style={styles.icon}>💪</Text>
          <Text style={styles.cardTitle}>Mi Entrenamiento</Text>
          <Text style={styles.cardDesc}>Rutinas, series y pesos</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => Alert.alert("Cobosu Progreso", "Cargando histórico de peso y medidas...")}>
          <Text style={styles.icon}>📈</Text>
          <Text style={styles.cardTitle}>Mi Evolución</Text>
          <Text style={styles.cardDesc}>Peso, medidas corporales</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => Alert.alert("Cobosu Contacto", "Llamar o escribir a recepción...")}>
          <Text style={styles.icon}>💬</Text>
          <Text style={styles.cardTitle}>Atención al Socio</Text>
          <Text style={styles.cardDesc}>Dudas o cambios de cita</Text>
        </TouchableOpacity>
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

