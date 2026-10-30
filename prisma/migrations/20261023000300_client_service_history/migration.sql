-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PENDIENTE', 'ASISTIO', 'NO_ASISTIO', 'CANCELADA');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "attendance" "AttendanceStatus" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "attendedAt" TIMESTAMPTZ(3),
ADD COLUMN     "packageId" UUID;

-- CreateTable
CREATE TABLE "ClientServicePackage" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "sessionsBought" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAGADO',
    "purchasedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ClientServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientServicePackage_clientId_purchasedAt_idx" ON "ClientServicePackage"("clientId", "purchasedAt");

-- CreateIndex
CREATE INDEX "ClientServicePackage_serviceId_purchasedAt_idx" ON "ClientServicePackage"("serviceId", "purchasedAt");

-- CreateIndex
CREATE INDEX "ClientServicePackage_paymentStatus_idx" ON "ClientServicePackage"("paymentStatus");

-- CreateIndex
CREATE INDEX "Booking_packageId_attendance_idx" ON "Booking"("packageId", "attendance");

-- AddForeignKey
ALTER TABLE "ClientServicePackage" ADD CONSTRAINT "ClientServicePackage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientServicePackage" ADD CONSTRAINT "ClientServicePackage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ClientServicePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
