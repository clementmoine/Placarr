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
  promoteGibertSearchEvidence,
  readGibertSearchEvidence,
} from "./durableEvidence";

describe("gibert durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        title: "L'Étranger",
        productUrl: "https://www.gibert.com/etranger-9782070360024.html",
        barcode: "9782070360024",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "gibert",
      url: "https://www.gibert.com/catalogsearch/result/?q=9782070360024",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readGibertSearchEvidence(
        "https://www.gibert.com/catalogsearch/result/?q=9782070360024",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteGibertSearchEvidence(
      "https://www.gibert.com/catalogsearch/result/?q=9782070360024",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "gibert",
      url: "https://www.gibert.com/catalogsearch/result/?q=9782070360024",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteGibertSearchEvidence(
      "https://www.gibert.com/etranger-9782070360024.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
