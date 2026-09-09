import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  displayEstimatedCentsFromOffers,
  fxFallbackEstimatedBuckets,
  fxFallbackEstimatedCents,
  summarizeObservedPrices,
  withFxPriceEstimated,
} from "./pricePipeline";
import { resetCurrencyRateCache } from "@/lib/money/convertCurrency";
import type { PriceObservation } from "./priceTypes";

function offer(
  overrides: Partial<PriceObservation> &
    Pick<PriceObservation, "source" | "priceCents">,
): PriceObservation {
  return {
    condition: "new",
    currency: "EUR",
    ...overrides,
  };
}

describe("summarizeObservedPrices currency", () => {
  it("averages only display-currency offers", () => {
    const summary = summarizeObservedPrices("tcg", [
      offer({ source: "A", priceCents: 1000, currency: "EUR" }),
      offer({ source: "B", priceCents: 3000, currency: "EUR" }),
      offer({ source: "Lorcast", priceCents: 99_00, currency: "USD" }),
    ]);
    expect(summary.priceNew).toBe(2000);
  });

  it("leaves native buckets empty when only foreign offers exist", () => {
    const summary = summarizeObservedPrices("tcg", [
      offer({ source: "Lorcast", priceCents: 500, currency: "USD" }),
    ]);
    expect(summary).toEqual({
      priceNew: null,
      priceFoil: null,
      priceUsed: null,
      priceUsedCIB: null,
    });
  });
});

describe("fxFallbackEstimatedCents", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetCurrencyRateCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { EUR: 0.5 } }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts foreign new offers when the EUR bucket is empty", async () => {
    const estimated = await fxFallbackEstimatedCents(
      "tcg",
      { priceNew: null, priceUsed: null, priceUsedCIB: null },
      [offer({ source: "Lorcast", priceCents: 1000, currency: "USD" })],
    );
    expect(estimated).toBe(500);
  });

  it("does not convert when a native EUR new price already exists", async () => {
    const estimated = await fxFallbackEstimatedCents(
      "tcg",
      { priceNew: 1200, priceUsed: null, priceUsedCIB: null },
      [offer({ source: "Lorcast", priceCents: 1000, currency: "USD" })],
    );
    expect(estimated).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses foil when that is the only foreign condition", async () => {
    const estimated = await fxFallbackEstimatedCents(
      "tcg",
      { priceNew: null, priceUsed: null, priceUsedCIB: null },
      [
        offer({
          source: "Lorcast",
          priceCents: 2000,
          currency: "USD",
          condition: "foil",
        }),
      ],
    );
    expect(estimated).toBe(1000);
  });

  it("prefers foreign new over foil when both exist", async () => {
    const estimated = await fxFallbackEstimatedCents(
      "tcg",
      { priceNew: null, priceUsed: null, priceUsedCIB: null },
      [
        offer({
          source: "Lorcast",
          priceCents: 1000,
          currency: "USD",
          condition: "new",
        }),
        offer({
          source: "Lorcast",
          priceCents: 9000,
          currency: "USD",
          condition: "foil",
        }),
      ],
    );
    expect(estimated).toBe(500);
  });

  it("computes foil FX separately from new", async () => {
    const buckets = await fxFallbackEstimatedBuckets(
      "tcg",
      { priceNew: null, priceFoil: null, priceUsed: null, priceUsedCIB: null },
      [
        offer({
          source: "Lorcast",
          priceCents: 7,
          currency: "USD",
          condition: "new",
        }),
        offer({
          source: "Lorcast",
          priceCents: 63,
          currency: "USD",
          condition: "foil",
        }),
      ],
    );
    expect(buckets.priceEstimated).toBe(4); // 7 * 0.5
    expect(buckets.priceEstimatedFoil).toBe(32); // 63 * 0.5
  });

  it("attaches priceEstimated on a result via withFxPriceEstimated", async () => {
    const result = await withFxPriceEstimated(
      {
        priceNew: null,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: null,
        priceSources: ["Lorcast"],
        priceSourceDisplayNames: ["Lorcast"],
        isReferencePriceOnly: true,
        priceObservations: [],
      },
      [offer({ source: "Lorcast", priceCents: 1000, currency: "USD" })],
      "tcg",
    );
    expect(result.priceEstimated).toBe(500);
  });
});

describe("displayEstimatedCentsFromOffers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetCurrencyRateCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { EUR: 0.5 } }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts USD market offers to EUR when no native EUR exists", async () => {
    const estimated = await displayEstimatedCentsFromOffers("tcg", [
      offer({
        source: "narutocardgame.gg",
        priceCents: 1000,
        currency: "USD",
        condition: "new",
      }),
    ]);
    expect(estimated).toBe(500);
  });

  it("keeps EUR catalog estimates over USD market", async () => {
    const estimated = await displayEstimatedCentsFromOffers("tcg", [
      offer({
        source: "Collection Naruto",
        priceCents: 250,
        currency: "EUR",
        condition: "estimated",
      }),
      offer({
        source: "narutocardgame.gg",
        priceCents: 1000,
        currency: "USD",
        condition: "new",
      }),
    ]);
    expect(estimated).toBe(250);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
