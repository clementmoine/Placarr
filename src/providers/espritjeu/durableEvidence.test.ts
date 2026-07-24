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
  promoteEspritJeuSearchEvidence,
  readEspritJeuSearchEvidence,
} from "./durableEvidence";

describe("espritjeu durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        url: "https://www.espritjeu.com/jeu-de-societe/black-stories.html",
        title: "Black Stories",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "espritjeu",
      url: "https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=black",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readEspritJeuSearchEvidence(
        "https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=black",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteEspritJeuSearchEvidence(
      "https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=black",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "espritjeu",
      url: "https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=black",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteEspritJeuSearchEvidence(
      "https://www.espritjeu.com/jeu-de-societe/black-stories.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
