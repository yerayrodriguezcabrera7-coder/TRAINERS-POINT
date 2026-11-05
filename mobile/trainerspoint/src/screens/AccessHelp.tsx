import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export function AccessHelp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}><View style={styles.panel}><ScrollView contentContainerStyle={styles.body}>
      <Text accessibilityRole="header" style={styles.title}>Te ayudamos a entrar</Text>
      <Text style={styles.heading}>Todavía no tengo usuario</Text>
      <Text style={styles.text}>Solicita tu acceso al centro. Administración creará tu cuenta y la vinculará con tu ficha de cliente o trabajador.</Text>
      <Text style={styles.heading}>Es mi primera vez</Text>
      <Text style={styles.text}>Introduce el usuario y la contraseña provisional que te han entregado. Si el centro lo ha indicado, tendrás que elegir una contraseña nueva antes de continuar.</Text>
      <Text style={styles.heading}>He olvidado mi contraseña</Text>
      <Text style={styles.text}>Contacta con recepción para que comprueben tu identidad. Administración podrá restablecer tu acceso y darte una contraseña provisional. No compartas tu contraseña personal.</Text>
      <Text style={styles.heading}>Soy trabajador o de recepción</Text>
      <Text style={styles.text}>Selecciona tu perfil antes de entrar. El trabajador consulta su agenda y sus clientes; recepción ve las agendas del centro, los clientes y las reservas pendientes. Los permisos los comprueba el servidor.</Text>
      <Text style={styles.heading}>Administración del centro</Text>
      <Text style={styles.text}>La configuración, las cuentas y los permisos se siguen gestionando en el panel web.</Text>
      <Pressable accessibilityRole="button" style={styles.close} onPress={onClose}><Text style={styles.closeText}>Entendido, volver al acceso</Text></Pressable>
    </ScrollView></View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(18,34,26,.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  panel: { width: "100%", maxWidth: 440, maxHeight: "90%", backgroundColor: "#fffdf9", borderRadius: 22, overflow: "hidden" },
  body: { padding: 24, gap: 14 }, title: { fontSize: 24, fontWeight: "800", color: "#1d302e", marginBottom: 5 },
  heading: { fontSize: 15, fontWeight: "700", color: "#1d302e" }, text: { fontSize: 14, lineHeight: 22, color: "#607068" },
  close: { backgroundColor: "#ed691d", padding: 15, borderRadius: 12, minHeight: 48, justifyContent: "center", marginTop: 10 },
  closeText: { color: "white", textAlign: "center", fontWeight: "700" },
});
