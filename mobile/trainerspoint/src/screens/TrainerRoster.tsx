import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ApiClient } from "../../../shared/api";
import { localDay } from "../../../shared/calendar";
import { weekRoster } from "../../../shared/trainer-roster";
import type { CalendarData } from "../../../shared/types";
import type { LeaveKind, TrainerLeave } from "../../../shared/trainer-types";
import { CalendarDatePicker } from "./CalendarDatePicker";

const kinds: Array<{ value: LeaveKind; label: string }> = [
  { value: "VACATION", label: "Vacaciones" },
  { value: "PERMISSION", label: "Cita médica" },
  { value: "OTHER", label: "Asunto propio" },
];
const kindLabel = (kind: LeaveKind) => kinds.find(item => item.value === kind)?.label || "Baja médica";
const statusLabel = { PENDING: "Pendiente", APPROVED: "Aprobada", REJECTED: "Rechazada", CANCELLED: "Retirada" };

function monday(day: string) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date;
}

export function TrainerRoster({ api, employee }: { api: ApiClient; employee: CalendarData["employees"][number] | undefined }) {
  const [week, setWeek] = useState(() => monday(localDay()));
  const [leaves, setLeaves] = useState<TrainerLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<LeaveKind>("VACATION");
  const [startDate, setStartDate] = useState(localDay);
  const [endDate, setEndDate] = useState(localDay);
  const [note, setNote] = useState("");
  const [picking, setPicking] = useState<"start" | "end" | null>(null);

  async function refresh() {
    setLoading(true);
    try { setLeaves(await api.getLeaves()); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron consultar las ausencias."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [api]);

  async function submit() {
    if (startDate > endDate) { setError("La fecha final debe ser igual o posterior a la inicial."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await api.requestLeave({ type: kind, startDate, endDate, note: note.trim() });
      setNote("");
      setNotice("Solicitud enviada a administración para revisión.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo enviar la solicitud."); }
    finally { setBusy(false); }
  }

  const days = weekRoster(employee, leaves, week);

  return <View style={s.root}>
    <View style={s.headingRow}><Text style={s.heading}>Mis turnos</Text><Pressable accessibilityRole="button" onPress={() => void refresh()}><Text style={s.refresh}>↻ Actualizar</Text></Pressable></View>
    <View style={s.weekNav}>
      <Pressable accessibilityRole="button" accessibilityLabel="Semana anterior" onPress={() => setWeek(current => { const next = new Date(current); next.setDate(next.getDate() - 7); return next; })} style={s.nav}><Text style={s.navText}>‹</Text></Pressable>
      <Text style={s.weekTitle}>{days[0].date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – {days[6].date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Semana siguiente" onPress={() => setWeek(current => { const next = new Date(current); next.setDate(next.getDate() + 7); return next; })} style={s.nav}><Text style={s.navText}>›</Text></Pressable>
    </View>
    {days.map(day => <View key={day.iso} style={s.dayRow}>
      <Text style={s.dayName}>{day.date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })}</Text>
      <Text style={[s.periods, day.approved && s.approved]}>{day.approved ? "Ausencia aprobada" : day.periods.length ? day.periods.map(period => `${period.open}–${period.close}`).join(" · ") : "Día libre"}</Text>
    </View>)}
    <View style={s.card}>
      <Text style={s.heading}>Solicitar ausencia</Text>
      <Text style={s.muted}>Administración revisará la solicitud antes de aprobarla.</Text>
      <View style={s.types}>{kinds.map(item => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{selected:kind===item.value}} onPress={() => setKind(item.value)} style={[s.type,kind===item.value&&s.typeSelected]}><Text style={[s.typeText,kind===item.value&&s.typeTextSelected]}>{item.label}</Text></Pressable>)}</View>
      <View style={s.dateRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Fecha de inicio ${startDate}`} onPress={() => setPicking("start")} style={s.dateButton}><Text style={s.dateLabel}>Desde</Text><Text style={s.dateValue}>{startDate}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Fecha final ${endDate}`} onPress={() => setPicking("end")} style={s.dateButton}><Text style={s.dateLabel}>Hasta</Text><Text style={s.dateValue}>{endDate}</Text></Pressable>
      </View>
      <TextInput accessibilityLabel="Motivo de la ausencia" placeholder="Motivo breve (opcional)" placeholderTextColor="#879389" value={note} onChangeText={setNote} multiline maxLength={500} style={s.input}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Enviar solicitud de ausencia" disabled={busy} onPress={() => void submit()} style={[s.submit,busy&&{opacity:.5}]}><Text style={s.submitText}>{busy ? "Enviando…" : "Enviar solicitud"}</Text></Pressable>
      {!!notice && <Text style={s.success}>✓ {notice}</Text>}
      {!!error && <Text style={s.error}>⚠ {error}</Text>}
    </View>
    <View style={s.card}><Text style={s.heading}>Mis solicitudes</Text>{loading ? <ActivityIndicator color="#ed691d" /> : leaves.length ? leaves.slice(0,8).map(leave => <View key={leave.id} style={s.leaveRow}><Text style={s.leaveText}>{kindLabel(leave.type)} · {leave.startDate}{leave.endDate!==leave.startDate?` → ${leave.endDate}`:""}</Text><Text style={s.muted}>{statusLabel[leave.status]}</Text></View>) : <Text style={s.muted}>No hay solicitudes registradas.</Text>}</View>
    {!!picking && <CalendarDatePicker key={picking} title={picking === "start" ? "Fecha de inicio" : "Fecha final"} value={picking === "start" ? startDate : endDate} onSelect={value => { if (picking === "start") { setStartDate(value); if (value > endDate) setEndDate(value); } else setEndDate(value); }} onClose={() => setPicking(null)} />}
  </View>;
}

const s = StyleSheet.create({
  root:{gap:13},headingRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},heading:{fontSize:18,fontWeight:"800",color:"#1d302e"},refresh:{color:"#c45612",fontWeight:"700",padding:8},muted:{fontSize:13,color:"#65746b"},
  weekNav:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},weekTitle:{fontSize:15,fontWeight:"700",color:"#1d302e"},nav:{width:42,height:42,backgroundColor:"white",borderRadius:12,alignItems:"center",justifyContent:"center"},navText:{fontSize:27,color:"#1d302e"},
  dayRow:{backgroundColor:"white",padding:14,borderRadius:12,flexDirection:"row",justifyContent:"space-between",gap:10},dayName:{fontWeight:"700",color:"#1d302e",textTransform:"capitalize"},periods:{flex:1,textAlign:"right",color:"#1d302e"},approved:{color:"#a12d23",fontWeight:"700"},
  card:{backgroundColor:"white",borderRadius:15,padding:16,gap:12},types:{flexDirection:"row",flexWrap:"wrap",gap:7},type:{borderWidth:1,borderColor:"#d8e0d5",paddingVertical:10,paddingHorizontal:12,borderRadius:10},typeSelected:{backgroundColor:"#1d302e",borderColor:"#1d302e"},typeText:{color:"#1d302e",fontWeight:"700"},typeTextSelected:{color:"white"},
  dateRow:{flexDirection:"row",gap:10},dateButton:{flex:1,borderWidth:1,borderColor:"#d8e0d5",borderRadius:10,padding:11,minHeight:55},dateLabel:{fontSize:11,color:"#65746b"},dateValue:{fontSize:14,fontWeight:"700",color:"#1d302e"},input:{minHeight:65,borderWidth:1,borderColor:"#d8e0d5",borderRadius:10,padding:12,fontSize:15,color:"#1d302e",textAlignVertical:"top"},submit:{backgroundColor:"#ed691d",minHeight:46,borderRadius:12,alignItems:"center",justifyContent:"center"},submitText:{color:"white",fontWeight:"800"},success:{color:"#287449",fontWeight:"700"},error:{color:"#ab332b",fontWeight:"700"},leaveRow:{borderTopWidth:1,borderTopColor:"#e4e8e2",paddingTop:10,gap:3},leaveText:{color:"#1d302e",fontWeight:"700"},
});
