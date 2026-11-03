CREATE TABLE "CashSession" (
 "id" UUID NOT NULL PRIMARY KEY, "gymKey" TEXT NOT NULL, "businessDate" VARCHAR(10) NOT NULL,
 "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "openedBy" TEXT NOT NULL, "openedByName" TEXT NOT NULL,
 "openingAmount" DECIMAL(12,2) NOT NULL CHECK ("openingAmount">=0),
 "closedAt" TIMESTAMPTZ(3), "closedBy" TEXT, "closedByName" TEXT,
 "countedAmount" DECIMAL(12,2), "expectedAmount" DECIMAL(12,2), "difference" DECIMAL(12,2), "closingNote" TEXT,
 "revision" INTEGER NOT NULL DEFAULT 1, "requestKey" TEXT NOT NULL UNIQUE, "closeRequestKey" TEXT UNIQUE, "summary" JSONB,
 CHECK (("closedAt" IS NULL AND "countedAmount" IS NULL) OR ("closedAt" IS NOT NULL AND "countedAmount">=0 AND "summary" IS NOT NULL))
);
CREATE UNIQUE INDEX "CashSession_one_open_per_gym" ON "CashSession"("gymKey") WHERE "closedAt" IS NULL;
CREATE INDEX "CashSession_gymKey_openedAt_idx" ON "CashSession"("gymKey","openedAt");
CREATE TABLE "CashMovement" (
 "id" UUID NOT NULL PRIMARY KEY, "sessionId" UUID NOT NULL REFERENCES "CashSession"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL UNIQUE, "direction" TEXT NOT NULL CHECK ("direction" IN ('IN','OUT')),
 "category" TEXT NOT NULL CHECK ("category" IN ('CHANGE','WITHDRAWAL','OTHER')),
 "amount" DECIMAL(12,2) NOT NULL CHECK ("amount">0), "reason" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL
);
CREATE INDEX "CashMovement_sessionId_createdAt_idx" ON "CashMovement"("sessionId","createdAt");
ALTER TABLE "Sale" ADD COLUMN "cashSessionId" UUID REFERENCES "CashSession"("id") ON DELETE RESTRICT;
ALTER TABLE "Payment" ADD COLUMN "cashSessionId" UUID REFERENCES "CashSession"("id") ON DELETE RESTRICT,
 ADD COLUMN "historicalVerification" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Sale_cashSessionId_idx" ON "Sale"("cashSessionId");
CREATE INDEX "Payment_cashSessionId_idx" ON "Payment"("cashSessionId");
