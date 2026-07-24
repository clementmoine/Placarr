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
  promotePlanetebdSearchEvidence,
  readPlanetebdSearchEvidence,
} from "./durableEvidence";

describe("planetebd durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        id: "58791",
        title: "Astérix T41 : Astérix en Lusitanie",
        url: "https://www.planetebd.com/bd/albert-rene/asterix/asterix-en-lusitanie/58791.html",
        ratingStars: 4,
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "planetebd",
      url: "https://www.planetebd.com/recherche?mot-clef=asterix",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readPlanetebdSearchEvidence(
        "https://www.planetebd.com/recherche?mot-clef=Ast%C3%A9rix",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promotePlanetebdSearchEvidence(
      "https://www.planetebd.com/recherche?mot-clef=Ast%C3%A9rix",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "planetebd",
      url: "https://www.planetebd.com/recherche?mot-clef=Ast%C3%A9rix",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for album URLs", async () => {
    await promotePlanetebdSearchEvidence(
      "https://www.planetebd.com/bd/albert-rene/asterix/asterix-en-lusitanie/58791.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
