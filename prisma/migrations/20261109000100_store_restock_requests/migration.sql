-- CreateEnum
CREATE TYPE "RestockStatus" AS ENUM ('PENDIENTE', 'PEDIDO', 'RECIBIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "RestockRequest" (
    "id" UUID NOT NULL,
    "gymKey" TEXT NOT NULL,
    "productId" UUID,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "RestockStatus" NOT NULL DEFAULT 'PENDIENTE',
    "notes" TEXT,
    "requestedBy" TEXT,
    "requestedByName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RestockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestockRequest_gymKey_status_idx" ON "RestockRequest"("gymKey", "status");
CREATE INDEX "RestockRequest_productId_idx" ON "RestockRequest"("productId");

-- AddForeignKey
ALTER TABLE "RestockRequest" ADD CONSTRAINT "RestockRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
