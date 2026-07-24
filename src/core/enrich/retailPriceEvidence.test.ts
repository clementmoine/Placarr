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
  isRetailPriceDetailYield,
  promoteRetailPriceEvidence,
  readRetailPriceEvidence,
} from "./retailPriceEvidence";

describe("retailPriceEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("accepts a single-condition retail yield", () => {
    expect(
      isRetailPriceDetailYield({
        priceCents: 1200,
        condition: "new",
        sourceUrl: "https://shop.example/p/1",
      }),
    ).toBe(true);
    expect(isRetailPriceDetailYield({ priceUsed: 1200 })).toBe(false);
  });

  it("reads fresh detail yield for a provider URL", async () => {
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "philibert",
      url: "https://www.philibertnet.com/fr/jeux/1.html",
      kind: "detail",
      yieldJson: {
        priceCents: 4590,
        condition: "new",
        productName: "Catan",
      },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readRetailPriceEvidence(
        "philibert",
        "https://www.philibertnet.com/fr/jeux/1.html",
      ),
    ).resolves.toEqual({
      priceCents: 4590,
      condition: "new",
      productName: "Catan",
      sourceUrl: "https://www.philibertnet.com/fr/jeux/1.html",
    });
  });

  it("promotes retail prices with an absolute sourceUrl", async () => {
    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteRetailPriceEvidence("philibert", {
      priceCents: 4590,
      condition: "new",
      productName: "Catan",
      sourceUrl: "https://www.philibertnet.com/fr/jeux/1.html",
    });
    expect(putProviderEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "philibert",
        url: "https://www.philibertnet.com/fr/jeux/1.html",
        kind: "detail",
      }),
    );
  });
});
