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
  promoteBackMarketSearchEvidence,
  readBackMarketSearchEvidence,
} from "./durableEvidence";

describe("backmarket durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        title: "Nintendo Wii - Bleu",
        priceCents: 8990,
        currency: "EUR",
        sourceUrl:
          "https://www.backmarket.fr/fr-fr/p/nintendo-wii-bleu/7383740a-64c1-4b44-aa1c-b65a512979a1",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "backmarket",
      url: "https://www.backmarket.fr/fr-fr/search?q=wii%20bleu",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readBackMarketSearchEvidence(
        "https://www.backmarket.fr/fr-fr/search?q=wii%20bleu",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteBackMarketSearchEvidence(
      "https://www.backmarket.fr/fr-fr/search?q=wii%20bleu",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "backmarket",
      url: "https://www.backmarket.fr/fr-fr/search?q=wii%20bleu",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteBackMarketSearchEvidence(
      "https://www.backmarket.fr/fr-fr/p/nintendo-wii-bleu/7383740a-64c1-4b44-aa1c-b65a512979a1",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
