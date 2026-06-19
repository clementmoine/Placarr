import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuestOrHigher } from "@/lib/auth";
import { fetchPricesFromChasseAuxLivres } from "@/services/providers/chasseauxlivres";
import { fetchPricesFromPriceCharting } from "@/services/providers/pricecharting";
import { fetchPricesFromAchatMoinsCher } from "@/services/providers/achatmoinscher";
import { fetchPricesFromLeDenicheur } from "@/services/providers/ledenicheur";
import { fetchPricesFromPicClick } from "@/services/providers/picclick";
import { fetchPricesFromSmartoys } from "@/services/providers/smartoys";
import { replacePriceOffers, type PriceOfferInput } from "@/services/evidence";
import { cleanCode } from "@/lib/barcode/query";
import { resolveItemId } from "@/lib/resolveIds";
import { catalogForShelfType } from "@/lib/providerCatalog";
import {
  finalizeGamePriceProviders,
  isPriceCacheFresh,
  parsePriceProviderSources,
} from "@/lib/priceCachePolicy";

type PriceObservation = {
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
  const sources = Array.from(
    new Set([
      ...offers.map((offer) => offer.source).filter(Boolean),
      ...parsePriceProviderSources(fallbackProvider),
    ]),
  );
  return sources;
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

async function loadCachedPriceOffers(params: {
  barcodeCacheId?: number | null;
  itemId?: string | null;
  metadataId?: string | null;
}) {
  const or = [
    params.barcodeCacheId ? { barcodeCacheId: params.barcodeCacheId } : null,
    params.itemId ? { itemId: params.itemId } : null,
    params.metadataId ? { metadataId: params.metadataId } : null,
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (or.length === 0) return [];

  return prisma.priceOffer.findMany({
    where: { OR: or },
    orderBy: { observedAt: "desc" },
    take: 24,
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const session = await requireGuestOrHigher(req);
  if (session instanceof NextResponse) return session;

  const { itemId } = await context.params;
  const shelfId = req.nextUrl.searchParams.get("shelfId");

  try {
    const resolvedItemId = await resolveItemId(
      itemId,
      shelfId,
      session.user.id,
    );
    const item = await prisma.item.findUnique({
      where: { id: resolvedItemId },
      include: { shelf: true, metadata: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (!item.barcode) {
      return NextResponse.json({
        priceNew: null,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: null,
        priceSources: [],
        priceObservations: [],
      });
    }

    const cleanedBarcode = cleanCode(item.barcode);
    if (!cleanedBarcode) {
      return NextResponse.json({
        priceNew: null,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: null,
        priceSources: [],
        priceObservations: [],
      });
    }

    // Check cache in database
    const cached = await prisma.barcodeCache.findUnique({
      where: { barcode: cleanedBarcode },
      include: { rawNames: true },
    });
    const cacheMatchesShelfType =
      !cached?.shelfType || cached.shelfType === item.shelf.type;

    const isCacheFresh = (cacheRecord: typeof cached) =>
      isPriceCacheFresh(item.shelf.type, cacheRecord ?? {});

    if (cached && !cacheMatchesShelfType) {
      console.log(
        `[API Prices] Ignoring ${cached.shelfType} price cache for ${item.shelf.type} item ${cleanedBarcode}`,
      );
    }

    const cachedPriceOffers =
      cached && cacheMatchesShelfType
        ? await loadCachedPriceOffers({
            barcodeCacheId: cached.id,
            itemId: item.id,
            metadataId: item.metadataId,
          })
        : [];

    if (
      cached &&
      cacheMatchesShelfType &&
      isCacheFresh(cached) &&
      cachedPriceOffers.length > 0
    ) {
      const priceOffers = cachedPriceOffers;
      const observedSummary =
        priceOffers.length > 0
          ? summarizeObservedPrices(item.shelf.type, priceOffers)
          : null;
      const summary = observedSummary || {
        priceNew: cached.priceNew,
        priceUsed: cached.priceUsed,
        priceUsedCIB: cached.priceUsedCIB,
      };
      if (
        observedSummary &&
        (observedSummary.priceNew !== cached.priceNew ||
          observedSummary.priceUsed !== cached.priceUsed ||
          observedSummary.priceUsedCIB !== cached.priceUsedCIB)
      ) {
        await prisma.barcodeCache.update({
          where: { id: cached.id },
          data: observedSummary,
        });
      }
      console.log(
        `[API Prices] Returning cached prices for barcode ${cleanedBarcode}`,
      );
      return NextResponse.json({
        priceNew: summary.priceNew,
        priceUsed: summary.priceUsed,
        priceUsedCIB: summary.priceUsedCIB,
        priceLastUpdated: cached.priceLastUpdated,
        priceSources: priceSourcesFromOffers(priceOffers, cached.provider),
        priceObservations: serializePriceOffers(priceOffers),
      });
    }

    // Cache is stale or empty - fetch new prices
    console.log(
      `[API Prices] Fetching fresh prices for barcode ${cleanedBarcode} (shelf type: ${item.shelf.type})`,
    );

    const rawNamesList = cached?.rawNames?.map((rn) => rn.value) || [];
    let aliases: string[] = [];
    if (item.metadata?.aliases) {
      try {
        aliases = JSON.parse(item.metadata.aliases);
      } catch (error) {
        console.warn("[API Prices] Failed to parse metadata aliases:", error);
      }
    }
    const fallbackNames = Array.from(
      new Set(
        [item.metadata?.title, ...aliases, item.name, ...rawNamesList].filter(
          (name): name is string => !!name && name.trim().length > 0,
        ),
      ),
    );
    const leDenicheurQueries = [cleanedBarcode, ...fallbackNames];

    let standardPrices: any = null;
    let amcPrices: any = null;
    let leDenicheurPrices: any = null;
    let picClickPrices: any = null;
    let smartoysPrices: any = null;

    if (item.shelf.type === "games") {
      const hasNtscIndicator =
        /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(item.name) ||
        /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(item.shelf.name) ||
        rawNamesList.some((rn) => /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(rn));
      const isPal = !hasNtscIndicator;

      const CLASSICS_KEYWORDS = [
        "classics",
        "platinum",
        "essential",
        "players choice",
        "player's choice",
        "greatest hits",
        "nintendo selects",
        "best of",
      ];
      const isClassics =
        rawNamesList.some((rn) =>
          CLASSICS_KEYWORDS.some((kw) => rn.toLowerCase().includes(kw)),
        ) ||
        CLASSICS_KEYWORDS.some((kw) => item.name.toLowerCase().includes(kw));

      const [stdRes, amcRes, leDenicheurRes, smartoysRes] =
        await Promise.allSettled([
          fetchPricesFromPriceCharting(
            cleanedBarcode,
            fallbackNames,
            item.shelf.name,
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
      const chasseAuxLivresQueries = [cleanedBarcode, ...fallbackNames];
      const chasseAuxLivresCatalog = catalogForShelfType(item.shelf.type);
      const fetchChasseAuxLivresPrice = async () => {
        for (const query of chasseAuxLivresQueries) {
          const result = await fetchPricesFromChasseAuxLivres(
            query,
            chasseAuxLivresCatalog,
          );
          if (result) return result;
        }
        return null;
      };
      const picClickQueries = [cleanedBarcode, ...fallbackNames];
      const fetchPicClickPrice = async () => {
        for (const query of picClickQueries) {
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

    const now = new Date();

    const providersList = [];
    if (standardPrices)
      providersList.push(
        item.shelf.type === "games" ? "PriceCharting" : "ChasseAuxLivres",
      );
    if (amcPrices) providersList.push("AchatMoinsCher");
    if (leDenicheurPrices) providersList.push("LeDenicheur");
    if (picClickPrices) providersList.push("PicClick");
    if (smartoysPrices) providersList.push("Smartoys");
    const resolvedProviders =
      item.shelf.type === "games"
        ? finalizeGamePriceProviders(providersList)
        : providersList;
    const provider =
      resolvedProviders.length > 0 ? resolvedProviders.join("+") : "None";

    const standardSource =
      item.shelf.type === "games" ? "PriceCharting" : "ChasseAuxLivres";
    const priceOffers: PriceOfferInput[] = [];
    const pushOffer = (
      source: string,
      condition: string,
      priceCents: unknown,
      rawValue: unknown,
      extra: Partial<PriceOfferInput> = {},
    ) => {
      if (typeof priceCents !== "number" || priceCents <= 0) return;
      priceOffers.push({
        source,
        condition,
        priceCents,
        rawValue,
        ...extra,
      });
    };

    if (item.shelf.type === "games") {
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
      pushOffer(
        "PriceCharting",
        "new",
        standardPrices?.priceNew,
        standardPrices,
      );
    } else {
      pushOffer(
        standardSource,
        "used",
        standardPrices?.priceUsed,
        standardPrices,
      );
      pushOffer(
        standardSource,
        "new",
        standardPrices?.priceNew,
        standardPrices,
      );
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

    const { priceNew, priceUsed, priceUsedCIB } = summarizeObservedPrices(
      item.shelf.type,
      priceOffers,
    );

    // Store/Update cache
    const cacheRecord = await prisma.barcodeCache.upsert({
      where: { barcode: cleanedBarcode },
      create: {
        barcode: cleanedBarcode,
        provider,
        shelfType: item.shelf.type,
        priceNew,
        priceUsed,
        priceUsedCIB,
        priceLastUpdated: now,
      },
      update: {
        provider,
        shelfType: item.shelf.type,
        priceNew,
        priceUsed,
        priceUsedCIB,
        priceLastUpdated: now,
      },
    });

    await replacePriceOffers(
      {
        barcodeCacheId: cacheRecord.id,
        itemId: item.id,
        metadataId: item.metadataId,
      },
      priceOffers,
    );

    return NextResponse.json({
      priceNew,
      priceUsed,
      priceUsedCIB,
      priceLastUpdated: now,
      priceSources: priceSourcesFromOffers(priceOffers, provider),
      priceObservations: serializePriceOffers(priceOffers),
    });
  } catch (error: any) {
    console.error(`[API Prices] Error handling request:`, error.message);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
