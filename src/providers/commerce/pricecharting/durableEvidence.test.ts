import { beforeEach, describe, expect, it, vi } from "vitest";

const getFreshProviderEvidence = vi.fn();
const putProviderEvidence = vi.fn();

vi.mock("@/core/enrich/providerEvidenceStore", () => ({
  PROVIDER_EVIDENCE_DETAIL_KIND: "detail",
  PROVIDER_EVIDENCE_SEARCH_KIND: "search",
  PROVIDER_EVIDENCE_SEARCH_TTL_MS: 30 * 60 * 1000,
  getFreshProviderEvidence: (...args: unknown[]) =>
    getFreshProviderEvidence(...args),
  putProviderEvidence: (...args: unknown[]) => putProviderEvidence(...args),
}));

import {
  promotePriceChartingPriceEvidence,
  promotePriceChartingSearchEvidence,
  readPriceChartingPriceEvidence,
  readPriceChartingSearchEvidence,
} from "./durableEvidence";

describe("pricecharting durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads fresh detail yield for a pinned fiche", async () => {
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "pricecharting",
      url: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      kind: "detail",
      yieldJson: {
        priceUsed: 1200,
        productName: "Super Monkey Ball",
      },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readPriceChartingPriceEvidence(
        "https://www.pricecharting.com/game/wii/super-monkey-ball",
      ),
    ).resolves.toEqual({
      priceUsed: 1200,
      productName: "Super Monkey Ball",
      sourceUrl: "https://www.pricecharting.com/game/wii/super-monkey-ball",
    });
  });

  it("promotes prices with a /game/ sourceUrl", async () => {
    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promotePriceChartingPriceEvidence({
      priceUsed: 1200,
      sourceUrl: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      productName: "Super Monkey Ball",
    });

    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "pricecharting",
      url: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      kind: "detail",
      yieldJson: {
        priceUsed: 1200,
        sourceUrl: "https://www.pricecharting.com/game/wii/super-monkey-ball",
        productName: "Super Monkey Ball",
      },
    });
  });

  it("skips promote without a detail URL", async () => {
    await promotePriceChartingPriceEvidence({ priceUsed: 1200 });
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });

  it("reads and promotes typed search rows", async () => {
    const rows = [
      {
        id: "1",
        gamePath: "/game/wii/super-monkey-ball",
        title: "Super Monkey Ball",
        platform: "Wii",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "pricecharting",
      url: "https://www.pricecharting.com/search-products?q=monkey&type=prices",
      kind: "search",
      yieldJson: rows,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readPriceChartingSearchEvidence(
        "https://www.pricecharting.com/search-products?q=monkey&type=prices",
      ),
    ).resolves.toEqual(rows);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promotePriceChartingSearchEvidence(
      "https://www.pricecharting.com/search-products?q=monkey&type=prices",
      rows,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "pricecharting",
      url: "https://www.pricecharting.com/search-products?q=monkey&type=prices",
      kind: "search",
      yieldJson: rows,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for non-search URLs", async () => {
    await promotePriceChartingSearchEvidence(
      "https://www.pricecharting.com/game/wii/super-monkey-ball",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
