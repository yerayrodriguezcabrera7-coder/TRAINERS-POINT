import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { useAudioPlayer } from "expo-audio";
import type { ApiClient } from "../../../shared/api";
import type { Booking, CalendarData, Identity } from "../../../shared/types";
import type { AttendanceData, TrainerClientDetail } from "../../../shared/trainer-types";
import { localDay } from "../../../shared/calendar";
import { detectTrainerAgendaAlerts, groupTrainerBookings, type TrainerAgendaAlert } from "../../../shared/trainer-agenda";
import { CalendarDatePicker } from "./CalendarDatePicker";
import { TrainerRoster } from "./TrainerRoster";

const ink="#1d302e", orange="#ed691d", green="#287449", red="#ab332b", paper="#f6f6f0";
type Feeling="GOOD"|"TIRED"|"EASY"|"ADEQUATE"|"LIMIT"|"PAIN"|null;
const statusLabels:Record<Booking['status'],string>={PENDING:"Pendiente",CONFIRMED:"Confirmada",COMPLETED:"Completada",CANCELLED:"Cancelada",NO_SHOW:"No presentado"};
const statusColors:Record<Booking['status'],string>={PENDING:"#a46d16",CONFIRMED:green,COMPLETED:"#527367",CANCELLED:red,NO_SHOW:red};

function formatDay(day:string) { return new Date(`${day}T12:00:00`).toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"}); }
function changeDay(day:string,delta:number) { const d=new Date(`${day}T12:00:00`);d.setDate(d.getDate()+delta);return localDay(d); }
function shortDate(value:string) { return new Date(value).toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"}); }
function minutesToday(attendance:AttendanceData|null, employeeId:string|null, now:number) {
  if(!attendance || !employeeId) return 0;
  const dayStart=new Date(attendance.dayStart).getTime();
  const records=new Map([...attendance.records,...attendance.openRecords].filter(r=>r.employeeId===employeeId).map(r=>[r.id,r]));
  let total=0;
  for(const r of records.values()) {
    const start=Math.max(dayStart,new Date(r.clockIn).getTime()),end=Math.min(now,new Date(attendance.dayEnd).getTime(),r.clockOut?new Date(r.clockOut).getTime():now);
    total+=Math.max(0,end-start);
    for(const pause of r.pauses||[]) {
      const pStart=Math.max(start,new Date(pause.startedAt).getTime()),pEnd=Math.min(end,pause.endedAt?new Date(pause.endedAt).getTime():now);
      total-=Math.max(0,pEnd-pStart);
    }
  }
  return Math.max(0,Math.floor(total/60000));
}
function Button({label,onPress,color=ink,disabled=false}:{label:string;onPress:()=>void;color?:string;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button,{backgroundColor:color},disabled&&{opacity:.5}]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Field({label,value,onChangeText,decimal=false,multiline=false,placeholder}:{label:string;value:string;onChangeText:(v:string)=>void;decimal?:boolean;multiline?:boolean;placeholder?:string}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={decimal?"decimal-pad":"default"} multiline={multiline} placeholder={placeholder} placeholderTextColor="#88948a" style={[styles.input,multiline&&{minHeight:80,textAlignVertical:"top"}]} /></View>;
}

export function TrainerScreen({api,user,onLogout}:{api:ApiClient;user:Identity;onLogout:()=>void}) {
  const [data,setData]=useState<CalendarData|null>(null);
  const [attendance,setAttendance]=useState<AttendanceData|null>(null);
  const [tab,setTab]=useState<"agenda"|"clients"|"roster">("agenda");
  const [date,setDate]=useState(localDay);
  const [datePickerOpen,setDatePickerOpen]=useState(false);
  const [alerts,setAlerts]=useState<TrainerAgendaAlert[]>([]);
  const [search,setSearch]=useState("");
  const [clientId,setClientId]=useState<string|null>(null);
  const [bookingId,setBookingId]=useState<string|null>(null);
  const [detail,setDetail]=useState<TrainerClientDetail|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [measureOpen,setMeasureOpen]=useState(false);
  const [measure,setMeasure]=useState({weight:"",bodyFat:"",waist:"",hip:"",chest:"",arm:"",leg:""});
  const [exercises,setExercises]=useState("");
  const [feeling,setFeeling]=useState<Feeling>(null);
  const [nextPlan,setNextPlan]=useState("");
  const [receptionNote,setReceptionNote]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [now,setNow]=useState(Date.now());
  const loadSequence=useRef(0);
  const detailSequence=useRef(0);
  const previousBookings=useRef<Booking[]|null>(null);
  const suppressAlerts=useRef(false);
  const alertPlayer=useAudioPlayer(require("../../assets/agenda-alert.wav"));

  const load=useCallback(async(show=true)=>{
    const sequence=++loadSequence.current;
    if(show)setLoading(true);
    try {
      const [calendar,clock]=await Promise.all([api.getStaffCalendar(),api.getAttendance(localDay())]);
      if(sequence===loadSequence.current){
        if(previousBookings.current && !suppressAlerts.current){
          const found=detectTrainerAgendaAlerts(previousBookings.current,calendar.bookings,new Date());
          if(found.length){
            setAlerts(current=>[...found,...current].slice(0,5));
            void alertPlayer.seekTo(0).then(()=>alertPlayer.play()).catch(()=>{});
          }
        }
        previousBookings.current=calendar.bookings;
        setData(calendar);setAttendance(clock);setError("");
      }
    } catch(e) { if(sequence===loadSequence.current)setError(e instanceof Error?e.message:"No se pudo actualizar la información."); }
    finally { if(sequence===loadSequence.current)setLoading(false); }
  },[api,alertPlayer]);
  useEffect(()=>{
    void load();
    const clockTimer=setInterval(()=>setNow(Date.now()),1000);
    const pollTimer=setInterval(()=>{if(AppState.currentState==="active")void load(false);},15000);
    const subscription=AppState.addEventListener("change",state=>{if(state==="active")void load(false);});
    return()=>{clearInterval(clockTimer);clearInterval(pollTimer);subscription.remove();};
  },[load]);

  const bookings=data?.bookings||[];
  const currentBooking=bookingId?bookings.find(b=>b.id===bookingId)||null:null;
  const dualBookings=currentBooking?.sessionId?bookings.filter(b=>b.sessionId===currentBooking.sessionId&&b.date===currentBooking.date&&b.start===currentBooking.start):[];
  const client=data?.clients?.find(c=>c.id===clientId);
  const clientBookings=bookings.filter(b=>b.clientId===clientId).sort((a,b)=>`${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`));
  const previousPlan=(currentBooking?clientBookings.filter(b=>`${b.date} ${b.start}`<`${currentBooking.date} ${currentBooking.start}`):clientBookings).find(b=>b.nextSessionPlan?.trim())?.nextSessionPlan;
  const open=attendance?.openRecords.find(r=>r.employeeId===user.employeeId&&!r.clockOut);
  const paused=!!open?.pauses?.length&&!open.pauses[open.pauses.length-1].endedAt;
  const worked=minutesToday(attendance,user.employeeId,now);
  const status=open?(paused?"En pausa":"En jornada"):"Fuera de turno";
  const activePackage=detail?.packages.find(p=>p.paymentStatus==="PAGADO"&&p.sessionsRemaining>0&&new Date(p.expiresAt).getTime()>Date.now())||detail?.packages[0];
  const lastWeight=detail?.measurements.find(m=>m.weight!=null);
  const earlierWeight=detail?.measurements.find(m=>m.weight!=null&&m.id!==lastWeight?.id);
  const daysSinceWeight=lastWeight?Math.max(0,Math.floor((Date.now()-new Date(`${lastWeight.measuredAt.slice(0,10)}T12:00:00`).getTime())/86400000)):null;
  const injuries=[...(Array.isArray(detail?.client.injuries)?detail.client.injuries:[]),detail?.client.injuryNotes].filter(Boolean).join(" · ");

  async function refreshDetail(id:string) {
    const sequence=++detailSequence.current;
    setDetailLoading(true);
    try { const result=await api.getTrainerClient(id);if(sequence===detailSequence.current){setDetail(result);setError("");} }
    catch(e) { if(sequence===detailSequence.current)setError(e instanceof Error?e.message:"No se pudo cargar la ficha."); }
    finally { if(sequence===detailSequence.current)setDetailLoading(false); }
  }
  function openClient(id:string,booking?:Booking) {
    setClientId(id);setBookingId(booking?.id||null);setDetail(null);setError("");setNotice("");
    setExercises(booking?.sessionLog?.exercises||"");setFeeling(booking?.sessionLog?.feeling||null);setNextPlan(booking?.nextSessionPlan||"");setReceptionNote("");
    void refreshDetail(id);
  }
  function closeDetail(){detailSequence.current++;setClientId(null);setBookingId(null);setDetail(null);setMeasureOpen(false);}
  function openMeasure(){
    const today=detail?.measurements.find(m=>m.measuredAt.slice(0,10)===localDay());
    setMeasure({weight:today?.weight?.toString()||"",bodyFat:today?.bodyFat?.toString()||"",waist:today?.waist?.toString()||"",hip:today?.hip?.toString()||"",chest:today?.chest?.toString()||"",arm:today?.arm?.toString()||"",leg:today?.leg?.toString()||""});
    setMeasureOpen(true);
  }
  async function clock(action:"IN"|"OUT") {
    if(!user.employeeId)return;
    setBusy(true);setError("");setNotice("");
    try {
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=="granted")throw new Error("Permite el acceso a la ubicación para fichar.");
      const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      const result=await api.clock(user.employeeId,action,{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy});
      await load(false);
      const timestamp=action==="IN"?result.clockIn:result.clockOut;
      setNotice(`${action==="IN"?"Entrada":"Salida"} registrada a las ${new Date(timestamp||Date.now()).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})} · Ubicación verificada`);
    } catch(e) {setError(e instanceof Error?e.message:"No se pudo registrar el fichaje.");}
    finally {setBusy(false);}
  }
  async function togglePause(){
    if(!user.employeeId)return;
    setBusy(true);setError("");
    try {await api.pause(user.employeeId,paused?"END":"START");await load(false);setNotice(paused?"Pausa finalizada.":"Pausa registrada.");}
    catch(e){setError(e instanceof Error?e.message:"No se pudo registrar la pausa.");}
    finally{setBusy(false);}
  }
  async function mark(attendanceValue:"ASISTIO"|"NO_ASISTIO"|"REPROGRAMAR"){
    if(!currentBooking)return;
    setBusy(true);setError("");
    try {await api.markAttendance(currentBooking.id,attendanceValue,currentBooking.version);suppressAlerts.current=true;await load(false);suppressAlerts.current=false;setNotice(attendanceValue==="REPROGRAMAR"?"Recepción verá la cita pendiente de reubicar.":"Asistencia registrada.");}
    catch(e){setError(e instanceof Error?e.message:"No se pudo registrar la asistencia.");}
    finally{suppressAlerts.current=false;setBusy(false);}
  }
  async function saveSession(){
    if(!currentBooking)return;
    setBusy(true);setError("");
    try {await api.saveSession(currentBooking.id,{version:currentBooking.version,exercises,feeling,nextSessionPlan:nextPlan});await load(false);setNotice("Diario y plan de la siguiente sesión guardados.");}
    catch(e){setError(e instanceof Error?e.message:"No se pudo guardar la sesión.");}
    finally{setBusy(false);}
  }
  async function saveMeasure(){
    if(!clientId)return;
    const values:Record<string,number|string>={measuredAt:localDay()};
    for(const [key,value] of Object.entries(measure))if(value.trim()){const parsed=Number(value.replace(",","."));if(!Number.isFinite(parsed)||parsed<=0||key==="bodyFat"&&parsed>100){setError("Revisa las medidas introducidas.");return;}values[key]=parsed;}
    if(Object.keys(values).length===1){setError("Introduce al menos una medida.");return;}
    setBusy(true);setError("");
    try {await api.saveMeasurement(clientId,values);await refreshDetail(clientId);setMeasureOpen(false);setMeasure({weight:"",bodyFat:"",waist:"",hip:"",chest:"",arm:"",leg:""});setNotice("Medidas guardadas.");}
    catch(e){setError(e instanceof Error?e.message:"No se pudieron guardar las medidas.");}
    finally{setBusy(false);}
  }
  async function sendNote(){
    if(!clientId||!receptionNote.trim())return;
    setBusy(true);setError("");
    try {await api.saveReceptionNote(clientId,receptionNote.trim());await refreshDetail(clientId);setReceptionNote("");setNotice("Aviso interno guardado para recepción.");}
    catch(e){setError(e instanceof Error?e.message:"No se pudo guardar el aviso.");}
    finally{setBusy(false);}
  }

  const term=search.trim().toLocaleLowerCase("es");
  const visibleBookings=groupTrainerBookings(bookings,date);
  const visibleClients=(data?.clients||[]).filter(c=>{
    const hasBalance=(data?.pendingPackages||[]).some(p=>p.clientId===c.id&&p.sessionsToSchedule>0);
    return !term||c.name.toLocaleLowerCase("es").includes(term)||("bono activo".includes(term)&&hasBalance)||("bono agotado".includes(term)&&!hasBalance);
  });
  const name=(id:string)=>data?.clients?.find(c=>c.id===id)?.name||"Cliente";
  const service=(id:string)=>data?.services.find(s=>s.id===id)?.name||"Servicio";
  const room=(id:string)=>data?.rooms.find(r=>r.id===id)?.name||"Sala";
  const weights=(detail?.measurements||[]).filter(m=>m.weight!=null).slice(0,8).reverse();
  const maxWeight=Math.max(...weights.map(m=>m.weight||0),1);
  const minWeight=Math.min(...weights.map(m=>m.weight||0),maxWeight);
  const waists=(detail?.measurements||[]).filter(m=>m.waist!=null).slice(0,8).reverse();
  const maxWaist=Math.max(...waists.map(m=>m.waist||0),1);
  const minWaist=Math.min(...waists.map(m=>m.waist||0),maxWaist);

  return <View style={styles.page}>
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View><Text style={styles.brand}><Text style={{color:orange}}>T.</Text> trainerspoint</Text><Text style={styles.headerSub}>Entrenador · {user.name}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión" onPress={onLogout}><Text style={styles.logout}>Salir</Text></Pressable>
      </View>
      <View style={styles.headerClock}>
        <View><Text style={styles.headerClockLabel}>MI JORNADA · HOY</Text><Text style={styles.headerClockTime}>{String(Math.floor(worked/60)).padStart(2,"0")}:{String(worked%60).padStart(2,"0")} h</Text></View>
        <Text style={[styles.headerStatus,{color:paused?"#ffd294":open?"#9de3ae":"#d0d8d0"}]}>{status}</Text>
      </View>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.clockCard}>
        <Text style={styles.muted}>Tiempo trabajado hoy, sin pausas</Text>
        <View style={styles.actionRow}><Button label={open?"Fichar Salida":"Fichar Entrada"} onPress={()=>void clock(open?"OUT":"IN")} color={open?red:orange} disabled={busy||!user.employeeId}/>{open&&<Button label={paused?"Terminar pausa":"Pausar / Descanso"} onPress={()=>void togglePause()} color="#52685d" disabled={busy}/>}</View>
      </View>
      {alerts.map(alert=><View key={alert.key} style={styles.alert}>
        <Text style={styles.alertText}>{alert.kind==="NEW_TODAY"?"🔔 Nueva cita hoy":"🔔 Cita cancelada próximamente"} · {alert.start} · {alert.clientIds.map(name).join(" y ")}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Descartar aviso" onPress={()=>setAlerts(current=>current.filter(item=>item.key!==alert.key))}><Text style={styles.alertClose}>✕</Text></Pressable>
      </View>)}
      {!!notice&&<View style={styles.success}><Text style={styles.successText}>✓ {notice}</Text></View>}
      {!!error&&<View style={styles.error}><Text style={styles.errorText}>⚠ {error}</Text></View>}
      <View style={styles.tabs}>
        {([ ["agenda","Agenda"], ["clients","Mis clientes"], ["roster","Turnos"] ] as const).map(([key,label])=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>setTab(key)} style={[styles.tab,tab===key&&styles.tabActive]}><Text style={[styles.tabText,tab===key&&styles.tabTextActive]}>{label}</Text></Pressable>)}
      </View>
      {loading&&<ActivityIndicator color={orange}/>}
      {tab==="agenda"&&<>
        <View style={styles.rowBetween}>
          <Pressable accessibilityRole="button" accessibilityLabel="Día anterior" onPress={()=>setDate(changeDay(date,-1))} style={styles.dayArrow}><Text style={styles.dayArrowText}>‹</Text></Pressable>
          <View style={{alignItems:"center"}}><Text style={styles.sectionTitle}>{formatDay(date)}</Text>{date!==localDay()&&<Pressable accessibilityRole="button" onPress={()=>setDate(localDay())}><Text style={styles.today}>Hoy</Text></Pressable>}</View>
          <Pressable accessibilityRole="button" accessibilityLabel="Día siguiente" onPress={()=>setDate(changeDay(date,1))} style={styles.dayArrow}><Text style={styles.dayArrowText}>›</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Elegir fecha" onPress={()=>setDatePickerOpen(true)} style={styles.dateSelect}><Text style={styles.today}>📅 Elegir fecha</Text></Pressable>
        {!loading&&visibleBookings.length===0&&<Text style={styles.empty}>No tienes citas este día.</Text>}
        {visibleBookings.map(group=>{
          const first=group.bookings[0];
          const inProgress=date===localDay() && now>=new Date(`${date}T${group.start}:00`).getTime() && now<new Date(`${date}T${group.end}:00`).getTime() && group.bookings.some(item=>item.status==="CONFIRMED");
          const groupStatus=inProgress?"En curso":group.bookings.length>1?group.bookings.map(item=>statusLabels[item.status]).join(" / "):first.needsReschedule?"Pendiente de reubicar":statusLabels[first.status];
          return <View key={group.key} style={[styles.card,{borderLeftColor:inProgress?orange:statusColors[first.status]}]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Abrir cita de ${group.bookings.map(item=>name(item.clientId)).join(" y ")} a las ${group.start}`} onPress={()=>openClient(first.clientId,first)}>
              <View style={styles.rowBetween}><Text style={styles.cardTime}>{group.start} – {group.end}</Text><Text style={[styles.badge,{color:inProgress?orange:statusColors[first.status]}]}>{groupStatus}</Text></View>
              <Text style={styles.cardName}>{group.bookings.map(item=>name(item.clientId)).join(" + ")}</Text>
              <Text style={styles.muted}>{service(first.serviceId)} · {room(first.roomId)}</Text>
              {group.bookings.length>1&&<Text style={styles.planHint}>Sesión dual · asistencia y notas por cliente</Text>}
            </Pressable>
            {group.bookings.length>1&&<View style={styles.actionRow}>{group.bookings.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Gestionar ${name(item.clientId)}`} onPress={()=>openClient(item.clientId,item)} style={styles.clientChip}><Text style={styles.clientChipText}>{name(item.clientId)} · {statusLabels[item.status]}</Text></Pressable>)}</View>}
          </View>;
        })}
      </>}
      {tab==="clients"&&<><Text style={styles.sectionTitle}>Mis clientes</Text><TextInput accessibilityLabel="Buscar por nombre o estado de bono" value={search} onChangeText={setSearch} placeholder="Nombre, bono activo o bono agotado" placeholderTextColor="#879389" style={styles.input}/>{!loading&&visibleClients.length===0&&<Text style={styles.empty}>No hay clientes que coincidan.</Text>}{visibleClients.map(c=>{const pkg=(data?.pendingPackages||[]).find(p=>p.clientId===c.id&&p.sessionsToSchedule>0);return <Pressable key={c.id} accessibilityRole="button" onPress={()=>openClient(c.id)} style={styles.card}><Text style={styles.cardName}>{c.name}</Text><Text style={styles.muted}>{pkg?`${pkg.sessionsToSchedule} sesiones por programar · caduca ${shortDate(pkg.expiresAt)}`:"Consultar bono"}</Text></Pressable>;})}</>}
      {tab==="roster"&&<TrainerRoster api={api} employee={data?.employees.find(item=>item.id===user.employeeId)} />}
      <Pressable accessibilityRole="button" onPress={()=>void load()} style={styles.refresh}><Text style={styles.today}>↻ Actualizar</Text></Pressable>
    </ScrollView>

    <Modal visible={!!clientId} animationType="slide" onRequestClose={()=>measureOpen?setMeasureOpen(false):closeDetail()}><View style={styles.modalPage}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{client?.name||"Ficha del cliente"}</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar ficha" onPress={closeDetail}><Text style={styles.close}>✕</Text></Pressable></View><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
      {detailLoading&&<ActivityIndicator color={orange}/>}
      {dualBookings.length>1&&<View style={styles.nextCard}>
        <Text style={styles.eyebrow}>SESIÓN DUAL · ELIGE CLIENTE</Text>
        <View style={styles.actionRow}>{dualBookings.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityState={{selected:item.id===bookingId}} accessibilityLabel={`Gestionar ${name(item.clientId)}`} onPress={()=>openClient(item.clientId,item)} style={[styles.clientChip,item.id===bookingId&&styles.clientChipActive]}><Text style={styles.clientChipText}>{name(item.clientId)} · {statusLabels[item.status]}</Text></Pressable>)}</View>
      </View>}
      {!!injuries&&<View style={styles.injury}><Text style={styles.injuryText}>⚠️ Lesiones / limitaciones: {injuries}</Text></View>}
      {!!previousPlan&&<View style={styles.nextCard}><Text style={styles.eyebrow}>PLAN DE LA CITA ANTERIOR</Text><Text style={styles.nextText}>{previousPlan}</Text></View>}
      {currentBooking&&<><View style={styles.card}><Text style={styles.cardTime}>{formatDay(currentBooking.date)} · {currentBooking.start}–{currentBooking.end}</Text><Text style={styles.muted}>{service(currentBooking.serviceId)} · {room(currentBooking.roomId)}</Text><Text style={[styles.badge,{color:statusColors[currentBooking.status]}]}>{currentBooking.needsReschedule?"Pendiente de reubicar":statusLabels[currentBooking.status]}</Text></View>{["PENDING","CONFIRMED"].includes(currentBooking.status)&&<View style={styles.actionRow}><Button label="Asistió" color={green} onPress={()=>void mark("ASISTIO")} disabled={busy||currentBooking.status!=="CONFIRMED"}/><Button label="No presentado" color={red} onPress={()=>void mark("NO_ASISTIO")} disabled={busy||currentBooking.status!=="CONFIRMED"}/></View>}{currentBooking.status==="CONFIRMED"&&<Button label="Reprogramar" color="#986713" onPress={()=>void mark("REPROGRAMAR")} disabled={busy}/>}</>}
      <View style={styles.card}><Text style={styles.sectionTitle}>Bono y servicio</Text>{activePackage?<><Text style={styles.cardName}>{activePackage.serviceName}</Text><Text style={styles.muted}>{activePackage.sessionsRemaining} sesiones disponibles · caduca {shortDate(activePackage.expiresAt)}</Text></>:<Text style={styles.muted}>Sin bono activo registrado.</Text>}</View>
      <View style={styles.card}><Text style={styles.sectionTitle}>Peso y medidas</Text>{lastWeight?<Text style={styles.muted}>Último peso: {lastWeight.weight} kg el {shortDate(lastWeight.measuredAt)}{earlierWeight?` (${((lastWeight.weight||0)-(earlierWeight.weight||0))>=0?"+":""}${((lastWeight.weight||0)-(earlierWeight.weight||0)).toFixed(1)} kg)`:""}</Text>:<Text style={styles.muted}>Sin peso registrado.</Text>}<Button label="+ Apuntar peso / medidas" onPress={openMeasure} color={orange}/>{weights.length>1&&<><Text style={styles.fieldLabel}>EVOLUCIÓN DE PESO · KG</Text><View style={styles.chart}>{weights.map(m=><View key={m.id} style={styles.chartItem}><Text style={styles.chartValue}>{m.weight}</Text><View style={[styles.chartBar,{height:24+((m.weight||0)-minWeight)/Math.max(1,maxWeight-minWeight)*60}]}/><Text style={styles.chartDate}>{shortDate(m.measuredAt)}</Text></View>)}</View></>}{waists.length>1&&<><Text style={styles.fieldLabel}>EVOLUCIÓN DE CINTURA · CM</Text><View style={styles.chart}>{waists.map(m=><View key={m.id} style={styles.chartItem}><Text style={styles.chartValue}>{m.waist}</Text><View style={[styles.chartBar,{backgroundColor:green,height:24+((m.waist||0)-minWaist)/Math.max(1,maxWaist-minWaist)*60}]}/><Text style={styles.chartDate}>{shortDate(m.measuredAt)}</Text></View>)}</View></>}</View>
      {currentBooking&&<View style={styles.card}><Text style={styles.sectionTitle}>Diario de la sesión</Text><Field label="Ejercicios y cargas" value={exercises} onChangeText={setExercises} multiline placeholder="Sentadilla 80 kg × 8, press 60 kg…"/><Text style={styles.fieldLabel}>SENSACIONES DEL CLIENTE</Text><View style={styles.actionRow}>{([["EASY","😃 Fácil"],["ADEQUATE","😐 Adecuado"],["LIMIT","🥵 Al límite"],["PAIN","🤕 Molestia"]] as const).map(([value,label])=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:feeling===value}} onPress={()=>setFeeling(value)} style={[styles.feeling,feeling===value&&styles.feelingActive]}><Text style={styles.feelingText}>{label}</Text></Pressable>)}</View>{(feeling==="GOOD"||feeling==="TIRED")&&<Text style={styles.muted}>Registro anterior: {feeling==="GOOD"?"Bien":"Cansado"}. Elige una opción de la escala actual si quieres actualizarlo.</Text>}<Field label="¿Qué trabajar la próxima sesión?" value={nextPlan} onChangeText={setNextPlan} multiline placeholder="Objetivo, progresión o precaución…"/><Button label="Guardar diario y próximo plan" onPress={()=>void saveSession()} disabled={busy}/></View>}
      <View style={styles.card}><Text style={styles.sectionTitle}>Últimas sesiones</Text>{clientBookings.filter(b=>["COMPLETED","NO_SHOW"].includes(b.status)&&b.id!==bookingId).slice(0,5).map(b=><View key={b.id} style={styles.history}><Text style={styles.cardTime}>{shortDate(b.date)} · {service(b.serviceId)}</Text><Text style={styles.muted}>{b.sessionLog?.exercises||b.notes||statusLabels[b.status]}</Text>{b.nextSessionPlan&&<Text style={styles.planHint}>Siguiente: {b.nextSessionPlan}</Text>}</View>)}{clientBookings.filter(b=>["COMPLETED","NO_SHOW"].includes(b.status)&&b.id!==bookingId).length===0&&<Text style={styles.muted}>Sin sesiones anteriores.</Text>}</View>
      <View style={styles.card}><Text style={styles.sectionTitle}>Aviso interno a recepción</Text><Field label="Nota para recepción" value={receptionNote} onChangeText={setReceptionNote} multiline placeholder="Cambio de horario, renovación del bono…"/><Button label="Guardar aviso" onPress={()=>void sendNote()} disabled={busy||!receptionNote.trim()}/>{detail?.client.clientNotes.filter(n=>n.content.startsWith("Recepción ·")).slice(0,3).map(n=><Text key={n.id} style={styles.muted}>{shortDate(n.createdAt)} · {n.content}</Text>)}</View>
      {!!notice&&<Text style={styles.successText}>✓ {notice}</Text>}{!!error&&<Text style={styles.errorText}>⚠ {error}</Text>}
    </ScrollView>
    {measureOpen&&<View style={styles.measureOverlay}><View style={styles.measurePanel}><View style={styles.rowBetween}><Text style={styles.sectionTitle}>Añadir peso / medidas</Text><Pressable accessibilityRole="button" accessibilityLabel="Volver a la ficha" onPress={()=>setMeasureOpen(false)}><Text style={styles.close}>✕</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled">{lastWeight&&<Text style={styles.muted}>Anterior: {lastWeight.weight} kg · {daysSinceWeight===0?"hoy":`hace ${daysSinceWeight} día${daysSinceWeight===1?"":"s"}`} ({shortDate(lastWeight.measuredAt)})</Text>}<Field label="Peso (kg)" value={measure.weight} onChangeText={v=>setMeasure(m=>({...m,weight:v}))} decimal placeholder="78,4"/><Field label="Grasa corporal (%)" value={measure.bodyFat} onChangeText={v=>setMeasure(m=>({...m,bodyFat:v}))} decimal/>{(["waist","hip","chest","arm","leg"] as const).map((key)=><Field key={key} label={({waist:"Cintura",hip:"Cadera",chest:"Pecho",arm:"Brazo",leg:"Pierna"} as const)[key]+" (cm)"} value={measure[key]} onChangeText={v=>setMeasure(m=>({...m,[key]:v}))} decimal/>)}{!!error&&<Text style={styles.errorText}>{error}</Text>}<Button label="Guardar medidas" onPress={()=>void saveMeasure()} disabled={busy}/></ScrollView></View></View>}
    </View></Modal>
    {datePickerOpen&&<CalendarDatePicker value={date} title="Elegir fecha de la agenda" onSelect={setDate} onClose={()=>setDatePickerOpen(false)} />}
  </View>;
}

const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:paper},header:{backgroundColor:ink,paddingTop:48,paddingBottom:16,paddingHorizontal:20,gap:14},headerTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},headerClock:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderTopWidth:1,borderTopColor:"#456058",paddingTop:12},headerClockLabel:{fontSize:10,color:"#b8c6ba",fontWeight:"800",letterSpacing:1},headerClockTime:{fontSize:29,color:"white",fontWeight:"800"},headerStatus:{fontSize:14,fontWeight:"800"},brand:{fontSize:22,color:"white",fontWeight:"800"},headerSub:{color:"#b8c6ba",fontSize:12,marginTop:3},logout:{color:"#ffb58c",fontWeight:"700",padding:10},content:{padding:18,gap:14,paddingBottom:40},alert:{backgroundColor:"#fff0dc",borderColor:"#ed691d",borderWidth:1,borderRadius:12,padding:12,flexDirection:"row",alignItems:"center",gap:8},alertText:{flex:1,color:ink,fontSize:13,fontWeight:"700"},alertClose:{fontSize:18,color:ink,padding:5},clockCard:{backgroundColor:"white",borderRadius:18,padding:18,gap:7},rowBetween:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1,color:"#77877a"},clockStatus:{fontSize:13,fontWeight:"800"},clockTime:{fontSize:32,fontWeight:"800",color:ink},muted:{fontSize:13,lineHeight:20,color:"#65746b"},actionRow:{flexDirection:"row",gap:8,flexWrap:"wrap"},button:{paddingHorizontal:15,paddingVertical:14,borderRadius:12,alignItems:"center",justifyContent:"center",minHeight:46,flexGrow:1},buttonText:{color:"white",fontWeight:"800",fontSize:13,textAlign:"center"},success:{padding:12,backgroundColor:"#e8f5e9",borderRadius:12},successText:{color:green,fontSize:13,fontWeight:"700"},error:{padding:12,backgroundColor:"#ffebe7",borderRadius:12},errorText:{color:red,fontSize:13,fontWeight:"700"},tabs:{backgroundColor:"#e4e9df",borderRadius:14,padding:4,flexDirection:"row"},tab:{flex:1,padding:13,borderRadius:11,alignItems:"center"},tabActive:{backgroundColor:ink},tabText:{fontWeight:"700",color:"#54695d"},tabTextActive:{color:"white"},sectionTitle:{fontSize:18,fontWeight:"800",color:ink,textTransform:"capitalize"},dayArrow:{width:42,height:42,alignItems:"center",justifyContent:"center",backgroundColor:"white",borderRadius:12},dayArrowText:{fontSize:27,color:ink},dateSelect:{alignSelf:"center",paddingHorizontal:14,paddingVertical:10,backgroundColor:"white",borderRadius:10},clientChip:{backgroundColor:"#e8eee7",paddingHorizontal:10,paddingVertical:9,borderRadius:9},clientChipActive:{borderWidth:2,borderColor:orange,backgroundColor:"#fff4e9"},clientChipText:{fontSize:12,color:ink,fontWeight:"700"},today:{color:orange,fontWeight:"700",fontSize:13},empty:{textAlign:"center",color:"#65746b",padding:20},card:{backgroundColor:"white",borderRadius:15,padding:16,gap:10,borderLeftWidth:5,borderLeftColor:"#e5e9df"},cardTime:{fontSize:14,color:ink,fontWeight:"800"},cardName:{fontSize:19,fontWeight:"800",color:ink},badge:{fontSize:12,fontWeight:"800"},planHint:{fontSize:12,color:"#536d58",fontWeight:"600"},refresh:{alignSelf:"center",padding:12},input:{backgroundColor:"white",borderWidth:1,borderColor:"#d8e0d5",borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:16,color:ink,minHeight:48},field:{gap:6,marginBottom:12},fieldLabel:{fontSize:11,fontWeight:"800",color:"#607367",letterSpacing:.5},modalPage:{flex:1,backgroundColor:paper,paddingTop:46},modalHeader:{padding:18,backgroundColor:ink,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},modalTitle:{fontSize:21,fontWeight:"800",color:"white",flex:1},close:{fontSize:22,color:orange,fontWeight:"800",paddingHorizontal:8},modalContent:{padding:16,gap:14,paddingBottom:55},injury:{backgroundColor:"#fee8e4",borderColor:red,borderWidth:1,borderRadius:13,padding:14},injuryText:{color:red,fontWeight:"800",fontSize:13},nextCard:{backgroundColor:"#fff4e2",borderColor:orange,borderWidth:1,borderRadius:14,padding:16,gap:7},nextText:{fontSize:16,fontWeight:"700",color:ink},feeling:{backgroundColor:"#edf1ea",borderRadius:10,padding:10,flexGrow:1,alignItems:"center"},feelingActive:{borderColor:orange,borderWidth:2,backgroundColor:"#fff5ec"},feelingText:{fontSize:12,color:ink},history:{borderTopColor:"#e3e7df",borderTopWidth:1,paddingTop:9,gap:3},chart:{height:126,flexDirection:"row",alignItems:"flex-end",justifyContent:"space-around",gap:4},chartItem:{alignItems:"center",flex:1,gap:3},chartValue:{fontSize:10,color:ink,fontWeight:"700"},chartBar:{width:"65%",maxWidth:32,backgroundColor:orange,borderRadius:5},chartDate:{fontSize:9,color:"#66776b"},measureOverlay:{position:"absolute",top:0,right:0,bottom:0,left:0,justifyContent:"flex-end",backgroundColor:"#0008"},measurePanel:{backgroundColor:paper,borderTopLeftRadius:20,borderTopRightRadius:20,padding:18,maxHeight:"85%",gap:12},
});
