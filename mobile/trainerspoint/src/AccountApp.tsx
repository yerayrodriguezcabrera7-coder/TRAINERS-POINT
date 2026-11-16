import React, { useState, useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClient } from "../../shared/api";
import { Identity } from "../../shared/types";
import { LoginScreen } from "./screens/LoginScreen";
import { StaffScreen } from "./screens/StaffScreen";
import ClientHomeScreen from "./screens/ClientHomeScreen";
import { apiBaseUrl } from "../../shared/config";
import { mobileCognito } from "../../shared/cognito";
import { Platform } from "react-native";

/* ------------------------------------------------------------------ */
/*  Loading screen                                                     */
/* ------------------------------------------------------------------ */

function LoadingScreen() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#ed691d" />
      <Text style={styles.loadingText}>Cargando tu cuenta…</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Error screen                                                       */
/* ------------------------------------------------------------------ */

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={[styles.center, { gap: 16 }]}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorTitle}>Algo salió mal</Text>
      <Text style={styles.errorText}>{message}</Text>
      <Text style={styles.retryButton} onPress={onRetry}>
        Reintentar
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main App                                                           */
/* ------------------------------------------------------------------ */

export default function AccountApp({ onBack }: { onBack: () => void }) {
  const [currentUser, setCurrentUser] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginKey, setLoginKey] = useState(0);

  const [api] = useState(() => {
    let token: string | null = null;
    return new ApiClient({
      baseUrl: apiBaseUrl(Platform.OS, process.env.EXPO_PUBLIC_API_URL),
      gymId: process.env.EXPO_PUBLIC_GYM_ID?.trim() || undefined,
      cognito: mobileCognito(
        process.env.EXPO_PUBLIC_AUTH_PROVIDER,
        process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID,
        process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID
      ),
      getToken: async () => token,
      setToken: async (value) => {
        token = value;
      },
      onUnauthorized: () => {
        setCurrentUser(null);
        setLoginKey((v) => v + 1);
      },
    });
  });

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* Local logout still succeeds offline */
    } finally {
      setCurrentUser(null);
      setLoading(false);
    }
  }, [api]);

  const handleLoginSuccess = useCallback((user: Identity) => {
    setCurrentUser(user);
    setLoading(false);
  }, []);

  const handleBack = useCallback(() => {
    void handleLogout();
    onBack();
  }, [handleLogout, onBack]);

  // ── Route por rol ─────────────────────────────────────────────────
  const renderScreen = () => {
    if (!currentUser) return null;

    if (currentUser.role === "CLIENT") {
      return (
        <ClientHomeScreen key={currentUser.id} api={api} user={currentUser} onLogout={handleLogout} />
      );
    }

    // TRAINER, RECEPTION, ADMIN → StaffScreen
    return (
      <StaffScreen key={currentUser.id} api={api} user={currentUser} onLogout={handleLogout} />
    );
  };

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <ErrorScreen message={error} onRetry={() => setError(null)} />
      </SafeAreaView>
    );
  }

  // ── Login or screen ───────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {currentUser ? renderScreen() : (
        <LoginScreen key={loginKey} api={api} onLoginSuccess={handleLoginSuccess} onBack={handleBack} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "#fffdf9",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#65746b",
    fontSize: 14,
    marginTop: 8,
  },
  errorIcon: {
    fontSize: 40,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1d302e",
  },
  errorText: {
    fontSize: 14,
    color: "#65746b",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  retryButton: {
    color: "#ed691d",
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});