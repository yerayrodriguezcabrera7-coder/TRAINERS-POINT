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
import { trainersPointTheme } from "../../../shared/theme";
import { ApiClient } from "../../../shared/api";
import type { Identity } from "../../../shared/types";
import { AccessHelp } from "./AccessHelp";

interface LoginScreenProps {
  api: ApiClient;
  onLoginSuccess: (user: Identity) => void;
  onBack?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ api, onLoginSuccess, onBack }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [portal, setPortal] = useState<"TRAINER" | "CLIENT">("CLIENT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

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
        portal,
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", width: "100%", maxWidth: 480, alignSelf: "center" }}><View style={styles.card}>
        {onBack && <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={onBack} style={{ minHeight: 44, justifyContent: "center", marginBottom: 12 }}><Text style={{ color: "#5d7066", fontWeight: "600" }}>← Volver al inicio</Text></TouchableOpacity>}
        <View style={styles.header}>
          <Text style={styles.brandTitle}>TRAINERS POINT</Text>
          <Text style={styles.subtitle}>Inicia sesión para gestionar tus entrenamientos</Text>
        </View>

        {/* Selector de perfil / portal */}
        {!mustChange && <View style={styles.portalToggle}>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={loading}
            accessibilityState={{ selected: portal === "CLIENT" }}
            style={[styles.portalButton, portal === "CLIENT" && styles.portalButtonActive]}
            onPress={() => setPortal("CLIENT")}
          >
            <Text style={[styles.portalText, portal === "CLIENT" && styles.portalTextActive]}>
              Cliente
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={loading}
            accessibilityState={{ selected: portal === "TRAINER" }}
            style={[styles.portalButton, portal === "TRAINER" && styles.portalButtonActive]}
            onPress={() => setPortal("TRAINER")}
          >
            <Text style={[styles.portalText, portal === "TRAINER" && styles.portalTextActive]}>
              Entrenador / Trabajador
            </Text>
          </TouchableOpacity>
        </View>}

        <View style={styles.form}>
          <Text style={styles.label}>Usuario</Text>
          <TextInput
            style={styles.input}
            placeholder="ej. maria.lopez"
            value={username}
            onChangeText={setUsername}
            editable={!loading && !mustChange}
            accessibilityLabel="Usuario"
            autoComplete="username"
            maxLength={254}
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
            autoComplete="current-password"
            maxLength={128}
            secureTextEntry={!showPassword}
          />
          {!mustChange && <TouchableOpacity accessibilityRole="button" onPress={() => setShowPassword(value => !value)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#915022", fontWeight: "600" }}>{showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}</Text></TouchableOpacity>}

          {mustChange && <>
            <Text>Para continuar debes cambiar tu contraseña provisional.</Text>
            <Text style={styles.label}>Nueva contraseña (mínimo 12 caracteres)</Text>
            <TextInput accessibilityLabel="Nueva contraseña" autoComplete="new-password" maxLength={128} style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry editable={!loading} />
            <Text style={styles.label}>Repite la nueva contraseña</Text>
            <TextInput accessibilityLabel="Repite la nueva contraseña" autoComplete="new-password" maxLength={128} style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry editable={!loading} />
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
              <Text style={styles.submitButtonText}>{mustChange ? "Guardar contraseña y entrar" : "Entrar a Trainers Point"}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => setShowHelp(true)} style={{ minHeight: 48, justifyContent: "center" }}><Text style={{ color: "#915022", textAlign: "center", fontWeight: "600" }}>¿No tienes acceso o has olvidado tu contraseña?</Text></TouchableOpacity>
          <Text style={{ color: "#67746d", fontSize: 12, lineHeight: 19, textAlign: "center" }}>Cada persona utiliza su propia cuenta del centro.</Text>
        </View>
      </View></ScrollView>
      <AccessHelp visible={showHelp} onClose={() => setShowHelp(false)} />
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
    paddingHorizontal: 6,
    alignItems: "center",
    borderRadius: 8,
  },
  portalButtonActive: {
    backgroundColor: trainersPointTheme.colors.primary,
  },
  portalText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
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

