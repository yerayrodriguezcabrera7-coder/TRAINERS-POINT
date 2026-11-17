CREATE TABLE "Provider" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gymKey" TEXT,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE INDEX "Provider_gymKey_idx" ON "Provider"("gymKey");

ALTER TABLE "Product" ADD COLUMN "providerId" UUID;
ALTER TABLE "Product" ADD CONSTRAINT "Product_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL;
CREATE INDEX "Product_providerId_idx" ON "Product"("providerId");