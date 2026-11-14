-- AlterTable
ALTER TABLE "Item" ADD COLUMN "loanedTo" TEXT,
ADD COLUMN "loanedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Item_loanedTo_idx" ON "Item"("loanedTo");

-- DropTable
DROP TABLE IF EXISTS "LoanRequest";
