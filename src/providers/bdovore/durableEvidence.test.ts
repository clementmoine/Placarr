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
  promoteBdovoreSeriesEvidence,
  readBdovoreSeriesEvidence,
} from "./durableEvidence";

describe("bdovore durableEvidence", () => {
  beforeEach(() => {
    getFreshProviderEvidence.mockReset();
    putProviderEvidence.mockReset();
  });

  it("reads and promotes typed series hits", async () => {
    const hits = [{ id: "59", label: "Alpha" }];
    getFreshProviderEvidence.mockResolvedValueOnce({
      providerId: "bdovore",
      url: "https://www.bdovore.com/getjson?data=Serie&mode=2&term=alpha",
      kind: "search",
      yieldJson: hits,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      readBdovoreSeriesEvidence(
        "https://www.bdovore.com/getjson?data=Serie&mode=2&term=Alpha",
      ),
    ).resolves.toEqual(hits);

    putProviderEvidence.mockResolvedValueOnce(undefined);
    await promoteBdovoreSeriesEvidence(
      "https://www.bdovore.com/getjson?data=Serie&mode=2&term=Alpha",
      hits,
    );
    expect(putProviderEvidence).toHaveBeenCalledWith({
      providerId: "bdovore",
      url: "https://www.bdovore.com/getjson?data=Serie&mode=2&term=Alpha",
      kind: "search",
      yieldJson: hits,
      ttlMs: 30 * 60 * 1000,
    });
  });

  it("skips promote for non-Serie getjson URLs", async () => {
    await promoteBdovoreSeriesEvidence(
      "https://www.bdovore.com/getjson?data=Album&mode=1&id_serie=59",
      [],
    );
    expect(putProviderEvidence).not.toHaveBeenCalled();
  });
});
