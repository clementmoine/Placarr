-- CreateEnum
CREATE TYPE "GradeStatus" AS ENUM ('raw', 'submitted', 'graded');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "gradeStatus" "GradeStatus" NOT NULL DEFAULT 'raw',
ADD COLUMN "gradeHouse" TEXT,
ADD COLUMN "gradeLabel" TEXT,
ADD COLUMN "gradeCertNo" TEXT,
ADD COLUMN "gradedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Item_gradeStatus_idx" ON "Item"("gradeStatus");
CREATE INDEX "Item_gradeHouse_idx" ON "Item"("gradeHouse");
