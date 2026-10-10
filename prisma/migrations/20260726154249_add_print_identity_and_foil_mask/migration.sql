-- AlterEnum
ALTER TYPE "AttachmentType" ADD VALUE 'foilMask';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "printKey" TEXT;

-- CreateIndex
CREATE INDEX "Item_printKey_idx" ON "Item"("printKey");
