import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import { HomeScreen, UserVoucher } from "./src/screens/HomeScreen";
import { BuyVouchersScreen, CartItem } from "./src/screens/BuyVouchersScreen";
import { BookingScreen, Appointment } from "./src/screens/BookingScreen";

type ActiveView = "HOME" | "BUY" | "BOOKING";

export default function App() {
  const [currentView, setCurrentView] = useState<ActiveView>("HOME");

  // Estado de bonos del socio
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

  // Lista de citas programadas del socio (la siguiente visible de inmediato)
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: "appt-01",
      centerId: "vizcaya",
      centerName: "Cobosu Vizcaya",
      serviceId: "v-gym",
      serviceName: "Entrenamiento en Gimnasio",
      durationMin: 60,
      dateStr: "2026-11-07",
      dateFormatted: "Sábado, 7 Noviembre 2026",
      timeSlot: "11:30",
      status: "CONFIRMADA",
    },
  ]);

  // Siguiente cita confirmada
  const nextAppt = appointments.find((a) => a.status === "CONFIRMADA") || null;

  // 1. Confirmar compra de bonos
  const handleFinishPurchase = (items: CartItem[], totalAmount: number) => {
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

  // 2. Confirmar nueva reserva (descuenta 1 sesión del bono)
  const handleConfirmBooking = (newAppt: Appointment) => {
    setAppointments((prev) => [newAppt, ...prev]);

    // Descontar 1 sesión del bono correspondiente
    setVouchers((prev) =>
      prev.map((v) => {
        const matches = newAppt.serviceName.toLowerCase().includes("gimnasio")
          ? v.serviceName.toLowerCase().includes("gimnasio")
          : v.serviceName.toLowerCase().includes("cabina");

        if (matches && v.remainingSessions > 0) {
          const newRemaining = v.remainingSessions - 1;
          return {
            ...v,
            remainingSessions: newRemaining,
            isLow: newRemaining <= 2,
          };
        }
        return v;
      })
    );
  };

  // 3. Cancelar reserva (restituye 1 sesión al bono)
  const handleCancelAppointment = (appointmentId: string) => {
    const appt = appointments.find((a) => a.id === appointmentId);
    setAppointments((prev) => prev.filter((a) => a.id !== appointmentId));

    if (appt) {
      setVouchers((prev) =>
        prev.map((v) => {
          const matches = appt.serviceName.toLowerCase().includes("gimnasio")
            ? v.serviceName.toLowerCase().includes("gimnasio")
            : v.serviceName.toLowerCase().includes("cabina");

          if (matches) {
            const newRemaining = v.remainingSessions + 1;
            return {
              ...v,
              remainingSessions: newRemaining,
              isLow: newRemaining <= 2,
            };
          }
          return v;
        })
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {currentView === "HOME" && (
        <HomeScreen
          userName="YERAY"
          vouchers={vouchers}
          upcomingAppointment={
            nextAppt
              ? {
                  id: nextAppt.id,
                  serviceName: nextAppt.serviceName,
                  centerName: nextAppt.centerName,
                  dateFormatted: nextAppt.dateFormatted,
                  timeSlot: nextAppt.timeSlot,
                }
              : null
          }
          onPressBuyMore={() => setCurrentView("BUY")}
          onPressReservar={() => setCurrentView("BOOKING")}
        />
      )}

      {currentView === "BUY" && (
        <BuyVouchersScreen
          onBack={() => setCurrentView("HOME")}
          onFinishPurchase={handleFinishPurchase}
        />
      )}

      {currentView === "BOOKING" && (
        <BookingScreen
          vouchers={vouchers}
          upcomingAppointments={appointments}
          onBack={() => setCurrentView("HOME")}
          onConfirmBooking={handleConfirmBooking}
          onCancelAppointment={handleCancelAppointment}
          onGoToBuyVouchers={() => setCurrentView("BUY")}
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
