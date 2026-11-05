-- Optional catalogue pack scope on Shelf (soft join → explicit).
ALTER TABLE "Shelf" ADD COLUMN "dataPack" TEXT;

CREATE INDEX "Shelf_dataPack_idx" ON "Shelf"("dataPack");
