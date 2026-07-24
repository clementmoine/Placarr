-- Collapse fine grades: likeNew → new, fair → used.
UPDATE "Item" SET "condition" = 'new' WHERE "condition" = 'likeNew';
UPDATE "Item" SET "condition" = 'used' WHERE "condition" = 'fair';

CREATE TYPE "Condition_new" AS ENUM ('new', 'used', 'loose', 'damaged');

ALTER TABLE "Item"
  ALTER COLUMN "condition" TYPE "Condition_new"
  USING ("condition"::text::"Condition_new");

DROP TYPE "Condition";
ALTER TYPE "Condition_new" RENAME TO "Condition";
