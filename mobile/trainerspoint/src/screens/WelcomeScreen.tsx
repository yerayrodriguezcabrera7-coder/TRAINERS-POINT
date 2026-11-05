import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

export function WelcomeScreen({ onLogin, onDemo }: { onLogin: () => void; onDemo: () => void }) {
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.brand}><Text style={styles.orange}>T.</Text> trainerspoint</Text>
    <View style={styles.art}>
      <View style={styles.artIcon}><Feather name="activity" size={52} color="#ed691d" aria-hidden /></View>
      <Text style={styles.eyebrow}>TU CENTRO. TU EQUIPO. TU ESPACIO.</Text>
      <Text accessibilityRole="header" style={styles.title}>Tu entrenamiento,{"\n"}contigo.</Text>
      <Text style={styles.intro}>Consulta tus próximas sesiones y encuentra toda tu agenda en un mismo lugar.</Text>
      <View style={styles.feature}><Feather name="calendar" size={19} color="#d4e4cd" aria-hidden /><Text style={styles.featureText}>Tus reservas, tu entrenador y tu centro</Text></View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Entrar a mi cuenta" style={styles.primary} onPress={onLogin}><Text style={styles.primaryText}>Entrar a mi cuenta</Text><Feather name="arrow-right" size={20} color="white" aria-hidden /></Pressable>
    <Text style={styles.hint}>Utiliza el usuario y la contraseña que te ha facilitado el centro.</Text>
    <View style={styles.divider} />
    <Pressable accessibilityRole="button" accessibilityLabel="Explorar una demostración" style={styles.secondary} onPress={onDemo}><Text style={styles.secondaryText}>Explorar una demostración</Text><Feather name="play-circle" size={19} color="#1d302e" aria-hidden /></Pressable>
    <Text style={styles.hint}>La demostración utiliza datos de ejemplo y no necesita cuenta.</Text>
    <Text style={styles.footer}>TRAINERS POINT · UN PASO MÁS, CADA DÍA</Text>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f6f6f0" },
  content: { flexGrow: 1, width: "100%", maxWidth: 480, alignSelf: "center", padding: 24, gap: 16, justifyContent: "center" },
  brand: { fontSize: 25, letterSpacing: -1, fontWeight: "800", color: "#1d302e", marginBottom: 12 },
  orange: { color: "#ed691d" },
  art: { backgroundColor: "#1d302e", borderRadius: 26, padding: 26, gap: 22 },
  artIcon: { width: 80, height: 80, borderRadius: 22, backgroundColor: "#31443b", alignItems: "center", justifyContent: "center" },
  eyebrow: { color: "#becfbe", letterSpacing: 1.5, fontSize: 9, lineHeight: 15, fontWeight: "700" },
  title: { color: "white", fontSize: 34, lineHeight: 40, letterSpacing: -1, fontWeight: "800" },
  intro: { color: "#d1ded2", fontSize: 14, lineHeight: 23 },
  feature: { flexDirection: "row", gap: 10, alignItems: "center", borderTopWidth: 1, borderColor: "#46564b", paddingTop: 18 },
  featureText: { flex: 1, color: "#d4e4cd", fontSize: 12, lineHeight: 18 },
  primary: { backgroundColor: "#ed691d", minHeight: 54, borderRadius: 14, padding: 17, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  primaryText: { color: "white", fontWeight: "700", fontSize: 16 },
  secondary: { minHeight: 48, borderWidth: 1, borderColor: "#d9dfd3", borderRadius: 14, padding: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "white" },
  secondaryText: { color: "#1d302e", fontWeight: "600", fontSize: 14, flexShrink: 1 },
  hint: { color: "#65746b", fontSize: 12, lineHeight: 19, textAlign: "center", paddingHorizontal: 12 },
  divider: { height: 1, backgroundColor: "#dfe5d9", marginVertical: 4 },
  footer: { color: "#7a877b", fontSize: 9, textAlign: "center", letterSpacing: 1.4, marginTop: 18 },
});
