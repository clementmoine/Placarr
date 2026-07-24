-- CreateTable
CREATE TABLE "BackgroundWorkJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "itemId" TEXT,
    "userId" TEXT,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackgroundWorkJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackgroundWorkJob_status_runAfter_createdAt_idx" ON "BackgroundWorkJob"("status", "runAfter", "createdAt");

-- CreateIndex
CREATE INDEX "BackgroundWorkJob_itemId_kind_status_idx" ON "BackgroundWorkJob"("itemId", "kind", "status");

-- CreateIndex
CREATE INDEX "BackgroundWorkJob_userId_status_idx" ON "BackgroundWorkJob"("userId", "status");
