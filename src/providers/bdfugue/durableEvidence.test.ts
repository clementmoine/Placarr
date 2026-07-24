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
  promoteBdFugueSearchEvidence,
  readBdFugueSearchEvidence,
} from "./durableEvidence";

describe("bdfugue durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        title: "alice 19th tome 1",
        productUrl: "https://www.bdfugue.com/alice-19th-t-1",
        barcode: "9782723442381",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "bdfugue",
      url: "https://www.bdfugue.com/catalogsearch/result/?q=alice",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readBdFugueSearchEvidence(
        "https://www.bdfugue.com/catalogsearch/result/?q=alice",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteBdFugueSearchEvidence(
      "https://www.bdfugue.com/catalogsearch/result/?q=alice",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "bdfugue",
      url: "https://www.bdfugue.com/catalogsearch/result/?q=alice",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteBdFugueSearchEvidence(
      "https://www.bdfugue.com/alice-19th-t-1",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
