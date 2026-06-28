-- AlterTable
ALTER TABLE "BarcodeCache" ADD COLUMN "observations" JSONB;
ALTER TABLE "BarcodeCache" ADD COLUMN "observationSchemaVersion" TEXT;
