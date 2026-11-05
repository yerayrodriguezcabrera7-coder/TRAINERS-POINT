import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import { HomeScreen, UserVoucher } from "./src/screens/HomeScreen";
import { BuyVouchersScreen, CartItem } from "./src/screens/BuyVouchersScreen";

export default function App() {
  const [currentView, setCurrentView] = useState<"HOME" | "BUY">("HOME");

  const [vouchers, setVouchers] = useState<UserVoucher[]>([
    {
      id: "v-1",
      code: "BONO-GYM-01",
      serviceName: "Entrenamiento en Gimnasio",
      durationMin: 60,
      remainingSessions: 2,
      totalSessions: 10,
      expiresAt: "28/11/2026",
      isLow: true,
    },
    {
      id: "v-2",
      code: "BONO-CAB-02",
      serviceName: "Cabina de Recuperación",
      durationMin: 30,
      remainingSessions: 5,
      totalSessions: 5,
      expiresAt: "15/01/2027",
      isLow: false,
    },
  ]);

  const handleFinishPurchase = (items: CartItem[], totalAmount: number) => {
    // Acreditar los nuevos bonos comprados al estado de inicio
    const newVouchers: UserVoucher[] = items.map((it, idx) => ({
      id: `v-new-${Date.now()}-${idx}`,
      code: `BONO-${it.category.substring(0, 3)}-${Math.floor(10 + Math.random() * 90)}`,
      serviceName: it.serviceName,
      durationMin: it.durationMin,
      remainingSessions: it.sessions,
      totalSessions: it.sessions,
      expiresAt: "31/12/2026",
      isLow: false,
    }));

    setVouchers((prev) => [...newVouchers, ...prev]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {currentView === "HOME" ? (
        <HomeScreen
          userName="YERAY"
          vouchers={vouchers}
          onPressBuyMore={() => setCurrentView("BUY")}
        />
      ) : (
        <BuyVouchersScreen
          onBack={() => setCurrentView("HOME")}
          onFinishPurchase={handleFinishPurchase}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
  },
});
