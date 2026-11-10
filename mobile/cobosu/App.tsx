import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ApiClient } from "../shared/api";
import { Identity } from "../shared/types";
import { LoginScreen } from "./src/screens/LoginScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { apiBaseUrl } from "../shared/config";
import { mobileCognito } from "../shared/cognito";

export default function App() {
  const [currentUser, setCurrentUser] = useState<Identity | null>(null);
  const [api] = useState(() => {
    let token: string | null = null;
    return new ApiClient({
      baseUrl: apiBaseUrl(Platform.OS, process.env.EXPO_PUBLIC_API_URL),
      gymId: process.env.EXPO_PUBLIC_GYM_ID?.trim() || undefined,
      cognito: mobileCognito(process.env.EXPO_PUBLIC_AUTH_PROVIDER, process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID, process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID),
      getToken: async () => token,
      setToken: async value => { token = value; },
      onUnauthorized: () => setCurrentUser(null),
    });
  });

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* Local logout still succeeds offline. */ }
    finally { setCurrentUser(null); }
  };

  return (
    <SafeAreaProvider><SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {currentUser ? (
        <HomeScreen api={api} user={currentUser} onLogout={handleLogout} />
      ) : (
        <LoginScreen api={api} onLoginSuccess={setCurrentUser} />
      )}
    </SafeAreaView></SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
});

