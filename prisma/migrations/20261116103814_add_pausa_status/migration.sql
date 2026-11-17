-- AlterEnum
ALTER TYPE "ClientStatus" ADD VALUE 'PAUSA';

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'SALIDA';

-- DropForeignKey
ALTER TABLE "CashMovement" DROP CONSTRAINT "CashMovement_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "ClientServicePackage" DROP CONSTRAINT "ClientServicePackage_saleId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_cashSessionId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_providerId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_cashSessionId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_serviceId_fkey";

-- AlterTable
ALTER TABLE "Provider" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RestockRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Service" ALTER COLUMN "durationMin" SET DEFAULT 60;

-- CreateTable
CREATE TABLE "PermissionTemplate" (
    "id" UUID NOT NULL,
    "gymKey" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pages" TEXT[],
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PermissionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermissionTemplate_gymKey_idx" ON "PermissionTemplate"("gymKey");

-- CreateIndex
CREATE INDEX "PermissionTemplate_isBuiltIn_idx" ON "PermissionTemplate"("isBuiltIn");

-- CreateIndex
CREATE INDEX "Service_type_idx" ON "Service"("type");

-- AddForeignKey
ALTER TABLE "ClientServicePackage" ADD CONSTRAINT "ClientServicePackage_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
