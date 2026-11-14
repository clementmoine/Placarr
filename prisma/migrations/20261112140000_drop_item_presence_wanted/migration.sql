-- Legacy « recherché » (ItemPresence.wanted) collapses into absent.
-- Historical event kind `cancelled_to_wanted` stays a free string.
UPDATE "Item" SET "presence" = 'away' WHERE "presence" = 'wanted';
UPDATE "ItemPresenceEvent" SET "fromPresence" = 'away' WHERE "fromPresence" = 'wanted';
UPDATE "ItemPresenceEvent" SET "toPresence" = 'away' WHERE "toPresence" = 'wanted';

CREATE TYPE "ItemPresence_new" AS ENUM ('owned', 'away', 'past');

ALTER TABLE "Item" ALTER COLUMN "presence" DROP DEFAULT;
ALTER TABLE "Item"
  ALTER COLUMN "presence" TYPE "ItemPresence_new"
  USING ("presence"::text::"ItemPresence_new");
ALTER TABLE "Item" ALTER COLUMN "presence" SET DEFAULT 'owned';

ALTER TABLE "ItemPresenceEvent"
  ALTER COLUMN "fromPresence" TYPE "ItemPresence_new"
  USING ("fromPresence"::text::"ItemPresence_new");
ALTER TABLE "ItemPresenceEvent"
  ALTER COLUMN "toPresence" TYPE "ItemPresence_new"
  USING ("toPresence"::text::"ItemPresence_new");

DROP TYPE "ItemPresence";
ALTER TYPE "ItemPresence_new" RENAME TO "ItemPresence";
