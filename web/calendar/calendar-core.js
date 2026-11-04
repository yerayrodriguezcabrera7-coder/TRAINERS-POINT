(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CalendarCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (key, n) => { const date = parseDate(key); date.setDate(date.getDate() + n); return dateKey(date); };
  const monday = key => addDays(key, -((parseDate(key).getDay() + 6) % 7));
  const minutes = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const timeLabel = n => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
  const overlap = (a, b) => minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
  const validDate = key => /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(parseDate(key)) === key;
  const validTime = time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  function hoursFor(date, schedule) { return schedule[(parseDate(date).getDay() + 6) % 7]; }
  function isOpen(date, start, end, schedule) {
    const hours = hoursFor(date, schedule);
    return !hours.closed && start >= minutes(hours.open) && end <= minutes(hours.close) && start < end;
  }
  function employeePeriods(employee, date, schedule) {
    if (employee.active === false) return [];
    const override = employee.shifts?.find(s => s.date === date);
    if (override) return override.periods;
    if (employee.weeklyPeriods) return employee.weeklyPeriods[(parseDate(date).getDay() + 6) % 7];
    const hours = hoursFor(date, employee.schedule || schedule);
    return hours.closed ? [] : [hours];
  }
  function employeeAvailable(employee, date, start, end, schedule) {
    return isOpen(date, start, end, schedule) && employeePeriods(employee, date, schedule)
      .some(p => start >= minutes(p.open) && end <= minutes(p.close));
  }
  function validateBooking(booking, bookings, schedule) {
    if (!validDate(booking.date) || !validTime(booking.start) || !validTime(booking.end)) return 'Introduce una fecha y unas horas válidas.';
    if (minutes(booking.start) >= minutes(booking.end)) return 'La hora de fin debe ser posterior al inicio.';
    if (booking.status === 'cancelled') return '';
    if (!isOpen(booking.date, minutes(booking.start), minutes(booking.end), schedule)) return 'La reserva debe quedar dentro del horario de apertura.';
    const clash = bookings.find(other => other.id !== booking.id && other.date === booking.date && other.status !== 'cancelled' && overlap(booking, other) && (other.employeeId === booking.employeeId || other.roomId === booking.roomId));
    if (clash) return clash.employeeId === booking.employeeId ? 'Este entrenador ya tiene una reserva en ese horario.' : 'La sala ya está ocupada en ese horario.';
    return '';
  }
  // Interval partitioning keeps imported, overlapping appointments readable.
  function layoutEvents(events) {
    const sorted = [...events].sort((a, b) => minutes(a.start) - minutes(b.start) || minutes(b.end) - minutes(a.end));
    let group = [], groupEnd = -1;
    const result = [];
    function flush() {
      const lanes = [];
      const placed = group.map(event => {
        let lane = lanes.findIndex(end => end <= minutes(event.start));
        if (lane < 0) lane = lanes.length;
        lanes[lane] = minutes(event.end);
        return { event, lane };
      });
      result.push(...placed.map(item => ({ ...item, count: lanes.length })));
    }
    for (const event of sorted) {
      if (group.length && minutes(event.start) >= groupEnd) { flush(); group = []; groupEnd = -1; }
      group.push(event); groupEnd = Math.max(groupEnd, minutes(event.end));
    }
    if (group.length) flush();
    return result;
  }
  return { dateKey, parseDate, addDays, monday, minutes, timeLabel, hoursFor, isOpen, validateBooking, layoutEvents, validDate, employeePeriods, employeeAvailable };
});
