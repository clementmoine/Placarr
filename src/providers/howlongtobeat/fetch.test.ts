import { beforeEach, describe, expect, it, vi } from "vitest";

const readHowLongToBeatSearchEvidence = vi.fn();
const promoteHowLongToBeatSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  howLongToBeatSearchEvidenceUrl: (input: {
    query: string;
    platform?: string;
  }) => {
    const url = new URL("https://howlongtobeat.com/search");
    url.searchParams.set("q", input.query.trim());
    if (input.platform?.trim()) {
      url.searchParams.set("platform", input.platform.trim());
    }
    return url.toString();
  },
  readHowLongToBeatSearchEvidence: (...args: unknown[]) =>
    readHowLongToBeatSearchEvidence(...args),
  promoteHowLongToBeatSearchEvidence: (...args: unknown[]) =>
    promoteHowLongToBeatSearchEvidence(...args),
}));

const httpGetMock = vi.fn();
const httpPostMock = vi.fn();

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: (...args: unknown[]) => httpGetMock(...args),
  httpPost: (...args: unknown[]) => httpPostMock(...args),
}));

import { searchHowLongToBeat } from "./fetch";

describe("searchHowLongToBeat", () => {
  beforeEach(() => {
    httpGetMock.mockReset();
    httpPostMock.mockReset();
    readHowLongToBeatSearchEvidence.mockReset();
    promoteHowLongToBeatSearchEvidence.mockReset();
    readHowLongToBeatSearchEvidence.mockResolvedValue(null);
    promoteHowLongToBeatSearchEvidence.mockResolvedValue(undefined);
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        game_id: 2127,
        game_name: "Hades",
        comp_main: 12345,
      },
    ];
    readHowLongToBeatSearchEvidence.mockResolvedValueOnce(hits);

    await expect(
      searchHowLongToBeat("Hades", "Nintendo Switch"),
    ).resolves.toEqual(hits);
    expect(httpGetMock).not.toHaveBeenCalled();
    expect(httpPostMock).not.toHaveBeenCalled();
    expect(promoteHowLongToBeatSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after init+POST search", async () => {
    httpGetMock.mockResolvedValueOnce({
      status: 200,
      data: {
        token: "tok",
        hpKey: "hp",
        hpVal: "val",
      },
    });
    httpPostMock.mockResolvedValueOnce({
      status: 200,
      data: {
        data: [
          {
            game_id: 2127,
            game_name: "Hades",
            comp_main: 12345,
          },
        ],
      },
    });

    const hits = await searchHowLongToBeat("Hades", "Nintendo Switch");
    expect(hits[0]?.game_id).toBe(2127);
    expect(promoteHowLongToBeatSearchEvidence).toHaveBeenCalledWith(
      "https://howlongtobeat.com/search?q=Hades&platform=Nintendo+Switch",
      expect.arrayContaining([expect.objectContaining({ game_id: 2127 })]),
    );
  });
});
