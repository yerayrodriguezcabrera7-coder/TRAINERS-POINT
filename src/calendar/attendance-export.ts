import { DateTime } from 'luxon';

type AttendanceReport = {
  timezone: string; from: string; to: string;
  employees: { id: string; name: string }[];
  records: { id: string; employeeId: string; clockIn: string | Date; clockOut: string | Date | null }[];
};
// Quoting alone does not prevent spreadsheet formula execution.
const cell = (value: unknown) => {
  const text = String(value ?? '');
  return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
};
const elapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
export function attendanceCsv(report: AttendanceReport): string {
  const names = new Map(report.employees.map(e => [e.id, e.name]));
  const start = DateTime.fromISO(report.from, { zone: report.timezone }).startOf('day').toMillis();
  const end = DateTime.fromISO(report.to, { zone: report.timezone }).plus({ days: 1 }).startOf('day').toMillis();
  const rows: unknown[][] = [['ID fichaje', 'Trabajador', 'Fecha entrada', 'Hora entrada', 'Fecha salida', 'Hora salida', 'Total jornada (hh:mm:ss)', 'Tiempo dentro del período (hh:mm:ss)', 'Estado', 'Zona horaria']];
  for (const r of report.records) {
    const from = DateTime.fromJSDate(new Date(r.clockIn), { zone: report.timezone });
    const to = r.clockOut ? DateTime.fromJSDate(new Date(r.clockOut), { zone: report.timezone }) : null;
    rows.push([r.id, names.get(r.employeeId) || r.employeeId, from.toFormat('dd/MM/yyyy'), from.toFormat('HH:mm:ss ZZ'), to?.toFormat('dd/MM/yyyy') || '', to?.toFormat('HH:mm:ss ZZ') || '', to ? elapsed(to.toMillis() - from.toMillis()) : '', to ? elapsed(Math.min(end, to.toMillis()) - Math.max(start, from.toMillis())) : '', to ? 'Cerrada' : 'En curso: pendiente de salida', report.timezone]);
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
