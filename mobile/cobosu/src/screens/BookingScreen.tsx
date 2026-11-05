import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { UserVoucher } from "./HomeScreen";

export interface Appointment {
  id: string;
  centerId: "vizcaya" | "independencia";
  centerName: string;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  dateStr: string; // "2026-11-06"
  dateFormatted: string; // "Viernes, 6 Noviembre 2026"
  timeSlot: string; // "18:30"
  status: "CONFIRMADA" | "COMPLETADA" | "CANCELADA";
}

interface BookingScreenProps {
  vouchers: UserVoucher[];
  upcomingAppointments: Appointment[];
  onBack: () => void;
  onConfirmBooking: (appointment: Appointment) => void;
  onCancelAppointment: (appointmentId: string) => void;
  onGoToBuyVouchers: () => void;
}

export const BookingScreen: React.FC<BookingScreenProps> = ({
  vouchers,
  upcomingAppointments,
  onBack,
  onConfirmBooking,
  onCancelAppointment,
  onGoToBuyVouchers,
}) => {
  // Próxima cita más inmediata (la primera de la lista activa)
  const nextAppointment = upcomingAppointments.find(
    (a) => a.status === "CONFIRMADA"
  );

  // Estados del selector de nueva reserva
  const [selectedCenter, setSelectedCenter] = useState<"vizcaya" | "independencia">("vizcaya");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("v-gym");

  // Días disponibles (próximos 7 días)
  const availableDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1); // Empezando desde mañana
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const weekday = d.toLocaleDateString("es-ES", { weekday: "short" }).toUpperCase();
    const month = d.toLocaleDateString("es-ES", { month: "short" }).toUpperCase();
    return {
      isoDate: `${yyyy}-${mm}-${dd}`,
      dayNum: dd,
      weekday,
      month,
      fullFormatted: d.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    };
  });

  const [selectedDateIso, setSelectedDateIso] = useState<string>(
    availableDays[0]?.isoDate || ""
  );

  // Horarios disponibles según centro
  const timeSlots = [
    "08:00",
    "09:15",
    "10:30",
    "12:00",
    "16:00",
    "17:15",
    "18:30",
    "19:45",
    "20:45",
  ];
  const [selectedSlot, setSelectedSlot] = useState<string>(timeSlots[4] || "16:00");

  // Servicios configurados para reservar
  const servicesList = [
    {
      id: "v-gym",
      name: "Entrenamiento en Gimnasio",
      categoryLabel: "SALA DE FUERZA",
      durationMin: 60,
    },
    {
      id: "v-cabin-30",
      name: "Cabina de Recuperación",
      categoryLabel: "RECUPERACIÓN ACTIVA",
      durationMin: 30,
    },
    {
      id: "v-cabin-15",
      name: "Cabina Rápida (15 min)",
      categoryLabel: "DESCARGA / CRIOTERAPIA",
      durationMin: 15,
    },
    {
      id: "v-cabin-60",
      name: "Cabina Intensiva (1 hora)",
      categoryLabel: "TRATAMIENTO COMPLETO",
      durationMin: 60,
    },
  ];

  const currentService = servicesList.find((s) => s.id === selectedServiceId) || servicesList[0];

  // Comprobar bono activo para este tipo de servicio
  const matchingVoucher = vouchers.find(
    (v) =>
      v.remainingSessions > 0 &&
      (selectedServiceId.includes("gym")
        ? v.serviceName.toLowerCase().includes("gimnasio")
        : v.serviceName.toLowerCase().includes("cabina"))
  );

  const handleBook = () => {
    if (!matchingVoucher) {
      Alert.alert(
        "Sin Saldo en tu Bono",
        "No dispones de sesiones activas para este servicio. ¿Deseas adquirir un bono?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Comprar Bono", onPress: onGoToBuyVouchers },
        ]
      );
      return;
    }

    const dayObj = availableDays.find((d) => d.isoDate === selectedDateIso) || availableDays[0];
    const centerTitle =
      selectedCenter === "vizcaya" ? "Cobosu Vizcaya" : "Cobosu Independencia";

    const newAppointment: Appointment = {
      id: `appt-${Date.now()}`,
      centerId: selectedCenter,
      centerName: centerTitle,
      serviceId: currentService.id,
      serviceName: currentService.name,
      durationMin: currentService.durationMin,
      dateStr: dayObj.isoDate,
      dateFormatted: dayObj.fullFormatted,
      timeSlot: selectedSlot,
      status: "CONFIRMADA",
    };

    onConfirmBooking(newAppointment);

    Alert.alert(
      "Reserva Confirmada",
      `Cita programada con éxito:\n\n📍 ${centerTitle}\n🗓️ ${dayObj.fullFormatted}\n⏱️ ${selectedSlot} h\n\nSe ha descontado 1 sesión de tu bono (${matchingVoucher.remainingSessions - 1} restantes).`,
      [{ text: "Entendido" }]
    );
  };

  const handleCancelPrompt = (appt: Appointment) => {
    Alert.alert(
      "Cancelar Reserva",
      `¿Deseas anular la cita del ${appt.dateFormatted} a las ${appt.timeSlot} h?\nLa sesión será restituida a tu bono.`,
      [
        { text: "No, mantener cita", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: () => onCancelAppointment(appt.id),
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      {/* 1. CABECERA TÉCNICA */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← VOLVER</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>AGENDA DE RESERVAS</Text>
        <Text style={styles.screenIndicator}>COBOSU MULTICENTRO</Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. SECCIÓN: CUÁNDO TIENE LA SIGUIENTE (PRÓXIMA CITA) */}
        <View style={styles.sectionHeaderLine}>
          <Text style={styles.sectionHeaderTitle}>TU PRÓXIMA CITA PROGRAMADA</Text>
        </View>

        {nextAppointment ? (
          <View style={styles.nextAppointmentCard}>
            <View style={styles.nextApptHeaderRow}>
              <View style={styles.confirmedBadge}>
                <View style={styles.confirmedDot} />
                <Text style={styles.confirmedText}>CONFIRMADA</Text>
              </View>
              <Text style={styles.nextApptId}>ID // #{nextAppointment.id.slice(-6)}</Text>
            </View>

            <View style={styles.nextApptBody}>
              <Text style={styles.nextApptService}>{nextAppointment.serviceName}</Text>
              <Text style={styles.nextApptCenter}>📍 {nextAppointment.centerName.toUpperCase()}</Text>

              <View style={styles.nextApptDateTimeBox}>
                <View style={styles.timeBoxCol}>
                  <Text style={styles.timeBoxLabel}>FECHA</Text>
                  <Text style={styles.timeBoxValue}>{nextAppointment.dateFormatted.toUpperCase()}</Text>
                </View>
                <View style={styles.timeBoxDivider} />
                <View style={styles.timeBoxColNarrow}>
                  <Text style={styles.timeBoxLabel}>HORA</Text>
                  <Text style={styles.timeBoxHour}>{nextAppointment.timeSlot} H</Text>
                </View>
              </View>
            </View>

            <View style={styles.nextApptFooter}>
              <Text style={styles.durationNote}>
                Duración: {nextAppointment.durationMin} min con monitor asignado
              </Text>
              <TouchableOpacity
                onPress={() => handleCancelPrompt(nextAppointment)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>CANCELAR CITA</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyApptBox}>
            <Text style={styles.emptyApptTitle}>NO TIENES CITAS PROGRAMADAS</Text>
            <Text style={styles.emptyApptSub}>
              Selecciona a continuación el centro, servicio y horario para reservar tu siguiente sesión.
            </Text>
          </View>
        )}

        {/* 3. SECCIÓN: FORMULARIO DE NUEVA RESERVA */}
        <View style={[styles.sectionHeaderLine, { marginTop: 24 }]}>
          <Text style={styles.sectionHeaderTitle}>PROGRAMAR NUEVA RESERVA</Text>
        </View>

        {/* PASO 1: SELECCIONAR CENTRO */}
        <Text style={styles.stepLabel}>1. CENTRO // SEDE COBOSU</Text>
        <View style={styles.centerSelectorRow}>
          <TouchableOpacity
            style={[
              styles.centerTab,
              selectedCenter === "vizcaya" && styles.centerTabActive,
            ]}
            onPress={() => setSelectedCenter("vizcaya")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.centerTabText,
                selectedCenter === "vizcaya" && styles.centerTabTextActive,
              ]}
            >
              COBOSU VIZCAYA
            </Text>
            <Text style={styles.centerTabSub}>POZA 14 · BILBAO</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.centerTab,
              selectedCenter === "independencia" && styles.centerTabActive,
            ]}
            onPress={() => setSelectedCenter("independencia")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.centerTabText,
                selectedCenter === "independencia" && styles.centerTabTextActive,
              ]}
            >
              COBOSU INDEPENDENCIA
            </Text>
            <Text style={styles.centerTabSub}>GRAN VÍA 32 · BILBAO</Text>
          </TouchableOpacity>
        </View>

        {/* PASO 2: SELECCIONAR SERVICIO */}
        <Text style={styles.stepLabel}>2. SERVICIO A RESERVAR</Text>
        <View style={styles.serviceSelectorCol}>
          {servicesList.map((srv) => {
            const isSelected = selectedServiceId === srv.id;
            return (
              <TouchableOpacity
                key={srv.id}
                style={[
                  styles.serviceChoiceItem,
                  isSelected && styles.serviceChoiceItemActive,
                ]}
                onPress={() => setSelectedServiceId(srv.id)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceChoiceCategory}>{srv.categoryLabel}</Text>
                  <Text style={styles.serviceChoiceTitle}>{srv.name}</Text>
                </View>
                <Text style={styles.serviceChoiceDuration}>{srv.durationMin} MIN</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ESTADO DEL BONO DISPONIBLE PARA ESTE SERVICIO */}
        <View
          style={[
            styles.voucherStatusNotice,
            matchingVoucher ? styles.voucherStatusOk : styles.voucherStatusEmpty,
          ]}
        >
          {matchingVoucher ? (
            <View style={styles.voucherStatusRow}>
              <View style={styles.voucherStatusSquareOk} />
              <View style={{ flex: 1 }}>
                <Text style={styles.voucherStatusTitle}>
                  BONO DISPONIBLE // {matchingVoucher.remainingSessions} SESIONES RESTANTES
                </Text>
                <Text style={styles.voucherStatusSub}>
                  Se descontará 1 sesión al confirmar esta reserva.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.voucherStatusRow}>
              <View style={styles.voucherStatusSquareAlert} />
              <View style={{ flex: 1 }}>
                <Text style={styles.voucherStatusAlertTitle}>
                  SIN SESIONES DE ESTE SERVICIO
                </Text>
                <Text style={styles.voucherStatusAlertSub}>
                  Necesitas adquirir un bono antes de poder confirmar cita.
                </Text>
              </View>
              <TouchableOpacity onPress={onGoToBuyVouchers} style={styles.quickBuyLink}>
                <Text style={styles.quickBuyLinkText}>COMPRAR</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* PASO 3: SELECCIONAR DÍA */}
        <Text style={styles.stepLabel}>3. FECHA DE LA CITA</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daysRail}
        >
          {availableDays.map((d) => {
            const isSelected = selectedDateIso === d.isoDate;
            return (
              <TouchableOpacity
                key={d.isoDate}
                style={[styles.dayCard, isSelected && styles.dayCardActive]}
                onPress={() => setSelectedDateIso(d.isoDate)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dayWeekday, isSelected && styles.dayActiveText]}>
                  {d.weekday}
                </Text>
                <Text style={[styles.dayNum, isSelected && styles.dayActiveText]}>
                  {d.dayNum}
                </Text>
                <Text style={[styles.dayMonth, isSelected && styles.dayActiveText]}>
                  {d.month}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* PASO 4: SELECCIONAR FRANJA HORARIA */}
        <Text style={styles.stepLabel}>4. HORA DISPONIBLE</Text>
        <View style={styles.slotsGrid}>
          {timeSlots.map((slot) => {
            const isSelected = selectedSlot === slot;
            return (
              <TouchableOpacity
                key={slot}
                style={[styles.slotItem, isSelected && styles.slotItemActive]}
                onPress={() => setSelectedSlot(slot)}
                activeOpacity={0.8}
              >
                <Text style={[styles.slotItemText, isSelected && styles.slotItemTextActive]}>
                  {slot}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* RESUMEN TÉCNICO Y BOTÓN DE CONFIRMACIÓN */}
        <View style={styles.confirmBox}>
          <View style={styles.confirmHeader}>
            <Text style={styles.confirmHeaderLabel}>RESUMEN DE RESERVA</Text>
            <Text style={styles.confirmCostTag}>
              {matchingVoucher ? "COSTE: 1 SESIÓN" : "REQUIERE BONO"}
            </Text>
          </View>

          <View style={styles.confirmDataRow}>
            <Text style={styles.confirmDataKey}>CENTRO:</Text>
            <Text style={styles.confirmDataVal}>
              {selectedCenter === "vizcaya" ? "COBOSU VIZCAYA (POZA 14)" : "COBOSU INDEPENDENCIA (GRAN VÍA 32)"}
            </Text>
          </View>

          <View style={styles.confirmDataRow}>
            <Text style={styles.confirmDataKey}>SERVICIO:</Text>
            <Text style={styles.confirmDataVal}>
              {currentService.name} ({currentService.durationMin} MIN)
            </Text>
          </View>

          <View style={styles.confirmDataRow}>
            <Text style={styles.confirmDataKey}>HORARIO:</Text>
            <Text style={styles.confirmDataVal}>
              {selectedDateIso} A LAS {selectedSlot} H
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.bookCtaBtn, !matchingVoucher && styles.bookCtaBtnDisabled]}
            onPress={handleBook}
            activeOpacity={0.88}
          >
            <Text style={styles.bookCtaBtnText}>
              {matchingVoucher ? "CONFIRMAR RESERVA (1 SESIÓN) →" : "COMPRAR BONO PARA RESERVAR"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#09090b",
    borderBottomWidth: 1,
    borderColor: "#18181b",
  },
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  backBtnText: {
    color: "#a1a1aa",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  screenTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 2,
  },
  screenIndicator: {
    fontSize: 8,
    fontWeight: "800",
    color: "#dc2626",
    letterSpacing: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  sectionHeaderLine: {
    borderBottomWidth: 1,
    borderColor: "#1f1f23",
    paddingBottom: 8,
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 9,
    fontWeight: "900",
    color: "#a1a1aa",
    letterSpacing: 1.8,
  },
  nextAppointmentCard: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 18,
    marginBottom: 16,
  },
  nextApptHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#1f1f23",
    paddingBottom: 10,
  },
  confirmedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  confirmedDot: {
    width: 6,
    height: 6,
    backgroundColor: "#22c55e",
  },
  confirmedText: {
    color: "#22c55e",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  nextApptId: {
    color: "#71717a",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  nextApptBody: {
    paddingVertical: 14,
  },
  nextApptService: {
    fontSize: 16,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  nextApptCenter: {
    fontSize: 10,
    fontWeight: "800",
    color: "#dc2626",
    letterSpacing: 1.2,
    marginTop: 3,
  },
  nextApptDateTimeBox: {
    flexDirection: "row",
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 12,
    marginTop: 12,
  },
  timeBoxCol: {
    flex: 1,
  },
  timeBoxColNarrow: {
    paddingLeft: 14,
    alignItems: "flex-end",
  },
  timeBoxDivider: {
    width: 1,
    backgroundColor: "#27272a",
  },
  timeBoxLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#71717a",
    letterSpacing: 1.2,
  },
  timeBoxValue: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 3,
    letterSpacing: 0.5,
  },
  timeBoxHour: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 2,
  },
  nextApptFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#1f1f23",
    paddingTop: 12,
  },
  durationNote: {
    color: "#71717a",
    fontSize: 10,
    fontWeight: "600",
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  cancelBtnText: {
    color: "#ef4444",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  emptyApptBox: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 18,
    alignItems: "center",
    marginBottom: 16,
  },
  emptyApptTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#a1a1aa",
    letterSpacing: 1.5,
  },
  emptyApptSub: {
    fontSize: 11,
    color: "#71717a",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#a1a1aa",
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 10,
  },
  centerSelectorRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  centerTab: {
    flex: 1,
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 12,
  },
  centerTabActive: {
    borderColor: "#dc2626",
    backgroundColor: "rgba(220, 38, 38, 0.1)",
  },
  centerTabText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#a1a1aa",
    letterSpacing: 1,
  },
  centerTabTextActive: {
    color: "#ffffff",
  },
  centerTabSub: {
    fontSize: 8,
    fontWeight: "700",
    color: "#71717a",
    letterSpacing: 0.8,
    marginTop: 3,
  },
  serviceSelectorCol: {
    gap: 6,
    marginBottom: 14,
  },
  serviceChoiceItem: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  serviceChoiceItemActive: {
    borderColor: "#dc2626",
    backgroundColor: "rgba(220, 38, 38, 0.1)",
  },
  serviceChoiceCategory: {
    fontSize: 8,
    fontWeight: "800",
    color: "#71717a",
    letterSpacing: 1,
  },
  serviceChoiceTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 2,
  },
  serviceChoiceDuration: {
    fontSize: 10,
    fontWeight: "800",
    color: "#dc2626",
    letterSpacing: 1,
  },
  voucherStatusNotice: {
    borderWidth: 1,
    borderRadius: 2,
    padding: 12,
    marginBottom: 16,
  },
  voucherStatusOk: {
    backgroundColor: "rgba(34, 197, 94, 0.06)",
    borderColor: "rgba(34, 197, 94, 0.25)",
  },
  voucherStatusEmpty: {
    backgroundColor: "rgba(234, 179, 8, 0.06)",
    borderColor: "rgba(234, 179, 8, 0.25)",
  },
  voucherStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  voucherStatusSquareOk: {
    width: 6,
    height: 6,
    backgroundColor: "#22c55e",
  },
  voucherStatusSquareAlert: {
    width: 6,
    height: 6,
    backgroundColor: "#eab308",
  },
  voucherStatusTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: "#22c55e",
    letterSpacing: 1,
  },
  voucherStatusSub: {
    fontSize: 10,
    color: "#a1a1aa",
    marginTop: 2,
  },
  voucherStatusAlertTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: "#eab308",
    letterSpacing: 1,
  },
  voucherStatusAlertSub: {
    fontSize: 10,
    color: "#a1a1aa",
    marginTop: 2,
  },
  quickBuyLink: {
    borderWidth: 1,
    borderColor: "#dc2626",
    backgroundColor: "#dc2626",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  quickBuyLinkText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  daysRail: {
    gap: 8,
    marginBottom: 16,
  },
  dayCard: {
    width: 64,
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    paddingVertical: 10,
    alignItems: "center",
  },
  dayCardActive: {
    borderColor: "#dc2626",
    backgroundColor: "#dc2626",
  },
  dayWeekday: {
    fontSize: 9,
    fontWeight: "800",
    color: "#71717a",
    letterSpacing: 1,
  },
  dayNum: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
    marginVertical: 2,
  },
  dayMonth: {
    fontSize: 8,
    fontWeight: "700",
    color: "#71717a",
  },
  dayActiveText: {
    color: "#ffffff",
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  slotItem: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    paddingVertical: 12,
    alignItems: "center",
  },
  slotItemActive: {
    borderColor: "#dc2626",
    backgroundColor: "rgba(220, 38, 38, 0.15)",
  },
  slotItemText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#a1a1aa",
    letterSpacing: 1,
  },
  slotItemTextActive: {
    color: "#ffffff",
  },
  confirmBox: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 16,
    gap: 8,
  },
  confirmHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#1f1f23",
    paddingBottom: 8,
    marginBottom: 4,
  },
  confirmHeaderLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#a1a1aa",
    letterSpacing: 1.5,
  },
  confirmCostTag: {
    fontSize: 9,
    fontWeight: "900",
    color: "#dc2626",
    letterSpacing: 1,
  },
  confirmDataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  confirmDataKey: {
    fontSize: 10,
    fontWeight: "800",
    color: "#71717a",
    letterSpacing: 1,
  },
  confirmDataVal: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  bookCtaBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 2,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  bookCtaBtnDisabled: {
    backgroundColor: "#27272a",
  },
  bookCtaBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
});

