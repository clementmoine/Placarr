-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('object', 'card', 'sealed', 'shell');

-- CreateEnum
CREATE TYPE "ContainmentRole" AS ENUM ('content', 'shell');

-- AlterTable: sealed lifecycle columns on Item
ALTER TABLE "Item" ADD COLUMN "kind" "ItemKind" NOT NULL DEFAULT 'object',
ADD COLUMN "skuKey" TEXT,
ADD COLUMN "skuName" TEXT,
ADD COLUMN "skuLanguage" TEXT,
ADD COLUMN "openedAt" TIMESTAMP(3),
ADD COLUMN "purchasePriceCents" INTEGER,
ADD COLUMN "purchasedAt" TIMESTAMP(3);

-- Legacy prints are cards (honest backfill — games/books stay `object`).
UPDATE "Item"
SET "kind" = 'card'
WHERE "printKey" IS NOT NULL AND TRIM("printKey") <> '';

-- CreateTable
CREATE TABLE "ItemContainmentLink" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "role" "ContainmentRole" NOT NULL,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemContainmentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Item_kind_idx" ON "Item"("kind");

-- CreateIndex
CREATE INDEX "Item_skuKey_idx" ON "Item"("skuKey");

-- CreateIndex
CREATE INDEX "Item_openedAt_idx" ON "Item"("openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ItemContainmentLink_parentId_childId_key" ON "ItemContainmentLink"("parentId", "childId");

-- CreateIndex
CREATE INDEX "ItemContainmentLink_parentId_role_idx" ON "ItemContainmentLink"("parentId", "role");

-- CreateIndex
CREATE INDEX "ItemContainmentLink_childId_idx" ON "ItemContainmentLink"("childId");

-- CreateIndex
CREATE INDEX "ItemContainmentLink_eventId_idx" ON "ItemContainmentLink"("eventId");

-- AddForeignKey
ALTER TABLE "ItemContainmentLink" ADD CONSTRAINT "ItemContainmentLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemContainmentLink" ADD CONSTRAINT "ItemContainmentLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
