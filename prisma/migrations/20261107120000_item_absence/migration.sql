-- CreateEnum
CREATE TYPE "ItemPresence" AS ENUM ('owned', 'away', 'wanted', 'past');

-- CreateEnum
CREATE TYPE "AbsenceReason" AS ENUM (
  'loaned',
  'ordered',
  'repair',
  'rental',
  'sold',
  'exchanged',
  'gifted',
  'discarded',
  'lost',
  'stolen'
);

-- AlterTable: shelf absence fields (loanedTo/loanedAt migrated below, then dropped)
ALTER TABLE "Item" ADD COLUMN "presence" "ItemPresence" NOT NULL DEFAULT 'owned',
ADD COLUMN "absenceReason" "AbsenceReason",
ADD COLUMN "absenceSince" TIMESTAMP(3),
ADD COLUMN "absenceRecipient" TEXT,
ADD COLUMN "absenceSource" TEXT,
ADD COLUMN "absenceCarrier" TEXT,
ADD COLUMN "absenceTracking" TEXT,
ADD COLUMN "absenceOrderRef" TEXT,
ADD COLUMN "absenceOrderUrl" TEXT,
ADD COLUMN "absenceNote" TEXT,
ADD COLUMN "absencePriceCents" INTEGER,
ADD COLUMN "absenceExpectedAt" TIMESTAMP(3);

-- Migrate existing personal-loan notes → away + loaned
UPDATE "Item"
SET
  "presence" = 'away',
  "absenceReason" = 'loaned',
  "absenceRecipient" = TRIM("loanedTo"),
  "absenceSince" = COALESCE("loanedAt", CURRENT_TIMESTAMP)
WHERE "loanedTo" IS NOT NULL AND TRIM("loanedTo") <> '';

-- CreateTable
CREATE TABLE "ItemPresenceEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromPresence" "ItemPresence" NOT NULL,
    "toPresence" "ItemPresence" NOT NULL,
    "reason" "AbsenceReason",
    "kind" TEXT NOT NULL,
    "snapshot" JSONB,
    CONSTRAINT "ItemPresenceEvent_pkey" PRIMARY KEY ("id")
);

-- Seed departed events for migrated loans
INSERT INTO "ItemPresenceEvent" ("id", "itemId", "at", "fromPresence", "toPresence", "reason", "kind", "snapshot")
SELECT
  gen_random_uuid()::text,
  "id",
  COALESCE("absenceSince", CURRENT_TIMESTAMP),
  'owned',
  'away',
  'loaned',
  'departed',
  jsonb_build_object(
    'absenceRecipient', "absenceRecipient",
    'absenceSince', to_jsonb(COALESCE("absenceSince", CURRENT_TIMESTAMP))
  )
FROM "Item"
WHERE "presence" = 'away' AND "absenceReason" = 'loaned';

-- CreateTable
CREATE TABLE "ItemTradeLink" (
    "id" TEXT NOT NULL,
    "itemOutId" TEXT NOT NULL,
    "itemInId" TEXT NOT NULL,
    "note" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemTradeLink_pkey" PRIMARY KEY ("id")
);

-- DropIndex
DROP INDEX IF EXISTS "Item_loanedTo_idx";

-- AlterTable
ALTER TABLE "Item" DROP COLUMN IF EXISTS "loanedTo",
DROP COLUMN IF EXISTS "loanedAt";

-- CreateIndex
CREATE INDEX "Item_presence_idx" ON "Item"("presence");

CREATE INDEX "Item_presence_absenceReason_idx" ON "Item"("presence", "absenceReason");

CREATE INDEX "Item_absenceRecipient_idx" ON "Item"("absenceRecipient");

CREATE INDEX "ItemPresenceEvent_itemId_at_idx" ON "ItemPresenceEvent"("itemId", "at");

CREATE INDEX "ItemPresenceEvent_kind_at_idx" ON "ItemPresenceEvent"("kind", "at");

CREATE INDEX "ItemTradeLink_itemOutId_idx" ON "ItemTradeLink"("itemOutId");

CREATE INDEX "ItemTradeLink_itemInId_idx" ON "ItemTradeLink"("itemInId");

CREATE UNIQUE INDEX "ItemTradeLink_itemOutId_itemInId_key" ON "ItemTradeLink"("itemOutId", "itemInId");

-- AddForeignKey
ALTER TABLE "ItemPresenceEvent" ADD CONSTRAINT "ItemPresenceEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemTradeLink" ADD CONSTRAINT "ItemTradeLink_itemOutId_fkey" FOREIGN KEY ("itemOutId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemTradeLink" ADD CONSTRAINT "ItemTradeLink_itemInId_fkey" FOREIGN KEY ("itemInId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
