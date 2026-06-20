import { describe, expect, it } from "vitest";
import {
  getPriceCacheLifetimeMs,
  isPriceCacheFresh,
  shouldRefreshPriceCache,
  shouldReturnCachedPrices,
} from "./priceCachePolicy";

describe("shouldReturnCachedPrices", () => {
  it("returns cached non-game prices immediately", () => {
    expect(
      shouldReturnCachedPrices(
        "books",
        { priceNew: 1000, provider: "ChasseAuxLivres" },
        [],
      ),
    ).toBe(true);
  });

  it("refetches games when cache only has a new LeDenicheur price", () => {
    expect(
      shouldReturnCachedPrices(
        "games",
        {
          priceNew: 1495,
          priceUsed: null,
          priceUsedCIB: null,
          provider: "LeDenicheur",
        },
        [{ source: "LeDenicheur", condition: "new", priceCents: 1495 }],
      ),
    ).toBe(false);
  });

  it("refetches games when PriceCharting was claimed but no used offers were stored", () => {
    expect(
      shouldReturnCachedPrices(
        "games",
        {
          priceNew: 3596,
          priceUsed: null,
          priceUsedCIB: null,
          provider: "PriceCharting+LeDenicheur",
        },
        [{ source: "LeDenicheur", condition: "new", priceCents: 3596 }],
      ),
    ).toBe(false);
  });

  it("returns cached games prices when used pricing exists", () => {
    expect(
      shouldReturnCachedPrices(
        "games",
        { priceUsed: 751, provider: "PriceCharting" },
        [{ source: "PriceCharting", condition: "cib", priceCents: 751 }],
      ),
    ).toBe(true);
  });

  it("returns cached games prices when PriceCharting offers exist", () => {
    expect(
      shouldReturnCachedPrices(
        "games",
        {
          priceNew: 5230,
          priceUsed: 697,
          priceUsedCIB: 946,
          provider: "PriceCharting+LeDenicheur",
        },
        [
          { source: "PriceCharting", condition: "loose", priceCents: 697 },
          { source: "LeDenicheur", condition: "new", priceCents: 3596 },
        ],
      ),
    ).toBe(true);
  });
});

describe("shouldRefreshPriceCache", () => {
  it("refreshes incomplete game caches after the short freshness window", () => {
    const now = Date.parse("2026-06-19T15:00:00.000Z");
    const cacheRecord = {
      priceNew: 3596,
      priceUsed: null,
      priceUsedCIB: null,
      priceLastUpdated: "2026-06-19T14:54:00.000Z",
    };

    expect(shouldRefreshPriceCache("games", cacheRecord, now)).toBe(true);
  });

  it("does not refresh complete game caches before 24 hours", () => {
    const now = Date.parse("2026-06-19T15:00:00.000Z");
    const cacheRecord = {
      priceNew: 5230,
      priceUsed: 697,
      priceUsedCIB: 946,
      priceLastUpdated: "2026-06-18T16:00:00.000Z",
    };

    expect(shouldRefreshPriceCache("games", cacheRecord, now)).toBe(false);
  });
});

describe("isPriceCacheFresh", () => {
  it("keeps incomplete game caches short-lived even when a new price exists", () => {
    const now = Date.parse("2026-06-19T15:00:00.000Z");
    const cacheRecord = {
      priceNew: 3596,
      priceUsed: null,
      priceUsedCIB: null,
      priceLastUpdated: "2026-06-19T14:56:00.000Z",
    };

    expect(getPriceCacheLifetimeMs("games", cacheRecord)).toBe(5 * 60 * 1000);
    expect(isPriceCacheFresh("games", cacheRecord, now)).toBe(true);
    expect(isPriceCacheFresh("games", cacheRecord, now + 6 * 60 * 1000)).toBe(
      false,
    );
  });

  it("keeps complete game caches fresh for 24 hours", () => {
    const now = Date.parse("2026-06-19T15:00:00.000Z");
    const cacheRecord = {
      priceNew: 5230,
      priceUsed: 697,
      priceUsedCIB: 946,
      priceLastUpdated: "2026-06-18T16:00:00.000Z",
    };

    expect(getPriceCacheLifetimeMs("games", cacheRecord)).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(isPriceCacheFresh("games", cacheRecord, now)).toBe(true);
  });
});
