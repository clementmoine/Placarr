-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "Shelf" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE INDEX "Item_slug_idx" ON "Item"("slug");

-- CreateIndex
CREATE INDEX "Shelf_slug_idx" ON "Shelf"("slug");
