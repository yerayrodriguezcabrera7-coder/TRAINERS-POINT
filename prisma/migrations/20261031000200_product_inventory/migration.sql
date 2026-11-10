ALTER TABLE "Product" ADD COLUMN "gymKey" TEXT, ADD COLUMN stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Sale" ADD COLUMN "gymKey" TEXT, ADD COLUMN "requestKey" TEXT UNIQUE, ADD COLUMN "sellerAccountId" TEXT;
ALTER TABLE "SaleLine" ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0 CHECK("returnedQuantity" >= 0);
CREATE INDEX "Product_gymKey_idx" ON "Product"("gymKey");
CREATE INDEX "Sale_gymKey_soldAt_idx" ON "Sale"("gymKey", "soldAt");
ALTER TABLE "Sale" ADD COLUMN "returnKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
