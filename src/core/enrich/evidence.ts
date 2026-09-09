import type { Prisma } from "@/generated/prisma/browser";

import { prisma } from "@/lib/db/prisma";
import { providerIdForSourceToken } from "@/core/catalog/catalog";
import {
  normalizeLegacyPriceOffer,
  needsLegacyPriceOfferNormalization,
} from "@/core/commerce/pricing/normalizeLegacyPriceOffer";

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
  /** Catalog / printKey match — skip marketplace title filters on persist. */
  metadataScoped?: boolean;
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
      rawValue: item.rawValue as Prisma.InputJsonValue,
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

/**
 * Incoming sources fully replace their own prior rows; sources absent from this
 * refresh are preserved. Prevents a marketplace-only enrich from wiping catalog
 * evidence (covers, titles, external links) gathered earlier.
 */
export function mergeFieldEvidenceForStorage(
  existing: readonly FieldEvidenceInput[],
  incoming: readonly FieldEvidenceInput[],
): FieldEvidenceInput[] {
  if (existing.length === 0) return [...incoming];
  if (incoming.length === 0) return [...existing];

  const incomingSources = new Set(
    incoming
      .map((entry) => providerIdForSourceToken(entry.source))
      .filter(Boolean),
  );

  const preserved = existing.filter((entry) => {
    const sourceKey = providerIdForSourceToken(entry.source);
    if (!sourceKey) return true;
    return !incomingSources.has(sourceKey);
  });

  return [...incoming, ...preserved];
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
      rawValue: offer.rawValue as Prisma.InputJsonValue,
      observedAt: offer.observedAt ?? new Date(),
    }));

  await prisma.$transaction([
    prisma.priceOffer.deleteMany({ where }),
    ...(rows.length > 0 ? [prisma.priceOffer.createMany({ data: rows })] : []),
  ]);
}

export type MergedPriceOffer = {
  source: string;
  productName: string | null;
  merchantName: string | null;
  condition: string | null;
  priceCents: number;
  currency: string;
  shippingCents: number | null;
  totalCents: number | null;
  sourceUrl: string | null;
  availability: string | null;
  offerCount: number | null;
  rawValue: unknown;
  observedAt: Date;
};

/** Persist the catalog-match flag inside rawValue (no dedicated DB column). */
export function stampMetadataScopedRawValue(
  rawValue: unknown,
  metadataScoped: boolean,
): unknown {
  if (!metadataScoped) return rawValue ?? null;
  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return { ...(rawValue as Record<string, unknown>), metadataScoped: true };
  }
  return { metadataScoped: true, value: rawValue ?? null };
}

export function metadataScopedFromRawValue(rawValue: unknown): boolean {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return false;
  }
  return (rawValue as { metadataScoped?: unknown }).metadataScoped === true;
}

const offerKey = (offer: {
  source?: string | null;
  condition?: string | null;
}) =>
  `${(offer.source || "").toLowerCase()}|${(offer.condition || "").toLowerCase()}`;

/**
 * Merge incoming offers into the offers already stored for a scope, keyed by
 * source+condition. Incoming offers overwrite their own previous value; offers
 * from a source that did NOT report this time are preserved. This guarantees a
 * partial or failed refresh (a provider that didn't answer) never deletes data
 * we already had. Returns the merged set that is now persisted.
 */
export async function mergePriceOffers(
  scope: EvidenceScope,
  offers: PriceOfferInput[],
): Promise<MergedPriceOffer[]> {
  if (!hasScope(scope)) return [];

  const where = scopeWhere(scope);
  const existing = await prisma.priceOffer.findMany({ where });

  const byKey = new Map<string, MergedPriceOffer>();
  for (const offer of existing) {
    const normalized = normalizeLegacyPriceOffer(offer);
    byKey.set(offerKey(normalized), {
      source: normalized.source,
      productName: normalized.productName,
      merchantName: normalized.merchantName,
      condition: normalized.condition,
      priceCents: normalized.priceCents,
      currency: normalized.currency,
      shippingCents: normalized.shippingCents,
      totalCents: normalized.totalCents,
      sourceUrl: normalized.sourceUrl,
      availability: normalized.availability,
      offerCount: normalized.offerCount,
      rawValue: normalized.rawValue,
      observedAt: normalized.observedAt,
    });
  }
  for (const offer of offers) {
    if (
      !offer.source ||
      !Number.isInteger(offer.priceCents) ||
      offer.priceCents <= 0
    ) {
      continue;
    }
    const normalized = normalizeLegacyPriceOffer(offer);
    const rawValue = stampMetadataScopedRawValue(
      normalized.rawValue ?? offer.rawValue ?? null,
      offer.metadataScoped === true,
    );
    byKey.set(offerKey(normalized), {
      source: normalized.source,
      productName: normalized.productName ?? null,
      merchantName: normalized.merchantName ?? null,
      condition: normalized.condition ?? null,
      priceCents: normalized.priceCents,
      currency: normalized.currency ?? "EUR",
      shippingCents: normalized.shippingCents ?? null,
      totalCents: normalized.totalCents ?? null,
      sourceUrl: normalized.sourceUrl ?? null,
      availability: normalized.availability ?? null,
      offerCount: normalized.offerCount ?? null,
      rawValue,
      observedAt: normalized.observedAt ?? new Date(),
    });
  }

  const merged = Array.from(byKey.values());
  const rows = merged.map((offer) => ({
    ...where,
    ...offer,
    rawValue: offer.rawValue as Prisma.InputJsonValue,
  }));

  await prisma.$transaction([
    prisma.priceOffer.deleteMany({ where }),
    ...(rows.length > 0 ? [prisma.priceOffer.createMany({ data: rows })] : []),
  ]);

  return merged;
}

/** Rewrites stale PicClick rows to eBay the next time offers are merged or repaired. */
export async function reconcileLegacyPriceOfferSources(
  scope: EvidenceScope,
): Promise<void> {
  if (!hasScope(scope)) return;
  const existing = await prisma.priceOffer.findMany({
    where: scopeWhere(scope),
  });
  if (!existing.some(needsLegacyPriceOfferNormalization)) return;
  await mergePriceOffers(scope, []);
}
