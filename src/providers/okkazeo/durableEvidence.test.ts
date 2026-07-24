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
  promoteOkkazeoSearchEvidence,
  readOkkazeoSearchEvidence,
} from "./durableEvidence";

describe("okkazeo durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        url: "https://www.okkazeo.com/jeux/10267/mille-sabords",
        gameId: "10267",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "okkazeo",
      url: "https://www.okkazeo.com/jeux/resultats?ean=3421272109517",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readOkkazeoSearchEvidence(
        "https://www.okkazeo.com/jeux/resultats?ean=3421272109517&action=Rechercher",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteOkkazeoSearchEvidence(
      "https://www.okkazeo.com/jeux/resultats?ean=3421272109517&action=Rechercher",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "okkazeo",
      url: "https://www.okkazeo.com/jeux/resultats?ean=3421272109517&action=Rechercher",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for fiche URLs", async () => {
    await promoteOkkazeoSearchEvidence(
      "https://www.okkazeo.com/jeux/10267/mille-sabords",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
