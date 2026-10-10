import { describe, expect, it } from "vitest";

import {
  PriceChartingFetchStore,
  priceChartingFetchStoreKeyForTests,
  runWithPriceChartingFetchStore,
  getPriceChartingFetchStore,
} from "./fetchStore";

describe("PriceChartingFetchStore", () => {
  it("singleflights the same URL within one job", async () => {
    let fetches = 0;
    const store = new PriceChartingFetchStore();
    const fetcher = async (url: string) => {
      fetches += 1;
      return {
        status: 200,
        data: `<html>${url}</html>`,
        request: { res: { responseUrl: url } },
      };
    };

    const a = store.getOrFetch(
      "https://www.pricecharting.com/game/wii/foo",
      fetcher,
    );
    const b = store.getOrFetch(
      "https://www.pricecharting.com/game/wii/foo",
      fetcher,
    );
    await Promise.all([a, b]);
    expect(fetches).toBe(1);

    await store.getOrFetch(
      "https://www.pricecharting.com/game/wii/foo",
      fetcher,
    );
    expect(fetches).toBe(1);
  });

  it("indexes search keys by q + type", () => {
    expect(
      priceChartingFetchStoreKeyForTests(
        "https://www.pricecharting.com/search-products?type=prices&q=Wii+U",
      ),
    ).toBe(
      priceChartingFetchStoreKeyForTests(
        "https://www.pricecharting.com/search-products?q=Wii%20U&type=prices",
      ),
    );
  });

  it("exposes the store via AsyncLocalStorage", async () => {
    await runWithPriceChartingFetchStore(async () => {
      expect(getPriceChartingFetchStore()).not.toBeNull();
    });
    expect(getPriceChartingFetchStore()).toBeNull();
  });
});
