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
  promoteShopifySearchEvidence,
  readShopifySearchEvidence,
} from "./durableEvidence";

describe("shopify durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search handles per shop id", async () => {
    const handles = ["carte-cadeaux", "mille-sabords-3421272109517"];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "latelierdesjeux",
      url: "https://latelierdesjeux.com/search?q=3421272109517&type=product",
      kind: "search",
      yieldJson: handles,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readShopifySearchEvidence(
        "latelierdesjeux",
        "https://latelierdesjeux.com/search?q=3421272109517&type=product",
      ),
    ).resolves.toEqual(handles);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteShopifySearchEvidence(
      "latelierdesjeux",
      "https://latelierdesjeux.com/search?q=3421272109517&type=product",
      handles,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "latelierdesjeux",
      url: "https://latelierdesjeux.com/search?q=3421272109517&type=product",
      kind: "search",
      yieldJson: handles,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for product URLs", async () => {
    await promoteShopifySearchEvidence(
      "latelierdesjeux",
      "https://latelierdesjeux.com/products/mille-sabords",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
