import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiContext } from '../http/api-context';
import { readJsonBody, sendJson } from '../http/json';
import { prisma } from '../lib/prisma';
import { ApiError } from '../calendar/model';
import { planAccess, planDate, routineOnDate, savePlan } from '../training/plans';
import { z } from 'zod';
export async function trainingPlansRoutes(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiContext): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/clients\/([^/]+)\/training-plans$/);
  if (!match) return false;
  const clientId = z.string().uuid().parse(match[1]);
  const actor = (request as any).identity;
  const gym = (request as any).selectedGym || context.currentConfiguredGym;
  if (!['GET','POST'].includes(request.method || '')) throw new ApiError(405, 'Operación no permitida.');
  await planAccess(prisma, context.calendarPool, gym, clientId, actor, request.method === 'POST');
  if (request.method === 'POST') {
    if (!context.hasTrustedOrigin(request, context.port)) throw new ApiError(403, 'Origen no permitido.');
    sendJson(response, 200, {plan: await savePlan(prisma, gym, clientId, actor, await readJsonBody(request))});
  } else {
    const date = url.searchParams.get('date');
    if (date) planDate.parse(date);
    const plans = await prisma.trainingPlan.findMany({where:{clientId},orderBy:{updatedAt:'desc'}});
    const active = plans.find(p => p.status === 'ACTIVO') || null;
    sendJson(response,200,{plans,active,canEdit:['ADMIN','TRAINER'].includes(actor.role),date,days:date ? routineOnDate(active,date) : []});
  }
  return true;
}
