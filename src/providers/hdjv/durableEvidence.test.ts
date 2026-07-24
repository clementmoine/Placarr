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
  promoteHdjvSearchEvidence,
  readHdjvSearchEvidence,
} from "./durableEvidence";

describe("hdjv durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        label: "Le Parrain 2 (Xbox 360)",
        title: "Le Parrain 2",
        support: "Xbox 360",
        ficheUrl:
          "https://www.historiquedesjeuxvideo.com/fiches/Xbox%20360/le-parrain-2.html",
        gameCode: "12852",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "hdjv",
      url: "https://www.historiquedesjeuxvideo.com/ajax_recherche_jeu.php?q=le+parrain+2&support=5",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readHdjvSearchEvidence(
        "https://www.historiquedesjeuxvideo.com/ajax_recherche_jeu.php?q=Le+Parrain+2&support=5",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteHdjvSearchEvidence(
      "https://www.historiquedesjeuxvideo.com/ajax_recherche_jeu.php?q=Le+Parrain+2&support=5",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "hdjv",
      url: "https://www.historiquedesjeuxvideo.com/ajax_recherche_jeu.php?q=Le+Parrain+2&support=5",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for fiche URLs", async () => {
    await promoteHdjvSearchEvidence(
      "https://www.historiquedesjeuxvideo.com/fiches/Xbox%20360/le-parrain-2.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
