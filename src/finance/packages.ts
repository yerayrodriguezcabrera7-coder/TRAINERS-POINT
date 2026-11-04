import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../calendar/model';
import { cashSessionFor } from './cash';
import { financeTransaction } from './transaction';
const input = z.object({ requestKey: z.string().uuid().optional(), serviceId: z.string().uuid(), sessionsBought: z.number().int().min(1).max(500), totalAmount: z.number().nonnegative().max(1000000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6), paymentMethod: z.enum(['EFECTIVO', 'TARJETA', 'BIZUM', 'TRANSFERENCIA', 'OTRO']), paymentStatus: z.enum(['PAGADO', 'PENDIENTE']), notes: z.string().max(2000).optional() });
export class Packages {
  constructor(private db: PrismaClient) { }
  private transaction<T>(gym: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) { return financeTransaction(this.db, gym, fn); }
  private async link(tx: Prisma.TransactionClient, gym: string, pkg: any, actor: string, historical = false, fingerprint?: string) {
    if (pkg.saleId)
      return pkg;
    if (historical && pkg.paymentStatus === 'PAGADO')
      throw new ApiError(409, 'Este bono ya consta como pagado; no se generará un segundo cobro.');
    const cashSessionId = historical ? null : await cashSessionFor(tx, gym);
    const service = await tx.service.findUniqueOrThrow({ where: { id: pkg.serviceId } });
    const sale = await tx.sale.create({
      data: {
        requestFingerprint: fingerprint, gymKey: gym, paymentTracking: true, clientId: pkg.clientId, sellerAccountId: actor, cashSessionId, status: 'COMPLETADA', soldAt: pkg.purchasedAt, subtotal: pkg.totalAmount, taxAmount: 0, totalAmount: pkg.totalAmount,
        lines: { create: { type: 'SERVICIO', serviceId: service.id, description: `Bono · ${service.name} · ${pkg.sessionsBought} sesiones`, quantity: 1, unitPrice: pkg.totalAmount, taxRate: 0, lineSubtotal: pkg.totalAmount, taxAmount: 0, lineTotal: pkg.totalAmount } },
        ...(!historical && pkg.paymentStatus === 'PAGADO' && Number(pkg.totalAmount) > 0 ? { payments: { create: { requestKey: randomUUID(), actorAccountId: actor, method: pkg.paymentMethod, status: 'PAGADO', amount: pkg.totalAmount, paidAt: new Date(), cashSessionId } } } : {})
      }
    });
    return tx.clientServicePackage.update({ where: { id: pkg.id }, data: { saleId: sale.id, paymentStatus: pkg.paymentStatus === 'FALLIDO' ? 'PENDIENTE' : pkg.paymentStatus } });
  }
  async create(gym: string, clientId: string, actor: string, raw: unknown) {
    const v = input.parse(raw);
    const fingerprint = createHash('sha256').update(JSON.stringify({ clientId, ...v })).digest('hex');
    return this.transaction(gym, async (tx) => {
      if (!await tx.client.findFirst({ where: { id: clientId, gymId: gym } }))
        throw new ApiError(404, 'Cliente desconocido en este centro.');
      if (v.requestKey) {
        const old = await tx.clientServicePackage.findUnique({ where: { requestKey: v.requestKey } });
        if (old) {
          const sale = old.saleId ? await tx.sale.findUnique({ where: { id: old.saleId } }) : null;
          if (sale?.requestFingerprint && sale.requestFingerprint !== fingerprint)
            throw new ApiError(409, 'Esta solicitud ya se utilizó con otros datos de cobro.');
          if (old.clientId !== clientId || old.serviceId !== v.serviceId || old.sessionsBought !== v.sessionsBought || Number(old.totalAmount) !== v.totalAmount || old.notes !== (v.notes || null))
            throw new ApiError(409, 'Esta solicitud ya se utilizó para otro bono.');
          return old;
        }
      }
      const service = await tx.service.findUnique({ where: { id: v.serviceId } });
      if (!service?.isActive)
        throw new ApiError(400, 'Selecciona un servicio activo.');
      const status = v.totalAmount === 0 ? 'PAGADO' : v.paymentStatus;
      const pkg = await tx.clientServicePackage.create({ data: { ...v, clientId, paymentStatus: status } });
      return this.link(tx, gym, pkg, actor, false, fingerprint);
    });
  }
  async billing(gym: string, id: string, actor: string) {
    return this.transaction(gym, async (tx) => {
      const pkg = await tx.clientServicePackage.findFirst({ where: { id, client: { gymId: gym } } });
      if (!pkg)
        throw new ApiError(404, 'Bono desconocido en este centro.');
      if (!pkg.saleId && !['PENDIENTE', 'FALLIDO'].includes(pkg.paymentStatus))
        throw new ApiError(409, 'Este bono no tiene un pago pendiente.');
      return this.link(tx, gym, pkg, actor, true);
    });
  }
}
