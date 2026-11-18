import type { Booking } from "./types";

export type TrainerAgendaGroup = { key: string; bookings: Booking[]; date: string; start: string; end: string };
export type TrainerAgendaAlert = { key: string; kind: "NEW_TODAY" | "CANCELLED_SOON"; clientIds: string[]; start: string };

const groupKey = (booking: Booking) => booking.sessionId
  ? `${booking.sessionId}:${booking.date}:${booking.start}:${booking.employeeId}`
  : booking.id;

export function groupTrainerBookings(bookings: Booking[], day: string): TrainerAgendaGroup[] {
  const groups = new Map<string, TrainerAgendaGroup>();
  for (const booking of bookings.filter(item => item.date === day)) {
    const key = groupKey(booking);
    const group = groups.get(key) || { key, bookings: [], date: booking.date, start: booking.start, end: booking.end };
    group.bookings.push(booking);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export function detectTrainerAgendaAlerts(previous: Booking[], next: Booking[], now = new Date()): TrainerAgendaAlert[] {
  const oldById = new Map(previous.map(booking => [booking.id, booking]));
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const alerts = new Map<string, TrainerAgendaAlert>();
  for (const booking of next) {
    const old = oldById.get(booking.id);
    const startsAt = new Date(`${booking.date}T${booking.start}:00`).getTime();
    const newToday = !old && booking.date === today && ["PENDING", "CONFIRMED"].includes(booking.status);
    const cancelledSoon = old && old.status !== "CANCELLED" && booking.status === "CANCELLED"
      && startsAt >= now.getTime() && startsAt <= now.getTime() + 3 * 60 * 60 * 1000;
    if (!newToday && !cancelledSoon) continue;
    const kind = newToday ? "NEW_TODAY" : "CANCELLED_SOON";
    const key = `${kind}:${groupKey(booking)}`;
    const alert = alerts.get(key) || { key, kind, clientIds: [], start: booking.start };
    alert.clientIds.push(booking.clientId);
    alerts.set(key, alert);
  }
  return [...alerts.values()];
}
