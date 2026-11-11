import { Prisma, type PrismaClient } from '@prisma/client';
import { clientScopeSQL } from '../network/scope';

/** Sessions already booked anywhere in the network are not offered a second time. */
export async function pendingPackages(db: PrismaClient, gym: string) {
  if(!/^[0-9a-f-]{36}$/i.test(gym))return [];
  const rows=await db.$queryRaw<Array<{
    packageId:string;clientId:string;clientName:string;serviceId:string;serviceName:string;
    sessionsBought:number;sessionsUsed:bigint;sessionsScheduled:bigint;sessionsHeld:bigint;
    expiresAt:Date;paymentPending:boolean;
  }>>(Prisma.sql`
    WITH candidates AS (
      SELECT p.id AS "packageId",c.id AS "clientId",concat_ws(' ',c."firstName",c."lastName") AS "clientName",
        s.id AS "serviceId",s.name AS "serviceName",p."sessionsBought",
        p."purchasedAt"+(COALESCE(s."validityWeeks",4)*168)*interval '1 hour' AS "expiresAt",
        p."paymentStatus"='PENDIENTE' AS "paymentPending"
      FROM "ClientServicePackage" p JOIN "Client" c ON c.id=p."clientId" JOIN "Service" s ON s.id=p."serviceId"
      WHERE ${clientScopeSQL(gym)} AND c.status IN ('ACTIVO','LEAD') AND s."isActive"
        AND p."paymentStatus" IN ('PAGADO','PENDIENTE')
        AND p."purchasedAt"<=now()
        AND p."purchasedAt"+(COALESCE(s."validityWeeks",4)*168)*interval '1 hour'>now()
    ), occupied AS (
      SELECT b."packageId",
        count(*) FILTER(WHERE b.attendance IN ('ASISTIO','NO_ASISTIO')) AS used,
        count(*) FILTER(WHERE b.attendance='PENDIENTE') AS scheduled
      FROM "Booking" b JOIN candidates p ON p."packageId"=b."packageId"
      WHERE b.status<>'CANCELADA' GROUP BY b."packageId"
    ), held AS (
      SELECT original."packageId",count(*) AS n
      FROM calendar.recoveries r JOIN "Booking" original ON original.id::text=r.original_id
      JOIN candidates p ON p."packageId"=original."packageId"
      WHERE r.data->>'status' IN ('PENDING','RESCHEDULE_PENDING','FORFEITED')
        AND NOT EXISTS(SELECT 1 FROM "Booking" used WHERE used.id::text=r.data->>'bookingId'
          AND used."packageId"=original."packageId" AND used.status<>'CANCELADA'
          AND used.attendance IN ('ASISTIO','PENDIENTE','NO_ASISTIO'))
      GROUP BY original."packageId"
    )
    SELECT p.*,COALESCE(o.used,0) AS "sessionsUsed",COALESCE(o.scheduled,0) AS "sessionsScheduled",
      COALESCE(h.n,0) AS "sessionsHeld"
    FROM candidates p LEFT JOIN occupied o ON o."packageId"=p."packageId" LEFT JOIN held h ON h."packageId"=p."packageId"
    WHERE p."sessionsBought">COALESCE(o.used,0)+COALESCE(o.scheduled,0)+COALESCE(h.n,0)
    ORDER BY p."expiresAt",p."clientName",p."packageId"
  `);
  const now=Date.now();
  return rows.map(row=>({...row,sessionsUsed:Number(row.sessionsUsed),sessionsScheduled:Number(row.sessionsScheduled),
    sessionsHeld:Number(row.sessionsHeld),sessionsToSchedule:row.sessionsBought-Number(row.sessionsUsed)-Number(row.sessionsScheduled)-Number(row.sessionsHeld),
    expiresAt:row.expiresAt.toISOString(),daysRemaining:Math.max(0,Math.ceil((row.expiresAt.getTime()-now)/86400000))}));
}
