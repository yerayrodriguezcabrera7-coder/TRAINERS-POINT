import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { localDay } from "../../../shared/calendar";

export function CalendarDatePicker({ value, title, onSelect, onClose }: {
  value: string;
  title: string;
  onSelect: (day: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(() => {
    const chosen = new Date(`${value}T12:00:00`);
    return new Date(chosen.getFullYear(), chosen.getMonth(), 1, 12);
  });
  const firstWeekday = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: Math.ceil((firstWeekday + count) / 7) * 7 }, (_, index) => index - firstWeekday + 1);
  const moveMonth = (delta: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1, 12));
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={s.overlay}><View style={s.panel}>
      <View style={s.top}><Text style={s.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar calendario" onPress={onClose}><Text style={s.close}>✕</Text></Pressable></View>
      <View style={s.monthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => moveMonth(-1)} style={s.arrow}><Text style={s.arrowText}>‹</Text></Pressable>
        <Text style={s.month}>{month.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" onPress={() => moveMonth(1)} style={s.arrow}><Text style={s.arrowText}>›</Text></Pressable>
      </View>
      <View style={s.grid}>{["L", "M", "X", "J", "V", "S", "D"].map((day, index) => <Text key={index} style={s.weekday}>{day}</Text>)}</View>
      <View style={s.grid}>{days.map((day, index) => {
        if (day < 1 || day > count) return <View key={index} style={s.cell} />;
        const iso = localDay(new Date(month.getFullYear(), month.getMonth(), day, 12));
        return <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Elegir ${iso}`} accessibilityState={{ selected: iso === value }} onPress={() => { onSelect(iso); onClose(); }} style={[s.cell, iso === value && s.selected]}><Text style={[s.day, iso === value && s.selectedText]}>{day}</Text></Pressable>;
      })}</View>
      <Pressable accessibilityRole="button" onPress={() => { onSelect(localDay()); onClose(); }} style={s.today}><Text style={s.todayText}>Hoy</Text></Pressable>
    </View></View>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#0009", justifyContent: "center", padding: 16 },
  panel: { backgroundColor: "#fff", borderRadius: 18, padding: 18, maxWidth: 420, width: "100%", alignSelf: "center", gap: 14 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#1d302e" }, close: { fontSize: 22, color: "#65746b", padding: 8 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  month: { color: "#1d302e", fontWeight: "700", fontSize: 16, textTransform: "capitalize" },
  arrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, arrowText: { fontSize: 28, color: "#ed691d" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: "14.2857%", textAlign: "center", color: "#65746b", fontWeight: "700" },
  cell: { width: "14.2857%", height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  selected: { backgroundColor: "#1d302e" }, day: { color: "#1d302e", fontWeight: "600" }, selectedText: { color: "#fff" },
  today: { alignSelf: "center", padding: 10 }, todayText: { color: "#c45612", fontWeight: "800" },
});
