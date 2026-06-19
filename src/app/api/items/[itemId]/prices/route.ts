import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuestOrHigher } from "@/lib/auth";
import { fetchPricesFromChasseAuxLivres } from "@/services/providers/chasseauxlivres";
import { fetchPricesFromPriceCharting } from "@/services/providers/pricecharting";
import { fetchPricesFromAchatMoinsCher } from "@/services/providers/achatmoinscher";
import { fetchPricesFromLeDenicheur } from "@/services/providers/ledenicheur";
import { replacePriceOffers, type PriceOfferInput } from "@/services/evidence";
import { cleanCode } from "@/lib/barcode/query";
import { resolveItemId } from "@/lib/resolveIds";

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
      });
    }

    const cleanedBarcode = cleanCode(item.barcode);
    if (!cleanedBarcode) {
      return NextResponse.json({
        priceNew: null,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: null,
      });
    }

    // Check cache in database
    const cached = await prisma.barcodeCache.findUnique({
      where: { barcode: cleanedBarcode },
      include: { rawNames: true },
    });

    const isCacheFresh = (cacheRecord: any) => {
      if (!cacheRecord || !cacheRecord.priceLastUpdated) return false;

      const hasAnyPrice =
        cacheRecord.priceNew !== null ||
        cacheRecord.priceUsed !== null ||
        cacheRecord.priceUsedCIB !== null;

      const ageInMs =
        Date.now() - new Date(cacheRecord.priceLastUpdated).getTime();

      const cacheLifetime = hasAnyPrice ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000;
      return ageInMs < cacheLifetime;
    };

    if (cached && isCacheFresh(cached)) {
      console.log(
        `[API Prices] Returning cached prices for barcode ${cleanedBarcode}`,
      );
      return NextResponse.json({
        priceNew: cached.priceNew,
        priceUsed: cached.priceUsed,
        priceUsedCIB: cached.priceUsedCIB,
        priceLastUpdated: cached.priceLastUpdated,
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

      const [stdRes, amcRes, leDenicheurRes] = await Promise.allSettled([
        fetchPricesFromPriceCharting(
          cleanedBarcode,
          fallbackNames,
          item.shelf.name,
          isPal,
          isClassics,
        ),
        fetchPricesFromAchatMoinsCher(cleanedBarcode),
        fetchPricesFromLeDenicheur(leDenicheurQueries),
      ]);
      standardPrices = stdRes.status === "fulfilled" ? stdRes.value : null;
      amcPrices = amcRes.status === "fulfilled" ? amcRes.value : null;
      leDenicheurPrices =
        leDenicheurRes.status === "fulfilled" ? leDenicheurRes.value : null;
    } else {
      const [stdRes, amcRes, leDenicheurRes] = await Promise.allSettled([
        fetchPricesFromChasseAuxLivres(cleanedBarcode),
        fetchPricesFromAchatMoinsCher(cleanedBarcode),
        fetchPricesFromLeDenicheur(leDenicheurQueries),
      ]);
      standardPrices = stdRes.status === "fulfilled" ? stdRes.value : null;
      amcPrices = amcRes.status === "fulfilled" ? amcRes.value : null;
      leDenicheurPrices =
        leDenicheurRes.status === "fulfilled" ? leDenicheurRes.value : null;
    }

    const candidatesNew: number[] = [];
    if (
      standardPrices?.priceNew !== undefined &&
      standardPrices.priceNew !== null
    )
      candidatesNew.push(standardPrices.priceNew);
    if (amcPrices?.priceNew !== undefined && amcPrices.priceNew !== null)
      candidatesNew.push(amcPrices.priceNew);
    if (
      leDenicheurPrices?.priceNew !== undefined &&
      leDenicheurPrices.priceNew !== null
    )
      candidatesNew.push(leDenicheurPrices.priceNew);
    const priceNew =
      candidatesNew.length > 0 ? Math.min(...candidatesNew) : null;

    const candidatesUsed: number[] = [];
    if (
      standardPrices?.priceUsed !== undefined &&
      standardPrices.priceUsed !== null
    )
      candidatesUsed.push(standardPrices.priceUsed);
    if (amcPrices?.priceUsed !== undefined && amcPrices.priceUsed !== null)
      candidatesUsed.push(amcPrices.priceUsed);
    const priceUsed =
      candidatesUsed.length > 0 ? Math.min(...candidatesUsed) : null;

    const priceUsedCIB = standardPrices?.priceUsedCIB ?? null;
    const now = new Date();

    const providersList = [];
    if (standardPrices)
      providersList.push(
        item.shelf.type === "games" ? "PriceCharting" : "ChasseAuxLivres",
      );
    if (amcPrices) providersList.push("AchatMoinsCher");
    if (leDenicheurPrices) providersList.push("LeDenicheur");
    const provider =
      providersList.length > 0 ? providersList.join("+") : "None";

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
        priceNew,
        priceUsed,
        priceUsedCIB,
        priceLastUpdated: now,
      },
    });

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
    });
  } catch (error: any) {
    console.error(`[API Prices] Error handling request:`, error.message);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
