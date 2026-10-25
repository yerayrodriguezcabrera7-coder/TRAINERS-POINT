-- CreateTable
CREATE TABLE "Gym" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "province" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Gym_pkey" PRIMARY KEY ("id")
);

-- Seed the initial gym before assigning existing clients to it.
INSERT INTO "Gym" ("id", "name", "city", "province", "updatedAt")
VALUES ('2b2a6900-7bd3-49b0-9392-19b477eb1261', 'Bizkaia Sant Marti', 'Sant Marti', 'Bizkaia', CURRENT_TIMESTAMP);

-- Assign existing clients to the initial gym and require a gym for new clients.
ALTER TABLE "Client" ADD COLUMN "gymId" UUID NOT NULL DEFAULT '2b2a6900-7bd3-49b0-9392-19b477eb1261';
ALTER TABLE "Client" ALTER COLUMN "gymId" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Gym_name_key" ON "Gym"("name");

-- CreateIndex
CREATE INDEX "Gym_isActive_name_idx" ON "Gym"("isActive", "name");

-- CreateIndex
CREATE INDEX "Client_gymId_status_idx" ON "Client"("gymId", "status");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
