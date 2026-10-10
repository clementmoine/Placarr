-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "language" TEXT;

-- CreateIndex
CREATE INDEX "Item_printKey_variant_language_idx" ON "Item"("printKey", "variant", "language");
