import { prisma } from "@/lib/prisma";
import { fetchPricesFromChasseAuxLivres } from "@/services/providers/chasseauxlivres";
import { fetchPricesFromPriceCharting } from "@/services/providers/pricecharting";
import { fetchPricesFromAchatMoinsCher } from "@/services/providers/achatmoinscher";
import { fetchPricesFromLeDenicheur } from "@/services/providers/ledenicheur";
import { fetchPricesFromPicClick } from "@/services/providers/picclick";
import { fetchPricesFromSmartoys } from "@/services/providers/smartoys";
import { mergePriceOffers, type PriceOfferInput } from "@/services/evidence";
import { catalogForShelfType } from "@/lib/providerCatalog";
import {
  finalizeGamePriceProviders,
  parsePriceProviderSources,
} from "@/lib/priceCachePolicy";
import { containsGameClassicsKeyword } from "@/lib/barcode/listingTerms";

type ProviderPriceResult = {
  priceNew?: number | null;
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
  productName?: string | null;
  merchantName?: string | null;
  sourceUrl?: string | null;
  offerCount?: number | null;
} | null;

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
};

export type BarcodePricesResult = {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceLastUpdated: Date | null;
  priceSources: string[];
  priceObservations: ReturnType<typeof serializePriceOffers>;
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
};

type GetCachedBarcodePricesOptions = {
  itemId?: string | null;
  metadataId?: string | null;
};

function averageCents(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function pricesForCondition(offers: PriceObservation[], conditions: string[]) {
  const wanted = new Set(conditions);
  return offers
    .filter((offer) => offer.condition && wanted.has(offer.condition))
    .map((offer) => offer.priceCents);
}

function summarizeObservedPrices(
  shelfType: string,
  offers: PriceObservation[],
) {
  return {
    priceNew: averageCents(pricesForCondition(offers, ["new"])),
    priceUsed: averageCents(
      pricesForCondition(
        offers,
        shelfType === "games" ? ["loose", "used"] : ["used"],
      ),
    ),
    priceUsedCIB:
      shelfType === "games"
        ? averageCents(pricesForCondition(offers, ["cib"]))
        : null,
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
  }));
}

export function emptyBarcodePrices(): BarcodePricesResult {
  return {
    priceNew: null,
    priceUsed: null,
    priceUsedCIB: null,
    priceLastUpdated: null,
    priceSources: [],
    priceObservations: [],
  };
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
  const hasSummary =
    usableBarcodeCache?.priceNew != null ||
    usableBarcodeCache?.priceUsed != null ||
    usableBarcodeCache?.priceUsedCIB != null;
  if (offers.length === 0 && !hasSummary) return null;

  const observedSummary =
    offers.length > 0 ? summarizeObservedPrices(shelfType, offers) : null;
  const summary = {
    priceNew: observedSummary?.priceNew ?? usableBarcodeCache?.priceNew ?? null,
    priceUsed:
      observedSummary?.priceUsed ?? usableBarcodeCache?.priceUsed ?? null,
    priceUsedCIB:
      observedSummary?.priceUsedCIB ?? usableBarcodeCache?.priceUsedCIB ?? null,
  };

  return {
    priceNew: summary.priceNew,
    priceUsed: summary.priceUsed,
    priceUsedCIB: summary.priceUsedCIB,
    priceLastUpdated:
      usableBarcodeCache?.priceLastUpdated ?? offers[0]?.observedAt ?? null,
    priceSources: priceSourcesFromOffers(offers, usableBarcodeCache?.provider),
    priceObservations: serializePriceOffers(offers),
  };
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

  return {
    priceNew,
    priceUsed,
    priceUsedCIB,
    priceLastUpdated: now,
    priceSources: priceSourcesFromOffers(merged, provider),
    priceObservations: serializePriceOffers(merged),
  };
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
  } = input;

  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });

  console.log(
    `[Prices] Fetching fresh prices for barcode ${cleanedBarcode} (shelf type: ${shelfType})`,
  );

  const rawNamesList = cached?.rawNames?.map((rn) => rn.value) || [];
  const fallbackNames = Array.from(
    new Set(
      [...extraNames, primaryName, ...rawNamesList].filter(
        (name): name is string => !!name && name.trim().length > 0,
      ),
    ),
  );
  const leDenicheurQueries = [cleanedBarcode, ...fallbackNames];

  let standardPrices: ProviderPriceResult = null;
  let amcPrices: ProviderPriceResult = null;
  let leDenicheurPrices: ProviderPriceResult = null;
  let picClickPrices: ProviderPriceResult = null;
  let smartoysPrices: ProviderPriceResult = null;

  if (shelfType === "games") {
    const regionHaystacks = [primaryName, shelfName ?? "", ...rawNamesList];
    const hasNtscIndicator = regionHaystacks.some((value) =>
      /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(value),
    );
    const isPal = !hasNtscIndicator;

    const isClassics = [primaryName, ...rawNamesList].some((value) =>
      containsGameClassicsKeyword(value),
    );

    const [stdRes, amcRes, leDenicheurRes, smartoysRes] =
      await Promise.allSettled([
        fetchPricesFromPriceCharting(
          cleanedBarcode,
          fallbackNames,
          shelfName ?? "",
          isPal,
          isClassics,
        ),
        fetchPricesFromAchatMoinsCher(cleanedBarcode),
        fetchPricesFromLeDenicheur(leDenicheurQueries),
        fetchPricesFromSmartoys(cleanedBarcode),
      ]);
    standardPrices = stdRes.status === "fulfilled" ? stdRes.value : null;
    amcPrices = amcRes.status === "fulfilled" ? amcRes.value : null;
    leDenicheurPrices =
      leDenicheurRes.status === "fulfilled" ? leDenicheurRes.value : null;
    smartoysPrices =
      smartoysRes.status === "fulfilled" ? smartoysRes.value : null;
  } else {
    const chasseAuxLivresCatalog = catalogForShelfType(shelfType);
    const fetchChasseAuxLivresPrice = async () => {
      for (const query of [cleanedBarcode, ...fallbackNames]) {
        const result = await fetchPricesFromChasseAuxLivres(
          query,
          chasseAuxLivresCatalog,
        );
        if (result) return result;
      }
      return null;
    };
    const fetchPicClickPrice = async () => {
      for (const query of [cleanedBarcode, ...fallbackNames]) {
        const result = await fetchPricesFromPicClick(query, fallbackNames);
        if (result) return result;
      }
      return null;
    };

    const [stdRes, amcRes, leDenicheurRes, picClickRes] =
      await Promise.allSettled([
        fetchChasseAuxLivresPrice(),
        fetchPricesFromAchatMoinsCher(cleanedBarcode),
        fetchPricesFromLeDenicheur(leDenicheurQueries),
        fetchPicClickPrice(),
      ]);
    standardPrices = stdRes.status === "fulfilled" ? stdRes.value : null;
    amcPrices = amcRes.status === "fulfilled" ? amcRes.value : null;
    leDenicheurPrices =
      leDenicheurRes.status === "fulfilled" ? leDenicheurRes.value : null;
    picClickPrices =
      picClickRes.status === "fulfilled" ? picClickRes.value : null;
  }

  const providersList: string[] = [];
  if (standardPrices)
    providersList.push(
      shelfType === "games" ? "PriceCharting" : "ChasseAuxLivres",
    );
  if (amcPrices) providersList.push("AchatMoinsCher");
  if (leDenicheurPrices) providersList.push("LeDenicheur");
  if (picClickPrices) providersList.push("PicClick");
  if (smartoysPrices) providersList.push("Smartoys");
  const resolvedProviders =
    shelfType === "games"
      ? finalizeGamePriceProviders(providersList)
      : providersList;
  const provider =
    resolvedProviders.length > 0 ? resolvedProviders.join("+") : "None";

  const standardSource =
    shelfType === "games" ? "PriceCharting" : "ChasseAuxLivres";
  const priceOffers: PriceOfferInput[] = [];
  const pushOffer = (
    source: string,
    condition: string,
    priceCents: unknown,
    rawValue: unknown,
    extra: Partial<PriceOfferInput> = {},
  ) => {
    if (typeof priceCents !== "number" || priceCents <= 0) return;
    priceOffers.push({ source, condition, priceCents, rawValue, ...extra });
  };

  if (shelfType === "games") {
    pushOffer(
      "PriceCharting",
      "loose",
      standardPrices?.priceUsed,
      standardPrices,
    );
    pushOffer(
      "PriceCharting",
      "cib",
      standardPrices?.priceUsedCIB,
      standardPrices,
    );
    pushOffer("PriceCharting", "new", standardPrices?.priceNew, standardPrices);
  } else {
    pushOffer(
      standardSource,
      "used",
      standardPrices?.priceUsed,
      standardPrices,
    );
    pushOffer(standardSource, "new", standardPrices?.priceNew, standardPrices);
  }

  pushOffer("AchatMoinsCher", "used", amcPrices?.priceUsed, amcPrices);
  pushOffer("AchatMoinsCher", "new", amcPrices?.priceNew, amcPrices);
  pushOffer("PicClick", "used", picClickPrices?.priceUsed, picClickPrices, {
    productName: picClickPrices?.productName ?? null,
    sourceUrl: picClickPrices?.sourceUrl ?? null,
    offerCount: picClickPrices?.offerCount ?? null,
  });
  pushOffer(
    "LeDenicheur",
    "new",
    leDenicheurPrices?.priceNew,
    leDenicheurPrices,
    {
      productName: leDenicheurPrices?.productName ?? null,
      merchantName: leDenicheurPrices?.merchantName ?? null,
      sourceUrl: leDenicheurPrices?.sourceUrl ?? null,
      offerCount: leDenicheurPrices?.offerCount ?? null,
    },
  );
  pushOffer("Smartoys", "new", smartoysPrices?.priceNew, smartoysPrices, {
    productName: smartoysPrices?.productName ?? null,
    sourceUrl: smartoysPrices?.sourceUrl ?? null,
  });
  pushOffer("Smartoys", "used", smartoysPrices?.priceUsed, smartoysPrices, {
    productName: smartoysPrices?.productName ?? null,
    sourceUrl: smartoysPrices?.sourceUrl ?? null,
  });

  return persistBarcodePrices({
    cleanedBarcode,
    shelfType,
    priceOffers,
    provider,
  });
}
