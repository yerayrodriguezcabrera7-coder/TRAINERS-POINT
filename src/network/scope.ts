import { Prisma, type PrismaClient } from "@prisma/client";
type Database = PrismaClient | Prisma.TransactionClient;

/** Fixed SQL alias c; all values are bound parameters. A legacy slug shares no CRM data. */
export function clientScopeSQL(gym: string | null) {
  return Prisma.sql`(c."gymId"=${gym}::uuid OR (c.brand='TRAINERS_POINT' AND EXISTS
    (SELECT 1 FROM "Gym" target WHERE target.id=${gym}::uuid AND target.brand='TRAINERS_POINT' AND target."isActive")))`;
}

/** One deployment represents the company's network. Stock and drawers remain local. */
export async function clientScope(db: Database, gym: string): Promise<Prisma.ClientWhereInput> {
  const center = await db.gym.findUnique({ where: { id: gym }, select: { brand: true, isActive: true } });
  return center?.isActive && center.brand === "TRAINERS_POINT"
    ? { OR: [{ gymId: gym }, { brand: "TRAINERS_POINT" }] }
    : { gymId: gym };
}

export async function accessibleClient(db: Database, gym: string, id: string) {
  return db.client.findFirst({ where: { id, AND: [await clientScope(db,gym)] } });
}

export async function saleScope(db: Database, gym: string): Promise<Prisma.SaleWhereInput> {
  const center = await db.gym.findUnique({ where: { id: gym }, select: { brand: true, isActive: true } });
  return center?.isActive && center.brand === "TRAINERS_POINT"
    ? { OR: [{ gymKey: gym }, { client: { brand: "TRAINERS_POINT" } }] }
    : { gymKey: gym };
}
