ALTER TABLE "Booking" ADD COLUMN "calendarGymId" TEXT, ADD COLUMN "paymentPending" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Booking_calendarGymId_idx" ON "Booking"("calendarGymId");
ALTER TABLE "ClientServicePackage" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "ClientServicePackage_requestKey_key" ON "ClientServicePackage"("requestKey");
