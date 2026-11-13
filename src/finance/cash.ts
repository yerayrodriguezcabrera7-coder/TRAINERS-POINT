import { Prisma, PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { z } from 'zod';
import type { Identity } from '../calendar/access';
import { ApiError } from '../calendar/model';
import { cents } from './money';
import { financeTransaction } from './transaction';
import { recordAudit } from '../audit/log';
const amount = z.number().min(0).max(1000000000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6);
const openInput = z.object({ requestKey: z.string().uuid(), openingAmount: amount });
const movementInput = z.object({ requestKey: z.string().uuid(), direction: z.enum(['IN', 'OUT']), category: z.enum(['CHANGE', 'WITHDRAWAL', 'OTHER']), amount: amount.refine(v => v > 0), reason: z.string().trim().min(3).max(1000) });
const closeInput = z.object({ requestKey: z.string().uuid(), countedAmount: amount, revision: z.number().int().positive(), note: z.string().trim().max(2000).default('') });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => DateTime.fromISO(v).isValid);
export function cashPermission(actor: Identity | undefined) {
  if (!actor)
    throw new ApiError(401, 'Inicia sesión.');
  if (!['ADMIN', 'RECEPTION'].includes(actor.role))
    throw new ApiError(403, 'Solo administración y recepción pueden gestionar la caja.');
}
// All callers hold the same per-centre advisory lock as inventory operations.
// Link once when recording the operation: later dates or returns cannot rewrite a closed drawer.
export async function cashSessionFor(tx: Prisma.TransactionClient, gym: string, occurredAt = new Date()) {
  const session = await tx.cashSession.findFirst({ where: { gymKey: gym, closedAt: null } });
  if (!session || Math.floor(occurredAt.getTime() / 60000) < Math.floor(session.openedAt.getTime() / 60000))
    return null;
  await tx.cashSession.update({ where: { id: session.id }, data: { revision: { increment: 1 } } });
  return session.id;
}
export class CashRegister {
  constructor(private db: PrismaClient) { }
  private transaction<T>(gym: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return financeTransaction(this.db, gym, fn);
  }
  private async summary(tx: Prisma.TransactionClient, session: any) {
    if (session.closedAt)
      return session.summary;
    const [sales, payments, movements] = await Promise.all([
      tx.sale.findMany({ where: { gymKey: session.gymKey, OR: [{ cashSessionId: session.id }, { updatedAt: { gte: session.openedAt } }] }, include: { lines: true, client: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } }),
      tx.payment.findMany({ where: { cashSessionId: session.id, status: 'PAGADO' }, include: { sale: { select: { id: true, cashSessionId: true, client: { select: { firstName: true, lastName: true } } } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.cashMovement.findMany({ where: { sessionId: session.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ]);
    const byMethod: Record<string, number> = { EFECTIVO: 0, TARJETA: 0, BIZUM: 0, TRANSFERENCIA: 0, OTRO: 0 };
    const debtByMethod = { ...byMethod }, refundsByMethod = { ...byMethod };
    for (const payment of payments) {
      const target = payment.kind === 'REFUND' ? refundsByMethod : byMethod;
      target[payment.method] += cents(payment.amount);
      if (payment.kind !== 'REFUND' && payment.sale.cashSessionId !== session.id)
        debtByMethod[payment.method] += cents(payment.amount);
    }
    const cashIn = movements.filter(m => m.direction === 'IN').reduce((s, m) => s + cents(m.amount), 0);
    const cashOut = movements.filter(m => m.direction === 'OUT').reduce((s, m) => s + cents(m.amount), 0);
    const currentSales = sales.filter(s => s.cashSessionId === session.id);
    const returns = sales.flatMap(s => (Array.isArray(s.returnHistory) ? s.returnHistory : []).flatMap((r: any) => r?.cashSessionId === session.id ? [{ saleId: s.id, at: r.at, reason: r.reason, actor: r.actor, amount: (r.lines || []).reduce((sum: number, l: any) => sum + cents(s.lines.find(row => row.id === l.lineId)?.unitPrice || 0) * Number(l.quantity), 0) / 100 }] : []));
    const sold = currentSales.reduce((s, sale) => s + cents(sale.totalAmount), 0);
    const returned = returns.reduce((s, r) => s + cents(r.amount), 0);
    const euros = (values: Record<string, number>) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v / 100]));
    return {
      soldTotal: sold / 100, returnsTotal: returned / 100, netSales: (sold - returned) / 100,
      collections: euros(byMethod), debtCollections: euros(debtByMethod), refunds: euros(refundsByMethod),
      cashIn: cashIn / 100, cashOut: cashOut / 100,
      expectedCash: (cents(session.openingAmount) + byMethod.EFECTIVO + cashIn - refundsByMethod.EFECTIVO - cashOut) / 100,
      sales: currentSales.map(s => ({ id: s.id, at: s.soldAt || s.createdAt, client: s.client ? `${s.client.firstName} ${s.client.lastName}` : 'Persona de paso', amount: Number(s.totalAmount), status: s.status, products: s.lines.map(l => ({ name: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })) })),
      payments: payments.map(p => ({ id: p.id, saleId: p.saleId, at: p.paidAt || p.createdAt, registeredAt: p.createdAt, method: p.method, kind: p.kind, amount: Number(p.amount), previousDebt: p.kind !== 'REFUND' && p.sale.cashSessionId !== session.id, client: p.sale.client ? `${p.sale.client.firstName} ${p.sale.client.lastName}` : 'Persona de paso', actorId: p.actorAccountId, note: p.note })),
      returns, movements,
    };
  }
  async current(gym: string) {
    return this.transaction(gym, async (tx) => {
      const session = await tx.cashSession.findFirst({ where: { gymKey: gym, closedAt: null } });
      const since = DateTime.now().setZone('Europe/Madrid').startOf('day').toJSDate();
      const unassignedPayments = await tx.payment.count({ where: { sale: { gymKey: gym }, cashSessionId: null, historicalVerification: false, status: 'PAGADO', createdAt: { gte: since } } });
      return { session: session ? { ...session, summary: await this.summary(tx, session) } : null, unassignedPayments };
    });
  }
  async open(gym: string, actor: Identity, raw: unknown) {
    const v = openInput.parse(raw);
    return this.transaction(gym, async (tx) => {
      const old = await tx.cashSession.findUnique({ where: { requestKey: v.requestKey } });
      if (old) {
        if (old.gymKey !== gym || cents(old.openingAmount) !== cents(v.openingAmount))
          throw new ApiError(409, 'Identificador de apertura ya utilizado.');
        return { ...old, summary: await this.summary(tx, old) };
      }
      if (await tx.cashSession.findFirst({ where: { gymKey: gym, closedAt: null } }))
        throw new ApiError(409, 'Ya hay una caja abierta en este centro.');
      const session = await tx.cashSession.create({ data: { gymKey: gym, requestKey: v.requestKey, businessDate: DateTime.now().setZone('Europe/Madrid').toISODate()!, openingAmount: v.openingAmount, openedBy: actor.id, openedByName: actor.name } });
      await recordAudit(tx, { gymKey: gym, actor, action: 'CASH_OPENED', entityType: 'CashSession', entityId: session.id, requestKey: v.requestKey, detail: `Caja abierta con ${v.openingAmount.toFixed(2)} € de efectivo inicial.` });
      return { ...session, summary: await this.summary(tx, session) };
    });
  }
  async movement(gym: string, actor: Identity, id: string, raw: unknown) {
    const v = movementInput.parse(raw);
    if ((v.category === 'CHANGE' && v.direction !== 'IN') || (v.category === 'WITHDRAWAL' && v.direction !== 'OUT'))
      throw new ApiError(400, 'El tipo de movimiento no coincide con la entrada o salida.');
    return this.transaction(gym, async (tx) => {
      const session = await tx.cashSession.findFirst({ where: { id, gymKey: gym } });
      if (!session)
        throw new ApiError(404, 'Caja desconocida.');
      const old = await tx.cashMovement.findUnique({ where: { requestKey: v.requestKey } });
      if (old) {
        if (old.sessionId !== id || old.direction !== v.direction || old.category !== v.category || cents(old.amount) !== cents(v.amount) || old.reason !== v.reason)
          throw new ApiError(409, 'Identificador de movimiento ya utilizado.');
        return old;
      }
      if (session.closedAt)
        throw new ApiError(409, 'La caja ya está cerrada.');
      const movement = await tx.cashMovement.create({ data: { ...v, sessionId: id, actorId: actor.id, actorName: actor.name } });
      await tx.cashSession.update({ where: { id }, data: { revision: { increment: 1 } } });
      await recordAudit(tx, { gymKey: gym, actor, action: 'CASH_MOVEMENT', entityType: 'CashMovement', entityId: movement.id, requestKey: v.requestKey, detail: `${v.direction === 'IN' ? 'Entrada' : 'Salida'} de ${v.amount.toFixed(2)} €. ${v.reason}`, metadata: { direction: v.direction, category: v.category, amount: v.amount, sessionId: id } });
      return movement;
    });
  }
  async close(gym: string, actor: Identity, id: string, raw: unknown) {
    const v = closeInput.parse(raw);
    return this.transaction(gym, async (tx) => {
      const session = await tx.cashSession.findFirst({ where: { id, gymKey: gym } });
      if (!session)
        throw new ApiError(404, 'Caja desconocida.');
      if (session.closedAt) {
        if (session.closeRequestKey === v.requestKey && cents(session.countedAmount) === cents(v.countedAmount) && session.closingNote === v.note)
          return session;
        throw new ApiError(409, 'La caja ya está cerrada.');
      }
      if (session.revision !== v.revision)
        throw new ApiError(409, 'Hay operaciones nuevas desde el recuento. Actualiza el importe esperado y revisa el efectivo antes de cerrar.');
      const summary = await this.summary(tx, session);
      const closed = await tx.cashSession.update({ where: { id }, data: { closedAt: new Date(), closedBy: actor.id, closedByName: actor.name, countedAmount: v.countedAmount, expectedAmount: summary.expectedCash, difference: (cents(v.countedAmount) - cents(summary.expectedCash)) / 100, closingNote: v.note, closeRequestKey: v.requestKey, revision: { increment: 1 }, summary: JSON.parse(JSON.stringify(summary)) } });
      await recordAudit(tx, { gymKey: gym, actor, action: 'CASH_CLOSED', entityType: 'CashSession', entityId: id, requestKey: v.requestKey, detail: `Caja cerrada: esperado ${summary.expectedCash.toFixed(2)} €, contado ${v.countedAmount.toFixed(2)} €, diferencia ${Number(closed.difference).toFixed(2)} €.`, metadata: { expected: summary.expectedCash, counted: v.countedAmount, difference: Number(closed.difference), note: v.note } });
      return closed;
    });
  }
  async detail(gym: string, id: string) {
    return this.transaction(gym, async (tx) => {
      const session = await tx.cashSession.findFirst({ where: { id, gymKey: gym } });
      if (!session)
        throw new ApiError(404, 'Caja desconocida.');
      return { ...session, summary: await this.summary(tx, session) };
    });
  }
  async history(gym: string, q: URLSearchParams) {
    const v = z.object({ from: date.optional(), to: date.optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).parse(Object.fromEntries(q));
    if (v.from && v.to && v.from > v.to)
      throw new ApiError(400, 'Rango de fechas inválido.');
    const rows = await this.db.cashSession.findMany({ where: { gymKey: gym, ...(v.from || v.to ? { businessDate: { ...(v.from ? { gte: v.from } : {}), ...(v.to ? { lte: v.to } : {}) } } : {}) }, orderBy: [{ openedAt: 'desc' }, { id: 'desc' }], skip: (v.page - 1) * 30, take: 31 });
    return {
      sessions: rows.slice(0, 30).map(({ summary, ...row }) => {
        const totals = (summary as any)?.collections;
        return { ...row, collectedAmount: totals ? Object.values(totals).reduce((sum: number, value) => sum + cents(value), 0) / 100 : null };
      }), page: v.page, hasNext: rows.length > 30
    };
  }
}
