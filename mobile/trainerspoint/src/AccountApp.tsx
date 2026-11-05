import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClient } from "../../shared/api";
import { Identity } from "../../shared/types";
import { LoginScreen } from "./screens/LoginScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { StaffScreen } from "./screens/StaffScreen";
import { apiBaseUrl } from "../../shared/config";

export default function AccountApp({ onBack }: { onBack: () => void }) {
  const [currentUser, setCurrentUser] = useState<Identity | null>(null);
  const [loginKey, setLoginKey] = useState(0);
  const [api] = useState(() => {
    let token: string | null = null;
    return new ApiClient({
      baseUrl: apiBaseUrl(Platform.OS, process.env.EXPO_PUBLIC_API_URL),
      gymId: process.env.EXPO_PUBLIC_GYM_ID?.trim() || undefined,
      getToken: async () => token,
      setToken: async value => { token = value; },
      onUnauthorized: () => { setCurrentUser(null); setLoginKey(value => value + 1); },
    });
  });

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* Local logout still succeeds offline. */ }
    finally { setCurrentUser(null); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {currentUser ? (
        currentUser.role === "CLIENT" ? <HomeScreen api={api} user={currentUser} onLogout={handleLogout} /> :
        <StaffScreen key={currentUser.id} api={api} user={currentUser} onLogout={handleLogout} />
      ) : (
        <LoginScreen key={loginKey} api={api} onLoginSuccess={setCurrentUser} onBack={() => { void handleLogout(); onBack(); }} />
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

