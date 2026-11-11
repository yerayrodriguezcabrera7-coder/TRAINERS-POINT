import { Prisma, type PrismaClient } from '@prisma/client';
import { clientScopeSQL } from '../network/scope';
/** Calculate per-client balances in PostgreSQL, without loading every sale and receipt. */
export async function clientDebts(db: PrismaClient, gym: string): Promise<Record<string, number>> {
  // Historical calendar keys can be slugs; only CRM UUIDs can own legacy packages.
  const clientGymId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gym) ? gym : null;
  const rows = await db.$queryRaw<Array<{
    clientId: string;
    cents: unknown;
  }>>(Prisma.sql`
    WITH sales AS (
      SELECT s.id, s."clientId", s."paymentTracking", ROUND(s."totalAmount" * 100) AS total
      FROM "Sale" s JOIN "Client" c ON c.id=s."clientId"
      WHERE (s."gymKey"=${gym} OR ${clientScopeSQL(clientGymId)}) AND s.status='COMPLETADA'
    ), returns AS (
      SELECT l."saleId", SUM(ROUND(l."unitPrice" * 100) * l."returnedQuantity") AS amount
      FROM "SaleLine" l JOIN sales s ON s.id = l."saleId" GROUP BY l."saleId"
    ), receipts AS (
      SELECT p."saleId", COUNT(*) AS count,
        SUM(CASE WHEN p.status = 'PAGADO'
          THEN ROUND(p.amount * 100) * CASE WHEN p.kind = 'REFUND' THEN -1 ELSE 1 END
          ELSE 0 END) AS amount
      FROM "Payment" p JOIN sales s ON s.id = p."saleId" GROUP BY p."saleId"
    ), balances AS (
      SELECT s."clientId",
        GREATEST(0, GREATEST(0, s.total - COALESCE(r.amount, 0)) - COALESCE(p.amount, 0)) AS cents
      FROM sales s LEFT JOIN returns r ON r."saleId" = s.id
        LEFT JOIN receipts p ON p."saleId" = s.id
      WHERE s."paymentTracking" OR COALESCE(p.count, 0) > 0
      UNION ALL
      SELECT p."clientId", ROUND(p."totalAmount" * 100)
      FROM "ClientServicePackage" p JOIN "Client" c ON c.id = p."clientId"
      WHERE ${clientScopeSQL(clientGymId)} AND p."saleId" IS NULL
        AND p."paymentStatus" IN ('PENDIENTE', 'FALLIDO')
    )
    SELECT "clientId", SUM(cents) AS cents FROM balances
    GROUP BY "clientId" HAVING SUM(cents) > 0
  `);
  return Object.fromEntries(rows.map(row => [row.clientId, Number(row.cents) / 100]));
}
