import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";

export type ServiceType = "GIMNASIO" | "CABINA";
export type CabinDuration = 15 | 30 | 60;

export interface CartItem {
  id: string;
  serviceName: string;
  category: ServiceType;
  durationMin: number;
  sessions: number;
  unitPrice: number;
  totalPrice: number;
  isPack: boolean;
}

interface ServiceConfig {
  id: string;
  name: string;
  category: ServiceType;
  durationMin: number;
  pricePerSession: number;
  packs: Array<{
    sessions: number;
    totalPrice: number;
    pricePerSession: number;
    discountPercent: number;
  }>;
}

interface BuyVouchersScreenProps {
  onBack: () => void;
  onFinishPurchase?: (items: CartItem[], totalAmount: number) => void;
}

export const BuyVouchersScreen: React.FC<BuyVouchersScreenProps> = ({
  onBack,
  onFinishPurchase,
}) => {
  // Pestaña principal: GIMNASIO o CABINAS
  const [selectedCategory, setSelectedCategory] = useState<ServiceType>("GIMNASIO");
  // Duración seleccionada para cabinas: 15, 30 o 60 min
  const [selectedCabinDuration, setSelectedCabinDuration] = useState<CabinDuration>(30);

  // Contador del selector personalizado (+ y -)
  const [customQuantity, setCustomQuantity] = useState<number>(1);

  // Cesta / Carrito de compra
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);

  // Catálogo de servicios con precios por sesión y bonos predefinidos (5, 10, 20, 30, 40)
  const catalog: Record<string, ServiceConfig> = {
    gym: {
      id: "gym-60",
      name: "Entrenamiento en Gimnasio",
      category: "GIMNASIO",
      durationMin: 60,
      pricePerSession: 15.0,
      packs: [
        { sessions: 5, totalPrice: 70, pricePerSession: 14.0, discountPercent: 7 },
        { sessions: 10, totalPrice: 130, pricePerSession: 13.0, discountPercent: 13 },
        { sessions: 20, totalPrice: 240, pricePerSession: 12.0, discountPercent: 20 },
        { sessions: 30, totalPrice: 330, pricePerSession: 11.0, discountPercent: 27 },
        { sessions: 40, totalPrice: 400, pricePerSession: 10.0, discountPercent: 33 },
      ],
    },
    cabin15: {
      id: "cabin-15",
      name: "Cabina de Recuperación (15 min)",
      category: "CABINA",
      durationMin: 15,
      pricePerSession: 10.0,
      packs: [
        { sessions: 5, totalPrice: 45, pricePerSession: 9.0, discountPercent: 10 },
        { sessions: 10, totalPrice: 80, pricePerSession: 8.0, discountPercent: 20 },
        { sessions: 20, totalPrice: 150, pricePerSession: 7.5, discountPercent: 25 },
        { sessions: 30, totalPrice: 210, pricePerSession: 7.0, discountPercent: 30 },
        { sessions: 40, totalPrice: 260, pricePerSession: 6.5, discountPercent: 35 },
      ],
    },
    cabin30: {
      id: "cabin-30",
      name: "Cabina de Recuperación (30 min)",
      category: "CABINA",
      durationMin: 30,
      pricePerSession: 18.0,
      packs: [
        { sessions: 5, totalPrice: 85, pricePerSession: 17.0, discountPercent: 6 },
        { sessions: 10, totalPrice: 160, pricePerSession: 16.0, discountPercent: 11 },
        { sessions: 20, totalPrice: 300, pricePerSession: 15.0, discountPercent: 17 },
        { sessions: 30, totalPrice: 420, pricePerSession: 14.0, discountPercent: 22 },
        { sessions: 40, totalPrice: 520, pricePerSession: 13.0, discountPercent: 28 },
      ],
    },
    cabin60: {
      id: "cabin-60",
      name: "Cabina de Recuperación (60 min)",
      category: "CABINA",
      durationMin: 60,
      pricePerSession: 32.0,
      packs: [
        { sessions: 5, totalPrice: 150, pricePerSession: 30.0, discountPercent: 6 },
        { sessions: 10, totalPrice: 280, pricePerSession: 28.0, discountPercent: 12 },
        { sessions: 20, totalPrice: 520, pricePerSession: 26.0, discountPercent: 19 },
        { sessions: 30, totalPrice: 720, pricePerSession: 24.0, discountPercent: 25 },
        { sessions: 40, totalPrice: 880, pricePerSession: 22.0, discountPercent: 31 },
      ],
    },
  };

  // Obtener servicio activo según selección
  const currentService: ServiceConfig =
    selectedCategory === "GIMNASIO"
      ? catalog.gym
      : selectedCabinDuration === 15
      ? catalog.cabin15
      : selectedCabinDuration === 30
      ? catalog.cabin30
      : catalog.cabin60;

  // Ajuste del contador con botones + y -
  const handleQuantityDelta = (delta: number) => {
    setCustomQuantity((prev) => Math.max(1, Math.min(50, prev + delta)));
  };

  // Añadir sesiones personalizadas a la cesta
  const handleAddCustomToCart = () => {
    const totalPrice = customQuantity * currentService.pricePerSession;
    const item: CartItem = {
      id: `${currentService.id}-custom-${Date.now()}`,
      serviceName: `${currentService.name} (${customQuantity} ses.)`,
      category: currentService.category,
      durationMin: currentService.durationMin,
      sessions: customQuantity,
      unitPrice: currentService.pricePerSession,
      totalPrice,
      isPack: false,
    };
    setCart((prev) => [...prev, item]);
    Alert.alert(
      "Añadido a la Cesta",
      `${customQuantity} sesión(es) de ${currentService.name} añadidas (${totalPrice.toFixed(2)} €).`
    );
  };

  // Añadir bono predefinido (5, 10, 20, 30, 40) a la cesta
  const handleAddPackToCart = (pack: ServiceConfig["packs"][0]) => {
    const item: CartItem = {
      id: `${currentService.id}-pack-${pack.sessions}-${Date.now()}`,
      serviceName: `${currentService.name} (Bono ${pack.sessions} ses.)`,
      category: currentService.category,
      durationMin: currentService.durationMin,
      sessions: pack.sessions,
      unitPrice: pack.pricePerSession,
      totalPrice: pack.totalPrice,
      isPack: true,
    };
    setCart((prev) => [...prev, item]);
    Alert.alert(
      "Bono Añadido",
      `Bono de ${pack.sessions} sesiones de ${currentService.name} añadido a la cesta (${pack.totalPrice.toFixed(2)} €).`
    );
  };

  const handleRemoveItem = (id: string) => {
    setCart((prev) => prev.filter((it) => it.id !== id));
  };

  const totalCartAmount = cart.reduce((sum, it) => sum + it.totalPrice, 0);
  const totalCartSessions = cart.reduce((sum, it) => sum + it.sessions, 0);

  const handleProcessCheckout = () => {
    if (cart.length === 0) return;
    const ticketNum = `COB-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    Alert.alert(
      "Pago Único Procesado",
      `Se ha generado el ticket ${ticketNum} por importe de ${totalCartAmount.toFixed(2)} €.\n\nSe han acreditado ${totalCartSessions} sesiones nuevas en tu cuenta, válidas en Cobosu Vizcaya e Independencia.`,
      [
        {
          text: "Aceptar y Volver al Inicio",
          onPress: () => {
            if (onFinishPurchase) {
              onFinishPurchase(cart, totalCartAmount);
            }
            onBack();
          },
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
        <Text style={styles.screenTitle}>COMPRA DE RESERVAS</Text>
        <Text style={styles.screenIndicator}>PASO 1 // SERVICIOS</Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. SELECTOR DE SERVICIO: GIMNASIO / CABINAS */}
        <View style={styles.categorySelector}>
          <TouchableOpacity
            style={[
              styles.categoryTab,
              selectedCategory === "GIMNASIO" && styles.categoryTabActive,
            ]}
            onPress={() => setSelectedCategory("GIMNASIO")}
          >
            <Text
              style={[
                styles.categoryTabText,
                selectedCategory === "GIMNASIO" && styles.categoryTabTextActive,
              ]}
            >
              GIMNASIO // SALA
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.categoryTab,
              selectedCategory === "CABINA" && styles.categoryTabActive,
            ]}
            onPress={() => setSelectedCategory("CABINA")}
          >
            <Text
              style={[
                styles.categoryTabText,
                selectedCategory === "CABINA" && styles.categoryTabTextActive,
              ]}
            >
              CABINAS DE RECUPERACIÓN
            </Text>
          </TouchableOpacity>
        </View>

        {/* SI ES CABINA: SUBSELECTOR DE DURACIÓN (15, 30, 60 MIN) */}
        {selectedCategory === "CABINA" && (
          <View style={styles.durationSelectorWrap}>
            <Text style={styles.durationSelectorLabel}>DURACIÓN DE LA SESIÓN</Text>
            <View style={styles.durationTabsRow}>
              {([15, 30, 60] as CabinDuration[]).map((dur) => {
                const isActive = selectedCabinDuration === dur;
                return (
                  <TouchableOpacity
                    key={dur}
                    style={[styles.durationTab, isActive && styles.durationTabActive]}
                    onPress={() => setSelectedCabinDuration(dur)}
                  >
                    <Text style={[styles.durationTabText, isActive && styles.durationTabTextActive]}>
                      {dur === 60 ? "1 HORA (60M)" : `${dur} MIN`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* FICHA TÉCNICA DEL SERVICIO ACTIVO */}
        <View style={styles.serviceSpecBlock}>
          <View style={styles.specHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.specCategoryTag}>
                {currentService.category} · {currentService.durationMin} MINUTOS
              </Text>
              <Text style={styles.specTitle}>{currentService.name}</Text>
            </View>
            <View style={styles.specPriceBox}>
              <Text style={styles.specPriceValue}>
                {currentService.pricePerSession.toFixed(2)} €
              </Text>
              <Text style={styles.specPriceSub}>/ SESIÓN SUELTA</Text>
            </View>
          </View>
        </View>

        {/* 3. MODO 1: SELECTOR DE CANTIDAD A MEDIDA (+ / −) */}
        <View style={styles.customSection}>
          <View style={styles.sectionHeaderLine}>
            <Text style={styles.sectionHeaderTitle}>CANTIDAD PERSONALIZADA // SESIONES SUELTAS</Text>
          </View>

          <View style={styles.pickerBox}>
            <View style={styles.stepperContainer}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => handleQuantityDelta(-1)}
                activeOpacity={0.7}
              >
                <Text style={styles.stepperBtnSymbol}>−</Text>
              </TouchableOpacity>

              <View style={styles.stepperValueBox}>
                <Text style={styles.stepperValueNum}>{customQuantity}</Text>
                <Text style={styles.stepperValueLabel}>
                  {customQuantity === 1 ? "SESIÓN" : "SESIONES"}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => handleQuantityDelta(1)}
                activeOpacity={0.7}
              >
                <Text style={styles.stepperBtnSymbol}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.addCustomBtn}
              onPress={handleAddCustomToCart}
              activeOpacity={0.85}
            >
              <Text style={styles.addCustomBtnText}>
                AÑADIR A LA CESTA ({(customQuantity * currentService.pricePerSession).toFixed(2)} €)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. MODO 2: BONOS PREDEFINIDOS (5, 10, 20, 30, 40) */}
        <View style={styles.packsSection}>
          <View style={styles.sectionHeaderLine}>
            <Text style={styles.sectionHeaderTitle}>BONOS PREDEFINIDOS // CON DESCUENTO</Text>
          </View>

          <View style={styles.packsGrid}>
            {currentService.packs.map((pack) => (
              <TouchableOpacity
                key={pack.sessions}
                style={styles.packCard}
                onPress={() => handleAddPackToCart(pack)}
                activeOpacity={0.85}
              >
                <View style={styles.packTopRow}>
                  <Text style={styles.packSessionsCount}>{pack.sessions} SESIONES</Text>
                  {pack.discountPercent > 0 && (
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>-{pack.discountPercent}%</Text>
                    </View>
                  )}
                </View>

                <View style={styles.packPriceRow}>
                  <Text style={styles.packTotalPrice}>{pack.totalPrice.toFixed(0)} €</Text>
                  <Text style={styles.packPerSessionPrice}>
                    {pack.pricePerSession.toFixed(2)} €/ses.
                  </Text>
                </View>

                <View style={styles.packActionBtn}>
                  <Text style={styles.packActionBtnText}>+ AÑADIR BONO</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 5. RESUMEN DE LA CESTA SI HAY ÍTEMS */}
        {cart.length > 0 && (
          <View style={styles.cartReviewBlock}>
            <View style={styles.sectionHeaderLine}>
              <Text style={styles.sectionHeaderTitle}>CESTA DE COMPRA // {cart.length} CONCEPTO(S)</Text>
            </View>

            {cart.map((item) => (
              <View key={item.id} style={styles.cartItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartItemName}>{item.serviceName}</Text>
                  <Text style={styles.cartItemMeta}>
                    {item.sessions} sesiones · {item.unitPrice.toFixed(2)} €/u.
                  </Text>
                </View>
                <View style={styles.cartItemRight}>
                  <Text style={styles.cartItemTotal}>{item.totalPrice.toFixed(2)} €</Text>
                  <TouchableOpacity onPress={() => handleRemoveItem(item.id)}>
                    <Text style={styles.cartItemRemove}>ELIMINAR</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={styles.cartDivider} />

            <View style={styles.cartTotalRow}>
              <Text style={styles.cartTotalLabel}>IMPORTE TOTAL (IVA INCLUIDO):</Text>
              <Text style={styles.cartTotalNumber}>{totalCartAmount.toFixed(2)} €</Text>
            </View>

            <Text style={styles.multicenterNote}>
              Todos los bonos se adquieren en un pago único y son válidos en Vizcaya e Independencia.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* 6. BARRA FIJA INFERIOR PARA PAGO ÚNICO */}
      {cart.length > 0 && (
        <View style={styles.fixedBottomBar}>
          <View style={styles.fixedBottomInfo}>
            <Text style={styles.fixedBottomLabel}>TOTAL A PAGAR // {totalCartSessions} SESIONES</Text>
            <Text style={styles.fixedBottomAmount}>{totalCartAmount.toFixed(2)} €</Text>
          </View>

          <TouchableOpacity
            style={styles.fixedBottomCta}
            onPress={handleProcessCheckout}
            activeOpacity={0.88}
          >
            <Text style={styles.fixedBottomCtaText}>PAGAR TODO JUNTO →</Text>
          </TouchableOpacity>
        </View>
      )}
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
    paddingBottom: 120, // Espacio para barra fija inferior
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  categorySelector: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    marginBottom: 16,
    backgroundColor: "#121215",
  },
  categoryTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryTabActive: {
    backgroundColor: "#dc2626", // Rojo Cobosu activo
  },
  categoryTabText: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  categoryTabTextActive: {
    color: "#ffffff",
  },
  durationSelectorWrap: {
    marginBottom: 16,
  },
  durationSelectorLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#71717a",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  durationTabsRow: {
    flexDirection: "row",
    gap: 8,
  },
  durationTab: {
    flex: 1,
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 2,
  },
  durationTabActive: {
    borderColor: "#dc2626",
    backgroundColor: "rgba(220, 38, 38, 0.12)",
  },
  durationTabText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#a1a1aa",
    letterSpacing: 1,
  },
  durationTabTextActive: {
    color: "#ffffff",
  },
  serviceSpecBlock: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 18,
    marginBottom: 20,
  },
  specHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  specCategoryTag: {
    fontSize: 9,
    fontWeight: "800",
    color: "#dc2626",
    letterSpacing: 1.5,
  },
  specTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 4,
    letterSpacing: 0.3,
  },
  specPriceBox: {
    alignItems: "flex-end",
  },
  specPriceValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  specPriceSub: {
    fontSize: 8,
    fontWeight: "700",
    color: "#71717a",
    letterSpacing: 1,
    marginTop: 2,
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
  customSection: {
    marginBottom: 26,
  },
  pickerBox: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 16,
    gap: 14,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    overflow: "hidden",
  },
  stepperBtn: {
    width: 52,
    height: 48,
    backgroundColor: "#18181b",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnSymbol: {
    fontSize: 22,
    fontWeight: "900",
    color: "#ffffff",
  },
  stepperValueBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#09090b",
    height: 48,
  },
  stepperValueNum: {
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  stepperValueLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#71717a",
    letterSpacing: 1,
  },
  addCustomBtn: {
    backgroundColor: "#27272a",
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 2,
    paddingVertical: 14,
    alignItems: "center",
  },
  addCustomBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  packsSection: {
    marginBottom: 26,
  },
  packsGrid: {
    gap: 8,
  },
  packCard: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packTopRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  packSessionsCount: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  discountBadge: {
    borderWidth: 1,
    borderColor: "#dc2626",
    backgroundColor: "rgba(220, 38, 38, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  discountBadgeText: {
    color: "#f87171",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  packPriceRow: {
    alignItems: "flex-end",
    marginRight: 16,
  },
  packTotalPrice: {
    fontSize: 16,
    fontWeight: "900",
    color: "#ffffff",
  },
  packPerSessionPrice: {
    fontSize: 9,
    color: "#71717a",
    fontWeight: "600",
    marginTop: 2,
  },
  packActionBtn: {
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 2,
  },
  packActionBtnText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  cartReviewBlock: {
    backgroundColor: "#121215",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 2,
    padding: 16,
    marginTop: 8,
  },
  cartItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#18181b",
  },
  cartItemName: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },
  cartItemMeta: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 2,
  },
  cartItemRight: {
    alignItems: "flex-end",
  },
  cartItemTotal: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
  },
  cartItemRemove: {
    fontSize: 9,
    fontWeight: "800",
    color: "#ef4444",
    marginTop: 3,
    letterSpacing: 0.5,
  },
  cartDivider: {
    height: 1,
    backgroundColor: "#27272a",
    marginVertical: 12,
  },
  cartTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartTotalLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#a1a1aa",
    letterSpacing: 1,
  },
  cartTotalNumber: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
  },
  multicenterNote: {
    fontSize: 9,
    color: "#52525b",
    marginTop: 10,
    lineHeight: 14,
  },
  fixedBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#121215",
    borderTopWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fixedBottomInfo: {
    flex: 1,
    paddingRight: 12,
  },
  fixedBottomLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#71717a",
    letterSpacing: 1,
  },
  fixedBottomAmount: {
    fontSize: 22,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 2,
  },
  fixedBottomCta: {
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 2, // Rectangular y firme
  },
  fixedBottomCtaText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
});

