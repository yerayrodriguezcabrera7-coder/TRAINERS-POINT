import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { type ApiContext } from "../http/api-context";
import { readJsonBody, sendError, sendJson } from "../http/json";

const COBOSU_SERVICES: Record<string, { name: string; duration: number; roomId: string; roomName: string }> = {
  "v-gym": { name: "Cobosu - Gimnasio (60 min)", duration: 60, roomId: "r-cobosu-gym", roomName: "Cobosu - Sala Gimnasio" },
  "cobosu-gym": { name: "Cobosu - Gimnasio (60 min)", duration: 60, roomId: "r-cobosu-gym", roomName: "Cobosu - Sala Gimnasio" },
  "v-cabin-15": { name: "Cobosu - Cabina Rápida (15 min)", duration: 15, roomId: "r-cobosu-cab1", roomName: "Cobosu - Cabina 1" },
  "cobosu-cabin-15": { name: "Cobosu - Cabina Rápida (15 min)", duration: 15, roomId: "r-cobosu-cab1", roomName: "Cobosu - Cabina 1" },
  "v-cabin-30": { name: "Cobosu - Cabina Recuperación (30 min)", duration: 30, roomId: "r-cobosu-cab2", roomName: "Cobosu - Cabina 2" },
  "cobosu-cabin-30": { name: "Cobosu - Cabina Recuperación (30 min)", duration: 30, roomId: "r-cobosu-cab2", roomName: "Cobosu - Cabina 2" },
  "v-cabin-60": { name: "Cobosu - Cabina Intensiva (60 min)", duration: 60, roomId: "r-cobosu-cab2", roomName: "Cobosu - Cabina 2" },
  "cobosu-cabin-60": { name: "Cobosu - Cabina Intensiva (60 min)", duration: 60, roomId: "r-cobosu-cab2", roomName: "Cobosu - Cabina 2" }
};

const COBOSU_CENTERS: Record<string, { gymId: string; name: string; address: string; key: "vizcaya" | "independencia" }> = {
  vizcaya: { gymId: "cobosu-bizkaia", name: "Cobosu Vizcaya", address: "Calle Gran Vía 42, Bilbao", key: "vizcaya" },
  "cobosu-bizkaia": { gymId: "cobosu-bizkaia", name: "Cobosu Vizcaya", address: "Calle Gran Vía 42, Bilbao", key: "vizcaya" },
  independencia: { gymId: "cobosu-independencia", name: "Cobosu Independencia", address: "Plaza Independencia 8, Bilbao", key: "independencia" },
  "cobosu-independencia": { gymId: "cobosu-independencia", name: "Cobosu Independencia", address: "Plaza Independencia 8, Bilbao", key: "independencia" }
};

function addMinutes(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = (h * 60 + m + minutesToAdd) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return dateStr;
  }
}

export async function cobosuCalendarRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ApiContext
): Promise<boolean> {
  const { calendarPool } = context;
  if (!calendarPool) return false;

  // 1. GET /api/cobosu/calendar - Citas actuales y próxima cita
  if (request.method === "GET" && url.pathname === "/api/cobosu/calendar") {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { rows } = await calendarPool.query(
        `SELECT id, gym_id, data FROM calendar.bookings 
         WHERE (gym_id LIKE 'cobosu%' OR data->>'centerId' LIKE 'cobosu%' OR data->>'serviceName' ILIKE '%cobosu%' OR data->>'serviceName' ILIKE '%cabina%')
           AND data->>'status' != 'CANCELLED'
         ORDER BY data->>'date' ASC, data->>'start' ASC`
      );

      const appointments = rows.map((r) => {
        const d = r.data;
        const centerInfo = COBOSU_CENTERS[d.centerId] || COBOSU_CENTERS[r.gym_id] || COBOSU_CENTERS.vizcaya;
        const durationMin = d.end && d.start ? (() => {
          const [sh, sm] = d.start.split(":").map(Number);
          const [eh, em] = d.end.split(":").map(Number);
          return (eh * 60 + em) - (sh * 60 + sm);
        })() : 60;

        return {
          id: d.id || r.id,
          centerId: centerInfo.key,
          centerName: centerInfo.name,
          serviceId: d.serviceId,
          serviceName: d.serviceName || "Entrenamiento en Gimnasio",
          durationMin: durationMin > 0 ? durationMin : 60,
          dateStr: d.date,
          dateFormatted: formatDate(d.date),
          timeSlot: d.start,
          status: (d.status === "CONFIRMED" ? "CONFIRMADA" : d.status === "COMPLETED" ? "COMPLETADA" : "CANCELADA") as "CONFIRMADA" | "COMPLETADA" | "CANCELADA",
        };
      });

      const nextAppointment = appointments.find((a) => a.status === "CONFIRMADA" && a.dateStr >= today) || null;

      sendJson(response, 200, {
        success: true,
        appointments,
        nextAppointment,
        centers: [
          { id: "vizcaya", name: "Cobosu Vizcaya", address: "Calle Gran Vía 42, Bilbao" },
          { id: "independencia", name: "Cobosu Independencia", address: "Plaza Independencia 8, Bilbao" }
        ]
      });
      return true;
    } catch (err: any) {
      sendError(response, 500, err?.message || "Error al obtener calendario de Cobosu");
      return true;
    }
  }

  // 2. POST /api/cobosu/bookings - Crear nueva reserva desde la app móvil Cobosu
  if (request.method === "POST" && url.pathname === "/api/cobosu/bookings") {
    try {
      const payload = (await readJsonBody(request)) as {
        centerId?: string;
        serviceId?: string;
        date?: string;
        timeSlot?: string;
        notes?: string;
      };

      const centerKey = payload.centerId || "vizcaya";
      const centerConfig = COBOSU_CENTERS[centerKey] || COBOSU_CENTERS.vizcaya;
      const serviceConfig = COBOSU_SERVICES[payload.serviceId || "v-gym"] || COBOSU_SERVICES["v-gym"];

      const dateStr = payload.date || new Date().toISOString().slice(0, 10);
      const timeSlot = payload.timeSlot || "16:00";
      const durationMin = serviceConfig.duration;
      const endTime = addMinutes(timeSlot, durationMin);
      const bookingId = randomUUID();

      const bookingData = {
        id: bookingId,
        clientId: "cobosu-client-1",
        clientName: "Socio Cobosu",
        centerId: centerConfig.gymId,
        centerName: centerConfig.name,
        serviceId: payload.serviceId || "cobosu-gym",
        serviceName: serviceConfig.name,
        roomId: serviceConfig.roomId,
        roomName: serviceConfig.roomName,
        employeeId: null,
        date: dateStr,
        start: timeSlot,
        end: endTime,
        status: "CONFIRMED",
        notes: payload.notes || "Reserva realizada desde app móvil Cobosu",
        version: 1
      };

      // Guardar directamente en calendar.bookings
      await calendarPool.query(
        `INSERT INTO calendar.bookings (id, gym_id, data)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (gym_id, id) DO UPDATE SET data = EXCLUDED.data`,
        [bookingId, centerConfig.gymId, JSON.stringify(bookingData)]
      );

      // Incrementar revisión en el centro para que recepción actualice su vista inmediatamente
      await calendarPool.query(
        `UPDATE calendar.gyms SET revision = revision + 1 WHERE id = $1`,
        [centerConfig.gymId]
      );

      const createdAppointment = {
        id: bookingId,
        centerId: centerConfig.key,
        centerName: centerConfig.name,
        serviceId: payload.serviceId || "v-gym",
        serviceName: serviceConfig.name,
        durationMin,
        dateStr,
        dateFormatted: formatDate(dateStr),
        timeSlot,
        status: "CONFIRMADA" as const
      };

      sendJson(response, 201, {
        success: true,
        booking: createdAppointment,
        message: "Reserva creada y conectada con la agenda de recepción."
      });
      return true;
    } catch (err: any) {
      sendError(response, 400, err?.message || "No se pudo registrar la reserva");
      return true;
    }
  }

  // 3. POST /api/cobosu/bookings/:id/cancel - Cancelar reserva
  const cancelMatch = url.pathname.match(/^\/api\/cobosu\/bookings\/([^/]+)\/cancel$/);
  if (request.method === "POST" && cancelMatch) {
    try {
      const bookingId = decodeURIComponent(cancelMatch[1]);
      
      // Actualizar estado en calendar.bookings
      const result = await calendarPool.query(
        `UPDATE calendar.bookings
         SET data = jsonb_set(data, '{status}', '"CANCELLED"')
         WHERE id = $1
         RETURNING gym_id`,
        [bookingId]
      );

      if (result.rowCount && result.rowCount > 0) {
        const gymId = result.rows[0].gym_id;
        await calendarPool.query(
          `UPDATE calendar.gyms SET revision = revision + 1 WHERE id = $1`,
          [gymId]
        );
      }

      sendJson(response, 200, {
        success: true,
        message: "Reserva cancelada correctamente."
      });
      return true;
    } catch (err: any) {
      sendError(response, 400, err?.message || "No se pudo cancelar la reserva");
      return true;
    }
  }

  return false;
}

