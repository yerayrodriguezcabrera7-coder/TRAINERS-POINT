export const progressMigration = `
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "objective" TEXT;
ALTER TABLE "Gym" ADD COLUMN IF NOT EXISTS "photoData" TEXT;
CREATE TABLE IF NOT EXISTS "ClientMeasurement" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "measuredAt" DATE NOT NULL,
  "weight" DECIMAL(6,2),
  "hip" DECIMAL(6,2),
  "waist" DECIMAL(6,2),
  "leg" DECIMAL(6,2),
  "chest" DECIMAL(6,2),
  "arm" DECIMAL(6,2),
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientMeasurement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientMeasurement_clientId_measuredAt_key" ON "ClientMeasurement"("clientId", "measuredAt");
CREATE INDEX IF NOT EXISTS "ClientMeasurement_clientId_measuredAt_idx" ON "ClientMeasurement"("clientId", "measuredAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientMeasurement_clientId_fkey') THEN
    ALTER TABLE "ClientMeasurement" ADD CONSTRAINT "ClientMeasurement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
`;
