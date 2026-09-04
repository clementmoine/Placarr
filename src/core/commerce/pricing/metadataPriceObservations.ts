import {
  formatProviderSourceLabel,
  isReferencePriceSource,
} from "@/core/catalog/catalog";
import type { MetadataFact } from "@/types/metadataProvider";

import {
  resolveItemDisplayPrices,
  type BarcodePricesResult,
  type PriceObservation,
  type SerializedPriceObservation,
} from "./resolver";

function parseEuroAmountCents(token: string): number | null {
  const amount = Number.parseFloat(token.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function parseEuroRangeCents(
  value: string,
): { minCents: number; maxCents: number } | null {
  const normalized = value.trim();

  const deRangeMatch = normalized.match(
    /de\s+(\d+(?:[.,]\d+)?)\s+à\s+(\d+(?:[.,]\d+)?)\s*(?:€|euros?)?/i,
  );
  if (deRangeMatch) {
    const minCents = parseEuroAmountCents(deRangeMatch[1]);
    const maxCents = parseEuroAmountCents(deRangeMatch[2]);
    if (minCents != null && maxCents != null && maxCents >= minCents) {
      return { minCents, maxCents };
    }
  }

  const rangeMatch = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*((?:€|euros?)?\s*)?(?:à|-|–|—)\s*(\d+(?:[.,]\d+)?)\s*(?:€|euros?)?/i,
  );
  if (!rangeMatch) return null;

  const minCents = parseEuroAmountCents(rangeMatch[1]);
  const maxCents = parseEuroAmountCents(rangeMatch[3]);
  if (minCents == null || maxCents == null || maxCents < minCents) return null;
  return { minCents, maxCents };
}

export type CatalogEstimatePricing = {
  minCents?: number;
  maxCents?: number;
  displayValue: string;
};

function isAbsentCatalogEstimateValue(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return /^non\s+cotee?$/.test(normalized);
}

/** Parses Bédéthèque-style catalog estimates (ranges, ceilings, floors). */
export function parseCatalogEstimatePricing(
  value: string,
): CatalogEstimatePricing | null {
  const displayValue = value.trim();
  if (!displayValue || isAbsentCatalogEstimateValue(displayValue)) return null;

  const range = parseEuroRangeCents(displayValue);
  if (range) {
    return { ...range, displayValue };
  }

  const moinsDeMatch = displayValue.match(
    /moins\s+de\s+(\d+(?:[.,]\d+)?)\s*(?:€|euros?)?/i,
  );
  if (moinsDeMatch) {
    const maxCents = parseEuroAmountCents(moinsDeMatch[1]);
    if (maxCents != null) return { maxCents, displayValue };
  }

  const plusDeMatch = displayValue.match(
    /plus\s+de\s+(\d+(?:[.,]\d+)?)\s*(?:€|euros?)?/i,
  );
  if (plusDeMatch) {
    const minCents = parseEuroAmountCents(plusDeMatch[1]);
    if (minCents != null) return { minCents, displayValue };
  }

  /*
    Point estimate (« 5 € », « 0,10 € ») — côtes collectionneur / quotes
    approximatives, pas seulement les fourchettes Bédéthèque.
  */
  const singleMatch = displayValue.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:€|euros?)?$/i,
  );
  if (singleMatch) {
    const cents = parseEuroAmountCents(singleMatch[1]);
    if (cents != null) {
      return { minCents: cents, maxCents: cents, displayValue };
    }
  }

  return null;
}

function parseEuroCents(value?: string | null): number | null {
  if (!value?.trim()) return null;
  if (/\s+à\s+/i.test(value)) return null;
  const match = value.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return null;
  return parseEuroAmountCents(match[1]);
}

function isCatalogEstimateFact(fact: MetadataFact): boolean {
  return (
    fact.kind === "price" && /^estimation$/i.test((fact.label ?? "").trim())
  );
}

function catalogEstimatePriceCents(estimate: CatalogEstimatePricing): number {
  const { minCents, maxCents, displayValue } = estimate;
  if (minCents != null && maxCents != null) {
    return Math.round((minCents + maxCents) / 2);
  }
  // Ceiling-only cote (« moins de 5 € ») reads as the implicit 0–max range:
  // taking the ceiling itself would inflate every common album of a shelf.
  if (maxCents != null) return Math.round(maxCents / 2);
  // Floor-only cote (« plus de 5 € ») is open-ended: the floor is the only
  // defensible point value.
  if (minCents != null) return minCents;
  return parseEuroCents(displayValue) ?? 0;
}

function conditionFromMetadataPriceFact(
  fact: MetadataFact,
): PriceObservation["condition"] {
  if (isCatalogEstimateFact(fact)) return "estimated";

  const label = `${fact.label ?? ""} ${fact.value ?? ""}`.toLowerCase();
  if (/\b(neuf|new)\b/.test(label)) return "new";
  if (/\b(occasion|used|marketplace)\b/.test(label)) return "used";
  if (fact.kind === "observed-price") return "new";
  if (fact.kind === "price") return "used";
  return "used";
}

function observationIdentityKey(observation: PriceObservation): string {
  return [
    observation.source,
    observation.condition ?? "",
    observation.productName ?? "",
    observation.priceCents,
    observation.catalogEstimateMinCents ?? "",
    observation.catalogEstimateMaxCents ?? "",
  ].join("\0");
}

export function priceObservationsFromMetadataFacts(
  facts: MetadataFact[] | undefined,
): PriceObservation[] {
  if (!facts?.length) return [];

  const observations: PriceObservation[] = [];
  const seen = new Set<string>();

  for (const fact of facts) {
    if (
      fact.kind !== "price" &&
      fact.kind !== "observed-price" &&
      fact.kind !== "estimated-value"
    ) {
      continue;
    }
    if (!fact.source?.trim() || !fact.value?.trim()) continue;

    if (isCatalogEstimateFact(fact)) {
      const estimate = parseCatalogEstimatePricing(fact.value);
      if (!estimate) continue;

      const observation: PriceObservation = {
        source: fact.source.trim(),
        productName: fact.label?.trim() || "Estimation",
        condition: "estimated",
        priceCents: catalogEstimatePriceCents(estimate),
        currency: "EUR",
        sourceUrl: fact.url,
        metadataScoped: true,
        catalogEstimateMinCents: estimate.minCents,
        catalogEstimateMaxCents: estimate.maxCents,
        catalogEstimateDisplayValue: estimate.displayValue,
      };
      const key = observationIdentityKey(observation);
      if (seen.has(key)) continue;
      seen.add(key);
      observations.push(observation);
      continue;
    }

    const cents = parseEuroCents(fact.value);
    if (cents == null) continue;

    const observation: PriceObservation = {
      source: fact.source.trim(),
      productName: fact.label?.trim() || undefined,
      condition: conditionFromMetadataPriceFact(fact),
      priceCents: cents,
      currency: "EUR",
      sourceUrl: fact.url,
      metadataScoped: true,
    };
    const key = observationIdentityKey(observation);
    if (seen.has(key)) continue;
    seen.add(key);
    observations.push(observation);
  }

  return observations.sort((a, b) => {
    const priorityDiff =
      (facts.find((fact) => fact.source === b.source)?.priority ?? 0) -
      (facts.find((fact) => fact.source === a.source)?.priority ?? 0);
    return priorityDiff;
  });
}

function observationsFromPriceResult(
  prices: BarcodePricesResult | null,
): PriceObservation[] {
  if (!prices?.priceObservations?.length) return [];

  return prices.priceObservations.map((observation) => ({
    source: observation.source,
    productName: observation.productName,
    merchantName: observation.merchantName,
    condition: observation.condition,
    priceCents: observation.priceCents,
    currency: observation.currency ?? "EUR",
    sourceUrl: observation.sourceUrl,
    offerCount: observation.offerCount,
    observedAt: observation.observedAt,
    metadataScoped: observation.metadataScoped,
    catalogEstimateMinCents: observation.catalogEstimateMinCents,
    catalogEstimateMaxCents: observation.catalogEstimateMaxCents,
    catalogEstimateDisplayValue: observation.catalogEstimateDisplayValue,
  }));
}

function dedupePriceObservations(
  observations: PriceObservation[],
): PriceObservation[] {
  const seen = new Set<string>();
  const deduped: PriceObservation[] = [];

  for (const observation of observations) {
    const key = observationIdentityKey(observation);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(observation);
  }

  return deduped;
}

function hasPriceSummary(
  prices: BarcodePricesResult | null | undefined,
): boolean {
  if (!prices) return false;
  return (
    prices.priceNew != null ||
    prices.priceUsed != null ||
    prices.priceUsedCIB != null ||
    prices.priceEstimated != null ||
    prices.priceEstimatedFoil != null
  );
}

function serializeMergedObservations(
  offers: PriceObservation[],
): SerializedPriceObservation[] {
  return offers.map((offer) => ({
    source: offer.source,
    productName: offer.productName ?? null,
    merchantName: offer.merchantName ?? null,
    condition: offer.condition ?? null,
    priceCents: offer.priceCents,
    currency: offer.currency ?? "EUR",
    sourceUrl: offer.sourceUrl ?? null,
    offerCount: offer.offerCount ?? null,
    observedAt: offer.observedAt
      ? new Date(offer.observedAt).toISOString()
      : null,
    isReferencePriceSource: isReferencePriceSource(offer.source),
    sourceDisplayLabel: formatProviderSourceLabel(offer.source),
    metadataScoped: offer.metadataScoped ?? false,
    catalogEstimateMinCents: offer.catalogEstimateMinCents,
    catalogEstimateMaxCents: offer.catalogEstimateMaxCents,
    catalogEstimateDisplayValue: offer.catalogEstimateDisplayValue,
  }));
}

function withMergedObservations(
  result: BarcodePricesResult,
  offers: PriceObservation[],
): BarcodePricesResult {
  if (result.priceObservations.length > 0) return result;

  const sources = Array.from(new Set(offers.map((offer) => offer.source)));
  return {
    ...result,
    priceSources: sources,
    priceSourceDisplayNames: sources.map(formatProviderSourceLabel),
    isReferencePriceOnly:
      sources.length === 1 && isReferencePriceSource(sources[0] ?? ""),
    priceObservations: serializeMergedObservations(offers),
  };
}

function mergeSourceLists(
  primarySources: string[],
  primaryLabels: string[],
  extraSources: string[],
  extraLabels: string[],
): { sources: string[]; labels: string[] } {
  const sources: string[] = [];
  const labels: string[] = [];
  const seen = new Set<string>();

  const add = (source: string, label: string) => {
    const key = source.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
    labels.push(label);
  };

  for (let index = 0; index < primarySources.length; index++) {
    const source = primarySources[index]!;
    add(source, primaryLabels[index] ?? formatProviderSourceLabel(source));
  }
  for (let index = 0; index < extraSources.length; index++) {
    const source = extraSources[index]!;
    add(source, extraLabels[index] ?? formatProviderSourceLabel(source));
  }

  return { sources, labels };
}

export { formatCatalogEstimateObservationRange } from "@/core/commerce/pricing/catalogEstimateDisplay";

function hasCatalogEstimateOffers(offers: PriceObservation[]): boolean {
  return offers.some(
    (offer) =>
      offer.condition === "estimated" &&
      (offer.catalogEstimateDisplayValue?.trim() ||
        offer.catalogEstimateMinCents != null ||
        offer.catalogEstimateMaxCents != null),
  );
}

/** Lowest catalog-estimate point price among the merged observations. */
export function estimatedPriceCentsFromObservations(
  offers: Pick<PriceObservation, "condition" | "priceCents">[],
): number | null {
  const cents = offers
    .filter((offer) => offer.condition === "estimated")
    .map((offer) => offer.priceCents)
    .filter((value) => Number.isFinite(value) && value > 0);
  return cents.length > 0 ? Math.min(...cents) : null;
}

function catalogEstimateOnlyResult(
  offers: PriceObservation[],
): BarcodePricesResult {
  const estimateOffers = offers.filter(
    (offer) => offer.condition === "estimated",
  );
  const sources = Array.from(
    new Set(estimateOffers.map((offer) => offer.source).filter(Boolean)),
  );

  return {
    priceNew: null,
    priceUsed: null,
    priceUsedCIB: null,
    priceEstimated: estimatedPriceCentsFromObservations(estimateOffers),
    priceLastUpdated: null,
    priceSources: sources,
    priceSourceDisplayNames: sources.map(formatProviderSourceLabel),
    isReferencePriceOnly: false,
    priceObservations: serializeMergedObservations(estimateOffers),
  };
}

export function mergeMetadataPricesIntoResult(input: {
  shelfType: string;
  shelfName: string;
  itemNames: string[];
  metadataFacts?: MetadataFact[];
  prices: BarcodePricesResult | null;
}): BarcodePricesResult | null {
  const metadataOffers = priceObservationsFromMetadataFacts(
    input.metadataFacts,
  );
  if (metadataOffers.length === 0) return input.prices;

  const mergedOffers = dedupePriceObservations([
    ...observationsFromPriceResult(input.prices),
    ...metadataOffers,
  ]);
  const priceEstimated = estimatedPriceCentsFromObservations(mergedOffers);

  if (!hasPriceSummary(input.prices)) {
    const resolved = resolveItemDisplayPrices(
      input.shelfType,
      input.shelfName,
      input.itemNames,
      mergedOffers,
      null,
    );
    if (resolved) {
      return {
        ...withMergedObservations(resolved, mergedOffers),
        priceEstimated,
      };
    }
    if (hasCatalogEstimateOffers(mergedOffers)) {
      return catalogEstimateOnlyResult(mergedOffers);
    }
    return null;
  }

  const metadataSources = Array.from(
    new Set(metadataOffers.map((offer) => offer.source)),
  );
  const metadataLabels = metadataSources.map(formatProviderSourceLabel);
  const mergedSources = mergeSourceLists(
    input.prices?.priceSources ?? [],
    input.prices?.priceSourceDisplayNames ?? [],
    metadataSources,
    metadataLabels,
  );

  // Partial barcode cache (e.g. used-only) must still pick up metadata
  // observed-price for the empty buckets — otherwise a "new" card stays blank
  // while the detail page shows the ChocoBonPlan neuf price from facts.
  const filled = fillMissingSummaryFromMetadataOffers(
    input.prices!,
    metadataOffers,
  );

  return {
    ...input.prices!,
    priceNew: filled.priceNew,
    priceUsed: filled.priceUsed,
    priceUsedCIB: filled.priceUsedCIB,
    priceEstimated,
    priceSources: mergedSources.sources,
    priceSourceDisplayNames: mergedSources.labels,
    isReferencePriceOnly: false,
    priceObservations: serializeMergedObservations(mergedOffers),
  };
}

function fillMissingSummaryFromMetadataOffers(
  prices: BarcodePricesResult,
  metadataOffers: PriceObservation[],
): Pick<BarcodePricesResult, "priceNew" | "priceUsed" | "priceUsedCIB"> {
  const minFor = (
    conditions: Array<NonNullable<PriceObservation["condition"]>>,
  ): number | null => {
    const values = metadataOffers
      .filter(
        (offer) =>
          offer.condition != null &&
          conditions.includes(offer.condition) &&
          offer.priceCents > 0,
      )
      .map((offer) => offer.priceCents);
    return values.length > 0 ? Math.min(...values) : null;
  };

  return {
    priceNew: prices.priceNew ?? minFor(["new"]),
    priceUsed: prices.priceUsed ?? minFor(["used", "loose"]),
    priceUsedCIB: prices.priceUsedCIB ?? minFor(["cib"]),
  };
}
