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
  ebayBrowseSearchEvidenceUrl,
  promoteEbayBrowseSearchEvidence,
  readEbayBrowseSearchEvidence,
} from "./durableEvidence";

describe("ebay durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed Browse summaries", async () => {
    const hits = [
      {
        title: "Hades Nintendo Switch",
        price: { value: "29.99", currency: "EUR" },
        condition: "New",
        itemWebUrl: "https://www.ebay.fr/itm/123",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "ebay",
      url: "https://api.ebay.com/buy/browse/v1/item_summary/search?gtin=0045496365226",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const searchUrl = ebayBrowseSearchEvidenceUrl({ gtin: "0045496365226" });
    await expect(readEbayBrowseSearchEvidence(searchUrl)).resolves.toEqual(
      hits,
    );

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteEbayBrowseSearchEvidence(searchUrl, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "ebay",
      url: searchUrl,
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("builds distinct keys for gtin / q / epid", () => {
    expect(ebayBrowseSearchEvidenceUrl({ gtin: "0045496365226" })).toContain(
      "gtin=0045496365226",
    );
    expect(ebayBrowseSearchEvidenceUrl({ q: "hades switch" })).toContain(
      "q=hades",
    );
    expect(ebayBrowseSearchEvidenceUrl({ epid: "555" })).toContain("epid=555");
  });

  it("skips promote for item detail URLs", async () => {
    await promoteEbayBrowseSearchEvidence(
      "https://api.ebay.com/buy/browse/v1/item/v1%7C123%7C0",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
