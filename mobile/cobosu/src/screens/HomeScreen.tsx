import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";

export interface UserVoucher {
  id: string;
  serviceName: string;
  code: string;
  durationMin: number;
  remainingSessions: number;
  totalSessions: number;
  expiresAt: string;
  isLow: boolean;
}

interface HomeScreenProps {
  userName?: string;
  onPressBuyMore?: () => void;
  onLogout?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userName = "YERAY",
  onPressBuyMore,
  onLogout,
}) => {
  const [vouchers] = useState<UserVoucher[]>([
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

  const handleBuyMore = () => {
    if (onPressBuyMore) {
      onPressBuyMore();
    } else {
      Alert.alert(
        "Compra de Bonos",
        "Paso siguiente: catálogo de bonos con selector y carrito."
      );
    }
  };

  const totalRemaining = vouchers.reduce((sum, v) => sum + v.remainingSessions, 0);

  return (
    <View style={styles.root}>
      {/* 1. BARRA SUPERIOR ARQUITECTÓNICA */}
      <View style={styles.topBar}>
        <View style={styles.brandBlock}>
          <Text style={styles.brandTitle}>COBOSU</Text>
          <Text style={styles.brandSub}>CENTRO DE RENDIMIENTO</Text>
        </View>

        <View style={styles.accountBlock}>
          <View style={styles.statusBox}>
            <View style={styles.statusSquare} />
            <Text style={styles.statusText}>ACTIVO</Text>
          </View>
          {onLogout && (
            <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>SALIR</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. PANEL PRINCIPAL: FICHA TÉCNICA DEL SOCIO */}
        <View style={styles.panelBlock}>
          {/* Fila superior: ID y Sedes */}
          <View style={styles.panelHeaderRow}>
            <Text style={styles.memberIdLabel}>SOCIO // {userName.toUpperCase()}</Text>
            <Text style={styles.locationTag}>VIZCAYA · INDEPENDENCIA</Text>
          </View>

          {/* Cifra de sesiones */}
          <View style={styles.metricSection}>
            <Text style={styles.metricSub}>TOTAL DISPONIBLE</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricNumber}>{totalRemaining}</Text>
              <Text style={styles.metricUnit}>SESIONES</Text>
            </View>
          </View>

          {/* Resumen en cuadrícula nítida */}
          <View style={styles.gridSummary}>
            <View style={styles.gridCol}>
              <Text style={styles.gridColLabel}>BONOS ACTIVOS</Text>
              <Text style={styles.gridColValue}>{vouchers.length}</Text>
            </View>
            <View style={styles.gridBorder} />
            <View style={styles.gridCol}>
              <Text style={styles.gridColLabel}>CENTROS HABILITADOS</Text>
              <Text style={styles.gridColValue}>AMBAS SEDES</Text>
            </View>
          </View>
        </View>

        {/* 3. BOTÓN PRINCIPAL GEOMÉTRICO: COMPRAR MÁS BONOS */}
        <TouchableOpacity style={styles.ctaButton} onPress={handleBuyMore} activeOpacity={0.85}>
          <Text style={styles.ctaButtonText}>COMPRAR MÁS BONOS</Text>
          <Text style={styles.ctaButtonArrow}>→</Text>
        </TouchableOpacity>

        {/* 4. SECCIÓN TÉCNICA: DESGLOSE DE BONOS */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ESTADO DE TUS BONOS</Text>
          <Text style={styles.sectionIndex}>{vouchers.length} REGISTROS</Text>
        </View>

        {vouchers.map((v) => {
          const percent = (v.remainingSessions / v.totalSessions) * 100;

          return (
            <View key={v.id} style={styles.voucherItem}>
              {/* Cabecera del bono */}
              <View style={styles.voucherTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.voucherCode}>{v.code} · {v.durationMin} MIN</Text>
                  <Text style={styles.voucherName}>{v.serviceName}</Text>
                </View>

                {/* Recuadro de sesiones con esquina recta */}
                <View style={[styles.countBox, v.isLow && styles.countBoxAlert]}>
                  <Text style={[styles.countNum, v.isLow && styles.countNumAlert]}>
                    {v.remainingSessions}
                  </Text>
                  <Text style={[styles.countTotal, v.isLow && styles.countTotalAlert]}>
                    / {v.totalSessions}
                  </Text>
                </View>
              </View>

              {/* Barra de progreso de línea fina milimétrica (2px) */}
              <View style={styles.hairlineTrack}>
                <View
                  style={[
                    styles.hairlineFill,
                    { width: `${Math.max(4, percent)}%` },
                    v.isLow && styles.hairlineFillAlert,
                  ]}
                />
              </View>

              {/* Alerta de renovación con borde rectangular técnico */}
              {v.isLow ? (
                <View style={styles.alertBox}>
                  <Text style={styles.alertIndicator}>!</Text>
                  <Text style={styles.alertText}>
                    Te quedan solo {v.remainingSessions} sesiones. Renueva tu bono para asegurar continuidad de reserva.
                  </Text>
                </View>
              ) : (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Caducidad: {v.expiresAt}</Text>
                  <Text style={styles.metaLabel}>Consumidas: {v.totalSessions - v.remainingSessions}</Text>
                </View>
              )}

              {/* Pie de acción directa */}
              <View style={styles.voucherFooter}>
                <Text style={styles.voucherFooterNote}>
                  Válido indistintamente en Vizcaya o Independencia
                </Text>
                <TouchableOpacity onPress={handleBuyMore} style={styles.rechargeBtn}>
                  <Text style={styles.rechargeBtnText}>RECARGAR</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* 5. NAVEGACIÓN INFERIOR DE LÍNEA PURA */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navLabelActive}>INICIO</Text>
          <View style={styles.navDotActive} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={handleBuyMore}>
          <Text style={styles.navLabel}>BONOS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => Alert.alert("Reservar", "Próximo paso: calendario de citas.")}
        >
          <Text style={styles.navLabel}>RESERVAR</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={onLogout}>
          <Text style={styles.navLabel}>CUENTA</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#09090b", // Fondo negro carbón neutro
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
  brandBlock: {
    gap: 2,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 4,
    lineHeight: 26,
  },
  brandSub: {
    fontSize: 8,
    fontWeight: "700",
    color: "#a1a1aa",
    letterSpacing: 2,
  },
  accountBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2, // Esquinas rectas
  },
  statusSquare: {
    width: 6,
    height: 6,
    backgroundColor: "#22c55e",
  },
  statusText: {
    color: "#e4e4e7",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  logoutBtn: {
    paddingVertical: 4,
  },
  logoutText: {
    color: "#71717a",
    fontSize: 10,
    fontWeight: "700",
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
  panelBlock: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 4, // Sin formas redondeadas infantiles
    padding: 20,
    marginBottom: 14,
  },
  panelHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#1f1f23",
    paddingBottom: 12,
  },
  memberIdLabel: {
    color: "#e4e4e7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  locationTag: {
    color: "#dc2626", // Rojo Cobosu técnico
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  metricSection: {
    paddingVertical: 18,
  },
  metricSub: {
    color: "#71717a",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginTop: 4,
  },
  metricNumber: {
    fontSize: 54,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -1,
    lineHeight: 56,
  },
  metricUnit: {
    fontSize: 13,
    fontWeight: "800",
    color: "#a1a1aa",
    letterSpacing: 1.5,
  },
  gridSummary: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#1f1f23",
    paddingTop: 14,
  },
  gridCol: {
    flex: 1,
  },
  gridColLabel: {
    color: "#71717a",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  gridColValue: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 3,
  },
  gridBorder: {
    width: 1,
    backgroundColor: "#1f1f23",
    marginHorizontal: 16,
  },
  ctaButton: {
    backgroundColor: "#dc2626", // Rojo Cobosu con presencia nítida
    borderRadius: 4, // Esquinas arquitectónicas rectas
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  ctaButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2,
  },
  ctaButtonArrow: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: "#18181b",
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#a1a1aa",
    letterSpacing: 1.8,
  },
  sectionIndex: {
    fontSize: 10,
    fontWeight: "700",
    color: "#52525b",
    letterSpacing: 1,
  },
  voucherItem: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 4, // Recto y limpio
    padding: 16,
    marginBottom: 12,
  },
  voucherTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  voucherCode: {
    fontSize: 9,
    fontWeight: "800",
    color: "#dc2626",
    letterSpacing: 1.5,
  },
  voucherName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 3,
    letterSpacing: 0.3,
  },
  countBox: {
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  countBoxAlert: {
    borderColor: "#eab308",
    backgroundColor: "rgba(234, 179, 8, 0.08)",
  },
  countNum: {
    fontSize: 16,
    fontWeight: "900",
    color: "#ffffff",
  },
  countNumAlert: {
    color: "#eab308",
  },
  countTotal: {
    fontSize: 10,
    color: "#71717a",
    fontWeight: "700",
  },
  countTotalAlert: {
    color: "#ca8a04",
  },
  hairlineTrack: {
    height: 2, // Fino y preciso en vez de barra gruesa redondeada
    backgroundColor: "#27272a",
    marginVertical: 14,
  },
  hairlineFill: {
    height: "100%",
    backgroundColor: "#dc2626",
  },
  hairlineFillAlert: {
    backgroundColor: "#eab308",
  },
  alertBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderLeftWidth: 2,
    borderColor: "#eab308",
    paddingLeft: 10,
    marginBottom: 12,
  },
  alertIndicator: {
    color: "#eab308",
    fontWeight: "900",
    fontSize: 12,
    marginTop: -1,
  },
  alertText: {
    color: "#d4d4d8",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  metaLabel: {
    color: "#71717a",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  voucherFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#1a1a1f",
    paddingTop: 12,
  },
  voucherFooterNote: {
    color: "#52525b",
    fontSize: 10,
    fontWeight: "600",
  },
  rechargeBtn: {
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rechargeBtnText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  navBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#09090b",
    borderTopWidth: 1,
    borderColor: "#18181b",
    paddingVertical: 14,
    paddingBottom: 24,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  navLabelActive: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  navDotActive: {
    width: 14,
    height: 2,
    backgroundColor: "#dc2626",
    marginTop: 4,
  },
  navLabel: {
    color: "#52525b",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
});
