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
  promoteSmartoysSearchEvidence,
  readSmartoysSearchEvidence,
} from "./durableEvidence";

describe("smartoys durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        url: "https://www.smartoys.be/catalog/jeux-video-the-last-of-us-p-123.html",
        title: "The Last of Us",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "smartoys",
      url: "https://www.smartoys.be/catalog/advanced_search_result.php?keywords=tlou",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readSmartoysSearchEvidence(
        "https://www.smartoys.be/catalog/advanced_search_result.php?keywords=tlou",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteSmartoysSearchEvidence(
      "https://www.smartoys.be/catalog/advanced_search_result.php?keywords=tlou",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "smartoys",
      url: "https://www.smartoys.be/catalog/advanced_search_result.php?keywords=tlou",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteSmartoysSearchEvidence(
      "https://www.smartoys.be/catalog/product_info.php?products_id=123",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
