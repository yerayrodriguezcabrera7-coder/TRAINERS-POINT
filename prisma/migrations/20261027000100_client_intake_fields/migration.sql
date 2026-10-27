CREATE TYPE "ClientSex" AS ENUM ('MUJER', 'HOMBRE', 'NO_INDICA');
CREATE TYPE "ClientSource" AS ENUM ('INSTAGRAM', 'RECOMENDACION', 'PASO_POR_LA_PUERTA', 'GOOGLE', 'OTRO');
CREATE TYPE "ContactPreference" AS ENUM ('WHATSAPP', 'LLAMADA', 'EMAIL');
CREATE TYPE "ContactSlot" AS ENUM ('MANANA', 'MEDIODIA', 'TARDE');

ALTER TABLE "Client"
  ADD COLUMN "sex" "ClientSex",
  ADD COLUMN "source" "ClientSource",
  ADD COLUMN "sourceDetail" TEXT,
  ADD COLUMN "preferredName" TEXT,
  ADD COLUMN "contactPreference" "ContactPreference",
  ADD COLUMN "contactSlot" "ContactSlot",
  ADD COLUMN "injuries" JSONB,
  ADD COLUMN "injuryNotes" TEXT,
  ADD COLUMN "availability" JSONB,
  ADD COLUMN "sessionsPerWeek" INTEGER,
  ADD COLUMN "consentData" TIMESTAMPTZ(3),
  ADD COLUMN "consentMarketing" TIMESTAMPTZ(3),
  ADD COLUMN "consentPhotos" TIMESTAMPTZ(3);
