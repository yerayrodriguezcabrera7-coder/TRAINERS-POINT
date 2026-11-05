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
import { cobosuTheme } from "../../../shared/theme";
import { ApiClient } from "../../../shared/api";

interface LoginScreenProps {
  api: ApiClient;
  onLoginSuccess: (user: any) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ api, onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Campos requeridos", "Por favor introduce tu usuario y contraseña.");
      return;
    }

    setLoading(true);
    try {
      await api.login({
        username: username.trim(),
        password,
        portal: "CLIENT",
      });
      const me = await api.getMe();
      onLoginSuccess(me);
    } catch (error: any) {
      Alert.alert("Acceso Cobosu", error.message || "Usuario o contraseña no válidos.");
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
          <Text style={styles.brandTitle}>COBOSU</Text>
          <Text style={styles.subtitle}>Centro de Entrenamiento y Salud</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Usuario de socio</Text>
          <TextInput
            style={styles.input}
            placeholder="ej. nombre.apellido"
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
              <Text style={styles.submitButtonText}>Entrar a Cobosu</Text>
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
    backgroundColor: cobosuTheme.colors.background,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: cobosuTheme.colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: cobosuTheme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: cobosuTheme.colors.primary,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 13,
    color: cobosuTheme.colors.textMuted,
    marginTop: 6,
    textAlign: "center",
  },
  form: {
    gap: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: cobosuTheme.colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: cobosuTheme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#ffffff",
    color: cobosuTheme.colors.text,
  },
  submitButton: {
    backgroundColor: cobosuTheme.colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});

