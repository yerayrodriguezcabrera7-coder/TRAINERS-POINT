ALTER TABLE "Booking" ADD COLUMN "saleId" UUID;
CREATE UNIQUE INDEX "Booking_saleId_key" ON "Booking"("saleId");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
