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
  promoteDecitreSearchEvidence,
  readDecitreSearchEvidence,
} from "./durableEvidence";

describe("decitre durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        title: "Ecris notre histoire",
        productUrl:
          "https://www.decitre.fr/livres/ecris-notre-histoire-9782017321675.html",
        barcode: "9782017321675",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "decitre",
      url: "https://www.decitre.fr/search?search=9782017321675",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readDecitreSearchEvidence(
        "https://www.decitre.fr/search?search=9782017321675",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteDecitreSearchEvidence(
      "https://www.decitre.fr/search?search=9782017321675",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "decitre",
      url: "https://www.decitre.fr/search?search=9782017321675",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteDecitreSearchEvidence(
      "https://www.decitre.fr/livres/ecris-notre-histoire-9782017321675.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
