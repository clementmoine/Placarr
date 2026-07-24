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
  promoteFuretSearchEvidence,
  readFuretSearchEvidence,
} from "./durableEvidence";

describe("furet durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        title: "L'étranger",
        productUrl:
          "https://www.furet.com/livres/l-etranger-albert-camus-9782070360024.html",
        barcode: "9782070360024",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "furet",
      url: "https://www.furet.com/rechercher/result?q=etranger",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readFuretSearchEvidence(
        "https://www.furet.com/rechercher/result?q=L%27%C3%A9tranger",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteFuretSearchEvidence(
      "https://www.furet.com/rechercher/result?q=L%27%C3%A9tranger",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "furet",
      url: "https://www.furet.com/rechercher/result?q=L%27%C3%A9tranger",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for product URLs", async () => {
    await promoteFuretSearchEvidence(
      "https://www.furet.com/livres/l-etranger-albert-camus-9782070360024.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
