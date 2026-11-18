import { PrismaClient } from '@prisma/client';

/**
 * Calcula la información de la sesión para personalizar el recordatorio:
 * número de sesión, si es última, si hay lesiones, si el bono caduca pronto.
 */
export async function sessionInfo(
  db: PrismaClient,
  bookingId: string,
): Promise<{
  sessionNumber?: number;    // ej: 3 de 10
  totalSessions?: number;    // total sesiones del bono
  isLastSession?: boolean;   // última sesión del bono
  bonusExpiring?: boolean;   // bono próximo a caducar
  cancellationPolicy: string;
}> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      package: { include: { service: true } },
      client: true,
    },
  });

  if (!booking || !booking.packageId) {
    return {
      cancellationPolicy:
        'Recuerda que debes cancelar con mínimo 2 horas de antelación y dentro del horario laboral del centro.',
    };
  }

  // Access the package details safely
  if (!booking.package) {
    return {
      cancellationPolicy:
        'Recuerda que debes cancelar con mínimo 2 horas de antelación y dentro del horario laboral del centro.',
    };
  }

  const packageService = booking.package.service;
  const trainingCount = packageService?.trainingCount ?? 4; // fallback
  const validityWeeks = packageService?.validityWeeks ?? 4;

  // Calcular sesiones ya consumidas (COMPLETADA)
  const usedBookings = await db.booking.count({
    where: { packageId: booking.packageId, status: 'COMPLETADA' },
  });
  const sessionNumber = usedBookings + 1;
  const remaining = trainingCount - usedBookings;

  const isLastSession = remaining <= 1;

  // Verificar si el bono está próximo a caducar (en los próximos 7 días)
  const purchasedAt = booking.package.purchasedAt?.getTime() ?? Date.now();
  const expiresAt = purchasedAt + validityWeeks * 7 * 24 * 60 * 60 * 1000;
  const bonusExpiring = expiresAt < Date.now() + 7 * 24 * 60 * 60 * 1000;

  return {
    sessionNumber,
    totalSessions: trainingCount,
    isLastSession,
    bonusExpiring,
    cancellationPolicy:
      'Recuerda que debes cancelar con mínimo 2 horas de antelación y dentro del horario laboral del centro.',
  };
}

/**
 * Genera el texto del recordatorio de sesión mejorado con información contextual.
 */
export function enhancedReminderText(
  clientName: string,
  date: string,
  time: string,
  service: string,
  trainer: string,
  info: {
    sessionNumber?: number;
    totalSessions?: number;
    isLastSession?: boolean;
    bonusExpiring?: boolean;
    cancellationPolicy: string;
  },
  isRecovery = false,
): string {
  let text = `Hola ${clientName}. Te recordamos tu cita del ${date} a las ${time}: ${service}, con ${trainer}.`;

  if (isRecovery) text += ' Sesión de recuperación.';

  if (info.sessionNumber && info.totalSessions) {
    text += ` Sesión ${info.sessionNumber} de ${info.totalSessions} de tu bono.`;
  }

  if (info.isLastSession) {
    text += ' ⚠️ ¡Esta es tu última sesión! Toca renovar tu bono.';
  }

  if (info.bonusExpiring) {
    text += ' Tu bono está próximo a caducar.';
  }

  text += ` ${info.cancellationPolicy}`;
  text += ' Trainers Point.';

  return text;
}
