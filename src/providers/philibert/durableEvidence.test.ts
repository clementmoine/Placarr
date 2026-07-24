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
  promotePhilibertSearchEvidence,
  readPhilibertSearchEvidence,
} from "./durableEvidence";

describe("philibert durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        url: "https://www.philibertnet.com/fr/kosmos/123-catan-3558380126133.html",
        title: "Catan",
        barcode: "3558380126133",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "philibert",
      url: "https://www.philibertnet.com/fr/recherche?search_query=catan",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readPhilibertSearchEvidence(
        "https://www.philibertnet.com/fr/recherche?search_query=catan",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promotePhilibertSearchEvidence(
      "https://www.philibertnet.com/fr/recherche?search_query=catan",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "philibert",
      url: "https://www.philibertnet.com/fr/recherche?search_query=catan",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promotePhilibertSearchEvidence(
      "https://www.philibertnet.com/fr/kosmos/123-catan.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
