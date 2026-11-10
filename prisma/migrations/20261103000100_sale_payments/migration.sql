ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BIZUM';
ALTER TABLE "Sale" ADD COLUMN "paymentTracking" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requestFingerprint" TEXT;
ALTER TABLE "Payment" ADD COLUMN "requestKey" TEXT, ADD COLUMN "actorAccountId" TEXT;
CREATE UNIQUE INDEX "Payment_requestKey_key" ON "Payment"("requestKey");
-- Existing sales without payment evidence remain unverified; never fabricate receipts.
