import type { Prisma, PrismaClient } from '@prisma/client';
/** One lock per centre: stock, receipts and drawer closures must share this boundary. */
export function financeTransaction<T>(db: PrismaClient, gym: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${gym}, 0))`;
    return operation(tx);
  }, { timeout: 15000 });
}
