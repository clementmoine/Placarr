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
  promoteBooknodeSearchEvidence,
  readBooknodeSearchEvidence,
} from "./durableEvidence";

describe("booknode durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search candidates", async () => {
    const hits = [
      {
        title: "Astérix - La Serpe d'or",
        url: "https://booknode.com/asterix-la-serpe-dor_123",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "booknode",
      url: "https://booknode.com/search?q=asterix",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readBooknodeSearchEvidence("https://booknode.com/search?q=asterix"),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteBooknodeSearchEvidence(
      "https://booknode.com/search?q=asterix",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "booknode",
      url: "https://booknode.com/search?q=asterix",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips search promote for book URLs", async () => {
    await promoteBooknodeSearchEvidence(
      "https://booknode.com/asterix-la-serpe-dor_123",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
