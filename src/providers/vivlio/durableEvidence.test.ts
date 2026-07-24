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
  promoteVivlioSearchEvidence,
  readVivlioSearchEvidence,
} from "./durableEvidence";

describe("vivlio durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        title: "survivantes le thriller",
        productUrl:
          "https://shop.vivlio.com/product/9782749961347_9782749961347_3/survivantes-le-thriller",
        barcode: "9782749961347",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "vivlio",
      url: "https://shop.vivlio.com/search?search=survivantes",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readVivlioSearchEvidence(
        "https://shop.vivlio.com/search?search=Survivantes",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteVivlioSearchEvidence(
      "https://shop.vivlio.com/search?search=Survivantes",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "vivlio",
      url: "https://shop.vivlio.com/search?search=Survivantes",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteVivlioSearchEvidence(
      "https://shop.vivlio.com/product/9782749961347_9782749961347_3/survivantes",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
