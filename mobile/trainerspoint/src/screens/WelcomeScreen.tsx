import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function WelcomeScreen({ onLogin, onDemo }: { onLogin: () => void; onDemo: () => void }) {
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <Text style={styles.brand}>
          <Text style={styles.brandBold}>T. </Text>trainerspoint
        </Text>

        {/* Hero Section */}
        <View style={styles.hero}>
          {/* Icon */}
          <View style={styles.heroIcon}>
            <Text style={styles.heroIconText}>💪</Text>
          </View>

          {/* Title */}
          <Text style={styles.heroTitle}>Tu entrenamiento,{"\n"}contigo.</Text>

          {/* Subtitle */}
          <Text style={styles.heroSubtitle}>
            Consulta tus próximas sesiones y encuentra toda tu agenda en un mismo lugar.
          </Text>

          {/* Features */}
          <View style={styles.features}>
            <View style={styles.feature}>
              <Text style={styles.featureEmoji}>📅</Text>
              <Text style={styles.featureText}>Tus reservas, tu entrenador y tu centro</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureEmoji}>🎫</Text>
              <Text style={styles.featureText}>Tus bonos y sesiones activas</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureEmoji}>📏</Text>
              <Text style={styles.featureText}>Tu progreso y plan de entrenamiento</Text>
            </View>
          </View>
        </View>

        {/* Primary Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Entrar a mi cuenta"
          style={styles.primaryButton}
          onPress={onLogin}
        >
          <Text style={styles.primaryButtonText}>Entrar a mi cuenta</Text>
        </Pressable>

        {/* Hint */}
        <Text style={styles.hint}>
          Utiliza el usuario y la contraseña que te ha facilitado el centro.
        </Text>

        {/* Secondary Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explorar una demostración"
          style={styles.secondaryButton}
          onPress={onDemo}
        >
          <Text style={styles.secondaryButtonText}>Explorar una demostración</Text>
        </Pressable>

        {/* Footer */}
        <Text style={styles.footer}>TRAINERS POINT · UN PASO MÁS, CADA DÍA</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f6f6f0",
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    padding: 24,
    gap: 20,
    justifyContent: "center",
  },

  // Brand
  brand: {
    fontSize: 36,
    fontWeight: "700",
    color: "#1d302e",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  brandBold: {
    fontWeight: "800",
  },

  // Hero
  hero: {
    backgroundColor: "#1d302e",
    borderRadius: 24,
    padding: 28,
    gap: 20,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ed691d",
    alignItems: "center",
    justifyContent: "center",
  },
  heroIconText: {
    fontSize: 36,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: "#d1ded2",
    fontSize: 15,
    lineHeight: 22,
  },
  features: {
    gap: 12,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureEmoji: {
    fontSize: 18,
  },
  featureText: {
    color: "#d4e4cd",
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },

  // Primary Button
  primaryButton: {
    backgroundColor: "#ed691d",
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  // Hint
  hint: {
    color: "#65746b",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },

  // Secondary Button
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9dfd3",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#1d302e",
    fontSize: 15,
    fontWeight: "600",
  },

  // Footer
  footer: {
    color: "#7a877b",
    fontSize: 10,
    textAlign: "center",
    letterSpacing: 1.4,
    marginTop: 4,
  },
});