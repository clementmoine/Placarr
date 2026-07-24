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
  babelioSearchEvidenceUrl,
  promoteBabelioSearchEvidence,
  readBabelioSearchEvidence,
} from "./durableEvidence";

describe("babelio durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        id: "53653",
        title: "Dragon Ball Z - Cycle 1, tome 2",
        url: "https://www.babelio.com/livres/Toriyama-Dragon-Ball-Z-Cycle-1-tome-2/53653",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "babelio",
      url: "https://www.babelio.com/recherche.php?term=dragon+ball",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const searchUrl = babelioSearchEvidenceUrl("Dragon Ball");
    await expect(readBabelioSearchEvidence(searchUrl)).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteBabelioSearchEvidence(searchUrl, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "babelio",
      url: searchUrl,
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for book URLs", async () => {
    await promoteBabelioSearchEvidence(
      "https://www.babelio.com/livres/Toriyama-Dragon-Ball-Z-Cycle-1-tome-2/53653",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
