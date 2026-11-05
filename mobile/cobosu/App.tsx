import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import { HomeScreen, UserVoucher } from "./src/screens/HomeScreen";
import { BuyVouchersScreen, CartItem } from "./src/screens/BuyVouchersScreen";
import { BookingScreen, Appointment } from "./src/screens/BookingScreen";

type ActiveView = "HOME" | "BUY" | "BOOKING";

const BACKEND_URL = "http://localhost:3000";

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

  // Sincronizar con el calendario del servidor al inicio
  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/cobosu/calendar`);
        if (res.ok) {
          const data = await res.json();
          if (data.appointments && data.appointments.length > 0) {
            setAppointments(data.appointments);
          }
        }
      } catch {
        // En caso de que el backend no esté listo, mantenemos las citas iniciales
      }
    };
    fetchCalendar();
  }, []);

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

  // 2. Confirmar nueva reserva (descuenta 1 sesión del bono y sincroniza con el calendario de recepción)
  const handleConfirmBooking = async (newAppt: Appointment) => {
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

    // Guardar en la base de datos del calendario para que aparezca en el software de recepción
    try {
      const res = await fetch(`${BACKEND_URL}/api/cobosu/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: newAppt.centerId,
          serviceId: newAppt.serviceId,
          date: newAppt.dateStr,
          timeSlot: newAppt.timeSlot,
          notes: `Reserva app móvil Cobosu - ${newAppt.serviceName}`
        }),
      });
      if (res.ok) {
        const created = await res.json();
        if (created.booking?.id) {
          setAppointments((prev) =>
            prev.map((a) => (a.id === newAppt.id ? { ...a, id: created.booking.id } : a))
          );
        }
      }
    } catch (err) {
      console.warn("Backend del calendario no contactado, reserva guardada en local:", err);
    }
  };

  // 3. Cancelar reserva (restituye 1 sesión al bono y anula en recepción)
  const handleCancelAppointment = async (appointmentId: string) => {
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

    try {
      await fetch(`${BACKEND_URL}/api/cobosu/bookings/${encodeURIComponent(appointmentId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.warn("Backend del calendario no contactado:", err);
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
