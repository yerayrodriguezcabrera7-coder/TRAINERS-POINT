import type { CalendarData } from "./types";

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function upcomingBookings(calendar: CalendarData | null, now = new Date()) {
  const day = localDay(now), time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (calendar?.bookings ?? [])
    .filter(booking => ["PENDING", "CONFIRMED"].includes(booking.status) &&
      (booking.date > day || booking.date === day && booking.end > time))
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
}
