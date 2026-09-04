import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getCachedItemPrices: vi.fn(),
  getCachedBarcodePrices: vi.fn(),
  refreshItemPrices: vi.fn(),
  refreshBarcodePrices: vi.fn(),
  shouldRefreshPriceCache: vi.fn(),
  alignBarcodePricesForItemNames: vi.fn((_type, _names, prices) => prices),
  repairProviderExternalLinksForItem: vi.fn(),
  enqueueBackgroundWorkJob: vi.fn().mockResolvedValue({ id: "job-1" }),
}));

vi.mock("@/core/collect/jobs/workQueue", () => ({
  BACKGROUND_WORK_KIND: {
    metadataRefresh: "metadataRefresh",
    priceRefresh: "priceRefresh",
  },
  enqueueBackgroundWorkJob: h.enqueueBackgroundWorkJob,
}));

vi.mock("@/core/commerce/pricing/resolver", () => ({
  shouldRefreshPriceCache: h.shouldRefreshPriceCache,
  getCachedItemPrices: h.getCachedItemPrices,
  getCachedBarcodePrices: h.getCachedBarcodePrices,
  refreshItemPrices: h.refreshItemPrices,
  refreshBarcodePrices: h.refreshBarcodePrices,
  alignBarcodePricesForItemNames: h.alignBarcodePricesForItemNames,
  summarizeShelfItemPrices: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: {
      findUnique: vi.fn().mockResolvedValue({ userId: "u1" }),
    },
  },
}));

vi.mock("@/core/enrich/persistProviderExternalLinks", () => ({
  repairProviderExternalLinksForItem: h.repairProviderExternalLinksForItem,
}));

import {
  cachedReferencePricesMissApprovedFiches,
  itemPricesContextFromRecord,
  itemPricesContextFromPresentedShelfItem,
  priceLookupNamesFromContext,
  readItemPrices,
  refreshItemPricesFromContext,
  resetPriceRefreshStateForTests,
  scheduleItemPricesRefresh,
  scheduleItemPricesRefreshBatch,
  shelfGridItemPriceFields,
  summarizeListItemPrices,
} from "./itemDisplay";
import { summarizeShelfItemPrices } from "@/core/commerce/pricing/resolver";

const CONTEXT = itemPricesContextFromRecord({
  id: "item-1",
  name: "Abzu",
  barcode: null,
  metadataId: "meta-1",
  metadata: { title: "ABZÛ", aliases: null },
  shelf: { type: "games", name: "Playstation 4" },
});

describe("cachedReferencePricesMissApprovedFiches", () => {
  it("detects a PriceCharting pin that disagrees with cached reference offers", () => {
    const context = {
      ...CONTEXT,
      name: "PlayStation 2 Slim Rose",
      shelfType: "hardware",
      shelfName: "Consoles",
      metadataFacts: [
        {
          kind: "external-link" as const,
          label: "PriceCharting",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/game/pal-playstation-2/slim-playstation-2-system-pink",
          source: "pricecharting",
        },
      ],
    };

    expect(
      cachedReferencePricesMissApprovedFiches(context, {
        priceNew: 48236,
        priceUsed: 4410,
        priceUsedCIB: 5412,
        priceLastUpdated: new Date(),
        priceSources: ["PriceCharting"],
        priceSourceDisplayNames: ["PriceCharting"],
        priceObservations: [
          {
            source: "PriceCharting",
            productName: "Playstation 2 Slim System",
            condition: "loose",
            priceCents: 4410,
            sourceUrl:
              "https://www.pricecharting.com/game/pal-playstation-2/playstation-2-slim-system",
            observedAt: new Date().toISOString(),
          },
        ],
        isReferencePriceOnly: true,
      }),
    ).toBe(true);
  });

  it("accepts cached offers that already point at the approved fiche", () => {
    const pink =
      "https://www.pricecharting.com/game/pal-playstation-2/slim-playstation-2-system-pink";
    const context = {
      ...CONTEXT,
      name: "PlayStation 2 Slim Rose",
      shelfType: "hardware",
      metadataFacts: [
        {
          kind: "external-link" as const,
          label: "PriceCharting",
          value: "Voir la fiche",
          url: pink,
          source: "pricecharting",
        },
      ],
    };

    expect(
      cachedReferencePricesMissApprovedFiches(context, {
        priceNew: 25824,
        priceUsed: 8391,
        priceUsedCIB: 10774,
        priceLastUpdated: new Date(),
        priceSources: ["PriceCharting"],
        priceSourceDisplayNames: ["PriceCharting"],
        priceObservations: [
          {
            source: "PriceCharting",
            productName: "Slim Playstation 2 System [Pink]",
            condition: "loose",
            priceCents: 8391,
            sourceUrl: pink,
            observedAt: new Date().toISOString(),
          },
        ],
        isReferencePriceOnly: true,
      }),
    ).toBe(false);
  });
});

describe("readItemPrices", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetPriceRefreshStateForTests();
  });

  it("returns cached prices and schedules refresh when stale", async () => {
    h.getCachedItemPrices.mockResolvedValue({
      priceNew: 1999,
      priceUsed: 999,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-01-01"),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });
    h.shouldRefreshPriceCache.mockReturnValue(true);

    const prices = await readItemPrices(CONTEXT);

    expect(prices?.priceNew).toBe(1999);
    expect(h.refreshItemPrices).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledTimes(1);
    });
  });

  it("enqueues a worker refresh on cold cache instead of blocking Next", async () => {
    h.getCachedItemPrices.mockResolvedValue(null);

    const prices = await readItemPrices(CONTEXT);

    expect(prices).toBeNull();
    expect(h.refreshItemPrices).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledTimes(1);
    });
  });

  it("reads barcode summary only while metadata refresh is active", async () => {
    h.getCachedBarcodePrices.mockResolvedValue({
      priceNew: 1999,
      priceUsed: 999,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-01-01"),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    await readItemPrices(
      itemPricesContextFromRecord({
        id: "alice-1",
        name: "Alice : Retour au pays de la folie",
        barcode: "5030931097140",
        metadataRefreshStartedAt: new Date().toISOString(),
        shelf: { type: "games", name: "Xbox 360" },
      }),
    );

    expect(h.getCachedBarcodePrices).toHaveBeenCalledWith(
      "5030931097140",
      "games",
      expect.objectContaining({ summaryOnly: true }),
    );
    expect(h.refreshBarcodePrices).not.toHaveBeenCalled();
    expect(h.enqueueBackgroundWorkJob).not.toHaveBeenCalled();
  });

  it("does not block shelf reads when cache is missing", async () => {
    h.getCachedItemPrices.mockResolvedValue(null);

    const prices = await readItemPrices(CONTEXT, { blockWhenMissing: false });

    expect(prices).toBeNull();
    expect(h.refreshItemPrices).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledTimes(1);
    });
  });

  it("does not schedule price refresh while metadata refresh is active", async () => {
    h.getCachedItemPrices.mockResolvedValue({
      priceNew: 1999,
      priceUsed: 999,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-01-01"),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });
    h.shouldRefreshPriceCache.mockReturnValue(true);

    const prices = await readItemPrices({
      ...CONTEXT,
      metadataRefreshStartedAt: new Date().toISOString(),
    });

    expect(prices?.priceUsed).toBe(999);
    expect(h.getCachedItemPrices).toHaveBeenCalled();
    expect(h.enqueueBackgroundWorkJob).not.toHaveBeenCalled();
  });

  it("falls back to metadata price facts when the price cache is empty", async () => {
    h.getCachedItemPrices.mockResolvedValue(null);

    const prices = await readItemPrices(
      {
        ...CONTEXT,
        metadataFacts: [
          {
            kind: "price",
            label: "Neuf dès",
            value: "7,30 €",
            source: "booknode",
          },
          {
            kind: "price",
            label: "Occasion dès",
            value: "1,98 €",
            source: "booknode",
          },
        ],
      },
      { blockWhenMissing: false },
    );

    expect(prices?.priceNew).toBe(730);
    expect(prices?.priceUsed).toBe(198);
  });
});

describe("scheduleItemPricesRefresh", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetPriceRefreshStateForTests();
  });

  it("enqueues a worker price-refresh job", async () => {
    scheduleItemPricesRefresh(CONTEXT);

    await vi.waitFor(() => {
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledTimes(1);
    });
    expect(h.refreshItemPrices).not.toHaveBeenCalled();
    expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "priceRefresh",
        itemId: CONTEXT.id,
        payload: expect.objectContaining({ id: CONTEXT.id }),
      }),
    );
  });

  it("dedupes repeated schedules for the same item", async () => {
    scheduleItemPricesRefresh(CONTEXT);
    scheduleItemPricesRefresh(CONTEXT);

    await vi.waitFor(() => {
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledTimes(1);
    });
  });
  it("skips scheduling while metadata refresh is active", () => {
    scheduleItemPricesRefresh({
      ...CONTEXT,
      metadataRefreshStartedAt: new Date().toISOString(),
    });

    expect(h.enqueueBackgroundWorkJob).not.toHaveBeenCalled();
  });

  it("skips scheduling when marketplace refresh started recently", async () => {
    h.getCachedItemPrices.mockResolvedValue({
      priceNew: 1999,
      priceUsed: 999,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-01-01"),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });
    h.refreshItemPrices.mockResolvedValue({
      priceNew: 1999,
      priceUsed: 999,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    await refreshItemPricesFromContext(CONTEXT);
    h.enqueueBackgroundWorkJob.mockClear();
    scheduleItemPricesRefresh(CONTEXT);
    expect(h.enqueueBackgroundWorkJob).not.toHaveBeenCalled();
  });
});

describe("refreshItemPricesFromContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetPriceRefreshStateForTests();
  });

  it("dedupes concurrent refreshes for the same barcode", async () => {
    h.getCachedBarcodePrices.mockResolvedValue(null);
    let resolveRefresh!: (
      value: Awaited<ReturnType<typeof h.refreshBarcodePrices>>,
    ) => void;
    const refreshPromise = new Promise<
      Awaited<ReturnType<typeof h.refreshBarcodePrices>>
    >((resolve) => {
      resolveRefresh = resolve;
    });
    h.refreshBarcodePrices.mockReturnValue(refreshPromise);

    const barcodeContext = itemPricesContextFromRecord({
      id: "alice-1",
      name: "Alice : Retour au pays de la folie",
      barcode: "5030931097140",
      metadata: {
        title: "Alice: Madness Returns",
        aliases: JSON.stringify([
          "Alice: Madness Returns",
          "Alice 2",
          "Return of American McGee's Alice",
        ]),
      },
      shelf: { type: "games", name: "Xbox 360" },
    });

    const first = refreshItemPricesFromContext(barcodeContext);
    const second = refreshItemPricesFromContext(barcodeContext);

    expect(h.refreshBarcodePrices).toHaveBeenCalledTimes(1);
    expect(h.refreshBarcodePrices).toHaveBeenCalledWith(
      expect.objectContaining({
        extraNames: expect.arrayContaining([
          "Alice: Madness Returns",
          "Return of American McGee's Alice",
        ]),
        acceptanceNames: expect.arrayContaining([
          "Alice : Retour au pays de la folie",
          "Alice: Madness Returns",
          "Return of American McGee's Alice",
        ]),
      }),
    );
    expect(h.refreshBarcodePrices.mock.calls[0]?.[0]?.extraNames).not.toEqual(
      expect.arrayContaining(["Alice 2"]),
    );

    resolveRefresh({
      priceNew: 1200,
      priceUsed: 600,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    await Promise.all([first, second]);
  });

  it("passes provider product URLs from metadata external-link facts to refresh", async () => {
    h.refreshBarcodePrices.mockResolvedValue({
      priceNew: 730,
      priceUsed: 198,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    const barcodeContext = itemPricesContextFromRecord({
      id: "black-stories-1",
      name: "Black Stories",
      barcode: "0827912079678",
      metadata: {
        title: "Black Stories",
        aliases: null,
        facts: JSON.stringify([
          {
            kind: "external-link",
            label: "Chasse aux Livres",
            value: "Voir la fiche",
            url: "https://www.chasse-aux-livres.fr/prix/B01/black-stories.html",
            source: "chasseauxlivres",
          },
        ]),
      },
      shelf: { type: "boardgames", name: "Jeux de société" },
    });

    await refreshItemPricesFromContext(barcodeContext, { force: true });

    expect(h.refreshBarcodePrices).toHaveBeenCalledWith(
      expect.objectContaining({
        providerProductUrls: [
          {
            providerKey: "chasseauxlivres",
            url: "https://www.chasse-aux-livres.fr/prix/B01/black-stories.html",
          },
        ],
      }),
    );
  });

  it("returns cached prices instead of re-querying marketplaces within five minutes", async () => {
    h.getCachedItemPrices.mockResolvedValue({
      priceNew: 1999,
      priceUsed: 999,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-01-01"),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });
    h.refreshItemPrices.mockResolvedValue({
      priceNew: 2499,
      priceUsed: 1299,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    await refreshItemPricesFromContext(CONTEXT);
    expect(h.refreshItemPrices).toHaveBeenCalledTimes(1);

    h.refreshItemPrices.mockClear();
    const cached = await refreshItemPricesFromContext(CONTEXT);
    expect(h.refreshItemPrices).not.toHaveBeenCalled();
    expect(cached?.priceNew).toBe(1999);
  });

  it("force refresh bypasses the five-minute marketplace cooldown", async () => {
    h.getCachedItemPrices.mockResolvedValue({
      priceNew: 1999,
      priceUsed: 999,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-01-01"),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });
    h.refreshItemPrices.mockResolvedValue({
      priceNew: 2499,
      priceUsed: 1299,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    await refreshItemPricesFromContext(CONTEXT);
    await refreshItemPricesFromContext(CONTEXT, { force: true });
    expect(h.refreshItemPrices).toHaveBeenCalledTimes(2);
  });

  it("repairs retailer external links even when price refresh is on cooldown", async () => {
    h.getCachedItemPrices.mockResolvedValue({
      priceNew: 1999,
      priceUsed: 999,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-01-01"),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });
    h.refreshItemPrices.mockResolvedValue({
      priceNew: 2499,
      priceUsed: 1299,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    await refreshItemPricesFromContext(CONTEXT);
    h.repairProviderExternalLinksForItem.mockClear();
    await refreshItemPricesFromContext(CONTEXT);

    expect(h.refreshItemPrices).toHaveBeenCalledTimes(1);
    expect(h.repairProviderExternalLinksForItem).toHaveBeenCalledTimes(1);
    expect(h.repairProviderExternalLinksForItem).toHaveBeenCalledWith("item-1");
  });
});

describe("summarizeListItemPrices", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetPriceRefreshStateForTests();
  });

  it("groups items by shelf type and merges batch price summaries", async () => {
    vi.mocked(summarizeShelfItemPrices)
      .mockResolvedValueOnce(
        new Map([
          [
            "game-1",
            {
              priceNew: null,
              priceUsed: 1200,
              priceUsedCIB: null,
              priceLastUpdated: new Date("2026-01-01"),
            },
          ],
        ]),
      )
      .mockResolvedValueOnce(
        new Map([
          [
            "book-1",
            {
              priceNew: 1500,
              priceUsed: null,
              priceUsedCIB: null,
              priceLastUpdated: new Date("2026-01-02"),
            },
          ],
        ]),
      );

    const prices = await summarizeListItemPrices([
      {
        id: "game-1",
        name: "Abzu",
        barcode: "8023171038483",
        shelf: { type: "games", name: "Playstation 4" },
      },
      {
        id: "book-1",
        name: "Dune",
        barcode: "9780140328721",
        shelf: { type: "books", name: "SF" },
      },
    ]);

    expect(summarizeShelfItemPrices).toHaveBeenCalledTimes(2);
    expect(prices.get("game-1")?.priceUsed).toBe(1200);
    expect(prices.get("book-1")?.priceNew).toBe(1500);
    expect(h.enqueueBackgroundWorkJob).not.toHaveBeenCalled();
  });
});

describe("scheduleItemPricesRefreshBatch", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetPriceRefreshStateForTests();
  });

  it("refreshes only items whose cache is missing or stale", async () => {
    h.getCachedItemPrices.mockResolvedValueOnce(null).mockResolvedValueOnce({
      priceNew: 1000,
      priceUsed: null,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });
    h.shouldRefreshPriceCache.mockReturnValue(false);

    scheduleItemPricesRefreshBatch([
      CONTEXT,
      {
        ...CONTEXT,
        id: "item-2",
      },
    ]);

    await vi.waitFor(() => {
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledTimes(1);
    });
    expect(h.refreshItemPrices).not.toHaveBeenCalled();
    expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: CONTEXT.id,
        kind: "priceRefresh",
      }),
    );
  });

  it("with onlyWhenEmpty skips items that already have cached prices", async () => {
    h.getCachedItemPrices.mockResolvedValueOnce(null).mockResolvedValueOnce({
      priceNew: 1000,
      priceUsed: null,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    scheduleItemPricesRefreshBatch([CONTEXT, { ...CONTEXT, id: "item-2" }], {
      onlyWhenEmpty: true,
    });

    await vi.waitFor(() => {
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledTimes(1);
    });
    expect(h.refreshItemPrices).not.toHaveBeenCalled();
    expect(h.shouldRefreshPriceCache).not.toHaveBeenCalled();
  });
});

describe("priceLookupNamesFromContext", () => {
  it("drops sibling FIFA spinoff aliases that poison PriceCharting search", () => {
    const context = itemPricesContextFromRecord({
      id: "item-fifa",
      name: "FIFA 2002",
      barcode: "5030930027285",
      metadataId: "meta-fifa",
      metadata: {
        title: "FIFA 2002",
        aliases: JSON.stringify([
          "Fifa Football 2002",
          "FIFA Soccer 2002",
          "FIFA 2002: Road to FIFA World Cup",
          "FIFA Soccer 2002: Major League Soccer",
          "PS2 FIFA 2002",
        ]),
      },
      shelf: { type: "games", name: "PlayStation 2" },
    });

    expect(priceLookupNamesFromContext(context)).toEqual([
      "FIFA 2002",
      "FIFA 2002",
      "Fifa Football 2002",
      "FIFA Soccer 2002",
      "PS2 FIFA 2002",
    ]);
  });

  it("keeps Enter Electro aliases and drops Sinister Six for FR Spider-Man 2", () => {
    const context = itemPricesContextFromRecord({
      id: "item-electro",
      name: "Spider-Man 2 : La Revanche d'Electro",
      barcode: "711719148825",
      metadataId: "meta-electro",
      metadata: {
        title: "Spider-Man 2 : La Revanche d'Electro",
        aliases: JSON.stringify([
          "Spider-Man 2: Enter Electro",
          "Spiderman 2 Enter Electro",
          "Spider-man 2",
          "Spider-Man 2: The Sinister Six",
        ]),
      },
      shelf: { type: "games", name: "PlayStation 1" },
    });

    expect(priceLookupNamesFromContext(context)).toEqual([
      "Spider-Man 2 : La Revanche d'Electro",
      "Spider-Man 2 : La Revanche d'Electro",
      "Spider-Man 2: Enter Electro",
      "Spiderman 2 Enter Electro",
    ]);
  });

  it("keeps Remastered edition aliases for Castle Crashers", () => {
    const context = itemPricesContextFromRecord({
      id: "item-cc",
      name: "Castle Crashers",
      barcode: null,
      metadataId: "meta-cc",
      metadata: {
        title: "Castle Crashers",
        aliases: JSON.stringify(["Castle Crashers Remastered"]),
      },
      shelf: { type: "games", name: "Nintendo Switch" },
    });

    expect(priceLookupNamesFromContext(context)).toEqual([
      "Castle Crashers",
      "Castle Crashers",
      "Castle Crashers Remastered",
    ]);
  });
});

describe("shelfGridItemPriceFields", () => {
  it("fills used price from metadata facts when batch cache is empty", () => {
    const context = itemPricesContextFromPresentedShelfItem(
      {
        id: "item-hs-2",
        name: "Les Trésors de Picsou n°02",
        metadata: {
          title: "Les trésors de Picsou",
          facts: [
            {
              kind: "price",
              source: "bdovore",
              value: "8,95 €",
              label: "Occasion",
            },
          ],
        },
      },
      { type: "comics", name: "BD" },
    );

    const prices = shelfGridItemPriceFields(context, null);

    expect(prices.priceUsed).toBe(895);
    expect(prices.priceNew).toBeNull();
  });

  it("fills priceNew from observed-price when batch only has used", () => {
    const context = itemPricesContextFromPresentedShelfItem(
      {
        id: "item-arcane",
        name: "L'Art et la Création de Arcane",
        barcode: "9791035505677",
        metadata: {
          title: "L'art et la création de Arcane",
          facts: [
            {
              kind: "observed-price",
              label: "ChocoBonPlan",
              value: "39,90 €",
              source: "chocobonplan",
            },
          ],
        },
      },
      { type: "books", name: "Livres" },
    );

    const prices = shelfGridItemPriceFields(context, {
      priceNew: null,
      priceUsed: 3947,
      priceUsedCIB: null,
      priceLastUpdated: new Date("2026-07-11"),
    });

    expect(prices.priceNew).toBe(3990);
    expect(prices.priceUsed).toBe(3947);
  });

  it("keeps batch priceEstimated for TCG shelf tiles (~ cote)", () => {
    const context = itemPricesContextFromPresentedShelfItem(
      {
        id: "item-ni019",
        name: "NI-019",
        printKey: "naruto:ni-0019",
        metadata: { title: "NI-019", facts: [] },
      },
      { type: "tcg", name: "Naruto Carddass" },
    );

    const prices = shelfGridItemPriceFields(context, {
      priceNew: null,
      priceUsed: null,
      priceUsedCIB: null,
      priceEstimated: 2000,
      priceLastUpdated: null,
    });

    expect(prices.priceEstimated).toBe(2000);
    expect(prices.priceNew).toBeNull();
  });
});
