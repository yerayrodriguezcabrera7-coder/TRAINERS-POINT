-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "referredById" UUID;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
