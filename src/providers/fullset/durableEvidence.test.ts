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
  fullSetSearchEvidenceUrl,
  promoteFullSetSearchEvidence,
  readFullSetSearchEvidence,
} from "./durableEvidence";

describe("fullset durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        url: "https://full-set.net/psx/item/rayman.html",
        title: "Rayman",
        category: "Jeux",
        platformLabel: "Playstation",
        year: "1995",
        consoleSlug: "psx",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "fullset",
      url: "https://full-set.net/recherche.php?q=rayman",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const searchUrl = fullSetSearchEvidenceUrl("Rayman");
    await expect(readFullSetSearchEvidence(searchUrl)).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteFullSetSearchEvidence(searchUrl, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "fullset",
      url: searchUrl,
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for item URLs", async () => {
    await promoteFullSetSearchEvidence(
      "https://full-set.net/psx/item/rayman.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
