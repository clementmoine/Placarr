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
  promoteChasseSearchEvidence,
  readChasseSearchEvidence,
} from "./durableEvidence";

describe("chasseauxlivres durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        name: "Black Stories",
        productUrl:
          "https://www.chasse-aux-livres.fr/prix/BBB/black-stories-0827912079678",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "chasseauxlivres",
      url: "https://www.chasse-aux-livres.fr/search?query=black+stories&catalog=toys",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readChasseSearchEvidence(
        "https://www.chasse-aux-livres.fr/search?query=Black%20Stories&catalog=toys",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteChasseSearchEvidence(
      "https://www.chasse-aux-livres.fr/search?query=Black%20Stories&catalog=toys",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "chasseauxlivres",
      url: "https://www.chasse-aux-livres.fr/search?query=Black%20Stories&catalog=toys",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for fiche URLs or empty hits", async () => {
    await promoteChasseSearchEvidence(
      "https://www.chasse-aux-livres.fr/prix/BBB/black-stories",
      [{ name: "Black Stories", productUrl: "https://example/x" }],
    );
    await promoteChasseSearchEvidence(
      "https://www.chasse-aux-livres.fr/search?query=Black&catalog=fr",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
