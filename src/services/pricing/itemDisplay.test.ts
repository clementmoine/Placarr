import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getCachedItemPrices: vi.fn(),
  getCachedBarcodePrices: vi.fn(),
  refreshItemPrices: vi.fn(),
  refreshBarcodePrices: vi.fn(),
  shouldRefreshPriceCache: vi.fn(),
  alignBarcodePricesForItemNames: vi.fn((_type, _names, prices) => prices),
  after: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: h.after,
}));

vi.mock("@/lib/pricing/cachePolicy", () => ({
  shouldRefreshPriceCache: h.shouldRefreshPriceCache,
}));

vi.mock("@/services/pricing/resolver", () => ({
  getCachedItemPrices: h.getCachedItemPrices,
  getCachedBarcodePrices: h.getCachedBarcodePrices,
  refreshItemPrices: h.refreshItemPrices,
  refreshBarcodePrices: h.refreshBarcodePrices,
  alignBarcodePricesForItemNames: h.alignBarcodePricesForItemNames,
  summarizeShelfItemPrices: vi.fn(),
}));

import {
  itemPricesContextFromRecord,
  readItemPrices,
  scheduleItemPricesRefresh,
  scheduleItemPricesRefreshBatch,
  summarizeListItemPrices,
} from "./itemDisplay";
import { summarizeShelfItemPrices } from "@/services/pricing/resolver";

const CONTEXT = itemPricesContextFromRecord({
  id: "item-1",
  name: "Abzu",
  barcode: null,
  metadataId: "meta-1",
  metadata: { title: "ABZÛ", aliases: null },
  shelf: { type: "games", name: "Playstation 4" },
});

describe("readItemPrices", () => {
  afterEach(() => {
    vi.clearAllMocks();
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
    expect(h.after).toHaveBeenCalledTimes(1);
  });

  it("blocks on a cold cache for detail reads", async () => {
    h.getCachedItemPrices.mockResolvedValue(null);
    h.refreshItemPrices.mockResolvedValue({
      priceNew: 2499,
      priceUsed: 1299,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: ["PriceCharting"],
      priceSourceDisplayNames: ["PriceCharting"],
      isReferencePriceOnly: true,
      priceObservations: [],
    });

    const prices = await readItemPrices(CONTEXT);

    expect(prices?.priceNew).toBe(2499);
    expect(h.refreshItemPrices).toHaveBeenCalledTimes(1);
  });

  it("does not block shelf reads when cache is missing", async () => {
    h.getCachedItemPrices.mockResolvedValue(null);

    const prices = await readItemPrices(CONTEXT, { blockWhenMissing: false });

    expect(prices).toBeNull();
    expect(h.refreshItemPrices).not.toHaveBeenCalled();
    expect(h.after).toHaveBeenCalledTimes(1);
  });
});

describe("scheduleItemPricesRefresh", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs the refresh inside after()", async () => {
    h.refreshItemPrices.mockResolvedValue({
      priceNew: 1500,
      priceUsed: null,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    scheduleItemPricesRefresh(CONTEXT);

    expect(h.refreshItemPrices).not.toHaveBeenCalled();
    const task = h.after.mock.calls[0]?.[0] as () => Promise<void>;
    await task();
    expect(h.refreshItemPrices).toHaveBeenCalledTimes(1);
  });
});

describe("summarizeListItemPrices", () => {
  afterEach(() => {
    vi.clearAllMocks();
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
    expect(h.after).toHaveBeenCalledTimes(1);
  });
});

describe("scheduleItemPricesRefreshBatch", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes only items whose cache is missing or stale", async () => {
    h.getCachedItemPrices
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
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
    h.refreshItemPrices.mockResolvedValue({
      priceNew: 1500,
      priceUsed: null,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    scheduleItemPricesRefreshBatch([
      CONTEXT,
      {
        ...CONTEXT,
        id: "item-2",
      },
    ]);

    const task = h.after.mock.calls[0]?.[0] as () => Promise<void>;
    await task();

    expect(h.refreshItemPrices).toHaveBeenCalledTimes(1);
  });

  it("with onlyWhenEmpty skips items that already have cached prices", async () => {
    h.getCachedItemPrices
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        priceNew: 1000,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: new Date(),
        priceSources: [],
        priceSourceDisplayNames: [],
        isReferencePriceOnly: false,
        priceObservations: [],
      });
    h.refreshItemPrices.mockResolvedValue({
      priceNew: 1500,
      priceUsed: null,
      priceUsedCIB: null,
      priceLastUpdated: new Date(),
      priceSources: [],
      priceSourceDisplayNames: [],
      isReferencePriceOnly: false,
      priceObservations: [],
    });

    scheduleItemPricesRefreshBatch(
      [CONTEXT, { ...CONTEXT, id: "item-2" }],
      { onlyWhenEmpty: true },
    );

    const task = h.after.mock.calls[0]?.[0] as () => Promise<void>;
    await task();

    expect(h.refreshItemPrices).toHaveBeenCalledTimes(1);
    expect(h.shouldRefreshPriceCache).not.toHaveBeenCalled();
  });
});
