-- AlterTable
ALTER TABLE "Item" ADD COLUMN "setCode" TEXT;

-- CreateIndex
CREATE INDEX "Item_printKey_setCode_variant_language_idx" ON "Item"("printKey", "setCode", "variant", "language");
