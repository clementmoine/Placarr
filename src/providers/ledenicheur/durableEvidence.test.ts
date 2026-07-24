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
  leDenicheurSearchEvidenceUrl,
  promoteLeDenicheurSearchEvidence,
  readLeDenicheurSearchEvidence,
} from "./durableEvidence";

describe("ledenicheur durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search nodes", async () => {
    const hits = [
      {
        __typename: "Product",
        name: "Hades Nintendo Switch",
        pathName: "/product.php?p=5752524",
        priceSummary: {
          regular: 21.99,
          alternative: 34.99,
          inStock: 21.99,
          count: 9,
        },
        media: { first: "https://example.com/hades.jpg" },
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "ledenicheur",
      url: "https://ledenicheur.fr/search?q=hades+switch",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const searchUrl = leDenicheurSearchEvidenceUrl("hades switch");
    await expect(readLeDenicheurSearchEvidence(searchUrl)).resolves.toEqual(
      hits,
    );

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteLeDenicheurSearchEvidence(searchUrl, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "ledenicheur",
      url: searchUrl,
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for product URLs", async () => {
    await promoteLeDenicheurSearchEvidence(
      "https://ledenicheur.fr/product.php?p=5752524",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
