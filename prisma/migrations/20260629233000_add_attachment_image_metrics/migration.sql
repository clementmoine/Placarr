-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "width" INTEGER;
ALTER TABLE "Attachment" ADD COLUMN "height" INTEGER;
ALTER TABLE "Attachment" ADD COLUMN "meanLuminance" DOUBLE PRECISION;
ALTER TABLE "Attachment" ADD COLUMN "darkPixelRatio" DOUBLE PRECISION;
