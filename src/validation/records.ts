import { type ClientStatus,PaymentMethod,PaymentStatus } from "@prisma/client";

export const validStatuses: ClientStatus[] = ["LEAD", "ACTIVO", "INACTIVO", "BAJA"];
const validPaymentMethods: PaymentMethod[] = ["EFECTIVO", "TARJETA", "BIZUM", "TRANSFERENCIA", "OTRO"];
const validPaymentStatuses: PaymentStatus[] = ["PENDIENTE", "PAGADO", "FALLIDO", "REEMBOLSADO"];
type ClientInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gymId: string;
  dni?: string | null;
  address?: string | null;
  birthDate?: string;
  notes?: string;
  objective?: string;
  sex?: ClientSexInput | null;
  source?: ClientSourceInput | null;
  sourceDetail?: string | null;
  preferredName?: string | null;
  contactPreference?: ContactPreferenceInput | null;
  contactSlot?: ContactSlotInput | null;
  injuries?: string[] | null;
  injuryNotes?: string | null;
  availability?: { days: string[]; slots: string[] } | null;
  sessionsPerWeek?: number | null;
  firstSessionPreference?: Date | null;
  consentData?: Date | null;
  consentMarketing?: Date | null;
  consentPhotos?: Date | null;
};

const clientSexValues = ["MUJER", "HOMBRE", "NO_INDICA"] as const;
const clientSourceValues = ["INSTAGRAM", "RECOMENDACION", "PASO_POR_LA_PUERTA", "GOOGLE", "OTRO"] as const;
const contactPreferenceValues = ["WHATSAPP", "SMS", "LLAMADA", "EMAIL"] as const;
const contactSlotValues = ["MANANA", "MEDIODIA", "TARDE"] as const;
const injuryZoneValues = ["RODILLA", "ESPALDA", "HOMBRO", "CUELLO", "CADERA", "OTRA"] as const;
const availabilityDayValues = ["L", "M", "X", "J", "V", "S", "D"] as const;
const sessionsPerWeekValues = [1, 2, 3, 4] as const;
type ClientSexInput = (typeof clientSexValues)[number];
type ClientSourceInput = (typeof clientSourceValues)[number];
type ContactPreferenceInput = (typeof contactPreferenceValues)[number];
type ContactSlotInput = (typeof contactSlotValues)[number];

type MeasurementInput = {
  measuredAt: string;
  weight?: number;
  hip?: number;
  waist?: number;
  leg?: number;
  chest?: number;
  arm?: number;
  notes?: string;
};

type GymInput = {
  name: string;
  city?: string;
  province?: string;
  address?: string;
  photoData?: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
};

type ServiceInput = {
  name: string;
  description?: string | null;
  durationMin: number;
  price: number;
  modality: "INDIVIDUAL" | "DUAL";
  type: "PACK" | "SESION_INDIVIDUAL";
  trainingCount: number;
  validityWeeks: number | null;
  recommendedWeeklyFrequency: number | null;
  conditions: string | null;
  isActive: boolean;
};

export const serviceSelectFields = {
  id: true,
  name: true,
  description: true,
  durationMin: true,
  price: true,
  modality: true,
  type: true,
  trainingCount: true,
  validityWeeks: true,
  recommendedWeeklyFrequency: true,
  conditions: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly (string | number)[]>(value: unknown, values: T): value is T[number] {
  return values.some((candidate) => candidate === value);
}

function parseConsentDate(value: unknown): Date | null | undefined | string {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return "La fecha del consentimiento no es válida.";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return "La fecha del consentimiento no es válida.";
  }
  return parsed;
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function parseClientInput(value: unknown): ClientInput | string {
  if (!isRecord(value)) {
    return "El formulario no tiene un formato válido.";
  }

  const firstName = typeof value.firstName === "string" ? value.firstName.trim() : "";
  const lastName = typeof value.lastName === "string" ? value.lastName.trim() : "";
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const phone = typeof value.phone === "string" ? value.phone.trim() : "";
  const dni = value.dni === undefined ? undefined : value.dni === null ? null : typeof value.dni === "string" ? value.dni.trim() : "";
  const address = value.address === undefined ? undefined : value.address === null ? null : typeof value.address === "string" ? value.address.trim() : "";
  const notes = typeof value.notes === "string" ? value.notes.trim() : "";
  const objective = typeof value.objective === "string" ? value.objective.trim() : "";
  const birthDate = typeof value.birthDate === "string" ? value.birthDate.trim() : "";
  const gymId = typeof value.gymId === "string" ? value.gymId.trim() : "";
  const sex = value.sex === undefined ? undefined : value.sex === null || value.sex === "" ? null : value.sex;
  const source = value.source === undefined ? undefined : value.source === null || value.source === "" ? null : value.source;
  const contactPreference = value.contactPreference === undefined ? undefined : value.contactPreference === null || value.contactPreference === "" ? null : value.contactPreference;
  const contactSlot = value.contactSlot === undefined ? undefined : value.contactSlot === null || value.contactSlot === "" ? null : value.contactSlot;
  const sourceDetail = value.sourceDetail === undefined ? undefined : value.sourceDetail === null ? null : typeof value.sourceDetail === "string" ? value.sourceDetail.trim() : "";
  const preferredName = value.preferredName === undefined ? undefined : value.preferredName === null ? null : typeof value.preferredName === "string" ? value.preferredName.trim() : "";
  const injuryNotes = value.injuryNotes === undefined ? undefined : value.injuryNotes === null ? null : typeof value.injuryNotes === "string" ? value.injuryNotes.trim() : "";
  const injuries = value.injuries;
  const availability = value.availability;
  const sessionsPerWeek = value.sessionsPerWeek;
  const firstSessionPreference = parseConsentDate(value.firstSessionPreference);
  const consentData = parseConsentDate(value.consentData);
  const consentMarketing = parseConsentDate(value.consentMarketing);
  const consentPhotos = parseConsentDate(value.consentPhotos);
  if (
    (value.birthDate !== undefined && value.birthDate !== null && typeof value.birthDate !== "string") ||
    (value.dni !== undefined && value.dni !== null && typeof value.dni !== "string") ||
    (value.address !== undefined && value.address !== null && typeof value.address !== "string") ||
    (value.sourceDetail !== undefined && value.sourceDetail !== null && typeof value.sourceDetail !== "string") ||
    (value.preferredName !== undefined && value.preferredName !== null && typeof value.preferredName !== "string") ||
    (value.injuryNotes !== undefined && value.injuryNotes !== null && typeof value.injuryNotes !== "string")
  ) {
    return "Revisa los campos de texto de la ficha.";
  }

  if (!firstName || firstName.length > 100) {
    return "El nombre es obligatorio y debe tener como máximo 100 caracteres.";
  }

  if (!lastName || lastName.length > 100) {
    return "Los apellidos son obligatorios y deben tener como máximo 100 caracteres.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return "Introduce un correo electrónico válido.";
  }

  if (!phone || phone.length > 40) {
    return "El teléfono es obligatorio y debe tener como máximo 40 caracteres.";
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gymId)) {
    return "Selecciona un gimnasio válido.";
  }

  if (notes.length > 5000 || objective.length > 1000) {
    return "Las notas o el objetivo superan la longitud permitida.";
  }
  if ((dni?.length ?? 0) > 40 || (address?.length ?? 0) > 300) {
    return "El DNI o la dirección superan la longitud permitida.";
  }

  if (sex !== undefined && sex !== null && !isOneOf(sex, clientSexValues)) return "Selecciona una opción de sexo válida.";
  if (source !== undefined && source !== null && !isOneOf(source, clientSourceValues)) return "Selecciona un origen válido.";
  if (contactPreference !== undefined && contactPreference !== null && !isOneOf(contactPreference, contactPreferenceValues)) return "Selecciona una forma de contacto válida.";
  if (contactSlot !== undefined && contactSlot !== null && !isOneOf(contactSlot, contactSlotValues)) return "Selecciona una franja de contacto válida.";
  if ((sourceDetail?.length ?? 0) > 200 || (preferredName?.length ?? 0) > 100 || (injuryNotes?.length ?? 0) > 3000) {
    return "Uno de los campos de la ficha supera la longitud permitida.";
  }
  if (injuries !== undefined && injuries !== null &&
      (!Array.isArray(injuries) || injuries.length > injuryZoneValues.length ||
       injuries.some((zone) => !isOneOf(zone, injuryZoneValues)) ||
       new Set(injuries).size !== injuries.length)) {
    return "Revisa las zonas de lesión seleccionadas.";
  }
  if (availability !== undefined && availability !== null) {
    if (!isRecord(availability) || !Array.isArray(availability.days) || !Array.isArray(availability.slots) ||
        availability.days.some((day) => !isOneOf(day, availabilityDayValues)) ||
        availability.slots.some((slot) => !isOneOf(slot, contactSlotValues)) ||
        new Set(availability.days).size !== availability.days.length ||
        new Set(availability.slots).size !== availability.slots.length) {
      return "Revisa los días y las franjas de disponibilidad.";
    }
  }
  if (sessionsPerWeek !== undefined && sessionsPerWeek !== null &&
      !isOneOf(sessionsPerWeek, sessionsPerWeekValues)) {
    return "Selecciona una frecuencia semanal válida.";
  }
  if (
    typeof firstSessionPreference === "string" ||
    typeof consentData === "string" ||
    typeof consentMarketing === "string" ||
    typeof consentPhotos === "string"
  ) {
    return "Una de las fechas indicadas no es válida.";
  }

  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return "La fecha de nacimiento no es válida.";
  }

  if (birthDate) {
    const parsedDate = new Date(`${birthDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== birthDate) {
      return "La fecha de nacimiento no es válida.";
    }
  }

  return {
    firstName,
    lastName,
    email,
    phone,
    gymId,
    ...(dni !== undefined ? { dni: dni || null } : {}),
    ...(address !== undefined ? { address: address || null } : {}),
    ...(birthDate ? { birthDate } : {}),
    ...(notes ? { notes } : {}),
    ...(objective ? { objective } : {}),
    ...(sex !== undefined ? { sex: sex as ClientSexInput | null } : {}),
    ...(source !== undefined ? { source: source as ClientSourceInput | null } : {}),
    ...(sourceDetail !== undefined ? { sourceDetail: sourceDetail || null } : {}),
    ...(preferredName !== undefined ? { preferredName: preferredName || null } : {}),
    ...(contactPreference !== undefined ? { contactPreference: contactPreference as ContactPreferenceInput | null } : {}),
    ...(contactSlot !== undefined ? { contactSlot: contactSlot as ContactSlotInput | null } : {}),
    ...(injuries !== undefined ? { injuries: injuries as string[] | null } : {}),
    ...(injuryNotes !== undefined ? { injuryNotes: injuryNotes || null } : {}),
    ...(availability !== undefined ? {
      availability: availability === null ? null : {
        days: availability.days as string[],
        slots: availability.slots as string[],
      },
    } : {}),
    ...(sessionsPerWeek !== undefined ? { sessionsPerWeek: sessionsPerWeek as number | null } : {}),
    ...(firstSessionPreference !== undefined ? { firstSessionPreference } : {}),
    ...(consentData !== undefined ? { consentData } : {}),
    ...(consentMarketing !== undefined ? { consentMarketing } : {}),
    ...(consentPhotos !== undefined ? { consentPhotos } : {}),
  };
}

export function parseMeasurementInput(value: unknown): MeasurementInput | string {
  if (!isRecord(value)) return "La medición no tiene un formato válido.";
  const measuredAt = typeof value.measuredAt === "string" ? value.measuredAt.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredAt)) return "Introduce una fecha válida.";
  const parsedDate = new Date(`${measuredAt}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== measuredAt) return "Introduce una fecha válida.";
  const fields = ["weight", "hip", "waist", "leg", "chest", "arm"] as const;
  const result: MeasurementInput = { measuredAt };
  for (const field of fields) {
    if (value[field] === undefined || value[field] === null || value[field] === "") continue;
    const number = typeof value[field] === "number" ? value[field] : Number(value[field]);
    if (!Number.isFinite(number) || number <= 0 || number > 1000) return "Las medidas deben ser números positivos válidos.";
    result[field] = Math.round(number * 100) / 100;
  }
  if (fields.every((field) => result[field] === undefined)) return "Introduce al menos una medida.";
  if (typeof value.notes === "string" && value.notes.trim().length > 1000) return "Las notas superan la longitud permitida.";
  if (typeof value.notes === "string" && value.notes.trim()) result.notes = value.notes.trim();
  return result;
}

export function parseGymInput(value: unknown): GymInput | string {
  if (!isRecord(value)) {
    return "El formulario del gimnasio no tiene un formato válido.";
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const city = typeof value.city === "string" ? value.city.trim() : "";
  const province = typeof value.province === "string" ? value.province.trim() : "";
  const address = typeof value.address === "string" ? value.address.trim() : "";
  const photoData = typeof value.photoData === "string" ? value.photoData.trim() : "";

  const rawLat = value.latitude;
  const latitude = typeof rawLat === "number" && !isNaN(rawLat) ? rawLat : (typeof rawLat === "string" && rawLat.trim() && !isNaN(Number(rawLat)) ? Number(rawLat) : null);
  const rawLon = value.longitude;
  const longitude = typeof rawLon === "number" && !isNaN(rawLon) ? rawLon : (typeof rawLon === "string" && rawLon.trim() && !isNaN(Number(rawLon)) ? Number(rawLon) : null);
  const rawRadius = value.radiusMeters;
  const radiusMeters = typeof rawRadius === "number" && !isNaN(rawRadius) ? Math.round(rawRadius) : (typeof rawRadius === "string" && rawRadius.trim() && !isNaN(Number(rawRadius)) ? Math.round(Number(rawRadius)) : 200);

  if (!name || name.length > 120) {
    return "El nombre es obligatorio y debe tener como máximo 120 caracteres.";
  }
  if (city.length > 100 || province.length > 100 || address.length > 200) {
    return "La ubicación supera la longitud permitida.";
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    return "La latitud debe estar comprendida entre -90 y 90.";
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    return "La longitud debe estar comprendida entre -180 y 180.";
  }

  if (photoData && (!/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(photoData) || photoData.length > 1_500_000)) {
    return "La imagen no es válida o supera el tamaño permitido.";
  }

  return {
    name,
    ...(city ? { city } : {}),
    ...(province ? { province } : {}),
    ...(address ? { address } : {}),
    ...(photoData ? { photoData } : {}),
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    radiusMeters: radiusMeters ?? 200,
  };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseServiceInput(value: unknown): ServiceInput | string {
  if (!isRecord(value)) {
    return "El formulario del servicio no tiene un formato válido.";
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const durationMin = typeof value.durationMin === "number" ? value.durationMin : Number(value.durationMin);
  const price = typeof value.price === "number" ? value.price : Number(value.price);

  if (!name || name.length > 120) {
    return "El nombre del servicio es obligatorio y debe tener como máximo 120 caracteres.";
  }
  if (value.durationMin === undefined || value.durationMin === null || value.durationMin === "" || !Number.isInteger(durationMin) || durationMin < 5 || durationMin > 1440) {
    return "La duración por sesión es obligatoria y debe estar entre 5 y 1440 minutos.";
  }
  if (value.price === undefined || value.price === null || value.price === "" || !Number.isFinite(price) || price < 0 || price > 99999999.99) {
    return "El precio total es obligatorio, no puede ser negativo y debe tener un valor válido (hasta 99.999.999,99 €).";
  }
  if (description.length > 2000) {
    return "La descripción debe tener como máximo 2000 caracteres.";
  }

  const rawModality = String(value.modality ?? "INDIVIDUAL").trim().toUpperCase();
  if (rawModality !== "INDIVIDUAL" && rawModality !== "DUAL") {
    return "La modalidad debe ser individual o dual.";
  }
  const modality: "INDIVIDUAL" | "DUAL" = rawModality as "INDIVIDUAL" | "DUAL";

  const rawType = String(value.type ?? "SESION_INDIVIDUAL").trim().toUpperCase();
  if (rawType !== "PACK" && rawType !== "SESION_INDIVIDUAL") {
    return "El tipo de servicio debe ser pack o sesión individual.";
  }
  const type: "PACK" | "SESION_INDIVIDUAL" = rawType as "PACK" | "SESION_INDIVIDUAL";

  if (value.trainingCount === undefined || value.trainingCount === null || value.trainingCount === "") {
    return "Indica el número de sesiones del servicio.";
  }
  const rawTrainingCount = Number(value.trainingCount);
  if (!Number.isInteger(rawTrainingCount) || rawTrainingCount < 1 || rawTrainingCount > 500) {
    return "El número de sesiones debe ser un entero entre 1 y 500.";
  }
  const trainingCount = rawTrainingCount;

  let validityWeeks: number = 4;
  if (value.validityWeeks != null && value.validityWeeks !== "") {
    const parsedWeeks = Number(value.validityWeeks);
    if (!Number.isInteger(parsedWeeks) || parsedWeeks !== 4) {
      return "La duración/validez del servicio debe ser de 4 semanas solo.";
    }
    validityWeeks = 4;
  }

  let recommendedWeeklyFrequency: number | null = null;
  if (value.recommendedWeeklyFrequency != null && value.recommendedWeeklyFrequency !== "") {
    const parsedFreq = Number(value.recommendedWeeklyFrequency);
    if (!Number.isInteger(parsedFreq) || parsedFreq < 1 || parsedFreq > 14) {
      return "La frecuencia semanal recomendada debe ser un número entero entre 1 y 14.";
    }
    recommendedWeeklyFrequency = parsedFreq;
  }

  const rawConditions = typeof value.conditions === "string" ? value.conditions.trim() : "";
  if (rawConditions.length > 5000) {
    return "Las condiciones deben tener como máximo 5000 caracteres.";
  }
  const conditions = rawConditions || null;

  const isActive = typeof value.isActive === "boolean"
    ? value.isActive
    : value.isActive === "true" || value.isActive === 1 || value.isActive === undefined || value.isActive === null;

  return {
    name,
    durationMin,
    price,
    modality,
    type,
    trainingCount,
    validityWeeks,
    recommendedWeeklyFrequency,
    conditions,
    isActive,
    description: description || null,
  };
}

export function parseServicePackageInput(
  value: unknown,
):
  | {
      serviceId: string;
      sessionsBought: number;
      totalAmount: number;
      paymentMethod: PaymentMethod;
      paymentStatus: PaymentStatus;
      notes?: string;
    }
  | string {
  if (!isRecord(value)) {
    return "El formulario del bono no tiene un formato válido.";
  }

  const serviceId = typeof value.serviceId === "string" ? value.serviceId : "";
  const sessionsBought = typeof value.sessionsBought === "number" ? value.sessionsBought : Number(value.sessionsBought);
  const totalAmount = typeof value.totalAmount === "number" ? value.totalAmount : Number(value.totalAmount);
  const paymentMethod = typeof value.paymentMethod === "string" ? value.paymentMethod : "";
  const paymentStatus = typeof value.paymentStatus === "string" ? value.paymentStatus : "";
  const notes = typeof value.notes === "string" ? value.notes.trim() : "";

  if (!isUuid(serviceId)) return "Selecciona un servicio válido.";
  if (!Number.isInteger(sessionsBought) || sessionsBought < 1 || sessionsBought > 500) {
    return "Las sesiones deben estar entre 1 y 500.";
  }
  if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 9999999999.99) {
    return "Introduce un importe válido.";
  }
  if (!validPaymentMethods.includes(paymentMethod as PaymentMethod)) {
    return "Selecciona una forma de pago válida.";
  }
  if (!validPaymentStatuses.includes(paymentStatus as PaymentStatus)) {
    return "Selecciona un estado de pago válido.";
  }
  if (notes.length > 1000) return "Las notas deben tener como máximo 1000 caracteres.";

  return {
    serviceId,
    sessionsBought,
    totalAmount,
    paymentMethod: paymentMethod as PaymentMethod,
    paymentStatus: paymentStatus as PaymentStatus,
    ...(notes ? { notes } : {}),
  };
}
