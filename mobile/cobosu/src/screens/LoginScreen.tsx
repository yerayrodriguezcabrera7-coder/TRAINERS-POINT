import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { cobosuTheme } from "../../../shared/theme";
import { ApiClient } from "../../../shared/api";
import type { Identity } from "../../../shared/types";

interface LoginScreenProps {
  api: ApiClient;
  onLoginSuccess: (user: Identity) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ api, onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleLogin = async () => {
    if (loading) return;
    setError("");
    if (!username.trim() || !password.trim()) {
      setError("Introduce tu usuario y contraseña.");
      return;
    }

    setLoading(true);
    try {
      if (mustChange) {
        if (newPassword.length < 12 || newPassword !== confirmPassword) {
          setError("Escribe una contraseña nueva de al menos 12 caracteres y repítela igual.");
          return;
        }
        await api.changePassword(password, newPassword, confirmPassword);
      } else {
        const response = await api.login({
        username: username.trim(),
        password,
        portal: "CLIENT",
        });
        if (response.mustChangePassword) { setMustChange(true); return; }
      }
      const me = await api.getMe();
      onLoginSuccess(me);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "No se ha podido iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}><View style={styles.card}>
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
            editable={!loading && !mustChange}
            accessibilityLabel="Usuario"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••••••"
            value={password}
            onChangeText={setPassword}
            editable={!loading && !mustChange}
            accessibilityLabel="Contraseña"
            secureTextEntry
          />
          {mustChange && <>
            <Text>Para continuar debes cambiar tu contraseña provisional.</Text>
            <Text style={styles.label}>Nueva contraseña (mínimo 12 caracteres)</Text>
            <TextInput accessibilityLabel="Nueva contraseña" style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry editable={!loading} />
            <Text style={styles.label}>Repite la nueva contraseña</Text>
            <TextInput accessibilityLabel="Repite la nueva contraseña" style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry editable={!loading} />
          </>}
          {!!error && <Text accessibilityRole="alert" style={{ color: "#a52c20", marginVertical: 12 }}>{error}</Text>}

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.submitButton}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{mustChange ? "Guardar contraseña y entrar" : "Entrar a Cobosu"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View></ScrollView>
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

