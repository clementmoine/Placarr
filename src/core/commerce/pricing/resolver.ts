import { prisma } from "@/lib/db/prisma";
import {
  aliasBelongsInPriceLookup,
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
import { mergePriceOffers, type PriceOfferInput } from "@/core/enrich/evidence";
import { normalizeLegacyPriceOffer } from "@/core/commerce/pricing/normalizeLegacyPriceOffer";
import type { ProviderProductUrlRef } from "@/types/providerModule";
import {
  buildMatchContext,
  toBarcodePriceRefreshContext,
} from "@/core/catalog/matchContext";
import {
  collectRefreshBarcodePriceOffers,
  priceProviderTokenFromOffers,
} from "@/core/catalog/barcodePrices";
import {
  persistProviderExternalLinksForBarcodeItems,
  persistProviderExternalLinksForMetadata,
} from "@/core/enrich/persistProviderExternalLinks";
import {
  isReferencePriceSource,
  isBarcodeScopedPriceSource,
  isMarketplaceSearchPriceSource,
  formatProviderSourceLabel,
} from "@/core/catalog/catalog";

export type PriceObservation = {
  source: string;
  productName?: string | null;
  merchantName?: string | null;
  condition?: string | null;
  priceCents: number;
  currency?: string | null;
  sourceUrl?: string | null;
  offerCount?: number | null;
  observedAt?: Date | string | null;
  /** Metadata-derived catalog price — skip marketplace listing title filters. */
  metadataScoped?: boolean;
  catalogEstimateMinCents?: number;
  catalogEstimateMaxCents?: number;
  catalogEstimateDisplayValue?: string;
};

export type SerializedPriceObservation = {
  source: string;
  productName?: string | null;
  merchantName?: string | null;
  condition?: string | null;
  priceCents: number;
  currency?: string | null;
  sourceUrl?: string | null;
  offerCount?: number | null;
  observedAt?: string | null;
  isReferencePriceSource?: boolean;
  sourceDisplayLabel?: string;
  metadataScoped?: boolean;
  catalogEstimateMinCents?: number;
  catalogEstimateMaxCents?: number;
  catalogEstimateDisplayValue?: string;
};

export type BarcodePricesResult = {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  /**
   * Point price derived from catalog estimates (cote « de 5 à 10 € » →
   * médian 7,50 €). Lowest-priority value: display and totals only fall
   * back to it when no observed price exists, and mark it as an estimate.
   */
  priceEstimated?: number | null;
  priceLastUpdated: Date | null;
  priceSources: string[];
  /** Display labels aligned with `priceSources` (registry-derived, server-stamped). */
  priceSourceDisplayNames: string[];
  /** True when the only price source is a reference/catalog database provider. */
  isReferencePriceOnly: boolean;
  priceObservations: SerializedPriceObservation[];
};

export type RefreshBarcodePricesInput = {
  cleanedBarcode: string;
  shelfType: string;
  /** Shelf/platform name, used for region (PAL/NTSC) and provider context. */
  shelfName?: string | null;
  /** Primary display name (item or scanned match) used in game heuristics. */
  primaryName: string;
  /** Extra query names (metadata title, aliases…) merged ahead of cached raw names. */
  extraNames?: string[];
  /** Titles trusted for hard marketplace validation (no weak aliases). */
  acceptanceNames?: string[];
  /** Extra barcodes contributed by metadata (EAN/UPC/ISBN…). */
  extraBarcodes?: string[];
  platformKey?: string | null;
  releaseDate?: string | null;
  externalIds?: Record<string, string | null | undefined>;
  /** Product-page URLs from metadata facts, keyed by provider id. */
  providerProductUrls?: readonly ProviderProductUrlRef[];
};

type GetCachedBarcodePricesOptions = {
  itemId?: string | null;
  metadataId?: string | null;
  itemNames?: string[];
  shelfName?: string | null;
  /** Barcode-cache summary only — skip PriceOffer reads (metadata refresh polling). */
  summaryOnly?: boolean;
};

export type RefreshItemPricesInput = {
  shelfType: string;
  shelfName?: string | null;
  primaryName: string;
  extraNames?: string[];
  acceptanceNames?: string[];
  extraBarcodes?: string[];
  platformKey?: string | null;
  releaseDate?: string | null;
  externalIds?: Record<string, string | null | undefined>;
  itemId: string;
  metadataId?: string | null;
  providerProductUrls?: readonly ProviderProductUrlRef[];
};

function averageCents(values: number[]) {
  const trimmed = trimPriceOutlierCents(values);
  if (trimmed.length === 0) return null;
  return Math.round(
    trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length,
  );
}

function gameUsedConditions(shelfType: string) {
  return shelfSupportsLooseCondition(shelfType) ? ["loose", "used"] : ["used"];
}

function trustedGameUsedOffers(
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

function dropAccessoryListings(
  offers: PriceObservation[],
  shelfType?: string | null,
): PriceObservation[] {
  return offers.filter((offer) => {
    const listing = offer.productName?.trim();
    if (!listing) return true;
    return !listingLooksLikeGameAccessory(listing, { shelfType });
  });
}

function trimObservedPriceOutliers(
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
function dropUnnamedMarketplaceNoise(
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

function relaxedOffersForPriceFallback(
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
    if (
      listing &&
      listingLooksLikeNonBookProduct(listing, { shelfType })
    ) {
      return false;
    }
    if (
      listing &&
      listingLooksLikeGameAccessory(listing, { shelfType })
    ) {
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

type ItemPriceResolution = {
  summary: ReturnType<typeof summarizeObservedPrices>;
  filteredOffers: PriceObservation[];
  strictMatch: boolean;
};

/**
 * Strict title/platform filter first; when every listing title is noisy, fall
 * back to trimmed aggregates so shelf cards match item pages (which keep the
 * same summary via {@link alignBarcodePricesForItemNames}).
 */
function resolveItemPriceFromOffers(
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
    summary.priceUsed != null ||
    summary.priceUsedCIB != null;
  if (!hasSummary) return null;

  return {
    summary,
    filteredOffers: [],
    strictMatch: false,
  };
}

function pricesForCondition(offers: PriceObservation[], conditions: string[]) {
  const wanted = new Set(conditions);
  return offers
    .filter((offer) => {
      const condition = effectiveGameOfferCondition(offer);
      return condition && wanted.has(condition);
    })
    .map((offer) => offer.priceCents);
}

/** Marketplace "used" rows whose title says cartridge/disc-only are true loose. */
function listingTitleImpliesLoose(name?: string | null): boolean {
  if (!name?.trim()) return false;
  return /\b(?:loose|cartouche\s+seule|disque\s+seul|cd\s+seul|sans\s+boite|boite\s+vide|empty\s+case)\b/i.test(
    name,
  );
}

function effectiveGameOfferCondition(
  offer: PriceObservation,
): string | undefined {
  const condition = offer.condition ?? undefined;
  if (condition === "used" && listingTitleImpliesLoose(offer.productName)) {
    return "loose";
  }
  return condition;
}

export function summarizeObservedPrices(
  shelfType: string,
  offers: PriceObservation[],
) {
  const usedOffers = shelfSupportsLooseCondition(shelfType)
    ? trustedGameUsedOffers(shelfType, offers)
    : offers;
  if (shelfSupportsLooseCondition(shelfType)) {
    // Loose = cartridge/disc/console only. Shop "used" / retail listings are
    // complete-in-box proxies and must not inflate a loose copy's observed price
    // (e.g. NetGamesRetro boxed stock vs PriceCharting loose). Titles that
    // explicitly say "Loose" are remapped above via {@link effectiveGameOfferCondition}.
    const looseCents = pricesForCondition(usedOffers, ["loose"]);
    const cibCents = [
      ...pricesForCondition(offers, ["cib"]),
      ...pricesForCondition(usedOffers, ["used"]),
    ];
    return {
      priceNew: averageCents(pricesForCondition(offers, ["new"])),
      priceUsed: averageCents(looseCents),
      priceUsedCIB: averageCents(cibCents),
    };
  }
  return {
    priceNew: averageCents(pricesForCondition(offers, ["new"])),
    priceUsed: averageCents(pricesForCondition(usedOffers, ["used"])),
    priceUsedCIB: null,
  };
}

function priceSourcesFromOffers(
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

function serializePriceOffers(offers: PriceObservation[]) {
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

function withPriceSourceTraits(
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
    priceUsed: null,
    priceUsedCIB: null,
    priceLastUpdated: null,
    priceSources: [],
    priceObservations: [],
  });
}

function priceListingMatchesShelfPlatform(
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
function dropIdentityConflictingListings(
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
      referenceOfferSurvivesRegionalTitleMiss(names, offer)
    );
  });
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
            referenceOfferSurvivesRegionalTitleMiss(names, offer),
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

function observationsFromFilteredOffers(
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
        if (shouldKeepReferencePricesOnTitleMiss(names, namedOffers)) {
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
        !shouldKeepReferencePricesOnTitleMiss(names, namedOffers)
      ) {
        // Wrong catalog fiche (generic Slim vs Pink) whose cents no longer
        // equal the mixed barcode summary — still drop the contradicted
        // reference, do not keep orphan aggregates.
        return emptyBarcodePrices();
      }
    }

    const hasSummary =
      prices.priceNew != null ||
      prices.priceUsed != null ||
      prices.priceUsedCIB != null;
    if (!hasSummary) return emptyBarcodePrices();
    return { ...prices, priceObservations: [] };
  }

  const summary = summarizeObservedPrices(shelfType, filtered);

  return withPriceSourceTraits({
    priceNew: summary.priceNew,
    priceUsed: summary.priceUsed,
    priceUsedCIB: summary.priceUsedCIB,
    priceLastUpdated: prices.priceLastUpdated,
    priceSources: priceSourcesFromOffers(filtered),
    priceObservations: observationsFromFilteredOffers(
      prices.priceObservations,
      filtered,
    ),
  });
}

function significantTitleTokens(value: string): string[] {
  return normalizeForTokens(cleanSearchQuery(value) || value)
    .replace(/[:;|/]/g, " ")
    // Match product-compare: Spider-Man ↔ Spiderman.
    .replace(/-/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function listingIsBareFranchiseStemOf(itemName: string, listing: string): boolean {
  const itemTokens = significantTitleTokens(itemName);
  const listingTokens = significantTitleTokens(listing);
  if (listingTokens.length < 2 || itemTokens.length <= listingTokens.length) {
    return false;
  }
  return listingTokens.every((token, index) => itemTokens[index] === token);
}

function listingSharesFranchiseFamily(
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
): boolean {
  if (namedOffers.length === 0) return false;
  if (
    !namedOffers.every((offer) => isReferencePriceSource(offer.source ?? ""))
  ) {
    return false;
  }
  return namedOffers.every((offer) =>
    referenceOfferSurvivesRegionalTitleMiss(itemNames, offer),
  );
}

function referenceOfferSurvivesRegionalTitleMiss(
  itemNames: string[],
  offer: PriceObservation,
): boolean {
  if (!isReferencePriceSource(offer.source ?? "")) return false;
  const listing = offer.productName?.trim();
  if (!listing) return true;
  if (itemNames.some((name) => listingIsDistinctProductSpinoff(name, listing))) {
    return false;
  }
  if (itemNames.some((name) => listingIsBareFranchiseStemOf(name, listing))) {
    return false;
  }
  return listingSharesFranchiseFamily(itemNames, listing);
}

/**
 * Read prices for a barcode from the shared cache only — no network. Prices are
 * scoped to the barcode (not the item), so a value resolved at scan time is
 * reused by the item page and modal. Returns null when nothing is cached.
 */
export async function getCachedBarcodePrices(
  cleanedBarcode: string,
  shelfType: string,
  options: GetCachedBarcodePricesOptions = {},
): Promise<BarcodePricesResult | null> {
  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    select: {
      id: true,
      shelfType: true,
      provider: true,
      priceNew: true,
      priceUsed: true,
      priceUsedCIB: true,
      priceLastUpdated: true,
    },
  });
  // A cache built for another shelf type isn't a reliable estimate here.
  const usableBarcodeCache =
    cached && (!cached.shelfType || cached.shelfType === shelfType)
      ? cached
      : null;

  const hasSummary =
    usableBarcodeCache?.priceNew != null ||
    usableBarcodeCache?.priceUsed != null ||
    usableBarcodeCache?.priceUsedCIB != null;

  if (options.summaryOnly) {
    if (!hasSummary) return null;
    return withPriceSourceTraits({
      priceNew: usableBarcodeCache!.priceNew,
      priceUsed: usableBarcodeCache!.priceUsed,
      priceUsedCIB: usableBarcodeCache!.priceUsedCIB,
      priceLastUpdated: usableBarcodeCache!.priceLastUpdated,
      priceSources: parsePriceProviderSources(usableBarcodeCache!.provider),
      priceObservations: [],
    });
  }

  const offerScopes = [
    ...(usableBarcodeCache ? [{ barcodeCacheId: usableBarcodeCache.id }] : []),
    ...(options.itemId ? [{ itemId: options.itemId }] : []),
    ...(options.metadataId ? [{ metadataId: options.metadataId }] : []),
  ];
  if (!usableBarcodeCache && offerScopes.length === 0) return null;

  const offers = await prisma.priceOffer.findMany({
    where: offerScopes.length === 1 ? offerScopes[0] : { OR: offerScopes },
    orderBy: { observedAt: "desc" },
    take: 24,
  });
  if (offers.length === 0 && !hasSummary) return null;

  const sourceOffers = toPriceObservations(offers);
  const itemNames = (options.itemNames ?? []).filter((name) => name.trim());

  if (itemNames.length > 0) {
    return resolveItemDisplayPrices(
      shelfType,
      options.shelfName,
      itemNames,
      sourceOffers,
      usableBarcodeCache
        ? {
            priceNew: usableBarcodeCache.priceNew,
            priceUsed: usableBarcodeCache.priceUsed,
            priceUsedCIB: usableBarcodeCache.priceUsedCIB,
            priceLastUpdated: usableBarcodeCache.priceLastUpdated,
          }
        : null,
    );
  }

  const observedSummary =
    offers.length > 0 ? summarizeObservedPrices(shelfType, offers) : null;
  const summary = {
    priceNew: observedSummary?.priceNew ?? usableBarcodeCache?.priceNew ?? null,
    priceUsed:
      observedSummary?.priceUsed ?? usableBarcodeCache?.priceUsed ?? null,
    priceUsedCIB:
      observedSummary?.priceUsedCIB ?? usableBarcodeCache?.priceUsedCIB ?? null,
  };

  return withPriceSourceTraits({
    priceNew: summary.priceNew,
    priceUsed: summary.priceUsed,
    priceUsedCIB: summary.priceUsedCIB,
    priceLastUpdated:
      usableBarcodeCache?.priceLastUpdated ?? offers[0]?.observedAt ?? null,
    priceSources: priceSourcesFromOffers(offers, usableBarcodeCache?.provider),
    priceObservations: serializePriceOffers(offers),
  });
}

/**
 * Read prices scoped to an item (and optionally its metadata) without a barcode.
 */
export type ShelfItemPriceFields = {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceLastUpdated: Date | null;
};

function cleanBarcodeValue(barcode?: string | null): string {
  return barcode ? barcode.replace(/[^\d]/g, "").trim() : "";
}

type CacheSummaryFields = {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceLastUpdated: Date | null;
};

function toPriceObservations(
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
    };
  });
}

function priceLastUpdatedFromOffers(
  offers: PriceObservation[],
  fallback: Date | null = null,
): Date | null {
  const first = offers[0]?.observedAt;
  if (!first) return fallback;
  return first instanceof Date ? first : new Date(first);
}

function observedSummaryFromAlignedOffers(
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

function priceSummaryMatchesOffers(
  shelfType: string,
  summary: Pick<
    CacheSummaryFields,
    "priceNew" | "priceUsed" | "priceUsedCIB"
  >,
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
    summaryInput.priceUsed != null ||
    summaryInput.priceUsedCIB != null;
  if (!hasSummaryInput && offers.length === 0) return null;

  const aligned = alignBarcodePricesForItemNames(
    shelfType,
    itemNames,
    withPriceSourceTraits({
      priceNew: summaryInput.priceNew,
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

function resolveShelfItemPriceFields(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
  cacheSummary: CacheSummaryFields | null,
): ShelfItemPriceFields | null {
  const resolved = resolveItemDisplayPrices(
    shelfType,
    shelfName,
    itemNames,
    offers,
    cacheSummary,
  );
  if (!resolved) return null;

  return {
    priceNew: resolved.priceNew,
    priceUsed: resolved.priceUsed,
    priceUsedCIB: resolved.priceUsedCIB,
    priceLastUpdated: resolved.priceLastUpdated,
  };
}

/**
 * Batch price summaries for shelf grids: filtered offers when available, with
 * barcode-cache fallback when every listing title is noisy.
 */
export async function summarizeShelfItemPrices(
  shelfType: string,
  items: Array<{
    id: string;
    barcode?: string | null;
    name?: string | null;
    metadataTitle?: string | null;
    /** Soft aliases (filtered before title-match validation). */
    aliases?: string[] | null;
  }>,
  shelfName?: string | null,
): Promise<Map<string, ShelfItemPriceFields>> {
  const result = new Map<string, ShelfItemPriceFields>();
  if (items.length === 0) return result;

  const cleanBarcodes = [
    ...new Set(
      items.map((item) => cleanBarcodeValue(item.barcode)).filter(Boolean),
    ),
  ];
  const caches =
    cleanBarcodes.length > 0
      ? await prisma.barcodeCache.findMany({
          where: { barcode: { in: cleanBarcodes } },
        })
      : [];
  const cacheByBarcode = new Map(caches.map((cache) => [cache.barcode, cache]));

  const usableCacheIds = caches
    .filter((cache) => !cache.shelfType || cache.shelfType === shelfType)
    .map((cache) => cache.id);
  const itemIds = items.map((item) => item.id);

  const offers =
    itemIds.length > 0 || usableCacheIds.length > 0
      ? await prisma.priceOffer.findMany({
          where: {
            OR: [
              ...(itemIds.length > 0 ? [{ itemId: { in: itemIds } }] : []),
              ...(usableCacheIds.length > 0
                ? [{ barcodeCacheId: { in: usableCacheIds } }]
                : []),
            ],
          },
          orderBy: { observedAt: "desc" },
        })
      : [];

  const offersByItemId = new Map<string, typeof offers>();
  for (const item of items) {
    const clean = cleanBarcodeValue(item.barcode);
    const cache = clean ? cacheByBarcode.get(clean) : null;
    const usableCache =
      cache && (!cache.shelfType || cache.shelfType === shelfType)
        ? cache
        : null;
    const itemOffers = offers.filter(
      (offer) =>
        offer.itemId === item.id ||
        (usableCache?.id != null && offer.barcodeCacheId === usableCache.id),
    );
    if (itemOffers.length > 0) {
      offersByItemId.set(item.id, itemOffers.slice(0, 24));
    }
  }

  for (const item of items) {
    const clean = cleanBarcodeValue(item.barcode);
    const cache = clean ? cacheByBarcode.get(clean) : null;
    const usableCache =
      cache && (!cache.shelfType || cache.shelfType === shelfType)
        ? cache
        : null;
    const itemOffers = offersByItemId.get(item.id) ?? [];
    const primary = item.name?.trim() || item.metadataTitle?.trim() || "";
    const aliasNames = (item.aliases ?? []).filter(
      (alias): alias is string =>
        typeof alias === "string" &&
        !!alias.trim() &&
        (!primary || aliasBelongsInPriceLookup(primary, alias)),
    );
    const itemNames = [item.name, item.metadataTitle, ...aliasNames].filter(
      (name): name is string => !!name?.trim(),
    );
    const sourceOffers = toPriceObservations(itemOffers);
    const cacheSummary = usableCache
      ? {
          priceNew: usableCache.priceNew,
          priceUsed: usableCache.priceUsed,
          priceUsedCIB: usableCache.priceUsedCIB,
          priceLastUpdated: usableCache.priceLastUpdated,
        }
      : null;

    const fields = resolveShelfItemPriceFields(
      shelfType,
      shelfName,
      itemNames,
      sourceOffers,
      cacheSummary,
    );
    if (fields) {
      result.set(item.id, fields);
    }
  }

  return result;
}

export async function getCachedItemPrices(
  shelfType: string,
  options: {
    itemId: string;
    metadataId?: string | null;
    itemNames?: string[];
    shelfName?: string | null;
  },
): Promise<BarcodePricesResult | null> {
  const offerScopes = [
    { itemId: options.itemId },
    ...(options.metadataId ? [{ metadataId: options.metadataId }] : []),
  ];

  const offers = await prisma.priceOffer.findMany({
    where: offerScopes.length === 1 ? offerScopes[0] : { OR: offerScopes },
    orderBy: { observedAt: "desc" },
    take: 24,
  });
  if (offers.length === 0) return null;

  const sourceOffers = toPriceObservations(offers);
  const itemNames = (options.itemNames ?? []).filter((name) => name.trim());

  return resolveItemDisplayPrices(
    shelfType,
    options.shelfName,
    itemNames,
    sourceOffers,
    null,
  );
}

/**
 * Persist price offers that were obtained from a provider call (captured during
 * barcode resolution, or fetched by {@link refreshBarcodePrices}) without losing
 * existing data: offers are *merged* by source+condition, so a provider that
 * didn't answer keeps its previous value. An empty batch (every provider failed)
 * is a no-op that returns whatever is already cached — the cache is never wiped.
 */
export async function persistBarcodePrices(params: {
  cleanedBarcode: string;
  shelfType: string;
  priceOffers: PriceOfferInput[];
  /**
   * Price-source string to store on the cache row. Omit to leave the existing
   * `provider` untouched (e.g. when capturing prices during barcode resolution,
   * where `provider` carries the identification-cache version).
   */
  provider?: string | null;
}): Promise<BarcodePricesResult> {
  const { cleanedBarcode, shelfType, priceOffers, provider } = params;

  const incoming = priceOffers.filter(
    (offer) =>
      offer.source &&
      Number.isInteger(offer.priceCents) &&
      offer.priceCents > 0,
  );

  // Nothing new (e.g. all providers failed): never erase what we already have.
  if (incoming.length === 0) {
    return (
      (await getCachedBarcodePrices(cleanedBarcode, shelfType)) ??
      emptyBarcodePrices()
    );
  }

  const now = new Date();
  const cacheRecord = await prisma.barcodeCache.upsert({
    where: { barcode: cleanedBarcode },
    create: {
      barcode: cleanedBarcode,
      provider: provider ?? "prices",
      shelfType,
    },
    update: {
      ...(provider ? { provider } : {}),
      shelfType,
    },
  });

  const merged = await mergePriceOffers(
    { barcodeCacheId: cacheRecord.id },
    incoming,
  );
  const { priceNew, priceUsed, priceUsedCIB } = summarizeObservedPrices(
    shelfType,
    merged,
  );

  await prisma.barcodeCache.update({
    where: { id: cacheRecord.id },
    data: { priceNew, priceUsed, priceUsedCIB, priceLastUpdated: now },
  });

  await persistProviderExternalLinksForBarcodeItems(cleanedBarcode, merged);

  return withPriceSourceTraits({
    priceNew,
    priceUsed,
    priceUsedCIB,
    priceLastUpdated: now,
    priceSources: priceSourcesFromOffers(merged, provider),
    priceObservations: serializePriceOffers(merged),
  });
}

/**
 * Merge price offers onto an item/metadata scope (no barcode cache row).
 */
export async function persistItemPrices(params: {
  itemId: string;
  metadataId?: string | null;
  shelfType: string;
  priceOffers: PriceOfferInput[];
}): Promise<BarcodePricesResult> {
  const { itemId, metadataId, shelfType, priceOffers } = params;
  const scope = metadataId ? { itemId, metadataId } : { itemId };

  const incoming = priceOffers.filter(
    (offer) =>
      offer.source &&
      Number.isInteger(offer.priceCents) &&
      offer.priceCents > 0,
  );

  if (incoming.length === 0) {
    return (
      (await getCachedItemPrices(shelfType, { itemId, metadataId })) ??
      emptyBarcodePrices()
    );
  }

  const merged = await mergePriceOffers(scope, incoming);
  const { priceNew, priceUsed, priceUsedCIB } = summarizeObservedPrices(
    shelfType,
    merged,
  );
  const now = new Date();

  if (metadataId) {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { barcode: true, name: true },
    });
    await persistProviderExternalLinksForMetadata(metadataId, {
      itemBarcode: item?.barcode,
      itemTitle: item?.name,
      shelfType,
      priceOffers: merged,
    });
  }

  return withPriceSourceTraits({
    priceNew,
    priceUsed,
    priceUsedCIB,
    priceLastUpdated: now,
    priceSources: priceSourcesFromOffers(merged),
    priceObservations: serializePriceOffers(merged),
  });
}

/**
 * Query the price providers for a barcode and merge the result into the cache.
 * Heavy (paid third-party calls) — callers should prefer {@link getCachedBarcodePrices}
 * and only refresh when the cache is missing or stale.
 */
export async function refreshBarcodePrices(
  input: RefreshBarcodePricesInput,
): Promise<BarcodePricesResult> {
  const {
    cleanedBarcode,
    shelfType,
    shelfName,
    primaryName,
    extraNames = [],
    acceptanceNames,
    extraBarcodes = [],
    platformKey,
    releaseDate,
    externalIds,
    providerProductUrls = [],
  } = input;

  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });

  console.log(
    `[Prices] Fetching fresh prices for barcode ${cleanedBarcode} (shelf type: ${shelfType})`,
  );

  const rawNamesList = cached?.rawNames?.map((rn) => rn.value) || [];
  const match = buildMatchContext({
    shelfType,
    shelfName,
    primaryTitle: primaryName,
    titles: [...extraNames, primaryName, ...rawNamesList],
    acceptanceTitles: acceptanceNames?.length
      ? acceptanceNames
      : [primaryName],
    barcodes: [cleanedBarcode, ...extraBarcodes],
    platformKey,
    releaseDate,
    externalIds,
    providerProductUrls,
    regionHints: rawNamesList,
  });
  const priceOffers = await collectRefreshBarcodePriceOffers(
    toBarcodePriceRefreshContext(match, { expandSearchQueries: true }),
  );

  return persistBarcodePrices({
    cleanedBarcode,
    shelfType,
    priceOffers,
    provider: priceProviderTokenFromOffers(shelfType, priceOffers),
  });
}

/**
 * Query marketplace price providers by title when no barcode is available.
 */
export async function refreshItemPrices(
  input: RefreshItemPricesInput,
): Promise<BarcodePricesResult> {
  const {
    shelfType,
    shelfName,
    primaryName,
    extraNames = [],
    acceptanceNames,
    extraBarcodes = [],
    platformKey,
    releaseDate,
    externalIds,
    itemId,
    metadataId,
    providerProductUrls = [],
  } = input;

  console.log(
    `[Prices] Fetching title-based prices for item ${itemId} (shelf type: ${shelfType})`,
  );

  const match = buildMatchContext({
    shelfType,
    shelfName,
    primaryTitle: primaryName,
    titles: [...extraNames, primaryName],
    acceptanceTitles: acceptanceNames?.length
      ? acceptanceNames
      : [primaryName],
    barcodes: extraBarcodes,
    platformKey,
    releaseDate,
    externalIds,
    providerProductUrls,
  });
  const priceOffers = await collectRefreshBarcodePriceOffers(
    toBarcodePriceRefreshContext(match, { expandSearchQueries: true }),
  );

  return persistItemPrices({
    itemId,
    metadataId,
    shelfType,
    priceOffers,
  });
}

// ── coalesced from src/core/commerce/pricing/cachePolicy.ts ──
type PriceCacheRecord = {
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
  priceNew?: number | null;
  provider?: string | null;
  priceLastUpdated?: Date | string | null;
};

type CachedPriceOffer = {
  source?: string | null;
  condition?: string | null;
  priceCents?: number | null;
};

const GAME_USED_CONDITIONS = new Set(["loose", "cib", "used"]);
const FRESH_USED_GAME_PRICE_MS = 24 * 60 * 60 * 1000;
/** Games with only new/catalog prices — retry used providers, but not every page load. */
const FRESH_INCOMPLETE_GAME_PRICE_MS = 6 * 60 * 60 * 1000;

export function parsePriceProviderSources(provider?: string | null) {
  return Array.from(
    new Set(
      (provider || "")
        .replace(/\+?canonical-v\d+/g, "")
        .split("+")
        .map((source) => source.trim())
        .filter((source) => source && source !== "None"),
    ),
  );
}

export function hasGameUsedPricing(
  cacheRecord: PriceCacheRecord,
  offers: CachedPriceOffer[],
) {
  if (cacheRecord.priceUsed != null || cacheRecord.priceUsedCIB != null) {
    return true;
  }

  return offers.some(
    (offer) =>
      typeof offer.priceCents === "number" &&
      offer.priceCents > 0 &&
      offer.condition &&
      GAME_USED_CONDITIONS.has(offer.condition),
  );
}

export function hasReferencePriceOffers(offers: CachedPriceOffer[]) {
  return offers.some(
    (offer) => !!offer.source && isReferencePriceSource(offer.source),
  );
}

export function shouldReturnCachedPrices(
  shelfType: string,
  cacheRecord: PriceCacheRecord,
  offers: CachedPriceOffer[],
) {
  if (!shelfSupportsLooseCondition(shelfType)) return true;
  if (hasGameUsedPricing(cacheRecord, offers)) return true;
  if (hasReferencePriceOffers(offers)) return true;
  return false;
}

export function getPriceCacheLifetimeMs(
  shelfType: string,
  cacheRecord: PriceCacheRecord,
) {
  const hasAnyPrice =
    cacheRecord.priceUsed != null ||
    cacheRecord.priceUsedCIB != null ||
    cacheRecord.priceNew != null;

  if (!hasAnyPrice) return FRESH_INCOMPLETE_GAME_PRICE_MS;
  if (
    shelfSupportsLooseCondition(shelfType) &&
    !hasGameUsedPricing(cacheRecord, [])
  ) {
    return FRESH_INCOMPLETE_GAME_PRICE_MS;
  }
  return FRESH_USED_GAME_PRICE_MS;
}

export function isPriceCacheFresh(
  shelfType: string,
  cacheRecord: PriceCacheRecord,
  now = Date.now(),
) {
  if (!cacheRecord.priceLastUpdated) return false;
  const ageInMs = now - new Date(cacheRecord.priceLastUpdated).getTime();
  return ageInMs < getPriceCacheLifetimeMs(shelfType, cacheRecord);
}

/**
 * Whether cached prices are old enough to warrant a background refresh. Used
 * for stale-while-revalidate: the caller may still serve the cached value
 * immediately, but the refresh cadence stays aligned with the cache quality.
 */
export function shouldRefreshPriceCache(
  shelfType: string,
  cacheRecord: PriceCacheRecord,
  now = Date.now(),
) {
  return !isPriceCacheFresh(shelfType, cacheRecord, now);
}

export function finalizeGamePriceProviders(providers: string[]) {
  return providers;
}

// ── coalesced from src/core/commerce/pricing/outlierTrim.ts ──
/**
 * Drops isolated high price samples when several observations exist for the same
 * condition. Only trims the upper tail — a lone cheap listing is kept because
 * it may still be a valid marketplace hit.
 */
export function trimPriceOutlierCents(values: number[]): number[] {
  let sorted = [...values].filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return sorted;

  while (sorted.length >= 3) {
    const trimmed = dropHighTailOutlier(sorted);
    if (!trimmed) break;
    sorted = trimmed;
  }

  return sorted;
}

function dropHighTailOutlier(sorted: number[]): number[] | null {
  if (sorted.length < 3) return null;

  const previous = sorted[sorted.length - 2];
  const max = sorted[sorted.length - 1];
  const clusterSpread = previous - sorted[0];
  const tailGap = max - previous;
  const minTailGap = Math.max(clusterSpread * 1.5, previous * 0.35, 1500);

  if (tailGap < minTailGap) return null;
  return sorted.slice(0, -1);
}

export function filterUsedPricesAboveNew<
  T extends {
    condition?: string | null;
    priceCents: number;
    source?: string | null;
    productName?: string | null;
  },
>(
  observations: T[],
  shelfType: string,
  isReferencePriceSource: (source: string) => boolean = () => false,
): T[] {
  const newOffers = observations.filter(
    (row) => row.condition === "new" && row.priceCents > 0,
  );
  if (newOffers.length === 0) return observations;

  const credibleNew = newOffers.filter(
    (row) =>
      !!row.productName?.trim() || isReferencePriceSource(row.source ?? ""),
  );
  const pool = credibleNew.length > 0 ? credibleNew : newOffers;

  const usedConditions = new Set(
    shelfSupportsLooseCondition(shelfType)
      ? ["used", "loose", "cib"]
      : ["used"],
  );
  const hasUsed = observations.some(
    (row) => row.condition && usedConditions.has(row.condition),
  );
  if (!hasUsed) return observations;

  const newCeiling = Math.min(...pool.map((row) => row.priceCents));
  return observations.filter((row) => {
    if (!row.condition || !usedConditions.has(row.condition)) return true;
    if (isReferencePriceSource(row.source ?? "")) return true;
    return row.priceCents <= newCeiling;
  });
}

export function filterObservationsByOutlierTrim<
  T extends { condition?: string | null; priceCents: number },
>(observations: T[], conditions: string[]): T[] {
  const grouped = observations.filter(
    (observation) =>
      observation.condition && conditions.includes(observation.condition),
  );
  if (grouped.length < 3) return observations;

  // Used/loose rows at or below a known CIB quote are not high-tail noise —
  // they are typically refurbished / complete-adjacent marketplace stock.
  const cibCeiling = Math.max(
    0,
    ...observations
      .filter((row) => row.condition === "cib" && row.priceCents > 0)
      .map((row) => row.priceCents),
  );
  const protectUsedNearCib = conditions.some((condition) =>
    ["used", "loose"].includes(condition),
  );

  const trimmed = trimPriceOutlierCents(grouped.map((row) => row.priceCents));
  const remaining = new Map<number, number>();
  for (const priceCents of trimmed) {
    remaining.set(priceCents, (remaining.get(priceCents) ?? 0) + 1);
  }

  return observations.filter((observation) => {
    if (!observation.condition || !conditions.includes(observation.condition)) {
      return true;
    }
    if (
      protectUsedNearCib &&
      cibCeiling > 0 &&
      observation.priceCents <= cibCeiling
    ) {
      return true;
    }
    const count = remaining.get(observation.priceCents) ?? 0;
    if (count <= 0) return false;
    remaining.set(observation.priceCents, count - 1);
    return true;
  });
}
