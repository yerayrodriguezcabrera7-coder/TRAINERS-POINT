import React, { useState, useCallback } from "react";
import { StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClient } from "../../shared/api";
import { Identity } from "../../shared/types";
import { LoginScreen } from "./screens/LoginScreen";
import { StaffScreen } from "./screens/StaffScreen";
import { TrainerScreen } from "./screens/TrainerScreen";
import ClientHomeScreen from "./screens/ClientHomeScreen";
import { apiBaseUrl } from "../../shared/config";
import { mobileCognito } from "../../shared/cognito";
import { Platform } from "react-native";

/* ------------------------------------------------------------------ */
/*  Main App                                                           */
/* ------------------------------------------------------------------ */

export default function AccountApp({ onBack }: { onBack: () => void }) {
  const [currentUser, setCurrentUser] = useState<Identity | null>(null);
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
    }
  }, [api]);

  const handleLoginSuccess = useCallback((user: Identity) => {
    setCurrentUser(user);
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

    if (currentUser.role === "TRAINER") {
      return <TrainerScreen key={currentUser.id} api={api} user={currentUser} onLogout={handleLogout} />;
    }

    // RECEPTION, ADMIN → StaffScreen
    return (
      <StaffScreen key={currentUser.id} api={api} user={currentUser} onLogout={handleLogout} />
    );
  };

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
});
