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
  promotePlayInSearchEvidence,
  readPlayInSearchEvidence,
} from "./durableEvidence";

describe("playin durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        url: "https://www.play-in.com/fr/produit/202062/black-stories",
        productId: "202062",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "playin",
      url: "https://www.play-in.com/fr/gamme/5/jeux-de-societe/catalogue?search=black",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readPlayInSearchEvidence(
        "https://www.play-in.com/fr/gamme/5/jeux-de-societe/catalogue?search=black",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promotePlayInSearchEvidence(
      "https://www.play-in.com/fr/gamme/5/jeux-de-societe/catalogue?search=black",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "playin",
      url: "https://www.play-in.com/fr/gamme/5/jeux-de-societe/catalogue?search=black",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promotePlayInSearchEvidence(
      "https://www.play-in.com/fr/produit/202062/black-stories",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });

  it("accepts Lorcana card search URLs", async () => {
    const url =
      "https://www.play-in.com/fr/recherche?q=Ariel&type=card&searchType=CARDS&family=18";
    const hits = [
      {
        url: "https://www.play-in.com/fr/carte/51053/ariel-sur-des-jambes-humaines",
        productId: "51053",
      },
    ];
    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promotePlayInSearchEvidence(url, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ url, yieldJson: hits }),
    );
  });
});
