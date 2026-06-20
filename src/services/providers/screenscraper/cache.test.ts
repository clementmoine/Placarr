import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetadataResult } from "@/types/metadataProvider";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
    barcodeCache: {
      findUnique: vi.fn(async () => null),
    },
    rawName: {
      update: vi.fn(async () => ({})),
    },
  },
}));

import {
  buildScreenScraperLookupKey,
  cacheScreenScraperLookup,
  cacheScreenScraperSearch,
  clearScreenScraperInFlightLookup,
  getCachedScreenScraperLookup,
  getCachedScreenScraperSearch,
  getScreenScraperInFlightLookup,
  isScreenScraperQuotaBlocked,
  markScreenScraperQuotaHit,
  setScreenScraperInFlightLookup,
} from "./cache";

describe("ScreenScraper cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds stable lookup keys", () => {
    expect(
      buildScreenScraperLookupKey(
        "GoldenEye",
        "5030931039720",
        "PlayStation 2",
      ),
    ).toBe(
      buildScreenScraperLookupKey(
        "goldeneye",
        "5030931039720",
        "playstation 2",
      ),
    );
  });

  it("stores and retrieves search results in memory", () => {
    const results = [{ id: 42, noms: [{ region: "fr", text: "Test" }] }];
    cacheScreenScraperSearch("goldeneye", 58, results);

    expect(getCachedScreenScraperSearch("goldeneye", 58)).toEqual(results);
    expect(getCachedScreenScraperSearch("missing", 58)).toBeNull();
  });

  it("stores and retrieves lookup results in memory", () => {
    const result: MetadataResult = { title: "GoldenEye" };
    const key = buildScreenScraperLookupKey(
      "GoldenEye",
      "5030931039720",
      "PS2",
    );
    cacheScreenScraperLookup(key, result);

    expect(getCachedScreenScraperLookup(key)).toEqual(result);
  });

  it("dedupes concurrent lookups via in-flight map", async () => {
    const key = "barcode|name|platform";
    let resolve!: (value: MetadataResult | null) => void;
    const promise = new Promise<MetadataResult | null>((res) => {
      resolve = res;
    });
    setScreenScraperInFlightLookup(key, promise);

    expect(getScreenScraperInFlightLookup(key)).toBe(promise);

    resolve({ title: "Done" });
    await expect(getScreenScraperInFlightLookup(key)).resolves.toEqual({
      title: "Done",
    });

    clearScreenScraperInFlightLookup(key);
    expect(getScreenScraperInFlightLookup(key)).toBeUndefined();
  });

  it("blocks API calls during quota cooldown", () => {
    vi.useFakeTimers();
    expect(isScreenScraperQuotaBlocked()).toBe(false);

    markScreenScraperQuotaHit();
    expect(isScreenScraperQuotaBlocked()).toBe(true);

    vi.advanceTimersByTime(21 * 60 * 1000);
    expect(isScreenScraperQuotaBlocked()).toBe(false);
  });
});
