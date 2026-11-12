CREATE TYPE "ClientBrand" AS ENUM ('TRAINERS_POINT','COBOSU');
CREATE TYPE "ServiceCategory" AS ENUM ('TRAINING','CABIN');
ALTER TABLE "Client" ADD COLUMN "brand" "ClientBrand" NOT NULL DEFAULT 'TRAINERS_POINT';
UPDATE "Client" c SET "brand"='COBOSU' FROM "Gym" g WHERE c."gymId"=g.id AND g.name ILIKE '%cobosu%';
ALTER TABLE "Service" ADD COLUMN "category" "ServiceCategory" NOT NULL DEFAULT 'TRAINING', ADD COLUMN "color" text NOT NULL DEFAULT '#317b9b';
-- Preserve service colours previously configured in calendar JSON, where present.
UPDATE "Service" s SET "color"=COALESCE((
  SELECT v->>'color' FROM calendar.gyms g, jsonb_array_elements(g.config->'services') v
  WHERE v->>'id'=s.id::text AND v->>'color' ~ '^#[0-9a-fA-F]{6}$' LIMIT 1
),'#'||substr(md5(s.id::text),1,6));
ALTER TABLE "Service" ALTER COLUMN "validityWeeks" SET DEFAULT 4;
UPDATE "Service" SET "validityWeeks"=4 WHERE "validityWeeks" IS NULL;
ALTER TABLE "Service" ADD CONSTRAINT "Service_validityWeeks_positive" CHECK ("validityWeeks">0);
ALTER TABLE "Product" ADD COLUMN "imageData" text, ADD COLUMN "barcode" text,
  ADD COLUMN "trackStock" boolean NOT NULL DEFAULT true,
  ADD COLUMN "costPrice" decimal(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxRate" decimal(5,2) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Product_gymKey_barcode_key" ON "Product"("gymKey","barcode");
ALTER TABLE "Product" ADD CONSTRAINT "Product_cost_nonnegative" CHECK ("costPrice">=0),
  ADD CONSTRAINT "Product_tax_valid" CHECK ("taxRate">=0 AND "taxRate"<=100);
