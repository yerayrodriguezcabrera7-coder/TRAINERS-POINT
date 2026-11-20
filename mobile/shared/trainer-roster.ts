import { localDay } from "./calendar";
import type { CalendarData } from "./types";
import type { TrainerLeave } from "./trainer-types";

export function weekRoster(employee: CalendarData["employees"][number] | undefined, leaves: TrainerLeave[], monday: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    const iso = localDay(date);
    const approved = leaves.find(leave => leave.status === "APPROVED" && iso >= leave.startDate && iso <= leave.endDate);
    const override = employee?.shifts?.find(shift => shift.date === iso);
    const periods = override?.periods || employee?.weeklyPeriods?.[index]
      || (employee?.schedule?.[index] && !employee.schedule[index].closed
        ? [{ open: employee.schedule[index].open, close: employee.schedule[index].close }] : []);
    return { iso, date, approved, periods };
  });
}
