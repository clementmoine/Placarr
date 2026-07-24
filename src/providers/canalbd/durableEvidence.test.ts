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
  promoteCanalbdSearchEvidence,
  readCanalbdSearchEvidence,
} from "./durableEvidence";

describe("canalbd durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        id: "1269046",
        title: "Astérix T9",
        url: "https://www.canalbd.net/articles/asterix-t9-1269046/",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "canalbd",
      url: "https://www.canalbd.net/recherche/?q=asterix",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readCanalbdSearchEvidence("https://www.canalbd.net/recherche/?q=Astérix"),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteCanalbdSearchEvidence(
      "https://www.canalbd.net/recherche/?q=Astérix",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "canalbd",
      url: "https://www.canalbd.net/recherche/?q=Astérix",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for article URLs", async () => {
    await promoteCanalbdSearchEvidence(
      "https://www.canalbd.net/articles/asterix-t9-1269046/",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
