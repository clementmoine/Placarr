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

import { searchHowLongToBeat } from "./fetch";

const fetchMock = vi.fn();

describe("searchHowLongToBeat", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
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
    expect(fetchMock).not.toHaveBeenCalled();
    expect(promoteHowLongToBeatSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after init+POST search", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "tok",
          hpKey: "hp",
          hpVal: "val",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: 2127,
              game_name: "Hades",
              comp_main: 12345,
            },
          ],
        }),
      });

    const hits = await searchHowLongToBeat("Hades", "Nintendo Switch");
    expect(hits[0]?.game_id).toBe(2127);
    expect(promoteHowLongToBeatSearchEvidence).toHaveBeenCalledWith(
      "https://howlongtobeat.com/search?q=Hades&platform=Nintendo+Switch",
      expect.arrayContaining([expect.objectContaining({ game_id: 2127 })]),
    );
  });
});
