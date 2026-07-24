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
  promotePrestashopSearchEvidence,
  readPrestashopSearchEvidence,
} from "./durableEvidence";

describe("prestashop durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search products per shop id", async () => {
    const products = [
      {
        name: "Catan",
        link: "https://www.monsieurde.com/famille/359-catan.html",
        ean13: "3558380126133",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "monsieurde",
      url: "https://www.monsieurde.com/recherche?s=catan",
      kind: "search",
      yieldJson: products,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readPrestashopSearchEvidence(
        "monsieurde",
        "https://www.monsieurde.com/recherche?controller=search&s=catan&ajax=1",
      ),
    ).resolves.toEqual(products);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promotePrestashopSearchEvidence(
      "monsieurde",
      "https://www.monsieurde.com/recherche?controller=search&s=catan&ajax=1",
      products,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "monsieurde",
      url: "https://www.monsieurde.com/recherche?controller=search&s=catan&ajax=1",
      kind: "search",
      yieldJson: products,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote without a search identity param", async () => {
    await promotePrestashopSearchEvidence(
      "monsieurde",
      "https://www.monsieurde.com/famille/359-catan.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
