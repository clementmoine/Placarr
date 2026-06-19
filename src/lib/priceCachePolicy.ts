type PriceCacheRecord = {
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
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
const FRESH_INCOMPLETE_GAME_PRICE_MS = 5 * 60 * 1000;

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

export function hasPriceChartingOffers(offers: CachedPriceOffer[]) {
  return offers.some((offer) => offer.source === "PriceCharting");
}

export function shouldReturnCachedPrices(
  shelfType: string,
  cacheRecord: PriceCacheRecord,
  offers: CachedPriceOffer[],
) {
  if (shelfType !== "games") return true;
  if (hasGameUsedPricing(cacheRecord, offers)) return true;
  if (hasPriceChartingOffers(offers)) return true;
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
  if (shelfType === "games" && !hasGameUsedPricing(cacheRecord, [])) {
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

export function finalizeGamePriceProviders(providers: string[]) {
  return providers;
}
