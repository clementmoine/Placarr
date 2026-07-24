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
  promoteFreakxySearchEvidence,
  readFreakxySearchEvidence,
} from "./durableEvidence";

describe("freakxy durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        name: "Manette DualSense Midnight Black",
        coverUrl: "https://www.freakxy.fr/media/dualsense.jpg",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "freakxy",
      url: "https://www.freakxy.fr/catalogsearch/result/?q=711719541226",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readFreakxySearchEvidence(
        "https://www.freakxy.fr/catalogsearch/result/?q=711719541226",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteFreakxySearchEvidence(
      "https://www.freakxy.fr/catalogsearch/result/?q=711719541226",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "freakxy",
      url: "https://www.freakxy.fr/catalogsearch/result/?q=711719541226",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteFreakxySearchEvidence(
      "https://www.freakxy.fr/manette-dualsense.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
