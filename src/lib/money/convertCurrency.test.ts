import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  convertCents,
  DISPLAY_CURRENCY,
  fetchCurrencyRate,
  isDisplayCurrency,
  normalizeCurrencyCode,
  resetCurrencyRateCache,
} from "./convertCurrency";

describe("normalizeCurrencyCode", () => {
  it("defaults blank currency to the display currency", () => {
    expect(normalizeCurrencyCode(null)).toBe(DISPLAY_CURRENCY);
    expect(normalizeCurrencyCode("usd")).toBe("USD");
  });

  it("recognises display currency", () => {
    expect(isDisplayCurrency(undefined)).toBe(true);
    expect(isDisplayCurrency("USD")).toBe(false);
  });
});

describe("fetchCurrencyRate / convertCents", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetCurrencyRateCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 1 when from and to match", async () => {
    expect(await fetchCurrencyRate("EUR", "EUR")).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("converts cents with a fetched rate", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { EUR: 0.5 } }),
    });
    expect(await convertCents(1000, "USD", "EUR")).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Cached — second call does not hit the network.
    expect(await convertCents(2000, "USD", "EUR")).toBe(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the feed fails", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await convertCents(1000, "USD")).toBeNull();
  });
});
