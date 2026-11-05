-- Learned provider successes at catalogue scope (item win → corpus affinity).
CREATE TABLE "ProviderAffinity" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAffinity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderAffinity_scopeKey_capability_providerId_key" ON "ProviderAffinity"("scopeKey", "capability", "providerId");

CREATE INDEX "ProviderAffinity_scopeKey_capability_successCount_idx" ON "ProviderAffinity"("scopeKey", "capability", "successCount");

CREATE INDEX "ProviderAffinity_providerId_capability_idx" ON "ProviderAffinity"("providerId", "capability");
