import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  barcodeCache: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  priceOffer: {
    findMany: vi.fn(),
  },
  collectRefreshBarcodePriceOffers: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    barcodeCache: h.barcodeCache,
    priceOffer: h.priceOffer,
  },
}));

vi.mock("@/core/catalog/barcodePrices", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/core/catalog/barcodePrices")>();
  return {
    ...actual,
    collectRefreshBarcodePriceOffers: h.collectRefreshBarcodePriceOffers,
  };
});

import {
  alignBarcodePricesForItemNames,
  filterItemPriceOffers,
  filterPriceOfferInputsForPersist,
  getCachedBarcodePrices,
  getCachedItemPrices,
  summarizeObservedPrices,
  summarizeShelfItemPrices,
  type BarcodePricesResult,
} from "@/core/commerce/pricing/resolver";

function offer(overrides: Record<string, unknown>) {
  return {
    source: "PriceCharting",
    productName: null,
    merchantName: null,
    condition: "loose",
    priceCents: 1200,
    currency: "EUR",
    sourceUrl: null,
    offerCount: null,
    observedAt: new Date("2026-06-19T12:00:00.000Z"),
    ...overrides,
  };
}

/** Cached barcode row shape after `serializePriceOffers` (server-stamped traits). */
function serializedPriceObservation(
  overrides: Record<string, unknown> & { source: string; priceCents: number },
) {
  const source = String(overrides.source);
  return {
    productName: null,
    merchantName: null,
    condition: "new",
    currency: "EUR",
    sourceUrl: null,
    offerCount: null,
    observedAt: "2026-06-19T12:00:00.000Z",
    isReferencePriceSource: false,
    sourceDisplayLabel: source,
    ...overrides,
  };
}

function cachedBarcodePrices(
  overrides: Omit<
    BarcodePricesResult,
    "priceSourceDisplayNames" | "isReferencePriceOnly"
  > &
    Partial<
      Pick<
        BarcodePricesResult,
        "priceSourceDisplayNames" | "isReferencePriceOnly"
      >
    >,
): BarcodePricesResult {
  const sources = overrides.priceSources;
  return {
    priceSourceDisplayNames: sources,
    isReferencePriceOnly: false,
    ...overrides,
  };
}

describe("getCachedBarcodePrices", () => {
  beforeEach(() => {
    h.barcodeCache.findUnique.mockReset();
    h.barcodeCache.findMany.mockReset();
    h.priceOffer.findMany.mockReset();
    h.barcodeCache.findMany.mockResolvedValue([]);
  });

  it("keeps barcode summary values when observations miss a condition", async () => {
    h.barcodeCache.findUnique.mockResolvedValue({
      id: 42,
      shelfType: "games",
      provider: "PriceCharting+LeDenicheur",
      priceNew: null,
      priceUsed: 900,
      priceUsedCIB: 1400,
      priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
    });
    h.priceOffer.findMany.mockResolvedValue([
      offer({
        source: "LeDenicheur",
        condition: "new",
        priceCents: 3596,
      }),
    ]);

    const prices = await getCachedBarcodePrices("1234567890123", "games");

    expect(prices?.priceNew).toBe(3596);
    expect(prices?.priceUsed).toBe(900);
    expect(prices?.priceUsedCIB).toBe(1400);
  });
});

describe("getCachedItemPrices", () => {
  beforeEach(() => {
    h.priceOffer.findMany.mockReset();
  });

  it("reads item-scoped offers without a barcode", async () => {
    h.priceOffer.findMany.mockResolvedValue([
      offer({ source: "eBay", condition: "used", priceCents: 1490 }),
      offer({ source: "LeDenicheur", condition: "new", priceCents: 1400 }),
    ]);

    const prices = await getCachedItemPrices("movies", {
      itemId: "item-1",
      metadataId: "meta-1",
    });

    expect(h.priceOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ itemId: "item-1" }, { metadataId: "meta-1" }] },
      }),
    );
    expect(prices?.priceUsed).toBeNull();
    expect(prices?.priceNew).toBe(1400);
    expect(prices?.priceSources).toEqual(["LeDenicheur"]);
  });
});

describe("summarizeShelfItemPrices", () => {
  beforeEach(() => {
    h.barcodeCache.findMany.mockReset();
    h.priceOffer.findMany.mockReset();
    h.collectRefreshBarcodePriceOffers.mockReset();
    h.collectRefreshBarcodePriceOffers.mockResolvedValue([]);
  });

  it("fills TCG priceEstimated from evidence-only printKey sources", async () => {
    h.barcodeCache.findMany.mockResolvedValue([]);
    h.priceOffer.findMany.mockResolvedValue([]);
    h.collectRefreshBarcodePriceOffers.mockResolvedValue([
      {
        source: "Collection Naruto",
        condition: "estimated",
        priceCents: 2000,
        productName: "NI-019",
      },
    ]);

    const map = await summarizeShelfItemPrices(
      "tcg",
      [
        {
          id: "item-ni019",
          barcode: null,
          name: "NI-019",
          printKey: "naruto:ni-0019",
        },
      ],
      "Naruto Carddass",
    );

    expect(h.collectRefreshBarcodePriceOffers).toHaveBeenCalledWith(
      expect.objectContaining({
        printKey: "naruto:ni-0019",
        evidenceOnly: true,
        shelfType: "tcg",
      }),
    );
    expect(map.get("item-ni019")).toEqual({
      priceNew: null,
      priceUsed: null,
      priceUsedCIB: null,
      priceEstimated: 2000,
      priceLastUpdated: null,
    });
  });

  it("skips printKey estimate fill when priceEstimated already present", async () => {
    h.barcodeCache.findMany.mockResolvedValue([]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-ni019",
        source: "Collection Naruto",
        productName: "NI-019",
        condition: "estimated",
        priceCents: 1500,
        observedAt: new Date("2026-09-01T12:00:00.000Z"),
      },
    ]);

    const map = await summarizeShelfItemPrices(
      "tcg",
      [
        {
          id: "item-ni019",
          barcode: null,
          name: "NI-019",
          printKey: "naruto:ni-0019",
        },
      ],
      "Naruto Carddass",
    );

    expect(h.collectRefreshBarcodePriceOffers).not.toHaveBeenCalled();
    expect(map.get("item-ni019")?.priceEstimated).toBe(1500);
  });

  it("falls back to item-scoped offers when barcode is missing", async () => {
    h.barcodeCache.findMany.mockResolvedValue([]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-1",
        source: "eBay",
        productName: "Ball x Pit PS5",
        condition: "used",
        priceCents: 3499,
        observedAt: new Date("2026-06-20T12:00:00.000Z"),
      },
    ]);

    const map = await summarizeShelfItemPrices("games", [
      { id: "item-1", barcode: null },
    ]);

    expect(map.get("item-1")).toEqual({
      priceNew: null,
      priceUsed: null,
      priceUsedCIB: 3499,
      priceLastUpdated: new Date("2026-06-20T12:00:00.000Z"),
    });
  });

  it("matches Bomber Man 64 eBay copy with version française noise", async () => {
    h.barcodeCache.findMany.mockResolvedValue([]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-bomber",
        source: "eBay",
        productName:
          "Bomber Man 64 - version française FAH PAL - Nintendo 64 N64",
        condition: "used",
        priceCents: 6999,
        observedAt: new Date("2026-07-16T10:18:23.313Z"),
      },
    ]);

    const map = await summarizeShelfItemPrices(
      "games",
      [
        {
          id: "item-bomber",
          barcode: null,
          name: "Bomber Man 64",
          metadataTitle: "Bomber Man 64",
          aliases: ["Bomberman 64"],
        },
      ],
      "Nintendo 64",
    );

    expect(map.get("item-bomber")).toEqual({
      priceNew: null,
      priceUsed: null,
      priceUsedCIB: 6999,
      priceLastUpdated: new Date("2026-07-16T10:18:23.313Z"),
    });
  });

  it("falls back to barcode cache when offers are missing", async () => {
    h.barcodeCache.findMany.mockResolvedValue([
      {
        id: 1,
        barcode: "1234567890123",
        priceNew: 4999,
        priceUsed: 2999,
        priceUsedCIB: 3499,
        priceLastUpdated: new Date("2026-06-19T10:00:00.000Z"),
      },
    ]);
    h.priceOffer.findMany.mockResolvedValue([]);

    const map = await summarizeShelfItemPrices("games", [
      { id: "item-1", barcode: "1234567890123" },
    ]);

    expect(map.get("item-1")).toEqual({
      priceNew: 4999,
      priceUsed: 2999,
      priceUsedCIB: 3499,
      priceLastUpdated: new Date("2026-06-19T10:00:00.000Z"),
    });
  });

  it("recomputes from filtered offers instead of stale barcode cache", async () => {
    h.barcodeCache.findMany.mockResolvedValue([
      {
        id: 1,
        barcode: "1234567890123",
        priceNew: null,
        priceUsed: 8581,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T10:00:00.000Z"),
      },
    ]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-1",
        barcodeCacheId: 1,
        source: "Smartoys",
        productName: "RISE OF THE TOMB RAIDER 20 YEAR CELEBRATION EDITION PS4",
        condition: "used",
        priceCents: 1100,
        observedAt: new Date("2026-06-20T12:00:00.000Z"),
      },
      {
        itemId: "item-1",
        barcodeCacheId: 1,
        source: "LeDenicheur",
        productName: "Rise of the Tomb Raider: 20 Year Celebration Edition",
        condition: "used",
        priceCents: 1443,
        observedAt: new Date("2026-06-20T11:00:00.000Z"),
      },
      {
        itemId: "item-1",
        barcodeCacheId: 1,
        source: "eBay",
        productName: "Rise of the Tomb Raider 20 Year Celebration Edition PS4",
        condition: "used",
        priceCents: 1903,
        observedAt: new Date("2026-06-20T10:30:00.000Z"),
      },
      {
        itemId: "item-1",
        barcodeCacheId: 1,
        source: "AchatMoinsCher",
        productName: null,
        condition: "used",
        priceCents: 8581,
        observedAt: new Date("2026-06-20T10:00:00.000Z"),
      },
    ]);

    const map = await summarizeShelfItemPrices(
      "games",
      [
        {
          id: "item-1",
          barcode: "1234567890123",
          name: "Rise of the Tomb Raider - 20eme Anniversaire",
        },
      ],
      "PlayStation 4",
    );

    expect(map.get("item-1")?.priceUsed).toBeNull();
    expect(map.get("item-1")?.priceUsedCIB).toBe(1272);
  });

  it("does not fall back to stale barcode cache when offers were all filtered", async () => {
    h.barcodeCache.findMany.mockResolvedValue([
      {
        id: 1,
        barcode: "9781234567890",
        shelfType: "books",
        priceNew: 11690,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T10:00:00.000Z"),
      },
    ]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-1",
        barcodeCacheId: 1,
        source: "eBay",
        productName: "The Promised Neverland Box Set Vol. 1-20",
        condition: "new",
        priceCents: 11690,
        observedAt: new Date("2026-06-20T12:00:00.000Z"),
      },
    ]);

    const map = await summarizeShelfItemPrices(
      "books",
      [
        {
          id: "item-1",
          barcode: "9781234567890",
          name: "The Promised Neverland n°01",
        },
      ],
      "Mangas",
    );

    expect(map.get("item-1")).toBeUndefined();
  });

  it("matches item-page fallback when strict filtering fails but cache aggregate is trusted", async () => {
    h.barcodeCache.findMany.mockResolvedValue([
      {
        id: 1,
        barcode: "9781234567890",
        shelfType: "books",
        priceNew: 5101,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T10:00:00.000Z"),
      },
    ]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-1",
        barcodeCacheId: 1,
        source: "eBay",
        productName: "Graphics Tablet Pen Display 2 Monitor 2K IPS",
        condition: "new",
        priceCents: 9999,
        observedAt: new Date("2026-06-20T12:00:00.000Z"),
      },
    ]);

    const map = await summarizeShelfItemPrices(
      "books",
      [
        {
          id: "item-1",
          barcode: "9781234567890",
          name: "L'Art et la Création de Arcane",
        },
      ],
      "Artbooks",
    );

    expect(map.get("item-1")?.priceNew).toBe(5101);
  });

  it("drops wrong-issue listings instead of surfacing unfiltered aggregates", async () => {
    h.barcodeCache.findMany.mockResolvedValue([]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-1",
        source: "eBay",
        productName: "livre super picsou géant N° 183",
        condition: "used",
        priceCents: 450,
        observedAt: new Date("2026-06-20T12:00:00.000Z"),
      },
    ]);

    const map = await summarizeShelfItemPrices(
      "books",
      [
        {
          id: "item-1",
          barcode: null,
          name: "Super Picsou Géant n°07",
        },
      ],
      "Super Picsou Géant",
    );

    expect(map.get("item-1")?.priceUsed).toBeUndefined();
  });

  it("clears aggregates when every named listing is unrelated to the item", async () => {
    h.barcodeCache.findMany.mockResolvedValue([]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-1",
        source: "ChocoBonPlan",
        productName:
          "Disney Infinity 3.0 : Star Wars – pack de démarrage sur PS4",
        condition: "new",
        priceCents: 1990,
        observedAt: new Date("2026-06-20T12:00:00.000Z"),
      },
      {
        itemId: "item-1",
        source: "LeDenicheur",
        productName: "Disney Infinity 3.0 - Power Disc 4-Pack Tomorrowland",
        condition: "new",
        priceCents: 841,
        observedAt: new Date("2026-06-20T11:00:00.000Z"),
      },
    ]);

    const map = await summarizeShelfItemPrices(
      "games",
      [
        {
          id: "item-1",
          barcode: null,
          name: "Disney Infinity - Play Without Limits",
        },
      ],
      "PlayStation 4",
    );

    expect(map.get("item-1")?.priceNew).toBeUndefined();
  });
});

describe("alignBarcodePricesForItemNames", () => {
  it("empties orphan PriceCharting aggregates when a finish edition mismatches", () => {
    // Generic PS2 Slim cached under the Pink barcode must not keep €44 summary
    // after observations are filtered out.
    const aligned = alignBarcodePricesForItemNames(
      "hardware",
      ["PlayStation 2 Slim Rose"],
      cachedBarcodePrices({
        priceNew: 48236,
        priceUsed: 4410,
        priceUsedCIB: 5412,
        priceLastUpdated: new Date("2026-07-23T12:00:00.000Z"),
        priceSources: ["PriceCharting"],
        priceObservations: [
          serializedPriceObservation({
            source: "PriceCharting",
            productName: "Playstation 2 Slim System",
            condition: "loose",
            priceCents: 4410,
            sourceUrl:
              "https://www.pricecharting.com/game/pal-playstation-2/playstation-2-slim-system",
          }),
          serializedPriceObservation({
            source: "PriceCharting",
            productName: "Playstation 2 Slim System",
            condition: "cib",
            priceCents: 5412,
            sourceUrl:
              "https://www.pricecharting.com/game/pal-playstation-2/playstation-2-slim-system",
          }),
          serializedPriceObservation({
            source: "PriceCharting",
            productName: "Playstation 2 Slim System",
            condition: "new",
            priceCents: 48236,
            sourceUrl:
              "https://www.pricecharting.com/game/pal-playstation-2/playstation-2-slim-system",
          }),
        ],
      }),
      "Consoles",
    );

    expect(aligned.priceUsed).toBeNull();
    expect(aligned.priceUsedCIB).toBeNull();
    expect(aligned.priceNew).toBeNull();
    expect(aligned.priceObservations).toEqual([]);
  });

  it("keeps Lorcast FX ~estimate when EN catalog title misses the FR print", () => {
    const aligned = alignBarcodePricesForItemNames(
      "tcg",
      ["Ariel - Sur des jambes humaines"],
      cachedBarcodePrices({
        priceNew: null,
        priceUsed: null,
        priceUsedCIB: null,
        priceEstimated: 6,
        priceLastUpdated: new Date("2026-07-31T12:00:00.000Z"),
        priceSources: ["Lorcast"],
        priceObservations: [
          serializedPriceObservation({
            source: "Lorcast",
            productName: "Ariel - On Human Legs",
            condition: "new",
            priceCents: 7,
            currency: "USD",
            metadataScoped: true,
            sourceUrl: "https://lorcast.com/cards/1/1",
          }),
          serializedPriceObservation({
            source: "Lorcast",
            productName: "Ariel - On Human Legs (foil)",
            condition: "foil",
            priceCents: 63,
            currency: "USD",
            metadataScoped: true,
            sourceUrl: "https://lorcast.com/cards/1/1",
          }),
        ],
      }),
      "Lorcana",
    );

    expect(aligned.priceEstimated).toBe(6);
    expect(aligned.priceNew).toBeNull();
    expect(aligned.priceObservations).toHaveLength(2);
  });

  it("keeps Lorcast FX when FR/EN titles share no tokens (printKey match)", () => {
    // Song cards: "Ce rêve bleu" ↔ "A Whole New World" — zero shared tokens.
    // Legacy offers may lack metadataScoped in rawValue.
    const aligned = alignBarcodePricesForItemNames(
      "tcg",
      ["Ce rêve bleu"],
      cachedBarcodePrices({
        priceNew: null,
        priceUsed: null,
        priceUsedCIB: null,
        priceEstimated: 136,
        priceLastUpdated: new Date("2026-07-31T12:00:00.000Z"),
        priceSources: ["Lorcast"],
        priceObservations: [
          serializedPriceObservation({
            source: "Lorcast",
            productName: "A Whole New World",
            condition: "new",
            priceCents: 156,
            currency: "USD",
            sourceUrl: "https://lorcast.com/cards/1/195",
          }),
          serializedPriceObservation({
            source: "Lorcast",
            productName: "A Whole New World (foil)",
            condition: "foil",
            priceCents: 683,
            currency: "USD",
            sourceUrl: "https://lorcast.com/cards/1/195",
          }),
        ],
      }),
      "Lorcana",
    );

    expect(aligned.priceEstimated).toBe(136);
    expect(aligned.priceObservations).toHaveLength(2);
  });

  it("keeps cached aggregates when every listing title is noisy", () => {
    const aligned = alignBarcodePricesForItemNames(
      "books",
      ["L'Art et la Création de Arcane"],
      cachedBarcodePrices({
        priceNew: 5101,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
        priceSources: ["ChasseAuxLivres"],
        priceObservations: [
          serializedPriceObservation({
            source: "eBay",
            productName: "Graphics Tablet Pen Display 2 Monitor 2K IPS",
            condition: "new",
            priceCents: 9999,
          }),
        ],
      }),
    );

    expect(aligned.priceNew).toBe(5101);
    expect(aligned.priceObservations).toEqual([]);
  });

  it("clears cached aggregates when every named listing is a lot or non-book product", () => {
    const aligned = alignBarcodePricesForItemNames(
      "books",
      ["The Promised Neverland n°01"],
      cachedBarcodePrices({
        priceNew: 11690,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
        priceSources: ["eBay"],
        priceObservations: [
          serializedPriceObservation({
            source: "eBay",
            productName: "The Promised Neverland Box Set Vol. 1-20",
            condition: "new",
            priceCents: 11690,
          }),
        ],
      }),
    );

    expect(aligned.priceNew).toBeNull();
    expect(aligned.priceObservations).toEqual([]);
  });

  it("clears cached aggregates when every named listing targets another issue", () => {
    const aligned = alignBarcodePricesForItemNames(
      "books",
      ["Super Picsou Géant n°07"],
      cachedBarcodePrices({
        priceNew: 450,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
        priceSources: ["eBay"],
        priceObservations: [
          serializedPriceObservation({
            source: "eBay",
            productName: "Super Picsou Géant n°183 - Occasion",
            condition: "used",
            priceCents: 450,
          }),
        ],
      }),
    );

    expect(aligned.priceNew).toBeNull();
    expect(aligned.priceObservations).toEqual([]);
  });

  it("keeps PriceCharting aggregates when FR primary misses EN catalog title", () => {
    const aligned = alignBarcodePricesForItemNames(
      "games",
      ["Medal of Honor: Le soleil Levant"],
      cachedBarcodePrices({
        priceNew: 3621,
        priceUsed: 263,
        priceUsedCIB: 502,
        priceLastUpdated: new Date("2026-07-19T12:00:00.000Z"),
        priceSources: ["PriceCharting"],
        priceObservations: [
          serializedPriceObservation({
            source: "PriceCharting",
            productName: "Medal of Honor Rising Sun",
            condition: "loose",
            priceCents: 263,
          }),
          serializedPriceObservation({
            source: "PriceCharting",
            productName: "Medal of Honor Rising Sun",
            condition: "cib",
            priceCents: 502,
          }),
          serializedPriceObservation({
            source: "PriceCharting",
            productName: "Medal of Honor Rising Sun",
            condition: "new",
            priceCents: 3621,
          }),
        ],
      }),
      "PlayStation 2",
    );

    expect(aligned.priceUsed).toBe(263);
    expect(aligned.priceUsedCIB).toBe(502);
    expect(aligned.priceObservations).toHaveLength(3);
  });

  it("still clears PriceCharting spinoff aggregates that only share a franchise lead", () => {
    const aligned = alignBarcodePricesForItemNames(
      "games",
      ["FIFA 2002"],
      cachedBarcodePrices({
        priceNew: 1000,
        priceUsed: 500,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-07-19T12:00:00.000Z"),
        priceSources: ["PriceCharting"],
        priceObservations: [
          serializedPriceObservation({
            source: "PriceCharting",
            productName: "FIFA 2002: Road to FIFA World Cup",
            condition: "loose",
            priceCents: 500,
          }),
          serializedPriceObservation({
            source: "PriceCharting",
            productName: "FIFA 2002: Road to FIFA World Cup",
            condition: "new",
            priceCents: 1000,
          }),
        ],
      }),
      "PlayStation 2",
    );

    expect(aligned.priceUsed).toBeNull();
    expect(aligned.priceObservations).toEqual([]);
  });

  it("recomputes from aligned listings and drops unrelated rows", () => {
    const aligned = alignBarcodePricesForItemNames(
      "books",
      ["L'Art et la Création de Arcane"],
      cachedBarcodePrices({
        priceNew: 9999,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
        priceSources: ["eBay"],
        priceObservations: [
          serializedPriceObservation({
            source: "eBay",
            productName:
              "The Art and Making of Arcane League Of Legends AVAILABLE",
            condition: "new",
            priceCents: 5101,
          }),
          serializedPriceObservation({
            source: "eBay",
            productName: "Graphics Tablet Pen Display 2 Monitor 2K IPS",
            condition: "new",
            priceCents: 9999,
          }),
        ],
      }),
    );

    expect(aligned.priceNew).toBe(5101);
    expect(aligned.priceObservations).toHaveLength(1);
  });

  it("clears short-title game prices when every named listing is unrelated", () => {
    const aligned = alignBarcodePricesForItemNames(
      "games",
      ["Minecraft"],
      cachedBarcodePrices({
        priceNew: 3357,
        priceUsed: null,
        priceUsedCIB: 49990,
        priceLastUpdated: new Date("2026-07-09T17:47:13.430Z"),
        priceSources: ["LeDenicheur", "ChocoBonPlan"],
        priceObservations: [
          serializedPriceObservation({
            source: "LeDenicheur",
            productName:
              "LEGO Minecraft 21273 L'attaque du village de ballons Ghast",
            condition: "new",
            priceCents: 5290,
          }),
          serializedPriceObservation({
            source: "LeDenicheur",
            productName: "Nintendo New 2DS XL - Minecraft Creeper Edition",
            condition: "used",
            priceCents: 49990,
          }),
          serializedPriceObservation({
            source: "ChocoBonPlan",
            productName: "Minecraft Legends Deluxe Edition sur PS5",
            condition: "new",
            priceCents: 1424,
          }),
        ],
      }),
      "PlayStation Vita",
    );

    expect(aligned.priceNew).toBeNull();
    expect(aligned.priceUsed).toBeNull();
    expect(aligned.priceObservations).toEqual([]);
  });

  it("clears vinyl merch prices for short franchise game titles", () => {
    const aligned = alignBarcodePricesForItemNames(
      "games",
      ["Little Big Planet"],
      cachedBarcodePrices({
        priceNew: 5999,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-07-09T18:04:59.361Z"),
        priceSources: ["ChocoBonPlan"],
        priceObservations: [
          serializedPriceObservation({
            source: "ChocoBonPlan",
            productName: "[Précommande] Vinyle Little Big Planet 2LP",
            condition: "new",
            priceCents: 5999,
          }),
        ],
      }),
      "PlayStation Vita",
    );

    expect(aligned.priceNew).toBeNull();
    expect(aligned.priceObservations).toEqual([]);
  });

  it("drops game listings on the wrong platform for the shelf", () => {
    const aligned = alignBarcodePricesForItemNames(
      "games",
      ["Les Gardiens de la Galaxie - The Telltale Series"],
      cachedBarcodePrices({
        priceNew: 2355,
        priceUsed: null,
        priceUsedCIB: 26081,
        priceLastUpdated: new Date("2026-06-28T12:00:00.000Z"),
        priceSources: ["Smartoys", "LeDenicheur", "eBay"],
        priceObservations: [
          serializedPriceObservation({
            source: "Smartoys",
            productName: "LES GARDIENS DE LA GALAXIE - THE TELLTALE SERIES",
            condition: "used",
            priceCents: 1200,
            observedAt: "2026-06-28T12:00:00.000Z",
          }),
          serializedPriceObservation({
            source: "LeDenicheur",
            productName: "Guardians of the Galaxy: The Telltale Series (PC)",
            condition: "used",
            priceCents: 100000,
            observedAt: "2026-06-28T12:00:00.000Z",
          }),
          serializedPriceObservation({
            source: "eBay",
            productName:
              "Marvel's Guardians Of The Galaxy : The Telltale Series (Xbox One)",
            condition: "used",
            priceCents: 2235,
            observedAt: "2026-06-28T12:00:00.000Z",
          }),
        ],
      }),
      "PlayStation 4",
    );

    expect(aligned.priceUsed).toBeNull();
    expect(aligned.priceUsedCIB).toBe(1200);
    expect(aligned.priceObservations).toHaveLength(1);
    expect(aligned.priceObservations[0]?.source).toBe("Smartoys");
  });

  it("drops a PC digital listing matched only through Neo Geo body text", () => {
    const aligned = alignBarcodePricesForItemNames(
      "games",
      ["Shock Troopers"],
      cachedBarcodePrices({
        priceNew: 182,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-07-04T07:16:38.882Z"),
        priceSources: ["LeDenicheur", "ChasseAuxLivres"],
        priceObservations: [
          serializedPriceObservation({
            source: "LeDenicheur",
            productName: "Shock Troopers Neo Geo (PC)",
            condition: "new",
            priceCents: 182,
            observedAt: "2026-07-04T07:16:38.882Z",
          }),
          serializedPriceObservation({
            source: "ChasseAuxLivres",
            productName: null,
            condition: "new",
            priceCents: 7999,
            observedAt: "2026-07-04T07:16:38.882Z",
          }),
        ],
      }),
      "NEO GEO AES+",
    );

    expect(aligned.priceNew).toBeNull();
    expect(aligned.priceUsed).toBeNull();
    expect(aligned.priceUsedCIB).toBeNull();
    expect(aligned.priceObservations).toHaveLength(0);
  });

  it("trims an isolated high outlier among aligned new prices", () => {
    const aligned = alignBarcodePricesForItemNames(
      "games",
      ["Dark Pictures: The Devil in Me"],
      cachedBarcodePrices({
        priceNew: 3333,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-28T12:00:00.000Z"),
        priceSources: ["Smartoys", "AchatMoinsCher", "LeDenicheur"],
        priceObservations: [
          serializedPriceObservation({
            source: "AchatMoinsCher",
            productName: "The Dark Pictures Anthology: The Devil in Me",
            condition: "new",
            priceCents: 2278,
            observedAt: "2026-06-28T12:00:00.000Z",
          }),
          serializedPriceObservation({
            source: "Smartoys",
            productName: "THE DARK PICTURES ANTHOLOGY: THE DEVIL IN ME",
            condition: "new",
            priceCents: 2995,
            observedAt: "2026-06-28T12:00:00.000Z",
          }),
          serializedPriceObservation({
            source: "LeDenicheur",
            productName: "The Dark Pictures Anthology: The Devil in Me",
            condition: "new",
            priceCents: 7190,
            observedAt: "2026-06-28T12:00:00.000Z",
          }),
        ],
      }),
      "PlayStation 4",
    );

    expect(aligned.priceNew).toBe(2637);
    expect(aligned.priceObservations).toHaveLength(2);
  });
});

describe("filterPriceOfferInputsForPersist", () => {
  it("drops wrong-edition listings before write using the display identity gate", () => {
    const filtered = filterPriceOfferInputsForPersist(
      "boardgames",
      null,
      ["Black Stories - Femmes Fatales"],
      [
        {
          source: "LeDenicheur",
          productName: "Black Stories: Funny Death Edition 2",
          condition: "new",
          priceCents: 1999,
          sourceUrl: "https://ledenicheur.fr/product.php?p=4955683",
        },
        {
          source: "LeDenicheur",
          productName: "Black Stories - Femmes Fatales",
          condition: "new",
          priceCents: 1499,
          sourceUrl: "https://ledenicheur.fr/product.php?p=111",
        },
      ],
    );

    expect(filtered.map((offer) => offer.priceCents)).toEqual([1499]);
  });
});

describe("filterItemPriceOffers", () => {
  it("keeps PriceCharting console System chrome on hardware shelves", () => {
    const filtered = filterItemPriceOffers(
      "hardware",
      "Consoles",
      ["Nintendo 64"],
      [
        {
          source: "PriceCharting",
          productName: "Nintendo 64 System",
          condition: "loose",
          priceCents: 8175,
        },
        {
          source: "PriceCharting",
          productName: "Nintendo 64 System",
          condition: "cib",
          priceCents: 21364,
        },
        {
          source: "LeDenicheur",
          productName: "Nintendo Switch OLED 64Go",
          condition: "used",
          priceCents: 20899,
        },
        {
          source: "AchatMoinsCher",
          condition: "used",
          priceCents: 119,
        },
      ],
    );

    expect(
      filtered.map((row) => `${row.source}:${row.condition}:${row.priceCents}`),
    ).toEqual(["PriceCharting:loose:8175", "PriceCharting:cib:21364"]);
  });

  it("keeps Back Market refurbished hardware used near PriceCharting CIB", () => {
    const filtered = filterItemPriceOffers(
      "hardware",
      "Consoles",
      ["Nintendo Wii Bleu", "Blue Nintendo Wii System"],
      [
        {
          source: "AchatMoinsCher",
          condition: "new",
          priceCents: 1599,
        },
        {
          source: "eBay",
          productName: "Nintendo Wii Bleu",
          condition: "used",
          priceCents: 6900,
        },
        {
          source: "PriceCharting",
          productName: "Blue Nintendo Wii System",
          condition: "loose",
          priceCents: 9584,
        },
        {
          source: "PriceCharting",
          productName: "Blue Nintendo Wii System",
          condition: "cib",
          priceCents: 15481,
        },
        {
          source: "PriceCharting",
          productName: "Blue Nintendo Wii System",
          condition: "new",
          priceCents: 37286,
        },
        {
          source: "Back Market",
          productName: "Nintendo Wii - Bleu",
          condition: "used",
          priceCents: 15200,
        },
      ],
    );

    expect(
      filtered.map((row) => `${row.source}:${row.condition}:${row.priceCents}`),
    ).toEqual([
      "eBay:used:6900",
      "PriceCharting:loose:9584",
      "PriceCharting:cib:15481",
      "PriceCharting:new:37286",
      "Back Market:used:15200",
    ]);
  });

  it("keeps PC/eBay/BM when the shelf title is FR-only (no EN bag)", () => {
    // Regression: areLikelySameProduct(Bleu, Blue System) used to drop PC, then
    // an unnamed AMC “new” ceiling wiped the remaining used offers.
    const filtered = filterItemPriceOffers(
      "hardware",
      "Consoles",
      ["Nintendo Wii Bleu"],
      [
        {
          source: "AchatMoinsCher",
          condition: "new",
          priceCents: 1599,
        },
        {
          source: "eBay",
          productName: "Nintendo Wii Bleu",
          condition: "used",
          priceCents: 6900,
        },
        {
          source: "PriceCharting",
          productName: "Blue Nintendo Wii System",
          condition: "loose",
          priceCents: 9584,
        },
        {
          source: "PriceCharting",
          productName: "Blue Nintendo Wii System",
          condition: "cib",
          priceCents: 15481,
        },
        {
          source: "PriceCharting",
          productName: "Blue Nintendo Wii System",
          condition: "new",
          priceCents: 37286,
        },
        {
          source: "Back Market",
          productName: "Nintendo Wii - Bleu",
          condition: "used",
          priceCents: 15200,
        },
      ],
    );

    expect(
      filtered.map((row) => `${row.source}:${row.condition}:${row.priceCents}`),
    ).toEqual([
      "eBay:used:6900",
      "PriceCharting:loose:9584",
      "PriceCharting:cib:15481",
      "PriceCharting:new:37286",
      "Back Market:used:15200",
    ]);
  });

  it("keeps PriceCharting 60GB Console offers for FR 60Go hardware titles", () => {
    const filtered = filterItemPriceOffers(
      "hardware",
      "Consoles",
      ["PlayStation 3 60Go"],
      [
        {
          source: "PriceCharting",
          productName: "Playstation 3 60GB Console",
          condition: "loose",
          priceCents: 16411,
        },
        {
          source: "PriceCharting",
          productName: "Playstation 3 60GB Console",
          condition: "cib",
          priceCents: 27806,
        },
        {
          source: "LeDenicheur",
          productName:
            "Sony PlayStation Plus Essential - Carte d'abonnement de 12 mois",
          condition: "new",
          priceCents: 5999,
        },
      ],
    );

    expect(
      filtered.map((row) => `${row.source}:${row.condition}:${row.priceCents}`),
    ).toEqual(["PriceCharting:loose:16411", "PriceCharting:cib:27806"]);
  });

  it("drops unnamed shop rows when a titled listing matches", () => {
    const filtered = filterItemPriceOffers(
      "games",
      "PlayStation 4",
      ["A Way Out"],
      [
        {
          source: "PriceCharting",
          condition: "loose",
          priceCents: 3300,
        },
        {
          source: "PriceCharting",
          condition: "new",
          priceCents: 7734,
        },
        {
          source: "AchatMoinsCher",
          condition: "used",
          priceCents: 119,
        },
        {
          source: "AchatMoinsCher",
          condition: "new",
          priceCents: 817,
        },
        {
          source: "eBay",
          productName: "A Way Out PlayStation 4",
          condition: "used",
          priceCents: 4743,
        },
      ],
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "PriceCharting:loose",
      "PriceCharting:new",
      "eBay:used",
    ]);
  });

  it("aligns unnamed PriceCharting rows via sourceUrl slug", () => {
    const filtered = filterItemPriceOffers(
      "games",
      "PlayStation 2",
      ["FIFA 2002"],
      [
        {
          source: "PriceCharting",
          condition: "cib",
          priceCents: 874,
          sourceUrl:
            "https://www.pricecharting.com/game/jp-playstation-2/fifa-2002-road-to-fifa-world-cup",
        },
        {
          source: "PriceCharting",
          condition: "loose",
          priceCents: 278,
          sourceUrl:
            "https://www.pricecharting.com/game/pal-playstation-2/fifa-football-2002",
        },
      ],
    );

    expect(filtered.map((row) => `${row.condition}:${row.priceCents}`)).toEqual(
      ["loose:278"],
    );
  });

  it("drops homonym marketplace rows for short single-word game titles", () => {
    const filtered = filterItemPriceOffers(
      "games",
      "PlayStation 4",
      ["Transistor"],
      [
        {
          source: "PriceCharting",
          condition: "loose",
          priceCents: 7024,
        },
        {
          source: "ChocoBonPlan",
          productName: "Transistor sur PS4",
          condition: "new",
          priceCents: 3100,
        },
        {
          source: "LeDenicheur",
          productName: "Helly Hansen Transistor 30L",
          condition: "new",
          priceCents: 11190,
        },
        {
          source: "eBay",
          productName: "Transistor BD139",
          condition: "used",
          priceCents: 370,
        },
      ],
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "PriceCharting:loose",
      "ChocoBonPlan:new",
    ]);
  });

  it("drops Metal Slug Tactics when the item is the Neo Geo base game", () => {
    const filtered = filterItemPriceOffers(
      "games",
      "NEO GEO AES+",
      ["Metal Slug"],
      [
        {
          source: "PriceCharting",
          condition: "loose",
          priceCents: 13999,
        },
        {
          source: "ChocoBonPlan",
          productName: "Metal Slug Tactics sur Switch",
          condition: "new",
          priceCents: 1999,
        },
        {
          source: "AchatMoinsCher",
          productName: null,
          condition: "new",
          priceCents: 7350,
        },
      ],
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "PriceCharting:loose",
    ]);
  });

  it("drops super deluxe listings for a deluxe edition item", () => {
    const filtered = filterItemPriceOffers(
      "games",
      "PlayStation 4",
      ["Borderlands 3 - Edition Deluxe"],
      [
        {
          source: "Smartoys",
          productName: "Borderlands 3 : Edition Super Deluxe",
          condition: "used",
          priceCents: 4500,
        },
        {
          source: "eBay",
          productName: "Borderlands 3 [ Deluxe Edition ] (PS4)",
          condition: "used",
          priceCents: 2390,
        },
        {
          source: "LeDenicheur",
          productName: "Borderlands 3 - Deluxe Edition (Xbox One | Series X/S)",
          condition: "used",
          priceCents: 2990,
        },
      ],
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "eBay:used",
    ]);
  });

  it("drops manga lot and tcg listings for numbered books", () => {
    const filtered = filterItemPriceOffers(
      "books",
      "Mangas",
      ["Dragon Ball Super n°01"],
      [
        {
          source: "eBay",
          productName: "Dragon Ball Super Mythic Booster Box",
          condition: "new",
          priceCents: 9900,
        },
        {
          source: "LeDenicheur",
          productName: "Dragon Ball Super Tome 1",
          condition: "used",
          priceCents: 790,
        },
      ],
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "LeDenicheur:used",
    ]);
  });

  it("keeps unnamed ChasseAuxLivres rows when titled listings fail volume match", () => {
    const filtered = filterItemPriceOffers(
      "books",
      "Super Picsou Géant",
      ["Super Picsou Géant n°06"],
      [
        {
          source: "ChasseAuxLivres",
          condition: "used",
          priceCents: 3000,
        },
        {
          source: "eBay",
          productName: "livre super picsou géant N° 183",
          condition: "used",
          priceCents: 450,
        },
      ],
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "ChasseAuxLivres:used",
    ]);
  });

  it("drops game accessory listings and prefers barcode-scoped shop prices", () => {
    const filtered = filterItemPriceOffers(
      "games",
      "Xbox 360",
      ["Assassin's Creed IV: Black Flag"],
      [
        {
          source: "AchatMoinsCher",
          condition: "used",
          priceCents: 340,
        },
        {
          source: "eBay",
          productName: "Fourreau personnalisé Assassin's Creed IV Black Flag",
          condition: "used",
          priceCents: 7200,
        },
      ],
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "AchatMoinsCher:used",
    ]);
  });

  it("ignores isolated eBay used prices when barcode shops are available", () => {
    const summary = summarizeObservedPrices("games", [
      {
        source: "AchatMoinsCher",
        condition: "used",
        priceCents: 162,
      },
      {
        source: "eBay",
        productName: "Assassin's Creed II",
        condition: "used",
        priceCents: 6199,
      },
    ]);

    // Shop "used" is a complete/boxed proxy — it feeds CIB, not loose.
    expect(summary.priceUsed).toBeNull();
    expect(summary.priceUsedCIB).toBe(162);
  });

  it("keeps PriceCharting loose separate from retail used stock", () => {
    const summary = summarizeObservedPrices("games", [
      {
        source: "PriceCharting",
        condition: "loose",
        priceCents: 800,
      },
      {
        source: "NetGamesRetro",
        condition: "used",
        priceCents: 5000,
        productName: "Agassi Tennis Generation",
      },
    ]);

    expect(summary.priceUsed).toBe(800);
    expect(summary.priceUsedCIB).toBe(5000);
  });

  it("splits loose vs CIB for hardware like games", () => {
    const summary = summarizeObservedPrices("hardware", [
      {
        source: "PriceCharting",
        condition: "loose",
        priceCents: 18000,
      },
      {
        source: "PriceCharting",
        condition: "cib",
        priceCents: 22000,
      },
      {
        source: "eBay",
        condition: "used",
        priceCents: 25000,
        productName: "Nintendo Switch OLED",
      },
    ]);

    expect(summary.priceUsed).toBe(18000);
    // Marketplace "used" is dropped by trust filter; CIB is the boxed grade.
    expect(summary.priceUsedCIB).toBe(22000);
  });
});
