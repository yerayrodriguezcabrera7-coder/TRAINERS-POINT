import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../calendar/model';
import { cashSessionFor } from './cash';
import { financeTransaction } from './transaction';
import { assertManualPackageAllowed } from '../clients/brand';
import { accessibleClient, clientScope, clientScopeSQL } from '../network/scope';
import { productPricing } from './product-pricing';

const input = z.object({
  requestKey: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  sessionsBought: z.number().int().min(1).max(500),
  totalAmount: z.number().nonnegative().max(1000000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6),
  paymentMethod: z.enum(['EFECTIVO', 'TARJETA', 'BIZUM', 'TRANSFERENCIA', 'OTRO']),
  paymentStatus: z.enum(['PAGADO', 'PENDIENTE']),
  notes: z.string().max(2000).optional(),
  products: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(1000)
  })).optional()
});

export class Packages {
  constructor(private db: PrismaClient) { }
  private transaction<T>(gym: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) { return financeTransaction(this.db, gym, fn); }

  private async link(
    tx: Prisma.TransactionClient,
    gym: string,
    pkg: any,
    actor: string,
    historical = false,
    fingerprint?: string,
    productsToAdd?: Array<{ productId: string; quantity: number }>
  ) {
    if (pkg.saleId)
      return pkg;
    if (historical && pkg.paymentStatus === 'PAGADO')
      throw new ApiError(409, 'Este bono ya consta como pagado; no se generará un segundo cobro.');
    const cashSessionId = historical ? null : await cashSessionFor(tx, gym);
    const service = await tx.service.findUniqueOrThrow({ where: { id: pkg.serviceId } });

    const lines: Prisma.SaleLineCreateWithoutSaleInput[] = [
      {
        type: 'SERVICIO',
        service: { connect: { id: service.id } },
        description: `Bono · ${service.name} · ${pkg.sessionsBought} sesiones`,
        quantity: 1,
        unitPrice: pkg.totalAmount,
        taxRate: 0,
        lineSubtotal: pkg.totalAmount,
        taxAmount: 0,
        lineTotal: pkg.totalAmount
      }
    ];

    let productsSubtotalCents = 0;
    let productsTaxCents = 0;
    let productsTotalCents = 0;

    if (productsToAdd && productsToAdd.length > 0) {
      const pIds = productsToAdd.map(p => p.productId);
      const available = await tx.product.findMany({ where: { id: { in: pIds }, gymKey: gym, isActive: true } });
      const pMap = new Map(available.map(p => [p.id, p]));

      for (const item of productsToAdd) {
        const prod = pMap.get(item.productId);
        if (!prod || prod.stock < item.quantity) {
          throw new ApiError(409, `Producto "${prod?.name || 'desconocido'}" no disponible o sin stock suficiente.`);
        }
        const centsUnitPrice = Math.round(Number(prod.unitPrice) * 100);
        const amountCents = centsUnitPrice * item.quantity;
        productsTotalCents += amountCents;
        const pricing = productPricing(amountCents / 100, 0, prod.taxRate);
        const lineTaxCents = Math.round(pricing.taxAmount * 100);
        productsTaxCents += lineTaxCents;
        productsSubtotalCents += (amountCents - lineTaxCents);

        lines.push({
          type: 'PRODUCTO',
          product: { connect: { id: prod.id } },
          description: prod.name,
          quantity: item.quantity,
          unitPrice: prod.unitPrice,
          taxRate: prod.taxRate,
          lineSubtotal: pricing.baseAmount,
          taxAmount: pricing.taxAmount,
          lineTotal: amountCents / 100
        });

        await tx.product.update({
          where: { id: prod.id },
          data: { stock: { decrement: item.quantity }, revision: { increment: 1 } }
        });
      }
    }

    const bonoTotalCents = Math.round(Number(pkg.totalAmount) * 100);
    const combinedTotal = (bonoTotalCents + productsTotalCents) / 100;
    const combinedSubtotal = (bonoTotalCents + productsSubtotalCents) / 100;
    const combinedTax = productsTaxCents / 100;

    const sale = await tx.sale.create({
      data: {
        requestFingerprint: fingerprint,
        gymKey: gym,
        paymentTracking: true,
        clientId: pkg.clientId,
        sellerAccountId: actor,
        cashSessionId,
        status: 'COMPLETADA',
        soldAt: pkg.purchasedAt,
        subtotal: combinedSubtotal,
        taxAmount: combinedTax,
        totalAmount: combinedTotal,
        lines: { create: lines },
        ...(!historical && pkg.paymentStatus === 'PAGADO' && combinedTotal > 0 ? {
          payments: {
            create: {
              requestKey: randomUUID(),
              actorAccountId: actor,
              method: pkg.paymentMethod,
              status: 'PAGADO',
              amount: combinedTotal,
              paidAt: new Date(),
              cashSessionId
            }
          }
        } : {})
      }
    });

    if (productsToAdd && productsToAdd.length > 0) {
      await tx.stockMovement.createMany({
        data: productsToAdd.map(item => ({
          productId: item.productId,
          type: 'VENTA' as const,
          quantity: -item.quantity,
          reference: sale.id
        }))
      });
    }

    return tx.clientServicePackage.update({
      where: { id: pkg.id },
      data: {
        saleId: sale.id,
        paymentStatus: pkg.paymentStatus === 'FALLIDO' ? 'PENDIENTE' : pkg.paymentStatus
      }
    });
  }

  async create(gym: string, clientId: string, actor: string, raw: unknown) {
    const v = input.parse(raw);
    const fingerprint = createHash('sha256').update(JSON.stringify({ clientId, ...v })).digest('hex');
    return this.transaction(gym, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Client" WHERE id=${clientId}::uuid FOR UPDATE`;
      const client = await accessibleClient(tx,gym,clientId);
      if (!client)
        throw new ApiError(404, 'Cliente desconocido en este centro.');
      assertManualPackageAllowed(client);
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
      const { products: productsToAdd, ...pkgData } = v;
      const pkg = await tx.clientServicePackage.create({ data: { ...pkgData, clientId, paymentStatus: status } });
      return this.link(tx, gym, pkg, actor, false, fingerprint, productsToAdd);
    });
  }
  async billing(gym: string, id: string, actor: string) {
    return this.transaction(gym, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ClientServicePackage" WHERE id=${id}::uuid FOR UPDATE`;
      const pkg = await tx.clientServicePackage.findFirst({ where: { id, client: await clientScope(tx,gym) } });
      if (!pkg)
        throw new ApiError(404, 'Bono desconocido en este centro.');
      if (!pkg.saleId && !['PENDIENTE', 'FALLIDO'].includes(pkg.paymentStatus))
        throw new ApiError(409, 'Este bono no tiene un pago pendiente.');
      return this.link(tx, gym, pkg, actor, true);
    });
  }
}

export type ClientPackageAlert = {
  packageId: string;
  serviceName: string;
  sessionsRemaining: number;
  daysRemaining: number;
  expiresAt: string;
  type: 'LAST_SESSION' | 'EXPIRING_SOON' | 'EXPIRED' | 'DEPLETED';
  message: string;
  needsRenewal: boolean;
};

export async function clientPackageAlerts(
  db: PrismaClient,
  gym: string
): Promise<Record<string, ClientPackageAlert>> {
  const clientGymId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gym) ? gym : null;

  const rows = await db.$queryRaw<Array<{
    packageId: string;
    clientId: string;
    serviceName: string;
    sessionsBought: number;
    sessionsUsed: bigint | number;
    purchasedAt: Date;
    validityWeeks: number | null;
  }>>`
    SELECT
      p.id AS "packageId",
      p."clientId",
      s.name AS "serviceName",
      p."sessionsBought",
      p."purchasedAt",
      COALESCE(s."validityWeeks", 4) AS "validityWeeks",
      COUNT(b.id) FILTER (WHERE b.attendance IN ('ASISTIO', 'PENDIENTE') AND b.status <> 'CANCELADA') AS "sessionsUsed"
    FROM "ClientServicePackage" p
    JOIN "Client" c ON c.id = p."clientId"
    JOIN "Service" s ON s.id = p."serviceId"
    LEFT JOIN "Booking" b ON b."packageId" = p.id
    WHERE ${clientScopeSQL(clientGymId)}
      AND p."paymentStatus" IN ('PAGADO', 'PENDIENTE')
    GROUP BY p.id, p."clientId", s.name, p."sessionsBought", p."purchasedAt", s."validityWeeks"
    ORDER BY p."purchasedAt" DESC
  `.catch(() => []);

  const byClient = new Map<string, Array<{
    packageId: string;
    serviceName: string;
    sessionsRemaining: number;
    daysRemaining: number;
    expiresAt: Date;
  }>>();

  const now = Date.now();
  for (const row of rows) {
    const remaining = Math.max(0, row.sessionsBought - Number(row.sessionsUsed));
    const validityWeeks = Number(row.validityWeeks) || 4;
    const expiresAt = new Date(new Date(row.purchasedAt).getTime() + validityWeeks * 7 * 86400000);
    const daysRemaining = Math.ceil((expiresAt.getTime() - now) / 86400000);

    if (!byClient.has(row.clientId)) byClient.set(row.clientId, []);
    byClient.get(row.clientId)!.push({
      packageId: row.packageId,
      serviceName: row.serviceName,
      sessionsRemaining: remaining,
      daysRemaining,
      expiresAt,
    });
  }

  const result: Record<string, ClientPackageAlert> = {};

  for (const [clientId, pkgs] of byClient.entries()) {
    const hasHealthy = pkgs.some(p => p.sessionsRemaining > 1 && p.daysRemaining > 7);
    if (hasHealthy) continue;

    const activeExpiring = pkgs.find(p => p.sessionsRemaining > 0 && (p.sessionsRemaining === 1 || p.daysRemaining <= 7));
    const target = activeExpiring || pkgs.find(p => p.sessionsRemaining > 0) || pkgs[0];

    if (!target) continue;

    let type: ClientPackageAlert['type'];
    let message: string;

    if (target.sessionsRemaining === 1) {
      type = 'LAST_SESSION';
      message = target.daysRemaining <= 7 && target.daysRemaining >= 0
        ? `Última sesión (caduca en ${target.daysRemaining}d)`
        : 'Última sesión disponible';
    } else if (target.sessionsRemaining > 0 && target.daysRemaining <= 7 && target.daysRemaining >= 0) {
      type = 'EXPIRING_SOON';
      message = `Caduca en ${target.daysRemaining} día${target.daysRemaining === 1 ? '' : 's'} (${target.sessionsRemaining} ses.)`;
    } else if (target.sessionsRemaining > 0 && target.daysRemaining < 0) {
      type = 'EXPIRED';
      message = `Bono caducado (${target.sessionsRemaining} ses.)`;
    } else if (target.sessionsRemaining === 0) {
      type = 'DEPLETED';
      message = 'Bono agotado';
    } else {
      continue;
    }

    result[clientId] = {
      packageId: target.packageId,
      serviceName: target.serviceName,
      sessionsRemaining: target.sessionsRemaining,
      daysRemaining: target.daysRemaining,
      expiresAt: target.expiresAt.toISOString(),
      type,
      message,
      needsRenewal: true,
    };
  }

  return result;
}
