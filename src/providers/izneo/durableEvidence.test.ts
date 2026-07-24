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
  izneoSearchEvidenceUrl,
  promoteIzneoSearchEvidence,
  readIzneoSearchEvidence,
} from "./durableEvidence";

describe("izneo durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed series hits", async () => {
    const hits = [
      {
        id: "5841",
        title: "Astérix",
        ratingValue: 4.2,
        ratingCount: 1226,
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "izneo",
      url: "https://www.izneo.com/search?q=asterix",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const searchUrl = izneoSearchEvidenceUrl("Astérix");
    await expect(readIzneoSearchEvidence(searchUrl)).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteIzneoSearchEvidence(searchUrl, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "izneo",
      url: searchUrl,
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for album URLs", async () => {
    await promoteIzneoSearchEvidence(
      "https://www.izneo.com/fr/bd/humour/asterix-5841",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
