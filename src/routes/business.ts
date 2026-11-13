import type { IncomingMessage, ServerResponse } from 'node:http';
import { DateTime } from 'luxon';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { Identity } from '../calendar/access';
import { ApiError } from '../calendar/model';
import { CashRegister } from '../finance/cash';
import { clientDebts } from '../finance/debts';
import type { ApiContext } from '../http/api-context';
import { sendError, sendJson } from '../http/json';
import { prisma } from '../lib/prisma';
import { clientScope } from '../network/scope';

const zone = 'Europe/Madrid';
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => DateTime.fromISO(value, { zone }).isValid);
const reportTypes = ['cash', 'debts', 'inventory', 'packages'] as const;
type ReportType = typeof reportTypes[number];
type Cell = string | number | null;

export function dateRange(params: URLSearchParams, defaultDays = 30) {
  const today = DateTime.now().setZone(zone).startOf('day');
  const parsed = z.object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  }).parse(Object.fromEntries(params));
  const from = parsed.from ? DateTime.fromISO(parsed.from, { zone }).startOf('day') : today.minus({ days: defaultDays - 1 });
  const to = parsed.to ? DateTime.fromISO(parsed.to, { zone }).startOf('day') : today;
  if (to < from) throw new ApiError(400, 'La fecha inicial no puede ser posterior a la final.');
  if (to.diff(from, 'days').days > 731) throw new ApiError(400, 'Selecciona un período máximo de dos años.');
  return { from, to, start: from.toJSDate(), end: to.plus({ days: 1 }).toJSDate(), fromKey: from.toISODate()!, toKey: to.toISODate()! };
}

function pagePermission(actor: Identity | undefined, page: string) {
  if (!actor) throw new ApiError(401, 'Inicia sesión para continuar.');
  if (actor.role === 'ADMIN') return;
  if (Array.isArray(actor.pagePermissions) && actor.pagePermissions.includes(page)) return;
  throw new ApiError(403, 'No tienes permiso para consultar esta información de negocio.');
}

const money = (value: number) => Math.round(value * 100) / 100;
function lineAmounts(line: any) {
  const quantity = Number(line.quantity);
  const remaining = Math.max(0, quantity - Number(line.returnedQuantity || 0));
  const gross = quantity > 0 ? Number(line.lineTotal) * remaining / quantity : 0;
  const base = gross / (1 + Number(line.taxRate || 0) / 100);
  const cost = line.type === 'PRODUCTO' ? Number(line.product?.costPrice || 0) * remaining : 0;
  return { gross, base, cost, profit: base - cost };
}

export async function dashboardData(gym: string, params: URLSearchParams, database: PrismaClient = prisma) {
  const range = dateRange(params);
  const gyms = await database.gym.findMany({ where: { isActive: true }, select: { id: true, brand: true, name: true } });
  const gymById = new Map(gyms.map(item => [item.id, item]));
  const [sales, allSales, bookings, allBookings, clientCounts] = await Promise.all([
    database.sale.findMany({
      where: { gymKey: gym, status: 'COMPLETADA', soldAt: { gte: range.start, lt: range.end } },
      include: { lines: { include: { product: { select: { costPrice: true } } } } },
      orderBy: { soldAt: 'asc' },
    }),
    database.sale.findMany({
      where: { gymKey: { in: gyms.map(item => item.id) }, status: 'COMPLETADA', soldAt: { gte: range.start, lt: range.end } },
      include: { lines: true },
    }),
    database.booking.findMany({ where: { calendarGymId: gym, startTime: { gte: range.start, lt: range.end } }, select: { status: true, attendance: true } }),
    database.booking.findMany({ where: { calendarGymId: { in: gyms.map(item => item.id) }, startTime: { gte: range.start, lt: range.end } }, select: { calendarGymId: true, status: true, attendance: true } }),
    database.client.groupBy({ by: ['brand'], where: { status: 'ACTIVO' }, _count: { _all: true } }),
  ]);
  let services = 0, products = 0, productProfit = 0;
  const daily = new Map<string, { date: string; services: number; products: number }>();
  for (const sale of sales) {
    const key = DateTime.fromJSDate(sale.soldAt || sale.createdAt).setZone(zone).toISODate()!;
    const day = daily.get(key) || { date: key, services: 0, products: 0 };
    for (const line of sale.lines) {
      const amounts = lineAmounts(line);
      if (line.type === 'PRODUCTO') {
        products += amounts.gross; productProfit += amounts.profit; day.products += amounts.gross;
      } else {
        services += amounts.gross; day.services += amounts.gross;
      }
    }
    daily.set(key, day);
  }
  const revenueByBrand = new Map<string, number>();
  for (const sale of allSales) {
    const brand = gymById.get(sale.gymKey || '')?.brand || 'SIN_MARCA';
    const value = sale.lines.reduce((sum, line) => sum + lineAmounts(line).gross, 0);
    revenueByBrand.set(brand, (revenueByBrand.get(brand) || 0) + value);
  }
  const activityByBrand = new Map<string, number>();
  for (const booking of allBookings) {
    const brand = gymById.get(booking.calendarGymId || '')?.brand || 'SIN_MARCA';
    if (booking.status !== 'CANCELADA') activityByBrand.set(brand, (activityByBrand.get(brand) || 0) + 1);
  }
  const clientsByBrand = new Map(clientCounts.map(row => [row.brand, row._count._all]));
  const brandComparison = ['TRAINERS_POINT', 'COBOSU'].map(brand => ({
    brand,
    activeClients: clientsByBrand.get(brand as any) || 0,
    activity: activityByBrand.get(brand) || 0,
    revenue: money(revenueByBrand.get(brand) || 0),
  }));
  const occupancy = {
    completed: bookings.filter(row => row.attendance === 'ASISTIO' || (row.status === 'COMPLETADA' && row.attendance !== 'NO_ASISTIO')).length,
    cancelled: bookings.filter(row => row.status === 'CANCELADA' || row.attendance === 'CANCELADA').length,
    noShow: bookings.filter(row => row.attendance === 'NO_ASISTIO').length,
    scheduled: bookings.filter(row => row.status === 'PENDIENTE' || row.status === 'CONFIRMADA').length,
  };
  return {
    range: { from: range.fromKey, to: range.toKey },
    revenue: { total: money(services + products), services: money(services), products: money(products), productProfit: money(productProfit) },
    occupancy,
    brandComparison,
    daily: [...daily.values()].map(day => ({ ...day, services: money(day.services), products: money(day.products) })),
    updatedAt: new Date().toISOString(),
  };
}

async function cashReport(database: PrismaClient, gym: string, from: string, to: string) {
  const sessions = await database.cashSession.findMany({ where: { gymKey: gym, businessDate: { gte: from, lte: to } }, include: { movements: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } }, orderBy: { businessDate: 'desc' } });
  const current = await new CashRegister(database).current(gym);
  return sessions.flatMap(session => {
    const summary: any = session.closedAt ? session.summary : current.session?.id === session.id ? current.session.summary : null;
    const sessionRow: Cell[] = ['Caja', session.businessDate, session.closedAt?.toISOString() || session.openedAt.toISOString(), session.closedByName || session.openedByName, session.closedAt ? 'Cierre de caja' : 'Caja abierta', Number(session.openingAmount), summary?.collections?.EFECTIVO || 0, summary?.collections?.TARJETA || 0, summary?.collections?.BIZUM || 0, summary?.cashIn || 0, summary?.cashOut || 0, session.expectedAmount == null ? summary?.expectedCash ?? null : Number(session.expectedAmount), session.countedAmount == null ? null : Number(session.countedAmount), session.difference == null ? null : Number(session.difference), session.closingNote || ''];
    const movements: Cell[][] = session.movements.map(movement => ['Movimiento', session.businessDate, movement.createdAt.toISOString(), movement.actorName, `${movement.category}: ${movement.reason}`, null, null, null, null, movement.direction === 'IN' ? Number(movement.amount) : 0, movement.direction === 'OUT' ? Number(movement.amount) : 0, null, null, null, movement.direction === 'IN' ? 'Entrada de efectivo' : 'Salida de efectivo']);
    return [sessionRow, ...movements];
  });
}

async function debtReport(database: PrismaClient, gym: string) {
  const debts = await clientDebts(database, gym);
  const clients = await database.client.findMany({ where: { id: { in: Object.keys(debts) }, AND: [await clientScope(database, gym)] }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  return clients.map(client => [`${client.firstName} ${client.lastName}`.trim(), client.email, client.phone, client.status, money(debts[client.id] || 0)]);
}

async function inventoryReport(database: PrismaClient, gym: string) {
  const products = await database.product.findMany({ where: { gymKey: gym, isActive: true }, orderBy: { name: 'asc' } });
  return products.map(product => [product.name, product.barcode || product.sku || '', product.stock, Number(product.costPrice), money(product.stock * Number(product.costPrice)), Number(product.unitPrice), money(product.stock * Number(product.unitPrice)), Number(product.taxRate)]);
}

async function packageReport(database: PrismaClient, gym: string, from: string, to: string) {
  const clientsWhere = await clientScope(database, gym);
  const packages = await database.clientServicePackage.findMany({
    where: { client: clientsWhere, paymentStatus: { in: ['PAGADO', 'PENDIENTE'] } },
    include: { client: true, service: true, bookings: { where: { status: { not: 'CANCELADA' } } } },
    orderBy: { purchasedAt: 'desc' },
  });
  return packages.flatMap(pkg => {
    const expiry = pkg.service.validityWeeks == null ? null : DateTime.fromJSDate(pkg.purchasedAt).plus({ weeks: pkg.service.validityWeeks }).toISODate();
    const attended = pkg.bookings.filter(item => item.attendance === 'ASISTIO').length;
    const scheduled = pkg.bookings.filter(item => item.attendance === 'PENDIENTE').length;
    const available = Math.max(0, pkg.sessionsBought - attended - scheduled);
    if (available <= 0 || (expiry && (expiry < from || expiry > to))) return [];
    return [[`${pkg.client.firstName} ${pkg.client.lastName}`.trim(), pkg.service.name, pkg.purchasedAt.toISOString(), expiry || 'Sin caducidad', pkg.sessionsBought, attended, scheduled, available, pkg.paymentStatus]];
  });
}

const reportSpecs: Record<ReportType, { title: string; columns: string[] }> = {
  cash: { title: 'Cierres de caja y movimientos', columns: ['Registro', 'Fecha', 'Fecha y hora', 'Responsable', 'Concepto', 'Efectivo inicial', 'Cobros efectivo', 'Cobros tarjeta', 'Cobros Bizum', 'Otras entradas', 'Otras salidas', 'Efectivo esperado', 'Efectivo contado', 'Diferencia', 'Observación'] },
  debts: { title: 'Clientes con pagos pendientes', columns: ['Cliente', 'Correo', 'Teléfono', 'Estado', 'Importe pendiente'] },
  inventory: { title: 'Inventario actual valorado', columns: ['Producto', 'Código', 'Unidades', 'Coste unitario', 'Coste total', 'PVP unitario', 'PVP total', 'IVA %'] },
  packages: { title: 'Consumo y caducidad de bonos activos', columns: ['Cliente', 'Bono / servicio', 'Compra', 'Caducidad', 'Sesiones compradas', 'Realizadas', 'Programadas', 'Disponibles', 'Pago'] },
};

export async function reportData(gym: string, params: URLSearchParams, database: PrismaClient = prisma) {
  const type = z.enum(reportTypes).parse(params.get('type'));
  const range = dateRange(params, 31);
  let rows: Cell[][];
  if (type === 'cash') rows = await cashReport(database, gym, range.fromKey, range.toKey);
  else if (type === 'debts') rows = await debtReport(database, gym);
  else if (type === 'inventory') rows = await inventoryReport(database, gym);
  else rows = await packageReport(database, gym, range.fromKey, range.toKey);
  return { type, ...reportSpecs[type], range: { from: range.fromKey, to: range.toKey }, rows, generatedAt: new Date().toISOString() };
}

function safeCsv(value: Cell) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function reportCsv(report: Awaited<ReturnType<typeof reportData>>) {
  return '\uFEFF' + [report.columns, ...report.rows].map(row => row.map(safeCsv).join(';')).join('\r\n');
}

export async function auditData(gym: string, params: URLSearchParams, database: PrismaClient = prisma) {
  const range = dateRange(params, 31);
  const type = params.get('type')?.trim() || '';
  const user = params.get('user')?.trim().toLocaleLowerCase('es') || '';
  const events = await database.auditLog.findMany({
    where: { occurredAt: { gte: range.start, lt: range.end } },
    include: { actor: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 1000,
  });
  const centreEvents = events.filter(event => ((event.metadata || {}) as any).gymKey === gym);
  const rows = centreEvents.filter(event => {
    const metadata = (event.metadata || {}) as any;
    const actorName = metadata.actorName || [event.actor?.firstName, event.actor?.lastName].filter(Boolean).join(' ') || metadata.actorId || 'Sistema';
    return (!type || event.action === type) && (!user || actorName.toLocaleLowerCase('es').includes(user));
  }).slice(0, 300).map(event => {
    const metadata = (event.metadata || {}) as any;
    return { id: event.id, action: event.action, entityType: event.entityType, entityId: event.entityId, occurredAt: event.occurredAt, actorName: metadata.actorName || [event.actor?.firstName, event.actor?.lastName].filter(Boolean).join(' ') || metadata.actorId || 'Sistema', detail: metadata.detail || metadata.reason || '', metadata };
  });
  return { range: { from: range.fromKey, to: range.toKey }, events: rows, types: [...new Set(centreEvents.map(item => item.action))].sort() };
}

export async function businessRoutes(request: IncomingMessage, response: ServerResponse, url: URL, _context: ApiContext): Promise<boolean> {
  if (!url.pathname.startsWith('/api/dashboard') && !url.pathname.startsWith('/api/reports') && !url.pathname.startsWith('/api/audit-events')) return false;
  try {
    const actor = (request as any).identity as Identity | undefined;
    const gym = (request as any).selectedGym as string;
    if (request.method !== 'GET') throw new ApiError(405, 'Método no permitido.');
    if (url.pathname === '/api/dashboard') {
      pagePermission(actor, 'cuadro-mando.html');
      sendJson(response, 200, await dashboardData(gym, url.searchParams));
    } else if (url.pathname === '/api/reports') {
      pagePermission(actor, 'informes.html');
      sendJson(response, 200, await reportData(gym, url.searchParams));
    } else if (url.pathname === '/api/reports/download') {
      pagePermission(actor, 'informes.html');
      const report = await reportData(gym, url.searchParams);
      response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${report.type}-${report.range.from}-${report.range.to}.csv"` });
      response.end(reportCsv(report));
    } else if (url.pathname === '/api/audit-events') {
      pagePermission(actor, 'historial-eventos.html');
      sendJson(response, 200, await auditData(gym, url.searchParams));
    } else sendError(response, 404, 'Módulo desconocido.');
  } catch (error) {
    if (error instanceof ApiError) sendError(response, error.status, error.message);
    else if (error instanceof z.ZodError) sendError(response, 400, 'Revisa el tipo de informe y el rango de fechas.');
    else throw error;
  }
  return true;
}
