import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  barcodeCache: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  priceOffer: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    barcodeCache: h.barcodeCache,
    priceOffer: h.priceOffer,
  },
}));

import {
  alignBarcodePricesForItemNames,
  filterItemPriceOffers,
  getCachedBarcodePrices,
  getCachedItemPrices,
  summarizeShelfItemPrices,
} from "@/services/pricing/resolver";

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
      offer({ source: "PicClick", condition: "used", priceCents: 1490 }),
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
  });

  it("falls back to item-scoped offers when barcode is missing", async () => {
    h.barcodeCache.findMany.mockResolvedValue([]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-1",
        source: "PicClick",
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
      priceUsed: 3499,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-06-20T12:00:00.000Z"),
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
        source: "PicClick",
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

    expect(map.get("item-1")?.priceUsed).toBe(1482);
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
        source: "PicClick",
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
        source: "PicClick",
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
        source: "PicClick",
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

  it("falls back to unfiltered aggregates when title filters reject every listing", async () => {
    h.barcodeCache.findMany.mockResolvedValue([]);
    h.priceOffer.findMany.mockResolvedValue([
      {
        itemId: "item-1",
        source: "ChocoBonPlan",
        productName: "Disney Infinity 3.0 : Star Wars – pack de démarrage sur PS4",
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

    expect(map.get("item-1")?.priceNew).toBe(1416);
  });
});

describe("alignBarcodePricesForItemNames", () => {
  it("keeps cached aggregates when every listing title is noisy", () => {
    const aligned = alignBarcodePricesForItemNames(
      "books",
      ["L'Art et la Création de Arcane"],
      {
        priceNew: 5101,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
        priceSources: ["ChasseAuxLivres"],
        priceObservations: [
          {
            source: "PicClick",
            productName: "Graphics Tablet Pen Display 2 Monitor 2K IPS",
            merchantName: null,
            condition: "new",
            priceCents: 9999,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-19T12:00:00.000Z",
          },
        ],
      },
    );

    expect(aligned.priceNew).toBe(5101);
    expect(aligned.priceObservations).toEqual([]);
  });

  it("clears cached aggregates when every named listing is a lot or non-book product", () => {
    const aligned = alignBarcodePricesForItemNames(
      "books",
      ["The Promised Neverland n°01"],
      {
        priceNew: 11690,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
        priceSources: ["PicClick"],
        priceObservations: [
          {
            source: "PicClick",
            productName: "The Promised Neverland Box Set Vol. 1-20",
            merchantName: null,
            condition: "new",
            priceCents: 11690,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-19T12:00:00.000Z",
          },
        ],
      },
    );

    expect(aligned.priceNew).toBeNull();
    expect(aligned.priceObservations).toEqual([]);
  });

  it("clears cached aggregates when every named listing targets another issue", () => {
    const aligned = alignBarcodePricesForItemNames(
      "books",
      ["Super Picsou Géant n°07"],
      {
        priceNew: 450,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
        priceSources: ["PicClick"],
        priceObservations: [
          {
            source: "PicClick",
            productName: "Super Picsou Géant n°183 - Occasion",
            merchantName: null,
            condition: "used",
            priceCents: 450,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-19T12:00:00.000Z",
          },
        ],
      },
    );

    expect(aligned.priceNew).toBeNull();
    expect(aligned.priceObservations).toEqual([]);
  });

  it("recomputes from aligned listings and drops unrelated rows", () => {
    const aligned = alignBarcodePricesForItemNames(
      "books",
      ["L'Art et la Création de Arcane"],
      {
        priceNew: 9999,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-19T11:00:00.000Z"),
        priceSources: ["PicClick"],
        priceObservations: [
          {
            source: "PicClick",
            productName:
              "The Art and Making of Arcane League Of Legends AVAILABLE",
            merchantName: null,
            condition: "new",
            priceCents: 5101,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-19T12:00:00.000Z",
          },
          {
            source: "PicClick",
            productName: "Graphics Tablet Pen Display 2 Monitor 2K IPS",
            merchantName: null,
            condition: "new",
            priceCents: 9999,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-19T12:00:00.000Z",
          },
        ],
      },
    );

    expect(aligned.priceNew).toBe(5101);
    expect(aligned.priceObservations).toHaveLength(1);
  });

  it("drops game listings on the wrong platform for the shelf", () => {
    const aligned = alignBarcodePricesForItemNames(
      "games",
      ["Les Gardiens de la Galaxie - The Telltale Series"],
      {
        priceNew: 2355,
        priceUsed: 26081,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-28T12:00:00.000Z"),
        priceSources: ["Smartoys", "LeDenicheur", "PicClick"],
        priceObservations: [
          {
            source: "Smartoys",
            productName: "LES GARDIENS DE LA GALAXIE - THE TELLTALE SERIES",
            condition: "used",
            priceCents: 1200,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-28T12:00:00.000Z",
          },
          {
            source: "LeDenicheur",
            productName: "Guardians of the Galaxy: The Telltale Series (PC)",
            condition: "used",
            priceCents: 100000,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-28T12:00:00.000Z",
          },
          {
            source: "PicClick",
            productName:
              "Marvel's Guardians Of The Galaxy : The Telltale Series (Xbox One)",
            condition: "used",
            priceCents: 2235,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-28T12:00:00.000Z",
          },
        ],
      },
      "PlayStation 4",
    );

    expect(aligned.priceUsed).toBe(1200);
    expect(aligned.priceObservations).toHaveLength(1);
    expect(aligned.priceObservations[0]?.source).toBe("Smartoys");
  });

  it("trims an isolated high outlier among aligned new prices", () => {
    const aligned = alignBarcodePricesForItemNames(
      "games",
      ["Dark Pictures: The Devil in Me"],
      {
        priceNew: 3333,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date("2026-06-28T12:00:00.000Z"),
        priceSources: ["Smartoys", "AchatMoinsCher", "LeDenicheur"],
        priceObservations: [
          {
            source: "AchatMoinsCher",
            productName: "The Dark Pictures Anthology: The Devil in Me",
            condition: "new",
            priceCents: 2278,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-28T12:00:00.000Z",
          },
          {
            source: "Smartoys",
            productName: "THE DARK PICTURES ANTHOLOGY: THE DEVIL IN ME",
            condition: "new",
            priceCents: 2995,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-28T12:00:00.000Z",
          },
          {
            source: "LeDenicheur",
            productName: "The Dark Pictures Anthology: The Devil in Me",
            condition: "new",
            priceCents: 7190,
            currency: "EUR",
            sourceUrl: null,
            offerCount: null,
            observedAt: "2026-06-28T12:00:00.000Z",
          },
        ],
      },
      "PlayStation 4",
    );

    expect(aligned.priceNew).toBe(2637);
    expect(aligned.priceObservations).toHaveLength(2);
  });
});

describe("filterItemPriceOffers", () => {
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
          source: "PicClick",
          productName: "A Way Out PlayStation 4",
          condition: "used",
          priceCents: 4743,
        },
      ],
    );

    expect(filtered.map((row) => `${row.source}:${row.condition}`)).toEqual([
      "PriceCharting:loose",
      "PriceCharting:new",
      "PicClick:used",
    ]);
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
          source: "PicClick",
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
          source: "PicClick",
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
      "PicClick:used",
    ]);
  });

  it("drops manga lot and tcg listings for numbered books", () => {
    const filtered = filterItemPriceOffers(
      "books",
      "Mangas",
      ["Dragon Ball Super n°01"],
      [
        {
          source: "PicClick",
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
          source: "PicClick",
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
});
