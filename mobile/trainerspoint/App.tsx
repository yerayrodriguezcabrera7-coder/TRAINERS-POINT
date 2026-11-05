import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import { ApiClient } from "./shared/api";
import { Identity } from "./shared/types";
import { LoginScreen } from "./src/screens/LoginScreen";
import { HomeScreen } from "./src/screens/HomeScreen";

// Memoria volátil para token en entorno inicial
let currentToken: string | null = null;

// NOTA: Cambia esta IP por la IP local de tu máquina de desarrollo (ej. http://192.168.1.50:3000)
// o por tu URL pública https://tu-dominio.com para probar en un dispositivo físico.
const API_BASE_URL = "http://10.0.2.2:3000"; // 10.0.2.2 para emulador Android, o localhost:3000 para iOS simulator

const api = new ApiClient({
  baseUrl: API_BASE_URL,
  gymId: "trainers-point-bizkaia",
  getToken: async () => currentToken,
  setToken: async (token) => {
    currentToken = token;
  },
  onUnauthorized: () => {
    currentToken = null;
  },
});

export default function App() {
  const [currentUser, setCurrentUser] = useState<Identity | null>(null);

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {currentUser ? (
        <HomeScreen api={api} user={currentUser} onLogout={handleLogout} />
      ) : (
        <LoginScreen api={api} onLoginSuccess={setCurrentUser} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fffdf9",
  },
});

