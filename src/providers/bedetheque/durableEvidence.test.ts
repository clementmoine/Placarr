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
  promoteBedethequeSeriesEvidence,
  readBedethequeSeriesEvidence,
} from "./durableEvidence";

describe("bedetheque durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed series hits", async () => {
    const hits = [{ id: 1132, label: "Astérix" }];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "bedetheque",
      url: "https://www.bedetheque.com/ajax/tout?term=asterix",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readBedethequeSeriesEvidence(
        "https://www.bedetheque.com/ajax/tout?term=Ast%C3%A9rix",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteBedethequeSeriesEvidence(
      "https://www.bedetheque.com/ajax/tout?term=Ast%C3%A9rix",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "bedetheque",
      url: "https://www.bedetheque.com/ajax/tout?term=Ast%C3%A9rix",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for album URLs", async () => {
    await promoteBedethequeSeriesEvidence(
      "https://www.bedetheque.com/album-123-BD-Asterix.html",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
