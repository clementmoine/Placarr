/**
 * Price observation filter / summarize / align pipeline (no DB I/O).
 */
import {
  hasExplicitVolumeMarker,
  isLotListing,
  listingIsDistinctProductSpinoff,
  listingLooksLikeGameAccessory,
  listingLooksLikeNonBookProduct,
  normalizeForTokens,
  priceListingMatchesAnyItemName,
  priceListingVolumeConflictsWithItem,
} from "@/core/identify/titleUtils";
import { cleanSearchQuery } from "@/core/enrich/search/query";
import { detectPlatformKey } from "@/core/identify/query";
import { detectShelfGamePlatformKey } from "@/core/enrich/platform";
import { priceListingSharesItemIdentity } from "@/core/commerce/retailer/titleMatch";
import { shelfSupportsLooseCondition } from "@/core/collect/condition";
import { type PriceOfferInput } from "@/core/enrich/evidence";
import { normalizeLegacyPriceOffer } from "@/core/commerce/pricing/normalizeLegacyPriceOffer";
import {
  isReferencePriceSource,
  isBarcodeScopedPriceSource,
  isMarketplaceSearchPriceSource,
  formatProviderSourceLabel,
} from "@/core/catalog/catalog";
import { parsePriceProviderSources } from "@/core/commerce/pricing/cachePolicy";
import {
  filterObservationsByOutlierTrim,
  filterUsedPricesAboveNew,
  trimPriceOutlierCents,
} from "@/core/commerce/pricing/outlierTrim";
import type {
  BarcodePricesResult,
  CacheSummaryFields,
  PriceObservation,
  SerializedPriceObservation,
} from "@/core/commerce/pricing/priceTypes";
import {
  convertCents,
  DISPLAY_CURRENCY,
  isDisplayCurrency,
  normalizeCurrencyCode,
} from "@/lib/money/convertCurrency";
import { metadataScopedFromRawValue } from "@/core/enrich/evidence";

export function averageCents(values: number[]) {
  const trimmed = trimPriceOutlierCents(values);
  if (trimmed.length === 0) return null;
  return Math.round(
    trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length,
  );
}

export function gameUsedConditions(shelfType: string) {
  return shelfSupportsLooseCondition(shelfType) ? ["loose", "used"] : ["used"];
}

export function trustedGameUsedOffers(
  shelfType: string,
  offers: PriceObservation[],
): PriceObservation[] {
  if (!shelfSupportsLooseCondition(shelfType)) return offers;

  const usedConditions = new Set(gameUsedConditions(shelfType));
  const used = offers.filter(
    (offer) => offer.condition && usedConditions.has(offer.condition),
  );
  const hasNamedNonMarketplaceUsed = used.some(
    (offer) =>
      !isMarketplaceSearchPriceSource(offer.source ?? "") &&
      Boolean(offer.productName?.trim()),
  );
  const trusted = used.filter((offer) => {
    if (isReferencePriceSource(offer.source ?? "")) return true;
    if (isMarketplaceSearchPriceSource(offer.source ?? "")) return false;
    if (offer.productName?.trim()) return true;
    return (
      isBarcodeScopedPriceSource(offer.source ?? "") &&
      !hasNamedNonMarketplaceUsed
    );
  });
  return trusted.length > 0 ? trusted : used;
}

export function dropAccessoryListings(
  offers: PriceObservation[],
  shelfType?: string | null,
): PriceObservation[] {
  return offers.filter((offer) => {
    const listing = offer.productName?.trim();
    if (!listing) return true;
    return !listingLooksLikeGameAccessory(listing, { shelfType });
  });
}

export function trimObservedPriceOutliers(
  shelfType: string,
  offers: PriceObservation[],
): PriceObservation[] {
  let trimmed = filterObservationsByOutlierTrim(offers, ["new"]);
  // Trim loose and used separately: marketplace "used" (refurbished, warranty)
  // often sits near CIB, while reference "loose" clusters much lower. Mixing the
  // two wrongly flags a valid Back Market / eBay used hit as a high outlier.
  if (shelfSupportsLooseCondition(shelfType)) {
    trimmed = filterObservationsByOutlierTrim(trimmed, ["loose"]);
    trimmed = filterObservationsByOutlierTrim(trimmed, ["used"]);
    trimmed = filterObservationsByOutlierTrim(trimmed, ["cib"]);
  } else {
    trimmed = filterObservationsByOutlierTrim(trimmed, ["used"]);
  }
  return filterUsedPricesAboveNew(trimmed, shelfType, isReferencePriceSource);
}

/** Unnamed shop rows are kept only when no titled listing matched. */
export function dropUnnamedMarketplaceNoise(
  offers: PriceObservation[],
  options: { strictReferenceOnly?: boolean } = {},
): PriceObservation[] {
  const namedMatches = offers.filter((offer) => offer.productName?.trim());
  if (namedMatches.length === 0) {
    if (!options.strictReferenceOnly) return offers;
    return offers.filter((offer) => isReferencePriceSource(offer.source ?? ""));
  }

  const namedMarketplace = namedMatches.filter(
    (offer) => !isReferencePriceSource(offer.source ?? ""),
  );
  const onlyMarketplaceSearchNamed =
    namedMarketplace.length > 0 &&
    namedMarketplace.every((offer) =>
      isMarketplaceSearchPriceSource(offer.source ?? ""),
    );
  const hasCatalogReferenceOffer = offers.some(
    (offer) =>
      isReferencePriceSource(offer.source ?? "") &&
      offer.condition !== "estimated",
  );

  return offers.filter(
    (offer) =>
      offer.productName?.trim() ||
      isReferencePriceSource(offer.source ?? "") ||
      (isBarcodeScopedPriceSource(offer.source ?? "") &&
        onlyMarketplaceSearchNamed &&
        !hasCatalogReferenceOffer),
  );
}

export function relaxedOffersForPriceFallback(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
): PriceObservation[] {
  const platformFiltered = offers.filter((offer) =>
    priceListingMatchesShelfPlatform(shelfType, shelfName, offer.productName),
  );
  if (itemNames.length === 0) return platformFiltered;

  const numberedBook =
    shelfType === "books" &&
    itemNames.some((name) => hasExplicitVolumeMarker(name));

  return platformFiltered.filter((offer) => {
    const listing = offer.productName?.trim() ?? "";
    if (listing && isLotListing(listing)) return false;
    if (listing && listingLooksLikeNonBookProduct(listing, { shelfType })) {
      return false;
    }
    if (listing && listingLooksLikeGameAccessory(listing, { shelfType })) {
      return false;
    }

    if (!listing) {
      if (numberedBook) return false;
      return isReferencePriceSource(offer.source ?? "");
    }
    return priceListingMatchesAnyItemName(itemNames, offer.productName, {
      shelfType,
    });
  });
}

export type ItemPriceResolution = {
  summary: ReturnType<typeof summarizeObservedPrices>;
  filteredOffers: PriceObservation[];
  strictMatch: boolean;
};

/**
 * Strict title/platform filter first; when every listing title is noisy, fall
 * back to trimmed aggregates so shelf cards match item pages (which keep the
 * same summary via {@link alignBarcodePricesForItemNames}).
 */
export function resolveItemPriceFromOffers(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
): ItemPriceResolution | null {
  if (offers.length === 0) return null;

  const filtered = filterItemPriceOffers(
    shelfType,
    shelfName,
    itemNames,
    offers,
  );
  if (filtered.length > 0) {
    return {
      summary: summarizeObservedPrices(shelfType, filtered),
      filteredOffers: filtered,
      strictMatch: true,
    };
  }

  const trimmed = trimObservedPriceOutliers(
    shelfType,
    relaxedOffersForPriceFallback(shelfType, shelfName, itemNames, offers),
  );
  const summary = summarizeObservedPrices(shelfType, trimmed);
  const hasSummary =
    summary.priceNew != null ||
    summary.priceFoil != null ||
    summary.priceUsed != null ||
    summary.priceUsedCIB != null;
  if (!hasSummary) return null;

  return {
    summary,
    filteredOffers: [],
    strictMatch: false,
  };
}

export function pricesForCondition(
  offers: PriceObservation[],
  conditions: string[],
) {
  const wanted = new Set(conditions);
  return offers
    .filter((offer) => {
      const condition = effectiveGameOfferCondition(offer);
      return condition && wanted.has(condition);
    })
    .map((offer) => offer.priceCents);
}

/** Marketplace "used" rows whose title says cartridge/disc-only are true loose. */
export function listingTitleImpliesLoose(name?: string | null): boolean {
  if (!name?.trim()) return false;
  return /\b(?:loose|cartouche\s+seule|disque\s+seul|cd\s+seul|sans\s+boite|boite\s+vide|empty\s+case)\b/i.test(
    name,
  );
}

export function effectiveGameOfferCondition(
  offer: PriceObservation,
): string | undefined {
  const condition = offer.condition ?? undefined;
  if (condition === "used" && listingTitleImpliesLoose(offer.productName)) {
    return "loose";
  }
  return condition;
}

/** Offers already denominated in the app display currency (default EUR). */
export function offersInDisplayCurrency(
  offers: PriceObservation[],
): PriceObservation[] {
  return offers.filter((offer) => isDisplayCurrency(offer.currency));
}

/** Offers in a foreign currency — eligible for FX fallback only. */
export function offersInForeignCurrency(
  offers: PriceObservation[],
): PriceObservation[] {
  return offers.filter((offer) => !isDisplayCurrency(offer.currency));
}

/**
 * Average / trim consensus for observed market prices.
 *
 * Only offers in {@link DISPLAY_CURRENCY} participate. Foreign-currency rows
 * must never dilute a EUR median — convert them via
 * {@link fxFallbackEstimatedCents} when a bucket has no native observation.
 */
export function summarizeObservedPrices(
  shelfType: string,
  offers: PriceObservation[],
) {
  const native = offersInDisplayCurrency(offers);
  const usedOffers = shelfSupportsLooseCondition(shelfType)
    ? trustedGameUsedOffers(shelfType, native)
    : native;
  if (shelfSupportsLooseCondition(shelfType)) {
    // Loose = cartridge/disc/console only. Shop "used" / retail listings are
    // complete-in-box proxies and must not inflate a loose copy's observed price
    // (e.g. NetGamesRetro boxed stock vs PriceCharting loose). Titles that
    // explicitly say "Loose" are remapped above via {@link effectiveGameOfferCondition}.
    const looseCents = pricesForCondition(usedOffers, ["loose"]);
    const cibCents = [
      ...pricesForCondition(native, ["cib"]),
      ...pricesForCondition(usedOffers, ["used"]),
    ];
    return {
      priceNew: averageCents(pricesForCondition(native, ["new"])),
      priceFoil: averageCents(pricesForCondition(native, ["foil"])),
      priceUsed: averageCents(looseCents),
      priceUsedCIB: averageCents(cibCents),
    };
  }
  return {
    priceNew: averageCents(pricesForCondition(native, ["new"])),
    priceFoil: averageCents(pricesForCondition(native, ["foil"])),
    priceUsed: averageCents(pricesForCondition(usedOffers, ["used"])),
    priceUsedCIB: null,
  };
}

/**
 * When a summary bucket has no native display-currency observation, convert
 * foreign offers for that bucket into a single ~ estimate (EUR cents).
 *
 * Never mixes converted values into {@link summarizeObservedPrices}.
 * Computes non-foil (`priceEstimated`) and foil (`priceEstimatedFoil`)
 * independently so TCG finishes can pick the right ~.
 */
export async function fxFallbackEstimatedCents(
  shelfType: string,
  summary: {
    priceNew: number | null;
    priceFoil?: number | null;
    priceUsed: number | null;
    priceUsedCIB: number | null;
  },
  offers: PriceObservation[],
  options: { signal?: AbortSignal } = {},
): Promise<number | null> {
  const both = await fxFallbackEstimatedBuckets(
    shelfType,
    summary,
    offers,
    options,
  );
  return both.priceEstimated;
}

async function averageConvertedForeign(
  foreign: PriceObservation[],
  condition: string,
  options: { signal?: AbortSignal } = {},
): Promise<number | null> {
  const candidates = foreign.filter((offer) => {
    const effective = effectiveGameOfferCondition(offer);
    return effective === condition;
  });
  if (candidates.length === 0) return null;

  const converted: number[] = [];
  for (const offer of candidates) {
    const cents = await convertCents(
      offer.priceCents,
      normalizeCurrencyCode(offer.currency),
      DISPLAY_CURRENCY,
      options,
    );
    if (cents != null) converted.push(cents);
  }
  return averageCents(converted);
}

export async function fxFallbackEstimatedBuckets(
  shelfType: string,
  summary: {
    priceNew: number | null;
    priceFoil?: number | null;
    priceUsed: number | null;
    priceUsedCIB: number | null;
  },
  offers: PriceObservation[],
  options: { signal?: AbortSignal } = {},
): Promise<{
  priceEstimated: number | null;
  priceEstimatedFoil: number | null;
}> {
  const foreign = offersInForeignCurrency(offers);
  if (foreign.length === 0) {
    return { priceEstimated: null, priceEstimatedFoil: null };
  }

  let priceEstimated: number | null = null;
  let priceEstimatedFoil: number | null = null;

  if (summary.priceNew == null) {
    // Prefer foreign `new` alone; foil-only cards fall through to foil FX below
    // so a common-card estimate is not inflated by Enchanted foil rows.
    priceEstimated = await averageConvertedForeign(foreign, "new", options);
  }

  if (summary.priceFoil == null) {
    priceEstimatedFoil = await averageConvertedForeign(
      foreign,
      "foil",
      options,
    );
  }

  // Sole foil market (Enchanted etc.): surface as the default ~ when no new.
  if (priceEstimated == null && summary.priceNew == null) {
    priceEstimated = priceEstimatedFoil;
  }

  if (
    priceEstimated == null &&
    summary.priceUsed == null &&
    summary.priceUsedCIB == null
  ) {
    const usedConditions = shelfSupportsLooseCondition(shelfType)
      ? ["loose", "used", "cib"]
      : ["used"];
    for (const condition of usedConditions) {
      const average = await averageConvertedForeign(
        foreign,
        condition,
        options,
      );
      if (average != null) {
        priceEstimated = average;
        break;
      }
    }
  }

  return { priceEstimated, priceEstimatedFoil };
}

/**
 * Attach FX ~ fallback onto a barcode/item price result when native buckets
 * are empty. Preserves an existing `priceEstimated` (catalog cote) when set.
 */
export async function withFxPriceEstimated(
  result: BarcodePricesResult,
  offers: PriceObservation[],
  shelfType: string,
  options: { signal?: AbortSignal } = {},
): Promise<BarcodePricesResult> {
  const keepEstimated = result.priceEstimated != null;
  const keepFoilEstimated = result.priceEstimatedFoil != null;
  if (keepEstimated && keepFoilEstimated) return result;

  const buckets = await fxFallbackEstimatedBuckets(
    shelfType,
    {
      priceNew: result.priceNew,
      priceFoil: result.priceFoil ?? null,
      priceUsed: result.priceUsed,
      priceUsedCIB: result.priceUsedCIB,
    },
    offers,
    options,
  );

  return {
    ...result,
    priceEstimated: keepEstimated
      ? result.priceEstimated
      : (buckets.priceEstimated ?? result.priceEstimated ?? null),
    priceEstimatedFoil: keepFoilEstimated
      ? result.priceEstimatedFoil
      : (buckets.priceEstimatedFoil ?? result.priceEstimatedFoil ?? null),
  };
}

export function priceSourcesFromOffers(
  offers: PriceObservation[],
  fallbackProvider?: string | null,
) {
  return Array.from(
    new Set([
      ...offers.map((offer) => offer.source).filter(Boolean),
      ...parsePriceProviderSources(fallbackProvider),
    ]),
  );
}

export function serializePriceOffers(offers: PriceObservation[]) {
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

export function withPriceSourceTraits(
  result: Omit<
    BarcodePricesResult,
    "isReferencePriceOnly" | "priceSourceDisplayNames"
  >,
): BarcodePricesResult {
  const sources = result.priceSources;
  return {
    ...result,
    priceSourceDisplayNames: sources.map(formatProviderSourceLabel),
    isReferencePriceOnly:
      sources.length === 1 && isReferencePriceSource(sources[0] ?? ""),
  };
}

export function emptyBarcodePrices(): BarcodePricesResult {
  return withPriceSourceTraits({
    priceNew: null,
    priceFoil: null,
    priceUsed: null,
    priceUsedCIB: null,
    priceLastUpdated: null,
    priceSources: [],
    priceObservations: [],
  });
}

export function priceListingMatchesShelfPlatform(
  shelfType: string,
  shelfName: string | null | undefined,
  productName?: string | null,
): boolean {
  if (shelfType !== "games" || !shelfName?.trim() || !productName?.trim()) {
    return true;
  }
  const shelfPlatform = detectShelfGamePlatformKey(shelfName);
  if (!shelfPlatform) return true;
  const listingPlatform = detectPlatformKey(productName);
  if (!listingPlatform) return true;
  return listingPlatform === shelfPlatform;
}

/** Drops listings that share item identity tokens but fail title alignment. */
export function dropIdentityConflictingListings(
  names: string[],
  offers: PriceObservation[],
  shelfType?: string | null,
): PriceObservation[] {
  return offers.filter((offer) => {
    if (offer.metadataScoped) return true;
    const listing = offer.productName?.trim();
    if (!listing) return true;
    const sharesIdentity = names.some((name) =>
      priceListingSharesItemIdentity(name, listing, { shelfType }),
    );
    if (!sharesIdentity) return true;
    return (
      priceListingMatchesAnyItemName(names, listing, { shelfType }) ||
      referenceOfferSurvivesRegionalTitleMiss(names, offer, shelfType)
    );
  });
}

export function productNameFromPriceOfferInput(
  offer: PriceOfferInput,
): string | null {
  const direct = offer.productName?.trim();
  if (direct) return direct;
  const raw = offer.rawValue;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  for (const key of ["productName", "title", "name"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function priceOfferPersistKey(offer: {
  source: string;
  condition?: string | null;
  priceCents: number;
  sourceUrl?: string | null;
  productName?: string | null;
}): string {
  return [
    offer.source,
    offer.condition ?? "",
    offer.priceCents,
    offer.sourceUrl ?? "",
    offer.productName ?? "",
  ].join("\0");
}

/**
 * Drop identity-mismatched listings before merge so wrong prices never land
 * in DB (display filter alone used to hide them only at read time).
 */
export function filterPriceOfferInputsForPersist(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceOfferInput[],
): PriceOfferInput[] {
  const names = itemNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return offers;

  const observations: PriceObservation[] = offers.map((offer) => ({
    source: offer.source,
    productName: productNameFromPriceOfferInput(offer),
    merchantName: offer.merchantName,
    condition: offer.condition,
    priceCents: offer.priceCents,
    currency: offer.currency,
    sourceUrl: offer.sourceUrl,
    offerCount: offer.offerCount,
    observedAt: offer.observedAt,
    metadataScoped: offer.metadataScoped,
  }));

  const kept = new Set(
    filterItemPriceOffers(shelfType, shelfName, names, observations).map(
      priceOfferPersistKey,
    ),
  );

  return offers.filter((offer) =>
    kept.has(
      priceOfferPersistKey({
        source: offer.source,
        condition: offer.condition,
        priceCents: offer.priceCents,
        sourceUrl: offer.sourceUrl,
        productName: productNameFromPriceOfferInput(offer),
      }),
    ),
  );
}

export function filterItemPriceOffers(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
): PriceObservation[] {
  const enrichedOffers = offers.map((offer) => {
    const normalized = normalizeLegacyPriceOffer(offer);
    return {
      ...offer,
      source: normalized.source ?? offer.source,
      productName: normalized.productName ?? offer.productName,
      sourceUrl: normalized.sourceUrl ?? offer.sourceUrl,
    };
  });
  const names = [
    ...new Set(itemNames.map((name) => name.trim()).filter(Boolean)),
  ];
  const accessoryFiltered = dropAccessoryListings(enrichedOffers, shelfType);
  const identityFiltered =
    names.length === 0
      ? accessoryFiltered
      : dropIdentityConflictingListings(names, accessoryFiltered, shelfType);
  const hadIdentityConflicts =
    names.length > 0 && identityFiltered.length < accessoryFiltered.length;

  const platformFiltered = identityFiltered.filter((offer) =>
    priceListingMatchesShelfPlatform(shelfType, shelfName, offer.productName),
  );

  const titleFiltered =
    names.length === 0
      ? platformFiltered
      : platformFiltered.filter(
          (offer) =>
            offer.metadataScoped ||
            priceListingMatchesAnyItemName(names, offer.productName, {
              shelfType,
            }) ||
            referenceOfferSurvivesRegionalTitleMiss(names, offer, shelfType),
        );

  if (names.length > 0) {
    const titleMatchedInInput = identityFiltered.some(
      (offer) =>
        offer.productName?.trim() &&
        priceListingMatchesAnyItemName(names, offer.productName, {
          shelfType,
        }),
    );
    const titleAndPlatformMatched = identityFiltered.some(
      (offer) =>
        offer.productName?.trim() &&
        priceListingMatchesAnyItemName(names, offer.productName, {
          shelfType,
        }) &&
        priceListingMatchesShelfPlatform(
          shelfType,
          shelfName,
          offer.productName,
        ),
    );
    if (titleMatchedInInput && !titleAndPlatformMatched) {
      const barcodeFallback = trimObservedPriceOutliers(
        shelfType,
        platformFiltered.filter(
          (offer) =>
            isBarcodeScopedPriceSource(offer.source ?? "") ||
            isReferencePriceSource(offer.source ?? ""),
        ),
      );
      if (barcodeFallback.length > 0) return barcodeFallback;
      return trimObservedPriceOutliers(shelfType, []);
    }
  }

  const baseOffers = names.length === 0 ? platformFiltered : titleFiltered;

  return trimObservedPriceOutliers(
    shelfType,
    dropUnnamedMarketplaceNoise(baseOffers, {
      strictReferenceOnly: hadIdentityConflicts && shelfType === "games",
    }),
  );
}

export function observationsFromFilteredOffers(
  sourceObservations: SerializedPriceObservation[],
  filtered: PriceObservation[],
) {
  return sourceObservations.filter((offer) =>
    filtered.some(
      (row) =>
        row.source === offer.source &&
        row.condition === offer.condition &&
        row.priceCents === offer.priceCents &&
        row.productName === offer.productName,
    ),
  );
}

/**
 * Drops marketplace rows whose product title does not match any known item name.
 * Keeps barcode-scoped aggregate prices when every listing title is noisy (e.g.
 * EN marketplace copy vs a FR shelf title) so the item page stays aligned with
 * the shelf card, which reads the same cache without this filter.
 */
export function alignBarcodePricesForItemNames(
  shelfType: string,
  itemNames: string[],
  prices: BarcodePricesResult,
  shelfName?: string | null,
): BarcodePricesResult {
  const names = [
    ...new Set(itemNames.map((name) => name.trim()).filter(Boolean)),
  ];
  if (names.length === 0 || prices.priceObservations.length === 0) {
    return prices;
  }

  const sourceOffers: PriceObservation[] = prices.priceObservations.map(
    (offer) => ({
      source: offer.source,
      productName: offer.productName,
      merchantName: offer.merchantName,
      condition: offer.condition ?? undefined,
      priceCents: offer.priceCents,
      currency: offer.currency ?? undefined,
      sourceUrl: offer.sourceUrl,
      offerCount: offer.offerCount,
      observedAt: offer.observedAt,
      metadataScoped: offer.metadataScoped === true,
    }),
  );
  const filtered = filterItemPriceOffers(
    shelfType,
    shelfName,
    names,
    sourceOffers,
  );

  if (filtered.length === 0) {
    const namedOffers = sourceOffers.filter((offer) =>
      offer.productName?.trim(),
    );
    if (namedOffers.length > 0) {
      if (
        namedOffers.every(
          (offer) =>
            isLotListing(offer.productName!) ||
            listingLooksLikeNonBookProduct(offer.productName!, {
              shelfType,
            }),
        )
      ) {
        return emptyBarcodePrices();
      }
      if (
        namedOffers.every((offer) =>
          priceListingVolumeConflictsWithItem(names, offer.productName),
        )
      ) {
        return emptyBarcodePrices();
      }

      const titleMatchedOffers = namedOffers.filter((offer) =>
        priceListingMatchesAnyItemName(names, offer.productName, {
          shelfType,
        }),
      );
      if (titleMatchedOffers.length > 0) {
        const platformMatchedOffers = titleMatchedOffers.filter((offer) =>
          priceListingMatchesShelfPlatform(
            shelfType,
            shelfName,
            offer.productName,
          ),
        );
        if (platformMatchedOffers.length === 0) {
          return emptyBarcodePrices();
        }
      } else if (priceSummaryMatchesOffers(shelfType, prices, namedOffers)) {
        // FR primary vs EN PriceCharting title: keep reference aggregates when
        // the catalog still shares the franchise family (not a spinoff / bare stem).
        if (
          shouldKeepReferencePricesOnTitleMiss(names, namedOffers, shelfType)
        ) {
          const referenceOffers = namedOffers.filter((offer) =>
            isReferencePriceSource(offer.source ?? ""),
          );
          return {
            ...prices,
            priceObservations: observationsFromFilteredOffers(
              prices.priceObservations,
              referenceOffers,
            ),
          };
        }
        return emptyBarcodePrices();
      } else if (
        namedOffers.every((offer) =>
          isReferencePriceSource(offer.source ?? ""),
        ) &&
        !shouldKeepReferencePricesOnTitleMiss(names, namedOffers, shelfType)
      ) {
        // Wrong catalog fiche (generic Slim vs Pink) whose cents no longer
        // equal the mixed barcode summary — still drop the contradicted
        // reference, do not keep orphan aggregates.
        return emptyBarcodePrices();
      }
    }

    const hasSummary =
      prices.priceNew != null ||
      prices.priceFoil != null ||
      prices.priceUsed != null ||
      prices.priceUsedCIB != null;
    // Keep FX / catalog ~ estimates even when every named listing title misses
    // the FR item name (Lorcast EN titles vs French Lorcana prints).
    if (
      !hasSummary &&
      prices.priceEstimated == null &&
      prices.priceEstimatedFoil == null
    ) {
      return emptyBarcodePrices();
    }
    return {
      ...prices,
      priceObservations:
        prices.priceEstimated != null || prices.priceEstimatedFoil != null
          ? prices.priceObservations
          : [],
    };
  }

  const summary = summarizeObservedPrices(shelfType, filtered);

  return withPriceSourceTraits({
    priceNew: summary.priceNew,
    priceFoil: summary.priceFoil,
    priceUsed: summary.priceUsed,
    priceUsedCIB: summary.priceUsedCIB,
    // Native EUR summary empty → keep the FX / catalog ~ estimate from cache.
    priceEstimated:
      summary.priceNew == null &&
      summary.priceUsed == null &&
      summary.priceUsedCIB == null
        ? (prices.priceEstimated ?? null)
        : null,
    priceEstimatedFoil:
      summary.priceFoil == null ? (prices.priceEstimatedFoil ?? null) : null,
    priceLastUpdated: prices.priceLastUpdated,
    priceSources: priceSourcesFromOffers(filtered),
    priceObservations: observationsFromFilteredOffers(
      prices.priceObservations,
      filtered,
    ),
  });
}

export function significantTitleTokens(value: string): string[] {
  return (
    normalizeForTokens(cleanSearchQuery(value) || value)
      .replace(/[:;|/]/g, " ")
      // Match product-compare: Spider-Man ↔ Spiderman.
      .replace(/-/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((token) => token.length >= 3)
  );
}

export function listingIsBareFranchiseStemOf(
  itemName: string,
  listing: string,
): boolean {
  const itemTokens = significantTitleTokens(itemName);
  const listingTokens = significantTitleTokens(listing);
  if (listingTokens.length < 2 || itemTokens.length <= listingTokens.length) {
    return false;
  }
  return listingTokens.every((token, index) => itemTokens[index] === token);
}

export function listingSharesFranchiseFamily(
  itemNames: string[],
  listing: string,
): boolean {
  const listingTokens = new Set(significantTitleTokens(listing));
  return itemNames.some((name) => {
    const shared = significantTitleTokens(name).filter((token) =>
      listingTokens.has(token),
    );
    return shared.length >= 2;
  });
}

/**
 * Keep PriceCharting (reference) aggregates when primary FR titles fail a hard
 * match against an EN catalog page that still names the same franchise family.
 */
export function shouldKeepReferencePricesOnTitleMiss(
  itemNames: string[],
  namedOffers: PriceObservation[],
  shelfType?: string | null,
): boolean {
  if (namedOffers.length === 0) return false;
  if (
    !namedOffers.every((offer) => isReferencePriceSource(offer.source ?? ""))
  ) {
    return false;
  }
  return namedOffers.every((offer) =>
    referenceOfferSurvivesRegionalTitleMiss(itemNames, offer, shelfType),
  );
}

export function referenceOfferSurvivesRegionalTitleMiss(
  itemNames: string[],
  offer: PriceObservation,
  shelfType?: string | null,
): boolean {
  if (!isReferencePriceSource(offer.source ?? "")) return false;
  const listing = offer.productName?.trim();
  if (!listing) return true;
  if (
    itemNames.some((name) => listingIsDistinctProductSpinoff(name, listing))
  ) {
    return false;
  }
  if (itemNames.some((name) => listingIsBareFranchiseStemOf(name, listing))) {
    return false;
  }
  if (listingSharesFranchiseFamily(itemNames, listing)) return true;
  // TCG identity is printKey (set/number), not the localized title. EN catalog
  // names often share zero tokens with the FR print ("Ce rêve bleu" vs
  // "A Whole New World"). metadataScoped marks printKey-matched offers;
  // legacy Lorcast rows without the stamp still trust the reference source.
  if (shelfType === "tcg") return true;
  return false;
}

export function cleanBarcodeValue(barcode?: string | null): string {
  return barcode ? barcode.replace(/[^\d]/g, "").trim() : "";
}

export function toPriceObservations(
  offers: Array<{
    source: string;
    productName?: string | null;
    merchantName?: string | null;
    condition?: string | null;
    priceCents: number;
    currency?: string | null;
    sourceUrl?: string | null;
    offerCount?: number | null;
    observedAt?: Date | string | null;
    rawValue?: unknown;
    metadataScoped?: boolean;
  }>,
): PriceObservation[] {
  return offers.map((offer) => {
    const normalized = normalizeLegacyPriceOffer(offer);
    return {
      source: normalized.source,
      productName: normalized.productName,
      merchantName: normalized.merchantName,
      condition: normalized.condition,
      priceCents: normalized.priceCents,
      currency: normalized.currency,
      sourceUrl: normalized.sourceUrl,
      offerCount: normalized.offerCount,
      observedAt: normalized.observedAt,
      metadataScoped:
        offer.metadataScoped === true ||
        metadataScopedFromRawValue(offer.rawValue),
    };
  });
}

export function priceLastUpdatedFromOffers(
  offers: PriceObservation[],
  fallback: Date | null = null,
): Date | null {
  const first = offers[0]?.observedAt;
  if (!first) return fallback;
  return first instanceof Date ? first : new Date(first);
}

export function observedSummaryFromAlignedOffers(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
) {
  if (offers.length === 0) return null;
  if (itemNames.length === 0) {
    return summarizeObservedPrices(shelfType, offers);
  }

  const aligned = filterItemPriceOffers(
    shelfType,
    shelfName,
    itemNames,
    offers,
  );
  if (aligned.length === 0) return null;
  return summarizeObservedPrices(shelfType, aligned);
}

export function priceSummaryMatchesOffers(
  shelfType: string,
  summary: Pick<CacheSummaryFields, "priceNew" | "priceUsed" | "priceUsedCIB">,
  offers: PriceObservation[],
): boolean {
  if (offers.length === 0) return false;
  const fromOffers = summarizeObservedPrices(shelfType, offers);
  return (
    (summary.priceNew ?? null) === (fromOffers.priceNew ?? null) &&
    (summary.priceUsed ?? null) === (fromOffers.priceUsed ?? null) &&
    (summary.priceUsedCIB ?? null) === (fromOffers.priceUsedCIB ?? null)
  );
}

/**
 * Single price resolution path for shelf cards and item pages: strict filter,
 * relaxed fallback, then align with cache / unfiltered offer aggregates (same
 * as {@link alignBarcodePricesForItemNames} after a fresh provider refresh).
 */
export function resolveItemDisplayPrices(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
  cacheSummary: CacheSummaryFields | null,
): BarcodePricesResult | null {
  const observedSummary = observedSummaryFromAlignedOffers(
    shelfType,
    shelfName,
    itemNames,
    offers,
  );
  const summaryInput: CacheSummaryFields = {
    priceNew: cacheSummary?.priceNew ?? observedSummary?.priceNew ?? null,
    priceUsed: cacheSummary?.priceUsed ?? observedSummary?.priceUsed ?? null,
    priceUsedCIB:
      cacheSummary?.priceUsedCIB ?? observedSummary?.priceUsedCIB ?? null,
    priceLastUpdated:
      cacheSummary?.priceLastUpdated ?? priceLastUpdatedFromOffers(offers),
  };

  if (offers.length > 0) {
    const resolution = resolveItemPriceFromOffers(
      shelfType,
      shelfName,
      itemNames,
      offers,
    );
    if (resolution) {
      const serialized = serializePriceOffers(offers);
      const sourceOffers = resolution.strictMatch
        ? resolution.filteredOffers
        : trimObservedPriceOutliers(
            shelfType,
            relaxedOffersForPriceFallback(
              shelfType,
              shelfName,
              itemNames,
              offers,
            ),
          );

      return withPriceSourceTraits({
        priceNew: resolution.summary.priceNew,
        priceUsed: resolution.summary.priceUsed,
        priceUsedCIB: resolution.summary.priceUsedCIB,
        priceLastUpdated: priceLastUpdatedFromOffers(offers),
        priceSources: priceSourcesFromOffers(sourceOffers),
        priceObservations: resolution.strictMatch
          ? observationsFromFilteredOffers(
              serialized,
              resolution.filteredOffers,
            )
          : [],
      });
    }
  }

  const hasSummaryInput =
    summaryInput.priceNew != null ||
    summaryInput.priceFoil != null ||
    summaryInput.priceUsed != null ||
    summaryInput.priceUsedCIB != null;
  if (!hasSummaryInput && offers.length === 0) return null;

  const aligned = alignBarcodePricesForItemNames(
    shelfType,
    itemNames,
    withPriceSourceTraits({
      priceNew: summaryInput.priceNew,
      priceFoil: summaryInput.priceFoil ?? null,
      priceUsed: summaryInput.priceUsed,
      priceUsedCIB: summaryInput.priceUsedCIB,
      priceLastUpdated: summaryInput.priceLastUpdated,
      priceSources: priceSourcesFromOffers(offers),
      priceObservations: serializePriceOffers(offers),
    }),
    shelfName,
  );

  if (
    aligned.priceNew == null &&
    aligned.priceUsed == null &&
    aligned.priceUsedCIB == null
  ) {
    return null;
  }

  return aligned;
}
