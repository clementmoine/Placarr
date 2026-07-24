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
  chocoBonPlanSearchEvidenceUrl,
  promoteChocoBonPlanSearchEvidence,
  readChocoBonPlanSearchEvidence,
} from "./durableEvidence";

describe("chocobonplan durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed Algolia hits via synthetic search URL", async () => {
    const hits = [
      {
        title: "Ball x Pit sur PS5",
        url: "https://chocobonplan.com/ball-x-pit/",
        image: "https://chocobonplan.com/wp-content/uploads/ball.png",
        objectID: "299830",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "chocobonplan",
      url: "https://www.chocobonplan.com/search?q=ball+x+pit",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const searchUrl = chocoBonPlanSearchEvidenceUrl("Ball x Pit");
    await expect(
      readChocoBonPlanSearchEvidence(searchUrl),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteChocoBonPlanSearchEvidence(searchUrl, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "chocobonplan",
      url: searchUrl,
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for product URLs", async () => {
    await promoteChocoBonPlanSearchEvidence(
      "https://chocobonplan.com/ball-x-pit/",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
