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
  myLudoSearchEvidenceUrl,
  promoteMyLudoSearchEvidence,
  readMyLudoSearchEvidence,
} from "./durableEvidence";

describe("myludo durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("builds distinct barcode vs words synthetic URLs", () => {
    expect(
      myLudoSearchEvidenceUrl({ type: "barcode", code: "3421272109517" }),
    ).toContain("type=barcode");
    expect(
      myLudoSearchEvidenceUrl({ type: "search", words: "Catan" }),
    ).toContain("words=Catan");
  });

  it("reads and promotes typed search hits", async () => {
    const hits = [
      {
        gameId: "4503",
        url: "https://www.myludo.fr/#!/game/black-stories-morts-de-rire-4503",
        title: "Black Stories - Morts de rire",
      },
    ];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "myludo",
      url: "https://www.myludo.fr/views/search/datas.php?type=search&words=black+stories",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const searchUrl = myLudoSearchEvidenceUrl({
      type: "search",
      words: "Black Stories",
    });
    await expect(readMyLudoSearchEvidence(searchUrl)).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteMyLudoSearchEvidence(searchUrl, hits);
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "myludo",
      url: searchUrl,
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for game URLs", async () => {
    await promoteMyLudoSearchEvidence(
      "https://www.myludo.fr/#!/game/black-stories-morts-de-rire-4503",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
