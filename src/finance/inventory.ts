import { Prisma, PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Identity } from '../calendar/access';
import { ApiError } from '../calendar/model';
import { cashSessionFor } from './cash';
import { clientDebts } from './debts';
import { cents } from './money';
import { financeTransaction } from './transaction';
import { productPricing } from './product-pricing';
import { validProductImage } from '../validation/product-image';
import { accessibleClient, saleScope } from '../network/scope';
const productMoney = z.number().min(0).max(1000000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6);
const productInput = z.object({ name: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).default(''), price: productMoney,
  costPrice: productMoney.optional(), taxRate: z.number().min(0).max(100).refine(v => Math.abs(v*100-Math.round(v*100))<1e-6).optional(),
  barcode: z.string().trim().max(80).regex(/^[\p{L}\p{N} ._/-]*$/u).transform(v => v || null).nullable().optional(),
  imageData: z.string().refine(validProductImage,'Selecciona una imagen PNG, JPEG o WebP válida de hasta 550 KB.').nullable().optional(),
  trackStock: z.boolean().optional(), stock: z.number().int().min(0).max(1000000), revision: z.number().int().positive().optional() });
const paymentMethod = z.enum(['EFECTIVO', 'TARJETA', 'BIZUM']);
const money = z.number().positive().max(1000000000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6);
const paymentInput = z.object({ requestKey: z.string().uuid(), amount: money, method: paymentMethod, paidAt: z.string().datetime().refine(v => new Date(v).getTime() <= Date.now(), 'La fecha del pago no puede ser futura.').optional(), note: z.string().trim().max(1000).default('') });
const saleInput = z.object({ paymentMode: z.enum(['PAID', 'PENDING']).default('PAID'), paymentMethod: paymentMethod.default('EFECTIVO'), requestKey: z.string().uuid(), clientId: z.string().uuid().nullable(), lines: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(10000), expectedUnitPrice: z.number().nonnegative().max(1000000).optional() })).min(1).max(100) });
const returnInput = z.object({ reason: z.string().trim().min(3).max(500).default('Devolución de producto'), requestKey: z.string().uuid(), lines: z.array(z.object({ restock: z.boolean().default(true), lineId: z.string().uuid(), quantity: z.number().int().min(1).max(10000) })).min(1).max(100) });
const restockStatusEnum = z.enum(['PENDIENTE', 'PEDIDO', 'RECIBIDO', 'CANCELADO']);
const restockInput = z.object({ productId: z.string().uuid().nullable().optional(), productName: z.string().trim().min(1).max(200).optional(), quantity: z.number().int().min(1).max(10000).default(1), notes: z.string().trim().max(1000).default('') });
const restockUpdateInput = z.object({ status: restockStatusEnum.optional(), quantity: z.number().int().min(1).max(10000).optional(), notes: z.string().trim().max(1000).optional(), addToStock: z.boolean().default(false) });
export function saleBalance(sale: any) {
  const original = cents(sale.totalAmount);
  const returned = sale.lines.reduce((sum: number, l: any) => sum + cents(l.unitPrice) * (l.returnedQuantity || 0), 0);
  const net = sale.status === 'CANCELADA' || sale.status === 'REEMBOLSADA' ? 0 : Math.max(0, original - returned);
  const received = sale.payments.filter((p: any) => p.status === 'PAGADO' && p.kind !== 'REFUND').reduce((sum: number, p: any) => sum + cents(p.amount), 0);
  const refunded = sale.payments.filter((p: any) => p.status === 'PAGADO' && p.kind === 'REFUND').reduce((sum: number, p: any) => sum + cents(p.amount), 0);
  const applied = received - refunded;
  const tracked = sale.paymentTracking || sale.payments.length > 0;
  const outstanding = tracked ? Math.max(0, net - applied) : 0;
  return {
    ...sale, netAmount: net / 100, paidAmount: applied / 100, receivedAmount: received / 100, refundedAmount: refunded / 100, outstandingAmount: outstanding / 100,
    refundDue: tracked ? Math.max(0, applied - net) / 100 : 0,
    paymentStatus: !tracked ? 'SIN_VERIFICAR' : outstanding > 0 ? (applied > 0 ? 'PARCIAL' : 'PENDIENTE') : 'PAGADO'
  };
}
export class Inventory {
  constructor(private db: PrismaClient) { }
  private transaction<T>(gym: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) { return financeTransaction(this.db, gym, fn); }
  async products(gym: string) {
    return (await this.db.product.findMany({ where: { gymKey: gym }, orderBy: { name: 'asc' } })).map(p => ({ ...p, pricing: productPricing(p.unitPrice,p.costPrice,p.taxRate) }));
  }
  async saveProduct(gym: string, raw: unknown, id?: string) {
    const v = productInput.parse(raw);
    return this.transaction(gym, async (tx) => {
      const old = id ? await tx.product.findFirst({ where: { id, gymKey: gym } }) : null;
      if (id && !old)
        throw new ApiError(404, 'Producto desconocido.');
      if (old && v.revision !== old.revision)
        throw new ApiError(409, 'El stock ha cambiado. Actualiza antes de guardar.');
      const details = { name: v.name, description: v.description, unitPrice: v.price, stock: v.stock,
        ...(v.costPrice !== undefined ? { costPrice: v.costPrice } : {}), ...(v.taxRate !== undefined ? { taxRate: v.taxRate } : {}),
        ...(v.barcode !== undefined ? { barcode: v.barcode } : {}), ...(v.imageData !== undefined ? { imageData: v.imageData } : {}),
        ...(v.trackStock !== undefined ? { trackStock: v.trackStock } : {}) };
      if (v.barcode && await tx.product.findFirst({ where: { gymKey: gym, barcode: v.barcode, ...(id ? { id: { not: id } } : {}) } }))
        throw new ApiError(409, 'Ya hay un producto con ese código de barras en este centro.');
      const product = old ? await tx.product.update({ where: { id: old.id }, data: { ...details, revision: { increment: 1 } } }) : await tx.product.create({ data: { gymKey: gym, ...details } });
      const difference = v.stock - (old?.stock || 0);
      if (difference)
        await tx.stockMovement.create({ data: { productId: product.id, type: old ? 'AJUSTE' : 'ENTRADA', quantity: difference, reference: 'Inventario', notes: old ? 'Ajuste manual de existencias' : 'Stock inicial' } });
      return product;
    });
  }
  async removeProduct(gym: string, id: string) {
    return this.transaction(gym, async (tx) => {
      const p = await tx.product.findFirst({ where: { id, gymKey: gym } });
      if (!p)
        throw new ApiError(404, 'Producto desconocido.');
      return tx.product.update({ where: { id }, data: { isActive: false, revision: { increment: 1 } } });
    });
  }
  async sell(gym: string, actor: string, raw: unknown) {
    const v = saleInput.parse(raw);
    if (!v.clientId && v.paymentMode === 'PENDING')
      throw new ApiError(400, 'Las ventas de paso deben pagarse al confirmar.');
    const fingerprint = createHash('sha256').update(JSON.stringify({ ...v, lines: [...v.lines].sort((a, b) => a.productId.localeCompare(b.productId)) })).digest('hex');
    if (new Set(v.lines.map(l => l.productId)).size !== v.lines.length)
      throw new ApiError(400, 'Agrupa las unidades de cada producto en una sola línea.');
    return this.transaction(gym, async (tx) => {
      const existing = await tx.sale.findUnique({ where: { requestKey: v.requestKey }, include: { lines: true, payments: true } });
      if (existing) {
        if ((existing.requestFingerprint && existing.requestFingerprint !== fingerprint) || existing.gymKey !== gym || existing.clientId !== v.clientId || existing.lines.length !== v.lines.length || v.lines.some(l => !existing.lines.some(e => e.productId === l.productId && Number(e.quantity) === l.quantity)))
          throw new ApiError(409, 'Identificador de venta ya utilizado.');
        return saleBalance(existing);
      }
      if (v.clientId && !(await accessibleClient(tx,gym,v.clientId)))
        throw new ApiError(400, 'Selecciona un cliente de este gimnasio.');
      const available = await tx.product.findMany({ where: { id: { in: v.lines.map(line => line.productId) }, gymKey: gym, isActive: true } });
      const products = new Map(available.map(product => [product.id, product]));
      const lines = [];
      let total = 0;
      for (const l of v.lines) {
        const p = products.get(l.productId);
        if (!p || p.stock < l.quantity)
          throw new ApiError(409, 'Producto no disponible o stock insuficiente.');
        if (l.expectedUnitPrice !== undefined && Math.round(l.expectedUnitPrice * 100) !== Math.round(Number(p.unitPrice) * 100))
          throw new ApiError(409, 'El precio de ' + p.name + ' ha cambiado. Actualiza los productos y revisa el total antes de confirmar.');
        const cents = Math.round(Number(p.unitPrice) * 100), amount = cents * l.quantity;
        total += amount;
        const pricing = productPricing(amount / 100,0,p.taxRate);
        lines.push({ type: 'PRODUCTO' as const, productId: p.id, description: p.name, quantity: l.quantity, unitPrice: p.unitPrice, taxRate: p.taxRate, lineSubtotal: pricing.baseAmount, taxAmount: pricing.taxAmount, lineTotal: amount / 100 });
      }
      if (total > 999999999999)
        throw new ApiError(400, 'El importe de la venta supera el máximo permitido.');
      const cashSessionId = await cashSessionFor(tx, gym);
      const taxCents = lines.reduce((sum,line) => sum + Math.round(line.taxAmount*100),0);
      const sale = await tx.sale.create({ data: { cashSessionId, paymentTracking: true, requestFingerprint: fingerprint, gymKey: gym, requestKey: v.requestKey, sellerAccountId: actor, clientId: v.clientId, status: 'COMPLETADA', soldAt: new Date(), subtotal: (total-taxCents) / 100, taxAmount: taxCents / 100, totalAmount: total / 100, lines: { create: lines }, ...(v.paymentMode === 'PAID' && total > 0 ? { payments: { create: { cashSessionId, requestKey: v.requestKey, actorAccountId: actor, method: v.paymentMethod, status: 'PAGADO', amount: total / 100, paidAt: new Date() } } } : {}) }, include: { lines: true, payments: true } });
      for (const l of v.lines)
        await tx.product.update({ where: { id: l.productId }, data: { stock: { decrement: l.quantity }, revision: { increment: 1 } } });
      await tx.stockMovement.createMany({ data: v.lines.map(l => ({ productId: l.productId, type: 'VENTA' as const, quantity: -l.quantity, reference: sale.id })) });
      return saleBalance(sale);
    });
  }
  async reverse(gym: string, id: string, raw: unknown, cancel = false, actor = "system") {
    const requested = cancel ? null : returnInput.parse(raw);
    return this.transaction(gym, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${id}::uuid FOR UPDATE`;
      const sale = await tx.sale.findFirst({ where: { id, gymKey: gym }, include: { lines: true, payments: true } });
      if (!sale)
        throw new ApiError(404, 'Venta desconocida.');
      if ((cancel && sale.status === 'CANCELADA') || (!cancel && sale.returnKeys.includes(requested!.requestKey)))
        return saleBalance(sale);
      if (await tx.booking.findUnique({ where: { saleId: id } }))
        throw new ApiError(409, 'Esta venta corresponde a una sesión. No se puede anular desde las devoluciones de productos.');
      if (await tx.clientServicePackage.findUnique({ where: { saleId: id } }))
        throw new ApiError(409, 'Esta venta corresponde a un bono. No se puede anular desde las devoluciones de productos.');
      if (sale.status !== 'COMPLETADA')
        throw new ApiError(409, 'Esta venta ya está anulada o devuelta.');
      const items = cancel ? sale.lines.filter(l => Number(l.quantity) > l.returnedQuantity).map(l => ({ lineId: l.id, quantity: Number(l.quantity) - l.returnedQuantity })) : requested!.lines;
      if (new Set(items.map(l => l.lineId)).size !== items.length)
        throw new ApiError(400, 'Líneas de devolución duplicadas.');
      for (const item of items) {
        const line = sale.lines.find(l => l.id === item.lineId);
        if (!line?.productId || item.quantity > Number(line.quantity) - line.returnedQuantity)
          throw new ApiError(409, 'La devolución supera las unidades pendientes.');
        await tx.saleLine.update({ where: { id: line.id }, data: { returnedQuantity: { increment: item.quantity } } });
        if (!('restock' in item) || item.restock) {
          await tx.product.update({ where: { id: line.productId }, data: { stock: { increment: item.quantity }, revision: { increment: 1 } } });
          await tx.stockMovement.create({ data: { productId: line.productId, type: 'DEVOLUCION', quantity: item.quantity, reference: sale.id, notes: cancel ? 'Anulación de venta' : requested!.reason } });
        }
      }
      const cashSessionId = await cashSessionFor(tx, gym);
      const lines = await tx.saleLine.findMany({ where: { saleId: id } });
      return saleBalance(await tx.sale.update({ where: { id }, data: { returnHistory: [...(Array.isArray(sale.returnHistory) ? sale.returnHistory : []), { cashSessionId, at: new Date().toISOString(), actor, reason: cancel ? 'Anulación de venta' : requested!.reason, requestKey: requested?.requestKey || null, lines: items }], ...(!cancel ? { returnKeys: { push: requested!.requestKey } } : {}), status: cancel ? 'CANCELADA' : lines.every(l => l.returnedQuantity === Number(l.quantity)) ? 'REEMBOLSADA' : 'COMPLETADA' }, include: { lines: true, payments: true } }));
    });
  }
  private salesFilters(q: URLSearchParams) {
    const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => DateTime.fromISO(v).isValid);
    const filters = z.object({ from: validDate.optional(), to: validDate.optional(), client: z.union([z.literal('walkin'), z.string().uuid()]).optional(), product: z.string().uuid().optional(), method: paymentMethod.optional(), status: z.enum(['COMPLETADA', 'CANCELADA', 'REEMBOLSADA']).optional(), search: z.string().trim().max(120).optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).parse(Object.fromEntries(q));
    if (filters.from && filters.to && filters.from > filters.to)
      throw new ApiError(400, 'La fecha inicial no puede ser posterior a la final.');
    const { from, to, client, product, status, method, search } = filters;
    const where: Prisma.SaleWhereInput = { ...(method ? { payments: { some: { method, status: 'PAGADO', kind: 'COLLECTION' } } } : {}), ...(client ? { clientId: client === 'walkin' ? null : client } : {}), ...(product ? { lines: { some: { productId: product } } } : {}), ...(status ? { status } : {}), ...(search ? { OR: [{ lines: { some: { description: { contains: search, mode: 'insensitive' } } } }, { client: { firstName: { contains: search, mode: 'insensitive' } } }, { client: { lastName: { contains: search, mode: 'insensitive' } } }, ...(z.string().uuid().safeParse(search).success ? [{ id: search }] : [])] } : {}), ...(from || to ? { soldAt: { ...(from ? { gte: DateTime.fromISO(from, { zone: 'Europe/Madrid' }).startOf('day').toJSDate() } : {}), ...(to ? { lt: DateTime.fromISO(to, { zone: 'Europe/Madrid' }).plus({ days: 1 }).startOf('day').toJSDate() } : {}) } } : {}) };
    return { where, page: filters.page };
  }
  async sales(gym: string, q: URLSearchParams) {
    const { where } = this.salesFilters(q);
    return (await this.db.sale.findMany({ where: { ...where, AND: [q.get('client') && q.get('client') !== 'walkin' ? await saleScope(this.db,gym) : {gymKey:gym}] }, include: { client: { select: { firstName: true, lastName: true } }, lines: true, payments: { orderBy: { createdAt: 'asc' } } }, orderBy: [{ soldAt: 'desc' }, { id: 'desc' }], take: 500 })).map(saleBalance);
  }
  async salesPage(gym: string, q: URLSearchParams) {
    const { where, page } = this.salesFilters(q), pageSize = 50;
    const rows = await this.db.sale.findMany({ where: { ...where, AND: [q.get('client') && q.get('client') !== 'walkin' ? await saleScope(this.db,gym) : {gymKey:gym}] }, include: { client: { select: { firstName: true, lastName: true } }, lines: true, payments: { orderBy: { createdAt: 'asc' } } }, orderBy: [{ soldAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize + 1 });
    return { sales: rows.slice(0, pageSize).map(saleBalance), pagination: { page, pageSize, hasPrevious: page > 1, hasNext: rows.length > pageSize } };
  }
  async pay(gym: string, actor: string, id: string, raw: unknown) {
    const v = paymentInput.parse(raw);
    return this.transaction(gym, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${id}::uuid FOR UPDATE`;
      const sale = await tx.sale.findFirst({ where: { id, AND: [await saleScope(tx,gym)] }, include: { lines: true, payments: true } });
      if (!sale)
        throw new ApiError(404, 'Venta desconocida.');
      const existing = await tx.payment.findUnique({ where: { requestKey: v.requestKey } });
      if (existing) {
        if (existing.saleId !== id || cents(existing.amount) !== cents(v.amount) || existing.method !== v.method || existing.kind !== 'COLLECTION' || (v.paidAt && existing.paidAt?.toISOString() !== v.paidAt) || existing.note !== v.note)
          throw new ApiError(409, 'Identificador de pago ya utilizado para otro cobro.');
        return saleBalance(sale);
      }
      if (!sale.clientId || (!sale.paymentTracking && sale.payments.length === 0) || sale.status !== 'COMPLETADA')
        throw new ApiError(409, 'Esta venta no admite cobros pendientes.');
      if (cents(v.amount) > cents(saleBalance(sale).outstandingAmount))
        throw new ApiError(409, 'El pago supera el importe pendiente. Actualiza el saldo.');
      const cashSessionId = await cashSessionFor(tx, gym, v.paidAt ? new Date(v.paidAt) : new Date());
      await tx.payment.create({ data: { cashSessionId, saleId: id, requestKey: v.requestKey, actorAccountId: actor, method: v.method, status: 'PAGADO', amount: v.amount, paidAt: v.paidAt ? new Date(v.paidAt) : new Date(), note: v.note } });
      const updated = await tx.sale.update({ where: { id }, data: { paymentTracking: true }, include: { lines: true, payments: true } });
      const balance = saleBalance(updated);
      await tx.clientServicePackage.updateMany({ where: { saleId: id }, data: { paymentStatus: balance.outstandingAmount === 0 ? 'PAGADO' : 'PENDIENTE', paymentMethod: v.method } });
      if (balance.outstandingAmount === 0)
        await tx.booking.updateMany({ where: { OR: [{ package: { saleId: id } }, { saleId: id }] }, data: { paymentPending: false } });
      return balance;
    });
  }
  async verifyPaid(gym: string, actor: string, id: string, raw: unknown) {
    const v = paymentInput.parse(raw);
    if (!v.paidAt || !v.note)
      throw new ApiError(400, 'Indica la fecha del cobro y cómo se ha comprobado el pago antiguo.');
    return this.transaction(gym, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${id}::uuid FOR UPDATE`;
      const sale = await tx.sale.findFirst({ where: { id, AND: [await saleScope(tx,gym)] }, include: { lines: true, payments: true } });
      if (!sale)
        throw new ApiError(404, 'Venta desconocida.');
      const existing = await tx.payment.findUnique({ where: { requestKey: v.requestKey } });
      if (existing) {
        if (existing.saleId !== id || existing.method !== v.method || existing.kind !== 'COLLECTION' || cents(existing.amount) !== cents(v.amount) || existing.paidAt?.toISOString() !== v.paidAt || existing.note !== v.note)
          throw new ApiError(409, 'Identificador de pago ya utilizado.');
        return saleBalance(sale);
      }
      if (sale.paymentTracking || sale.payments.length || sale.status !== 'COMPLETADA')
        throw new ApiError(409, 'Esta venta ya está verificada o no admite esta confirmación. Actualiza el historial.');
      if (cents(v.amount) !== cents(saleBalance(sale).netAmount))
        throw new ApiError(409, 'El importe de la venta ha cambiado. Actualiza antes de verificar.');
      await tx.payment.create({ data: { saleId: id, requestKey: v.requestKey, actorAccountId: actor, historicalVerification: true, method: v.method, status: 'PAGADO', amount: v.amount, paidAt: new Date(v.paidAt!), note: v.note } });
      const updated = await tx.sale.update({ where: { id }, data: { paymentTracking: true }, include: { lines: true, payments: true } });
      const balance = saleBalance(updated);
      await tx.clientServicePackage.updateMany({ where: { saleId: id }, data: { paymentStatus: balance.outstandingAmount === 0 ? 'PAGADO' : 'PENDIENTE', paymentMethod: v.method } });
      if (balance.outstandingAmount === 0)
        await tx.booking.updateMany({ where: { OR: [{ package: { saleId: id } }, { saleId: id }] }, data: { paymentPending: false } });
      return balance;
    });
  }
  async refund(gym: string, actor: string, id: string, raw: unknown) {
    const v = paymentInput.parse(raw);
    if (!v.note)
      throw new ApiError(400, 'Indica el motivo de la devolución del dinero.');
    return this.transaction(gym, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${id}::uuid FOR UPDATE`;
      const sale = await tx.sale.findFirst({ where: { id, AND: [await saleScope(tx,gym)] }, include: { lines: true, payments: true } });
      if (!sale)
        throw new ApiError(404, 'Venta desconocida.');
      const existing = await tx.payment.findUnique({ where: { requestKey: v.requestKey } });
      if (existing) {
        if (existing.saleId !== id || existing.kind !== 'REFUND' || existing.method !== v.method || cents(existing.amount) !== cents(v.amount) || existing.note !== v.note || (v.paidAt && existing.paidAt?.toISOString() !== v.paidAt))
          throw new ApiError(409, 'Identificador de reembolso ya utilizado.');
        return saleBalance(sale);
      }
      if (cents(v.amount) > cents(saleBalance(sale).refundDue))
        throw new ApiError(409, 'El importe supera el dinero pendiente de devolver.');
      const cashSessionId = await cashSessionFor(tx, gym, v.paidAt ? new Date(v.paidAt) : new Date());
      await tx.payment.create({ data: { cashSessionId, saleId: id, requestKey: v.requestKey, actorAccountId: actor, kind: 'REFUND', method: v.method, status: 'PAGADO', amount: v.amount, paidAt: v.paidAt ? new Date(v.paidAt) : new Date(), note: v.note } });
      return saleBalance(await tx.sale.findUniqueOrThrow({ where: { id }, include: { lines: true, payments: true } }));
    });
  }
  async debtSummary(gym: string) { return clientDebts(this.db, gym); }
  async restockRequests(gym: string, status?: string) {
    const where: any = { gymKey: gym };
    if (status && status !== 'ALL') where.status = status;
    return (this.db as any).restockRequest.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            stock: true,
            unitPrice: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
  async saveRestockRequest(gym: string, actor: { id: string; name?: string }, raw: unknown) {
    const v = restockInput.parse(raw);
    let resolvedName = v.productName;
    let product = null;
    if (v.productId) {
      product = await this.db.product.findFirst({ where: { id: v.productId, gymKey: gym } });
      if (!product) throw new ApiError(404, 'Producto no encontrado en el catálogo.');
      if (!resolvedName) resolvedName = product.name;
    }
    if (!resolvedName || !resolvedName.trim()) {
      throw new ApiError(400, 'Indica el nombre del producto que falta para pedir.');
    }
    return (this.db as any).restockRequest.create({
      data: {
        gymKey: gym,
        productId: product ? product.id : null,
        productName: resolvedName.trim(),
        quantity: v.quantity,
        status: 'PENDIENTE',
        notes: v.notes || null,
        requestedBy: actor.id,
        requestedByName: actor.name || null
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            stock: true,
            unitPrice: true,
            isActive: true
          }
        }
      }
    });
  }
  async updateRestockRequest(gym: string, actor: { id: string; name?: string }, id: string, raw: unknown) {
    const v = restockUpdateInput.parse(raw);
    return this.transaction(gym, async (tx) => {
      const existing = await (tx as any).restockRequest.findFirst({
        where: { id, gymKey: gym },
        include: { product: true }
      });
      if (!existing) throw new ApiError(404, 'Aviso de reposición no encontrado.');
      const data: any = {};
      if (v.status) {
        data.status = v.status;
        if (v.status === 'RECIBIDO' || v.status === 'CANCELADO') {
          data.resolvedAt = new Date();
        } else {
          data.resolvedAt = null;
        }
      }
      if (v.quantity !== undefined) data.quantity = v.quantity;
      if (v.notes !== undefined) data.notes = v.notes || null;

      if (v.status === 'RECIBIDO' && v.addToStock && existing.productId && existing.product) {
        const qtyToAdd = v.quantity !== undefined ? v.quantity : existing.quantity;
        if (qtyToAdd > 0) {
          await tx.product.update({
            where: { id: existing.productId },
            data: {
              stock: { increment: qtyToAdd },
              isActive: true,
              revision: { increment: 1 }
            }
          });
          await tx.stockMovement.create({
            data: {
              productId: existing.productId,
              type: 'ENTRADA',
              quantity: qtyToAdd,
              reference: `Reposición recibida: ${existing.id}`,
              notes: `Pedido recibido y repuesto en mostrador por ${actor.name || actor.id}`
            }
          });
        }
      }

      return (tx as any).restockRequest.update({
        where: { id },
        data,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              stock: true,
              unitPrice: true,
              isActive: true
            }
          }
        }
      });
    });
  }
  async removeRestockRequest(gym: string, id: string) {
    const existing = await (this.db as any).restockRequest.findFirst({ where: { id, gymKey: gym } });
    if (!existing) throw new ApiError(404, 'Aviso de reposición no encontrado.');
    await (this.db as any).restockRequest.delete({ where: { id } });
    return { success: true };
  }
}
export function inventoryPermission(actor: Identity | undefined, action: string) {
  if (!actor)
    throw new ApiError(401, 'Inicia sesión.');
  if (actor.role !== 'ADMIN' && !(actor.role === 'RECEPTION' && ['read', 'sell', 'return', 'restock'].includes(action)))
    throw new ApiError(403, 'No tienes permiso para esta operación.');
}
