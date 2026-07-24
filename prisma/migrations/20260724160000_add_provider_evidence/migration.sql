-- Durable typed scrape yield shared between Next and background workers.
CREATE TABLE "ProviderEvidence" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "yieldJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderEvidence_providerId_url_key" ON "ProviderEvidence"("providerId", "url");

CREATE INDEX "ProviderEvidence_expiresAt_idx" ON "ProviderEvidence"("expiresAt");

CREATE INDEX "ProviderEvidence_providerId_kind_idx" ON "ProviderEvidence"("providerId", "kind");
