import { beforeEach, describe, expect, it, vi } from "vitest";

const getFreshProviderEvidence = vi.fn();
const putProviderEvidence = vi.fn();

vi.mock("@/core/enrich/providerEvidenceStore", () => ({
  PROVIDER_EVIDENCE_DETAIL_KIND: "detail",
  getFreshProviderEvidence: (...args: unknown[]) =>
    getFreshProviderEvidence(...args),
  putProviderEvidence: (...args: unknown[]) => putProviderEvidence(...args),
}));

import {
  promotePriceChartingPriceEvidence,
  readPriceChartingPriceEvidence,
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
      sourceUrl:
        "https://www.pricecharting.com/game/wii/super-monkey-ball",
      productName: "Super Monkey Ball",
    });

    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "pricecharting",
      url: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      kind: "detail",
      yieldJson: {
        priceUsed: 1200,
        sourceUrl:
          "https://www.pricecharting.com/game/wii/super-monkey-ball",
        productName: "Super Monkey Ball",
      },
    });
  });

  it("skips promote without a detail URL", async () => {
    await promotePriceChartingPriceEvidence({ priceUsed: 1200 });
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
