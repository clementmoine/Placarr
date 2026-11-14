-- Admin-confirm queue: shelf item → corpus promote candidates.
CREATE TABLE "CorpusPromoteCandidate" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "dataPack" TEXT,
    "printKey" TEXT,
    "barcode" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorpusPromoteCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CorpusPromoteCandidate_status_createdAt_idx" ON "CorpusPromoteCandidate"("status", "createdAt");

CREATE INDEX "CorpusPromoteCandidate_itemId_idx" ON "CorpusPromoteCandidate"("itemId");

CREATE INDEX "CorpusPromoteCandidate_printKey_idx" ON "CorpusPromoteCandidate"("printKey");

CREATE INDEX "CorpusPromoteCandidate_barcode_idx" ON "CorpusPromoteCandidate"("barcode");
