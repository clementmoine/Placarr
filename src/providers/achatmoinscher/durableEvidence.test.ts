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
  promoteAchatMoinsCherSearchEvidence,
  readAchatMoinsCherSearchEvidence,
} from "./durableEvidence";

describe("achatmoinscher durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [{ productId: "12345", title: "Wheelman PS3" }];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "achatmoinscher",
      url: "https://www.achatmoinscher.com/recherche.php?q=wheelman",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readAchatMoinsCherSearchEvidence(
        "https://www.achatmoinscher.com/recherche.php?q=wheelman",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteAchatMoinsCherSearchEvidence(
      "https://www.achatmoinscher.com/recherche.php?q=wheelman",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "achatmoinscher",
      url: "https://www.achatmoinscher.com/recherche.php?q=wheelman",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for non-search URLs", async () => {
    await promoteAchatMoinsCherSearchEvidence(
      "https://www.achatmoinscher.com/12345.html",
      [{ productId: "12345", title: "Wheelman" }],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
