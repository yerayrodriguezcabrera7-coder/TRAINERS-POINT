import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { trainersPointTheme } from "../../shared/theme";
import { ApiClient } from "../../shared/api";

interface LoginScreenProps {
  api: ApiClient;
  onLoginSuccess: (user: any) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ api, onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [portal, setPortal] = useState<"TRAINER" | "CLIENT">("CLIENT");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Campos requeridos", "Por favor introduce tu usuario y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.login({
        username: username.trim(),
        password,
        portal,
      });
      const me = await api.getMe();
      onLoginSuccess(me);
    } catch (error: any) {
      Alert.alert("Error de acceso", error.message || "Credenciales incorrectas.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.brandTitle}>TRAINERS POINT</Text>
          <Text style={styles.subtitle}>Inicia sesión para gestionar tus entrenamientos</Text>
        </View>

        {/* Selector de perfil / portal */}
        <View style={styles.portalToggle}>
          <TouchableOpacity
            style={[styles.portalButton, portal === "CLIENT" && styles.portalButtonActive]}
            onPress={() => setPortal("CLIENT")}
          >
            <Text style={[styles.portalText, portal === "CLIENT" && styles.portalTextActive]}>
              Cliente
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.portalButton, portal === "TRAINER" && styles.portalButtonActive]}
            onPress={() => setPortal("TRAINER")}
          >
            <Text style={[styles.portalText, portal === "TRAINER" && styles.portalTextActive]}>
              Entrenador
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Usuario</Text>
          <TextInput
            style={styles.input}
            placeholder="ej. maria.lopez"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Entrar a Trainers Point</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: trainersPointTheme.colors.background,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: trainersPointTheme.colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: trainersPointTheme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: trainersPointTheme.colors.primary,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    color: trainersPointTheme.colors.textMuted,
    marginTop: 6,
    textAlign: "center",
  },
  portalToggle: {
    flexDirection: "row",
    backgroundColor: trainersPointTheme.colors.surfaceSubtle,
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  portalButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  portalButtonActive: {
    backgroundColor: trainersPointTheme.colors.primary,
  },
  portalText: {
    fontSize: 14,
    fontWeight: "600",
    color: trainersPointTheme.colors.textMuted,
  },
  portalTextActive: {
    color: "#ffffff",
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: trainersPointTheme.colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: trainersPointTheme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#ffffff",
    color: trainersPointTheme.colors.text,
  },
  submitButton: {
    backgroundColor: trainersPointTheme.colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});

