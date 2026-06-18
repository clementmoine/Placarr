import { prisma } from "@/lib/prisma";

type EvidenceScope = {
  itemId?: string | null;
  metadataId?: string | null;
  barcodeCacheId?: number | null;
};

export type FieldEvidenceInput = {
  field: string;
  source: string;
  value: string;
  normalizedValue?: string | null;
  rawValue?: unknown;
  confidence?: number | null;
  priority?: number | null;
  sourceUrl?: string | null;
  locale?: string | null;
  region?: string | null;
  observedAt?: Date;
};

export type PriceOfferInput = {
  source: string;
  productName?: string | null;
  merchantName?: string | null;
  condition?: string | null;
  priceCents: number;
  currency?: string | null;
  shippingCents?: number | null;
  totalCents?: number | null;
  sourceUrl?: string | null;
  availability?: string | null;
  offerCount?: number | null;
  rawValue?: unknown;
  observedAt?: Date;
};

function scopeWhere(scope: EvidenceScope) {
  return {
    ...(scope.itemId ? { itemId: scope.itemId } : {}),
    ...(scope.metadataId ? { metadataId: scope.metadataId } : {}),
    ...(scope.barcodeCacheId ? { barcodeCacheId: scope.barcodeCacheId } : {}),
  };
}

function hasScope(scope: EvidenceScope) {
  return Boolean(scope.itemId || scope.metadataId || scope.barcodeCacheId);
}

function normalizeEvidenceValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function replaceFieldEvidence(
  scope: EvidenceScope,
  evidence: FieldEvidenceInput[],
) {
  if (!hasScope(scope)) return;

  const where = scopeWhere(scope);
  const rows = evidence
    .filter((item) => item.field && item.source && item.value)
    .map((item) => ({
      ...where,
      field: item.field,
      source: item.source,
      value: item.value,
      normalizedValue:
        item.normalizedValue ?? normalizeEvidenceValue(String(item.value)),
      rawValue: item.rawValue as any,
      confidence: item.confidence ?? null,
      priority: item.priority ?? null,
      sourceUrl: item.sourceUrl ?? null,
      locale: item.locale ?? null,
      region: item.region ?? null,
      observedAt: item.observedAt ?? new Date(),
    }));

  await prisma.$transaction([
    prisma.fieldEvidence.deleteMany({ where }),
    ...(rows.length > 0
      ? [prisma.fieldEvidence.createMany({ data: rows })]
      : []),
  ]);
}

export async function replacePriceOffers(
  scope: EvidenceScope,
  offers: PriceOfferInput[],
) {
  if (!hasScope(scope)) return;

  const where = scopeWhere(scope);
  const rows = offers
    .filter(
      (offer) =>
        offer.source &&
        Number.isInteger(offer.priceCents) &&
        offer.priceCents > 0,
    )
    .map((offer) => ({
      ...where,
      source: offer.source,
      productName: offer.productName ?? null,
      merchantName: offer.merchantName ?? null,
      condition: offer.condition ?? null,
      priceCents: offer.priceCents,
      currency: offer.currency ?? "EUR",
      shippingCents: offer.shippingCents ?? null,
      totalCents: offer.totalCents ?? null,
      sourceUrl: offer.sourceUrl ?? null,
      availability: offer.availability ?? null,
      offerCount: offer.offerCount ?? null,
      rawValue: offer.rawValue as any,
      observedAt: offer.observedAt ?? new Date(),
    }));

  await prisma.$transaction([
    prisma.priceOffer.deleteMany({ where }),
    ...(rows.length > 0 ? [prisma.priceOffer.createMany({ data: rows })] : []),
  ]);
}
