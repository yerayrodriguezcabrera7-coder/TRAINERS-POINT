-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceModality') THEN
    CREATE TYPE "ServiceModality" AS ENUM ('INDIVIDUAL', 'DUAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceType') THEN
    CREATE TYPE "ServiceType" AS ENUM ('PACK', 'SESION_INDIVIDUAL');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Service"
  ADD COLUMN IF NOT EXISTS "modality" "ServiceModality" NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN IF NOT EXISTS "type" "ServiceType" NOT NULL DEFAULT 'SESION_INDIVIDUAL',
  ADD COLUMN IF NOT EXISTS "trainingCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "validityWeeks" INTEGER,
  ADD COLUMN IF NOT EXISTS "recommendedWeeklyFrequency" INTEGER,
  ADD COLUMN IF NOT EXISTS "conditions" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Service_modality_type_idx" ON "Service"("modality", "type");

