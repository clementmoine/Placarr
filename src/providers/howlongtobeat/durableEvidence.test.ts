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
  howLongToBeatSearchEvidenceUrl,
  promoteHowLongToBeatSearchEvidence,
  readHowLongToBeatSearchEvidence,
} from "./durableEvidence";

describe("howlongtobeat durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        game_id: 2127,
        game_name: "Hades",
        comp_main: 12345,
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "howlongtobeat",
      url: "https://howlongtobeat.com/search?q=hades&platform=Nintendo+Switch",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const searchUrl = howLongToBeatSearchEvidenceUrl({
      query: "Hades",
      platform: "Nintendo Switch",
    });
    await expect(
      readHowLongToBeatSearchEvidence(searchUrl),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteHowLongToBeatSearchEvidence(searchUrl, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "howlongtobeat",
      url: searchUrl,
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for game detail URLs", async () => {
    await promoteHowLongToBeatSearchEvidence(
      "https://howlongtobeat.com/game/2127",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
