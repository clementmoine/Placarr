-- CreateTable
CREATE TABLE "UnresolvedBarcodeScan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barcode" TEXT NOT NULL,
    "shelfType" TEXT NOT NULL DEFAULT 'unknown',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "providers" TEXT,
    "rawNames" TEXT,
    "rawPayload" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UnresolvedBarcodeScan_barcode_shelfType_reason_key" ON "UnresolvedBarcodeScan"("barcode", "shelfType", "reason");

-- CreateIndex
CREATE INDEX "UnresolvedBarcodeScan_barcode_idx" ON "UnresolvedBarcodeScan"("barcode");

-- CreateIndex
CREATE INDEX "UnresolvedBarcodeScan_status_lastSeenAt_idx" ON "UnresolvedBarcodeScan"("status", "lastSeenAt");
