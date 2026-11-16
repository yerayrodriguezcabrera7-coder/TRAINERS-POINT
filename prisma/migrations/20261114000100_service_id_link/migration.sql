ALTER TABLE "Service" ADD COLUMN "serviceId" uuid;
ALTER TABLE "Service" ADD CONSTRAINT "Service_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Service_serviceId_idx" ON "Service"("serviceId");