ALTER TABLE "ClientServicePackage" ADD COLUMN "saleId" UUID REFERENCES "Sale"(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX "ClientServicePackage_saleId_key" ON "ClientServicePackage"("saleId");
