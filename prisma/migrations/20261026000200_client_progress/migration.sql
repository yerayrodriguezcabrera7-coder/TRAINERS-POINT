ALTER TABLE "Client" ADD COLUMN "objective" TEXT;

CREATE TABLE "ClientMeasurement" (
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

CREATE UNIQUE INDEX "ClientMeasurement_clientId_measuredAt_key" ON "ClientMeasurement"("clientId", "measuredAt");
CREATE INDEX "ClientMeasurement_clientId_measuredAt_idx" ON "ClientMeasurement"("clientId", "measuredAt");

ALTER TABLE "ClientMeasurement" ADD CONSTRAINT "ClientMeasurement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
