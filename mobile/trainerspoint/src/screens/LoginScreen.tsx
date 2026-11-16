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
import { ApiClient, CognitoPasswordRequired } from "../../../shared/api";
import type { Identity } from "../../../shared/types";
import { AccessHelp } from "./AccessHelp";

// ── Colores de la paleta ──────────────────────────────────────────
const COLORS = {
  primary: "#ed691d",
  dark: "#1d302e",
  bg: "#f6f6f0",
  error: "#a52c20",
  success: "#2d7a4f",
  surface: "#ffffff",
  textMuted: "#6b7774",
  border: "#d0d5d2",
};

// ── Tipos del selector de portal ──────────────────────────────────
type PortalOption = { value: "TRAINER" | "CLIENT" | "OFFICE"; emoji: string; label: string };

const PORTAL_OPTIONS: PortalOption[] = [
  { value: "CLIENT", emoji: "👤", label: "Cliente" },
  { value: "TRAINER", emoji: "💪", label: "Entrenador / Trabajador" },
  { value: "OFFICE", emoji: "🏢", label: "Recepción" },
];

// ── Pantalla de Login ─────────────────────────────────────────────
export const LoginScreen: React.FC<{
  api: ApiClient;
  onLoginSuccess: (user: Identity) => void;
  onBack?: () => void;
}> = ({ api, onLoginSuccess, onBack }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [portal, setPortal] = useState<"TRAINER" | "CLIENT" | "OFFICE">("CLIENT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // ── Estado de validación de contraseña ──────────────────────────
  const pwValidLength = newPassword.length >= 12;
  const pwMatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  // ── Handler de login ────────────────────────────────────────────
  const handleLogin = async () => {
    if (loading) return;
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Introduce tu usuario y contraseña.");
      return;
    }

    if (mustChange) {
      if (!pwValidLength) {
        setError("La contraseña debe tener al menos 12 caracteres.");
        return;
      }
      if (passwordsMismatch) {
        setError("Las contraseñas no coinciden.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mustChange) {
        await api.changePassword(password, newPassword, confirmPassword);
      } else {
        const response = await api.login({
          username: username.trim(),
          password,
          portal,
        });
        if (response.mustChangePassword) {
          setMustChange(true);
          return;
        }
      }
      const me = await api.getMe();
      onLoginSuccess(me);
    } catch (err: unknown) {
      if (err instanceof CognitoPasswordRequired) {
        setMustChange(true);
        return;
      }
      setError(err instanceof Error ? err.message : "No se ha podido iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  // ── Botones de portal ──────────────────────────────────────────
  const renderPortalButtons = () => (
    <View style={styles.portalGrid}>
      {PORTAL_OPTIONS.map((opt) => {
        const active = portal === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            accessibilityRole="button"
            accessibilityLabel={`Portal ${opt.label}`}
            accessibilityState={{ selected: active }}
            disabled={loading}
            style={[styles.portalCard, active && styles.portalCardActive]}
            onPress={() => {
              setPortal(opt.value);
              setError("");
            }}
          >
            <Text style={[styles.portalEmoji, active && styles.portalEmojiActive]}>
              {opt.emoji}
            </Text>
            <Text
              style={[
                styles.portalLabel,
                active && styles.portalLabelActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Lista de requisitos de contraseña ──────────────────────────
  const renderPasswordRequirements = () => {
    const requirements: { check: boolean; text: string }[] = [
      { check: pwValidLength, text: "Mínimo 12 caracteres" },
      { check: confirmPassword.length > 0 && pwMatch, text: "Las contraseñas coinciden" },
    ];

    return (
      <View style={styles.reqList}>
        {requirements.map((req, i) => (
          <View key={i} style={styles.reqRow}>
            <Text style={[styles.reqIcon, req.check && styles.reqIconOk]}>
              {req.check ? "✓" : "○"}
            </Text>
            <Text
              style={[styles.reqText, req.check && { color: COLORS.success }]}
            >
              {req.text}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  // ── Renderizado principal ──────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.card}>
          {/* Botón volver */}
          {onBack && (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={loading}
              onPress={onBack}
              style={styles.backButton}
            >
              <Text style={styles.backText}>← Volver al inicio</Text>
            </TouchableOpacity>
          )}

          {/* ── Header / Branding ─────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.brandTitle}>
              T. <Text style={styles.brandHighlight}>trainerspoint</Text>
            </Text>
            <Text style={styles.subtitle}>
              Tu centro, tu equipo, tu espacio
            </Text>
          </View>

          {/* ── Selector de portal ────────────────────────────── */}
          {!mustChange && renderPortalButtons()}

          {/* ── Formulario ────────────────────────────────────── */}
          <View style={styles.form}>
            {/* Usuario */}
            <View>
              <Text style={styles.label}>Usuario</Text>
              <TextInput
                style={styles.input}
                placeholder="ej. maria.lopez"
                value={username}
                onChangeText={setUsername}
                editable={!loading && !mustChange}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
              />
            </View>

            {/* Contraseña */}
            <View>
              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading && !mustChange}
                  autoComplete="current-password"
                />
                {!mustChange && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eyeButton}
                  >
                    <Text style={styles.eyeText}>
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Cambio de contraseña */}
            {mustChange && (
              <>
                <Text style={styles.mustChangeTitle}>
                  Cambia tu contraseña provisional
                </Text>

                <View>
                  <Text style={styles.label}>Nueva contraseña</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Escribe la nueva contraseña"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!loading}
                  />
                </View>

                {renderPasswordRequirements()}

                <View>
                  <Text style={styles.label}>Repetir contraseña</Text>
                  <TextInput
                    style={[styles.input, passwordsMismatch ? styles.inputError : {}]}
                    placeholder="Repite la nueva contraseña"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!loading}
                  />
                </View>

                {passwordsMismatch && (
                  <Text style={styles.mismatchText}>
                    Las contraseñas no coinciden
                  </Text>
                )}

                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={loading}
                  onPress={() => {
                    void api.cancelLogin();
                    setMustChange(false);
                    setPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setError("");
                  }}
                  style={styles.backToLoginButton}
                >
                  <Text style={styles.backToLoginText}>
                    ← Volver a iniciar sesión
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Banner de error ─────────────────────────────── */}
            {!!error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* ── Botón de acción ─────────────────────────────── */}
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {mustChange ? "Guardar y entrar" : "Entrar"}
                </Text>
              )}
            </TouchableOpacity>

            {/* ── Footer ──────────────────────────────────────── */}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setShowHelp(true)}
              style={styles.helpButton}
            >
              <Text style={styles.helpText}>
                ¿No tienes acceso o has olvidado tu contraseña?
              </Text>
            </TouchableOpacity>

            <Text style={styles.footerNote}>
              Cada persona utiliza su propia cuenta del centro.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Modal de ayuda */}
      <AccessHelp visible={showHelp} onClose={() => setShowHelp(false)} />
    </KeyboardAvoidingView>
  );
};

// ── Estilos ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Contenedor ──────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },

  // ── Botón volver ────────────────────────────────────────────────
  backButton: {
    minHeight: 44,
    justifyContent: "center",
    marginBottom: 8,
  },
  backText: {
    color: COLORS.textMuted,
    fontWeight: "600",
    fontSize: 14,
  },

  // ── Header / Branding ──────────────────────────────────────────
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: COLORS.dark,
    letterSpacing: 0.5,
  },
  brandHighlight: {
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 6,
    textAlign: "center",
  },

  // ── Selector de portal (tarjetas grandes) ──────────────────────
  portalGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  portalCard: {
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  portalCardActive: {
    backgroundColor: COLORS.dark,
    borderColor: COLORS.dark,
  },
  portalEmoji: {
    fontSize: 20,
  },
  portalEmojiActive: {
    // emoji no cambia, pero está bien así
  },
  portalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  portalLabelActive: {
    color: "#ffffff",
  },

  // ── Formulario ─────────────────────────────────────────────────
  form: {
    gap: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.dark,
    marginBottom: 6,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.dark,
  },
  inputActive: {
    borderColor: COLORS.dark,
    borderWidth: 2.5,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  passwordInput: {
    flex: 1,
  },
  eyeButton: {
    minHeight: 56,
    minWidth: 64,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  eyeText: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 13,
  },

  // ── Cambio de contraseña ───────────────────────────────────────
  mustChangeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.error,
    marginBottom: 4,
  },
  reqList: {
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reqIcon: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textMuted,
    width: 22,
  },
  reqIconOk: {
    color: COLORS.success,
  },
  reqText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  mismatchText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.error,
    marginTop: -4,
  },
  backToLoginButton: {
    minHeight: 44,
    justifyContent: "center",
  },
  backToLoginText: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 14,
  },

  // ── Banner de error ────────────────────────────────────────────
  errorBanner: {
    backgroundColor: COLORS.error,
    borderRadius: 12,
    padding: 14,
  },
  errorText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },

  // ── Botón principal ────────────────────────────────────────────
  submitButton: {
    backgroundColor: COLORS.primary,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  // ── Footer ─────────────────────────────────────────────────────
  helpButton: {
    minHeight: 44,
    justifyContent: "center",
  },
  helpText: {
    color: COLORS.primary,
    textAlign: "center",
    fontWeight: "600",
    fontSize: 14,
  },
  footerNote: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: -4,
  },
});