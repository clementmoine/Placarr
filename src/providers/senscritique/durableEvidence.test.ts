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
  promoteSensCritiqueSearchEvidence,
  readSensCritiqueSearchEvidence,
  sensCritiqueSearchEvidenceUrl,
} from "./durableEvidence";

describe("senscritique durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        id: 415352,
        title: "Rayman Origins",
        universe: "game",
        url: "https://www.senscritique.com/jeuvideo/rayman_origins/415352",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "senscritique",
      url: "https://www.senscritique.com/search?keywords=rayman&universe=game",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const searchUrl = sensCritiqueSearchEvidenceUrl({
      keywords: "Rayman",
      universe: "game",
    });
    await expect(
      readSensCritiqueSearchEvidence(searchUrl),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteSensCritiqueSearchEvidence(searchUrl, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "senscritique",
      url: searchUrl,
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for product URLs", async () => {
    await promoteSensCritiqueSearchEvidence(
      "https://www.senscritique.com/jeuvideo/rayman/35074",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
