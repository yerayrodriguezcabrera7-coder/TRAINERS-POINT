import type { Prisma, PrismaClient } from '@prisma/client';
import type { Identity } from '../calendar/access';

type Database = PrismaClient | Prisma.TransactionClient;
type Actor = Pick<Identity, 'id'> & Partial<Pick<Identity, 'name' | 'role' | 'username'>> | string | undefined;

function actorMetadata(actor: Actor) {
  if (!actor) return { actorId: 'system', actorName: 'Sistema', actorRole: 'SYSTEM' };
  if (typeof actor === 'string') return { actorId: actor, actorName: actor === 'system' ? 'Sistema' : actor, actorRole: 'SYSTEM' };
  return { actorId: actor.id, actorName: actor.name || actor.username || actor.id, actorRole: actor.role || 'STAFF', username: actor.username || null };
}

export async function recordAudit(db: Database, input: {
  gymKey: string;
  actor?: Actor;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail: string;
  requestKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (input.requestKey) {
    const previous = await db.auditLog.findFirst({ where: { action: input.action, entityId: input.entityId || null, metadata: { path: ['requestKey'], equals: input.requestKey } } });
    if (previous) return previous;
  }
  return db.auditLog.create({ data: {
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId || null,
    metadata: { gymKey: input.gymKey, ...actorMetadata(input.actor), detail: input.detail, requestKey: input.requestKey || null, ...(input.metadata || {}) } as Prisma.InputJsonValue,
  } });
}
