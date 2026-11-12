import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { Identity } from '../calendar/access';
import { ApiError } from '../calendar/model';
import { accessibleClient, clientScopeSQL } from '../network/scope';

export const planDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Fecha no válida');
const shortText = z.string().trim().max(200);
export const planInput = z.object({
  id: z.string().uuid(), updatedAt: z.string().datetime().optional(),
  name: shortText.min(1), goals: z.string().trim().max(2000),
  startsAt: planDate, endsAt: planDate.nullable(),
  status: z.enum(['BORRADOR', 'ACTIVO', 'COMPLETADO', 'ARCHIVADO']),
  days: z.array(z.object({
    name: shortText.min(1), weekday: z.number().int().min(1).max(7),
    exercises: z.array(z.object({
      name: shortText.min(1), sets: z.number().int().min(1).max(100),
      repetitions: shortText.min(1), rest: shortText, load: shortText,
      notes: z.string().trim().max(2000),
    }).strict()).min(1).max(50),
  }).strict()).min(1).max(14),
}).strict().refine(v => !v.endsAt || v.endsAt >= v.startsAt, 'El fin no puede ser anterior al inicio');

export async function planAccess(db: PrismaClient, pool: Pool | undefined, gym: string, clientId: string, actor: Identity, write: boolean) {
  if (!actor || !['ADMIN', 'RECEPTION', 'TRAINER'].includes(actor.role) || (write && actor.role === 'RECEPTION'))
    throw new ApiError(403, 'Solo administración y el entrenador pueden editar rutinas.');
  const client = await accessibleClient(db,gym,clientId);
  if (!client) throw new ApiError(404, 'Cliente desconocido en este centro.');
  if (actor.role === 'TRAINER') {
    if (!actor.employeeId) throw new ApiError(403, 'No tienes un trabajador asignado.');
    if (client.assignedWorkerId !== actor.employeeId) {
      const assigned = pool && (await pool.query("SELECT 1 FROM calendar.bookings WHERE $1::text IS NOT NULL AND data->>'employeeId'=$2 AND data->>'clientId'=$3 AND data->>'status' <> 'CANCELLED' LIMIT 1", [gym, actor.employeeId, clientId])).rowCount;
      if (!assigned) throw new ApiError(403, 'Solo puedes consultar y planificar tus propios clientes.');
    }
  }
}

export function routineOnDate(plan: any, date: string) {
  planDate.parse(date);
  if (!plan || plan.status !== 'ACTIVO' || (plan.startsAt && new Date(plan.startsAt).toISOString().slice(0,10) > date) || (plan.endsAt && new Date(plan.endsAt).toISOString().slice(0,10) < date)) return [];
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay() || 7;
  return Array.isArray(plan.details?.days) ? plan.details.days.filter((day: any) => day.weekday === weekday) : [];
}

export async function savePlan(db: PrismaClient, gym: string, clientId: string, actor: Identity, raw: unknown) {
  const input = planInput.parse(raw);
  return db.$transaction(async tx => {
    // Serialize activation and edits for this client, without changing bookings or payments.
    const locked = await tx.$queryRaw<any[]>`SELECT c.id FROM "Client" c WHERE c.id=${clientId}::uuid AND ${clientScopeSQL(gym)} FOR UPDATE`;
    if (!locked.length) throw new ApiError(404, 'Cliente desconocido.');
    const old = await tx.trainingPlan.findUnique({where:{id: input.id}});
    if (old && old.clientId !== clientId) throw new ApiError(404, 'Plan desconocido.');
    if (old && (!input.updatedAt || old.updatedAt.toISOString() !== input.updatedAt)) throw new ApiError(409, 'El plan ha cambiado. Recarga las rutinas antes de editarlo de nuevo.');
    if (!old && input.updatedAt) throw new ApiError(409, 'Este plan ya no está disponible. Recarga las rutinas.');
    if (input.status === 'ACTIVO') await tx.trainingPlan.updateMany({where:{clientId,status:'ACTIVO',id:{not:input.id}},data:{status:'ARCHIVADO'}});
    const user = await tx.user.findFirst({where:{id: z.string().uuid().safeParse(actor.id).success ? actor.id : '00000000-0000-0000-0000-000000000000'}});
    const data = {name:input.name,goals:input.goals,status:input.status,startsAt:new Date(input.startsAt),endsAt:input.endsAt ? new Date(input.endsAt) : null,
      details:{version:1,days:input.days,editedBy:{id:actor.id,name:actor.name}},
      updatedAt:new Date(Math.max(Date.now(), (old?.updatedAt.getTime() || 0) + 1))};
    return old ? tx.trainingPlan.update({where:{id:old.id},data}) : tx.trainingPlan.create({data:{...data,id:input.id,clientId,createdById:user?.id || null}});
  });
}
