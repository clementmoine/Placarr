-- CreateTable
CREATE TABLE "FieldEvidence" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT,
    "rawValue" JSONB,
    "confidence" DOUBLE PRECISION,
    "priority" INTEGER,
    "sourceUrl" TEXT,
    "locale" TEXT,
    "region" TEXT,
    "itemId" TEXT,
    "metadataId" TEXT,
    "barcodeCacheId" INTEGER,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceOffer" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "productName" TEXT,
    "merchantName" TEXT,
    "condition" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "shippingCents" INTEGER,
    "totalCents" INTEGER,
    "sourceUrl" TEXT,
    "availability" TEXT,
    "offerCount" INTEGER,
    "rawValue" JSONB,
    "itemId" TEXT,
    "metadataId" TEXT,
    "barcodeCacheId" INTEGER,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldEvidence_field_idx" ON "FieldEvidence"("field");

-- CreateIndex
CREATE INDEX "FieldEvidence_source_idx" ON "FieldEvidence"("source");

-- CreateIndex
CREATE INDEX "FieldEvidence_itemId_field_idx" ON "FieldEvidence"("itemId", "field");

-- CreateIndex
CREATE INDEX "FieldEvidence_metadataId_field_idx" ON "FieldEvidence"("metadataId", "field");

-- CreateIndex
CREATE INDEX "FieldEvidence_barcodeCacheId_field_idx" ON "FieldEvidence"("barcodeCacheId", "field");

-- CreateIndex
CREATE INDEX "FieldEvidence_observedAt_idx" ON "FieldEvidence"("observedAt");

-- CreateIndex
CREATE INDEX "PriceOffer_source_idx" ON "PriceOffer"("source");

-- CreateIndex
CREATE INDEX "PriceOffer_itemId_source_idx" ON "PriceOffer"("itemId", "source");

-- CreateIndex
CREATE INDEX "PriceOffer_metadataId_source_idx" ON "PriceOffer"("metadataId", "source");

-- CreateIndex
CREATE INDEX "PriceOffer_barcodeCacheId_source_idx" ON "PriceOffer"("barcodeCacheId", "source");

-- CreateIndex
CREATE INDEX "PriceOffer_condition_priceCents_idx" ON "PriceOffer"("condition", "priceCents");

-- CreateIndex
CREATE INDEX "PriceOffer_observedAt_idx" ON "PriceOffer"("observedAt");

-- AddForeignKey
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_metadataId_fkey" FOREIGN KEY ("metadataId") REFERENCES "Metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_barcodeCacheId_fkey" FOREIGN KEY ("barcodeCacheId") REFERENCES "BarcodeCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceOffer" ADD CONSTRAINT "PriceOffer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceOffer" ADD CONSTRAINT "PriceOffer_metadataId_fkey" FOREIGN KEY ("metadataId") REFERENCES "Metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceOffer" ADD CONSTRAINT "PriceOffer_barcodeCacheId_fkey" FOREIGN KEY ("barcodeCacheId") REFERENCES "BarcodeCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;
