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
  promoteGeedieSearchEvidence,
  readGeedieSearchEvidence,
} from "./durableEvidence";

describe("geedie durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        title: "PS5 Lollipop Chainsaw RePOP",
        productUrl: "https://geedie.lt/en/ps5-lollipop-chainsaw-repop",
        thumbnailUrl: "https://imagedelivery.net/x/thumbnail",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "geedie",
      url: "https://geedie.lt/en/marketplace/playstation?search=lollipop",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readGeedieSearchEvidence(
        "https://geedie.lt/en/marketplace/playstation?search=lollipop",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteGeedieSearchEvidence(
      "https://geedie.lt/en/marketplace/playstation?search=lollipop",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "geedie",
      url: "https://geedie.lt/en/marketplace/playstation?search=lollipop",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteGeedieSearchEvidence(
      "https://geedie.lt/en/ps5-lollipop-chainsaw-repop",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
